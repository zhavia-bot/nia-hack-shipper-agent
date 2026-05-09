import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/lib/convex-provider";
import "./globals.css";

export const metadata = {
  title: "Autoresearch — autonomous money agent",
  description:
    "An agent whose terminal goal is maximizing $ in Stripe balance. Spawns parallel hypotheses, ships products, measures ROAS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
