import { experimental_generateImage as generateImage_ai } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { createLogger } from "@autoresearch/shared";
import { reportSpend } from "../budget.js";
import { getKey } from "../run-context.js";

const log = createLogger("parent-agent.images");

/**
 * Both primary and fallback route through Vercel AI Gateway, billed to
 * the user's `aiGatewayKey`. No direct OpenAI / fal.ai SDK dependency.
 *
 * Primary: Black Forest Labs FLUX 2 (Flex) — fastest, cheapest.
 * Fallback: Google Gemini 3 Pro Image (Nano Banana Pro) — used on policy
 * or rate-limit errors from the primary.
 *
 * Model IDs above are AI Gateway-routed slugs. Verify availability via
 * `gateway.getAvailableModels()` if a model rejects unknown.
 */
export const PRIMARY_IMAGE_MODEL = "bfl/flux-2-flex";
export const FALLBACK_IMAGE_MODEL = "google/gemini-3-pro-image";

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

export type ImagePurpose = "hero" | "cover" | "ad_background";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "2048x2048";

export interface GenerateImageArgs {
  reservationId: string;
  prompt: string;
  size?: ImageSize;
  purpose: ImagePurpose;
}

export interface GeneratedImage {
  /** Data URL or signed URL — caller MUST persist to Convex File Storage. */
  url: string;
  provider: "flux_2_flex" | "gemini_3_pro_image";
  costUsd: number;
}

/**
 * Generate an image via AI Gateway. On policy/rate-limit error from the
 * primary model, fall back to the secondary model. Budget cost reported
 * into the reservation BEFORE returning.
 */
export async function generateImage(
  args: GenerateImageArgs,
): Promise<GeneratedImage> {
  const size = args.size ?? "1024x1024";
  try {
    const out = await runModel({
      model: PRIMARY_IMAGE_MODEL,
      prompt: args.prompt,
      size,
    });
    const cost = estimateCost(PRIMARY_IMAGE_MODEL, size);
    await reportSpend({ reservationId: args.reservationId, amountUsd: cost });
    log.info("image generated via primary", {
      reservationId: args.reservationId,
      purpose: args.purpose,
      model: PRIMARY_IMAGE_MODEL,
      size,
      cost,
    });
    return { url: out, provider: "flux_2_flex", costUsd: cost };
  } catch (err) {
    if (!isPolicyOrRateLimitError(err)) throw err;
    log.warn("primary image model unavailable, falling back", {
      reservationId: args.reservationId,
      reason: err instanceof Error ? err.message : String(err),
    });
    const out = await runModel({
      model: FALLBACK_IMAGE_MODEL,
      prompt: args.prompt,
      size,
    });
    const cost = estimateCost(FALLBACK_IMAGE_MODEL, size);
    await reportSpend({ reservationId: args.reservationId, amountUsd: cost });
    return { url: out, provider: "gemini_3_pro_image", costUsd: cost };
  }
}

async function runModel(opts: {
  model: string;
  prompt: string;
  size: ImageSize;
}): Promise<string> {
  const gw = gatewayForCurrent();
  const { image } = await generateImage_ai({
    model: gw.imageModel(opts.model),
    prompt: opts.prompt,
    size: opts.size,
    n: 1,
  });
  // AI SDK returns base64 + media type; surface as a data URL so callers
  // can fetch + persist uniformly with provider-signed URLs.
  return `data:${image.mediaType};base64,${image.base64}`;
}

function isPolicyOrRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("content_policy") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("safety")
  );
}

function estimateCost(model: string, size: ImageSize): number {
  // Rough per-image USD per Gateway pricing (verify via /v1/models). FLUX
  // Flex is the budget tier; Gemini 3 Pro Image is more expensive.
  const base = model === FALLBACK_IMAGE_MODEL ? 0.04 : 0.02;
  const sizeMult =
    size === "2048x2048" ? 4 : size === "1024x1024" ? 1 : 1.5;
  return base * sizeMult;
}
