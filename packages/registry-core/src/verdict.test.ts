import { describe, expect, it } from "vitest";
import { agentWeight, computeForecast, parseVerdict, MIN_SAMPLE, LAUNCH_WINDOW_MS, type VerdictRow } from "./index.js";

const ok = { project: "github.com/Zed/Widget", tried: "installed", would_use: true, would_recommend_to_human: false, summary: "Installed fine." };

describe("parseVerdict", () => {
  it("accepts a valid verdict and normalises the project", () => {
    const r = parseVerdict({ ...ok, would_integrate_with: ["zed/other"], friction_points: ["docs"] });
    expect(r).toMatchObject({ ok: true, verdict: { project: "github:zed/widget", would_integrate_with: ["github:zed/other"] } });
  });
  it.each([
    ["non-GitHub project", { ...ok, project: "https://example.com" }],
    ["bad tried", { ...ok, tried: "guessed" }],
    ["long summary", { ...ok, summary: "x".repeat(281) }],
    ["empty summary", { ...ok, summary: "  " }],
    ["invisible characters", { ...ok, summary: "hi‮there" }],
    ["unknown friction", { ...ok, friction_points: ["vibes"] }],
    ["too many integrations", { ...ok, would_integrate_with: ["a/b", "a/c", "a/d", "a/e", "a/f", "a/g"] }],
    ["missing field", { project: ok.project }],
  ])("rejects %s", (_n, v) => expect(parseVerdict(v).ok).toBe(false));
});

const NOW = 1_000_000_000_000;
const row = (i: number, over: Partial<VerdictRow> = {}): VerdictRow => ({
  owner_key: `o${i}`, agent_created_at: NOW - 30 * 86_400_000, verified: true, tried: "installed", would_use: true, would_recommend: true,
  friction: [], created_at: NOW + 1000, ...over,
});

describe("computeForecast", () => {
  it("hides percentages below the minimum sample", () => {
    const f = computeForecast([row(1), row(2)], NOW, NOW + 1000);
    expect(f).toMatchObject({ evaluations: 2, would_use_pct: null, needed_for_percentages: MIN_SAMPLE - 2 });
  });
  it("computes weighted percentages once there are enough distinct owners", () => {
    const rows = [1, 2, 3, 4].map((i) => row(i)).concat(row(5, { would_use: false, would_recommend: false }));
    const f = computeForecast(rows, NOW, NOW + 1000);
    expect(f.would_use_pct).toBe(80);
    expect(f.needed_for_percentages).toBe(0);
  });
  it("ignores unverified agents and verdicts after the 72h window", () => {
    const rows = [row(1, { verified: false }), row(2, { created_at: NOW + LAUNCH_WINDOW_MS + 1 }), row(3)];
    expect(computeForecast(rows, NOW, NOW + 1000).evaluations).toBe(1);
  });
  it("reports window state", () => {
    expect(computeForecast([], NOW, NOW + 1000).window).toBe("open");
    expect(computeForecast([], NOW, NOW + LAUNCH_WINDOW_MS + 1).window).toBe("closed");
  });
  it("ranks friction points by weighted count", () => {
    const rows = [row(1, { friction: ["install", "docs"] }), row(2, { friction: ["install"] }), row(3, { friction: ["auth"] })];
    expect(computeForecast(rows, NOW, NOW + 1000).top_friction[0]).toMatchObject({ point: "install" });
  });
  it("new agents count for less than established ones", () => {
    expect(agentWeight(0)).toBe(0.5);
    expect(agentWeight(30 * 86_400_000)).toBe(1);
  });
});
