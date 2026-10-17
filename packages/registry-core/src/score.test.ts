import { describe, expect, it } from "vitest";
import { analyseReadme, scoreProject, SCORE_VERSION, WEIGHTS, band, fetchGithubSignals, ProjectError, type ProjectSignals } from "./index.js";

const NOW = Date.parse("2026-10-17T00:00:00Z");
const GOOD_README = `# Thing

A tiny tool that rehearses risky agent actions before they run.

![demo](docs/demo.gif)

## Install

\`\`\`bash
npx thing init
\`\`\`

## Usage

\`\`\`js
import { thing } from "thing";
thing("hello");
\`\`\`

## License
MIT
`;
const base = (over: Partial<ProjectSignals> = {}): ProjectSignals => ({
  source: "github:a/b", description: "Rehearse risky agent actions", topics: ["agents", "mcp", "safety"], license: "MIT",
  stars: 0, forks: 0, openIssues: 0, createdAt: "2026-10-16T00:00:00Z", pushedAt: "2026-10-16T00:00:00Z", archived: false,
  hasCi: true, hasSecurityPolicy: false, hasRelease: false, runtimeDeclared: true, hasAgentCard: false,
  listedOnScbee: false, verifiedOnScbee: false, readme: analyseReadme(GOOD_README), ...over,
});

describe("analyseReadme", () => {
  it("reads a good README", () => {
    const r = analyseReadme(GOOD_README);
    expect(r).toMatchObject({ present: true, hasInstallCommand: true, hasUsageExample: true, hasMedia: true, hasSummary: true });
    expect(r.headings).toBeGreaterThanOrEqual(3);
    expect(r.installPosition).toBeLessThan(0.5);
  });
  it("handles missing README", () => {
    expect(analyseReadme(null).present).toBe(false);
    expect(analyseReadme("   ").present).toBe(false);
  });
  it("ignores hidden HTML comments (cannot game the score)", () => {
    const r = analyseReadme("# x\n<!-- \n```\nnpm install me\n```\n-->\nshort");
    expect(r.hasInstallCommand).toBe(false);
  });
  it("counts required env vars", () => {
    expect(analyseReadme("# x\n```\nOPENAI_API_KEY=1\nSTRIPE_SECRET=2\nDATABASE_URL=3\n```").envVars).toBe(3);
  });
});

describe("scoreProject", () => {
  it("weights sum to 100", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("a day-one project with zero stars and a great README scores at least 70", () => {
    const r = scoreProject(base(), NOW);
    expect(r.total).toBeGreaterThanOrEqual(70);
    expect(r.version).toBe(SCORE_VERSION);
  });
  it("component maxima match the weights and points never exceed them", () => {
    const r = scoreProject(base(), NOW);
    for (const c of r.components) {
      expect(c.max).toBe(WEIGHTS[c.id]);
      expect(c.items.reduce((n, i) => n + i.max, 0)).toBe(c.max);
      expect(c.score).toBeLessThanOrEqual(c.max);
    }
  });
  it("every lost point comes with a concrete fix", () => {
    const r = scoreProject(base({ license: null, hasCi: false, readme: analyseReadme(null) }), NOW);
    for (const c of r.components) for (const i of c.items) if (i.points < i.max) expect(i.fix, i.label).toBeTruthy();
  });
  it("missing README and license scores low and explains why", () => {
    const r = scoreProject(base({ license: null, readme: analyseReadme(null), description: null, topics: [], hasCi: false, runtimeDeclared: false }), NOW);
    expect(r.total).toBeLessThan(40);
    const msgs = r.components.flatMap((c) => c.items.map((i) => i.reason + (i.fix ?? "")));
    expect(msgs.join(" ")).toMatch(/No README/);
    expect(msgs.join(" ")).toMatch(/No license/);
  });
  it("does not penalise very new projects for low growth, but does penalise old stagnant ones", () => {
    const young = scoreProject(base(), NOW).components.find((c) => c.id === "momentum")!.score;
    const old = scoreProject(base({ createdAt: "2024-01-01T00:00:00Z", pushedAt: "2025-01-01T00:00:00Z" }), NOW).components.find((c) => c.id === "momentum")!.score;
    expect(young).toBeGreaterThan(old);
  });
  it("velocity beats raw totals: a young fast-growing repo scores momentum like an old big one", () => {
    const fast = scoreProject(base({ createdAt: "2026-06-01T00:00:00Z", stars: 400 }), NOW).components.find((c) => c.id === "momentum")!.score;
    expect(fast).toBeGreaterThanOrEqual(7);
  });
  it("bands", () => {
    expect(band(85).label).toBe("Launch ready");
    expect(band(10).label).toBe("Early");
  });
});

describe("fetchGithubSignals", () => {
  const lookup = async () => [{ address: "140.82.112.5", family: 4 }];
  const mk = (files: Record<string, { status: number; body: string }>) => ({
    lookup,
    requester: async (r: { url: URL }, o: { headers?: Record<string, string> }) => {
      seen.push({ url: r.url.toString(), auth: o.headers?.authorization });
      return files[r.url.toString()] ?? { status: 404, body: "" };
    },
  });
  const seen: { url: string; auth?: string }[] = [];
  const api = "https://api.github.com/repos/o/r";
  const files = {
    [api]: { status: 200, body: JSON.stringify({ description: "d", topics: ["a"], license: { spdx_id: "MIT" }, stargazers_count: 3, created_at: "2026-10-01T00:00:00Z", pushed_at: "2026-10-10T00:00:00Z" }) },
    [`${api}/contents`]: { status: 200, body: JSON.stringify([{ name: "README.md", type: "file" }, { name: "SECURITY.md", type: "file" }, { name: "package.json", type: "file" }]) },
    [`${api}/contents/.github`]: { status: 200, body: JSON.stringify([{ name: "workflows", type: "dir" }]) },
    "https://raw.githubusercontent.com/o/r/HEAD/README.md": { status: 200, body: GOOD_README },
    "https://raw.githubusercontent.com/o/r/HEAD/package.json": { status: 200, body: JSON.stringify({ engines: { node: ">=20" } }) },
  };

  it("collects signals from the GitHub API and raw files, sending the token only to the API", async () => {
    seen.length = 0;
    const s = await fetchGithubSignals("o", "r", { listed: true, verified: false }, mk(files), "ghp_test");
    expect(s).toMatchObject({ license: "MIT", stars: 3, hasCi: true, hasSecurityPolicy: true, runtimeDeclared: true, listedOnScbee: true });
    expect(s.readme.hasInstallCommand).toBe(true);
    expect(seen.find((x) => x.url === api)?.auth).toBe("Bearer ghp_test");
    expect(seen.filter((x) => x.url.startsWith("https://raw.")).every((x) => x.auth === undefined)).toBe(true);
  });
  it("404 means not found / private", async () => {
    await expect(fetchGithubSignals("o", "r", { listed: false, verified: false }, mk({}))).rejects.toMatchObject({ status: 404 });
  });
  it("rate limiting is reported as 429", async () => {
    const e = await fetchGithubSignals("o", "r", { listed: false, verified: false }, mk({ [api]: { status: 403, body: "" } })).catch((x) => x);
    expect(e).toBeInstanceOf(ProjectError);
    expect(e.status).toBe(429);
  });
});
