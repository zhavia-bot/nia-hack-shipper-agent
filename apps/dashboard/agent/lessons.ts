import { z } from "zod";
import {
  LessonSchema,
  type Bucket,
  type Lesson,
} from "@autoresearch/schemas";
import { distillLessons, render } from "@autoresearch/prompts";
import { createLogger } from "@autoresearch/shared";
import { generateJson, MODEL_SONNET } from "./tools/llm.js";
import { convexClient } from "./tools/convex-client.js";
import { nia } from "./tools/nia.js";

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
    bucket: Bucket;
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

  // Mirror lessons into Nia so future generations can search them via the
  // Oracle alongside Nia's own corpus. Fire-and-forget — Nia indexing is
  // not on the critical path, and any failure is logged but never blocks
  // the parent loop.
  void indexLessonsToNia(lessons, generation).catch((err) => {
    log.warn("nia lesson indexing failed (non-fatal)", { err });
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

/**
 * Push this generation's lessons into Nia as an indexable note. Tool
 * names on Nia's MCP surface evolve, so we discover at call time and
 * pick the first index/save/upsert tool. The serialized text is
 * bucket-scoped lessons (one per line) plus a `gen-N` tag so retrieval
 * can filter by generation later.
 */
async function indexLessonsToNia(lessons: Lesson[], generation: number): Promise<void> {
  const tools = await nia.listTools();
  const list = (tools as { tools?: { name: string }[] }).tools ?? [];
  const candidate = list.find((t) =>
    /index|save|upsert|store|memory|note/i.test(t.name),
  );
  if (!candidate) {
    log.warn("nia: no index/save tool found; skipping lesson upload", {
      toolCount: list.length,
    });
    return;
  }

  const text = lessons
    .map((l) => {
      const scope =
        l.scope.kind === "bucket"
          ? `[${l.scope.niche}/${l.scope.category}/${l.scope.priceTier}/${l.scope.channel}]`
          : "[global]";
      return `${scope} (gen ${generation}) ${l.pattern}\n  evidence: ${l.evidence.join(", ")}`;
    })
    .join("\n\n");

  await nia.callTool(candidate.name, {
    text,
    tag: `gen-${generation}`,
    source: "autoresearch-lessons",
  });
  log.info("nia: lessons indexed", {
    tool: candidate.name,
    count: lessons.length,
    generation,
  });
}
