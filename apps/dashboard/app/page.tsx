import { DollarTicker } from "@/components/dollar-ticker";
import { BudgetState } from "@/components/budget-state";
import { RecentLedger } from "@/components/recent-ledger";
import { ExperimentsFeed } from "@/components/experiments-feed";
import { BucketHeatmap } from "@/components/bucket-heatmap";

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
      <header>
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
