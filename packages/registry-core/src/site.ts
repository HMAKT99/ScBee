import { safeFetchJson, safeFetchText, UnsafeUrlError, assertPublicUrl, type FetchOptions } from "./safeFetch.js";
import { parseCard } from "./schema.js";
import type { ScoreComponent, ScoreItem, ScoreResult } from "./score.js";

export const SITE_SCORE_VERSION = "site-1";

export interface SiteSignals {
  host: string;
  title: string | null;
  description: string | null;
  hasSocialImage: boolean;
  hasViewport: boolean;
  hasLang: boolean;
  agentCard: { found: boolean; skills: number };
  llmsTxt: boolean;
  mcpManifest: boolean;
  aiPlugin: boolean;
  robotsOk: boolean;
  securityTxt: boolean;
  listedOnScbee: boolean;
  verifiedOnScbee: boolean;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
// eslint-disable-next-line no-control-regex
const clean = (s: string, n: number) => decode(s).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

function metaContent(html: string, key: string, attr: "name" | "property"): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const k = tag.match(new RegExp(`${attr}\\s*=\\s*["']${key}["']`, "i"));
    if (!k) continue;
    const c = tag.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i);
    const v = c?.[1] ?? c?.[2];
    if (v) return v;
  }
  return null;
}

/** Read what a visitor (or agent) would see in the page head. Only extracts; never stores raw HTML. */
export function analyseHtml(html: string) {
  const head = html.replace(/<!--[\s\S]*?-->/g, "").slice(0, 64 * 1024);
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const description = metaContent(head, "description", "name") ?? metaContent(head, "og:description", "property");
  return {
    title: title ? clean(title, 120) || null : null,
    description: description ? clean(description, 300) || null : null,
    hasSocialImage: !!(metaContent(head, "og:image", "property") ?? metaContent(head, "twitter:image", "name")),
    hasViewport: !!metaContent(head, "viewport", "name"),
    hasLang: /<html\b[^>]*\blang\s*=/i.test(head),
  };
}

/** Minimal robots.txt check for our user agent: does the most specific matching group disallow "/"? */
export function robotsAllows(robots: string | null, path = "/", agent = "scbee"): boolean {
  if (!robots) return true;
  type Group = { agents: string[]; disallow: string[]; allow: string[] };
  let group: Group | undefined;
  const groups: Group[] = [];
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1]!.toLowerCase(), v = m[2]!.trim();
    if (k === "user-agent") {
      if (!lastWasAgent || !group) { group = { agents: [], disallow: [], allow: [] }; groups.push(group); }
      group.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (group && k === "disallow") group.disallow.push(v);
      if (group && k === "allow") group.allow.push(v);
    }
  }
  const g = groups.find((x) => x.agents.includes(agent)) ?? groups.find((x) => x.agents.includes("*"));
  if (!g) return true;
  const longest = (rules: string[]) => rules.filter((r) => r !== "" && path.startsWith(r.replace(/\*$/, ""))).reduce((n, r) => Math.max(n, r.length), -1);
  return longest(g.allow) >= longest(g.disallow);
}

export class SiteError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 502 = 502) { super(message); }
}

const WELL_KNOWN_MCP = ["/.well-known/mcp.json", "/.well-known/mcp/server.json"]; // best-effort conventions; there is no single standard yet

/** Public hostnames only (no IPs, no ports, no credentials). */
export function parseHost(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https:\/\//, "").replace(/\/.*$/, "");
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s) ? s : null;
}

export async function fetchSiteSignals(host: string, scbee: { listed: boolean; verified: boolean }, opts: FetchOptions = {}): Promise<SiteSignals> {
  const origin = `https://${host}`;
  try { await assertPublicUrl(origin, opts.lookup); } catch (e) {
    throw new SiteError(e instanceof UnsafeUrlError ? e.message : "could not check this site", 400);
  }
  const get = async (path: string, maxBytes = 128 * 1024) => {
    try {
      const r = await safeFetchText(origin + path, { ...opts, maxBytes });
      return r.status === 200 ? r.body : null;
    } catch { return null; }
  };
  const robots = await get("/robots.txt", 64 * 1024);
  if (!robotsAllows(robots, "/")) throw new SiteError("this site's robots.txt asks automated checkers not to visit, so ScBee does not read it", 403);
  const html = await get("/");
  if (html === null) throw new SiteError("could not load the homepage over https", 404);
  const page = analyseHtml(html);
  const json = async (path: string) => (await safeFetchJson(origin + path, opts).catch(() => null)) as unknown;
  const [card, llms, plugin, sec, ...mcp] = await Promise.all([
    json("/.well-known/agent-card.json"), get("/llms.txt", 64 * 1024), json("/.well-known/ai-plugin.json"), get("/.well-known/security.txt", 16 * 1024),
    ...WELL_KNOWN_MCP.map(json),
  ]);
  const parsed = card ? parseCard(card) : null;
  return {
    host, ...page,
    agentCard: { found: !!parsed?.ok, skills: parsed?.ok ? parsed.card.skills.length : 0 },
    llmsTxt: !!llms && llms.trim().length > 20,
    mcpManifest: mcp.some((m) => m && typeof m === "object"),
    aiPlugin: !!plugin && typeof plugin === "object",
    robotsOk: robots !== null,
    securityTxt: !!sec && /contact\s*:/i.test(sec),
    listedOnScbee: scbee.listed, verifiedOnScbee: scbee.verified,
  };
}

