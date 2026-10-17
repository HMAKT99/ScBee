/** Deterministic feed ranking: relevance first, with guaranteed exploration slots for new, unevaluated projects. */

export interface FeedCandidate {
  key: string;            // github:owner/repo
  text: string;           // description + topics + skill names, already collected by the caller
  evaluations: number;
  seenAt: number;
}
export interface FeedItem {
  key: string;
  reason: "match" | "exploration";
  matched: string[];
  evaluations: number;
}

const STOP = new Set("the and for with that this from your you are can use using into over any all not but has have was were will its our their they them out per via how what when who why more most also than then just like new get set one two agent agents tool tools based build built make makes made open source".split(" "));

export function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const t = w.replace(/^[.]+|[.]+$/g, "");
    if (t.length >= 3 && t.length <= 30 && !STOP.has(t) && !/^\d+$/.test(t)) out.add(t);
  }
  return out;
}

/**
 * Pick up to `limit` projects. At least `explore` slots (when available) go to the least-evaluated, newest
 * projects regardless of relevance, so a brand-new project gets looked at even with no popularity.
 */
export function rankFeed(agentText: string, candidates: FeedCandidate[], limit = 10, explore = 3): FeedItem[] {
  const mine = terms(agentText);
  const scored = candidates.map((c) => {
    const matched = [...terms(c.text)].filter((t) => mine.has(t));
    return { c, matched };
  });
  const byMatch = scored.filter((s) => s.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length || a.c.evaluations - b.c.evaluations || b.c.seenAt - a.c.seenAt || a.c.key.localeCompare(b.c.key));
  const byNew = [...scored]
    .sort((a, b) => a.c.evaluations - b.c.evaluations || b.c.seenAt - a.c.seenAt || a.c.key.localeCompare(b.c.key));

  const slotsExplore = Math.min(explore, limit, byNew.length);
  const chosen = new Map<string, FeedItem>();
  for (const s of byNew) {
    if (chosen.size >= slotsExplore) break;
    chosen.set(s.c.key, { key: s.c.key, reason: "exploration", matched: s.matched.slice(0, 5), evaluations: s.c.evaluations });
  }
  for (const s of byMatch) {
    if (chosen.size >= limit) break;
    if (!chosen.has(s.c.key)) chosen.set(s.c.key, { key: s.c.key, reason: "match", matched: s.matched.slice(0, 5), evaluations: s.c.evaluations });
  }
  // top up with remaining newest if there were few matches
  for (const s of byNew) {
    if (chosen.size >= limit) break;
    if (!chosen.has(s.c.key)) chosen.set(s.c.key, { key: s.c.key, reason: "exploration", matched: [], evaluations: s.c.evaluations });
  }
  return [...chosen.values()];
}
