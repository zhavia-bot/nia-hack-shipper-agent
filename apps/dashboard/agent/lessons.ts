import { z } from "zod";
import { LessonSchema, type Lesson } from "@autoresearch/schemas";
import { distillLessons, render } from "@autoresearch/prompts";
import { createLogger } from "@autoresearch/shared";
import { generateJson, MODEL_SONNET } from "./tools/llm.js";
import { convexClient } from "./tools/convex-client.js";

const log = createLogger("parent-agent.lessons");

const LessonsArraySchema = z.array(LessonSchema).min(1).max(8);

/**
 * Distill 2-5 lessons from this generation's outcomes via Sonnet, write
 * them to the lessons table, and apply time-decay to existing ones.
 *
 * AutoResearchClaw pattern (`docs/stack.md` §5.5): every generation,
 * existing lesson weights are multiplied by 0.92 and pruned below 0.1.
 * The decay is run AFTER new lessons are written so a fresh lesson
 * starts at weight 1.0.
 */
export async function distillLessonsForGeneration(generation: number): Promise<{
  written: number;
  pruned: number;
}> {
  const experiments = await convexClient().query("experiments:byGeneration", {
    generation,
  }) as Array<{
    _id: string;
    hypothesisId: string;
    bucket: { niche: string; format: string; priceTier: string; channel: string };
    spendUsd: number;
    revenueUsd: number;
    visitors: number;
    conversions: number;
    roasMean?: number;
    status: "pending" | "keep" | "refine" | "discard" | "crash";
    rationale: string;
    notes: string;
  }>;

  if (experiments.length === 0) {
    log.warn("no experiments for generation; skipping lesson distillation", {
      generation,
    });
    return { written: 0, pruned: 0 };
  }

  const prompt = render(distillLessons, {
    generation,
    experiments: experiments.map((e) => ({
      id: e._id,
      hypothesisId: e.hypothesisId,
      bucket: e.bucket,
      spendUsd: e.spendUsd,
      revenueUsd: e.revenueUsd,
      visitors: e.visitors,
      conversions: e.conversions,
      roasMean: e.roasMean ?? null,
      status: e.status,
      rationale: e.rationale,
      notes: e.notes,
    })),
  });

  const lessons: Lesson[] = await generateJson({
    model: MODEL_SONNET,
    prompt,
    schema: LessonsArraySchema,
    maxTokens: 2048,
  });

  await convexClient().mutation("lessons:write", {
    lessons: lessons.map((l) => ({
      generation,
      scope: l.scope,
      pattern: l.pattern,
      evidence: l.evidence,
      weight: 1.0,
    })),
  });

  const decayResult = (await convexClient().mutation(
    "lessons:decayAndPrune",
    {}
  )) as { pruned: number; kept: number };

  log.info("lessons distilled", {
    generation,
    written: lessons.length,
    pruned: decayResult.pruned,
    kept: decayResult.kept,
  });

  return { written: lessons.length, pruned: decayResult.pruned };
}
