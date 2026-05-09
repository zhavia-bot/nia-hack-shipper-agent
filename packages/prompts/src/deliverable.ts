import type { Bucket } from "@autoresearch/schemas";
import type { PromptTemplate } from "./types.js";

export interface DeliverableInput {
  bucket: Bucket;
  price: number;
  rationale: string;
}

const REPORT_SYSTEM = `You author a focused, useful PDF/Markdown report of 5-12 sections. Concrete, original analysis. No fluff, no front-matter clichés, no "in this report we will". Cite specifics where relevant. Aim for the reader to feel they got more than $X of value within the first page.

Output one valid ReportSpec JSON: { title, subtitle?, sections: [{heading, paragraphs?, bullets?}], footer? }. No prose around it.`;

export const generateReportSpec: PromptTemplate<DeliverableInput> = {
  name: "generate-deliverable-report",
  version: "v1.0.0",
  system: REPORT_SYSTEM,
  buildUser(input) {
    return `Bucket: ${input.bucket.niche} / ${input.bucket.format} / ${input.bucket.priceTier} / ${input.bucket.channel}
Price: $${input.price}
Rationale: ${input.rationale}

Output the ReportSpec JSON now. Constraints:
- title: ≤120 chars
- 5–12 sections; each section has either paragraphs or bullets (or both)
- bullets: ≤8 per section; concrete and skimmable
- footer: optional disclaimer or refund line`;
  },
};

const PACK_SYSTEM = `You author a pack of 3–15 small reference files (markdown/json/csv/txt) that together form a useful kit on the topic. Each file is self-contained, scannable in under 60 seconds, and worth its slot. No README puffery; the kit speaks for itself.

Output one valid PackSpec JSON: { files: [{name, kind, content}] }. No prose around it.`;

export const generatePackSpec: PromptTemplate<DeliverableInput> = {
  name: "generate-deliverable-pack",
  version: "v1.0.0",
  system: PACK_SYSTEM,
  buildUser(input) {
    return `Bucket: ${input.bucket.niche} / ${input.bucket.format} / ${input.bucket.priceTier} / ${input.bucket.channel}
Price: $${input.price}
Rationale: ${input.rationale}

Output the PackSpec JSON now. Constraints:
- 3–15 files
- file.kind ∈ {md, json, txt, csv}
- name without extension is fine (the runtime appends one)
- prefer short, structured files over one giant one`;
  },
};

const JSON_SYSTEM = `You author a single JSON dataset that is the deliverable. Schema must be self-evident from the keys. The buyer wants data, not prose. No surrounding text.

Output one valid JsonSpec: { filename, payload }. payload is the JSON value the buyer downloads. No prose around it.`;

export const generateJsonSpec: PromptTemplate<DeliverableInput> = {
  name: "generate-deliverable-json",
  version: "v1.0.0",
  system: JSON_SYSTEM,
  buildUser(input) {
    return `Bucket: ${input.bucket.niche} / ${input.bucket.format} / ${input.bucket.priceTier} / ${input.bucket.channel}
Price: $${input.price}
Rationale: ${input.rationale}

Output the JsonSpec JSON now. Constraints:
- filename: ≤120 chars (extension optional; runtime appends .json)
- payload: object or array; large enough to feel substantive (10–500 records is typical)`;
  },
};
