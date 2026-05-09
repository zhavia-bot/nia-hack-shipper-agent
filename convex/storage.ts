/**
 * Convex File Storage helpers — chosen over R2/Vercel Blob for v1
 * (one less moving part, vendor-lock already accepted). The agent
 * persists provider-returned image URLs (gpt-image-2 expires ~1h)
 * into Convex storage and the storefront serves them post-purchase.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";

/**
 * Returns a one-shot upload URL the caller can PUT bytes to. The
 * resulting `storageId` (returned in the PUT response body as JSON)
 * is what gets recorded onto a tenant or auditLog row.
 */
export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["agent"]);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Resolve a `storageId` to a fetchable URL. Read-only across the
 * trusted-server identities — the storefront's deliver route uses
 * `stripe-webhook` (its server-side identity) to look up the bytes
 * after HMAC token verification.
 */
export const getUrl = query({
  args: { token: v.string(), storageId: v.string() },
  handler: async (ctx, { token, storageId }) => {
    await requireIdentity(token, [
      "agent",
      "stripe-webhook",
      "dashboard",
      "admin",
    ]);
    return await ctx.storage.getUrl(storageId as Id<"_storage">);
  },
});
