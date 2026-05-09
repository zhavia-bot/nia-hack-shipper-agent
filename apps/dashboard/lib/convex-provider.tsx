"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useMemo, type ReactNode } from "react";
import { publicEnv } from "./env";

/**
 * Wraps the dashboard tree with Clerk + Convex. Clerk authenticates the
 * human; Convex reactively queries with the Clerk-issued JWT (see the
 * `convex` template configured in the Clerk dashboard).
 *
 * `<ClerkProvider>` MUST be outside `<ConvexProviderWithClerk>` — order
 * matters; reverse = `useAuth is undefined`. Use Convex's
 * `useConvexAuth()` (not Clerk's `<SignedIn>`) to gate authenticated
 * queries — Clerk reports "logged in" before Convex has validated the
 * token.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const { CONVEX_URL } = publicEnv();
    return new ConvexReactClient(CONVEX_URL);
  }, []);
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
