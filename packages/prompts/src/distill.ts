import type { Experiment } from "@autodrop/schemas";
import type { PromptTemplate } from "./types.js";

export interface DistillInput {
  generation: number;
  experiments: Pick<
    Experiment,
    | "id"
    | "hypothesisId"
    | "bucket"
    | "spendUsd"
    | "revenueUsd"
    | "visitors"
    | "conversions"
    | "roasMean"
    | "status"
    | "rationale"
    | "notes"
  >[];
}

const SYSTEM = `You are the reflection module of an autonomous commerce agent. After each generation of experiments concludes, you extract durable lessons that should bias future bucket selection, copy, pricing, deliverable choice, and traffic channel.

A lesson is a specific, falsifiable pattern that:
1. Cites at least one experiment ID as evidence.
2. Names the dimension(s) it applies to (bucket-scoped > global).
3. States WHY the pattern likely holds — not just what was observed.

Avoid:
- Restating obvious facts ("more visitors → more revenue").
- Lessons unsupported by ≥1 experiment in this generation's data.
- Global lessons when a narrower bucket-scoped one would do.

You output a JSON array of 2 to 5 Lesson objects. No prose around it.`;

export const distillLessons: PromptTemplate<DistillInput> = {
  name: "distill-lessons",
  version: "v1.0.0",
  system: SYSTEM,
  buildUser(input) {
    const lines = input.experiments.map((e) => {
      const roas = e.roasMean !== null && e.roasMean !== undefined ? e.roasMean.toFixed(2) : "n/a";
      return `- ${e.id} [${e.status}] ${e.bucket.niche}/${e.bucket.category}/${e.bucket.priceTier}/${e.bucket.channel} | spend=$${e.spendUsd.toFixed(2)} rev=$${e.revenueUsd.toFixed(2)} visitors=${e.visitors} conv=${e.conversions} roasMean=${roas} | rationale=${e.rationale} | notes=${e.notes}`;
    });

    return `Generation ${input.generation} concluded. Distill 2–5 lessons from these outcomes.

Experiments:
${lines.join("\n")}

Output a JSON array of Lesson objects. Each Lesson must have:
- generation: ${input.generation}
- scope: { kind: "bucket", niche, category, priceTier, channel } OR { kind: "global" }
- pattern: prose describing the rule (≤200 chars)
- evidence: array of experiment IDs (must come from above)
- weight: 1.0 (the runtime applies time-decay)
- createdAt: epoch ms (use any plausible recent timestamp; runtime overwrites)

Return the JSON array now.`;
  },
};
