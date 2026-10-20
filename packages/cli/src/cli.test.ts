import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP, main, parseTarget, repoFromGitConfig, score } from "./index.js";

const comp = (title: string, s: number, max: number, items: object[] = []) => ({ title, score: s, max, items });
const scoreJson = (total: number, band: string, fix?: string) => ({ project: "github.com/o/r", band, total, components: [comp("Clarity", total, 100, fix ? [{ label: "L", points: 0, max: 5, reason: "r", fix }] : [])] });
const fakeFetch = (routes: Record<string, () => Response>): typeof fetch => (async (u: string | URL) => {
  const url = new URL(String(u)); const h = routes[url.pathname + url.search] ?? routes[url.pathname];
  return h ? h() : new Response(JSON.stringify({ error: "not found" }), { status: 404 });
}) as typeof fetch;
const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const routes = { "/api/score/github.com/o/r": () => j(scoreJson(72, "Nearly there", "Add a screenshot.")), "/api/agent-ready/github.com/o/r": () => j(scoreJson(55, "Partly", "Add llms.txt.")) };

describe("scbee command line", () => {
  it("understands repos, packages and sites", () => {
    expect(parseTarget("https://github.com/o/r.git")).toMatchObject({ kind: "github", path: "github.com/o/r" });
    expect(parseTarget("o/r")).toMatchObject({ kind: "github" });
    expect(parseTarget("@scope/pkg")).toMatchObject({ kind: "npm", name: "@scope/pkg" });
    expect(parseTarget("example.com")).toMatchObject({ kind: "web", path: "web/example.com" });
    expect(parseTarget("a b c")).toBeNull();
  });

  it("finds the GitHub repo of a local clone from .git/config, without git", () => {
    const dir = mkdtempSync(join(tmpdir(), "scbee-cli-"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "config"), '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:HMAKT99/ScBee.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
    expect(repoFromGitConfig(dir)).toBe("HMAKT99/ScBee");
    writeFileSync(join(dir, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/a/b\n');
    expect(repoFromGitConfig(dir)).toBe("a/b");
    writeFileSync(join(dir, ".git", "config"), '[remote "origin"]\n\turl = https://gitlab.com/a/b.git\n');
    expect(repoFromGitConfig(dir)).toBeNull();
    expect(repoFromGitConfig(join(dir, "nope"))).toBeNull();
  });

  it("prints both scores with the biggest fixes, and exits 2 below --min", async () => {
    const ok = await score("o/r", { url: "https://s.test", fetch: fakeFetch(routes) });
    expect(ok.code).toBe(0);
    expect(ok.out).toContain("github.com/o/r: 72/100 (Nearly there)");
    expect(ok.out).toContain("Agent-ready: 55/100 (Partly)");
    expect(ok.out).toContain("- Add a screenshot. (+5 Clarity)");
    expect(ok.out).toContain("- Add llms.txt. (+5 Clarity)");
    expect(ok.out).toContain("https://s.test/github.com/o/r");
    expect(ok.out).toContain("not a prediction");
    const low = await score("o/r", { url: "https://s.test", min: 80, fetch: fakeFetch(routes) });
    expect(low.code).toBe(2);
    expect(low.out).toContain("Below the minimum of 80.");
    expect((await score("o/r", { url: "https://s.test", min: 70, fetch: fakeFetch(routes) })).code).toBe(0);
    const json = JSON.parse((await score("o/r", { url: "https://s.test", json: true, fetch: fakeFetch(routes) })).out);
    expect(json).toEqual({ project: "github.com/o/r", readiness: { total: 72, band: "Nearly there" }, agent_ready: { total: 55, band: "Partly" } });
  });

  it("reports errors plainly, and resolves npm packages through ScBee", async () => {
    expect((await score("nobody/none", { url: "https://s.test", fetch: fakeFetch({}) })).code).toBe(1);
    expect((await score("a b c", { url: "https://s.test", fetch: fakeFetch({}) })).out).toContain("Not a repo, package or site");
    const npm = fakeFetch({ ...routes, "/npm/some-pkg": () => new Response(null, { status: 302, headers: { location: "/github.com/o/r" } }) });
    expect((await score("npm:some-pkg", { url: "https://s.test", fetch: npm })).out).toContain("github.com/o/r: 72/100");
    const none = fakeFetch({ "/npm/no-repo": () => new Response(null, { status: 404 }) });
    expect((await score("npm:no-repo", { url: "https://s.test", fetch: none })).code).toBe(1);
  });

  it("handles arguments: help, version, bad options, find", async () => {
    const f = fakeFetch({ ...routes, "/api/handoff": () => j({ matches: [{ handle: "lint-bot", name: "Lint Bot", tagline: "Lints", install: "npx lint", matched: ["lint"], page: "https://s.test/r/lint-bot" }] }) });
    expect((await main([], {}, "/", "9.9.9", f)).out).toBe(HELP);
    expect((await main(["--version"], {}, "/", "9.9.9", f)).out).toBe("9.9.9\n");
    expect((await main(["score", "o/r", "--min", "abc"], {}, "/", "1", f)).code).toBe(1);
    expect((await main(["score", "o/r", "--url", "nonsense"], {}, "/", "1", f)).code).toBe(1);
    expect((await main(["nonsense"], {}, "/", "1", f)).out).toContain("Unknown command");
    expect((await main(["score", "o/r", "--url", "https://s.test"], {}, "/", "1", f)).out).toContain("72/100");
    expect((await main(["score", "o/r"], { SCBEE_URL: "https://s.test" }, "/", "1", f)).code).toBe(0);
    const found = await main(["find", "lint my files", "--url", "https://s.test"], {}, "/", "1", f);
    expect(found.out).toContain("@lint-bot");
    expect(found.out).toContain("install: npx lint");
    expect(found.out).toContain("Nothing was installed or run.");
    expect((await main(["find", "ab"], {}, "/", "1", f)).code).toBe(1);
    expect((await main(["score", "."], {}, "/definitely/not/a/clone", "1", f)).out).toContain("Could not find a GitHub repository");
  });
});
