import type { JsonSpec } from "./types.js";

/** Pure. Pretty-prints the payload. */
export function generateJson(spec: JsonSpec): string {
  return JSON.stringify(spec.payload, null, 2) + "\n";
}
