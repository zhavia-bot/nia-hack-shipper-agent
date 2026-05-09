import {
  type Bucket,
  type Hypothesis,
  HypothesisSchema,
  type Lesson,
  type Tenant,
  ChannelSchema,
  PhysicalCategorySchema,
  PriceTierSchema,
} from "@autoresearch/schemas";
import {
  thompsonSampleBuckets,
  type BucketStats,
} from "@autoresearch/bandit";
import { proposeHypothesis, render } from "@autoresearch/prompts";
import { createLogger, ulid } from "@autoresearch/shared";
import { generateJson } from "./tools/llm.js";
import { convexClient } from "./tools/convex-client.js";
import { reacher } from "./tools/reacher.js";
import { nia } from "./tools/nia.js";
import { currentContext } from "./run-context.js";
import { recordAgentEvent } from "./events.js";

const log = createLogger("parent-agent.propose");

export interface ProposeArgs {
  generation: number;
  batchSize: number;
  lessons: Lesson[];
  liveTenants: Tenant[];
}

// Defaults preserve the original 70/20/10 split when the operator
// hasn't moved the explore/exploit slider. Live value is loaded per-run
// from the acting user's row (P8.12). Near/far split of the explore
// remainder stays 2:1 — the slider is a single-number knob.
const DEFAULT_EXPLOIT_FRACTION = 0.7;
const NEAR_OF_EXPLORE = 2 / 3;

const CATEGORIES = PhysicalCategorySchema.options;
const PRICE_TIERS = PriceTierSchema.options;
const CHANNELS = ChannelSchema.options;

// Final backstop only — used when the Reacher MCP call fails entirely
// (network down, key missing, account deactivated). The pool is normally
// populated by `fetchNichePool()` against Reacher's TikTok Shop trending
// surface. One entry on purpose: if you see this in a log, the live
// signal is broken — don't pretend otherwise with a long fake list.
const REACHER_FALLBACK_NICHES = ["LED desk gadget"];

/**
 * Propose a batch of hypotheses for one generation. 70% Thompson-sampled
 * exploit slots, 20% near-explore (mutations of recent `refine` results),
 * 10% far-explore (random buckets). Each slot is realized by an LLM call
 * that returns a schema-valid Hypothesis.
 */
export async function propose(args: ProposeArgs): Promise<Hypothesis[]> {
  const exploitFraction = await resolveExploitFraction();
  const exploreFraction = 1 - exploitFraction;

  const exploitSlots = Math.round(args.batchSize * exploitFraction);
  const exploreNearSlots = Math.round(
    args.batchSize * exploreFraction * NEAR_OF_EXPLORE,
  );
  const exploreFarSlots = Math.max(
    0,
    args.batchSize - exploitSlots - exploreNearSlots,
  );

  const [bucketStats, nichePool] = await Promise.all([
    fetchBucketStats(),
    fetchNichePool(),
  ]);
  const exploitBuckets = thompsonSampleBuckets(bucketStats, exploitSlots);
  const exploreNearBuckets = await sampleNearMissBuckets(exploreNearSlots, nichePool);
  const exploreFarBuckets = sampleFarBuckets(exploreFarSlots, nichePool);

  const niaPriors = await fetchNiaPriors(nichePool);

  log.info("proposing batch", {
    generation: args.generation,
    exploitFraction,
    exploitSlots,
    exploreNearSlots,
    exploreFarSlots,
    bucketsAvailable: bucketStats.length,
    nichePoolSize: nichePool.length,
    niaPriorsLen: niaPriors.length,
  });
  await recordAgentEvent({
    level: "info",
    kind: "propose.start",
    summary: `Generation ${args.generation}: proposing ${args.batchSize} hypotheses (${exploitSlots} exploit / ${exploreNearSlots} near / ${exploreFarSlots} far)`,
    generation: args.generation,
    payload: {
      exploitFraction,
      bucketsAvailable: bucketStats.length,
      nichePoolSize: nichePool.length,
    },
  });

  const seeds: { bucket: Bucket; mode: "exploit" | "explore_near" | "explore_far" }[] =
    [
      ...exploitBuckets.map((b) => ({ bucket: b, mode: "exploit" as const })),
      ...exploreNearBuckets.map((b) => ({ bucket: b, mode: "explore_near" as const })),
      ...exploreFarBuckets.map((b) => ({ bucket: b, mode: "explore_far" as const })),
    ];

  const hypotheses = await Promise.all(
    seeds.map((s) =>
      llmGenerate(s.bucket, s.mode, args, niaPriors).catch((err) => {
        log.error("hypothesis generation failed; skipping slot", {
          err,
          bucket: s.bucket,
        });
        return null;
      })
    )
  );

  return hypotheses.filter((h): h is Hypothesis => h !== null);
}

