import { band } from "@scbee/registry-core";
import { esc, layout } from "./html.js";
import { wrapData } from "./envelope.js";

export interface RadarItem { project: string; name: string; score: number; description: string; collection: string; added_at: number; claimed: boolean }

/** The weekly digest: totals and the most common fixes. No project below the radar line is ever named. */
export interface WeeklyDigest { days: number; since: number; scored: number; strong: RadarItem[]; fixes: { component: string; label: string; fix: string; projects: number; pct: number }[] }

/** Scored by ScBee from public data, without the owner. Never a registered or verified agent. */
const UNCLAIMED = "Scored \u00b7 unclaimed";
const status = (i: RadarItem) => (i.claimed ? `<span class="badge ok">listed by owner</span>` : `<span class="badge">${UNCLAIMED}</span>`);

/** Positive only: the best-scoring new projects this week. A low score is never listed, and nobody is ranked below anyone. */
export const RADAR_MIN_SCORE = 75;

export function radarPage(items: RadarItem[], days: number): string {
  const body = items.length
    ? `<ul class="gal-list">${items.map((i) => `<li><a class="gal-card" href="/${esc(i.project)}"><span class="gal-score" data-band="${esc(band(i.score).label)}">${i.score}</span><span><strong>${esc(i.name)}</strong> ${status(i)}<br><span class="mute">${esc(i.description.slice(0, 140))}</span></span></a></li>`).join("")}</ul>`
    : `<div class="card center"><p>Nothing has scored ${RADAR_MIN_SCORE} or more in the last ${days} days yet. The radar refreshes daily.</p></div>`;
  return layout("Launch Radar · ScBee", `<div class="wrap"><div class="page"><div class="label">Launch Radar</div><h1 class="mt8">New projects that are ready.</h1>
<p class="lead">The best-scoring new projects from the last ${days} days: ${RADAR_MIN_SCORE} or more for launch readiness, from public data and fixed rules. Only strong results are listed, and a project that does not want to be here can <a href="/optout">remove itself</a>. A score is not an endorsement, and it is not a prediction.</p>
${body}
<p class="mute">"Scored &middot; unclaimed" means ScBee scored it from public data without the owner. It is not a registered agent, and the owner was not contacted. Owners can <a href="/#register">claim it</a> or <a href="/optout">remove it</a>.</p>
<p class="mt24"><a href="/radar/weekly">This week in numbers</a> &middot; <a href="/feeds/radar.atom">Follow with Atom</a> &middot; <a href="/gallery">All collections</a> &middot; <a href="/#register">Score yours</a></p></div></div>`, {
    head: '<link rel="alternate" type="application/atom+xml" title="Launch Radar" href="/feeds/radar.atom">',
    description: "The best-scoring new projects this week, from public data and fixed rules.",
  });
}

export function radarMd(base: string, items: RadarItem[], days: number): string {
  return `# Launch Radar

New projects from the last ${days} days that scored ${RADAR_MIN_SCORE} or more for launch readiness (public data, fixed rules). Positive only. Not an endorsement, not a prediction.
Feed: ${base}/feeds/radar.atom   API: GET ${base}/api/radar

${wrapData(items.length ? items.map((i) => `- ${i.name}: ${i.score}/100 (${band(i.score).label}) ${base}/${i.project} [${i.claimed ? "listed by owner" : "scored, unclaimed"}]${i.description ? `\n  ${i.description.slice(0, 140)}` : ""}`).join("\n") : "nothing yet")}
`;
}

export function weeklyPage(d: WeeklyDigest): string {
  const fixes = d.fixes.length
    ? `<ul class="rows">${d.fixes.slice(0, 8).map((f) => `<li><div><div class="nm">${esc(f.label)}</div><div class="meta mt8">${esc(f.component)}</div></div><div><div class="tg">${esc(f.fix)}</div><div class="meta mt8">${f.projects} of ${d.scored} projects (${f.pct}%)</div></div><div></div></li>`).join("")}</ul>`
    : `<div class="card center"><p>No fixes to count yet.</p></div>`;
  const strong = d.strong.length
    ? `<ul class="gal-list">${d.strong.map((i) => `<li><a class="gal-card" href="/${esc(i.project)}"><span class="gal-score" data-band="${esc(band(i.score).label)}">${i.score}</span><span><strong>${esc(i.name)}</strong> ${status(i)}<br><span class="mute">${esc(i.description.slice(0, 140))}</span></span></a></li>`).join("")}</ul>`
    : `<div class="card center"><p>Nothing scored ${RADAR_MIN_SCORE} or more this week.</p></div>`;
  return layout("This week on the Launch Radar · ScBee", `<div class="wrap"><div class="page"><div class="label">Launch Radar &middot; weekly</div><h1 class="mt8">This week in numbers.</h1>
<p class="lead">New projects the ScBee Index scored in the last ${d.days} days, from public data by fixed rules. Counted, not estimated. Fixes are totals only: no project below ${RADAR_MIN_SCORE} is named.</p>
<div class="specimen"><p><strong>${d.scored}</strong> project${d.scored === 1 ? "" : "s"} scored this week &middot; <strong>${d.strong.length}</strong> scored ${RADAR_MIN_SCORE} or more</p></div>
<h2 class="h2s">Most common fixes</h2>${fixes}
<h2 class="h2s">Scored ${RADAR_MIN_SCORE} or more</h2>${strong}
<p class="mt24"><a href="/feeds/radar-weekly.atom">Follow with Atom</a> &middot; <a href="/radar">Launch Radar</a> &middot; <a href="/">Score yours</a></p></div></div>`, {
    head: '<link rel="alternate" type="application/atom+xml" title="Launch Radar weekly" href="/feeds/radar-weekly.atom">',
    description: `${d.scored} new projects scored this week, and the fixes they need most often.`,
  });
}

export function weeklyMd(base: string, d: WeeklyDigest): string {
  return `# Launch Radar: this week in numbers

New projects the ScBee Index scored in the last ${d.days} days (public data, fixed rules). Counted, not estimated. No project below ${RADAR_MIN_SCORE} is named.
API: GET ${base}/api/radar/weekly   Feed: ${base}/feeds/radar-weekly.atom

Projects scored: ${d.scored}
Scored ${RADAR_MIN_SCORE} or more: ${d.strong.length}

## Most common fixes
${d.fixes.length ? d.fixes.slice(0, 8).map((f) => `- ${f.label} (${f.component}): ${f.projects} of ${d.scored} (${f.pct}%). Fix: ${f.fix}`).join("\n") : "none yet"}

## Scored ${RADAR_MIN_SCORE} or more
${wrapData(d.strong.length ? d.strong.map((i) => `- ${i.name}: ${i.score}/100 ${base}/${i.project} [${i.claimed ? "listed by owner" : "scored, unclaimed"}]`).join("\n") : "none this week")}
`;
}
