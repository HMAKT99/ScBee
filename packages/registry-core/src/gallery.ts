import { safeFetchJson, type FetchOptions } from "./safeFetch.js";

export interface Collection { id: string; title: string; blurb: string; topic: string }

/** Curated by rule, not by hand: the newest repos with these GitHub topics. */
export const COLLECTIONS: Collection[] = [
  { id: "mcp-servers", title: "New MCP servers", blurb: "The newest repositories tagged mcp-server, scored for launch readiness.", topic: "mcp-server" },
  { id: "ai-agents", title: "New AI agent projects", blurb: "The newest repositories tagged ai-agents, scored for launch readiness.", topic: "ai-agents" },
];

const GH = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

/** Newest repos for a topic created in the last `days`, via GitHub's search API (token strongly recommended). */
export async function searchNewRepos(c: Collection, days: number, limit: number, opts: FetchOptions = {}, token?: string, now = Date.now()): Promise<{ owner: string; repo: string }[]> {
  const since = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`topic:${c.topic} created:>${since} stars:>=1`);
  const j = (await safeFetchJson(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${Math.min(Math.max(limit, 1), 30)}`, {
    ...opts, maxBytes: 1024 * 1024,
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }).catch(() => null)) as { items?: { full_name?: string; fork?: boolean; archived?: boolean }[] } | null;
  return (j?.items ?? []).filter((i) => typeof i.full_name === "string" && GH.test(i.full_name) && !i.fork && !i.archived)
    .map((i) => { const [owner, repo] = i.full_name!.split("/"); return { owner: owner!.toLowerCase(), repo: repo!.toLowerCase() }; });
}
