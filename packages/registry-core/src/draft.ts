import { parseCard, type AgentCard } from "./schema.js";
import type { ProjectSignals } from "./signals.js";

const firstSentence = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
  const out = (m ? m[1]! : t).trim();
  return out.length <= max ? out : `${out.slice(0, max - 1).trimEnd()}\u2026`;
};

/**
 * A draft listing built only from public facts ScBee already read: repo description, topics, homepage and the
 * README's own first paragraph and install command. Deterministic and never invents skills; the owner edits it.
 */
export function draftCard(s: ProjectSignals, repoName: string): AgentCard {
  const description = (s.description?.trim() || s.readme.summary || "").slice(0, 500);
  const npm = s.npmPackage ? `https://www.npmjs.com/package/${s.npmPackage}` : null;
  const raw = {
    name: repoName.slice(0, 80),
    ...(description ? { description, tagline: firstSentence(description, 120) } : {}),
    ...(s.readme.installCommand ? { install: s.readme.installCommand } : s.npmPackage ? { install: `npm install ${s.npmPackage}` } : {}),
    ...((s.homepage ?? npm) ? { url: (s.homepage ?? npm)! } : {}),
    ...(s.topics.length ? { tags: s.topics.slice(0, 10) } : {}),
    skills: [],
  };
  const r = parseCard(raw);
  if (r.ok) return r.card;
  // a field failed validation (odd characters): fall back to the bare minimum rather than failing registration
  const min = parseCard({ name: repoName.slice(0, 80), skills: [] });
  return min.ok ? min.card : { name: "agent", skills: [] };
}
