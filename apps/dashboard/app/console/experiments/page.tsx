import { ExperimentsTable } from "@/components/experiments-table";
import { StartNComposer } from "@/components/start-n-composer";
import { FadeIn } from "@/components/motion-primitives";

export default function ExperimentsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <FadeIn className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Hypothesis-test runs
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Experiments
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Each row is one child workflow — Hypothesize → Scout → Ship → Measure → Settle.
            Stop kills the storefront and marks the row discard; for paid orders use the
            tenant&rsquo;s force-refund button.
          </p>
        </div>
        <StartNComposer />
      </FadeIn>

      <FadeIn delay={0.05}>
        <ExperimentsTable limit={100} showFilter />
      </FadeIn>
    </main>
  );
}
