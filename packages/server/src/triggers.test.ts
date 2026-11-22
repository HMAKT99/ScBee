import { describe, expect, it } from "vitest";
import { PUBLIC_TOOLS } from "scbee-mcp";
import { launchCheckMd } from "./launchCheck.js";
import { agentReadyMd } from "./agentReadySkill.js";
import { findAgentMd } from "./plugin.js";
import { boardHandoffMd } from "./boardHandoff.js";

/**
 * Trigger test. An agent picks a tool or skill from its name and description alone, so each must win on the way a real
 * user or agent states the task. For every tool and skill: key terms its description must contain, and at least ten
 * real phrasings. A fixed word-overlap ranker (no model) scores each phrasing against every description in the same
 * list; the intended one must score strictly highest. A tie is a collision and fails.
 */

const STOP = new Set(("a an the and or of to for in on at by with from into is are be it its this that these those my our your their me we you i "
  + "can could would should will do does did how what which when where why here any some all not no as about if so than then just they "
  + "help please want need get got use using one two three up out over before after").split(" "));
/** A small fixed stemmer: shipping → ship, launched → launch, fixes → fix, agents → agent. */
const stem = (w: string) => {
  const undouble = (s: string) => (s.length > 3 && s.at(-1) === s.at(-2) && !/[ls]$/.test(s) ? s.slice(0, -1) : s);
  if (w.length > 5 && w.endsWith("ing")) return undouble(w.slice(0, -3));
  if (w.length > 4 && w.endsWith("ed")) return undouble(w.slice(0, -2));
  if (w.length > 4 && /(x|sh|ch|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};
const words = (s: string) => new Set(s.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9.]+/).map((w) => w.replace(/^\.+|\.+$/g, "")).filter((w) => w.length > 1 && !STOP.has(w)).map(stem));
/** Each shared word counts 1/(number of descriptions in the list that contain it), so words every tool uses ("agent", "repo") weigh little. */
const scorer = (all: string[]) => {
  const sets = all.map(words);
  const df = (w: string) => sets.filter((s) => s.has(w)).length;
  return (phrase: string, description: string) => { const d = words(description); let n = 0; for (const w of words(phrase)) if (d.has(w)) n += 1 / df(w); return Math.round(n * 1000) / 1000; };
};

type Entry = { text: string; keys: string[]; phrases: string[] };
const frontDescription = (md: string) => md.match(/\ndescription: (.*)\n/)![1]!;

const TOOLS: Record<keyof typeof PUBLIC_TOOLS, Entry> = {
  scbee_score: {
    text: `${PUBLIC_TOOLS.scbee_score.title} ${PUBLIC_TOOLS.scbee_score.description}`,
    keys: ["launch", "ready", "repo", "npm", "website", "fix", "score"],
    phrases: [
      "is my repo ready to launch",
      "what should I fix before I ship this project",
      "score this github repo",
      "is this npm package ready to publish",
      "check my website before I announce it",
      "launch readiness of owner/repo",
      "give me a checklist of fixes before launching",
      "is this dependency maintained and ready",
      "how ready is this project to share publicly",
      "rate my repo out of 100",
      "what is missing before publishing my package",
    ],
  },
  scbee_search_agents: {
    text: `${PUBLIC_TOOLS.scbee_search_agents.title} ${PUBLIC_TOOLS.scbee_search_agents.description}`,
    keys: ["agent", "MCP server", "job", "search", "skills"],
    phrases: [
      "search for agents that translate docs",
      "list agents whose skills include pdf",
      "find agents by what they do",
      "browse registered agents for data cleaning",
      "which registered agents offer code review skills",
      "search MCP servers that read PDF files",
      "show me agents with scraping skills",
      "look up agents by skill",
      "find an MCP server for a specific job like sending email",
      "search the agent registry for testing",
    ],
  },
  scbee_handoff: {
    text: `${PUBLIC_TOOLS.scbee_handoff.title} ${PUBLIC_TOOLS.scbee_handoff.description}`,
    keys: ["cannot", "task", "3", "install", "human"],
    phrases: [
      "I cannot do this task myself",
      "I can't complete this, who can",
      "this task needs a tool I don't have",
      "I can't reach that service, hand it off",
      "give me 3 agents that can do this with install commands",
      "this is a specialist job I cannot do",
      "the task needs a missing tool",
      "hand off this task to someone who can do it",
      "I am stuck: cannot complete the task without a tool",
      "recommend agents to install for a task I cannot do",
    ],
  },
  scbee_find_complements: {
    text: `${PUBLIC_TOOLS.scbee_find_complements.title} ${PUBLIC_TOOLS.scbee_find_complements.description}`,
    keys: ["alongside", "repo", "depend", "integrat", "related"],
    phrases: [
      "what works well alongside this repo",
      "find related tools for this project",
      "what should I integrate with this library",
      "projects that pair well with owner/repo",
      "complementary tools for this npm package",
      "what depends on or mentions this project",
      "related projects to this github repo",
      "what to pair with this dependency",
      "tools that integrate with this package",
      "show projects that work with this one",
    ],
  },
  scbee_project_card: {
    text: `${PUBLIC_TOOLS.scbee_project_card.title} ${PUBLIC_TOOLS.scbee_project_card.description}`,
    keys: ["agents", "tried", "verdicts", "forecast", "recommend"],
    phrases: [
      "what did other agents think of this project",
      "verdicts from agents who tried this repo",
      "would other agents recommend this library",
      "launch forecast for this project",
      "should I adopt this project, what did others find",
      "reviews from agents that tried this package",
      "did anyone try this and would they use it",
      "agent verdicts and forecast for owner/repo",
      "is this project worth depending on, other agents' reports",
      "how many agents would recommend this",
    ],
  },
};

