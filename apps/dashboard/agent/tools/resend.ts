import { Resend } from "resend";
import { getKey } from "../run-context.js";

/**
 * Cold email via Resend. Per `docs/stack.md` §4.6, the agent can send
 * ≤200 emails per `cold_email`-channel hypothesis to a *human-curated*
 * list living in `convex.permittedAudiences`. The agent CANNOT scrape
 * arbitrary recipients — that's enforced by the caller assembling
 * `to:` from that table only.
 */
const clients = new Map<string, Resend>();
function client(): Resend {
  const key = getKey("resend");
  let c = clients.get(key);
  if (!c) {
    c = new Resend(key);
    clients.set(key, c);
  }
  return c;
}

export interface SendArgs {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export const resend = {
  async send(args: SendArgs) {
    if (args.to.length === 0) throw new Error("resend.send: empty `to`");
    if (args.to.length > 200) throw new Error("resend.send: max 200 recipients");
    return client().emails.send({
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo,
    });
  },
};
