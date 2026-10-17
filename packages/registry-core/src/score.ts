import type { ProjectSignals } from "./signals.js";

/** Bump when weights or rules change; stored with every result so history stays comparable. */
export const SCORE_VERSION = "1";

/** Maximum points per component. They sum to 100. */
export const WEIGHTS = { clarity: 30, friction: 25, trust: 25, momentum: 10, network: 10 } as const;
export type ComponentId = keyof typeof WEIGHTS;

export interface ScoreItem {
  label: string;
  points: number;
  max: number;
  reason: string;
  /** Present when points were lost and there is something concrete to do. */
  fix?: string;
}
export interface ScoreComponent {
  id: ComponentId;
  title: string;
  score: number;
  max: number;
  items: ScoreItem[];
}
export interface ScoreResult {
  version: string;
  total: number;
  components: ScoreComponent[];
}

const OSI_PERMISSIVE = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "GPL-2.0", "GPL-3.0", "LGPL-3.0", "AGPL-3.0", "Unlicense", "0BSD", "CC0-1.0", "BSL-1.0"]);
const DAY = 86_400_000;

const item = (label: string, ok: boolean, max: number, good: string, bad: string, fix: string, partial?: { points: number; reason: string }): ScoreItem =>
  ok ? { label, points: max, max, reason: good }
  : partial ? { label, points: partial.points, max, reason: partial.reason, fix }
  : { label, points: 0, max, reason: bad, fix };

const sum = (items: ScoreItem[]) => items.reduce((n, i) => n + i.points, 0);

