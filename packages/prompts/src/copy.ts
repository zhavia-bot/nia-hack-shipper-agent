import type { Bucket } from "@autoresearch/schemas";
import type { PromptTemplate } from "./types.js";

export interface CopyInput {
  bucket: Bucket;
  price: number;
  deliverableKind: "pdf" | "json" | "md" | "zip";
  rationale: string;
}

const SYSTEM = `You write landing-page copy for one-shot digital products under $99. Tight, concrete, no hyperbole, no exclamation marks unless the product earns one. The reader should know in 5 seconds what they get and why $X is reasonable.

You output one valid Copy JSON object: { headline, subhead, bullets[≤5], cta }. No prose around it.`;

export const generateCopy: PromptTemplate<CopyInput> = {
  name: "generate-copy",
  version: "v1.0.0",
  system: SYSTEM,
  buildUser(input) {
    return `Bucket:
  niche:     ${input.bucket.niche}
  format:    ${input.bucket.format}
  channel:   ${input.bucket.channel}

Price: $${input.price}
Deliverable kind: ${input.deliverableKind}
Rationale (the agent's stated reason this product exists): ${input.rationale}

Output the Copy JSON now. Limits:
- headline: ≤80 chars
- subhead: ≤200 chars
- bullets: ≤5 items, each ≤120 chars
- cta: ≤40 chars`;
  },
};
