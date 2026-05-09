import { Resend } from "resend";
import { env } from "../env.js";

/**
 * Cold email via Resend. Per `docs/stack.md` §4.6, the agent can send
 * ≤200 emails per `cold_email`-channel hypothesis to a *human-curated*
 * list living in `convex.permittedAudiences`. The agent CANNOT scrape
 * arbitrary recipients — that's enforced by the caller assembling
 * `to:` from that table only.
 */
let cached: Resend | null = null;
function client(): Resend {
  if (!cached) cached = new Resend(env().RESEND_API_KEY);
  return cached;
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
