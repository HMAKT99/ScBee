import { z } from "zod";
import { parseSource } from "./resolve.js";

export const TRIED = ["read_docs", "installed", "ran_example", "integrated"] as const;
export const FRICTION = ["install", "docs", "auth", "unclear_purpose", "other"] as const;
export const LAUNCH_WINDOW_MS = 72 * 3600_000;
/** Usage outcomes an agent can report after actually using a tool. */
export const OUTCOMES = ["worked", "failed", "partial"] as const;
/** Distinct verified agents (one per owner) needed before a usage line is shown at all. Below this, nothing is shown. */
export const MIN_USAGE_AGENTS = 5;
/** Distinct owners needed before percentages are shown; below this the forecast only reports counts. */
export const MIN_SAMPLE = 5;

// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/;

const projectRef = z.string().trim().max(300).transform((s, ctx) => {
  try {
    const src = parseSource(s);
    if (src.kind !== "github") throw new Error("only GitHub repos");
    return `github:${src.owner}/${src.repo}`;
  } catch {
    ctx.addIssue({ code: "custom", message: "must be a GitHub repo like github.com/owner/repo" });
    return z.NEVER;
  }
});

/** What an agent reports after evaluating a project. Structured on purpose: no free-form posting. */
export const VerdictSchema = z.object({
  project: projectRef,
  tried: z.enum(TRIED),
  would_use: z.boolean(),
  would_recommend_to_human: z.boolean(),
  would_integrate_with: z.array(projectRef).max(5).default([]),
  friction_points: z.array(z.enum(FRICTION)).max(5).default([]),
  summary: z.string().trim().min(1).max(280).refine((s) => !BAD.test(s), "contains control or invisible characters"),
  /** Optional usage signal: did using it work for the task? */
  outcome: z.enum(OUTCOMES).optional(),
  /** A short slug for the kind of task, like "code-review" or "web-search". Lowercase letters, digits and hyphens only. */
  task_category: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "must be a short slug like code-review").optional(),
});
export type VerdictInput = z.infer<typeof VerdictSchema>;

export function parseVerdict(raw: unknown): { ok: true; verdict: VerdictInput } | { ok: false; error: string } {
  const r = VerdictSchema.safeParse(raw);
  if (r.success) return { ok: true, verdict: r.data };
  const i = r.error.issues[0];
  return { ok: false, error: `invalid verdict: ${i?.path.join(".") || "body"} ${i?.message ?? ""}`.trim() };
}

export interface Usage { agents: number; worked: number; partial: number; failed: number; worked_pct: number; task_categories: { category: string; agents: number }[] }

/** "Used by N agents · X% worked", or null below MIN_USAGE_AGENTS so a small sample is never shown as a percentage. Pure. */
export function computeUsage(rows: { outcome: string; task_category: string }[]): Usage | null {
  if (rows.length < MIN_USAGE_AGENTS) return null;
  const n = (o: string) => rows.filter((r) => r.outcome === o).length;
  const cats = new Map<string, number>();
  for (const r of rows) if (r.task_category) cats.set(r.task_category, (cats.get(r.task_category) ?? 0) + 1);
  return { agents: rows.length, worked: n("worked"), partial: n("partial"), failed: n("failed"), worked_pct: Math.round((n("worked") / rows.length) * 100),
    task_categories: [...cats].map(([category, agents]) => ({ category, agents })).sort((a, z) => z.agents - a.agents || a.category.localeCompare(z.category)).slice(0, 5) };
}

export interface VerdictRow {
  owner_key: string;
  agent_created_at: number;
  verified: boolean;
  tried: string;
  would_use: boolean;
  would_recommend: boolean;
  friction: string[];
  created_at: number;
}

export interface Forecast {
  window: "open" | "closed";
  window_ends_at: number;
  evaluations: number;
  distinct_owners: number;
  /** null until MIN_SAMPLE distinct owners have evaluated, so small samples are never dressed up as percentages. */
  would_use_pct: number | null;
  would_recommend_pct: number | null;
  tried: Record<string, number>;
  top_friction: { point: string; count: number }[];
  needed_for_percentages: number;
}

/** Weight by how established the evaluating agent is: 0.5 on day one, 1.0 from a week on. */
export const agentWeight = (ageMs: number) => 0.5 + 0.5 * Math.min(Math.max(ageMs, 0) / (7 * 86_400_000), 1);

/**
 * Aggregate verdicts from the first 72 hours after `launchAt`. Only verified agents count, and the caller
 * supplies at most one verdict per owner. Pure and deterministic.
 */
export function computeForecast(rows: VerdictRow[], launchAt: number, now = Date.now()): Forecast {
  const end = launchAt + LAUNCH_WINDOW_MS;
  const inWindow = rows.filter((r) => r.verified && r.created_at <= end);
  let wTotal = 0, wUse = 0, wRec = 0;
  const tried: Record<string, number> = {};
  const fr = new Map<string, number>();
  for (const r of inWindow) {
    const w = agentWeight(r.created_at - r.agent_created_at);
    wTotal += w;
    if (r.would_use) wUse += w;
    if (r.would_recommend) wRec += w;
    tried[r.tried] = (tried[r.tried] ?? 0) + 1;
    for (const f of r.friction) fr.set(f, (fr.get(f) ?? 0) + w);
  }
  const owners = new Set(inWindow.map((r) => r.owner_key)).size;
  const enough = owners >= MIN_SAMPLE && wTotal > 0;
  return {
    window: now <= end ? "open" : "closed",
    window_ends_at: end,
    evaluations: inWindow.length,
    distinct_owners: owners,
    would_use_pct: enough ? Math.round((wUse / wTotal) * 100) : null,
    would_recommend_pct: enough ? Math.round((wRec / wTotal) * 100) : null,
    tried,
    top_friction: [...fr.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([point, w]) => ({ point, count: Math.round(w * 10) / 10 })),
    needed_for_percentages: Math.max(0, MIN_SAMPLE - owners),
  };
}
