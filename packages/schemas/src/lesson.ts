import { z } from "zod";
import {
  ChannelSchema,
  NicheSchema,
  PhysicalCategorySchema,
  PriceTierSchema,
} from "./common.js";

export const LessonScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bucket"),
    niche: NicheSchema,
    category: PhysicalCategorySchema,
    priceTier: PriceTierSchema,
    channel: ChannelSchema,
  }),
  z.object({ kind: z.literal("global") }),
]);
export type LessonScope = z.infer<typeof LessonScopeSchema>;

export const LessonSchema = z.object({
  generation: z.number().int().nonnegative(),
  scope: LessonScopeSchema,
  pattern: z.string().min(1),
  evidence: z.array(z.string()),
  weight: z.number().min(0).default(1.0),
  createdAt: z.number().int(),
});
export type Lesson = z.infer<typeof LessonSchema>;
