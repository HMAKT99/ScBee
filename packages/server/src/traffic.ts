import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Who is arriving: every request is put in one class, and only per-day totals are kept (see store.recordTraffic).
 * The user-agent lists live here and nowhere else. Matching is on the user-agent string, which anyone can set, so these
 * are good estimates, not proof. Cached pages served by the edge never reach the server, so every count is a floor.
 */
export type TrafficClass = "human" | "ai_crawler" | "agent_client" | "scbee_self" | "unknown";
export const TRAFFIC_CLASSES: TrafficClass[] = ["human", "ai_crawler", "agent_client", "scbee_self", "unknown"];

/** AI companies' crawlers and fetchers (training, search and live answers). Google-Extended and Applebot-Extended are robots.txt tokens, not user agents: they crawl as Googlebot and Applebot, which stay in "unknown". */
export const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "Claude-Web",
  "PerplexityBot", "Perplexity-User", "Google-CloudVertexBot", "Gemini-Deep-Research", "Bytespider", "CCBot", "Amazonbot",
  "meta-externalagent", "meta-externalfetcher", "FacebookBot", "cohere-ai", "cohere-training-data-crawler", "DuckAssistBot",
  "MistralAI-User", "YouBot", "PetalBot", "Diffbot", "AI2Bot", "Timpibot", "ImagesiftBot", "Kangaroo Bot", "PanguBot",
];

/** Coding agents, agent harnesses and MCP clients, as they name themselves. */
export const AGENT_CLIENTS = [
  "claude-code", "claude-cli", "Cursor", "Windsurf", "Codex", "codex_cli", "Cline", "Roo-Code", "RooCode", "Kilo-Code", "Goose", "Continue",
  "Zed", "Copilot", "OpenHands", "Aider", "opencode", "Amp", "mcp-remote", "modelcontextprotocol", "MCP Inspector", "mcp-client", "openai-mcp",
  "Smithery", "scbee-mcp", "scbee-cli", "scbee-action", "LangChain", "LlamaIndex", "Mastra", "AutoGen", "CrewAI",
];

/** ScBee's own traffic: its crawler, the uptime check, Vercel's cron. */
const SELF = /^ScBeeBot\b|scbee-uptime|vercel-cron/i;
const GENERIC_BOT = /bot|crawl|spider|slurp|preview|headless|curl|wget|python|go-http|httpclient|java\/|okhttp|scan|monitor|fetch|axios|undici|node-fetch|libwww|ruby|php/i;
const BROWSER = /^Mozilla\/5\.0 \(.+\) .*(Gecko|AppleWebKit)/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const AI_RE = new RegExp(`(?:^|[^a-z])(?:${AI_CRAWLERS.map(escape).join("|")})(?:$|[^a-z])`, "i");
const AGENT_RE = new RegExp(`(?:^|[^a-z])(?:${AGENT_CLIENTS.map(escape).join("|")})(?:$|[^a-z])`, "i");

/** Marks a request made inside this process (the hosted MCP server calling the site's own API), so it is not counted twice. */
export const INTERNAL = Symbol("scbee-internal");

export interface Seen { path: string; userAgent: string; method: string; internal: boolean; markdown: boolean; via: string | null }

export function classify(s: Seen): TrafficClass {
  // the operator's own report and Vercel's cron are ScBee looking at itself, not visitors
  if (s.internal || SELF.test(s.userAgent) || s.path.startsWith("/api/admin/") || s.path.startsWith("/api/cron/")) return "scbee_self";
  if (AI_RE.test(s.userAgent)) return "ai_crawler";
  if (s.path === "/mcp" || AGENT_RE.test(s.userAgent) || s.via) return "agent_client";
  if (!s.userAgent) return "unknown";
  if (GENERIC_BOT.test(s.userAgent)) return "unknown";
  // A browser asking for the Markdown twin is almost always an agent using a browser's user agent.
  if (BROWSER.test(s.userAgent)) return s.markdown ? "agent_client" : "human";
  return "unknown";
}

/** A short, fixed set of page groups, so the totals table stays small and never holds a path. */
export function pathGroup(p: string): string {
  if (p === "/") return "home";
  if (p === "/mcp") return "mcp";
  if (p.startsWith("/api/")) return "api";
  if (p.startsWith("/for/")) return "need";
  if (p.startsWith("/github.com/") || p.startsWith("/web/")) return "score";
  if (p.startsWith("/a/")) return "agent";
  if (p.startsWith("/badge/")) return "badge";
  if (p.startsWith("/r/")) return "handoff_link";
  if (p.startsWith("/feeds/") || p.endsWith(".atom")) return "feed";
  if (p.startsWith("/skill") || p.startsWith("/schemas/")) return "skill";
  if (p === "/llms.txt" || p === "/robots.txt" || p === "/sitemap.xml" || p.startsWith("/.well-known/") || p === "/openapi.json" || p.endsWith(".md")) return "discovery";
  if (p.startsWith("/gallery") || p.startsWith("/radar") || p.startsWith("/pair/") || p.startsWith("/fix/") || p.startsWith("/with/")) return "content";
  if (["/agents", "/board", "/find", "/feed", "/trust", "/report", "/manage", "/privacy", "/terms", "/optout", "/bot"].includes(p)) return "page";
  return "other";
}

/** Requests not worth counting: static assets and CORS preflights. */
export const isAsset = (p: string, method: string) =>
  method === "OPTIONS" || method === "HEAD" || p === "/style.css" || p === "/app.js" || p.startsWith("/favicon") || p === "/apple-touch-icon.png" || p.startsWith("/fonts/") || p === "/manifest.webmanifest";

/**
 * A caller id that is useless outside one day: sha256 of that day's random salt, the address and the user agent.
 * The salt is deleted after the day ends, so the hash cannot be reversed, and different days cannot be joined.
 */
export const callerHash = (salt: string, ip: string, userAgent: string) =>
  createHash("sha256").update(`${salt}\n${ip}\n${userAgent}`).digest("hex").slice(0, 32);

/** The MCP tool names in a JSON-RPC body (for calls per tool). Only names shaped like ScBee's tools are kept. */
export function toolNames(body: unknown): string[] {
  const msgs = Array.isArray(body) ? body : [body];
  const out: string[] = [];
  for (const m of msgs) {
    const x = m as { method?: unknown; params?: { name?: unknown } } | null;
    if (x?.method === "tools/call" && typeof x.params?.name === "string" && /^scbee_[a-z_]{1,40}$/.test(x.params.name)) out.push(x.params.name);
  }
  return out.slice(0, 10);
}

export const seenFrom = (req: IncomingMessage, path: string, search: URLSearchParams): Seen => {
  const accept = String(req.headers.accept ?? "");
  return {
    path,
    method: req.method ?? "GET",
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
    internal: (req as unknown as Record<symbol, unknown>)[INTERNAL] === true,
    markdown: search.get("format") === "md" || (accept.includes("text/markdown") && !accept.includes("text/html")),
    via: search.get("via"),
  };
};
