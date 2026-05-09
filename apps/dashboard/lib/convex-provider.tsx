"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";
import { publicEnv } from "./env.js";

/**
 * Wraps the dashboard tree with a Convex realtime client. Every
 * `useQuery` below resubscribes automatically — the live $ ticker
 * gets free realtime updates when the webhook writes new charges.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const { CONVEX_URL } = publicEnv();
    return new ConvexReactClient(CONVEX_URL);
  }, []);
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