export function scoreProject(s: ProjectSignals, now = Date.now()): ScoreResult {
  const r = s.readme;
  const ageDays = s.createdAt ? Math.max(0, (now - Date.parse(s.createdAt)) / DAY) : null;
  const sincePush = s.pushedAt ? (now - Date.parse(s.pushedAt)) / DAY : null;

  const clarity: ScoreItem[] = [
    item("README", r.present, 6, "A README exists.", "No README found.", "Add a README.md at the repo root that says what this is and how to use it."),
    item("One-sentence summary", r.hasSummary || (s.description?.trim().length ?? 0) >= 15, 5,
      "The project explains what it is in plain words.", "No clear one-line description.",
      "Put one sentence at the top of the README (and in the repo description): who it is for and what it does."),
    item("Install section", r.hasInstallCommand, 6, "The README shows how to install or run it.", "No install command in the README.",
      "Add a one-line install or run command to the top of the README, in a code block."),
    item("Usage example", r.hasUsageExample, 5, "There is a usage example.", "No usage example.", "Add a short code example showing the first useful thing to do."),
    item("Screenshot or demo", r.hasMedia, 4, "The README has a screenshot, GIF or demo link.", "No screenshot, GIF or demo link.",
      "Add a screenshot or a short GIF; people decide in seconds whether to try something."),
    item("Structure", r.headings >= 3, 4, "The README has a clear heading structure.", r.headings === 0 ? "The README has no headings." : "Only a few headings.",
      "Split the README into sections (Install, Usage, Configuration, License).",
      r.headings > 0 ? { points: 2, reason: "The README has some headings, but fewer than three." } : undefined),
  ];

  const early = r.installPosition !== null && r.installPosition <= 0.35;
  const friction: ScoreItem[] = [
    item("One-line install", r.hasInstallCommand, 10, "Install is a single command.", "No single-command install found.",
      "Offer one copy-paste command (npx, pip install, docker run, brew install)."),
    item("Runtime declared", s.runtimeDeclared, 5, "Supported runtime or engine version is declared.", "No supported runtime or version declared.",
      "Declare the runtime (engines in package.json, requires-python in pyproject) so people know it will work."),
    item("Setup effort", r.envVars <= 1, 6, r.envVars === 0 ? "No secrets or variables needed to start." : "At most one variable needed to start.",
      `${r.envVars} environment variables are mentioned as required.`,
      "Cut the setup: give defaults, or let the project run in a demo mode with no keys.",
      r.envVars <= 3 ? { points: 3, reason: `${r.envVars} environment variables are mentioned.` } : undefined),
    item("Quickstart near the top", early, 4, "The install step is near the top of the README.",
      r.hasInstallCommand ? "The install step is buried far down the README." : "No install step to place.",
      "Move the install command above the long explanations."),
  ];

  const licenseOk = !!s.license && s.license !== "NOASSERTION" && OSI_PERMISSIVE.has(s.license);
  const trust: ScoreItem[] = [
    item("License", licenseOk, 7, `Licensed under ${s.license}.`, s.license && s.license !== "NOASSERTION" ? `License ${s.license} is not a common open-source license.` : "No license detected.",
      "Add a LICENSE file (MIT or Apache-2.0 are the usual choices); without one, nobody can legally build on it.",
      s.license && s.license !== "NOASSERTION" ? { points: 3, reason: `A license (${s.license}) is present but unusual.` } : undefined),
    item("Recent activity", sincePush !== null && sincePush <= 90, 6, "Changed in the last 90 days.",
      sincePush === null ? "No activity information." : `Last push was ${Math.round(sincePush)} days ago.`,
      "Ship a small update or close out stale issues so visitors can see it is maintained.",
      sincePush !== null && sincePush <= 365 ? { points: 3, reason: `Last push was ${Math.round(sincePush)} days ago.` } : undefined),
    item("Automated checks", s.hasCi, 4, "CI workflows are configured.", "No CI workflows found.", "Add a GitHub Actions workflow that runs your tests on every push."),
    item("Security policy", s.hasSecurityPolicy, 3, "A security policy exists.", "No SECURITY.md.", "Add SECURITY.md saying how to report a vulnerability."),
    item("Releases", s.hasRelease, 3, "At least one release is published.", "No published releases.", "Tag a release so people can pin a version."),
    item("Not archived", !s.archived, 2, "The repository is active (not archived).", "The repository is archived.", "Unarchive it, or point to the maintained successor."),
  ];

  const months = ageDays === null ? null : Math.max(ageDays / 30, 1);
  const rate = months === null ? 0 : s.stars / months;
  const young = ageDays !== null && ageDays < 45;
  const dl = s.npmDownloadsMonthly ?? 0;
  const dlPoints = dl >= 10_000 ? 7 : dl >= 1_000 ? 5 : dl >= 100 ? 3 : dl >= 10 ? 1 : 0;
  const starPoints = rate >= 20 ? 7 : rate >= 5 ? 5 : rate >= 1 ? 3 : 1;
  const growthFix = "Share it where your users are: a launch post, a demo GIF, a directory listing.";
  const momentum: ScoreItem[] = [
    young
      ? { label: "Growth", points: 7, max: 7, reason: "Too new to measure growth, so it is not penalised." }
      : dlPoints > starPoints
        ? { label: "Growth", points: dlPoints, max: 7, reason: `About ${dl.toLocaleString("en-US")} npm downloads last month.`, ...(dlPoints < 7 ? { fix: growthFix } : {}) }
        : { label: "Growth", points: starPoints, max: 7, reason: starPoints > 1 ? `About ${rate >= 20 ? rate.toFixed(0) : rate.toFixed(1)} new stars a month.` : "Little star growth so far.", ...(starPoints < 7 ? { fix: growthFix } : {}) },
    item("Fresh activity", sincePush !== null && sincePush <= 30, 3, "Pushed to in the last 30 days.", "No push in the last 30 days.", "Regular small updates signal an active project."),
  ];

  const network: ScoreItem[] = [
    item("Agent card", s.hasAgentCard, 4, "Publishes an agent card other agents can read.", "No agent card.", "Add an agent.json (name, description, skills) at the repo root so other agents can discover what it does."),
    item("Topics", s.topics.length >= 3, 3, "Has topics so people can find it.", `${s.topics.length} topics set.`, "Add at least three GitHub topics.",
      s.topics.length > 0 ? { points: 1, reason: `${s.topics.length} topics set.` } : undefined),
    item("Listed on ScBee", s.verifiedOnScbee, 3, "Registered and verified on ScBee.",
      s.listedOnScbee ? "Registered, but not yet verified." : "Not yet on ScBee.",
      s.listedOnScbee ? "Verify ownership so other agents can connect with you." : "Register it so other agents can find and connect with it.",
      s.listedOnScbee ? { points: 1, reason: "Registered, but not yet verified." } : undefined),
  ];

  const mk = (id: ComponentId, title: string, items: ScoreItem[]): ScoreComponent => ({ id, title, score: sum(items), max: WEIGHTS[id], items });
  const components = [mk("clarity", "Clarity", clarity), mk("friction", "Friction", friction), mk("trust", "Trust", trust), mk("momentum", "Momentum", momentum), mk("network", "Network fit", network)];
  return { version: SCORE_VERSION, total: Math.round(components.reduce((n, c) => n + c.score, 0)), components };
}

/** Plain-language band used on the page and the badge. */
export function band(total: number): { label: string; color: string } {
  if (total >= 80) return { label: "Launch ready", color: "#2da44e" };
  if (total >= 60) return { label: "Nearly there", color: "#dfb317" };
  if (total >= 40) return { label: "Needs work", color: "#fe7d37" };
  return { label: "Early", color: "#e05d44" };
}