const SKILLS: Record<string, Entry> = {
  "launch-check": {
    text: frontDescription(launchCheckMd("https://scbee.vercel.app")),
    keys: ["launch", "ship", "fix", "checklist", "nobody is using"],
    phrases: [
      "is this ready to launch",
      "what should I fix before I ship",
      "give me a launch checklist for this repo",
      "why is nobody using my project",
      "I'm about to publish this, anything missing",
      "prepare this repo for launch",
      "launch readiness check",
      "we are shipping tomorrow, what to fix",
      "help me share this project publicly",
      "pre-launch checklist please",
    ],
  },
  "agent-ready-check": {
    text: frontDescription(agentReadyMd("https://scbee.vercel.app")),
    keys: ["agents", "llms.txt", "AGENTS.md", "agent card", "MCP"],
    phrases: [
      "can AI agents use my repo",
      "is this repo agent-ready",
      "should I add llms.txt",
      "do I need an AGENTS.md",
      "make my project discoverable by agents",
      "add an agent card to this repo",
      "can agents find and install my tool",
      "should I add a SKILL.md or MCP config",
      "will AI agents trust this repository",
      "make this repo usable by coding agents",
    ],
  },
  "find-agent": {
    text: frontDescription(findAgentMd("https://scbee.vercel.app")),
    keys: ["lack", "tool", "MCP server", "missing", "who can"],
    phrases: [
      "is there an agent for this",
      "is there an MCP server that can do this",
      "I lack a tool for this task",
      "who can do this",
      "I'm missing a tool to finish",
      "find a tool that can do this job",
      "I can't reach that service",
      "need a specialist tool for this",
      "find an MCP server with this ability",
      "my tools can't do this, find something that can",
    ],
  },
  "board-handoff": {
    text: frontDescription(boardHandoffMd("https://scbee.vercel.app")),
    keys: ["Vercel Board", "team", "thread", "approval"],
    phrases: [
      "a vercel board task needs outside help",
      "nobody on our board team can do this task",
      "post outside agents in the board thread",
      "our agent team on the vercel board is stuck",
      "this board task needs approval for an outside agent",
      "find outside agents for a task on our board",
      "reply in the task thread with outside options",
      "hold the board task for a person's approval",
      "our team's board has a task we cannot do",
      "vercel board: need an outside agent",
    ],
  },
};

function check(family: string, entries: Record<string, Entry>) {
  const score = scorer(Object.values(entries).map((e) => e.text));
  describe(`${family}: descriptions are written in task words and do not collide`, () => {
    for (const [name, e] of Object.entries(entries)) {
      it(`${name} names its key terms and has at least ten phrasings`, () => {
        expect(e.phrases.length).toBeGreaterThanOrEqual(10);
        for (const k of e.keys) expect(e.text.toLowerCase(), `${name} should say "${k}"`).toContain(k.toLowerCase());
      });
      it(`${name} wins every one of its phrasings outright`, () => {
        const lost: string[] = [];
        for (const p of e.phrases) {
          const mine = score(p, e.text);
          const best = Object.entries(entries).filter(([n]) => n !== name).map(([n, o]) => [n, score(p, o.text)] as const).sort((a, b) => b[1] - a[1])[0]!;
          if (!(mine > best[1])) lost.push(`"${p}": ${name} ${mine} vs ${best[0]} ${best[1]}`);
        }
        if (lost.length && process.env.TRIGGER_DEBUG) console.log(`LOST ${name}\n${lost.join("\n")}`);
        expect(lost).toEqual([]);
      });
    }
    it("no phrasing appears under two entries", () => {
      const all = Object.values(entries).flatMap((e) => e.phrases.map((p) => p.toLowerCase()));
      expect(new Set(all).size).toBe(all.length);
    });
  });
}

check("MCP tools", TOOLS);
check("Skills", SKILLS);

describe("descriptions an agent reads first", () => {
  it("lead with the task, not with what the tool returns", () => {
    for (const [name, t] of Object.entries(PUBLIC_TOOLS)) expect(t.description, name).not.toMatch(/^(Returns|Lists|Shows|Finds agents registered)/);
    for (const [name, e] of Object.entries(SKILLS)) expect(e.text, name).toMatch(/^(Use when|For agents that)/);
  });
  it("tell a model to ask its human before installing, and never tell it to register or act on its own", () => {
    expect(PUBLIC_TOOLS.scbee_handoff.description).toContain("ask your human before installing");
    for (const t of [...Object.values(PUBLIC_TOOLS).map((x) => x.description), ...Object.values(SKILLS).map((e) => e.text)])
      expect(t).not.toMatch(/\b(you must|always) (register|join|install|sign up)\b/i);
  });
});
