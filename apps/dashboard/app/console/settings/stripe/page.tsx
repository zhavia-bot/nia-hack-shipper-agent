"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@autoresearch/convex/api";

export default function StripeSettingsPage() {
  const me = useQuery(api.users.current, {});

  if (me === undefined) {
    return <Shell><p style={{ color: "#777" }}>Loading…</p></Shell>;
  }
  if (me === null) {
    return (
      <Shell>
        <p style={{ color: "#a33" }}>
          Provisioning your account — refresh in a moment.
        </p>
      </Shell>
    );
  }

  const connected = !!me.stripeConnectedAccountId;
  const ready = !!me.stripeChargesEnabled && !!me.stripePayoutsEnabled;
  const requirements = me.stripeRequirementsCurrentlyDue ?? [];

  return (
    <Shell>
      <section
        style={{
          padding: "1.25rem 1.5rem",
          border: "1px solid #e8e6e1",
          borderRadius: 12,
          background: "#fff",
          display: "grid",
          gap: "0.85rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#777",
            }}
          >
            Status
          </div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 600,
              color: ready ? "#0a7d2e" : connected ? "#a06200" : "#444",
            }}
          >
            {ready
              ? "Connected — ready to charge"
              : connected
                ? "Connected — onboarding incomplete"
                : "Not connected"}
          </div>
        </div>

        {connected && (
          <div style={{ fontSize: "0.85rem", color: "#555" }}>
            Account: <code>{me.stripeConnectedAccountId}</code>
            {me.stripeCountry && <> · Country: {me.stripeCountry}</>}
          </div>
        )}

        {requirements.length > 0 && (
          <div style={{ fontSize: "0.85rem", color: "#a06200" }}>
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
              Stripe still needs:
            </div>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {requirements.map((r: string) => (
                <li key={r}>
                  <code>{r}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <a
            href="/api/connect/start"
            style={{
              padding: "0.55rem 1rem",
              fontWeight: 600,
              border: "none",
              borderRadius: 8,
              background: "#635bff",
              color: "#fff",
              textDecoration: "none",
              fontSize: "0.92rem",
            }}
          >
            {connected ? "Continue Stripe onboarding" : "Connect Stripe"}
          </a>
          {connected && (
            <a
              href={`https://dashboard.stripe.com/${me.stripeConnectedAccountId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "0.55rem 1rem",
                border: "1px solid #d6d3cc",
                borderRadius: 8,
                background: "#fafaf7",
                color: "#444",
                textDecoration: "none",
                fontSize: "0.92rem",
              }}
            >
              Open Stripe dashboard ↗
            </a>
          )}
        </div>
      </section>

      <p style={{ color: "#666", fontSize: "0.88rem", lineHeight: 1.5 }}>
        Charges land directly on your Stripe account. The platform does not
        take a fee. You're a Stripe Standard account, so payouts, disputes,
        and refunds are managed in your own Stripe dashboard.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Stripe</h1>
      </header>
      {children}
    </main>
  );
}
