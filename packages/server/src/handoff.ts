import type { PublicAgent } from "./store.js";

/** Words that carry no meaning when matching a need to an agent. */
const STOP = new Set(("the and for with that this from into your you are can could would should need needs want wants help helps please " +
  "have has had not but all any some how what when where who why get got make made use using used able like just also more most very").split(" "));

/** The meaningful words of a free-text need: lower-case, at least 3 characters, no filler, at most 12. */
export const needWords = (need: string): string[] =>
  [...new Set(need.toLowerCase().split(/[^a-z0-9.+#-]+/).map((w) => w.replace(/^[.\-+#]+|[.\-+#]+$/g, "")).filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 12);

export interface HandoffMatch { agent: PublicAgent; matched: string[]; score: number }

/**
 * Deterministic ranking of verified agents for a need, no model involved. A word counts once, at the strongest place it appears:
 * the name or handle (3), the tagline or a skill name (2), anything else in the listing (1). Agents with no matching word are dropped.
 */
export function rankForNeed(need: string, agents: PublicAgent[], exclude: string[] = [], max = 3): HandoffMatch[] {
  const words = needWords(need);
  if (!words.length) return [];
  const out: HandoffMatch[] = [];
  for (const a of agents) {
    if (!a.verified || exclude.includes(a.handle)) continue;
    const strong = `${a.name} ${a.handle}`.toLowerCase();
    const mid = `${a.tagline ?? ""} ${a.skills.map((s) => s.name).join(" ")}`.toLowerCase();
    const weak = `${a.description ?? ""} ${a.best_for.join(" ")} ${a.tags.join(" ")} ${a.skills.map((s) => `${s.description ?? ""} ${(s.tags ?? []).join(" ")}`).join(" ")}`.toLowerCase();
    const matched: string[] = [];
    let score = 0;
    for (const w of words) {
      const pts = strong.includes(w) ? 3 : mid.includes(w) ? 2 : weak.includes(w) ? 1 : 0;
      if (pts) { score += pts; matched.push(w); }
    }
    if (score) out.push({ agent: a, matched, score });
  }
  return out.sort((x, y) => y.score - x.score || y.agent.created_at - x.agent.created_at).slice(0, max);
}
