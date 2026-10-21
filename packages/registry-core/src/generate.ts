import type { ProjectSignals } from "./signals.js";
import type { SiteSignals } from "./site.js";

export interface MissingFile { file: string; why: string; content: string; /** Where to put it on a website, e.g. /.well-known/security.txt. Repo files go at the repo root. */ at?: string }

/** One line, cut at the last whole word (never in the middle of one) when it is longer than max. */
const oneLine = (s: string | null | undefined, max = 200) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:\-]+$/, "");
};

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

/**
 * The same idea for a website: starting points for the files and tags agents look for, only for checks the site currently fails.
 * Fixed templates from the page's own title and description; TODO where only the owner knows.
 */
export function missingSiteFiles(s: SiteSignals, now = Date.now()): MissingFile[] {
  const origin = `https://${s.host}`;
  const name = oneLine(s.title, 80) || s.host;
  const desc = oneLine(s.description) || "TODO: one plain sentence on what this site is for";
  const out: MissingFile[] = [];
  if (!s.llmsTxt) out.push({
    file: "llms.txt", at: "/llms.txt", why: "A short description models can read first.",
    content: `# ${name}\n\n> ${desc}\n\n## Key pages\n- [Home](${origin}/): TODO\n- [TODO: page name](${origin}/TODO): TODO\n`,
  });
  if (!s.agentCard.found) out.push({
    file: "agent-card.json", at: "/.well-known/agent-card.json", why: "A card other agents can read: who you are and what you can do.",
    content: JSON.stringify({ name, description: desc, url: origin, skills: [{ name: "TODO: what it can do", description: "TODO: one sentence" }] }, null, 2) + "\n",
  });
  if (!s.securityTxt) out.push({
    file: "security.txt", at: "/.well-known/security.txt", why: "Says how to report a problem privately.",
    content: `Contact: mailto:TODO@${s.host}\nExpires: ${new Date(now + 330 * 86_400_000).toISOString()}\nCanonical: ${origin}/.well-known/security.txt\nPreferred-Languages: en\n`,
  });
  if (!s.hasViewport || !s.hasLang) out.push({
    file: "HTML head", at: "your page template", why: "Makes the page readable on a phone and tells readers its language.",
    content: `${s.hasLang ? "" : '<html lang="en">\n'}${s.hasViewport ? "" : '<meta name="viewport" content="width=device-width, initial-scale=1">\n'}`,
  });
  return out;
}
