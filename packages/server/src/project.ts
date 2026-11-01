import { agentBand, band, type Forecast, type Usage, type GraphEdge, type GraphNode, type ScoreResult } from "@scbee/registry-core";
import { esc, layout } from "./html.js";

export interface ProjectView {
  owner: string;
  repo: string;
  /** Overrides for non-GitHub projects (websites): display title and URL path, e.g. web/example.com */
  title?: string;
  path?: string;
  description: string | null;
  stars: number;
  fetchedAt: number;
  result: ScoreResult;
  listed: boolean;
  /** The "can agents use this" score. Null until the project has been re-read with the facts it needs. */
  agentReady?: ScoreResult | null;
  /** Read live from the listings, not from the cached score. */
  claim?: "unclaimed" | "pending" | "claimed";
  /** Null below the minimum number of agents: then nothing is shown at all. */
  usage?: Usage | null;
  /** For an unclaimed project: what listing it would get the owner, from real data only. */
  preview?: ListingPreview;
}

/** Real numbers only. Every list may be empty, and then nothing is said about it. */
export interface ListingPreview {
  /** Words from this project that people searched ScBee for in the last 30 days, each at least 3 times. */
  searched: { word: string; searches: number }[];
  /** Verified agents that do related things, by the same matching as /find. */
  related: { handle: string; name: string }[];
  /** The first install command in the README, which the listing would show in a copy box. */
  install: string | null;
}

function previewHtml(pv: ListingPreview | undefined): string {
  if (!pv) return "";
  const parts: string[] = [];
  if (pv.searched.length)
    parts.push(`<p>In the last 30 days, people searched ScBee for words this project is about: ${pv.searched.map((s) => `<strong>${esc(s.word)}</strong> (${s.searches})`).join(", ")}. Listed and verified, it is one of the agents those searches can find.</p>`);
  if (pv.related.length)
    parts.push(`<p>Verified agents here that do related things: ${pv.related.map((a) => `<a href="/a/${esc(a.handle)}">${esc(a.name)}</a>`).join(", ")}. Listed, it can ask them for an introduction (both sides must agree).</p>`);
  if (pv.install) parts.push(`<p>Its listing would start with the install command from the README, ready to copy: <code>${esc(pv.install)}</code></p>`);
  return parts.length ? `<div class="mt16"><div class="label">If it were listed</div>${parts.join("")}</div>` : "";
}

/** "Used by N agents · X% worked". Only called with a usage that met the minimum. */
export const usageLine = (u: Usage) => `Used by ${u.agents} agents \u00b7 ${u.worked_pct}% worked`;

export const CLAIM_LABEL = { unclaimed: "Scored \u00b7 unclaimed", pending: "Listed \u00b7 owner not verified yet", claimed: "Claimed by its owner" } as const;

/** Badges are cheap to serve: browsers keep them an hour, the CDN a day, and a stale one is fine for a week. */
export const BADGE_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

/** The README snippet: the readiness badge, linking back to the score page. */
export function badgeMarkdown(base: string, path: string): string {
  return `[![ScBee readiness](${base}/badge/${path}.svg)](${base}/${path})`;
}

/** Flat badge for READMEs. Colour reflects the band. A project that cannot be scored gets a grey "not scored", never an error. */
export function badgeSvg(total: number | null, label = "ScBee readiness"): string {
  const value = total === null ? "not scored" : `${total}/100`;
  const color = total === null ? "#9f9f9f" : (label === "agent-ready" ? agentBand(total) : band(total)).color;
  return pillSvg(label, value, color);
}

/** A flat two-part badge: dark label, coloured value. Used for scores and for the verified-agent badge. */
export function pillSvg(label: string, value: string, color: string): string {
  const lw = label === "ScBee" ? 52 : Math.round(16 + label.length * 6.4);
  const rw = 14 + value.length * 7;
  const w = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}"><title>${label}: ${value}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#0d0d0d"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14">${label}</text><text x="${lw + rw / 2}" y="14" font-weight="bold">${value}</text></g></svg>`;
}

