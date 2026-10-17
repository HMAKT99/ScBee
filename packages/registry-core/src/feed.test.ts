import { describe, expect, it } from "vitest";
import { rankFeed, terms, type FeedCandidate } from "./index.js";

const c = (key: string, text: string, evaluations = 0, seenAt = 1): FeedCandidate => ({ key, text, evaluations, seenAt });

describe("terms", () => {
  it("lowercases, drops stop words and short tokens", () => {
    expect([...terms("The Vector Store for agents, in TS")]).toEqual(["vector", "store"]);
  });
});

describe("rankFeed", () => {
  const popular = Array.from({ length: 6 }, (_, i) => c(`github:p/p${i}`, "vector database embeddings search", 50, 100 + i));
  const fresh = c("github:n/new", "something unrelated entirely", 0, 999);

  it("puts relevant projects first", () => {
    const r = rankFeed("vector search embeddings", [c("github:a/x", "cooking recipes"), c("github:a/y", "vector search"), c("github:a/z", "vector")], 3, 0);
    expect(r.map((i) => i.key)).toEqual(["github:a/y", "github:a/z", "github:a/x"]);
    expect(r[0]!.reason).toBe("match");
  });
  it("guarantees exploration slots for brand-new projects even when nothing matches", () => {
    const r = rankFeed("vector search embeddings", [...popular, fresh], 5, 2);
    expect(r.map((i) => i.key)).toContain("github:n/new");
    expect(r.find((i) => i.key === "github:n/new")!.reason).toBe("exploration");
    expect(r).toHaveLength(5);
  });
  it("never repeats a project and respects the limit", () => {
    const r = rankFeed("vector", [...popular, fresh], 4, 3);
    expect(new Set(r.map((i) => i.key)).size).toBe(r.length);
    expect(r.length).toBeLessThanOrEqual(4);
  });
  it("is deterministic", () => {
    expect(rankFeed("vector", [...popular, fresh])).toEqual(rankFeed("vector", [...popular, fresh]));
  });
  it("handles an empty candidate list", () => {
    expect(rankFeed("x", [])).toEqual([]);
  });
});
