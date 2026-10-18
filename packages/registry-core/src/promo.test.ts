import { describe, expect, it } from "vitest";
import { matchAgents, messages, parsePromo, PROMO_LIMITS } from "./index.js";

const ok = { kind: "offer", title: "SQL rehearsal", body: "I show what a DELETE would remove before it runs." };

describe("parsePromo", () => {
  it("accepts a valid post and normalises tags", () => {
    const r = parsePromo({ ...ok, link: "https://example.com/x", tags: ["MCP", "safety"] });
    expect(r).toMatchObject({ ok: true, promo: { kind: "offer", tags: ["mcp", "safety"] } });
  });
  it("defaults tags to none", () => expect(parsePromo(ok)).toMatchObject({ ok: true, promo: { tags: [] } }));
  it.each([
    ["unknown kind", { ...ok, kind: "ad" }],
    ["short title", { ...ok, title: "ab" }],
    ["short body", { ...ok, body: "too short" }],
    ["long body", { ...ok, body: "x".repeat(301) }],
    ["multi-line title", { ...ok, title: "a\nb c" }],
    ["http link", { ...ok, link: "http://example.com" }],
    ["credentials in link", { ...ok, link: "https://u:p@example.com" }],
    ["too many tags", { ...ok, tags: ["a", "b", "c", "d", "e", "f"] }],
    ["bad tag", { ...ok, tags: ["has space"] }],
    ["invisible chars", { ...ok, body: "hello‮world, this is long enough" }],
    ["extra field", { ...ok, pin: true }],
  ])("rejects %s", (_n, v) => expect(parsePromo(v).ok).toBe(false));
});

describe("matchAgents", () => {
  const cands = [
    { id: 1, ownerKey: "github:a", text: "Lint CLAUDE.md and AGENTS.md files for contradictions" },
    { id: 2, ownerKey: "github:b", text: "Decision memory that flags contradictions and duplicates in code" },
    { id: 3, ownerKey: "github:c", text: "Union for agents: grievances and votes" },
    { id: 4, ownerKey: "github:poster", text: "Anything about contradictions" },
  ];
  const want = { title: "Need a CLAUDE.md checker", body: "Looking for something that finds contradictions in my agent instruction files", tags: ["claude"] };
  it("ranks by overlap, skips unrelated agents and the poster's own agents", () => {
    expect(matchAgents(want, "github:poster", cands)).toEqual([1, 2]);
  });
  it("respects the limit and is deterministic", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, ownerKey: `o${i}`, text: "contradictions checker" }));
    const a = matchAgents(want, "x", many, 5);
    expect(a).toHaveLength(5);
    expect(matchAgents(want, "x", many, 5)).toEqual(a);
  });
  it("returns nothing when nothing overlaps", () => {
    expect(matchAgents({ title: "Zebra", body: "quantum llamas wanted urgently", tags: [] }, "x", cands)).toEqual([]);
  });
});

describe("wantedMatch notification", () => {
  it("uses only fixed text and a link", () => {
    const m = messages.wantedMatch(7, "https://x");
    expect(m).toMatchObject({ kind: "wanted_match", ref: "promo:7", url: "https://x/board?kind=wanted#p7" });
    expect(m.body).not.toMatch(/\{|\$|undefined/);
  });
  it("limits are sane", () => expect(PROMO_LIMITS.perDay).toBeLessThanOrEqual(5));
});
