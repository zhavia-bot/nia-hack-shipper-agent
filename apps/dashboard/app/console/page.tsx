import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DollarTicker } from "@/components/dollar-ticker";
import { BudgetState } from "@/components/budget-state";
import { RecentLedger } from "@/components/recent-ledger";
import { ExperimentsTable } from "@/components/experiments-table";
import { BucketHeatmap } from "@/components/bucket-heatmap";
import { StartNComposer } from "@/components/start-n-composer";
import { TenantsPanel } from "@/components/tenants-panel";
import { AgentLogStream } from "@/components/agent-log-stream";
import { ExploreExploitSlider } from "@/components/explore-exploit-slider";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion-primitives";

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <FadeIn className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Live ops
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Overview
          </h1>
        </div>
        <StartNComposer />
      </FadeIn>

      <FadeIn delay={0.05} className="mb-6">
        <DollarTicker />
      </FadeIn>

      <Stagger className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <StaggerItem>
          <AgentLogStream limit={50} />
        </StaggerItem>
        <StaggerItem>
          <div className="grid gap-6">
            <ExploreExploitSlider />
            <BudgetState />
          </div>
        </StaggerItem>
      </Stagger>

      <FadeIn delay={0.05} className="mb-6">
        <BucketHeatmap />
      </FadeIn>

      <Stagger className="mb-6 grid gap-6 lg:grid-cols-2">
        <StaggerItem>
          <RecentLedger />
        </StaggerItem>
        <StaggerItem>
          <TenantsPanel />
        </StaggerItem>
      </Stagger>

      <FadeIn delay={0.05}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent experiments
          </h2>
          <Button asChild size="sm" variant="ghost" className="gap-1">
            <Link href="/console/experiments">
              See all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <ExperimentsTable limit={10} showFilter={false} />
      </FadeIn>

      <p className="mt-10 border-t border-border/60 pt-4 text-center text-xs text-muted-foreground">
        Convex realtime — auto-updates as the webhook fires.
      </p>
    </main>
  );
}
