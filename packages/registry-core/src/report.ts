import { scoreAgentReady } from "./agentready.js";
import type { ProjectSignals } from "./signals.js";

export interface ReportCheck { label: string; passing: number; pct: number }
export interface AgentReadyReport {
  /** Projects with Agent-Ready facts (older stored results without them are left out, not guessed). */
  n: number;
  avgReadiness: number;
  avgAgentReady: number;
  /** Every Agent-Ready check, the most commonly missing first. */
  checks: ReportCheck[];
}

/** Totals only, by fixed rules, over the projects the Index holds. It names no project and says nothing about any one of them. */
export function agentReadyReport(rows: { signals: ProjectSignals; total: number }[]): AgentReadyReport {
  const per = new Map<string, number>();
  let n = 0, readiness = 0, agent = 0;
  for (const r of rows) {
    const ar = scoreAgentReady(r.signals);
    if (!ar) continue;
    n++;
    readiness += r.total;
    agent += ar.total;
    for (const c of ar.components) for (const i of c.items) per.set(i.label, (per.get(i.label) ?? 0) + (i.points >= i.max ? 1 : 0));
  }
  const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);
  return {
    n,
    avgReadiness: n ? Math.round(readiness / n) : 0,
    avgAgentReady: n ? Math.round(agent / n) : 0,
    checks: [...per.entries()].map(([label, passing]) => ({ label, passing, pct: pct(passing) })).sort((a, b) => a.pct - b.pct || a.label.localeCompare(b.label)),
  };
}
