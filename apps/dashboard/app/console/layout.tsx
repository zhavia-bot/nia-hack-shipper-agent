import type { ReactNode } from "react";
import { ConsoleNav } from "@/components/console-nav";

// Console is Clerk-gated and reads NEXT_PUBLIC_CONVEX_* at runtime — never
// safe to prerender, even when those envs happen to be present at build time.
export const dynamic = "force-dynamic";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <ConsoleNav />
      {children}
    </div>
  );
}
