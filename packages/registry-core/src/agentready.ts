import type { ScoreComponent, ScoreItem, ScoreResult } from "./score.js";
import type { ProjectSignals } from "./signals.js";
import type { SiteSignals } from "./site.js";

/**
 * "Can an agent use this?" Separate from launch readiness: it asks whether a project is easy for other agents and their owners
 * to find, install and trust. Deterministic rules over public facts, no model. Each lost point comes with a concrete fix.
 */
export const AGENT_READY_VERSION = "1";

/** File and README facts gathered with the other project signals. */
export interface AgentFacts {
  llmsTxt: boolean;
  /** AGENTS.md, CLAUDE.md, .cursorrules or Copilot instructions: instructions for coding agents that work in the repo. */
  agentsMd: boolean;
  /** An MCP manifest or config file, or a README that documents an MCP server. */
  mcp: boolean;
  skill: boolean;
  /** An OpenAPI or Swagger file in the repo root. */
  api: boolean;
}

export function agentBand(total: number): { label: string; color: string } {
  if (total >= 80) return { label: "Agent-ready", color: "#2da44e" };
  if (total >= 60) return { label: "Almost", color: "#dfb317" };
  if (total >= 40) return { label: "Partly", color: "#fe7d37" };
  return { label: "Not yet", color: "#e05d44" };
}

const it = (label: string, ok: boolean, max: number, good: string, bad: string, fix: string): ScoreItem =>
  ok ? { label, points: max, max, reason: good } : { label, points: 0, max, reason: bad, fix };
const sum = (items: ScoreItem[]) => items.reduce((n, i) => n + i.points, 0);
const maxOf = (items: ScoreItem[]) => items.reduce((n, i) => n + i.max, 0);
const comp = (id: string, title: string, items: ScoreItem[]): ScoreComponent => ({ id: id as ScoreComponent["id"], title, score: sum(items), max: maxOf(items), items });

/** Null when the project was scored before these facts were collected (it is re-read on the next visit). */
export function scoreAgentReady(s: ProjectSignals): ScoreResult | null {
  const a = s.agent;
  if (!a) return null;
  const r = s.readme;
  const discoverable = [
    it("Agent card", s.hasAgentCard, 15, "Has an agent.json or agent card other agents can read.", "No agent card.", "Add an agent.json (name, what it does, skills) at the repo root, or serve /.well-known/agent-card.json."),
    it("llms.txt", a.llmsTxt, 10, "Has an llms.txt for language models.", "No llms.txt.", "Add llms.txt at the repo root: a short, plain description and links to your key docs."),
    it("MCP server config", a.mcp, 10, "Documents or ships an MCP server config.", "No MCP config or documentation found.", "If it is an MCP server, add a server.json or a README block showing the mcpServers config."),
    it("Agent Skill", a.skill, 5, "Has a SKILL.md.", "No SKILL.md.", "Add a SKILL.md that teaches a coding agent when and how to use this, in plain steps."),
  ];
  const usable = [
    it("Copy-ready install", r.hasInstallCommand, 10, "The README has a one-line install or run command.", "No copy-ready install command.", "Put one install command in a code block near the top of the README."),
    it("API contract", a.api, 10, "Ships an OpenAPI or Swagger file.", "No OpenAPI or Swagger file.", "If it has an HTTP API, add openapi.json or openapi.yaml so agents can call it without guessing."),
    it("Agent instructions", a.agentsMd, 10, "Has AGENTS.md or CLAUDE.md for agents working in the repo.", "No AGENTS.md or CLAUDE.md.", "Add AGENTS.md with how to build, test and change this repo."),
    it("Usage example", r.hasUsageExample, 5, "The README shows how to use it.", "No usage example.", "Add a short usage example with real input and output."),
  ];
  const safe = [
    it("Licence", !!s.license && s.license !== "NOASSERTION", 5, "Has a licence agents and people can rely on.", "No licence detected.", "Add a LICENSE file so others know they may use it."),
    it("Security policy", s.hasSecurityPolicy, 5, "Has a SECURITY.md.", "No SECURITY.md.", "Add SECURITY.md saying how to report a problem privately."),
    it("Tagged release", s.hasRelease, 5, "Has a tagged release to pin to.", "No tagged release.", "Tag a release so agents and people can pin a version."),
    it("Permissions stated", !!r.mentionsSafety, 5, "The README says what it can and cannot touch.", "No note about permissions or safety.", "Say in the README whether it is read-only, what permissions it needs and what it never does."),
    it("Limits stated", !!r.mentionsLimits, 5, "The README mentions limits, quotas or pricing.", "No note about limits or cost.", "State rate limits, quotas or pricing so an agent can plan around them."),
  ];
  const components = [comp("discoverable", "Discoverable", discoverable), comp("usable", "Usable", usable), comp("safe", "Safe to adopt", safe)];
  return { version: AGENT_READY_VERSION, total: Math.round(components.reduce((n, c) => n + c.score, 0)), components };
}

/** The same question for a website or an agent's home page. */
export function scoreAgentReadySite(s: SiteSignals): ScoreResult {
  const discoverable = [
    it("Agent card", s.agentCard.found, 25, "Serves an agent card other agents can read.", "No agent card.", "Serve /.well-known/agent-card.json with your name, description and skills."),
    it("llms.txt", s.llmsTxt, 20, "Has an llms.txt for language models.", "No llms.txt.", "Add /llms.txt: a short, plain description and links to your key pages."),
    it("MCP manifest", s.mcpManifest, 20, "Publishes an MCP server manifest.", "No MCP manifest found.", "If you offer an MCP server, publish its manifest at /.well-known/mcp.json."),
    it("Plugin manifest", s.aiPlugin, 10, "Publishes an ai-plugin.json.", "No ai-plugin.json.", "Optional: publish /.well-known/ai-plugin.json if you expose an API to assistants."),
  ];
  const safe = [
    it("robots.txt", s.robotsOk, 10, "Has a robots.txt that tells agents the rules.", "No robots.txt.", "Add a robots.txt so crawlers and agents know the rules."),
    it("Security contact", s.securityTxt, 15, "Publishes a security contact.", "No security.txt.", "Add /.well-known/security.txt with a Contact: line."),
  ];
  const components = [comp("discoverable", "Discoverable", discoverable), comp("safe", "Safe to adopt", safe)];
  return { version: AGENT_READY_VERSION, total: Math.round(components.reduce((n, c) => n + c.score, 0)), components };
}
