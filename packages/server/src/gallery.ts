import { band } from "@scbee/registry-core";
import { esc, layout } from "./html.js";

export interface GalleryItem { project: string; name: string; score: number; band: string; description: string; stars: number }
export interface GalleryCollection { id: string; title: string; blurb: string; items: GalleryItem[] }

export function galleryPage(collections: GalleryCollection[]): string {
  const body = collections.map((c) => `<section class="gal"><h2 class="h2s">${esc(c.title)}</h2><p class="mute">${esc(c.blurb)}</p>
${c.items.length
    ? `<ul class="gal-list">${c.items.map((i) => `<li><a class="gal-card" href="/${esc(i.project)}"><span class="gal-score" data-band="${esc(band(i.score).label)}">${i.score}</span><span><strong>${esc(i.name)}</strong><br><span class="mute">${esc(i.description.slice(0, 140))}</span></span></a></li>`).join("")}</ul>`
    : `<div class="card center"><p>Nothing here yet. The gallery refreshes daily; you can also score any repo from the home page.</p></div>`}</section>`).join("");
  return layout("Gallery · ScBee", `<div class="page"><h1>Gallery</h1><p class="mute">The newest projects in each category, scored for launch readiness from public data by fixed rules. A score is not an endorsement, and it is not a prediction.</p>${body}</div>`);
}

export const GALLERY_CSS = `
.gal-list{list-style:none;margin:12px 0 28px;padding:0;display:grid;gap:10px}
.gal-card{display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:12px;background:var(--card);padding:12px 16px;text-decoration:none;color:var(--fg)}
.gal-card:hover{border-color:var(--accent)}
.gal-score{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;border:3px solid #dfb317}
.gal-score[data-band="Launch ready"]{border-color:#2da44e}.gal-score[data-band="Needs work"]{border-color:#fe7d37}.gal-score[data-band="Early"]{border-color:#e05d44}
`;
