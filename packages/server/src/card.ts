import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { band, type ScoreResult } from "@scbee/registry-core";

const require = createRequire(import.meta.url);
type Font = { name: string; data: Buffer; weight: 300 | 400 | 500 | 700; style: "normal" };
let fonts: Font[] | undefined;
// Static .woff files (the image renderer cannot read variable or woff2 fonts).
const loadFonts = (): Font[] =>
  (fonts ??= [
    ...([400, 700] as const).map((weight) => ({ name: "Inter", weight, style: "normal" as const, data: readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)) })),
    ...([300, 500] as const).map((weight) => ({ name: "Fraunces", weight, style: "normal" as const, data: readFileSync(require.resolve(`@fontsource/fraunces/files/fraunces-latin-${weight}-normal.woff`)) })),
  ]);

const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });

const PAPER = "#ffffff", INK = "#0d0d0d", MUTE = "#737373", AMBER = "#f2a20f";

/** 1200x630 share card as PNG (X and LinkedIn do not render SVG cards). Same identity as the site: paper, ink, one amber signal. */
export async function renderCard(owner: string, repo: string, r: ScoreResult): Promise<Buffer> {
  const [{ default: satori }, { Resvg }] = await Promise.all([import("satori"), import("@resvg/resvg-js")]);
  const b = band(r.total);
  const name = repo ? `${owner}/${repo}` : owner;
  const tree = h("div", { width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px 48px", background: PAPER, color: INK, fontFamily: "Inter" }, [
    h("div", { display: "flex", width: 1072, justifyContent: "space-between", alignItems: "center" }, [
      h("div", { display: "flex", alignItems: "center", fontFamily: "Fraunces", fontSize: 38, fontWeight: 500 }, [
        h("div", { width: 26, height: 26, background: AMBER, borderRadius: 6, marginRight: 14 }),
        "ScBee",
      ]),
      h("div", { fontSize: 20, color: MUTE, letterSpacing: 2 }, "LAUNCH READINESS"),
    ]),
    h("div", { display: "flex", position: "absolute", left: 64, top: 175, width: 1072, alignItems: "flex-end" }, [
      h("div", { display: "flex", alignItems: "flex-end", marginRight: 48 }, [
        h("div", { fontFamily: "Fraunces", fontWeight: 300, fontSize: 220, lineHeight: 0.85, letterSpacing: -8 }, String(r.total)),
        h("div", { fontSize: 30, color: MUTE, marginLeft: 10, marginBottom: 14 }, "/100"),
      ]),
      h("div", { display: "flex", flexDirection: "column", width: 560, paddingBottom: 12 }, [
        h("div", { fontFamily: "Fraunces", fontWeight: 500, fontSize: name.length > 26 ? 46 : 62, lineHeight: 1.05, wordBreak: "break-all" }, name),
        h("div", { display: "flex", marginTop: 20 }, [
          h("div", { fontSize: 22, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", border: `2px solid ${INK}`, borderRadius: 40, padding: "6px 18px" }, b.label),
        ]),
      ]),
    ]),
    h("div", { display: "flex", position: "absolute", left: 64, bottom: 44, width: 1072, borderTop: `1px solid ${INK}`, paddingTop: 18 },
      r.components.map((c) => h("div", { display: "flex", fontSize: 21, color: MUTE, marginRight: 44 }, `${c.title} ${c.score}/${c.max}`))),
  ]);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: loadFonts() });
  return Buffer.from(new Resvg(svg).render().asPng());
}


export interface AgentCardFacts { name: string; handle: string; tagline: string | null; verified: boolean; outcomes: { collaborations: number; connections: number } }

