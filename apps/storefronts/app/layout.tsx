import type { ReactNode } from "react";

export const metadata = {
  title: "Storefront",
  description: "Autoresearch tenant storefront.",
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
          background: "#fafaf9",
        }}
      >
        {children}
      </body>
    </html>
  );
}
