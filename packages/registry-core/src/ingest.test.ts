import { describe, expect, it } from "vitest";
import { analyseHtml, fetchNpmFacts, fetchSiteSignals, githubFromRepository, parseHost, parseNpmInput, robotsAllows, scoreSite, SiteError, SITE_SCORE_VERSION, scoreProject, analyseReadme, type ProjectSignals } from "./index.js";

describe("npm input and repo URLs", () => {
  it.each([
    ["https://www.npmjs.com/package/left-pad", "left-pad"],
    ["https://npmjs.com/package/@scope/pkg/v/1.0.0", "@scope/pkg"],
    ["npm:Some-Pkg", "some-pkg"],
    ["@scope/pkg", "@scope/pkg"],
    ["plain", "plain"],
  ])("parses %s", (i, out) => expect(parseNpmInput(i)).toBe(out));
  it.each(["", "has space", "a/b/c", "../x", "x".repeat(300)])("rejects %j", (i) => expect(parseNpmInput(i)).toBeNull());

  it.each([
    ["git+https://github.com/Foo/Bar.git", "foo", "bar"],
    ["https://github.com/foo/bar", "foo", "bar"],
    ["git://github.com/foo/bar.git", "foo", "bar"],
    ["git@github.com:foo/bar.git", "foo", "bar"],
    ["github:foo/bar", "foo", "bar"],
    ["foo/bar", "foo", "bar"],
    [{ type: "git", url: "git+https://github.com/foo/bar.git#main" }, "foo", "bar"],
  ])("finds the GitHub repo in %j", (r, o, n) => expect(githubFromRepository(r)).toEqual({ owner: o, repo: n }));
  it.each(["https://gitlab.com/foo/bar", "https://example.com/foo/bar", undefined, "", 5])("ignores non-GitHub %j", (r) => expect(githubFromRepository(r)).toBeNull());
});

const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const mk = (files: Record<string, string>) => ({ lookup, requester: async (r: { url: URL }) => (files[r.url.toString()] === undefined ? { status: 404, body: "" } : { status: 200, body: files[r.url.toString()]! }) });

describe("fetchNpmFacts", () => {
  it("reads manifest and downloads, and finds the repo", async () => {
    const f = await fetchNpmFacts("@s/p", mk({
      "https://registry.npmjs.org/@s%2Fp/latest": JSON.stringify({ name: "@s/p", description: "d", license: "MIT", engines: { node: ">=20" }, bin: { p: "x.js" }, repository: { url: "git+https://github.com/s/p.git" } }),
      "https://api.npmjs.org/downloads/point/last-month/@s%2Fp": JSON.stringify({ downloads: 1234 }),
    }));
    expect(f).toMatchObject({ name: "@s/p", engines: true, hasBin: true, downloadsLastMonth: 1234, repo: { owner: "s", repo: "p" } });
  });
  it("returns null when missing or the name does not match", async () => {
    expect(await fetchNpmFacts("nope", mk({}))).toBeNull();
    expect(await fetchNpmFacts("a", mk({ "https://registry.npmjs.org/a/latest": JSON.stringify({ name: "other" }) }))).toBeNull();
    expect(await fetchNpmFacts("Bad Name!", mk({}))).toBeNull();
  });
});

describe("npm downloads drive growth for older projects", () => {
  const base = (over: Partial<ProjectSignals>): ProjectSignals => ({
    source: "github:a/b", description: "x".repeat(20), topics: [], license: "MIT", stars: 2, forks: 0, openIssues: 0, createdAt: "2024-01-01T00:00:00Z",
    pushedAt: "2026-10-01T00:00:00Z", archived: false, hasCi: true, hasSecurityPolicy: false, hasRelease: true, runtimeDeclared: true, hasAgentCard: false,
    listedOnScbee: false, verifiedOnScbee: false, readme: analyseReadme(null), ...over,
  });
  const growth = (s: ProjectSignals) => scoreProject(s, Date.parse("2026-10-17")).components.find((c) => c.id === "momentum")!.items[0]!;
  it("counts downloads when they beat star growth", () => {
    expect(growth(base({ npmPackage: "b", npmDownloadsMonthly: 25_000 })).points).toBe(7);
    expect(growth(base({ npmPackage: "b", npmDownloadsMonthly: 25_000 })).reason).toMatch(/npm downloads/);
    expect(growth(base({})).points).toBeLessThan(7);
  });
});

