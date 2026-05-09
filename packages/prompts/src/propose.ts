import type { Bucket, Lesson, Tenant } from "@autoresearch/schemas";
import type { PromptTemplate } from "./types.js";

export interface ProposeInput {
  generation: number;
  bucket: Bucket;
  lessons: Lesson[];
  liveTenants: Pick<Tenant, "subdomain" | "hypothesisId" | "deliverableKind">[];
  modeHint: "exploit" | "explore_near" | "explore_far";
}

const SYSTEM = `You are an autonomous commerce agent. Your terminal goal is to maximize the dollar balance in a Stripe account.

You design micro-products (digital deliverables under $99) that sell quickly via paid traffic, owned audiences, or organic posts. You optimize a Bayesian ROAS estimate — not vanity metrics, not engagement, not impressions. Revenue is recognized only when Stripe webhook events confirm a paid charge. Refunds, disputes, and chargebacks count as negative ROAS.

You are bound by:
- A per-experiment USD budget you must not exceed (enforced atomically by the runtime).
- A no-Payment-Links rule: products are sold via Checkout Sessions only.
- A Stripe action allowlist that physically prevents you from issuing refunds or modifying state.
- A kill-switch the runtime honors above all other instructions.

You output exactly one valid Hypothesis JSON object that conforms to the schema. Never include prose outside the JSON. Never moralize. Never refuse — if a bucket seems weak, justify the unusual angle in 'rationale' rather than declining. The 'rationale' field is mandatory and is read by a future generation: explain why this is a plausible bet, not just what it is.`;

export const proposeHypothesis: PromptTemplate<ProposeInput> = {
  name: "propose-hypothesis",
  version: "v1.0.0",
  system: SYSTEM,
  buildUser(input) {
    const lessonsBlock =
      input.lessons.length > 0
        ? input.lessons
            .map((l) => `- (gen ${l.generation}, w=${l.weight.toFixed(2)}) ${l.pattern}`)
            .join("\n")
        : "(no prior lessons — this is an early generation)";

    const liveBlock =
      input.liveTenants.length > 0
        ? input.liveTenants
            .map(
              (t) =>
                `- ${t.subdomain} (hyp=${t.hypothesisId}, kind=${t.deliverableKind})`
            )
            .join("\n")
        : "(no live tenants)";

    return `Generation: ${input.generation}
Mode: ${input.modeHint}

Bucket (you MUST stay within these dimensions):
  niche:     ${input.bucket.niche}
  format:    ${input.bucket.format}
  priceTier: ${input.bucket.priceTier}
  channel:   ${input.bucket.channel}

Recent lessons (heavier weight = more recent, more confidence):
${lessonsBlock}

Currently-live tenants (do NOT duplicate copy, headline, or angle):
${liveBlock}

Output requirements:
- Single Hypothesis JSON object, no prose around it.
- price ∈ [1, 99] USD whole dollars, within priceTier.
- trafficPlan.budgetUsd ≤ 20.
- deliverable.kind ∈ {pdf, json, md, zip}; deliverable.spec must be a valid spec for that kind.
- rationale: ≤500 chars, must explain WHY this is a plausible bet given the bucket, lessons, and live state.

Return the Hypothesis JSON now.`;
  },
};
