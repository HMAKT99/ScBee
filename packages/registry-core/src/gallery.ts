import { safeFetchJson, type FetchOptions } from "./safeFetch.js";

export interface Collection { id: string; title: string; blurb: string; topic: string; /** Fixed extra GitHub search terms (never user input), to keep a broad topic on-theme. */ extra?: string }

/** Curated by rule, not by hand: the newest repos with these GitHub topics. */
export const COLLECTIONS: Collection[] = [
  { id: "mcp-servers", title: "New MCP servers", blurb: "The newest repositories tagged mcp-server, scored for launch readiness.", topic: "mcp-server" },
  { id: "ai-agents", title: "New AI agent projects", blurb: "The newest repositories tagged ai-agents, scored for launch readiness.", topic: "ai-agents" },
  { id: "agent-skills", title: "New agent skills", blurb: "The newest repositories tagged agent-skills, scored for launch readiness.", topic: "agent-skills" },
  { id: "a2a", title: "New A2A agents", blurb: "The newest repositories tagged a2a, scored for launch readiness.", topic: "a2a" },
  { id: "reverse-engineering", title: "New reverse-engineering agent tools", blurb: "The newest repositories tagged reverse-engineering that mention MCP or agent skills, scored for launch readiness. Not affiliated with any tool listed.", topic: "reverse-engineering", extra: "mcp in:name,description,topics" },
  { id: "claude-code", title: "New Claude Code projects", blurb: "The newest repositories tagged claude-code, scored for launch readiness.", topic: "claude-code" },
];

const GH = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

/** Newest repos for a topic created in the last `days`, via GitHub's search API (token strongly recommended). */
export async function searchNewRepos(c: Collection, days: number, limit: number, opts: FetchOptions = {}, token?: string, now = Date.now()): Promise<{ owner: string; repo: string }[]> {
  const since = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`topic:${c.topic} created:>${since} stars:>=1${c.extra ? ` ${c.extra}` : ""}`);
  const j = (await safeFetchJson(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${Math.min(Math.max(limit, 1), 30)}`, {
    ...opts, maxBytes: 1024 * 1024,
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }).catch(() => null)) as { items?: { full_name?: string; fork?: boolean; archived?: boolean }[] } | null;
  return (j?.items ?? []).filter((i) => typeof i.full_name === "string" && GH.test(i.full_name) && !i.fork && !i.archived)
    .map((i) => { const [owner, repo] = i.full_name!.split("/"); return { owner: owner!.toLowerCase(), repo: repo!.toLowerCase() }; });
}
