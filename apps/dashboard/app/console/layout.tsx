import type { ReactNode } from "react";
import { ConsoleNav } from "@/components/console-nav";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <ConsoleNav />
      {children}
    </div>
  );
}
