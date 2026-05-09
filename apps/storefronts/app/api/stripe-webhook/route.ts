import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { api } from "@autoresearch/convex/api";
import { convex, storefrontToken } from "@/lib/convex";
import { stripe } from "@/lib/stripe";
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
          await cx.mutation(api.ledger.recordCharge, {
            token,
            stripeEventId: event.id,
            amountUsd: centsToUsd(s.amount_total ?? 0),
            experimentId,
            tenantSubdomain: s.metadata?.["tenantSubdomain"] ?? undefined,
            paymentStatus: s.payment_status,
          });
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
        await cx.mutation(api.ledger.recordCharge, {
          token,
          stripeEventId: event.id,
          amountUsd: centsToUsd(s.amount_total ?? 0),
          experimentId,
          tenantSubdomain: s.metadata?.["tenantSubdomain"] ?? undefined,
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
        await cx.mutation(api.ledger.recordRefund, {
          token,
          stripeEventId: event.id,
          amountUsd: centsToUsd(amount),
          chargeId: c.id,
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
