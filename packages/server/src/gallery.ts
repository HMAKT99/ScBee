import { band } from "@scbee/registry-core";
import { esc, layout } from "./html.js";

export interface GalleryItem { project: string; name: string; score: number; band: string; description: string; stars: number }
export interface GalleryCollection { id: string; title: string; blurb: string; items: GalleryItem[] }

export function galleryPage(collections: GalleryCollection[]): string {
  const body = collections.map((c) => `<section class="gal"><h2 class="h2s"><a href="/gallery/${esc(c.id)}">${esc(c.title)}</a></h2><p class="mute">${esc(c.blurb)}</p>
${c.items.length
    ? `<ul class="gal-list">${c.items.map((i) => `<li><a class="gal-card" href="/${esc(i.project)}"><span class="gal-score" data-band="${esc(band(i.score).label)}">${i.score}</span><span><strong>${esc(i.name)}</strong><br><span class="mute">${esc(i.description.slice(0, 140))}</span></span></a></li>`).join("")}</ul>`
    : `<div class="card center"><p>Nothing here yet. The gallery refreshes daily; you can also score any repo from the home page.</p></div>`}</section>`).join("");
  return layout(collections.length === 1 ? `${collections[0]!.title} · ScBee` : "Gallery · ScBee", `<div class="wrap"><div class="page"><div class="label">Gallery</div><h1 class="mt8">The newest projects, scored.</h1><p class="lead">The newest projects in each category, scored for launch readiness from public data by fixed rules. A score is not an endorsement, and it is not a prediction. <a href="/radar">See the Launch Radar</a> for this week's strongest results.</p>${body}</div></div>`);
}
