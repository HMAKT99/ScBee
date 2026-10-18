import { describe, expect, it } from "vitest";
import { degreesOfSeparation, possibleIntroductions } from "./index.js";

describe("possibleIntroductions", () => {
  it.each([[0, 0], [1, 0], [2, 1], [8, 28], [100, 4950]])("%i agents -> %i pairs", (n, p) => expect(possibleIntroductions(n)).toBe(p));
});

describe("degreesOfSeparation", () => {
  it("is null when nobody is connected", () => {
    expect(degreesOfSeparation([1, 2, 3], [])).toEqual({ average: null, reachable_pairs: 0, total_pairs: 3 });
  });
  it("a line of 4 agents: distances 1,1,1,2,2,3 average 10/6", () => {
    const d = degreesOfSeparation([1, 2, 3, 4], [[1, 2], [2, 3], [3, 4]]);
    expect(d).toEqual({ average: 1.67, reachable_pairs: 6, total_pairs: 6 });
  });
  it("only counts pairs that can reach each other", () => {
    const d = degreesOfSeparation([1, 2, 3, 4], [[1, 2], [3, 4]]);
    expect(d).toMatchObject({ average: 1, reachable_pairs: 2, total_pairs: 6 });
  });
  it("ignores self links, unknown agents and duplicates", () => {
    expect(degreesOfSeparation([1, 2], [[1, 1], [1, 9], [1, 2], [2, 1]])).toMatchObject({ average: 1, reachable_pairs: 1 });
  });
  it("a fully connected group is 1 link everywhere", () => {
    expect(degreesOfSeparation([1, 2, 3], [[1, 2], [2, 3], [1, 3]]).average).toBe(1);
  });
});

import { overlapEdges } from "./index.js";

describe("overlapEdges", () => {
  const n = (id: string, text: string, kind: "agent" | "project" = "agent") => ({ id, kind, text });
  it("links nodes that share at least two meaningful words, and says which", () => {
    const e = overlapEdges([n("a", "lint CLAUDE.md contradictions markdown"), n("b", "finds contradictions in CLAUDE.md files"), n("c", "pasta recipes")]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ a: "a", b: "b" });
    expect(e[0]!.why).toEqual(expect.arrayContaining(["claude.md", "contradictions"]));
  });
  it("never links two projects, and caps links per node", () => {
    const e = overlapEdges([n("p1", "vector search embeddings", "project"), n("p2", "vector search embeddings", "project")]);
    expect(e).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => n(`x${i}`, "vector search embeddings store"));
    const deg = new Map<string, number>();
    for (const x of overlapEdges(many, { perNode: 2 })) { deg.set(x.a, (deg.get(x.a) ?? 0) + 1); deg.set(x.b, (deg.get(x.b) ?? 0) + 1); }
    expect(Math.max(...deg.values())).toBeLessThanOrEqual(2);
  });
  it("is deterministic and empty for unrelated nodes", () => {
    const set = [n("a", "alpha beta gamma"), n("b", "alpha beta delta")];
    expect(overlapEdges(set)).toEqual(overlapEdges(set));
    expect(overlapEdges([n("a", "alpha beta"), n("b", "gamma delta")])).toEqual([]);
  });
});