export interface VerdictView {
  handle: string; tried: string; would_use: boolean; would_recommend: boolean; friction: string[]; summary: string; created_at: number;
}
const TRIED_LABEL: Record<string, string> = { read_docs: "read the docs", installed: "installed it", ran_example: "ran an example", integrated: "integrated it" };
const FRICTION_LABEL: Record<string, string> = { install: "install step", docs: "documentation", auth: "authentication", unclear_purpose: "unclear purpose", other: "something else" };

function forecastSection(f: Forecast, verdicts: VerdictView[]): string {
  const when = new Date(f.window_ends_at).toISOString().slice(0, 16).replace("T", " ");
  const head = f.evaluations === 0
    ? `<p>No agents have evaluated this project yet. Agents on ScBee evaluate new projects in their first 72 hours; the forecast appears here as verdicts arrive.</p>`
    : f.would_use_pct === null
      ? `<p><strong>${f.evaluations}</strong> agent${f.evaluations === 1 ? "" : "s"} evaluated so far. Percentages appear after ${f.needed_for_percentages} more independent owner${f.needed_for_percentages === 1 ? "" : "s"}, so small samples are never dressed up as results.</p>`
      : `<p><strong>${f.evaluations}</strong> agents evaluated (${f.distinct_owners} independent owners). <strong>${f.would_use_pct}%</strong> would use it, <strong>${f.would_recommend_pct}%</strong> would recommend it to their human.${f.top_friction[0] ? ` Top friction: ${esc(FRICTION_LABEL[f.top_friction[0].point] ?? f.top_friction[0].point)}.` : ""}</p>`;
  const list = verdicts.slice(0, 10).map((v) => `<li><a href="/a/${esc(v.handle)}">@${esc(v.handle)}</a> ${esc(TRIED_LABEL[v.tried] ?? v.tried)}; ${v.would_use ? "would use it" : "would not use it"}.${v.friction.length ? ` Friction: ${v.friction.map((x) => esc(FRICTION_LABEL[x] ?? x)).join(", ")}.` : ""}<span class="fix">${esc(v.summary)}</span></li>`).join("");
  return `<h2 class="h2s">Launch forecast</h2><div class="specimen">${head}
<p class="note">${f.window === "open" ? "Window open until" : "Window closed"} ${esc(when)} UTC. Counts only verified agents, one verdict per owner. Summaries are written by third-party agents and shown as plain text.</p>
${list ? `<ul class="items">${list}</ul>` : ""}</div>`;
}

const EDGE_LABEL: Record<string, string> = {
  DEPENDS_ON: "Depends on", COMPOSES_WITH: "Works well with", ALTERNATIVE_TO: "Alternative to", ENDORSED_BY: "Agents would integrate",
};

export function constellationSection(g: { center: GraphNode | null; nodes: GraphNode[]; edges: GraphEdge[] }): string {
  if (!g.center) return "";
  const name = new Map(g.nodes.map((n) => [n.key, n]));
  const items = g.edges.map((e) => {
    const other = name.get(e.to === g.center!.key ? e.from : e.to);
    if (!other) return "";
    const path = other.key.replace("github:", "github.com/");
    return `<li><strong>${esc(EDGE_LABEL[e.type] ?? e.type)}</strong> <a href="/${esc(path)}">${esc(other.name)}</a><span class="fix">${esc(e.reason)}</span></li>`;
  }).join("");
  const data = JSON.stringify({ center: g.center.key, nodes: g.nodes.map((n) => ({ k: n.key, n: n.name, s: n.score ?? null })), edges: g.edges.map((e) => ({ f: e.from, t: e.to, y: e.type, w: e.weight })) });
  return `<h2 class="h2s">Constellation</h2><div class="specimen">
${g.edges.length
    ? `<canvas id="galaxy" class="galaxy" width="640" height="360" role="img" aria-label="Projects connected to ${esc(g.center.name)}" data-graph="${esc(data)}"></canvas><ul class="items">${items}</ul>`
    : `<p>No connections found yet. Connections come from dependencies, README mentions, complementary categories and agents who say they would integrate two projects. The more projects are scored on ScBee, the more appear here.</p>`}
<p class="note">Every link above is computed by fixed rules from public data and agent verdicts; the reason is shown with it.</p></div>`;
}



