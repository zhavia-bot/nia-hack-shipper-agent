import {
  generateDeliverable as generateBytes,
  type GeneratedDeliverable,
} from "@autoresearch/deliverables";
import type { Deliverable } from "@autoresearch/schemas";
import { env } from "../env.js";

/**
 * Run the @autoresearch/deliverables generator and persist the result to
 * Convex File Storage. Returns the storage handle the tenant row will
 * reference plus a public URL the post-purchase delivery route can serve.
 */
export async function generateAndPersist(args: {
  deliverable: Deliverable;
  baseFilename: string;
}): Promise<{
  storageId: string;
  permanentUrl: string;
  filename: string;
  contentType: string;
}> {
  const generated: GeneratedDeliverable = await generateBytes({
    kind: args.deliverable.kind,
    spec: args.deliverable.spec,
    baseFilename: args.baseFilename,
  });

  const upload = await fetchUploadUrl();
  const putRes = await fetch(upload.uploadUrl, {
    method: "PUT",
    body: new Uint8Array(generated.bytes),
    headers: { "Content-Type": generated.contentType },
  });
  if (!putRes.ok) {
    throw new Error(`Convex upload failed: ${putRes.status}`);
  }
  const { storageId } = (await putRes.json()) as { storageId: string };
  const permanentUrl = await getStorageUrl(storageId);
  return {
    storageId,
    permanentUrl,
    filename: generated.filename,
    contentType: generated.contentType,
  };
}

async function fetchUploadUrl(): Promise<{ uploadUrl: string }> {
  const res = await fetch(`${env().CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "storage:generateUploadUrl",
      args: { token: env().CONVEX_AGENT_TOKEN },
      format: "json",
    }),
  });
  if (!res.ok) throw new Error(`generateUploadUrl failed: ${res.status}`);
  const body = (await res.json()) as { value: string };
  return { uploadUrl: body.value };
}

async function getStorageUrl(storageId: string): Promise<string> {
  const res = await fetch(`${env().CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "storage:getUrl",
      args: { token: env().CONVEX_AGENT_TOKEN, storageId },
      format: "json",
    }),
  });
  if (!res.ok) throw new Error(`storage:getUrl failed: ${res.status}`);
  const body = (await res.json()) as { value: string };
  return body.value;
}
