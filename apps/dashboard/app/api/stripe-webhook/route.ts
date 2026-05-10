import { NextResponse, type NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import Stripe from "stripe";
import { api } from "@autodrop/convex/api";
import { platformStripe } from "@autodrop/connect";
import { platformStripeKey } from "@/lib/convex-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe Connect webhook — listens to events that fire on the platform
 * and on connected accounts. The hackathon-scope subset:
 *
 *   - `account.updated` → reconcile users.stripeChargesEnabled and
 *     friends. Without this, the dashboard banner only updates when
 *     the user manually returns from onboarding via /api/connect/return.
 *
 * Charge / refund / dispute events still flow through the storefront
 * stripe-webhook (per-tenant subdomain). They're Connect events too,
 * but the routing keeps the per-tenant audit trail co-located with
 * the storefront that minted the session.
 *
 * Auth: Stripe webhook signature (STRIPE_CONNECT_WEBHOOK_SECRET) for
 * inbound, then a service JWT (CONVEX_STRIPE_WEBHOOK_TOKEN) into Convex.
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("missing signature", { status: 400 });

  const secret = process.env["STRIPE_CONNECT_WEBHOOK_SECRET"];
  if (!secret) {
    return new NextResponse("STRIPE_CONNECT_WEBHOOK_SECRET not set", {
      status: 500,
    });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = platformStripe(platformStripeKey()).webhooks.constructEvent(
      raw,
      sig,
      secret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`signature verification failed: ${msg}`, {
      status: 400,
    });
  }

  if (event.type !== "account.updated") {
    // Politely accept; we'll add cases as they come up.
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const account = event.data.object as Stripe.Account;
  const cx = convexService();
  const webhookToken = process.env["CONVEX_STRIPE_WEBHOOK_TOKEN"];
  if (!webhookToken) {
    return new NextResponse("CONVEX_STRIPE_WEBHOOK_TOKEN not set", {
      status: 500,
    });
  }

  const user = await cx.query(api.users.byStripeAccount, {
    token: webhookToken,
    accountId: account.id,
  });
  if (!user) {
    // Probably an account that wasn't created through us, or the user
    // row was deleted. Acknowledge so Stripe stops retrying.
    return NextResponse.json({ ok: true, unknownAccount: account.id });
  }

  await cx.mutation(api.users.setStripeConnectFields, {
    accountId: account.id,
    country: account.country ?? undefined,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
    webhookForUserId: user._id,
    webhookToken,
  });

  return NextResponse.json({ ok: true });
}

function convexService(): ConvexHttpClient {
  const url = process.env["NEXT_PUBLIC_CONVEX_URL"] ?? process.env["CONVEX_URL"];
  if (!url) throw new Error("CONVEX_URL not set");
  return new ConvexHttpClient(url);
}
