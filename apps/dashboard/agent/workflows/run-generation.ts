"use workflow";

import {
  HypothesisSchema,
  type Lesson,
  type Tenant,
} from "@autodrop/schemas";
import { createLogger } from "@autodrop/shared";
import { propose } from "../propose.js";
import { runHypothesis } from "./run-hypothesis.js";
import { selectAndClassify, type ChildOutcome } from "../select.js";
import { distillLessonsForGeneration } from "../lessons.js";
import { killSwitchTripped } from "../budget.js";
import { convexClient } from "../tools/convex-client.js";
import { loadRunKeys, withRunContext } from "../run-context.js";
import { recordAgentEvent } from "../events.js";

const log = createLogger("workflows.run-generation");
const DEFAULT_BATCH_SIZE = 6;
const MAX_BATCH_SIZE = 8;

/**
 * Vercel Workflow — one generation per invocation. The old `while(true)`
 * orchestrator is replaced by a cron trigger that fires this workflow on a
 * schedule (configured in P7.7); each run is durable and idempotent on the
 * Convex `generation` counter.
 *
 * BYOK keys are re-hydrated at the top of the workflow via `loadRunKeys`
 * because AsyncLocalStorage doesn't cross durable step boundaries — the
 * whole body runs inside a single `withRunContext` frame so synchronous
 * tool calls inherit the keys, while step-spawning code paths (e.g. P7.6
 * child workflows) re-hydrate independently.
 */
export async function runGeneration(actingUserId: string): Promise<{
  generation: number;
  outcomes: ChildOutcome[];
  halted?: { reason: string };
}> {
  const halt = await killSwitchTripped();
  if (halt.halt) {
    log.warn("kill switch engaged — skipping generation", {
      reason: halt.reason,
    });
    return {
      generation: -1,
      outcomes: [],
      halted: { reason: halt.reason ?? "unknown" },
    };
  }

  const keys = await loadRunKeys(actingUserId);

  return withRunContext({ actingUserId, keys }, async () => {
    const generation = await convexClient().mutation<number>(
      "system:nextGeneration",
      {},
    );
    log.info("generation start", { generation, actingUserId });
    await recordAgentEvent({
      level: "info",
      kind: "generation.start",
      summary: `Generation ${generation} starting`,
      generation,
    });

    const lessons = (await convexClient().query("lessons:topWeighted", {
      limit: 50,
    })) as Lesson[];
    const liveTenants = (await convexClient().query("tenants:byStatus", {
      status: "live",
    })) as Tenant[];

    const batchSize = Math.min(DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
    const hypotheses = await propose({
      generation,
      batchSize,
      lessons,
      liveTenants,
    });

    for (const h of hypotheses) HypothesisSchema.parse(h);

    log.info("fan-out children", { generation, count: hypotheses.length });

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
              o.reason instanceof Error
                ? o.reason.message
                : String(o.reason),
          },
    );

    for (const out of outcomes) {
      await selectAndClassify({ status: "fulfilled", value: out });
    }

    await distillLessonsForGeneration(generation);
    await convexClient().mutation("system:snapshotGeneration", { generation });

    log.info("generation complete", { generation });
    const crashes = outcomes.filter((o) => o.status === "crash").length;
    await recordAgentEvent({
      level: crashes === 0 ? "ok" : "warn",
      kind: "generation.complete",
      summary: `Generation ${generation} done — ${outcomes.length} hypotheses, ${crashes} crashed`,
      generation,
      payload: { outcomes: outcomes.length, crashes },
    });

    return { generation, outcomes };
  });
}
