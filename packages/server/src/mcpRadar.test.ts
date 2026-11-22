import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { Store } from "./store.js";

describe("MCP servers this week (/radar/mcp)", () => {
  let base = "";
  let close = () => {};
  let store: Store;
  beforeAll(async () => {
    store = await Store.open(":memory:");
    const recent = new Date(Date.now() - 86_400_000).toISOString();
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    await store.applyIndexed([
      { key: "io.github.a/new-one", title: "New One", description: "Reads PDF files", version: "1", repo: null, website: "https://a.example", remote: null, pkg: null, status: "active", updatedAt: recent },
      { key: "io.github.a/new-dup", title: "New One", description: "Reads PDF files", version: "1", repo: null, website: "https://b.example", remote: null, pkg: null, status: "active", updatedAt: recent },
      { key: "io.github.b/old", title: "Old", description: "Sends email", version: "1", repo: null, website: "https://c.example", remote: null, pkg: null, status: "active", updatedAt: old },
    ]);
    const { server } = createApp({ store, baseUrl: "http://t", fetchOpts: { lookup: async () => [{ address: "93.184.216.34", family: 4 }], requester: async () => ({ status: 404, body: "" }) } });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => { close(); store.close(); });
  const get = (p: string) => fetch(base + p, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" } });

  it("counts what the registry published this week, lists the newest once each, and links entry pages", async () => {
    const html = await (await get("/radar/mcp")).text();
    expect(html).toContain("<strong>2</strong> servers published or updated");
    expect((html.match(/<strong>New One<\/strong>/g) ?? []).length).toBe(1); // the duplicate listing shows once
    expect(html).not.toContain("<strong>Old</strong>");
    expect(html).toMatch(/href="\/i\/\d+"/);
    const md = await (await get("/radar/mcp?format=md")).text();
    expect(md).toMatch(/^# MCP servers this week/);
    expect(md).toContain('<scbee_data untrusted_strings="true">');
  });

  it("has a weekly Atom feed, and is in the sitemap and llms.txt", async () => {
    const feed = await get("/feeds/radar-mcp.atom");
    expect(feed.headers.get("content-type")).toMatch(/atom\+xml/);
    expect(await feed.text()).toMatch(/<title>Week of \d{4}-\d{2}-\d{2}: 2 MCP servers published or updated<\/title>/);
    expect(await (await get("/sitemap.xml")).text()).toContain("http://t/radar/mcp");
    expect(await (await get("/llms.txt")).text()).toContain("/radar/mcp");
  });
});
