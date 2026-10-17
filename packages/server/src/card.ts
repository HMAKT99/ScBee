import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { band, type ScoreResult } from "@scbee/registry-core";

const require = createRequire(import.meta.url);
type Font = { name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" };
let fonts: Font[] | undefined;
const loadFonts = (): Font[] =>
  (fonts ??= ([400, 700, 800] as const).map((weight) => ({
    name: "Inter", weight, style: "normal" as const,
    data: readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
  })));

const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });

/** 1200x630 share card as PNG (X and LinkedIn do not render SVG cards). */
export async function renderCard(owner: string, repo: string, r: ScoreResult): Promise<Buffer> {
  const [{ default: satori }, { Resvg }] = await Promise.all([import("satori"), import("@resvg/resvg-js")]);
  const b = band(r.total);
  const name = `${owner}/${repo}`;
  const tree = h("div", { width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#0d0c0a", color: "#f2efe8", fontFamily: "Inter" }, [
    h("div", { display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700 }, [
      h("div", { width: 18, height: 18, borderRadius: 4, background: "#f5a524", marginRight: 14 }),
      "ScBee launch readiness",
    ]),
    h("div", { display: "flex", alignItems: "center" }, [
      h("div", { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: 260, height: 260, borderRadius: 130, border: `18px solid ${b.color}`, marginRight: 56 }, [
        h("div", { fontSize: 104, fontWeight: 800, lineHeight: 1 }, String(r.total)),
        h("div", { fontSize: 26, color: "#a09a8d" }, "out of 100"),
      ]),
      h("div", { display: "flex", flexDirection: "column", flex: 1 }, [
        h("div", { fontSize: name.length > 28 ? 46 : 62, fontWeight: 800, lineHeight: 1.1, wordBreak: "break-all" }, name),
        h("div", { fontSize: 36, fontWeight: 700, color: b.color, marginTop: 14 }, b.label),
      ]),
    ]),
    h("div", { display: "flex", flexWrap: "wrap" }, r.components.map((c) =>
      h("div", { display: "flex", fontSize: 26, color: "#a09a8d", marginRight: 34 }, `${c.title} ${c.score}/${c.max}`))),
  ]);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: loadFonts() });
  return Buffer.from(new Resvg(svg).render().asPng());
}
