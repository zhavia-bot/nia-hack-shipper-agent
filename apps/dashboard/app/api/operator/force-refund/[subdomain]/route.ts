import { NextResponse, type NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@autodrop/convex/api";
import { forConnectedAccount } from "@autodrop/connect";
import { convexAsUser, platformStripeKey } from "@/lib/convex-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/operator/force-refund/[subdomain]
 *
 * Operator panic-refund: kill the tenant, then sweep every paid
 * payment intent on the owner's connected account whose
 * `metadata.tenantSubdomain` matches and refund the un-refunded
 * portion. We list (no Stripe-side metadata filter exists) and match
 * client-side; a 100-PI cap is fine — a single hypothesis ships to a
 * single Checkout flow and refunds bunched here are an exception path.
 *
 * Why this exists despite P8.10's auto-refund: a panicked operator
 * may want to re-refund before the webhook lands (network loss,
 * webhook lag), or sweep stragglers if the auto-refund failed midway.
 * Stripe rejects double-refunds on a fully-refunded PI with a clean
 * `charge_already_refunded` code, which we treat as success.
 *
 * Audit trail: each refund (and skip) records to auditLog under
 * `operator.force_refund_*` via the stripe-webhook identity. We reuse
 * that token because it's the only role allowed into auditLog.record
 * from this app's env; promoting "operator" to its own role is left
 * for after the hackathon.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> },
) {
  const { subdomain } = await params;
  let asUser;
  try {
    asUser = await convexAsUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await asUser.query(api.tenants.operatorContext, { subdomain });
  if (!ctx) {
    return NextResponse.json(
      { error: "tenant not found or not yours" },
      { status: 404 },
    );
  }
  if (!ctx.accountId) {
    return NextResponse.json(
      { error: "no connected Stripe account on owner" },
      { status: 409 },
    );
  }

  // Kill first — the storefront 404s and ledger refunds book against
  // a killed tenant, which is the desired UI state.
  try {
    await asUser.mutation(api.tenants.cancelByOwner, { subdomain });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const stripe = forConnectedAccount(platformStripeKey(), ctx.accountId);
  const list = await stripe.paymentIntents.list({ limit: 100 });

  const matched = list.data.filter(
    (pi) =>
      pi.status === "succeeded" &&
      pi.metadata?.["tenantSubdomain"] === subdomain,
  );

  // Audit + refund loop. Errors per-PI are caught and logged so a
  // single bad apple doesn't abort the sweep.
  const audit = serviceConvex();
  const webhookToken = process.env["CONVEX_STRIPE_WEBHOOK_TOKEN"] ?? "";

  let refunded = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { id: string; msg: string }[] = [];

  await audit
    .mutation(api.auditLog.record, {
      token: webhookToken,
      kind: "operator.force_refund_started",
      experimentId: ctx.experimentId,
      payload: {
        subdomain,
        candidatePaymentIntents: matched.length,
      },
    })
    .catch(() => {});

  // Stripe's PaymentIntent type no longer carries `amount_refunded`
  // (you have to retrieve the latest charge to read it). We skip the
  // pre-check entirely and let Stripe be the source of truth: if the
  // PI is already fully refunded, `refunds.create` returns
  // `charge_already_refunded`, which we count as `skipped`. Saves a
  // round-trip per PI and avoids stale reads from the list call.
  for (const pi of matched) {
    try {
      await stripe.refunds.create({
        payment_intent: pi.id,
        metadata: {
          reason: "autodrop_operator_force_refund",
          experimentId: ctx.experimentId,
          tenantSubdomain: subdomain,
        },
      });
      refunded += 1;
      await audit
        .mutation(api.auditLog.record, {
          token: webhookToken,
          kind: "operator.force_refund_refunded",
          experimentId: ctx.experimentId,
          payload: {
            paymentIntentId: pi.id,
            amount: pi.amount_received ?? pi.amount,
          },
        })
        .catch(() => {});
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code ?? "")
          : "";
      const msg = err instanceof Error ? err.message : String(err);
      if (code === "charge_already_refunded") {
        skipped += 1;
        await audit
          .mutation(api.auditLog.record, {
            token: webhookToken,
            kind: "operator.force_refund_skipped",
            experimentId: ctx.experimentId,
            payload: { paymentIntentId: pi.id, reason: code },
          })
          .catch(() => {});
        continue;
      }
      failed += 1;
      errors.push({ id: pi.id, msg });
      await audit
        .mutation(api.auditLog.record, {
          token: webhookToken,
          kind: "operator.force_refund_failed",
          experimentId: ctx.experimentId,
          payload: { paymentIntentId: pi.id, msg, code },
        })
        .catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    subdomain,
    cancelled: true,
    matched: matched.length,
    refunded,
    skipped,
    failed,
    errors,
  });
}

function serviceConvex(): ConvexHttpClient {
  const url =
    process.env["NEXT_PUBLIC_CONVEX_URL"] ?? process.env["CONVEX_URL"];
  if (!url) throw new Error("CONVEX_URL not set");
  return new ConvexHttpClient(url);
}
