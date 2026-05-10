import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  createAccountLink,
  createConnectedAccount,
} from "@autodrop/connect";
import { api } from "@autodrop/convex/api";
import {
  convexAsUser,
  dashboardOrigin,
  platformStripeKey,
} from "@/lib/convex-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connect onboarding entry point. Idempotent on the user's
 * `stripeConnectedAccountId` — if they already have one, we just mint
 * a fresh account link. Otherwise we create the Standard account first.
 *
 * The user's email comes from Clerk; country is best-effort from the
 * `country` query param (`?country=US`) or defaults to US for the
 * hackathon. Production should ask the user.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) {
    return NextResponse.json({ error: "no email on Clerk user" }, { status: 400 });
  }

  const url = new URL(req.url);
  const country = url.searchParams.get("country") ?? "US";

  const platformKey = platformStripeKey();
  const cx = await convexAsUser();

  const me = await cx.query(api.users.current, {});
  if (!me) return NextResponse.json({ error: "user not provisioned" }, { status: 404 });

  let accountId: string;
  if (me.stripeConnectedAccountId) {
    accountId = me.stripeConnectedAccountId;
  } else {
    const created = await createConnectedAccount(platformKey, { email, country });
    accountId = created.accountId;
    await cx.mutation(api.users.setStripeConnectFields, {
      accountId,
      country,
    });
  }

  const origin = dashboardOrigin();
  const link = await createAccountLink(platformKey, {
    accountId,
    refreshUrl: `${origin}/api/connect/start`,
    returnUrl: `${origin}/api/connect/return`,
  });
  return NextResponse.redirect(link.url);
}
