import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/lib/convex-provider";

export const metadata = {
  title: "Autoresearch Dashboard",
  description: "Live ops view for the autoresearch money agent.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#111",
          background: "#f5f3ee",
          minHeight: "100vh",
        }}
      >
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
