import { band, agentBand, detectLicense, scoreAgentReady, scoreProject, type ProjectSignals, type ScoreResult, type TreeFacts } from "@scbee/registry-core";

/** Repository-wide facts: the same for the base branch and the pull request (they come from GitHub, not from files). */
export interface RepoMeta {
  owner: string;
  repo: string;
  description: string | null;
  homepage: string | null;
  topics: string[];
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string | null;
  pushedAt: string | null;
  archived: boolean;
  hasRelease: boolean;
}

/** The scoring input for one version of the files. Licence comes from the licence file in that version. */
export function toSignals(meta: RepoMeta, f: TreeFacts): ProjectSignals {
  const detected = f.licenseText != null ? detectLicense(f.licenseText) : null;
  const license = detected == null ? null : detected !== "NOASSERTION" ? detected : (meta.license ?? "NOASSERTION");
  return {
    source: `github:${meta.owner}/${meta.repo}`,
    fullName: `${meta.owner}/${meta.repo}`,
    description: meta.description,
    homepage: meta.homepage,
    topics: meta.topics,
    license,
    stars: meta.stars,
    forks: meta.forks,
    openIssues: meta.openIssues,
    createdAt: meta.createdAt,
    pushedAt: meta.pushedAt,
    archived: meta.archived,
    hasCi: f.hasCi,
    hasSecurityPolicy: f.hasSecurityPolicy,
    hasRelease: meta.hasRelease,
    runtimeDeclared: f.runtimeDeclared,
    hasAgentCard: f.hasAgentCard,
    agent: f.agent,
    ...(f.npmPackage ? { npmPackage: f.npmPackage, npmDownloadsMonthly: f.npmDownloadsMonthly } : {}),
    ...(f.dependencies?.length ? { dependencies: f.dependencies } : {}),
    // Being listed on ScBee earns no points, so it is left out: nothing here talks to ScBee.
    listedOnScbee: false,
    verifiedOnScbee: false,
    readme: f.readme,
  };
}

export interface Scores { launch: ScoreResult; agent: ScoreResult | null }

export function score(s: ProjectSignals, now = Date.now()): Scores {
  return { launch: scoreProject(s, now), agent: scoreAgentReady(s) };
}

interface Fix { score: string; label: string; fix: string; worth: number; reason: string }

/** The fixes worth the most across both scores, largest first. A check that appears in both is listed once. */
export function topFixes(s: Scores, n = 3): Fix[] {
  const all: Fix[] = [];
  for (const [name, r] of [["Launch readiness", s.launch], ["Agent-Ready", s.agent]] as const) {
    if (!r) continue;
    for (const c of r.components) for (const i of c.items) {
      if (i.fix && i.points < i.max) all.push({ score: name, label: i.label, fix: i.fix, worth: i.max - i.points, reason: i.reason });
    }
  }
  const seen = new Set<string>();
  return all.sort((a, b) => b.worth - a.worth).filter((x) => (seen.has(x.fix) ? false : (seen.add(x.fix), true))).slice(0, n);
}

/** Checks whose points changed between base and head, so the comment can say what this PR did. */
export function changedChecks(head: Scores, base: Scores | null): { score: string; label: string; delta: number }[] {
  if (!base) return [];
  const out: { score: string; label: string; delta: number }[] = [];
  const pairs = [["Launch readiness", head.launch, base.launch], ["Agent-Ready", head.agent, base.agent]] as const;
  for (const [name, h, b] of pairs) {
    if (!h || !b) continue;
    const before = new Map(b.components.flatMap((c) => c.items.map((i) => [`${c.id}/${i.label}`, i.points] as const)));
    for (const c of h.components) for (const i of c.items) {
      const d = i.points - (before.get(`${c.id}/${i.label}`) ?? 0);
      if (d !== 0) out.push({ score: name, label: i.label, delta: d });
    }
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export const MARKER = "<!-- scbee-action -->";
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

export interface ReportInput { head: Scores; base: Scores | null; baseRef: string | null; sha: string | null; note?: string }

/** The comment (and job summary) body. Plain Markdown; the marker lets later runs find and edit the same comment. */
export function render(r: ReportInput): string {
  const { head, base } = r;
  const ref = r.baseRef ? `\`${cell(r.baseRef)}\`` : "the base branch";
  const rows = [
    ["Launch readiness", head.launch.total, base?.launch.total, band(head.launch.total).label],
    ...(head.agent ? [["Agent-Ready", head.agent.total, base?.agent?.total, agentBand(head.agent.total).label] as const] : []),
  ] as const;
  const table = base
    ? `| Score | This PR | ${ref} | Change |\n|---|---|---|---|\n${rows.map(([n, h, b, l]) => `| ${n} | **${h}/100** ${l} | ${b ?? "–"} | ${b == null ? "–" : signed(h - b)} |`).join("\n")}`
    : `| Score | This PR |\n|---|---|\n${rows.map(([n, h, , l]) => `| ${n} | **${h}/100** ${l} |`).join("\n")}`;
  const changed = changedChecks(head, base);
  const changedMd = base
    ? changed.length ? `\n**What this PR changed**\n${changed.slice(0, 6).map((c) => `- ${c.label} (${c.score}): ${signed(c.delta)}`).join("\n")}\n` : "\nThis PR does not change any scored check.\n"
    : "";
  const fixes = topFixes(head);
  const fixesMd = fixes.length
    ? fixes.map((f, i) => `${i + 1}. **${cell(f.fix)}** (+${f.worth}, ${f.score}). ${cell(f.reason)}`).join("\n")
    : "Nothing major left to fix.";
  return `${MARKER}
### ScBee: launch readiness ${head.launch.total}/100${base ? ` (${signed(head.launch.total - base.launch.total)} vs ${ref})` : ""}

${table}
${changedMd}
**${fixes.length === 1 ? "Top fix" : `Top ${fixes.length || 3} fixes`}**
${fixesMd}
${r.note ? `\n> ${cell(r.note)}\n` : ""}
<sub>Scored from this pull request's own files by ScBee's open rules (no AI)${r.sha ? ` at \`${r.sha.slice(0, 7)}\`` : ""}. Stars, releases, topics and activity are repository-wide, so they count the same for both. A score is about readiness, not a prediction. [How it scores](https://github.com/HMAKT99/ScBee)</sub>
`;
}
