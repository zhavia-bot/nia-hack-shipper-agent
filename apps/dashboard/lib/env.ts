"use client";

/**
 * Public env exposed to the browser. The dashboard token must be
 * NEXT_PUBLIC_ because Convex reactive queries run client-side.
 *
 * The token is the `dashboard` identity (read-only on every table —
 * see `convex/_lib/identity.ts`). Even with this token in the
 * browser, the only privilege it grants is reading the dashboard's
 * own queries; no writes, no admin access.
 *
 * Behind a basic-auth gate (`middleware.ts`) so this token never
 * leaks to the public internet.
 */
export function publicEnv(): {
  CONVEX_URL: string;
  DASHBOARD_TOKEN: string;
} {
  const CONVEX_URL = process.env["NEXT_PUBLIC_CONVEX_URL"];
  const DASHBOARD_TOKEN = process.env["NEXT_PUBLIC_CONVEX_DASHBOARD_TOKEN"];
  if (!CONVEX_URL || !DASHBOARD_TOKEN) {
    throw new Error(
      "Dashboard env missing: NEXT_PUBLIC_CONVEX_URL and " +
        "NEXT_PUBLIC_CONVEX_DASHBOARD_TOKEN must be set."
    );
  }
  return { CONVEX_URL, DASHBOARD_TOKEN };
}