/**
 * Pull a fresh pool of trending TikTok-Shop niches from Reacher. We don't
 * hardcode tool names — Reacher's MCP surface evolves — so we list the
 * available tools first and pick the first one whose name looks niche-y
 * (`*trend*`, `*niche*`, `*top_products*`). The picked tool is called with
 * a generic `{ channel: "tiktok_shop", limit: 30 }` arg bag; tools that
 * ignore unknown args simply return their default page, which is fine.
 *
 * Output is best-effort: any free-form string in the MCP content blocks
 * that looks like a short noun phrase becomes a candidate niche. Anything
 * unparseable falls back to `REACHER_FALLBACK_NICHES`. We log a clear
 * warning on fallback so an empty Reacher response never silently masquerades
 * as a real signal.
 */
async function fetchNichePool(): Promise<string[]> {
  try {
    const tools = await reacher.listTools();
    const list = (tools as { tools?: { name: string }[] }).tools ?? [];
    const candidate = list.find((t) =>
      /trend|niche|top.*product|category/i.test(t.name),
    );
    if (!candidate) {
      log.warn("reacher: no trending-niches tool found; using fallback", {
        toolCount: list.length,
      });
      return REACHER_FALLBACK_NICHES;
    }
    const result = await reacher.callTool(candidate.name, {
      channel: "tiktok_shop",
      limit: 30,
    });
    const niches = extractNichesFromMcp(result);
    if (niches.length === 0) {
      log.warn("reacher: tool returned no parseable niches; using fallback", {
        tool: candidate.name,
      });
      return REACHER_FALLBACK_NICHES;
    }
    log.info("reacher niche pool", { tool: candidate.name, count: niches.length });
    return niches;
  } catch (err) {
    log.error("reacher niche fetch failed; using fallback", { err });
    return REACHER_FALLBACK_NICHES;
  }
}

/**
 * Extract niche strings from an MCP `callTool` response. MCP returns a
 * `content[]` array of `{ type, text }` blocks; we accept either a JSON
 * payload (array of strings, or array of `{ name }` / `{ niche }` /
 * `{ title }` objects) or a newline-separated plaintext list. Strings are
 * trimmed, deduped, and capped to ≤8 words each so we don't end up with
 * sentence-shaped "niches".
 */
function extractNichesFromMcp(result: unknown): string[] {
  const out = new Set<string>();
  const content =
    (result as { content?: { type?: string; text?: string }[] }).content ?? [];
  for (const block of content) {
    if (block.type !== "text" || !block.text) continue;
    const txt = block.text.trim();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(txt);
    } catch {
      // not json — fall through to plaintext path
    }
    const collect = (s: unknown): void => {
      if (typeof s !== "string") return;
      const trimmed = s.trim();
      if (!trimmed) return;
      if (trimmed.split(/\s+/).length > 8) return;
      out.add(trimmed);
    };
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === "string") collect(item);
        else if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          collect(o["name"] ?? o["niche"] ?? o["title"] ?? o["category"]);
        }
      }
    } else if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      const arr = o["niches"] ?? o["results"] ?? o["items"] ?? o["data"];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string") collect(item);
          else if (item && typeof item === "object") {
            const oo = item as Record<string, unknown>;
            collect(oo["name"] ?? oo["niche"] ?? oo["title"] ?? oo["category"]);
          }
        }
      }
    } else {
      // plaintext: split on newlines / bullets
      for (const line of txt.split(/\r?\n|^\s*[-*•]\s+/m)) {
        collect(line);
      }
    }
  }
  return [...out];
}

/**
 * One Nia deep-research call per generation, shared across all hypothesis
 * slots. Cheaper and more cohesive than per-slot calls — the LLM sees a
 * unified picture of "what's selling now" and picks angles within it.
 *
 * Returns the concatenated text of Nia's content blocks, capped to ~6KB
 * so we don't blow past the proposeHypothesis prompt budget. Empty string
 * on failure; the prompt template renders a clear "(no Nia signal)"
 * placeholder so the LLM doesn't hallucinate that priors exist.
 */
