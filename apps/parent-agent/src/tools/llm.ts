import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createLogger, type Logger } from "@autoresearch/shared";
import type { RenderedPrompt } from "@autoresearch/prompts";
import { env } from "../env.js";

const log: Logger = createLogger("parent-agent.llm");

/**
 * Pinned Claude model. Latest Opus as of 2026-05-09 is `claude-opus-4-7`.
 * We default to it for `propose` (creativity matters) and Sonnet for
 * `distill` (cheaper, still strong reasoning).
 */
export const MODEL_OPUS = "claude-opus-4-7";
export const MODEL_SONNET = "claude-sonnet-4-6";

let anthropicCached: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!anthropicCached) {
    anthropicCached = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
  }
  return anthropicCached;
}

export interface JsonGenArgs<T> {
  model?: string;
  prompt: RenderedPrompt;
  schema: z.ZodType<T>;
  maxTokens?: number;
  /** Number of attempts on schema-validation failure. Spec violations
   * are returned to the model as the next user turn. */
  maxRetries?: number;
}

/**
 * Run a structured generation: ask for valid JSON, validate against the
 * Zod schema, retry with the validation error verbatim on failure
 * (matches `docs/stack.md` §8 failure mode #7).
 */
export async function generateJson<T>(args: JsonGenArgs<T>): Promise<T> {
  const model = args.model ?? MODEL_OPUS;
  const maxRetries = args.maxRetries ?? 3;
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: args.prompt.user },
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await anthropic().messages.create({
      model,
      system: args.prompt.system,
      messages,
      max_tokens: args.maxTokens ?? 2048,
    });

    const text = extractText(res.content);
    const candidate = stripCodeFence(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch (err) {
      log.warn("JSON parse failed, retrying", {
        attempt,
        prompt: args.prompt.name,
        snippet: candidate.slice(0, 200),
      });
      messages.push(
        { role: "assistant", content: text },
        {
          role: "user",
          content: `That was not valid JSON: ${
            err instanceof Error ? err.message : String(err)
          }. Output only the JSON, no surrounding prose, no code fence.`,
        }
      );
      continue;
    }
    const result = args.schema.safeParse(parsed);
    if (result.success) return result.data;
    log.warn("schema validation failed, retrying", {
      attempt,
      prompt: args.prompt.name,
      issues: result.error.issues.length,
    });
    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content: `Schema validation failed:\n${result.error.issues
          .map((i) => `- ${i.path.join(".")}: ${i.message}`)
          .join("\n")}\nReturn corrected JSON only.`,
      }
    );
  }
  throw new Error(
    `generateJson exceeded ${maxRetries} retries for prompt ${args.prompt.name}@${args.prompt.version}`
  );
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    const closing = trimmed.lastIndexOf("```");
    if (firstNewline >= 0 && closing > firstNewline) {
      return trimmed.slice(firstNewline + 1, closing).trim();
    }
  }
  return trimmed;
}
