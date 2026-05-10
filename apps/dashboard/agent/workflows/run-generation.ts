"use workflow";

import { runHypothesis } from "./run-hypothesis.js";
import {
  checkKillSwitchStep,
  startGenerationStep,
  proposeHypothesesStep,
  classifyOutcomeStep,
  finalizeGenerationStep,
  type ChildOutcome,
} from "./steps/generation-steps.js";

const DEFAULT_BATCH_SIZE = 6;
const MAX_BATCH_SIZE = 8;

/**
 * Vercel Workflow — one generation per invocation, fired by cron or the
 * dashboard "Run a generation" button. The body is pure orchestration:
 * every side-effecting line lives in a `'use step'` wrapper in
 * `./steps/generation-steps.ts` (and `./steps/hypothesis-steps.ts` for
 * the children).
 *
 * Why: workflow chunks cannot bundle `node:async_hooks` (run-context's
 * AsyncLocalStorage) or the MCP SDK (Reacher / Nia). Both are reachable
 * via `propose`, `lessons`, `events`, and `run-context`, so the workflow
 * file imports none of them directly. Steps re-hydrate BYOK context from
 * Convex on every replay since AsyncLocalStorage doesn't survive durable
 * step boundaries.
 */
export async function runGeneration(actingUserId: string): Promise<{
  generation: number;
  outcomes: ChildOutcome[];
  halted?: { reason: string };
}> {
  const halt = await checkKillSwitchStep();
  if (halt.halt) {
    return {
      generation: -1,
      outcomes: [],
      halted: { reason: halt.reason ?? "unknown" },
    };
  }

  const { generation, lessons, liveTenants } =
    await startGenerationStep(actingUserId);

  const batchSize = Math.min(DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const hypotheses = await proposeHypothesesStep({
    actingUserId,
    generation,
    batchSize,
    lessons,
    liveTenants,
  });

  const settled = await Promise.allSettled(
    hypotheses.map((h) => runHypothesis(h)),
  );

  const outcomes: ChildOutcome[] = settled.map((o, i) =>
    o.status === "fulfilled"
      ? {
          experimentId: o.value.experimentId,
          status: o.value.status,
          ...(o.value.error !== undefined ? { error: o.value.error } : {}),
        }
      : {
          experimentId: hypotheses[i]?.id ?? "unknown",
          status: "crash" as const,
          error:
            o.reason instanceof Error ? o.reason.message : String(o.reason),
        },
  );

  for (const out of outcomes) {
    await classifyOutcomeStep(actingUserId, out);
  }

  await finalizeGenerationStep(actingUserId, generation, outcomes);

  return { generation, outcomes };
}