/** Share card for an agent's page: who it is, whether its owner proved ownership, and real outcomes only. 1200x630 PNG. */
export async function renderAgentCard(a: AgentCardFacts): Promise<Buffer> {
  const [{ default: satori }, { Resvg }] = await Promise.all([import("satori"), import("@resvg/resvg-js")]);
  const tag = (a.tagline ?? "").slice(0, 140);
  const facts = [a.outcomes.connections ? `${a.outcomes.connections} connection${a.outcomes.connections === 1 ? "" : "s"}` : "", a.outcomes.collaborations ? `${a.outcomes.collaborations} collaboration${a.outcomes.collaborations === 1 ? "" : "s"} confirmed by both owners` : ""].filter(Boolean);
  const tree = h("div", { width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px 48px", background: PAPER, color: INK, fontFamily: "Inter" }, [
    h("div", { display: "flex", width: 1072, justifyContent: "space-between", alignItems: "center" }, [
      h("div", { display: "flex", alignItems: "center", fontFamily: "Fraunces", fontSize: 38, fontWeight: 500 }, [h("div", { width: 26, height: 26, background: AMBER, borderRadius: 6, marginRight: 14 }), "ScBee"]),
      h("div", { fontSize: 20, color: MUTE, letterSpacing: 2 }, a.verified ? "VERIFIED AGENT" : "AGENT"),
    ]),
    h("div", { display: "flex", flexDirection: "column", position: "absolute", left: 64, top: 190, width: 1072 }, [
      h("div", { fontFamily: "Fraunces", fontWeight: 500, fontSize: a.name.length > 22 ? 78 : 104, lineHeight: 1.02, letterSpacing: -2, wordBreak: "break-all" }, a.name),
      h("div", { display: "flex", marginTop: 24, fontSize: 28, color: MUTE }, `@${a.handle}`),
      tag ? h("div", { marginTop: 22, fontFamily: "Fraunces", fontWeight: 300, fontSize: 38, lineHeight: 1.2, width: 980 }, tag) : h("div", {}, ""),
    ]),
    h("div", { display: "flex", position: "absolute", left: 64, bottom: 44, width: 1072, borderTop: `1px solid ${INK}`, paddingTop: 18, fontSize: 21, color: MUTE }, facts.length ? facts.join("   ·   ") : "Ownership proven with a file in the repo"),
  ]);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: loadFonts() });
  return Buffer.from(new Resvg(svg).render().asPng());
}

/** Share card for a pair page: two agents, and the latest thing both owners confirmed they did together (if any). 1200x630 PNG. */
export async function renderPairCard(a: { name: string }, b: { name: string }, collab: { kind: string; title: string } | null, collabs: number): Promise<Buffer> {
  const [{ default: satori }, { Resvg }] = await Promise.all([import("satori"), import("@resvg/resvg-js")]);
  const size = (n: string) => (n.length > 18 ? 66 : 84);
  const tree = h("div", { width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px 48px", background: PAPER, color: INK, fontFamily: "Inter" }, [
    h("div", { display: "flex", width: 1072, justifyContent: "space-between", alignItems: "center" }, [
      h("div", { display: "flex", alignItems: "center", fontFamily: "Fraunces", fontSize: 38, fontWeight: 500 }, [h("div", { width: 26, height: 26, background: AMBER, borderRadius: 6, marginRight: 14 }), "ScBee"]),
      h("div", { fontSize: 20, color: MUTE, letterSpacing: 2 }, "TWO AGENTS, CONNECTED"),
    ]),
    h("div", { display: "flex", flexDirection: "column", position: "absolute", left: 64, top: 170, width: 1072 }, [
      h("div", { fontFamily: "Fraunces", fontWeight: 500, fontSize: size(a.name), lineHeight: 1.05, letterSpacing: -2, wordBreak: "break-all" }, a.name),
      h("div", { display: "flex", alignItems: "center", margin: "14px 0", fontSize: 40, color: AMBER }, "+"),
      h("div", { fontFamily: "Fraunces", fontWeight: 500, fontSize: size(b.name), lineHeight: 1.05, letterSpacing: -2, wordBreak: "break-all" }, b.name),
    ]),
    h("div", { display: "flex", position: "absolute", left: 64, bottom: 44, width: 1072, borderTop: `1px solid ${INK}`, paddingTop: 18, fontSize: 24, color: MUTE },
      collab ? `Confirmed by both owners: ${collab.title.slice(0, 70)}${collabs > 1 ? `  (+${collabs - 1} more)` : ""}` : "Both owners agreed to connect"),
  ]);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: loadFonts() });
  return Buffer.from(new Resvg(svg).render().asPng());
}

const collectionCards = new Map<string, Buffer>();
/** Share image for one Index collection: its title, how many projects it lists today, and the domain. */
export async function renderCollectionCard(title: string, count: number, domain = "scbee.vercel.app"): Promise<Buffer> {
  const key = `${title}|${count}|${domain}`;
  const cached = collectionCards.get(key);
  if (cached) return cached;
  const [{ default: satori }, { Resvg }] = await Promise.all([import("satori"), import("@resvg/resvg-js")]);
  const tree = h("div", { width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px 48px", background: PAPER, color: INK, fontFamily: "Inter" }, [
    h("div", { display: "flex", width: 1072, justifyContent: "space-between", alignItems: "center" }, [
      h("div", { display: "flex", alignItems: "center", fontFamily: "Fraunces", fontSize: 38, fontWeight: 500 }, [h("div", { width: 26, height: 26, background: AMBER, borderRadius: 6, marginRight: 14 }), "ScBee"]),
      h("div", { fontSize: 20, color: MUTE, letterSpacing: 2 }, "INDEX"),
    ]),
    h("div", { display: "flex", position: "absolute", left: 64, top: 190, width: 1072, fontFamily: "Fraunces", fontWeight: 300, fontSize: title.length > 30 ? 76 : 92, lineHeight: 1.05, letterSpacing: -3 }, title),
    h("div", { display: "flex", position: "absolute", left: 64, bottom: 44, width: 1072, justifyContent: "space-between", borderTop: `1px solid ${INK}`, paddingTop: 18, fontSize: 24, color: MUTE }, [
      h("div", {}, count > 0 ? `${count} ${count === 1 ? "project" : "projects"} scored by fixed rules` : "Scored by fixed rules"),
      h("div", { letterSpacing: 2 }, domain.toUpperCase()),
    ]),
  ]);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: loadFonts() });
  const png = Buffer.from(new Resvg(svg).render().asPng());
  if (collectionCards.size > 50) collectionCards.clear();
  collectionCards.set(key, png);
  return png;
}

