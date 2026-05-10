import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAccountStatus } from "@autodrop/connect";
import { api } from "@autodrop/convex/api";
import {
  convexAsUser,
  dashboardOrigin,
  platformStripeKey,
} from "@/lib/convex-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hit by Stripe after the user finishes (or bails on) onboarding.
 * Re-reads live status from the Stripe API and persists onto the user
 * row, so the dashboard banner reflects reality immediately. The
 * `account.updated` webhook (P5) is the durable path; this is the
 * "sync now" path that runs while the user is still in the flow.
 */
export async function GET(_req: Request) {
  const { userId } = await auth();
  const origin = dashboardOrigin();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", origin));

  const cx = await convexAsUser();
  const me = await cx.query(api.users.current, {});
  if (!me?.stripeConnectedAccountId) {
    return NextResponse.redirect(new URL("/console/settings/stripe", origin));
  }

  const status = await getAccountStatus(
    platformStripeKey(),
    me.stripeConnectedAccountId,
  );
  await cx.mutation(api.users.setStripeConnectFields, {
    accountId: status.accountId,
    country: status.country ?? undefined,
    chargesEnabled: status.chargesEnabled,
    payoutsEnabled: status.payoutsEnabled,
    requirementsCurrentlyDue: status.requirementsCurrentlyDue,
  });

  return NextResponse.redirect(new URL("/console/settings/stripe", origin));
}
