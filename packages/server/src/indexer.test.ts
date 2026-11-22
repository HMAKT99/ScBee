import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { botMayFetch, parseRegistryPage, probeEntry, rpcResult, type Requester } from "@scbee/registry-core";
import { createApp } from "./app.js";
import { runIndexer } from "./indexer.js";
import { Store } from "./store.js";

const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const meta = (over: Record<string, unknown> = {}) => ({ "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true, updatedAt: "2026-11-01T00:00:00Z", ...over } });
const server = (name: string, over: Record<string, unknown> = {}) => ({ server: { name, description: `${name} reads PDF files`, version: "1.0.0", ...over }, _meta: meta() });

describe("reading the official MCP Registry", () => {
  it("keeps the latest version of each server, https links only, a GitHub repo when there is one, and cleaned text", () => {
    const { entries, nextCursor } = parseRegistryPage({
      servers: [
        { server: { name: "io.github.acme/pdf", title: "PDF‮ reader", description: "Reads PDFs\u0000 fast", version: "2.0.0", repository: { url: "https://github.com/acme/pdf.git" }, websiteUrl: "https://pdf.acme.dev", remotes: [{ type: "streamable-http", url: "https://mcp.acme.dev/mcp" }], packages: [{ registryType: "npm", identifier: "@acme/pdf" }] }, _meta: meta() },
        { server: { name: "io.github.acme/pdf", version: "1.0.0" }, _meta: meta({ isLatest: false }) },
        { server: { name: "io.github.bad/links", websiteUrl: "http://plain.example", remotes: [{ type: "streamable-http", url: "https://user:pw@x.example/mcp" }], repository: { url: "https://gitlab.com/a/b" } }, _meta: meta() },
        { server: { name: "not a name!" }, _meta: meta() },
        { server: { name: "io.github.gone/away" }, _meta: meta({ status: "deleted" }) },
      ],
      metadata: { nextCursor: "abc" },
    });
    expect(nextCursor).toBe("abc");
    expect(entries.map((e) => e.key)).toEqual(["io.github.acme/pdf", "io.github.bad/links", "io.github.gone/away"]);
    expect(entries[0]).toMatchObject({ title: "PDF reader", description: "Reads PDFs fast", repo: "github.com/acme/pdf", website: "https://pdf.acme.dev/", remote: "https://mcp.acme.dev/mcp", pkg: "npm:@acme/pdf", status: "active" });
    expect(entries[1]).toMatchObject({ website: null, remote: null, repo: null });
    expect(entries[2]!.status).toBe("deleted");
  });

  it("robots.txt: the bot's own group wins, the longest rule wins, and wildcards work", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: ScBeeBot\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.json$\n";
    expect(botMayFetch(txt, "ScBeeBot", "/")).toBe(true);
    expect(botMayFetch(txt, "ScBeeBot", "/private/x")).toBe(false);
    expect(botMayFetch(txt, "ScBeeBot", "/private/ok/y")).toBe(true);
    expect(botMayFetch(txt, "ScBeeBot", "/.well-known/agent-card.json")).toBe(false);
    expect(botMayFetch(txt, "OtherBot", "/")).toBe(false);
    expect(botMayFetch("", "ScBeeBot", "/anything")).toBe(true);
  });

  it("reads JSON-RPC answers from JSON or Server-Sent Events bodies", () => {
    expect(rpcResult('{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}', 2)?.result).toEqual({ tools: [] });
    expect(rpcResult('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":1}}\n\n', 2)?.result).toEqual({ ok: 1 });
    expect(rpcResult("nonsense", 2)).toBeNull();
  });
});

/** A fake internet: each host's robots.txt, agent card and MCP endpoint, recording every request. */
function fakeNet(sites: Record<string, { robots?: string; card?: unknown; mcp?: "ok" | "auth" | "sse" | "down"; registry?: (u: URL) => unknown }>) {
  const seen: { url: string; method: string; body?: string; ua?: string; session?: string }[] = [];
  const requester: Requester = async (r, o) => {
    const u = r.url;
    seen.push({ url: u.toString(), method: o.method ?? "GET", body: o.body, ua: o.headers?.["user-agent"], session: o.headers?.["mcp-session-id"] });
    const s = sites[u.hostname];
    if (!s) return { status: 404, body: "" };
    if (s.registry) return { status: 200, body: JSON.stringify(s.registry(u)) };
    if (u.pathname === "/robots.txt") return s.robots === undefined ? { status: 404, body: "" } : { status: 200, body: s.robots };
    if (u.pathname === "/.well-known/agent-card.json") return s.card ? { status: 200, body: JSON.stringify(s.card) } : { status: 404, body: "" };
    if (u.pathname === "/mcp" && o.method === "POST") {
      if (s.mcp === "down") return { status: 503, body: "" };
      if (s.mcp === "auth") return { status: 401, body: "", headers: { "www-authenticate": "Bearer" } };
      const msg = JSON.parse(o.body ?? "{}");
      if (msg.method === "initialize") return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } } }), headers: { "mcp-session-id": "sess-1" } };
      if (msg.method === "notifications/initialized") return { status: 202, body: "" };
      if (msg.method === "tools/list") {
        const result = { jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "read_pdf", description: "Read a PDF ‮and return text" }, { name: "ocr", description: "Optical character recognition" }] } };
        return s.mcp === "sse" ? { status: 200, body: `event: message\ndata: ${JSON.stringify(result)}\n\n` } : { status: 200, body: JSON.stringify(result) };
      }
      return { status: 400, body: "" };
    }
    return { status: 404, body: "" };
  };
  return { seen, opts: { lookup, requester } };
}

