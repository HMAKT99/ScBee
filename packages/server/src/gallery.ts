import { band } from "@scbee/registry-core";
import { esc, layout } from "./html.js";

const enc = encodeURIComponent;

export interface GalleryItem { project: string; name: string; score: number; band: string; description: string; stars: number; updated?: number }
export interface GalleryCollection { id: string; title: string; blurb: string; items: GalleryItem[] }

export function galleryPage(collections: GalleryCollection[]): string {
  const body = collections.map((c) => `<section class="gal"><h2 class="h2s"><a href="/gallery/${esc(c.id)}">${esc(c.title)}</a></h2><p class="mute">${esc(c.blurb)}</p>
${c.items.length
    ? `<ul class="gal-list">${c.items.map((i) => `<li><a class="gal-card" href="/${esc(i.project)}"><span class="gal-score" data-band="${esc(band(i.score).label)}">${i.score}</span><span><strong>${esc(i.name)}</strong><br><span class="mute">${esc(i.description.slice(0, 140))}</span></span></a></li>`).join("")}</ul>`
    : `<div class="card center"><p>Nothing here yet. The gallery refreshes daily; you can also score any repo from the home page.</p></div>`}</section>`).join("");
  const one = collections.length === 1 ? collections[0]! : null;
  const head = one
    ? `<meta property="og:title" content="${esc(one.title)}"><meta property="og:description" content="${esc(one.blurb)}"><meta property="og:type" content="website"><meta property="og:url" content="%%CANON%%"><meta property="og:image" content="%%BASE%%/og/gallery/${esc(one.id)}.png"><meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/atom+xml" href="/feeds/gallery/${esc(one.id)}.atom" title="${esc(one.title)}">`
    : "";
  const share = one
    ? `<h2 class="h2s">Share it</h2><div class="share"><a class="btn sm" rel="noopener" href="https://twitter.com/intent/tweet?text=${enc(`${one.title}, scored by fixed rules`)}&url=%%BASE%%/gallery/${esc(one.id)}">Post on X</a>
<a class="btn sm" rel="noopener" href="https://bsky.app/intent/compose?text=${enc(`${one.title}, scored by fixed rules`)}%20%%BASE%%/gallery/${esc(one.id)}">Post on Bluesky</a>
<button class="btn ghost sm" data-copy="%%BASE%%/gallery/${esc(one.id)}">Copy link</button> <a class="btn ghost sm" href="/feeds/gallery/${esc(one.id)}.atom">Atom feed</a></div>`
    : "";
  return layout(collections.length === 1 ? `${collections[0]!.title} · ScBee` : "Gallery · ScBee", `<div class="wrap"><div class="page"><div class="label">Gallery</div><h1 class="mt8">The newest projects, scored.</h1><p class="lead">The newest projects in each category, scored for launch readiness from public data by fixed rules. A score is not an endorsement, and it is not a prediction. <a href="/radar">See the Launch Radar</a> for this week's strongest results.</p>${body}${share}</div></div>`, one ? { head, description: one.blurb } : {});
}
