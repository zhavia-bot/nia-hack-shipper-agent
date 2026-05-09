import JSZip from "jszip";
import type { PackSpec } from "./types.js";

const EXTENSION_BY_KIND: Record<string, string> = {
  md: "md",
  json: "json",
  txt: "txt",
  csv: "csv",
};

/** Pure async — produces a zip archive of all files in the pack. */
export async function generateZip(spec: PackSpec): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of spec.files) {
    const ext = EXTENSION_BY_KIND[file.kind] ?? "txt";
    const name = file.name.endsWith(`.${ext}`) ? file.name : `${file.name}.${ext}`;
    zip.file(name, file.content);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