const it = (label: string, ok: boolean, max: number, good: string, bad: string, fix: string): ScoreItem =>
  ok ? { label, points: max, max, reason: good } : { label, points: 0, max, reason: bad, fix };
const sum = (i: ScoreItem[]) => i.reduce((n, x) => n + x.points, 0);

/** Deterministic readiness of a website or agent endpoint for humans and agents. Same result shape as repos. */
export function scoreSite(s: SiteSignals): ScoreResult {
  const clarity = [
    it("Title", !!s.title, 8, "The page has a title.", "No page title.", "Add a <title> that says what the site is."),
    it("Description", (s.description?.length ?? 0) >= 30, 10, "A meta description explains the site.", "No useful meta description.", "Add a meta description: who it is for and what it does, in one or two sentences."),
    it("Share preview", s.hasSocialImage, 6, "Has a social preview image.", "No social preview image.", "Add an og:image so links to your site look good when shared."),
    it("Mobile friendly", s.hasViewport && s.hasLang, 6, "Declares a viewport and language.", "Missing a viewport or language declaration.", 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and <html lang="en">.'),
  ];
  const agents = [
    it("Agent card", s.agentCard.found, 15, "Serves an agent card other agents can read.", "No agent card.", "Serve /.well-known/agent-card.json with your name, description and skills."),
    it("llms.txt", s.llmsTxt, 10, "Has an llms.txt for language models.", "No llms.txt.", "Add /llms.txt: a short, plain description and links to your key pages."),
    it("MCP manifest", s.mcpManifest, 10, "Publishes an MCP server manifest.", "No MCP manifest found.", "If you offer an MCP server, publish its manifest at /.well-known/mcp.json."),
    it("Plugin manifest", s.aiPlugin, 5, "Publishes an ai-plugin.json.", "No ai-plugin.json.", "Optional: publish /.well-known/ai-plugin.json if you expose an API to assistants."),
  ];
  const trust = [
    it("robots.txt", s.robotsOk, 5, "Has a robots.txt.", "No robots.txt.", "Add a robots.txt so crawlers and agents know the rules."),
    it("Security contact", s.securityTxt, 5, "Publishes a security contact.", "No security.txt.", "Add /.well-known/security.txt with a Contact: line."),
    { label: "Served over https", points: 5, max: 5, reason: "Loads over https." },
  ];
  const network = [
    it("Skills listed", s.agentCard.skills > 0, 8, `The agent card lists ${s.agentCard.skills} skill${s.agentCard.skills === 1 ? "" : "s"}.`, "No skills listed for other agents to discover.", "List your skills in the agent card so other agents know when to use you."),
    s.verifiedOnScbee ? { label: "Listed on ScBee", points: 7, max: 7, reason: "Registered and verified on ScBee." }
      : { label: "Listed on ScBee", points: s.listedOnScbee ? 2 : 0, max: 7, reason: s.listedOnScbee ? "Registered, but not yet verified." : "Not yet on ScBee.", fix: s.listedOnScbee ? "Verify ownership so other agents can connect with you." : "Register it so other agents can find and connect with it." },
  ];
  const mk = (id: ScoreComponent["id"], title: string, items: ScoreItem[], max: number): ScoreComponent => ({ id, title, score: sum(items), max, items });
  const components = [mk("clarity", "Clarity", clarity, 30), mk("friction", "Agent-friendliness", agents, 40), mk("trust", "Trust", trust, 15), mk("network", "Network fit", network, 15)];
  return { version: SITE_SCORE_VERSION, total: components.reduce((n, c) => n + c.score, 0), components };
}
