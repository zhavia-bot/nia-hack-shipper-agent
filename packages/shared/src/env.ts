import { z } from "zod";

/**
 * Validate required env vars at boot. Each app declares the subset it needs
 * via a Zod schema; this helper parses `process.env` and either returns a
 * typed config object or throws with all missing keys at once.
 *
 * Real secrets live in Doppler / Vercel env / Convex env / Tensorlake env.
 * The agent sandbox holds ONLY the agent-scoped subset — not webhook
 * secrets, not refund keys, not admin tokens.
 */
export function loadEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: NodeJS.ProcessEnv = process.env
): z.infer<TSchema> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`env validation failed:\n${issues}`);
  }
  return parsed.data;
}

/** Reusable building blocks for per-app env schemas. */
export const requiredString = z.string().min(1);
export const optionalString = z.string().optional();
export const booleanFromString = z
  .string()
  .transform((v) => v.toLowerCase() === "true")
  .pipe(z.boolean());
export const intFromString = z
  .string()
  .transform((v) => Number.parseInt(v, 10))
  .pipe(z.number().int());
