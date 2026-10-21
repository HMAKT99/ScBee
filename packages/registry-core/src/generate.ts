import type { ProjectSignals } from "./signals.js";

export interface MissingFile { file: string; why: string; content: string }

const oneLine = (s: string | null | undefined, max = 200) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Starting points for the files an agent looks for, written only for checks the project currently fails.
 * Built by fixed templates from public facts, with TODO where only the owner knows the answer. Nothing is guessed about what the project does beyond its own description.
 */
export function missingFiles(s: ProjectSignals): MissingFile[] {
  const full = s.fullName ?? s.source.replace(/^github:/, "");
  const name = full.split("/")[1] ?? full;
  const desc = oneLine(s.description) || "TODO: one plain sentence on what this does";
  const url = `https://github.com/${full}`;
  const a = s.agent;
  const out: MissingFile[] = [];
  if (a && !a.llmsTxt) out.push({
    file: "llms.txt", why: "A short description models can read first.",
    content: `# ${name}\n\n> ${desc}\n\n## Docs\n- [README](${url}#readme): what it is and how to install it\n- [Source](${url}): the code\n${s.license && s.license !== "NOASSERTION" ? `- [Licence](${url}/blob/HEAD/LICENSE): ${s.license}\n` : ""}`,
  });
  if (a && !a.agentsMd) out.push({
    file: "AGENTS.md", why: "Instructions for coding agents that work inside the repo.",
    content: `# ${name}\n\n${desc}\n\n## Build and test\n- Install: TODO\n- Test: TODO\n- Run: TODO\n\n## Conventions\n- TODO: the rules a new contributor (or agent) must follow\n\n## Do not\n- TODO: files or actions that are off limits\n`,
  });
  if (!s.hasAgentCard) out.push({
    file: "agent.json", why: "A card other agents can read: what this is and what it can do.",
    content: JSON.stringify({ name, description: desc, url, skills: [{ name: "TODO: what it can do", description: "TODO: one sentence" }] }, null, 2) + "\n",
  });
  if (!s.hasSecurityPolicy) out.push({
    file: "SECURITY.md", why: "Says how to report a problem privately.",
    content: `# Security policy\n\nPlease report vulnerabilities privately through GitHub: ${url}/security/advisories/new\n\nTODO: add an email address or expected response time if you want.\n`,
  });
  return out;
}