async function fetchNiaPriors(nichePool: string[]): Promise<string> {
  const niches = nichePool.slice(0, 12).join(", ");
  const query = `What is currently selling well on TikTok Shop in these niches: ${niches}? For each, surface 1-2 concrete angles (form factor, price band, hook) that are working right now and any that have flopped. Cite numbers if you have them. Keep the whole answer under 1500 words.`;
  try {
    const result = await nia.deepResearch(query);
    const text = extractTextFromMcp(result);
    if (!text) {
      log.warn("nia deep-research returned empty content");
      return "";
    }
    const capped = text.length > 6000 ? text.slice(0, 6000) + "…" : text;
    log.info("nia priors fetched", { chars: capped.length });
    return capped;
  } catch (err) {
    log.error("nia deep-research failed; proceeding without priors", { err });
    return "";
  }
}

function extractTextFromMcp(result: unknown): string {
  const content =
    (result as { content?: { type?: string; text?: string }[] }).content ?? [];
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("\n\n")
    .trim();
}

/**
 * P8.12 — read the user's explore/exploit slider. Falls back to the
 * 0.7 default whenever the lookup fails for any reason (no run
 * context, query rejected, network blip). Clamps to [0, 1] defensively
 * so a corrupt row can't blow the slot math.
 */
async function resolveExploitFraction(): Promise<number> {
  const ctx = currentContext();
  if (!ctx) return DEFAULT_EXPLOIT_FRACTION;
  try {
    const r = (await convexClient().query("users:runSettingsForUser", {
      userId: ctx.actingUserId,
    })) as { exploitFraction: number | null } | null;
    const v = r?.exploitFraction;
    if (v == null || !Number.isFinite(v)) return DEFAULT_EXPLOIT_FRACTION;
    return Math.max(0, Math.min(1, v));
  } catch (err) {
    log.warn("runSettingsForUser failed; falling back to default", { err });
    return DEFAULT_EXPLOIT_FRACTION;
  }
}

async function fetchBucketStats(): Promise<BucketStats[]> {
  const rows = (await convexClient().query(
    "experiments:bucketStats",
    {}
  )) as Array<{ bucket: Bucket; alpha: number; beta: number; n: number }>;
  return rows.map((r) => ({
    bucket: r.bucket,
    alpha: r.alpha,
    beta: r.beta,
  }));
}

async function sampleNearMissBuckets(
  slots: number,
  nichePool: string[],
): Promise<Bucket[]> {
  if (slots <= 0) return [];
  const refines = (await convexClient().query("experiments:byStatus", {
    status: "refine",
  })) as Array<{ bucket: Bucket }>;
  if (refines.length === 0) return sampleFarBuckets(slots, nichePool);
  const out: Bucket[] = [];
  for (let i = 0; i < slots; i++) {
    const seed = refines[Math.floor(Math.random() * refines.length)]!;
    out.push(mutateBucket(seed.bucket));
  }
  return out;
}

function sampleFarBuckets(slots: number, nichePool: string[]): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < slots; i++) {
    out.push({
      niche: pick(nichePool),
      category: pick(CATEGORIES),
      priceTier: pick(PRICE_TIERS),
      channel: pick(CHANNELS),
    });
  }
  return out;
}

function mutateBucket(b: Bucket): Bucket {
  // Mutate exactly one dimension. Cheap exploration of the local neighborhood.
  const dim = Math.floor(Math.random() * 3) + 1;
  return {
    niche: b.niche,
    category: dim === 1 ? pick(CATEGORIES) : b.category,
    priceTier: dim === 2 ? pick(PRICE_TIERS) : b.priceTier,
    channel: dim === 3 ? pick(CHANNELS) : b.channel,
  };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function llmGenerate(
  bucket: Bucket,
  mode: "exploit" | "explore_near" | "explore_far",
  args: ProposeArgs,
  niaPriors: string,
): Promise<Hypothesis> {
  const prompt = render(proposeHypothesis, {
    generation: args.generation,
    bucket,
    lessons: args.lessons,
    liveTenants: args.liveTenants.map((t) => ({
      subdomain: t.subdomain,
      hypothesisId: t.hypothesisId,
      productTitle: t.productSource.originalTitle,
    })),
    modeHint: mode,
    niaPriors,
  });

  const result = await generateJson({
    prompt,
    schema: HypothesisSchema,
    maxTokens: 2048,
  });

  // The LLM does not own id/generation/parentId; nor productSource/
  // adCreativeStorageIds (those are filled by the scout + image-gen steps
  // downstream — P8.6 / P8.8). Overwrite to defaults.
  return {
    ...result,
    id: ulid(),
    generation: args.generation,
    parentId: result.parentId ?? null,
    productSource: null,
    adCreativeStorageIds: [],
  };
}
