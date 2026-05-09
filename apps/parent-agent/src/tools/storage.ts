import { env } from "../env.js";

/**
 * Persist provider-returned URLs (gpt-image-2 expires ~1h, FLUX longer
 * but no SLA) into Convex File Storage. Tenants reference our URL,
 * never the expiring one. Decision: Convex File Storage chosen over R2
 * (simpler, fewer moving parts, vendor-lock-in already accepted).
 *
 * Convex File Storage flow:
 *   1) Get an upload URL via `storage:generateUploadUrl` mutation.
 *   2) PUT the bytes at that URL.
 *   3) The PUT response includes a `storageId` we record on the tenant.
 *   4) Public URL retrieved later via `storage:getUrl(storageId)`.
 */
export async function persistImageToConvex(args: {
  sourceUrl: string;
  contentType: string;
}): Promise<{ storageId: string; permanentUrl: string }> {
  const upload = await fetchUploadUrl();

  const sourceRes = await fetch(args.sourceUrl);
  if (!sourceRes.ok) {
    throw new Error(
      `failed to download source url ${args.sourceUrl}: ${sourceRes.status}`
    );
  }
  const blob = await sourceRes.blob();

  const putRes = await fetch(upload.uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": args.contentType },
  });
  if (!putRes.ok) {
    throw new Error(`Convex upload failed: ${putRes.status}`);
  }
  const { storageId } = (await putRes.json()) as { storageId: string };
  const permanentUrl = await getStorageUrl(storageId);
  return { storageId, permanentUrl };
}

async function fetchUploadUrl(): Promise<{ uploadUrl: string }> {
  const url = `${env().CONVEX_URL}/api/mutation`;
  const res = await fetch(url, {
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
  const url = `${env().CONVEX_URL}/api/query`;
  const res = await fetch(url, {
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
