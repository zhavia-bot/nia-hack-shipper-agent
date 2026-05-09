import Link from "next/link";
import { DollarTicker } from "@/components/dollar-ticker";
import { BudgetState } from "@/components/budget-state";
import { RecentLedger } from "@/components/recent-ledger";
import { ExperimentsFeed } from "@/components/experiments-feed";
import { BucketHeatmap } from "@/components/bucket-heatmap";
import { RunGenerationButton } from "@/components/run-generation-button";
import { TenantsPanel } from "@/components/tenants-panel";

export default function DashboardPage() {
  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "2rem 1.5rem 4rem",
        display: "grid",
        gap: "1.5rem",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.85rem",
              color: "#777",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            autoresearch
          </div>
          <h1 style={{ fontSize: "1.6rem", margin: "0.2rem 0 0" }}>
            Live ops
          </h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <RunGenerationButton />
          <Link
            href="/console/settings/stripe"
            style={{
              fontSize: "0.85rem",
              color: "#444",
              textDecoration: "none",
              border: "1px solid #d6d3cc",
              padding: "0.4rem 0.8rem",
              borderRadius: 8,
              background: "#fafaf7",
            }}
          >
            Stripe →
          </Link>
          <Link
            href="/console/settings/keys"
            style={{
              fontSize: "0.85rem",
              color: "#444",
              textDecoration: "none",
              border: "1px solid #d6d3cc",
              padding: "0.4rem 0.8rem",
              borderRadius: 8,
              background: "#fafaf7",
            }}
          >
            API keys →
          </Link>
        </div>
      </header>

      <DollarTicker />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "1.5rem",
        }}
      >
        <BudgetState />
        <RecentLedger />
      </div>

      <BucketHeatmap />

      <TenantsPanel />

      <ExperimentsFeed />

      <footer
        style={{
          color: "#999",
          fontSize: "0.8rem",
          textAlign: "center",
          paddingTop: "1.5rem",
          borderTop: "1px solid #e8e6e1",
        }}
      >
        Convex realtime — auto-updates as the webhook fires.
      </footer>
    </main>
  );
}
