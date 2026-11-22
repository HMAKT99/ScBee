import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { Store } from "./store.js";
import { callerHash, classify, pathGroup, toolNames, AI_CRAWLERS, type Seen } from "./traffic.js";

const seen = (over: Partial<Seen>): Seen => ({ path: "/", userAgent: "", method: "GET", internal: false, markdown: false, via: null, ...over });
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("classifying a request", () => {
  it("puts each kind of visitor in its class", () => {
    expect(classify(seen({ userAgent: CHROME }))).toBe("human");
    expect(classify(seen({ userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" }))).toBe("ai_crawler");
    expect(classify(seen({ userAgent: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" }))).toBe("ai_crawler");
    expect(classify(seen({ userAgent: "Mozilla/5.0 (compatible; PerplexityBot/1.0)" }))).toBe("ai_crawler");
    expect(classify(seen({ userAgent: "claude-code/2.1.0 (external, cli)" }))).toBe("agent_client");
    expect(classify(seen({ path: "/mcp", userAgent: "node" }))).toBe("agent_client");
    expect(classify(seen({ userAgent: "", via: "cli" }))).toBe("agent_client");
    expect(classify(seen({ userAgent: CHROME, markdown: true }))).toBe("agent_client");
    expect(classify(seen({ userAgent: "ScBeeBot (+https://scbee.vercel.app/bot)" }))).toBe("scbee_self");
    expect(classify(seen({ userAgent: CHROME, internal: true }))).toBe("scbee_self");
    expect(classify(seen({ path: "/api/admin/traffic", userAgent: "node" }))).toBe("scbee_self");
    expect(classify(seen({ path: "/api/cron/tick", userAgent: "" }))).toBe("scbee_self");
    expect(classify(seen({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" }))).toBe("unknown");
    expect(classify(seen({ userAgent: "curl/8.4.0" }))).toBe("unknown");
    expect(classify(seen({ userAgent: "" }))).toBe("unknown");
  });
  it("an AI crawler is an AI crawler even on /mcp, and names match on word boundaries", () => {
    expect(classify(seen({ path: "/mcp", userAgent: "ChatGPT-User/1.0" }))).toBe("ai_crawler");
    expect(classify(seen({ userAgent: "Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 (KHTML, like Gecko) MyCursorlessApp/1.0" }))).toBe("human");
    expect(AI_CRAWLERS.length).toBeGreaterThan(10);
  });
  it("groups paths into a short fixed list, never the path itself", () => {
    expect(pathGroup("/")).toBe("home");
    expect(pathGroup("/github.com/a/b")).toBe("score");
    expect(pathGroup("/for/read-pdf-files")).toBe("need");
    expect(pathGroup("/api/score/github.com/a/b")).toBe("api");
    expect(pathGroup("/llms.txt")).toBe("discovery");
    expect(pathGroup("/a/some-agent")).toBe("agent");
    expect(pathGroup("/anything/else?x=1")).toBe("other");
  });
  it("hashes are the same within a day and differ across days and callers", () => {
    expect(callerHash("s1", "1.2.3.4", "ua")).toBe(callerHash("s1", "1.2.3.4", "ua"));
    expect(callerHash("s2", "1.2.3.4", "ua")).not.toBe(callerHash("s1", "1.2.3.4", "ua"));
    expect(callerHash("s1", "1.2.3.5", "ua")).not.toBe(callerHash("s1", "1.2.3.4", "ua"));
  });
  it("keeps only ScBee-shaped tool names from an MCP body", () => {
    expect(toolNames({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "scbee_score" } })).toEqual(["scbee_score"]);
    expect(toolNames([{ method: "tools/call", params: { name: "scbee_handoff" } }, { method: "tools/call", params: { name: "<script>" } }, { method: "tools/list" }])).toEqual(["scbee_handoff"]);
  });
});

describe("recording traffic", () => {
  let base = "";
  let close = () => {};
  let store: Store;
  const lookup = async () => [{ address: "93.184.216.34", family: 4 as const }];
  beforeAll(async () => {
    store = await Store.open(":memory:");
    const { server } = createApp({ store, baseUrl: "http://t", fetchOpts: { lookup, requester: async () => ({ status: 404, body: "" }) }, adminToken: "adm-secret", cronSecret: "cron-secret" });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => { close(); store.close(); });
  const get = (p: string, ua: string, headers: Record<string, string> = {}) => fetch(base + p, { headers: { "user-agent": ua, ...headers } });
  const report = async () => (await (await fetch(`${base}/api/admin/traffic?days=2`, { headers: { "x-admin-token": "adm-secret" } })).json()) as any;
  const total = (r: any, cls: string, grp?: string) => r.daily.filter((x: any) => x.class === cls && (!grp || x.grp === grp)).reduce((n: number, x: any) => n + x.n, 0);
  const distinct = (r: any, cls: string, scope = "all") => r.distinct.filter((x: any) => x.class === cls && x.scope === scope).reduce((n: number, x: any) => n + x.n, 0);

  it("counts requests by class and page group, and distinct callers per day", async () => {
    await get("/", CHROME); await get("/trust", CHROME); await get("/llms.txt", "Mozilla/5.0 (compatible; ClaudeBot/1.0)");
    await get("/style.css", CHROME); // assets are not counted
    const r = await report();
    expect(total(r, "human")).toBe(2);
    expect(total(r, "human", "home")).toBe(1);
    expect(total(r, "ai_crawler", "discovery")).toBe(1);
    expect(distinct(r, "human")).toBe(1); // same address and browser: one caller
    expect(r.daily.some((x: any) => x.grp === "other" && x.class === "human")).toBe(false);
  });

  it("counts /mcp callers and calls per tool, and the hosted server's own API calls are not counted again", async () => {
    const before = await report();
    const rpc = (body: unknown) => fetch(`${base}/mcp`, { method: "POST", headers: { "user-agent": "claude-code/2.1.0", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });
    await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "scbee_search_agents", arguments: { query: "pdf" } } });
    const r = await report();
    expect(total(r, "agent_client", "mcp") - total(before, "agent_client", "mcp")).toBe(2);
    expect(distinct(r, "agent_client", "mcp")).toBe(1);
    expect(r.tools.find((t: any) => t.tool === "scbee_search_agents")?.n).toBe(1);
    // the tool called /api/agents inside the process: that is ScBee itself, not a second visitor
    expect(total(r, "agent_client", "api")).toBe(total(before, "agent_client", "api"));
    expect(total(r, "scbee_self", "api")).toBeGreaterThan(total(before, "scbee_self", "api"));
  });

  it("stores no address, user agent or path anywhere", async () => {
    await get("/github.com/secret-owner/secret-repo-name", "UniqueAgent/9.9 claude-code");
    const db = (store as unknown as { db: { execute: (s: string) => Promise<{ rows: unknown[][] }> } }).db;
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'traffic_%'")).rows.map((r) => String(r[0]));
    expect(tables.sort()).toEqual(["traffic_callers", "traffic_daily", "traffic_distinct", "traffic_tools"]);
    for (const t of tables) {
      const dump = JSON.stringify((await db.execute(`SELECT * FROM ${t}`)).rows);
      for (const secret of ["127.0.0.1", "UniqueAgent", "claude-code", "secret-repo-name", "Chrome"]) expect(dump, `${t}: ${secret}`).not.toContain(secret);
    }
  });

  it("the report is for the operator only", async () => {
    expect((await fetch(`${base}/api/admin/traffic`)).status).toBe(403);
    expect((await fetch(`${base}/api/admin/traffic`, { headers: { "x-admin-token": "wrong" } })).status).toBe(403);
    // nothing public writes these tables except by making a request; there is no endpoint that takes traffic data
    expect((await fetch(`${base}/api/admin/traffic`, { method: "POST", headers: { "x-admin-token": "adm-secret" } })).status).toBe(404);
  });

  it("the daily cron turns finished days into counts and deletes their hashes and salt", async () => {
    const db = (store as unknown as { db: { execute: (q: string | { sql: string; args: unknown[] }) => Promise<{ rows: unknown[][] }> } }).db;
    await db.execute({ sql: "INSERT INTO traffic_callers (day, class, scope, h) VALUES ('2026-01-01', 'human', 'all', 'a'), ('2026-01-01', 'human', 'all', 'b')", args: [] });
    await db.execute({ sql: "INSERT INTO secrets (name, value, created_at) VALUES ('traffic_salt:2026-01-01', 'old', 0)", args: [] });
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`${base}/api/cron/tick`, { method: "POST", headers: { authorization: "Bearer cron-secret" } });
    expect(r.status).toBe(200);
    expect((await db.execute("SELECT COUNT(*) FROM traffic_callers WHERE day = '2026-01-01'")).rows[0]![0]).toBe(0);
    expect((await db.execute("SELECT n FROM traffic_distinct WHERE day = '2026-01-01' AND class = 'human' AND scope = 'all'")).rows[0]![0]).toBe(2);
    expect((await db.execute("SELECT COUNT(*) FROM secrets WHERE name = 'traffic_salt:2026-01-01'")).rows[0]![0]).toBe(0);
    // today's salt and hashes stay until the day is over
    expect(Number((await db.execute({ sql: "SELECT COUNT(*) FROM secrets WHERE name = ?", args: [`traffic_salt:${today}`] })).rows[0]![0])).toBe(1);
    expect(Number((await db.execute({ sql: "SELECT COUNT(*) FROM traffic_callers WHERE day = ?", args: [today] })).rows[0]![0])).toBeGreaterThan(0);
  });
});