describe("ScBeeBot's visit to one host", () => {
  it("reads robots.txt first, then the tool list, never calls a tool, and says who it is", async () => {
    const net = fakeNet({ "mcp.acme.dev": { mcp: "sse" } });
    const r = await probeEntry({ website: null, remote: "https://mcp.acme.dev/mcp" }, net.opts, "ScBeeBot (+https://t/bot)");
    expect(r.outcome).toBe("ok");
    expect(r.tools).toEqual([{ name: "read_pdf", description: "Read a PDF and return text" }, { name: "ocr", description: "Optical character recognition" }]);
    expect(net.seen[0]!.url).toBe("https://mcp.acme.dev/robots.txt");
    expect(net.seen.every((s) => s.ua === "ScBeeBot (+https://t/bot)")).toBe(true);
    expect(net.seen.some((s) => s.body?.includes("tools/call"))).toBe(false);
    expect(net.seen.find((s) => s.body?.includes("tools/list"))?.session).toBe("sess-1");
    expect(r.requests).toBeLessThanOrEqual(5);
  });

  it("obeys robots.txt and leaves anything behind a login alone", async () => {
    const blocked = fakeNet({ "mcp.acme.dev": { robots: "User-agent: ScBeeBot\nDisallow: /", mcp: "ok" } });
    expect((await probeEntry({ website: null, remote: "https://mcp.acme.dev/mcp" }, blocked.opts, "ScBeeBot")).outcome).toBe("robots");
    expect(blocked.seen.map((s) => s.url)).toEqual(["https://mcp.acme.dev/robots.txt"]);
    const login = fakeNet({ "mcp.acme.dev": { mcp: "auth" } });
    const r = await probeEntry({ website: null, remote: "https://mcp.acme.dev/mcp" }, login.opts, "ScBeeBot");
    expect(r.outcome).toBe("auth");
    expect(login.seen.some((s) => s.body?.includes("tools/list"))).toBe(false);
  });

  it("reads a website's public agent card", async () => {
    const net = fakeNet({ "pdf.acme.dev": { card: { name: "Acme PDF", description: "Reads PDFs", skills: [{ name: "read pdf" }] } } });
    const r = await probeEntry({ website: "https://pdf.acme.dev/", remote: null }, net.opts, "ScBeeBot");
    expect(r).toMatchObject({ outcome: "ok", card: { name: "Acme PDF", skills: ["read pdf"] } });
  });

  it("refuses private addresses, like every other fetch ScBee makes", async () => {
    const r = await probeEntry({ website: null, remote: "https://internal.example/mcp" }, { lookup: async () => [{ address: "10.0.0.5", family: 4 }], requester: async () => ({ status: 200, body: "" }) }, "ScBeeBot");
    expect(r.outcome).toBe("error");
  });
});

