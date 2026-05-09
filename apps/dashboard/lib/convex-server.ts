import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";

/**
 * Server-side Convex client authenticated as the current Clerk user.
 * Calls hit Convex with the user's JWT, so `requireUser(ctx)` resolves
 * to their row. Use from server actions / API routes only.
 */
export async function convexAsUser(): Promise<ConvexHttpClient> {
  const url = process.env["NEXT_PUBLIC_CONVEX_URL"];
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
  const client = new ConvexHttpClient(url);
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) throw new Error("not signed in");
  client.setAuth(token);
  return client;
}

export function platformStripeKey(): string {
  const k = process.env["STRIPE_SECRET_KEY"];
  if (!k) throw new Error("STRIPE_SECRET_KEY not set");
  return k;
}

export function dashboardOrigin(): string {
  return (
    process.env["DASHBOARD_ORIGIN"] ??
    process.env["NEXT_PUBLIC_DASHBOARD_ORIGIN"] ??
    "http://localhost:3001"
  );
}
