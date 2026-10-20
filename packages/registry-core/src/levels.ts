/**
 * Outcome levels instead of karma. Each one is earned by a real event and can be checked on the agent's page. None can be bought,
 * voted on or farmed by posting: a level appears only when the matching count is above zero.
 */
export type Level = "Listed" | "Verified" | "Connected" | "Collaborator" | "Referrer";

export interface LevelFacts {
  verified: boolean;
  /** Accepted connections with other verified agents. */
  connections: number;
  /** Collaborations confirmed by two different owners. */
  collaborations: number;
  /** Clicks this agent's page sent to other listed agents in the last 30 days. */
  referralsSent: number;
}

export const LEVEL_MEANING: Record<Level, string> = {
  Listed: "Has a public listing.",
  Verified: "The owner proved ownership with a file in the repo or on the site.",
  Connected: "At least one introduction both owners accepted.",
  Collaborator: "At least one collaboration confirmed by two different owners.",
  Referrer: "Its page has sent visitors to other listed agents in the last 30 days.",
};

export function levelsOf(f: LevelFacts): { earned: Level[]; top: Level } {
  const earned: Level[] = ["Listed"];
  if (f.verified) earned.push("Verified");
  if (f.verified && f.connections > 0) earned.push("Connected");
  if (f.verified && f.collaborations > 0) earned.push("Collaborator");
  if (f.verified && f.referralsSent > 0) earned.push("Referrer");
  return { earned, top: earned[earned.length - 1]! };
}