describe("the daily index run", () => {
  it("pages through the registry, then asks only for changes, applies deletions, and visits each host once a day", async () => {
    const store = await Store.open(":memory:");
    const calls: URL[] = [];
    let phase = 1;
    const net = fakeNet({
      "registry.modelcontextprotocol.io": {
        registry: (u) => {
          calls.push(u);
          if (phase === 1 && !u.searchParams.get("cursor")) return { servers: [server("io.github.acme/pdf", { remotes: [{ type: "streamable-http", url: "https://mcp.acme.dev/mcp" }], websiteUrl: "https://acme.dev" })], metadata: { nextCursor: "p2" } };
          if (phase === 1) return { servers: [server("io.github.zed/ocr", { repository: { url: "https://github.com/zed/ocr" } })], metadata: {} };
          return { servers: [{ server: { name: "io.github.zed/ocr" }, _meta: meta({ status: "deleted" }) }], metadata: {} };
        },
      },
      "mcp.acme.dev": { mcp: "ok" },
    });
    const first = await runIndexer(store, { baseUrl: "https://t", fetchOpts: net.opts, deadline: Date.now() + 10_000 });
    expect(first).toMatchObject({ pages: 2, entries: 2, synced: true, probed: 1 });
    expect(calls[1]!.searchParams.get("cursor")).toBe("p2");
    expect(await store.indexedCount()).toBe(2);
    const acme = (await store.indexedCandidates(["pdf"]))[0]!;
    expect(JSON.parse(acme.tools_json!)[0].name).toBe("read_pdf");

    phase = 2;
    const second = await runIndexer(store, { baseUrl: "https://t", fetchOpts: net.opts, deadline: Date.now() + 10_000 });
    const inc = calls.at(-1)!;
    expect(inc.searchParams.get("updated_since")).toBeTruthy();
    expect(inc.searchParams.get("include_deleted")).toBe("true");
    expect(await store.indexedCount()).toBe(1); // the registry deleted zed/ocr, so did ScBee
    expect(second.probed).toBe(0); // acme's host was already visited today
    expect(net.seen.filter((s) => s.url.startsWith("https://mcp.acme.dev/robots.txt")).length).toBe(1);
    store.close();
  });

  it("backs off from a host that errors, and never visits an opted-out site", async () => {
    const store = await Store.open(":memory:");
    await store.applyIndexed([
      { key: "io.github.a/down", title: null, description: "d", version: "1", repo: null, website: null, remote: "https://down.example/mcp", pkg: null, status: "active", updatedAt: null },
      { key: "io.github.b/out", title: null, description: "d", version: "1", repo: null, website: "https://out.example", remote: null, pkg: null, status: "active", updatedAt: null },
    ]);
    const db = (store as unknown as { db: { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: unknown[][] }> } }).db;
    await db.execute({ sql: "INSERT INTO optouts (source_key, token, created_at, confirmed_at) VALUES ('url:https://out.example', 't', 0, 1)", args: [] });
    const net = fakeNet({ "down.example": { robots: undefined, mcp: "down" } });
    const failing: Requester = async (r, o) => (r.url.pathname === "/robots.txt" ? { status: 500, body: "" } : net.opts.requester(r, o));
    await runIndexer(store, { baseUrl: "https://t", fetchOpts: { lookup, requester: failing }, deadline: Date.now() + 10_000 });
    const host = (await db.execute({ sql: "SELECT failures, retry_after FROM bot_hosts WHERE host = 'down.example'", args: [] })).rows[0]!;
    expect(Number(host[0])).toBe(1);
    expect(Number(host[1])).toBeGreaterThan(Date.now() + 86_400_000);
    expect((await db.execute({ sql: "SELECT COUNT(*) FROM bot_hosts WHERE host = 'out.example'", args: [] })).rows[0]![0]).toBe(0);
    expect(await store.indexedCount()).toBe(1); // the opted-out entry is hidden
    store.close();
  });
});

