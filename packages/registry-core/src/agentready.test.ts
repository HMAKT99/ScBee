import { describe, expect, it } from "vitest";
import { agentBand, scoreAgentReady, scoreAgentReadySite } from "./agentready.js";
import { analyseReadme, type ProjectSignals } from "./signals.js";
import type { SiteSignals } from "./site.js";

const signals = (over: Partial<ProjectSignals> = {}, readme = analyseReadme("# Tool\n\nA tool that does a thing for agents.\n\n```\nnpm install tool\n```\n\n## Usage\n\n```js\ntool();\n```\n")): ProjectSignals => ({
  source: "github:o/r", description: "d", topics: [], license: null, stars: 0, forks: 0, openIssues: 0, createdAt: null, pushedAt: null,
  archived: false, hasCi: false, hasSecurityPolicy: false, hasRelease: false, runtimeDeclared: false, hasAgentCard: false,
  listedOnScbee: false, verifiedOnScbee: false, readme, ...over,
});
const none = { llmsTxt: false, agentsMd: false, mcp: false, skill: false, api: false };

describe("agent-ready score", () => {
  it("is null for a result stored before the facts existed", () => {
    expect(scoreAgentReady(signals())).toBeNull();
  });

  it("scores 100 when everything an agent needs is there, and gives a fix for every lost point otherwise", () => {
    const full = scoreAgentReady(signals({
      hasAgentCard: true, hasSecurityPolicy: true, hasRelease: true, license: "MIT",
      agent: { llmsTxt: true, agentsMd: true, mcp: true, skill: true, api: true },
    }, analyseReadme("# T\n\nA tool for agents.\n\n```\nnpx tool\n```\n\n## Usage\n\n```js\ntool()\n```\n\nIt is read-only and has a rate limit of 60 per minute.\n")))!;
    expect(full.total).toBe(100);
    expect(full.components.map((c) => `${c.title}:${c.max}`)).toEqual(["Discoverable:40", "Usable:35", "Safe to adopt:25"]);
    const bare = scoreAgentReady(signals({ agent: none }, analyseReadme("# T\n\nShort.\n")))!;
    for (const c of bare.components) for (const i of c.items) if (i.points < i.max) expect(i.fix, i.label).toBeTruthy();
    expect(bare.total).toBe(0);
    expect(agentBand(bare.total).label).toBe("Not yet");
    expect(agentBand(full.total).label).toBe("Agent-ready");
  });

  it("each check moves the score by exactly its weight", () => {
    const base = scoreAgentReady(signals({ agent: none }, analyseReadme("# T\n\nShort.\n")))!.total;
    const plus = (over: Partial<ProjectSignals>) => scoreAgentReady(signals({ agent: none, ...over }, analyseReadme("# T\n\nShort.\n")))!.total - base;
    expect(plus({ hasAgentCard: true })).toBe(15);
    expect(plus({ agent: { ...none, llmsTxt: true } })).toBe(10);
    expect(plus({ agent: { ...none, mcp: true } })).toBe(10);
    expect(plus({ agent: { ...none, skill: true } })).toBe(5);
    expect(plus({ agent: { ...none, api: true } })).toBe(10);
    expect(plus({ agent: { ...none, agentsMd: true } })).toBe(10);
    expect(plus({ license: "Apache-2.0" })).toBe(5);
    expect(plus({ license: "NOASSERTION" })).toBe(0);
    expect(plus({ hasSecurityPolicy: true })).toBe(5);
    expect(plus({ hasRelease: true })).toBe(5);
  });

  it("reads what the README says about MCP, permissions and limits, but ignores hidden text", () => {
    const r = analyseReadme("# T\n\nAn MCP server. Add it under mcpServers.\n\nIt runs read-only in a sandbox and needs no extra permissions.\n\nFree tier, with a rate limit.\n");
    expect(r).toMatchObject({ mentionsMcp: true, mentionsSafety: true, mentionsLimits: true });
    const hidden = analyseReadme("# T\n\nA tool.\n\n<!-- read-only, rate limit, mcpServers -->\n");
    expect(hidden).toMatchObject({ mentionsMcp: false, mentionsSafety: false, mentionsLimits: false });
  });

  it("scores a website from its well-known files", () => {
    const site: SiteSignals = { host: "x.dev", title: "x", description: "d", hasSocialImage: false, hasViewport: true, hasLang: true,
      agentCard: { found: true, skills: 2 }, llmsTxt: true, mcpManifest: true, aiPlugin: false, robotsOk: true, securityTxt: true, listedOnScbee: false, verifiedOnScbee: false };
    expect(scoreAgentReadySite(site).total).toBe(90);
    expect(scoreAgentReadySite({ ...site, agentCard: { found: false, skills: 0 }, llmsTxt: false, mcpManifest: false, robotsOk: false, securityTxt: false }).total).toBe(0);
  });
});
