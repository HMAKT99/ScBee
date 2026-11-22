import { safeFetchText, safeRequest, UnsafeUrlError, type FetchOptions } from "./safeFetch.js";

/**
 * The index: public entries from the official MCP Registry (https://registry.modelcontextprotocol.io), which invites
 * aggregators to "persist the data in their own data store" and dedicates the metadata to the public domain (CC0).
 * Entries are stored apart from verified agents and are never counted as agents or owners.
 *
 * ScBeeBot's manners: robots.txt is respected; each host gets at most one visit a day (a few requests: robots.txt,
 * then the public agent card and/or the MCP tool list); metadata only, never a tool call; anything that asks for a
 * login is left alone; errors back off.
 */

export const REGISTRY_BASE = "https://registry.modelcontextprotocol.io";
export const BOT_NAME = "ScBeeBot";
export const botUserAgent = (base: string) => `${BOT_NAME} (+${base.replace(/\/$/, "")}/bot)`;

export interface IndexedEntry {
  /** The registry's server name, for example io.github.owner/repo. */
  key: string;
  title: string | null;
  description: string;
  version: string;
  repo: string | null;
  website: string | null;
  remote: string | null;
  pkg: string | null;
  status: "active" | "deprecated" | "deleted";
  updatedAt: string | null;
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g;
/** Third-party text: control and direction characters removed, whitespace folded, length capped. Still untrusted. */
export const cleanText = (s: unknown, max: number): string => (typeof s === "string" ? s.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
const https = (u: unknown): string | null => {
  if (typeof u !== "string") return null;
  try { const x = new URL(u); return x.protocol === "https:" && !x.username && !x.password && x.href.length <= 300 ? x.href : null; } catch { return null; }
};
const githubRepo = (u: unknown): string | null => {
  const h = https(u);
  const m = h?.match(/^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/);
  return m ? `github.com/${m[1]}/${m[2]}` : null;
};

/** One page of the registry's list endpoint, keeping only each server's latest version. */
export function parseRegistryPage(json: unknown): { entries: IndexedEntry[]; nextCursor: string | null } {
  const j = json as { servers?: unknown[]; metadata?: { nextCursor?: unknown } } | null;
  const out: IndexedEntry[] = [];
  for (const item of Array.isArray(j?.servers) ? j!.servers : []) {
    const it = item as { server?: Record<string, any>; _meta?: Record<string, any> };
    const s = it.server ?? (item as Record<string, any>);
    const meta = it._meta?.["io.modelcontextprotocol.registry/official"] ?? {};
    if (meta.isLatest === false) continue;
    const key = cleanText(s?.name, 200);
    if (!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._/-]+$/.test(key)) continue;
    const status = meta.status === "deleted" ? "deleted" : meta.status === "deprecated" ? "deprecated" : "active";
    const remote = (Array.isArray(s.remotes) ? s.remotes : []).map((r: any) => (r?.type === "streamable-http" || r?.type === "sse" ? https(r?.url) : null)).find(Boolean) ?? null;
    const p0 = Array.isArray(s.packages) ? s.packages[0] : null;
    const pkg = p0 && typeof p0.identifier === "string" ? cleanText(`${cleanText(p0.registryType, 20) || "package"}:${p0.identifier}`, 160) : null;
    out.push({
      key,
      title: cleanText(s.title, 100) || null,
      description: cleanText(s.description, 300),
      version: cleanText(s.version, 40),
      repo: githubRepo(s.repository?.url),
      website: https(s.websiteUrl),
      remote,
      pkg,
      status,
      updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : null,
    });
  }
  const nc = j?.metadata?.nextCursor;
  return { entries: out, nextCursor: typeof nc === "string" && nc ? nc : null };
}

/** GET one page from the registry. `updatedSince` (RFC 3339) asks only for what changed, including deleted servers. */
export async function fetchRegistryPage(base: string, q: { cursor?: string | null; updatedSince?: string | null }, opts: FetchOptions, ua: string) {
  const u = new URL("/v0.1/servers", REGISTRY_BASE);
  u.searchParams.set("limit", "100");
  if (q.cursor) u.searchParams.set("cursor", q.cursor);
  if (q.updatedSince) { u.searchParams.set("updated_since", q.updatedSince); u.searchParams.set("include_deleted", "true"); }
  const r = await safeFetchText(u.toString(), { ...opts, maxBytes: 4 * 1024 * 1024, timeoutMs: 8000, headers: { "user-agent": ua, accept: "application/json", "accept-encoding": "identity", ...(opts.headers ?? {}) } });
  if (r.status !== 200) throw new UnsafeUrlError(`registry answered ${r.status}`);
  return parseRegistryPage(JSON.parse(r.body));
}

/**
 * Whether robots.txt lets `ua` fetch `path`: the group naming the bot wins over `*`; the longest matching rule wins,
 * Allow over Disallow on a tie. `*` and `$` in rules are honoured.
 */
export function botMayFetch(txt: string, ua: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; pat: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1]!.toLowerCase(), v = m[2]!.trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else if ((k === "allow" || k === "disallow") && cur) {
      lastWasAgent = false;
      if (v || k === "allow") cur.rules.push({ allow: k === "allow", pat: v });
    } else lastWasAgent = false;
  }
  const me = ua.toLowerCase();
  const group = groups.find((g) => g.agents.some((a) => a !== "*" && me.includes(a))) ?? groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (!r.pat) continue;
    const re = new RegExp("^" + r.pat.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$"));
    if (re.test(path) && (!best || r.pat.length > best.len || (r.pat.length === best.len && r.allow))) best = { allow: r.allow, len: r.pat.length };
  }
  return best ? best.allow : true;
}

