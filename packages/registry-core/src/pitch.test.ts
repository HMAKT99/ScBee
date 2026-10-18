import { describe, expect, it } from "vitest";
import { analyseReadme, draftCard, fetchDraftSignals, mergeCard, parseCard, parseProfile, ProjectError, type ProjectSignals } from "./index.js";

describe("card pitch fields", () => {
  it("accepts tagline, best_for, install and tags", () => {
    const r = parseCard({ name: "X", tagline: "Does a thing", best_for: ["coding agents"], install: "npx x init", tags: ["mcp"], skills: [] });
    expect(r).toMatchObject({ ok: true, card: { tagline: "Does a thing", install: "npx x init", tags: ["mcp"] } });
  });
  it.each([
    ["multi-line install", { name: "X", install: "a\nb" }],
    ["long tagline", { name: "X", tagline: "x".repeat(121) }],
    ["too many best_for", { name: "X", best_for: ["a", "b", "c", "d", "e", "f"] }],
    ["invisible chars", { name: "X", tagline: "hi‮there" }],
  ])("rejects %s", (_n, v) => expect(parseCard(v).ok).toBe(false));
});

describe("profile overrides", () => {
  const base = parseCard({ name: "Repo", description: "from the repo", skills: [{ id: "a", name: "A" }] });
  const card = base.ok ? base.card : (null as never);
  it("only provided fields override; skills replace the list", () => {
    const p = parseProfile({ tagline: "Better pitch", skills: [{ id: "b", name: "B", description: "does b" }] });
    expect(p.ok).toBe(true);
    const m = mergeCard(card, p.ok ? p.profile : null);
    expect(m).toMatchObject({ name: "Repo", description: "from the repo", tagline: "Better pitch" });
    expect(m.skills.map((s) => s.id)).toEqual(["b"]);
  });
  it("no profile means the base card", () => expect(mergeCard(card, null)).toEqual(card));
  it("rejects unknown keys and bad values", () => {
    expect(parseProfile({ evil: "x" }).ok).toBe(false);
    expect(parseProfile({ install: "a\nb" }).ok).toBe(false);
    expect(parseProfile({}).ok).toBe(true);
  });
});

describe("README facts for drafting", () => {
  it("captures the first install command and summary, without markup", () => {
    const r = analyseReadme("# T\n\n**Rehearse** anything [before](https://x.dev) your agent does it, safely and locally.\n\n```bash\n$ npx dry-run-agents setup   # detects your agents\nnpm i -g other\n```\n");
    expect(r.installCommand).toBe("npx dry-run-agents setup");
    expect(r.summary).toBe("Rehearse anything before your agent does it, safely and locally.");
  });
  it("has nulls when there is nothing", () => {
    expect(analyseReadme(null)).toMatchObject({ installCommand: null, summary: null });
    expect(analyseReadme("# Only a heading\n").installCommand).toBeNull();
  });
});

const sig = (over: Partial<ProjectSignals> = {}): ProjectSignals => ({
  source: "github:o/r", description: "Rehearse risky agent actions. Returns safe, confirm or block.", homepage: "https://www.npmjs.com/package/dry-run-agents",
  topics: ["mcp", "safety"], license: "MIT", stars: 1, forks: 0, openIssues: 0, createdAt: null, pushedAt: null, archived: false, hasCi: false,
  hasSecurityPolicy: false, hasRelease: false, runtimeDeclared: false, hasAgentCard: false, listedOnScbee: false, verifiedOnScbee: false,
  readme: analyseReadme("# x\n\n```\nnpx dry-run-agents setup\n```\n"), ...over,
});

describe("draftCard", () => {
  it("drafts from public facts and never invents skills", () => {
    const c = draftCard(sig(), "DryRun");
    expect(c).toMatchObject({ name: "DryRun", tagline: "Rehearse risky agent actions.", install: "npx dry-run-agents setup", url: "https://www.npmjs.com/package/dry-run-agents", tags: ["mcp", "safety"] });
    expect(c.skills).toEqual([]);
  });
  it("falls back to the README summary, then to an npm install line, and survives odd input", () => {
    expect(draftCard(sig({ description: null, readme: analyseReadme("# x\n\nA plain sentence about what this does for you.\n") }), "R").description).toMatch(/plain sentence/);
    expect(draftCard(sig({ npmPackage: "pkg", readme: analyseReadme(null), homepage: null }), "R")).toMatchObject({ install: "npm install pkg", url: "https://www.npmjs.com/package/pkg" });
    expect(draftCard(sig({ description: "bad‮text" }), "R").name).toBe("R");
  });
  it("is deterministic", () => expect(draftCard(sig(), "A")).toEqual(draftCard(sig(), "A")));
});

describe("fetchDraftSignals", () => {
  const lookup = async () => [{ address: "140.82.112.5", family: 4 }];
  const api = "https://api.github.com/repos/o/r";
  const mk = (files: Record<string, { status: number; body: string }>) => ({ lookup, requester: async (r: { url: URL }) => files[r.url.toString()] ?? { status: 404, body: "" } });
  it("reads metadata and README in two calls", async () => {
    const md = "# T\n\nHello there, this is a tool.\n\n```\nnpx t\n```\n";
    const s = await fetchDraftSignals("o", "r", mk({
      [api]: { status: 200, body: JSON.stringify({ full_name: "O/R", description: "d", homepage: "http://insecure.example", topics: ["a"] }) },
      [`${api}/readme`]: { status: 200, body: JSON.stringify({ encoding: "base64", content: Buffer.from(md).toString("base64") }) },
    }));
    expect(s).toMatchObject({ fullName: "O/R", description: "d", homepage: null, topics: ["a"] });
    expect(s.readme.installCommand).toBe("npx t");
  });
  it("404 means missing or private; 403 means rate limited", async () => {
    await expect(fetchDraftSignals("o", "r", mk({}))).rejects.toMatchObject({ status: 404 });
    const e = await fetchDraftSignals("o", "r", mk({ [api]: { status: 403, body: "" } })).catch((x) => x);
    expect(e).toBeInstanceOf(ProjectError);
    expect(e.status).toBe(429);
  });
});
