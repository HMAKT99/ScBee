import { describe, expect, it } from "vitest";
import { analyseReadme, buildEdges, categoriesOf, type GraphNode } from "./index.js";

const node = (key: string, over: Partial<GraphNode> = {}): GraphNode => ({
  key, name: key.slice(7), description: "", topics: [], dependencies: [], mentions: [], ...over,
});

describe("analyseReadme mentions", () => {
  it("collects GitHub links and install targets", () => {
    const r = analyseReadme("# x\n\nBuilt on [foo](https://github.com/Acme/Foo) and https://github.com/acme/bar.git.\n\n```\nnpm install @acme/widget\npip install requests\n```\n");
    expect(r.mentions).toEqual(expect.arrayContaining(["github:acme/foo", "github:acme/bar", "npm:@acme/widget", "pypi:requests"]));
  });
  it("is empty for no README", () => expect(analyseReadme(null).mentions).toEqual([]));
});

describe("categoriesOf", () => {
  it("uses topics and description", () => {
    expect(categoriesOf(node("github:a/b", { topics: ["mcp"], description: "OAuth login for apps" })).sort()).toEqual(["auth", "mcp"]);
  });
});

describe("buildEdges", () => {
  const center = node("github:me/lib", { npmPackage: "lib", topics: ["scraper", "crawler"], description: "A fast scraper" });

  it("DEPENDS_ON in both directions with weight 1", () => {
    const up = node("github:u/up", { npmPackage: "up" });
    const down = node("github:d/down", { dependencies: ["npm:lib"] });
    const e = buildEdges({ ...center, dependencies: ["npm:up"] }, [up, down]);
    expect(e.filter((x) => x.type === "DEPENDS_ON").map((x) => [x.from, x.to])).toEqual(expect.arrayContaining([["github:me/lib", "github:u/up"], ["github:d/down", "github:me/lib"]]));
    expect(e[0]!.weight).toBe(1);
  });
  it("COMPOSES_WITH via README mention, with a reason naming both", () => {
    const e = buildEdges(center, [node("github:o/other", { mentions: ["npm:lib"] })]);
    expect(e[0]).toMatchObject({ type: "COMPOSES_WITH", weight: 0.8 });
    expect(e[0]!.reason).toMatch(/o\/other.*mentions.*me\/lib/);
  });
  it("COMPOSES_WITH via complementary categories", () => {
    const e = buildEdges(center, [node("github:o/store", { topics: ["vector", "embeddings"] })]);
    expect(e[0]).toMatchObject({ type: "COMPOSES_WITH", weight: 0.5 });
    expect(e[0]!.reason).toMatch(/scraping.*vector search/);
  });
  it("ALTERNATIVE_TO needs strong topic overlap in the same category, and is capped", () => {
    const alts = ["a", "b", "c", "d"].map((n) => node(`github:o/${n}`, { topics: ["scraper", "crawler", "python"] }));
    const e = buildEdges(center, alts);
    expect(e.filter((x) => x.type === "ALTERNATIVE_TO")).toHaveLength(2);
    expect(buildEdges(center, [node("github:o/weak", { topics: ["scraper"] })])).toEqual([]);
  });
  it("ENDORSED_BY comes only from verdicts and grows with independent owners", () => {
    const o = node("github:o/x");
    expect(buildEdges(center, [o])).toEqual([]);
    const one = buildEdges(center, [o], [{ from: center.key, to: o.key, owners: 1 }]);
    const three = buildEdges(center, [o], [{ from: o.key, to: center.key, owners: 3 }]);
    expect(one[0]).toMatchObject({ type: "ENDORSED_BY" });
    expect(three[0]!.weight).toBeGreaterThan(one[0]!.weight);
  });
  it("ignores unrelated projects and itself, is sorted strongest first, and capped", () => {
    const many = Array.from({ length: 30 }, (_, i) => node(`github:o/p${i}`, { topics: ["vector"] }));
    const e = buildEdges(center, [center, node("github:z/none", { topics: ["cooking"] }), ...many], [], { max: 5 });
    expect(e).toHaveLength(5);
    expect(e.every((x) => x.to !== center.key && x.to !== "github:z/none")).toBe(true);
    expect([...e].sort((a, b) => b.weight - a.weight)).toEqual(e);
  });
});