const renderComps = (r: ScoreResult): string => r.components.map((c) => `<section class="comp"><div><h3>${esc(c.title)}</h3><div class="sc">${c.score}/${c.max}</div></div><div>
<meter min="0" max="${c.max}" value="${c.score}"></meter>
<ul class="items">${c.items.map((i) => i.max === 0 ? `<li class="info"><strong>${esc(i.label)}</strong> ${esc(i.reason)}</li>` : `<li class="${i.points >= i.max ? "ok" : "no"}"><strong>${esc(i.label)}</strong> (${i.points}/${i.max}) ${esc(i.reason)}${i.fix && i.points < i.max ? `<span class="fix">Fix: ${esc(i.fix)}</span>` : ""}</li>`).join("")}</ul></div></section>`).join("");

/** "Can agents use this?": headline, the few fixes worth the most, the breakdown, and a badge to copy. */
function agentReadySection(ar: ScoreResult, path: string, base: string): string {
  const b = agentBand(ar.total);
  const lost = ar.components.flatMap((c) => c.items.filter((i) => i.fix && i.points < i.max)).sort((x, y) => (y.max - y.points) - (x.max - x.points)).slice(0, 3);
  const badgeMd = `[![Agent-ready](${base}/badge/agent-ready/${path}.svg)](${base}/${path})`;
  return `<h2 class="h2s">Agent-ready</h2><div class="specimen">
<p><strong>${ar.total}/100</strong> <span class="band">${esc(b.label)}</span> Can other agents find, install and trust this? Checked from public files by fixed rules (version ${esc(ar.version)}).</p>
${lost.length ? `<ol class="list">${lost.map((i) => `<li>${esc(i.fix)} <span class="mute">(+${i.max - i.points})</span></li>`).join("")}</ol>${path.startsWith("github.com/") || path.startsWith("web/") ? `<p><a class="btn sm" href="/fix/${esc(path)}">Generate the missing files</a></p>` : ""}` : `<p>Nothing to fix. Agents can find, install and trust this.</p>`}
<div class="comps">${renderComps(ar)}</div>
<div class="use"><code>${esc(badgeMd)}</code><button class="btn sm" data-copy="${esc(badgeMd)}">Copy badge</button></div></div>`;
}

/** The invitation on a project nobody has claimed yet: what the owner gets, with no promise about users. */
function claimSection(around: number, input: string, pv?: ListingPreview): string {
  return `<h2 class="h2s" id="claim">Claim this project</h2><div class="specimen">
<p>This project is on the map as an <strong>unclaimed node</strong>${around ? `, with <strong>${around}</strong> link${around === 1 ? "" : "s"} to other projects found in public data` : ""}. The owner can claim it by proving ownership with one file in the repo. Claiming gives the owner:</p>
<ul class="list"><li>A page that agents can find by what the project does, with a copy-ready install command.</li><li>A receipt of the visitors ScBee sends to it, and which agents sent them.</li><li>The projects around it, and a way to ask them for an introduction (both sides must agree).</li></ul>
${previewHtml(pv)}
<p class="mt16"><button class="btn" id="listit" data-input="${esc(input)}">List it on ScBee</button></p>
<div id="result" role="status"></div>
<noscript><p class="note">Without JavaScript, follow the steps in <a href="/join.md">join.md</a> to list it through the API.</p></noscript>
<p class="note">Free. Listing gives you an API key (shown once) and a file to add to prove you own it. Nothing is posted or changed in the repo by ScBee.</p></div>`;
}

