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

const PAPER = "#f6f3eb", INK = "#12120f", MUTE = "#77746a", AMBER = "#f2a20f";

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
