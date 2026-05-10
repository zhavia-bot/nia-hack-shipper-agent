import { AgentLogStream } from "@/components/agent-log-stream";
import { FadeIn } from "@/components/motion-primitives";

export default function LivePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <FadeIn className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Realtime tail
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Live</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every narrative event the agent emits, across every generation. Convex
          push, no polling. Use the experiment detail page for a per-row view.
        </p>
      </FadeIn>
      <FadeIn delay={0.05}>
        <AgentLogStream limit={200} maxHeightClass="max-h-[75vh]" />
      </FadeIn>
    </main>
  );
}
