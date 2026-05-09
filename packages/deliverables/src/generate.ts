import type { DeliverableKind } from "@autoresearch/schemas";
import { generateMarkdown } from "./markdown.js";
import { generateJson } from "./json.js";
import { generatePdf } from "./pdf.js";
import { generateZip } from "./zip.js";
import {
  ReportSpecSchema,
  MarkdownSpecSchema,
  JsonSpecSchema,
  PackSpecSchema,
} from "./types.js";

export interface GeneratedDeliverable {
  kind: DeliverableKind;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

const enc = new TextEncoder();

/**
 * Validate the LLM-supplied spec against the kind's Zod schema, then
 * dispatch to the appropriate generator. Returns bytes ready for upload
 * to Convex File Storage. Throws Zod errors on bad spec — caller's child
 * function should mark the experiment `crash` and log the lesson.
 */
export async function generateDeliverable(args: {
  kind: DeliverableKind;
  spec: unknown;
  baseFilename: string;
}): Promise<GeneratedDeliverable> {
  const { kind, spec, baseFilename } = args;
  switch (kind) {
    case "pdf": {
      const parsed = ReportSpecSchema.parse(spec);
      const bytes = await generatePdf(parsed);
      return {
        kind,
        filename: `${baseFilename}.pdf`,
        contentType: "application/pdf",
        bytes,
      };
    }
    case "md": {
      const parsed = MarkdownSpecSchema.parse(spec);
      const text = generateMarkdown(parsed);
      return {
        kind,
        filename: `${baseFilename}.md`,
        contentType: "text/markdown; charset=utf-8",
        bytes: enc.encode(text),
      };
    }
    case "json": {
      const parsed = JsonSpecSchema.parse(spec);
      const text = generateJson(parsed);
      return {
        kind,
        filename: parsed.filename.endsWith(".json")
          ? parsed.filename
          : `${baseFilename}.json`,
        contentType: "application/json; charset=utf-8",
        bytes: enc.encode(text),
      };
    }
    case "zip": {
      const parsed = PackSpecSchema.parse(spec);
      const bytes = await generateZip(parsed);
      return {
        kind,
        filename: `${baseFilename}.zip`,
        contentType: "application/zip",
        bytes,
      };
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unknown deliverable kind: ${String(_exhaustive)}`);
    }
  }
}