describe("index entries on the site", () => {
  let base = "";
  let close = () => {};
  let store: Store;
  beforeAll(async () => {
    store = await Store.open(":memory:");
    await store.applyIndexed([
      { key: "io.github.acme/pdf", title: "Acme PDF reader", description: "Reads PDF files and returns text", version: "1", repo: "github.com/acme/pdf", website: "https://pdf.acme.dev/", remote: null, pkg: "npm:@acme/pdf", status: "active", updatedAt: null },
      { key: "io.github.nolink/pdf", title: null, description: "PDF tool with no website", version: "1", repo: null, website: null, remote: "https://x.example/mcp", pkg: null, status: "active", updatedAt: null },
    ]);
    const { server: srv } = createApp({ store, baseUrl: "http://t", fetchOpts: { lookup, requester: async () => ({ status: 404, body: "" }) } });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    close = () => srv.close();
  });
  afterAll(() => { close(); store.close(); });
  const get = (p: string, headers: Record<string, string> = {}) => fetch(base + p, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", ...headers } });

  it("search and hand-off list verified agents first, then labelled index entries with counted links", async () => {
    const s = await (await get("/api/agents?q=pdf")).json() as any;
    expect(Array.isArray(s.agents)).toBe(true);
    expect(s.indexed[0]).toMatchObject({ label: "Indexed · unclaimed", name: "Acme PDF reader", source: "official MCP Registry" });
    const h = await (await get("/api/handoff?need=read+pdf+files")).json() as any;
    expect(Object.keys(h).indexOf("matches")).toBeLessThan(Object.keys(h).indexOf("indexed"));
    expect(h.indexed.map((x: any) => x.name)).toEqual(["Acme PDF reader"]); // the entry with no website or repo has nowhere to send people
    expect(h.indexed[0].page).toMatch(/^http:\/\/t\/r\/x\/\d+$/);
    expect((await (await get("/api/agents")).json() as any).indexed).toEqual([]); // nothing from the index without a search
  });

  it("a hand-off link counts once per visitor an hour and sends them to the entry's own site with ref=scbee", async () => {
    const id = (await store.indexedCandidates(["acme"]))[0]!.id;
    const r = await get(`/r/x/${id}?to=https://evil.example`);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://pdf.acme.dev/?ref=scbee");
    await get(`/r/x/${id}`);
    expect(await store.indexedHandoffs(id)).toBe(1);
    expect((await get("/r/x/999999")).status).toBe(404);
  });

  it("counts index entries on their own, never as agents or owners", async () => {
    const s = await (await get("/api/stats")).json() as any;
    expect(s.indexed_entries).toBe(2);
    expect(s.verified_agents).toBe(0);
    expect(s.distinct_owners).toBe(0);
  });

  it("serves /bot as a page and Markdown, and shows the hand-offs on the project's page", async () => {
    const page = await (await get("/bot")).text();
    for (const n of ["ScBeeBot", "never calls a tool", "User-agent: ScBeeBot", "Indexed · unclaimed", "never counted as agents", "/optout"]) expect(page, n).toContain(n);
    expect(page).not.toMatch(/partnered/i);
    expect(await (await get("/bot?format=md")).text()).toMatch(/^# ScBeeBot/);
    expect(await (await get("/sitemap.xml")).text()).toContain("/bot");
    expect(await (await get("/llms.txt")).text()).toContain("/bot");
  });
});
