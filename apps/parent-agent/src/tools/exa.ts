import Exa from "exa-js";
import { env } from "../env.js";

let cached: Exa | null = null;
function client(): Exa {
  if (!cached) cached = new Exa(env().EXA_API_KEY);
  return cached;
}

/**
 * Live web search for "what's true right now" signals — used by children
 * during hypothesis execution when fresh context matters (HN trends,
 * breaking news in a niche, competitor pricing changes).
 */
export const exa = {
  async search(query: string, opts?: { numResults?: number }): Promise<{ url: string; title: string; snippet?: string }[]> {
    const res = await client().searchAndContents(query, {
      numResults: opts?.numResults ?? 10,
      type: "auto",
    });
    return (res.results ?? []).map((r: any) => ({
      url: r.url,
      title: r.title ?? r.url,
      snippet: r.text ?? r.summary,
    }));
  },
};
