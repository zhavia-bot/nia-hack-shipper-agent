import Link from "next/link";
import { ByokForm } from "@/components/byok-form";

export default function BYOKPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1.5rem 4rem",
        display: "grid",
        gap: "1.5rem",
      }}
    >
      <header style={{ display: "grid", gap: "0.4rem" }}>
        <Link
          href="/console"
          style={{
            fontSize: "0.78rem",
            color: "#777",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            textDecoration: "none",
          }}
        >
          ← Live ops
        </Link>
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>API keys</h1>
        <p style={{ color: "#666", fontSize: "0.92rem", margin: 0 }}>
          Bring your own keys. Your agent runs against your accounts — we never
          mix them with another user's. Stored as plaintext on your user row
          (hackathon scope; production would encrypt at rest).
        </p>
      </header>

      <ByokForm />
    </main>
  );
}