export function projectPage(p: ProjectView, base: string, fc?: { forecast: Forecast; verdicts: VerdictView[] }, graph?: { center: GraphNode | null; nodes: GraphNode[]; edges: GraphEdge[] }): string {
  const { result: r } = p;
  const b = band(r.total);
  const path = p.path ?? `github.com/${p.owner}/${p.repo}`;
  const name = p.title ?? `${p.owner}/${p.repo}`;
  const url = `${base}/${path}`;
  const badgeMd = badgeMarkdown(base, path);
  const lost = r.components.flatMap((c) => c.items.filter((i) => i.fix && i.points < i.max).map((i) => ({ ...i, c: c.title })))
    .sort((a, z) => z.max - z.points - (a.max - a.points)).slice(0, 3);
  const text = `${name} scores ${r.total}/100 for launch readiness on ScBee. What would yours score?`;
  const enc = encodeURIComponent;
  const head = `<meta property="og:title" content="${esc(`${name}: ${r.total}/100 launch readiness`)}">
<meta property="og:description" content="${esc(`${b.label}. See exactly what to fix before you launch.`)}">
<meta property="og:image" content="${esc(`${base}/og/${path}.png`)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">${p.listed ? "" : '\n<meta name="robots" content="noindex,follow">'}`;
  const comps = renderComps(r);
  const fixes = lost.length
    ? `<div class="fixes"><h2>Biggest wins first</h2><ol class="list">${lost.map((i) => `<li>${esc(i.fix)} <span class="mute">(+${i.max - i.points} ${esc(i.c)})</span></li>`).join("")}</ol></div>`
    : `<div class="fixes"><h2>Nothing major to fix</h2><p>Every check passes. Ship it.</p></div>`;
  const body = `<div class="wrap"><div class="page"><div class="label">Launch readiness &middot; score ${esc(r.version)}</div>
<div class="score-head mt16"><div class="display num-xl" aria-label="Score ${r.total} out of 100">${r.total}</div><div>
<span class="band">${esc(b.label)}</span> ${p.claim ? `<span class="badge${p.claim === "claimed" ? " ok" : ""}">${CLAIM_LABEL[p.claim]}</span>` : ""}<h1 class="mt16 h-l">${esc(name)}</h1>
${p.description ? `<p class="lead mt16">${esc(p.description)}</p>` : ""}${p.usage ? `<p class="mt8"><strong>${usageLine(p.usage)}</strong> <span class="mute">(verified agents, one per owner, reported after using it)</span></p>` : ""}</div></div>
${fixes}
<h2 class="h2s">Breakdown</h2><div class="comps">${comps}</div>
${p.agentReady ? agentReadySection(p.agentReady, path, base) : ""}
${graph ? constellationSection(graph) : ""}
${fc ? forecastSection(fc.forecast, fc.verdicts) : ""}
<h2 class="h2s">Share it</h2>
<div class="share"><a class="btn sm" rel="noopener" href="https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}">Post on X</a>
<a class="btn sm" rel="noopener" href="https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}">Post on Bluesky</a>
<button class="btn ghost sm" data-copy="${esc(url)}">Copy link</button></div>
<h2 class="h2s">Add the badge to your README</h2>
<div class="use"><code>${esc(badgeMd)}</code><button class="btn sm" data-copy="${esc(badgeMd)}">Copy</button></div>
${p.claim === "claimed" ? `<p class="note mt16" id="claim">Claimed: the owner proved control with a file in the ${p.path?.startsWith("web/") ? "site" : "repo"}. They can edit the listing on <a href="/manage">Manage a listing</a> or remove it at any time from <a href="/optout">Remove a project</a>.</p>`
  : p.claim === "pending" ? `<p class="note mt16" id="claim">A listing was started but the owner has not proved control yet. Until then it is not a verified agent. Owner? Follow the verify step in <a href="/join.md">join.md</a>, or recover the key from <a href="/manage">Manage a listing</a>.</p>`
  : (p.claim === "unclaimed" || !p.listed) ? claimSection(graph?.edges.length ?? 0, p.path?.startsWith("web/") ? `https://${p.path.slice(4)}` : `github.com/${p.owner}/${p.repo}`, p.preview) : ""}
<p class="note mt24">This is a readiness score, not a prediction of success. It reads only public data (score version ${esc(r.version)}), is computed by fixed rules with no AI model, and was checked ${esc(new Date(p.fetchedAt).toISOString().slice(0, 16).replace("T", " "))} UTC.</p></div></div>`;
  return layout(`${name} · ScBee`, body, { head, description: `${name} scores ${r.total}/100 for launch readiness. ${b.label}. See exactly what to fix.` });
}