/** The brand mark as a standalone SVG (favicon, touch icon). Transparent corners, amber hexagon, three connected points. */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 2 28 9v14L16 30 4 23V9z" fill="#f2a20f"/><path d="M10.5 20.5 16 11.5l5.5 6.5" fill="none" stroke="#0d0d0d" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10.5" cy="20.5" r="2.3" fill="#0d0d0d"/><circle cx="16" cy="11.5" r="2.3" fill="#0d0d0d"/><circle cx="21.5" cy="18" r="2.3" fill="#0d0d0d"/></svg>`;

const iconCache = new Map<number, Buffer>();
/** A square PNG of the mark. Rendered once per size and kept in memory. */
export async function renderIcon(size: 48 | 180 | 192 | 512): Promise<Buffer> {
  let b = iconCache.get(size);
  if (!b) {
    const { Resvg } = await import("@resvg/resvg-js");
    // Touch icons have no transparency on most platforms, so give the larger sizes a white square behind the mark.
    const svg = size === 48 ? LOGO_SVG : LOGO_SVG.replace('viewBox="0 0 32 32">', 'viewBox="-4 -4 40 40"><rect x="-4" y="-4" width="40" height="40" fill="#ffffff"/>');
    b = Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng());
    iconCache.set(size, b);
  }
  return b;
}

const siteCards = new Map<string, Buffer>();
/** The default share image for pages that have no score card of their own: wordmark, line, and a quiet constellation. */
export async function renderSiteCard(domain = "scbee.vercel.app", name = "ScBee"): Promise<Buffer> {
  const cached = siteCards.get(`${domain}|${name}`);
  if (cached) return cached;
  const [{ default: satori }, { Resvg }] = await Promise.all([import("satori"), import("@resvg/resvg-js")]);
  const pts: [number, number][] = [[250, 120], [410, 80], [560, 170], [330, 250], [500, 330], [180, 330], [420, 440], [600, 400]];
  const edges: [number, number][] = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [3, 5], [4, 6], [4, 7], [6, 7]];
  const dots = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="520" viewBox="0 0 780 520">${edges.map(([a, b]) => `<line x1="${pts[a]![0]}" y1="${pts[a]![1]}" x2="${pts[b]![0]}" y2="${pts[b]![1]}" stroke="#0d0d0d" stroke-opacity=".28" stroke-width="2" stroke-dasharray="6 7"/>`).join("")}${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 15 : 11}" fill="#0d0d0d"/><circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 24 : 19}" fill="none" stroke="#f2a20f" stroke-width="3"/>`).join("")}</svg>`;
  const tree = h("div", { width: 1200, height: 630, display: "flex", background: PAPER, color: INK, fontFamily: "Inter", padding: "64px" }, [
    h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560, height: 502 }, [
      h("div", { display: "flex", alignItems: "center", fontFamily: "Fraunces", fontSize: 40, fontWeight: 500 }, [h("div", { width: 28, height: 28, background: AMBER, borderRadius: 7, marginRight: 14 }), name]),
      h("div", { display: "flex", flexDirection: "column" }, [
        h("div", { fontFamily: "Fraunces", fontWeight: 300, fontSize: 84, lineHeight: 1.0, letterSpacing: -3 }, "Where agents find each other,"),
        h("div", { fontFamily: "Fraunces", fontWeight: 300, fontSize: 84, lineHeight: 1.05, letterSpacing: -3, marginTop: 4 }, "and send users their way."),
      ]),
      h("div", { fontSize: 24, color: MUTE, letterSpacing: 2 }, domain.toUpperCase()),
    ]),
    { type: "img", props: { src: `data:image/svg+xml;utf8,${encodeURIComponent(dots)}`, width: 560, height: 373, style: { marginLeft: 16, marginTop: 70 } } },
  ]);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: loadFonts() });
  const png = Buffer.from(new Resvg(svg).render().asPng());
  siteCards.set(`${domain}|${name}`, png);
  return png;
}
