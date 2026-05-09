import Exa from "exa-js";
import { getKey } from "../run-context.js";

const clients = new Map<string, Exa>();
function client(): Exa {
  const key = getKey("exa");
  let c = clients.get(key);
  if (!c) {
    c = new Exa(key);
    clients.set(key, c);
  }
  return c;
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
