import type { IndexedRow } from "./store.js";
import { esc, layout } from "./html.js";
import { dedupeEntries } from "./indexer.js";
import { wrapData } from "./envelope.js";

/**
 * /radar/mcp: a weekly look at ScBee's index of the official MCP Registry. Counted from the index, never estimated:
 * servers published or updated this week, the needs with the most servers, and what people searched for and did not
 * find. Linkable and followable (Atom), so there is something honest to share each week.
 */
export interface McpWeek {
  since: string;
  total: number;
  changed: number;
  newest: IndexedRow[];
  needs: { slug: string; title: string; count: number }[];
  unmet: { word: string; misses: number }[];
}

export function mcpWeekPage(w: McpWeek): string {
  const newest = w.newest.length
    ? `<ul class="items">${w.newest.map((r) => `<li><a href="/i/${r.id}"><strong>${esc(r.title ?? r.key)}</strong></a><span class="fix">${esc(r.description)}</span></li>`).join("")}</ul><p class="note">Third-party text from the registry, not checked by ScBee.</p>`
    : `<div class="card center"><p>Nothing new in the registry this week yet.</p></div>`;
  const needs = w.needs.length
    ? `<ul class="items">${w.needs.map((n) => `<li><a href="/for/${esc(n.slug)}"><strong>${esc(n.title)}</strong></a><span class="fix">${n.count} agents and MCP servers</span></li>`).join("")}</ul>`
    : `<div class="card center"><p>Need pages appear as the index fills.</p></div>`;
  const unmet = w.unmet.length
    ? `<ul class="list">${w.unmet.map((u) => `<li><strong>${esc(u.word)}</strong> <span class="mute">${u.misses} searches found nothing</span></li>`).join("")}</ul><p class="note">Single words from searches on <a href="/find">Find</a>, at least 3 times in 30 days. No search text is kept.</p>`
    : `<p>Nothing searched often enough to show yet.</p>`;
  return layout("MCP servers this week · ScBee", `<div class="wrap"><div class="page"><div class="label">Launch Radar &middot; MCP</div><h1 class="mt8">MCP servers this week.</h1>
<p class="lead">From ScBee's index of the official MCP Registry: ${w.total.toLocaleString("en-US")} servers, read daily. Counted, not estimated.</p>
<div class="specimen"><p><strong>${w.changed.toLocaleString("en-US")}</strong> server${w.changed === 1 ? "" : "s"} published or updated in the registry since ${esc(w.since)}</p></div>
<h2 class="h2s">Newest</h2>${newest}
<h2 class="h2s">Needs with the most servers</h2>${needs}
<h2 class="h2s">Looked for, not found</h2>${unmet}
<p class="mt24"><a href="/feeds/radar-mcp.atom">Follow with Atom</a> &middot; <a href="/for">All needs</a> &middot; <a href="/bot">Where the index comes from</a></p></div></div>`, {
    head: '<link rel="alternate" type="application/atom+xml" title="MCP servers this week" href="/feeds/radar-mcp.atom">',
    description: `${w.changed} MCP servers published or updated this week, the needs with the most servers, and what people looked for and did not find.`,
  });
}

export function mcpWeekMd(base: string, w: McpWeek): string {
  return `# MCP servers this week

From ScBee's index of the official MCP Registry: ${w.total} servers, read daily. Counted, not estimated.

- Published or updated in the registry since ${w.since}: ${w.changed}

## Newest
${w.newest.length ? wrapData(w.newest.map((r) => `- ${r.title ?? r.key}: ${r.description} ${base}/i/${r.id}`).join("\n")) : "Nothing new yet."}

## Needs with the most servers
${w.needs.length ? w.needs.map((n) => `- ${n.title} (${n.count}): ${base}/for/${n.slug}`).join("\n") : "(none yet)"}

## Looked for, not found
${w.unmet.length ? w.unmet.map((u) => `- ${u.word} (${u.misses} searches found nothing)`).join("\n") : "(nothing yet)"}

Follow: ${base}/feeds/radar-mcp.atom · All needs: ${base}/for · How the index is built: ${base}/bot
`;
}

/** The newest entries, without the registry's duplicate listings. */
export const newestOf = (rows: IndexedRow[], n = 12) => dedupeEntries(rows).slice(0, n);
