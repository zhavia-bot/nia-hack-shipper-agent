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

const log = createLogger("parent-agent.propose");

export interface ProposeArgs {
  generation: number;
  batchSize: number;
  lessons: Lesson[];
  liveTenants: Tenant[];
}

const EXPLOIT_FRACTION = 0.7;
const EXPLORE_NEAR_FRACTION = 0.2;
// Remainder is explore-far (0.1).

const CATEGORIES = PhysicalCategorySchema.options;
const PRICE_TIERS = PriceTierSchema.options;
const CHANNELS = ChannelSchema.options;

// P8.1 dev fallback ONLY — replaced by Reacher-derived live niches in P8.4.
// One entry, not ten, so it's obvious when the live signal isn't wired.
const DEV_FALLBACK_NICHES = ["LED desk gadget"];

/**
 * Propose a batch of hypotheses for one generation. 70% Thompson-sampled
 * exploit slots, 20% near-explore (mutations of recent `refine` results),
 * 10% far-explore (random buckets). Each slot is realized by an LLM call
 * that returns a schema-valid Hypothesis.
 */
export async function propose(args: ProposeArgs): Promise<Hypothesis[]> {
  const exploitSlots = Math.round(args.batchSize * EXPLOIT_FRACTION);
  const exploreNearSlots = Math.round(args.batchSize * EXPLORE_NEAR_FRACTION);
  const exploreFarSlots = Math.max(
    0,
    args.batchSize - exploitSlots - exploreNearSlots
  );

  const bucketStats = await fetchBucketStats();
  const exploitBuckets = thompsonSampleBuckets(bucketStats, exploitSlots);
  const exploreNearBuckets = await sampleNearMissBuckets(exploreNearSlots);
  const exploreFarBuckets = sampleFarBuckets(exploreFarSlots);

  log.info("proposing batch", {
    generation: args.generation,
    exploitSlots,
    exploreNearSlots,
    exploreFarSlots,
    bucketsAvailable: bucketStats.length,
  });

  const seeds: { bucket: Bucket; mode: "exploit" | "explore_near" | "explore_far" }[] =
    [
      ...exploitBuckets.map((b) => ({ bucket: b, mode: "exploit" as const })),
      ...exploreNearBuckets.map((b) => ({ bucket: b, mode: "explore_near" as const })),
      ...exploreFarBuckets.map((b) => ({ bucket: b, mode: "explore_far" as const })),
    ];

  const hypotheses = await Promise.all(
    seeds.map((s) =>
      llmGenerate(s.bucket, s.mode, args).catch((err) => {
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

async function sampleNearMissBuckets(slots: number): Promise<Bucket[]> {
  if (slots <= 0) return [];
  const refines = (await convexClient().query("experiments:byStatus", {
    status: "refine",
  })) as Array<{ bucket: Bucket }>;
  if (refines.length === 0) return sampleFarBuckets(slots);
  const out: Bucket[] = [];
  for (let i = 0; i < slots; i++) {
    const seed = refines[Math.floor(Math.random() * refines.length)]!;
    out.push(mutateBucket(seed.bucket));
  }
  return out;
}

function sampleFarBuckets(slots: number): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < slots; i++) {
    out.push({
      niche: pick(DEV_FALLBACK_NICHES),
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
  args: ProposeArgs
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