describe("analyseHtml", () => {
  it("extracts title, description, social image, viewport, lang and ignores commented-out tags", () => {
    const h = analyseHtml(`<html lang="en"><head><title> My &amp; Site </title><meta name="description" content="Agents that file taxes for you, in plain English.">
      <meta property="og:image" content="/x.png"><meta name="viewport" content="width=device-width"><!-- <meta name="description" content="hidden"> --></head></html>`);
    expect(h).toEqual({ title: "My & Site", description: "Agents that file taxes for you, in plain English.", hasSocialImage: true, hasViewport: true, hasLang: true });
  });
  it("strips control and bidi characters from extracted text", () => {
    expect(analyseHtml("<title>a‮b​c</title>").title).toBe("a b c");
  });
  it("returns empties for junk", () => {
    expect(analyseHtml("not html")).toMatchObject({ title: null, description: null, hasSocialImage: false });
  });
});

describe("robotsAllows", () => {
  it("allows when there is no robots.txt or no matching group", () => {
    expect(robotsAllows(null)).toBe(true);
    expect(robotsAllows("User-agent: googlebot\nDisallow: /")).toBe(true);
  });
  it("blocks when * disallows everything, unless our agent has its own group", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /\n\nUser-agent: scbee\nAllow: /")).toBe(true);
    expect(robotsAllows("User-agent: scbee\nDisallow: /")).toBe(false);
  });
  it("honours more specific Allow and partial Disallow", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /private")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /\nAllow: /")).toBe(true);
  });
});

describe("parseHost", () => {
  it.each([["https://Example.com/x", "example.com"], ["sub.example.co.uk", "sub.example.co.uk"]])("accepts %s", (i, o) => expect(parseHost(i)).toBe(o));
  it.each(["localhost", "127.0.0.1", "a", "exa mple.com", "http://x.com:8080", "user@x.com", "x.c"])("rejects %s", (i) => expect(parseHost(i)).toBeNull());
});

describe("fetchSiteSignals and scoreSite", () => {
  const origin = "https://good.dev";
  const files = {
    [`${origin}/robots.txt`]: "User-agent: *\nAllow: /",
    [`${origin}/`]: `<html lang="en"><head><title>Good</title><meta name="description" content="A site that does one useful thing very well, honestly."><meta property="og:image" content="/i.png"><meta name="viewport" content="x"></head></html>`,
    [`${origin}/.well-known/agent-card.json`]: JSON.stringify({ name: "Good", skills: [{ id: "a", name: "A" }] }),
    [`${origin}/llms.txt`]: "# Good\n> A site that does one useful thing.",
    [`${origin}/.well-known/security.txt`]: "Contact: mailto:s@good.dev",
  };
  it("collects signals and scores a well-prepared site highly with fixes for the rest", async () => {
    const s = await fetchSiteSignals("good.dev", { listed: false, verified: false }, mk(files));
    expect(s).toMatchObject({ title: "Good", llmsTxt: true, securityTxt: true, mcpManifest: false, agentCard: { found: true, skills: 1 } });
    const r = scoreSite(s);
    expect(r.version).toBe(SITE_SCORE_VERSION);
    expect(r.components.reduce((n, c) => n + c.max, 0)).toBe(100);
    expect(r.total).toBeGreaterThan(70);
    for (const c of r.components) for (const i of c.items) if (i.points < i.max) expect(i.fix).toBeTruthy();
  });
  it("respects robots.txt", async () => {
    const e = await fetchSiteSignals("good.dev", { listed: false, verified: false }, mk({ ...files, [`${origin}/robots.txt`]: "User-agent: *\nDisallow: /" })).catch((x) => x);
    expect(e).toBeInstanceOf(SiteError);
    expect(e.status).toBe(403);
  });
  it("refuses private hosts", async () => {
    const e = await fetchSiteSignals("internal.dev", { listed: false, verified: false }, { lookup: async () => [{ address: "10.0.0.5", family: 4 }], requester: async () => ({ status: 200, body: "x" }) }).catch((x) => x);
    expect(e).toBeInstanceOf(SiteError);
    expect(e.status).toBe(400);
  });
  it("404 when the homepage cannot be loaded", async () => {
    const e = await fetchSiteSignals("good.dev", { listed: false, verified: false }, mk({})).catch((x) => x);
    expect(e.status).toBe(404);
  });
});
