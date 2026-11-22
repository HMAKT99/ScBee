import type { IndexedRow } from "./store.js";
import { esc, layout } from "./html.js";
import { entryDestination } from "./indexer.js";
import { needPath, needsForEntry } from "./needs.js";
import { wrapData } from "./envelope.js";

/**
 * /i/<id>: one index entry, for its owner. Owners find ScBee through ref=scbee in their referrer logs; this page shows
 * what ScBee knows about the entry, how many hand-offs it sent, and how to claim or remove it. It is noindex: thousands
 * of entry pages would be thin pages for search engines, and the need pages are the ones worth finding.
 */
export interface EntryView { row: IndexedRow; handoffs: number; claimed: boolean }

const tools = (r: IndexedRow) => { try { return (JSON.parse(r.tools_json ?? "[]") as { name: string; description?: string }[]).slice(0, 30); } catch { return []; } };
/** Where the owner claims it: the repo if there is one, else the site. Both use the existing one-file claim. */
export function claimPath(r: IndexedRow): string | null {
  if (r.repo) return `/claim/${r.repo}`;
  const host = (r.site_key ?? "").replace(/^url:https:\/\//, "");
  return /^[a-z0-9.-]{4,253}$/.test(host) ? `/claim/web/${host}` : null;
}
const scorePath = (r: IndexedRow) => (r.repo ? `/${r.repo}` : null);
const when = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

export function entryMd(base: string, v: EntryView): string {
  const r = v.row;
  const needs = needsForEntry(r);
  const t = tools(r);
  const facts = [
    `- Status: ${v.claimed ? "claimed by its owner (proved control with a file)" : "Indexed · unclaimed (read from the official MCP Registry's public data; not verified)"}`,
    `- Registry name: ${r.key}${r.version ? ` (version ${r.version})` : ""}`,
    r.pkg ? `- Install: ${r.pkg}` : "",
    r.remote ? `- Remote MCP endpoint: ${r.remote}` : "",
    r.website ? `- Website: ${r.website}` : "",
    r.repo ? `- Source: https://${r.repo} (scores: ${base}${scorePath(r)})` : "",
    `- Hand-offs sent from ScBee in the last 30 days: ${v.handoffs}`,
    `- Read from the registry on ${when(r.fetched_at)}${r.probed_at ? `; visited by ScBeeBot on ${when(r.probed_at)}` : ""}`,
  ].filter(Boolean).join("\n");
  const claim = claimPath(r);
  return `# ${r.title ?? r.key}

${wrapData(r.description || "(no description)")}

${facts}

## Appears on
${needs.length ? needs.map((n) => `- ${n.title}: ${base}${needPath(n.slug)}`).join("\n") : "No need page yet."}

## Tools (as listed by the server)
${t.length ? wrapData(t.map((x) => `- ${x.name}${x.description ? `: ${x.description}` : ""}`).join("\n")) : "Not read yet."}

## Owner?
${v.claimed ? "This entry is claimed." : claim ? `Claim it: prove you own it with one file at ${base}${claim}. Claimed entries are marked as yours and listed first.` : "This entry has no repo or site to prove ownership with."}
Remove it from ScBee for good: ${base}/optout. How the index works: ${base}/bot
`;
}

export function entryPage(base: string, v: EntryView): string {
  const r = v.row;
  const needs = needsForEntry(r);
  const t = tools(r);
  const claim = claimPath(r);
  const go = entryDestination(r);
  const row = (k: string, val: string) => `<tr><td>${k}</td><td>${val}</td></tr>`;
  const body = `<div class="wrap"><div class="page"><div class="label">From the official MCP Registry</div><h1 class="mt8">${esc(r.title ?? r.key)}</h1>
<p class="mt8"><span class="badge${v.claimed ? " ok" : ""}">${v.claimed ? "Claimed by its owner" : "Indexed · unclaimed"}</span></p>
<p class="lead">${esc(r.description || "No description.")}</p><div class="prose">
<table class="tbl"><tbody>
${row("Registry name", `<code>${esc(r.key)}</code>${r.version ? ` · version ${esc(r.version)}` : ""}`)}
${r.pkg ? row("Install", `<code>${esc(r.pkg)}</code>`) : ""}
${r.remote ? row("Remote MCP endpoint", `<code>${esc(r.remote)}</code>`) : ""}
${r.repo ? row("Source", `<a href="https://${esc(r.repo)}" rel="nofollow noopener">${esc(r.repo)}</a> · <a href="${esc(scorePath(r)!)}">its launch and Agent-Ready scores</a>`) : ""}
${row("Hand-offs from ScBee", `<strong>${v.handoffs}</strong> in the last 30 days`)}
${row("Read", `from the registry on ${esc(when(r.fetched_at) ?? "-")}${r.probed_at ? `; visited by <a href="/bot">ScBeeBot</a> on ${esc(when(r.probed_at)!)}` : ""}`)}
</tbody></table>
${go ? `<p><a class="btn sm" href="/r/x/${r.id}" rel="nofollow">Open its site</a></p>` : ""}
<h2>Appears on</h2>${needs.length ? `<ul>${needs.map((n) => `<li><a href="${needPath(n.slug)}">${esc(n.title)}</a></li>`).join("")}</ul>` : "<p>No need page yet.</p>"}
<h2>Tools</h2>${t.length ? `<ul>${t.map((x) => `<li><code>${esc(x.name)}</code>${x.description ? ` ${esc(x.description)}` : ""}</li>`).join("")}</ul><p class="note">As the server lists them. Third-party text, not checked by ScBee.</p>` : "<p>Not read yet.</p>"}
<h2>Is this yours?</h2>
${v.claimed ? "<p>This entry is claimed by its owner.</p>"
    : claim ? `<p>Claim it by proving you own it with one file. Claimed entries are marked as yours and listed first on the need pages they appear on.</p><p><a class="btn sm" href="${esc(claim)}">Claim it</a></p>`
    : "<p>This entry has no repo or site to prove ownership with.</p>"}
<p class="mute">Remove it from ScBee for good at <a href="/optout">Remove a project</a>. <a href="/bot">How the index works</a>.</p>
</div></div></div>`;
  return layout(`${r.title ?? r.key} · ScBee`, body, { description: `${r.title ?? r.key}: an MCP server in ScBee's index of the official MCP Registry.`, head: '<meta name="robots" content="noindex">' });
}
