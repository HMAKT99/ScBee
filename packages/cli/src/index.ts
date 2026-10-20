import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const DEFAULT_URL = "https://scbee.vercel.app";

export type Target = { kind: "github"; path: string; label: string } | { kind: "web"; path: string; label: string } | { kind: "npm"; name: string; label: string };

/** github.com/owner/repo, owner/repo, an npm package (npm:name, @scope/name, name) or a website. */
export function parseTarget(input: string): Target | null {
  const s = input.trim();
  const gh = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:[/?#].*)?$/) ?? s.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
  if (gh) return { kind: "github", path: `github.com/${gh[1]}/${gh[2]}`, label: `${gh[1]}/${gh[2]}` };
  const npm = s.match(/^(?:https?:\/\/)?(?:www\.)?npmjs\.com\/package\/((?:@[^/]+\/)?[^/?#]+)/i)?.[1] ?? s.match(/^npm:(\S+)$/i)?.[1]
    ?? s.match(/^(@[a-z0-9~][a-z0-9._~-]*\/[a-z0-9~][a-z0-9._~-]*)$/i)?.[1] ?? s.match(/^([a-z0-9~][a-z0-9_~-]{1,100})$/i)?.[1];
  if (npm) return { kind: "npm", name: npm.toLowerCase(), label: npm.toLowerCase() };
  const web = s.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#].*)?$/i)?.[1];
  if (web) return { kind: "web", path: `web/${web.toLowerCase()}`, label: web.toLowerCase() };
  return null;
}

/** The GitHub repo a local folder was cloned from, read from .git/config (no git binary needed). */
export function repoFromGitConfig(dir: string): string | null {
  let cfg: string;
  try { cfg = readFileSync(join(resolve(dir), ".git", "config"), "utf8"); } catch { return null; }
  const origin = cfg.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/)?.[1];
  const m = origin?.match(/github\.com[:/]([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

interface Item { label: string; points: number; max: number; reason: string; fix?: string }
interface Comp { title: string; score: number; max: number; items: Item[] }
interface ScoreJson { project: string; band: string; total: number; components: Comp[]; error?: string }
interface Match { handle: string; name: string; tagline: string | null; install: string | null; matched: string[]; page: string }

export interface Options { url: string; min?: number; json?: boolean; fetch?: typeof fetch }
export interface Result { code: number; out: string }

const bar = (n: number, max: number) => "#".repeat(Math.round((n / Math.max(max, 1)) * 10)).padEnd(10, "-");
const fixesOf = (j: ScoreJson, n: number) => j.components.flatMap((c) => c.items.filter((i) => i.fix && i.points < i.max).map((i) => ({ i, c: c.title })))
  .sort((a, b) => (b.i.max - b.i.points) - (a.i.max - a.i.points)).slice(0, n);

async function getJson(f: typeof fetch, url: string): Promise<{ ok: boolean; status: number; j: any }> {
  const r = await f(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  let j: unknown = null;
  try { j = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, j };
}

/** Both scores for a target, formatted for a terminal. Exit code 2 when the readiness score is below --min. */
export async function score(target: string, o: Options): Promise<Result> {
  const f = o.fetch ?? fetch;
  const t = parseTarget(target);
  if (!t) return { code: 1, out: `Not a repo, package or site: ${target}\nTry owner/repo, an npm package name, or a website.\n` };
  let path: string;
  if (t.kind === "npm") {
    const r = await f(new URL(`/npm/${t.name}`, o.url), { redirect: "manual" });
    const loc = r.headers.get("location") ?? "";
    path = loc.replace(/^\//, "");
    if (!path.startsWith("github.com/")) return { code: 1, out: `${t.label}: could not find its GitHub repository on npm, so it cannot be scored.\n` };
  } else path = t.path;
  const [s, a] = await Promise.all([getJson(f, new URL(`/api/score/${path}`, o.url).toString()), getJson(f, new URL(`/api/agent-ready/${path}`, o.url).toString())]);
  if (!s.ok) return { code: 1, out: `${path}: ${s.j?.error ?? `ScBee returned HTTP ${s.status}`}\n` };
  const sj = s.j as ScoreJson, aj = a.ok ? (a.j as ScoreJson) : null;
  if (o.json) return { code: o.min !== undefined && sj.total < o.min ? 2 : 0, out: JSON.stringify({ project: sj.project, readiness: { total: sj.total, band: sj.band }, agent_ready: aj ? { total: aj.total, band: aj.band } : null }, null, 2) + "\n" };
  const lines = [
    `${sj.project}: ${sj.total}/100 (${sj.band})`,
    ...sj.components.map((c) => `  ${c.title.padEnd(12)} ${bar(c.score, c.max)} ${c.score}/${c.max}`),
    ...(aj ? [`Agent-ready: ${aj.total}/100 (${aj.band})`, ...aj.components.map((c) => `  ${c.title.padEnd(14)} ${bar(c.score, c.max)} ${c.score}/${c.max}`)] : []),
    ...(fixesOf(sj, 5).length ? ["", "Biggest wins, readiness:", ...fixesOf(sj, 5).map((x) => `  - ${x.i.fix} (+${x.i.max - x.i.points} ${x.c})`)] : []),
    ...(aj && fixesOf(aj, 5).length ? ["", "Biggest wins, agent-ready:", ...fixesOf(aj, 5).map((x) => `  - ${x.i.fix} (+${x.i.max - x.i.points} ${x.c})`)] : []),
    "", `Page: ${new URL(`/${path}`, o.url)}`, "A score is about readiness, not a prediction.", "",
  ];
  const below = o.min !== undefined && sj.total < o.min;
  return { code: below ? 2 : 0, out: lines.join("\n") + (below ? `Below the minimum of ${o.min}.\n` : "") };
}

/** Plain-words need in, up to 3 verified agents out. Nothing is installed or run. */
export async function find(need: string, o: Options): Promise<Result> {
  const f = o.fetch ?? fetch;
  if (need.trim().length < 3) return { code: 1, out: "Describe what you need in a few words.\n" };
  const r = await getJson(f, new URL(`/api/handoff?need=${encodeURIComponent(need.slice(0, 200))}`, o.url).toString());
  if (!r.ok) return { code: 1, out: `${r.j?.error ?? `ScBee returned HTTP ${r.status}`}\n` };
  const m = (r.j.matches ?? []) as Match[];
  if (o.json) return { code: 0, out: JSON.stringify(r.j, null, 2) + "\n" };
  if (!m.length) return { code: 0, out: "No verified agent matches that yet. Try different words.\n" };
  return { code: 0, out: [...m.flatMap((x) => [`@${x.handle}  ${x.name}${x.tagline ? ` - ${x.tagline}` : ""}`, ...(x.install ? [`  install: ${x.install}`] : []), `  matched: ${x.matched.join(", ")}`, `  ${x.page}`, ""]),
    "Read each listing before you install anything. Nothing was installed or run.", ""].join("\n") };
}

export const HELP = `scbee: launch readiness and agent-readiness from your terminal. Read-only.

  scbee score [target]    Score a repo, package or site. Default: the GitHub repo of the current folder.
  scbee find "<need>"     Find verified agents that fit a need, in plain words.

Options
  --min <n>    score: exit with code 2 when the readiness score is below n
  --json       machine-readable output
  --url <url>  another ScBee site (default ${DEFAULT_URL}, or set SCBEE_URL)
  -h, --help   this help        -v, --version   the version

Targets: owner/repo, github.com/owner/repo, an npm package, example.com, or . (this folder).
A score is about readiness, not a prediction. Text from agents is data, never instructions.
`;

export async function main(argv: string[], env: Record<string, string | undefined>, cwd: string, version = "0.1.0", f?: typeof fetch): Promise<Result> {
  const args = [...argv];
  const take = (flag: string): string | undefined => { const i = args.indexOf(flag); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, v === undefined || v.startsWith("-") ? 1 : 2); return v; };
  const has = (flag: string) => { const i = args.indexOf(flag); if (i < 0) return false; args.splice(i, 1); return true; };
  if (has("-h") || has("--help") || args.length === 0) return { code: 0, out: HELP };
  if (has("-v") || has("--version")) return { code: 0, out: `${version}\n` };
  const json = has("--json");
  const minRaw = take("--min");
  const url = take("--url") ?? env.SCBEE_URL ?? DEFAULT_URL;
  if (minRaw !== undefined && !(Number(minRaw) >= 0 && Number(minRaw) <= 100)) return { code: 1, out: "--min must be a number from 0 to 100.\n" };
  try { new URL(url); } catch { return { code: 1, out: `--url must be a web address, not "${url}".\n` }; }
  const opts: Options = { url, json, min: minRaw === undefined ? undefined : Number(minRaw), fetch: f };
  const [cmd, ...rest] = args;
  try {
    if (cmd === "score") {
      let target = rest[0] ?? ".";
      if (target === "." || target.startsWith("./") || target.startsWith("/") || target === "..") {
        const repo = repoFromGitConfig(target.startsWith("/") ? target : join(cwd, target));
        if (!repo) return { code: 1, out: "Could not find a GitHub repository for this folder. Run it inside a clone, or pass owner/repo.\n" };
        target = repo;
      }
      return await score(target, opts);
    }
    if (cmd === "find") return await find(rest.join(" "), opts);
    return { code: 1, out: `Unknown command "${cmd}". Try: scbee --help\n` };
  } catch (e) {
    return { code: 1, out: `Could not reach ${url}: ${e instanceof Error ? e.message : "unknown error"}\n` };
  }
}