export interface ProbeResult {
  /** "ok", "robots" (disallowed), "auth" (asks for a login: left alone), "none" (nothing to read), "error". */
  outcome: "ok" | "robots" | "auth" | "none" | "error";
  tools: { name: string; description: string }[];
  card: { name: string; description: string; skills: string[] } | null;
  requests: number;
}

const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
/** A JSON-RPC answer from either a JSON body or a Server-Sent Events body. */
export function rpcResult(body: string, id: number): any {
  const tryOne = (s: string) => { try { const j = JSON.parse(s); return (Array.isArray(j) ? j : [j]).find((m) => m?.id === id) ?? null; } catch { return null; } };
  const direct = tryOne(body);
  if (direct) return direct;
  for (const line of body.split(/\r?\n/)) if (line.startsWith("data:")) { const m = tryOne(line.slice(5).trim()); if (m) return m; }
  return null;
}

/**
 * One visit to one host: robots.txt, then (if allowed) the public agent card on the website and the tool list of the
 * remote MCP endpoint. Never calls a tool. Stops at the first sign of authentication (401/403) or an error.
 */
export async function probeEntry(e: Pick<IndexedEntry, "website" | "remote">, opts: FetchOptions, ua: string): Promise<ProbeResult> {
  const res: ProbeResult = { outcome: "none", tools: [], card: null, requests: 0 };
  const target = e.remote ?? e.website;
  if (!target) return res;
  const origin = new URL(target).origin;
  const get = (u: string) => { res.requests++; return safeFetchText(u, { ...opts, timeoutMs: 3000, maxBytes: 128 * 1024, maxRedirects: 1, headers: { "user-agent": ua, accept: "application/json, text/plain" } }); };
  let robots = "";
  try {
    const r = await get(`${origin}/robots.txt`);
    if (r.status >= 500) { res.outcome = "error"; return res; }
    if (r.status === 200) robots = r.body;
  } catch { res.outcome = "error"; return res; }
  const allowed = (u: string) => botMayFetch(robots, BOT_NAME, new URL(u).pathname);

  if (e.website && new URL(e.website).origin === origin) {
    const cardUrl = `${origin}/.well-known/agent-card.json`;
    if (allowed(cardUrl)) {
      try {
        const r = await get(cardUrl);
        if (r.status === 401 || r.status === 403) { res.outcome = "auth"; return res; }
        if (r.status === 200) {
          const j = JSON.parse(r.body) as { name?: unknown; description?: unknown; skills?: unknown };
          res.card = { name: cleanText(j.name, 100), description: cleanText(j.description, 300), skills: (Array.isArray(j.skills) ? j.skills : []).slice(0, 20).map((s: any) => cleanText(s?.name ?? s, 60)).filter(Boolean) };
        }
      } catch { /* no card */ }
    } else res.outcome = "robots";
  }

  if (e.remote) {
    if (!allowed(e.remote)) { res.outcome = res.card ? "ok" : "robots"; return res; }
    const post = async (body: unknown, session?: string) => {
      res.requests++;
      return safeRequest(e.remote!, { method: "POST", body: JSON.stringify(body), headers: { "user-agent": ua, ...MCP_HEADERS, ...(session ? { "mcp-session-id": session } : {}) }, timeoutMs: 4000, maxBytes: 256 * 1024, ...(opts.lookup ? { lookup: opts.lookup } : {}), ...(opts.requester ? { requester: opts.requester } : {}) });
    };
    try {
      const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: BOT_NAME, version: "1.0" } } });
      if (init.status === 401 || init.status === 403 || init.headers["www-authenticate"]) { res.outcome = "auth"; return res; }
      if (init.status !== 200 || !rpcResult(init.body, 1)?.result) { res.outcome = res.card ? "ok" : "error"; return res; }
      const sid = init.headers["mcp-session-id"];
      const session = typeof sid === "string" && /^[\x21-\x7e]{1,200}$/.test(sid) ? sid : undefined;
      await post({ jsonrpc: "2.0", method: "notifications/initialized" }, session);
      const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session);
      if (list.status === 401 || list.status === 403) { res.outcome = "auth"; return res; }
      const tools = rpcResult(list.body, 2)?.result?.tools;
      res.tools = (Array.isArray(tools) ? tools : []).slice(0, 50).map((t: any) => ({ name: cleanText(t?.name, 80), description: cleanText(t?.description, 200) })).filter((t) => t.name);
      res.outcome = "ok";
    } catch { res.outcome = res.card ? "ok" : "error"; }
    return res;
  }
  if (res.outcome === "none" && res.card) res.outcome = "ok";
  return res;
}
