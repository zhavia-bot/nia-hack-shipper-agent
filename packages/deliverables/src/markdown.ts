import type { MarkdownSpec } from "./types.js";

/** Pure function. Renders a ReportSpec as a Markdown string. */
export function generateMarkdown(spec: MarkdownSpec): string {
  const lines: string[] = [];
  lines.push(`# ${spec.title}`);
  if (spec.subtitle) {
    lines.push("", `_${spec.subtitle}_`);
  }
  for (const section of spec.sections) {
    lines.push("", `## ${section.heading}`);
    if (section.paragraphs) {
      for (const p of section.paragraphs) {
        lines.push("", p);
      }
    }
    if (section.bullets && section.bullets.length > 0) {
      lines.push("");
      for (const b of section.bullets) {
        lines.push(`- ${b}`);
      }
    }
  }
  if (spec.footer) {
    lines.push("", "---", "", spec.footer);
  }
  return lines.join("\n") + "\n";
}
