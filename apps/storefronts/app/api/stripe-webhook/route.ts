import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { Resend } from "resend";
import { api } from "@autodrop/convex/api";
import { convex, storefrontToken } from "@/lib/convex";
import { stripe, stripeForTenant } from "@/lib/stripe";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the ONLY path into `ledgerEvents`.
 *
 * Events handled (per stack.md §4.4.2-3):
 *   - `checkout.session.completed` w/ payment_status=paid → recordCharge
 *   - `checkout.session.completed` w/ non-paid status   → auditLog only
 *   - `checkout.session.async_payment_succeeded`        → recordCharge
 *   - `checkout.session.async_payment_failed`           → markAsyncFailure
 *   - `charge.refunded`                                  → recordRefund
 *   - `charge.dispute.created`                           → markDisputed
 *
 * Identity used: `stripe-webhook` (the only role allowed to insert
 * charges per `convex/ledger.ts`'s `requireIdentity` check). Idempotency
 * is closed by Convex (`by_stripe_event` index in `ledgerEvents` and
 * `auditLog`); Stripe replays are common, especially under retries.
 *
 * Signature verification happens BEFORE any state mutates. Failure →
 * 400, no Convex call.
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("missing signature", { status: 400 });

  // Raw body required for HMAC verification; do NOT use req.json().
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      raw,
      sig,
      env().STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`signature verification failed: ${msg}`, {
      status: 400,
    });
  }

  const token = storefrontToken();
  const cx = convex();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const experimentId = (s.client_reference_id ??
          s.metadata?.["experimentId"]) as string | undefined;
        if (!experimentId) {
          await cx.mutation(api.auditLog.record, {
            token,
            kind: "stripe.checkout_completed_no_experiment_id",
            stripeEventId: event.id,
            payload: { sessionId: s.id, paymentStatus: s.payment_status },
          });
          break;
        }

        if (s.payment_status === "paid") {
          const tenantSubdomain = s.metadata?.["tenantSubdomain"];
          if (!tenantSubdomain) {
            await cx.mutation(api.auditLog.record, {
              token,
              kind: "stripe.checkout_paid_no_tenant_subdomain",
              stripeEventId: event.id,
              experimentId,
              payload: { sessionId: s.id },
            });
            break;
          }
          await cx.mutation(api.ledger.recordCharge, {
            token,
            stripeEventId: event.id,
            amountUsd: centsToUsd(s.amount_total ?? 0),
            experimentId,
            tenantSubdomain,
            paymentStatus: s.payment_status,
          });
          // P8.10: demo-safe settlement — every paid order auto-refunds
          // with an apology email. We never actually fulfill (no inventory).
          // Errors are logged to auditLog and never thrown so the webhook
          // ack stays clean and Stripe doesn't retry the ledger insert.
          await settleDemoOrder(s, tenantSubdomain, event.id, experimentId).catch(
            async (err) => {
              await cx.mutation(api.auditLog.record, {
                token,
                kind: "stripe.demo_settlement_failed",
                stripeEventId: event.id,
                experimentId,
                payload: { msg: err instanceof Error ? err.message : String(err) },
              });
            },
          );
        } else {
          // Diagnostic-only path per stack.md §4.4.3.
          await cx.mutation(api.auditLog.record, {
            token,
            kind: "stripe.checkout_completed_non_paid",
            stripeEventId: event.id,
            experimentId,
            paymentStatus: s.payment_status ?? "unknown",
            payload: { sessionId: s.id, amountTotal: s.amount_total },
          });
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        const experimentId = (s.client_reference_id ??
          s.metadata?.["experimentId"]) as string | undefined;
        if (!experimentId) break;
        const tenantSubdomain = s.metadata?.["tenantSubdomain"];
        if (!tenantSubdomain) {
          await cx.mutation(api.auditLog.record, {
            token,
            kind: "stripe.async_paid_no_tenant_subdomain",
            stripeEventId: event.id,
            experimentId,
            payload: { sessionId: s.id },
          });
          break;
        }
        await cx.mutation(api.ledger.recordCharge, {
          token,
          stripeEventId: event.id,
          amountUsd: centsToUsd(s.amount_total ?? 0),
          experimentId,
          tenantSubdomain,
          paymentStatus: "paid",
        });
        break;
      }

      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const experimentId = (s.client_reference_id ??
          s.metadata?.["experimentId"]) as string | undefined;
        if (experimentId) {
          await cx.mutation(api.experiments.markAsyncFailure, {
            token,
            id: experimentId as never,
          });
        }
        break;
      }

      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        const refunded = (c.amount_refunded ?? 0) - (c.amount ?? 0);
        const amount = Math.abs(refunded > 0 ? refunded : c.amount_refunded ?? 0);
        const tenantSubdomain = c.metadata?.["tenantSubdomain"];
        if (!tenantSubdomain) {
          await cx.mutation(api.auditLog.record, {
            token,
            kind: "stripe.refund_no_tenant_subdomain",
            stripeEventId: event.id,
            payload: { chargeId: c.id, amount },
          });
          break;
        }
        await cx.mutation(api.ledger.recordRefund, {
          token,
          stripeEventId: event.id,
          amountUsd: centsToUsd(amount),
          chargeId: c.id,
          tenantSubdomain,
        });
        break;
      }

      case "charge.dispute.created": {
        const d = event.data.object as Stripe.Dispute;
        const expId =
          (d.metadata?.["experimentId"] as string | undefined) ??
          ((d.payment_intent as Stripe.PaymentIntent | string | null) &&
          typeof d.payment_intent !== "string"
            ? (d.payment_intent?.metadata?.["experimentId"] as
                | string
                | undefined)
            : undefined);
        if (expId) {
          await cx.mutation(api.experiments.markDisputed, {
            token,
            id: expId as never,
          });
        }
        await cx.mutation(api.auditLog.record, {
          token,
          kind: "stripe.charge_dispute_created",
          stripeEventId: event.id,
          experimentId: expId,
          payload: { reason: d.reason, amount: d.amount },
        });
        break;
      }

      default: {
        // Unsubscribed events shouldn't normally hit us. Log and move on.
        await cx.mutation(api.auditLog.record, {
          token,
          kind: `stripe.unhandled.${event.type}`,
          stripeEventId: event.id,
          payload: null,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Returning 500 makes Stripe retry; idempotency in Convex makes
    // that safe. Anything that throws here is most likely transient.
    return new NextResponse(`handler error: ${msg}`, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * P8.10 demo settlement: refund the just-completed Checkout Session via
 * the connected account, then email the customer a short apology that
 * names the bot, links to the originally-listed product, and confirms
 * the refund timeline. We don't fulfill any order — the agent has no
 * inventory and never will. The whole point of the demo is the upstream
 * ROAS signal, not the order itself.
 *
 * Side-effects we keep tight:
 *   - Refund only when payment_intent is present (the typical case for
 *     a paid Checkout Session). Skip with an audit row otherwise.
 *   - Email only when the owner has a Resend BYOK key and we have a
 *     customer email. Skip silently with a warn-style audit row in the
 *     no-key case (we still refund — money first, communication second).
 */
async function settleDemoOrder(
  s: Stripe.Checkout.Session,
  tenantSubdomain: string,
  stripeEventId: string,
  experimentId: string,
): Promise<void> {
  const cx = convex();
  const token = storefrontToken();
  const settlement = await cx.query(api.tenants.ownerSettlementInfo, {
    token,
    subdomain: tenantSubdomain,
  });
  if (!settlement?.accountId) {
    await cx.mutation(api.auditLog.record, {
      token,
      kind: "stripe.demo_settlement_no_account",
      stripeEventId,
      experimentId,
      payload: { tenantSubdomain },
    });
    return;
  }

  // Refund — connected-account scoped via Stripe-Account header.
  const piId =
    typeof s.payment_intent === "string"
      ? s.payment_intent
      : (s.payment_intent?.id ?? null);
  if (!piId) {
    await cx.mutation(api.auditLog.record, {
      token,
      kind: "stripe.demo_settlement_no_payment_intent",
      stripeEventId,
      experimentId,
      payload: { sessionId: s.id, paymentStatus: s.payment_status },
    });
    return;
  }
  const acct = stripeForTenant(settlement.accountId);
  await acct.refunds.create({
    payment_intent: piId,
    metadata: {
      reason: "autodrop_demo_settlement",
      experimentId,
      tenantSubdomain,
    },
  });
  await cx.mutation(api.auditLog.record, {
    token,
    kind: "stripe.demo_settlement_refunded",
    stripeEventId,
    experimentId,
    payload: { sessionId: s.id, paymentIntentId: piId },
  });

  // Email — only if the owner has plumbed a Resend BYOK key and we have
  // a customer email to send to. Customer email comes from
  // customer_details (Stripe always populates this on a paid session)
  // or customer_email (fallback when set explicitly at session create).
  const customerEmail =
    s.customer_details?.email ?? s.customer_email ?? null;
  if (!settlement.resendKey || !customerEmail) {
    await cx.mutation(api.auditLog.record, {
      token,
      kind: "stripe.demo_settlement_no_email",
      stripeEventId,
      experimentId,
      payload: {
        hasResendKey: !!settlement.resendKey,
        hasCustomerEmail: !!customerEmail,
      },
    });
    return;
  }
  const resend = new Resend(settlement.resendKey);
  const fromAddr = settlement.fromEmail ?? "support@autodrop.example";
  const ownerLabel = settlement.ownerName ?? "the operator";
  await resend.emails.send({
    from: `Autodrop demo <${fromAddr}>`,
    to: [customerEmail],
    subject: "Your order has been refunded",
    text: [
      `Hi — thanks for clicking through, but this storefront is part of a research demo run by an autonomous agent.`,
      ``,
      `Your card was charged briefly to capture a real conversion signal, and your full refund (Stripe will show it within 5-10 business days) was issued automatically before this email went out. No order will ship.`,
      ``,
      `If you'd like more context on what just happened, ${ownerLabel} can answer questions at the reply-to address. Sorry for the surprise.`,
    ].join("\n"),
  });
  await cx.mutation(api.auditLog.record, {
    token,
    kind: "stripe.demo_settlement_emailed",
    stripeEventId,
    experimentId,
    payload: { to: customerEmail },
  });
}
