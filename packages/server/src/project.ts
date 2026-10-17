import { band, type ScoreResult } from "@scbee/registry-core";
import { esc, layout } from "./html.js";

export interface ProjectView {
  owner: string;
  repo: string;
  description: string | null;
  stars: number;
  fetchedAt: number;
  result: ScoreResult;
  listed: boolean;
}

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

export function ring(total: number, color: string, size = 132) {
  const dash = (RING_C * Math.max(0, Math.min(100, total))) / 100;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 132 132" role="img" aria-label="Score ${total} out of 100">
<circle cx="66" cy="66" r="${RING_R}" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="12"/>
<circle cx="66" cy="66" r="${RING_R}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${RING_C.toFixed(1)}" transform="rotate(-90 66 66)"/>
<text x="66" y="74" text-anchor="middle" font-size="34" font-weight="800" fill="currentColor">${total}</text></svg>`;
}

/** Flat badge for READMEs. Colour reflects the band. */
export function badgeSvg(total: number | null): string {
  const value = total === null ? "unknown" : `${total}/100`;
  const color = total === null ? "#9f9f9f" : band(total).color;
  const lw = 52;
  const rw = 14 + value.length * 7;
  const w = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="ScBee: ${value}"><title>ScBee: ${value}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#1f2328"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14">ScBee</text><text x="${lw + rw / 2}" y="14" font-weight="bold">${value}</text></g></svg>`;
}

export const PROJECT_CSS = `
.proj{padding:32px 0 8px}
.proj-head{display:flex;gap:28px;align-items:center;flex-wrap:wrap}
.proj-head>div{flex:1 1 240px}
.proj-head h1{margin:0 0 6px;font-size:28px;letter-spacing:-.02em;word-break:break-word}
.ring{flex:none;color:var(--fg)}
.band{display:inline-block;font-weight:700;font-size:13px;padding:3px 10px;border-radius:999px;background:var(--card);border:1px solid var(--line)}
.comps{display:grid;gap:14px;margin:26px 0}
.comp{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:16px 18px}
.comp h3{display:flex;justify-content:space-between;margin:0 0 8px;font-size:16px}
.comp meter{width:100%;height:8px;margin-bottom:10px}
.items{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.items li{font-size:14px;line-height:1.45}
.items li::before{margin-right:6px}
.items .ok::before{content:"\\2713";color:#2da44e;font-weight:700}
.items .no::before{content:"\\2717";color:#e05d44;font-weight:700}
.items .fix{display:block;color:var(--mute);margin-left:18px}
.fixes{border:1px solid var(--accent);border-radius:12px;padding:16px 18px;margin:22px 0;background:var(--card)}
.fixes h2{margin:0 0 8px;font-size:17px}
.share{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
.note{font-size:13px;color:var(--mute)}
`;

export function projectPage(p: ProjectView, base: string): string {
  const { result: r } = p;
  const b = band(r.total);
  const path = `github.com/${p.owner}/${p.repo}`;
  const url = `${base}/${path}`;
  const badgeMd = `[![ScBee](${base}/badge/${path}.svg)](${url})`;
  const lost = r.components.flatMap((c) => c.items.filter((i) => i.fix && i.points < i.max).map((i) => ({ ...i, c: c.title })))
    .sort((a, z) => z.max - z.points - (a.max - a.points)).slice(0, 3);
  const text = `${p.owner}/${p.repo} scores ${r.total}/100 for launch readiness on ScBee. What would yours score?`;
  const enc = encodeURIComponent;
  const head = `<meta property="og:title" content="${esc(`${p.owner}/${p.repo}: ${r.total}/100 launch readiness`)}">
<meta property="og:description" content="${esc(`${b.label}. See exactly what to fix before you launch.`)}">
<meta property="og:image" content="${esc(`${base}/og/${path}.png`)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">`;
  const comps = r.components.map((c) => `<section class="comp"><h3><span>${esc(c.title)}</span><span>${c.score}/${c.max}</span></h3>
<meter min="0" max="${c.max}" value="${c.score}"></meter>
<ul class="items">${c.items.map((i) => `<li class="${i.points >= i.max ? "ok" : "no"}"><strong>${esc(i.label)}</strong> (${i.points}/${i.max}) ${esc(i.reason)}${i.fix && i.points < i.max ? `<span class="fix">Fix: ${esc(i.fix)}</span>` : ""}</li>`).join("")}</ul></section>`).join("");
  const fixes = lost.length
    ? `<div class="fixes"><h2>Biggest wins first</h2><ol class="list">${lost.map((i) => `<li>${esc(i.fix)} <span class="mute">(+${i.max - i.points} ${esc(i.c)})</span></li>`).join("")}</ol></div>`
    : `<div class="fixes"><h2>Nothing major to fix</h2><p>Every check passes. Ship it.</p></div>`;
  const body = `<div class="page proj"><div class="proj-head">${ring(r.total, b.color)}<div>
<h1>${esc(p.owner)}/${esc(p.repo)}</h1><span class="band">${esc(b.label)}</span>
${p.description ? `<p class="mute">${esc(p.description)}</p>` : ""}</div></div>
${fixes}
<div class="comps">${comps}</div>
<h2 class="h2s">Share it</h2>
<div class="share"><a class="btn sm" rel="noopener" href="https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}">Post on X</a>
<a class="btn sm" rel="noopener" href="https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}">Post on Bluesky</a>
<button class="btn sm" data-copy="${esc(url)}">Copy link</button></div>
<h2 class="h2s">Add the badge to your README</h2>
<div class="term"><code>${esc(badgeMd)}</code><button class="copy" data-copy="${esc(badgeMd)}">Copy</button></div>
${p.listed ? "" : `<p class="mt24"><a class="btn" href="/#register">Register this agent on ScBee</a></p>`}
<p class="note mt24">This is a readiness score, not a prediction of success. It reads only public data (score version ${esc(r.version)}), is computed by fixed rules with no AI model, and was checked ${esc(new Date(p.fetchedAt).toISOString().slice(0, 16).replace("T", " "))} UTC.</p></div>`;
  return layout(`${p.owner}/${p.repo} · ScBee`, body, false, head);
}
