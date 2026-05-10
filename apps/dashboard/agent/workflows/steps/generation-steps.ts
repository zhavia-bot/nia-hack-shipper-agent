"use step";

import {
  HypothesisSchema,
  type Hypothesis,
  type Lesson,
  type Tenant,
} from "@autodrop/schemas";
import { createLogger } from "@autodrop/shared";
import { propose } from "../../propose.js";
import { selectAndClassify } from "../../select.js";
import { distillLessonsForGeneration } from "../../lessons.js";
import { killSwitchTripped } from "../../budget.js";
import { convexClient } from "../../tools/convex-client.js";
import {
  loadRunKeys,
  withRunContext,
  type RunKeys,
} from "../../run-context.js";
import { recordAgentEvent } from "../../events.js";

const log = createLogger("workflows.steps.generation");

/**
 * Wrappers for the parent generation workflow. The workflow body itself
 * (`run-generation.ts`) cannot import `propose`, `select`, `lessons`,
 * `events`, or `run-context` directly — they pull `node:async_hooks` and
 * the MCP SDK transitively, neither of which can be bundled into a
 * `'use workflow'` chunk. Step files don't have that constraint, so the
 * workflow stays pure orchestration and every side-effect call site
 * lives here.
 */

export type ChildOutcome = {
  experimentId: string;
  status: "pending" | "crash";
  error?: string;
};

async function withUserCtx<T>(
  actingUserId: string,
  fn: (keys: RunKeys) => Promise<T>,
): Promise<T> {
  const keys = await loadRunKeys(actingUserId);
  return withRunContext({ actingUserId, keys }, () => fn(keys));
}

export async function checkKillSwitchStep(): Promise<{
  halt: boolean;
  reason: string | null;
}> {
  return killSwitchTripped();
}

export async function startGenerationStep(actingUserId: string): Promise<{
  generation: number;
  lessons: Lesson[];
  liveTenants: Tenant[];
}> {
  return withUserCtx(actingUserId, async () => {
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
    return { generation, lessons, liveTenants };
  });
}

export async function proposeHypothesesStep(args: {
  actingUserId: string;
  generation: number;
  batchSize: number;
  lessons: Lesson[];
  liveTenants: Tenant[];
}): Promise<Hypothesis[]> {
  return withUserCtx(args.actingUserId, async () => {
    const raw = await propose({
      generation: args.generation,
      batchSize: args.batchSize,
      lessons: args.lessons,
      liveTenants: args.liveTenants,
    });
    const stamped = raw.map((h) => ({
      ...h,
      actingUserId: args.actingUserId,
    }));
    for (const h of stamped) HypothesisSchema.parse(h);
    log.info("propose complete", {
      generation: args.generation,
      count: stamped.length,
    });
    return stamped;
  });
}

export async function classifyOutcomeStep(
  actingUserId: string,
  outcome: ChildOutcome,
): Promise<void> {
  return withUserCtx(actingUserId, async () => {
    await selectAndClassify({ status: "fulfilled", value: outcome });
  });
}

export async function finalizeGenerationStep(
  actingUserId: string,
  generation: number,
  outcomes: ChildOutcome[],
): Promise<void> {
  return withUserCtx(actingUserId, async () => {
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
  });
}
