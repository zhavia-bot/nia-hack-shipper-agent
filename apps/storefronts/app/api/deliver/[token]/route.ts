import { NextResponse, type NextRequest } from "next/server";
import { api } from "@autoresearch/convex/api";
import { stripeForTenant } from "@/lib/stripe";
import { convex, storefrontToken } from "@/lib/convex";
import { verifyDeliverToken } from "@/lib/deliver-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

/**
 * Post-purchase delivery (per stack.md §10.3 — signed, short-lived,
 * server-validates "paid" before serving).
 *
 * Flow:
 *  1. HMAC-verify the token; extract { sid (sessionId), eid (experimentId), exp }.
 *  2. Re-fetch the Checkout Session from Stripe and confirm
 *     `payment_status === "paid"`. The token alone is not a capability
 *     — payment_status is.
 *  3. Look up the tenant by experimentId via Convex; pull the
 *     `deliverableStorageId`.
 *  4. Resolve the Convex storage URL and stream the bytes back, with
 *     a Content-Disposition that names the file.
 *
 * No customer PII is collected — Stripe Checkout already has the email
 * for receipts. The token is the entire identity surface.
 */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  let payload: { sid: string; eid: string; exp: number };
  try {
    payload = verifyDeliverToken(decodeURIComponent(token));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`bad token: ${msg}`, { status: 400 });
  }

  // Step 2: resolve the connected account, then confirm paid.
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0] ?? "";
  const apexSuffix = `.${process.env["APEX_DOMAIN"] ?? ""}`;
  const subdomain = host.endsWith(apexSuffix)
    ? host.slice(0, -apexSuffix.length)
    : host;
  const owner = await convex().query(api.tenants.ownerStripeAccount, {
    subdomain,
  });
  if (!owner?.accountId) {
    return new NextResponse("tenant has no connected account", { status: 503 });
  }

  let session;
  try {
    session = await stripeForTenant(owner.accountId).checkout.sessions.retrieve(
      payload.sid,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`session lookup failed: ${msg}`, { status: 502 });
  }
  if (session.payment_status !== "paid") {
    return new NextResponse(
      `payment not complete (status: ${session.payment_status ?? "unknown"})`,
      { status: 402 }
    );
  }
  // Cross-check the experiment id in the token matches the session.
  const sessionExpId =
    session.client_reference_id ?? session.metadata?.["experimentId"];
  if (sessionExpId && sessionExpId !== payload.eid) {
    return new NextResponse("token/session mismatch", { status: 400 });
  }

  // Step 3: fetch tenant by subdomain (already resolved above).
  const tenant = (await convex().query(api.tenants.bySubdomain, {
    subdomain,
  })) as
    | { experimentId: string; deliverableStorageId?: string; deliverableKind: string }
    | null;
  if (!tenant) return new NextResponse("tenant gone", { status: 404 });
  if (tenant.experimentId !== payload.eid) {
    return new NextResponse("token/tenant mismatch", { status: 400 });
  }
  if (!tenant.deliverableStorageId) {
    return new NextResponse("deliverable not yet ready", { status: 503 });
  }

  // Step 4: resolve to a fetchable URL via Convex (stripe-webhook role
  // covers `storage:getUrl` for the storefront).
  const url = (await convex().query(api.storage.getUrl, {
    token: storefrontToken(),
    storageId: tenant.deliverableStorageId,
  })) as string | null;
  if (!url) return new NextResponse("storage url missing", { status: 500 });

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(`upstream ${upstream.status}`, { status: 502 });
  }

  const filename = `${tenant.experimentId}.${
    tenant.deliverableKind === "md" ? "md" : tenant.deliverableKind
  }`;
  const contentType =
    upstream.headers.get("content-type") ?? guessContentType(tenant.deliverableKind);

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function guessContentType(kind: string): string {
  switch (kind) {
    case "pdf":
      return "application/pdf";
    case "json":
      return "application/json";
    case "md":
      return "text/markdown; charset=utf-8";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}
