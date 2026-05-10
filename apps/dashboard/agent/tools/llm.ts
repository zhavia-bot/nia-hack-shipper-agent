import { generateObject } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { createLogger, type Logger } from "@autodrop/shared";
import type { RenderedPrompt } from "@autodrop/prompts";
import { getKey } from "../run-context.js";

const log: Logger = createLogger("parent-agent.llm");

/**
 * Model IDs as seen by Vercel AI Gateway. Gateway resolves these to the
 * underlying provider; the user's `aiGatewayKey` covers billing. Sonnet
 * 4.6 confirmed in Gateway docs; Opus 4.7 may need empirical verification
 * via `gateway.getAvailableModels()` — fall back to 4.6 if absent.
 */
export const MODEL_OPUS = "anthropic/claude-opus-4.6";
export const MODEL_SONNET = "anthropic/claude-sonnet-4.6";

const gatewayCache = new Map<string, ReturnType<typeof createGateway>>();
function gatewayForCurrent(): ReturnType<typeof createGateway> {
  const apiKey = getKey("aiGateway");
  let gw = gatewayCache.get(apiKey);
  if (!gw) {
    gw = createGateway({ apiKey });
    gatewayCache.set(apiKey, gw);
  }
  return gw;
}

export interface JsonGenArgs<T> {
  model?: string;
  prompt: RenderedPrompt;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

/**
 * Run a structured generation through Vercel AI Gateway. AI SDK's
 * `generateObject` handles JSON-mode + schema validation natively; the
 * Anthropic-specific extract/strip-fence dance is gone.
 */
export async function generateJson<T>(args: JsonGenArgs<T>): Promise<T> {
  const modelId = args.model ?? MODEL_OPUS;
  const gw = gatewayForCurrent();
  try {
    const { object } = await generateObject({
      model: gw(modelId),
      schema: args.schema,
      system: args.prompt.system,
      prompt: args.prompt.user,
      maxTokens: args.maxTokens ?? 2048,
    });
    return object as T;
  } catch (err) {
    log.error("generateJson failed", {
      prompt: args.prompt.name,
      version: args.prompt.version,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
