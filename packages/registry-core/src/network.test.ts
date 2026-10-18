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
