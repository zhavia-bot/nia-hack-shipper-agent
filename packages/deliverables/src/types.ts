import { z } from "zod";

/**
 * Spec shapes for each deliverable kind. The LLM is constrained to emit
 * these via Zod validation in the child function before dispatching to a
 * generator. Keeping the spec narrow keeps generators pure and stable.
 */

export const SectionSchema = z.object({
  heading: z.string().min(1),
  paragraphs: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const ReportSpecSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  sections: z.array(SectionSchema).min(1).max(20),
  footer: z.string().max(400).optional(),
});
export type ReportSpec = z.infer<typeof ReportSpecSchema>;

/** JSON deliverable: any serializable object. */
export const JsonSpecSchema = z.object({
  filename: z.string().min(1).max(120),
  payload: z.unknown(),
});
export type JsonSpec = z.infer<typeof JsonSpecSchema>;

/** Markdown deliverable: same shape as ReportSpec, rendered as MD. */
export type MarkdownSpec = ReportSpec;
export const MarkdownSpecSchema = ReportSpecSchema;

/** Pack/Zip deliverable: collection of in-memory files. */
export const PackFileSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["md", "json", "txt", "csv"]),
  content: z.string(),
});
export type PackFile = z.infer<typeof PackFileSchema>;

export const PackSpecSchema = z.object({
  files: z.array(PackFileSchema).min(1).max(40),
});
export type PackSpec = z.infer<typeof PackSpecSchema>;
