import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

/**
 * Signed deliverable URL token (per stack.md §10.3).
 *
 * Wire format (base64url): `<payloadJson>.<sig>` where
 *   payloadJson = { sid: stripeSessionId, eid: experimentId, exp: epoch }
 *   sig = HMAC-SHA256(payloadJson, DELIVER_TOKEN_SECRET)
 *
 * Single-use is enforced by the redemption side: the deliver route
 * re-fetches the Stripe session and confirms `payment_status === "paid"`
 * before serving bytes. Expiry of 7 days matches the "refund within 7
 * days" footer policy — beyond that we don't owe the customer access.
 */

const DEFAULT_TTL_S = 7 * 24 * 60 * 60;

export interface DeliverPayload {
  sid: string;
  eid: string;
  exp: number;
}

export function mintDeliverToken(args: {
  sessionId: string;
  experimentId: string;
  ttlSeconds?: number;
}): string {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_S;
  const payload: DeliverPayload = {
    sid: args.sessionId,
    eid: args.experimentId,
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64u(sign(body));
  return `${body}.${sig}`;
}

export function verifyDeliverToken(token: string): DeliverPayload {
  const i = token.indexOf(".");
  if (i < 0) throw new Error("malformed token");
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);

  const expected = b64u(sign(body));
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("bad signature");
  }
  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  ) as DeliverPayload;

  if (typeof payload.sid !== "string" || typeof payload.eid !== "string") {
    throw new Error("bad payload");
  }
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("expired");
  }
  return payload;
}

function sign(input: string): Buffer {
  const h = createHmac("sha256", env().DELIVER_TOKEN_SECRET);
  h.update(input, "utf8");
  return h.digest();
}

function b64u(buf: Buffer | string): string {
  return Buffer.from(buf as Buffer).toString("base64url");
}
