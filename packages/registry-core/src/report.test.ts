import { describe, expect, it } from "vitest";
import { agentReadyReport } from "./report.js";
import { missingFiles, missingSiteFiles } from "./generate.js";
import type { SiteSignals } from "./site.js";
import { analyseReadme, type ProjectSignals } from "./signals.js";

const sig = (over: Partial<ProjectSignals> = {}): ProjectSignals => ({
  source: "github:o/r", fullName: "o/r", description: "A tool for agents", topics: [], license: "MIT", stars: 1, forks: 0, openIssues: 0, createdAt: null, pushedAt: null,
  archived: false, hasCi: false, hasSecurityPolicy: false, hasRelease: false, runtimeDeclared: false, hasAgentCard: false,
  listedOnScbee: false, verifiedOnScbee: false, readme: analyseReadme("# r\n\nA tool.\n"),
  agent: { llmsTxt: false, agentsMd: false, mcp: false, skill: false, api: false }, ...over,
});

describe("agent-readiness report", () => {
  it("counts totals only, most commonly missing first, and skips results without Agent-Ready facts", () => {
    const r = agentReadyReport([
      { signals: sig(), total: 50 },
      { signals: sig({ agent: { llmsTxt: true, agentsMd: false, mcp: false, skill: false, api: false } }), total: 70 },
      { signals: sig({ agent: undefined }), total: 90 },
    ]);
    expect(r.n).toBe(2);
    expect(r.avgReadiness).toBe(60);
    expect(r.checks.find((c) => c.label === "llms.txt")).toMatchObject({ passing: 1, pct: 50 });
    expect(r.checks.find((c) => c.label === "Licence")).toMatchObject({ passing: 2, pct: 100 });
    expect(r.checks[0]!.pct).toBeLessThanOrEqual(r.checks.at(-1)!.pct);
    expect(JSON.stringify(r)).not.toContain("o/r");
  });
  it("is empty, not invented, with no data", () => {
    expect(agentReadyReport([])).toEqual({ n: 0, avgReadiness: 0, avgAgentReady: 0, checks: [] });
  });
});

describe("file generator", () => {
  it("writes only the files a project is missing, with TODO where the owner must answer", () => {
    const all = missingFiles(sig());
    expect(all.map((f) => f.file)).toEqual(["llms.txt", "AGENTS.md", "agent.json", "SECURITY.md"]);
    expect(all[0]!.content).toContain("> A tool for agents");
    expect(all[1]!.content).toContain("TODO");
    expect(JSON.parse(all[2]!.content).name).toBe("r");
    const some = missingFiles(sig({ hasAgentCard: true, hasSecurityPolicy: true, agent: { llmsTxt: true, agentsMd: false, mcp: false, skill: false, api: false } }));
    expect(some.map((f) => f.file)).toEqual(["AGENTS.md"]);
  });
  it("collapses whitespace and caps the description it copies", () => {
    const f = missingFiles(sig({ description: `line one\n\n${"x".repeat(500)}` }))[0]!;
    expect(f.content.split("\n")[2]!.length).toBeLessThan(220);
    expect(f.content).not.toMatch(/line one\n/);
  });
});

describe("website file generator", () => {
  const site = (over: Partial<SiteSignals> = {}): SiteSignals => ({
    host: "shop.example.dev", title: "Shop", description: "Buy things", hasSocialImage: false, hasViewport: false, hasLang: false,
    agentCard: { found: false, skills: 0 }, llmsTxt: false, mcpManifest: false, aiPlugin: false, robotsOk: true, securityTxt: false,
    listedOnScbee: false, verifiedOnScbee: false, ...over,
  });
  it("writes only what the site is missing, each with where to serve it", () => {
    const all = missingSiteFiles(site(), Date.UTC(2026, 0, 1));
    expect(all.map((f) => f.file)).toEqual(["llms.txt", "agent-card.json", "security.txt", "HTML head"]);
    expect(all.map((f) => f.at)).toEqual(["/llms.txt", "/.well-known/agent-card.json", "/.well-known/security.txt", "your page template"]);
    expect(all[0]!.content).toContain("> Buy things");
    expect(JSON.parse(all[1]!.content).url).toBe("https://shop.example.dev");
    expect(all[2]!.content).toContain("Expires: 2026-11-27");
    expect(all[3]!.content).toContain("viewport");
    expect(missingSiteFiles(site({ llmsTxt: true, securityTxt: true, hasViewport: true, hasLang: true, agentCard: { found: true, skills: 1 } }))).toEqual([]);
  });
});
