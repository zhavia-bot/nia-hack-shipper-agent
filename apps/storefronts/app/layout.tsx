import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Storefront",
  description: "Autoresearch tenant storefront.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
