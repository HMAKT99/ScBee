import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IndexedEntry } from "@scbee/registry-core";
import { createApp } from "./app.js";
import { alternativesFor, MIN_ENTRIES, NEEDS, qualifyNeeds, resolveNeed } from "./needs.js";
import { Store } from "./store.js";

const entry = (key: string, description: string, over: Partial<IndexedEntry> = {}): IndexedEntry =>
  ({ key, title: null, description, version: "1", repo: null, website: `https://${key.split("/")[1]}.example`, remote: null, pkg: null, status: "active", updatedAt: null, ...over });

describe("the curated needs", () => {
  it("each has a unique slug, a title in task words, a real answer and matching rules", () => {
    expect(new Set(NEEDS.map((n) => n.slug)).size).toBe(NEEDS.length);
    for (const n of NEEDS) {
      expect(n.slug, n.slug).toMatch(/^[a-z0-9-]{3,60}$/);
      expect(n.answer.length, `${n.slug} answer is too thin`).toBeGreaterThanOrEqual(120);
      expect(n.must.length, n.slug).toBeGreaterThan(0);
      expect(n.answer).not.toMatch(/\b(register|sign up) (now|here)\b/i);
    }
  });

  it("matches whole words only, so pdfium is not pdf", async () => {
    const store = await Store.open(":memory:");
    await store.applyIndexed([entry("io.github.a/one", "Reads PDF files"), entry("io.github.b/two", "Wraps pdfium bindings")]);
    const r = await resolveNeed(store, NEEDS.find((n) => n.slug === "read-pdf-files")!);
    expect(r.entries.map((e) => e.key)).toEqual(["io.github.a/one"]);
    store.close();
  });
});

describe("matching precision (bugs seen on the live pages)", () => {
  it("an entry qualifies on its own name and description, not on a long tool list; PDF makers are not PDF readers", async () => {
    const store = await Store.open(":memory:");
    await store.applyIndexed([
      entry("io.github.lead/getlead", "Find B2B leads and run outreach"),
      entry("io.github.cat/cattalog", "Build print-ready PDF catalogs from templates"),
      entry("io.github.ok/reader", "Extract text and tables from PDF files"),
    ]);
    const db = (store as unknown as { db: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } }).db;
    // a generic entry whose tools mention email, notes and maps must not land on those pages
    await db.execute({ sql: "UPDATE indexed_entries SET tools_json = ? WHERE key = 'io.github.lead/getlead'", args: [JSON.stringify([{ name: "send_email", description: "send email, take notes, location maps, read pdf" }])] });
    const pdf = await resolveNeed(store, NEEDS.find((n) => n.slug === "read-pdf-files")!);
    expect(pdf.entries.map((e) => e.key)).toEqual(["io.github.ok/reader"]);
    for (const slug of ["send-email", "take-notes-memory", "read-maps-places"])
      expect((await resolveNeed(store, NEEDS.find((n) => n.slug === slug)!)).entries.map((e) => e.key), slug).toEqual([]);
    store.close();
  });

  it("entries named after the need come first", async () => {
    const store = await Store.open(":memory:");
    await store.applyIndexed([entry("io.github.a/tools", "A toolbox that can also send email"), entry("io.github.b/mailer", "Delivers messages", { title: "Email sender" })]);
    const r = await resolveNeed(store, NEEDS.find((n) => n.slug === "send-email")!);
    expect(r.entries.map((e) => e.key)).toEqual(["io.github.b/mailer", "io.github.a/tools"]);
    store.close();
  });
});

describe("which need pages are published", () => {
  it(`needs at least ${MIN_ENTRIES} real entries, with somewhere to send people`, async () => {
    const store = await Store.open(":memory:");
    await store.applyIndexed([
      entry("io.github.a/p1", "Read PDF documents"), entry("io.github.a/p2", "Extract text from PDF"), entry("io.github.a/p3", "Parse PDF to markdown"),
      entry("io.github.b/w1", "Weather forecast lookups"), entry("io.github.b/w2", "Current weather"),
      entry("io.github.c/nolink", "PDF tool without a website", { website: null }),
    ]);
    const q = await qualifyNeeds(store);
    expect(q.pages.map((p) => p.slug)).toEqual(["read-pdf-files"]);
    expect(q.pages[0]!.count).toBe(3); // the entry with no website or repo does not count
    store.close();
  });

  it("collapses needs whose entries mostly overlap into one canonical page", async () => {
    const store = await Store.open(":memory:");
    // these all match both "query a Postgres database" and "query SQL databases"
    await store.applyIndexed([1, 2, 3].map((i) => entry(`io.github.pg/s${i}`, `Postgres SQL database query tool ${i}`)));
    const q = await qualifyNeeds(store);
    const slugs = q.pages.map((p) => p.slug);
    expect(slugs.filter((s) => s === "query-postgres" || s === "query-sql-databases")).toHaveLength(1);
    expect(Object.keys(q.canonical)).toHaveLength(1);
    store.close();
  });
});

describe("need pages on the site", () => {
  let base = "";
  let close = () => {};
  let store: Store;
  beforeAll(async () => {
    store = await Store.open(":memory:");
    await store.applyIndexed([
      entry("io.github.a/p1", "Read PDF documents", { title: "Alpha PDF", repo: "github.com/acme/alpha" }),
      entry("io.github.a/p2", "Extract text from PDF files"), entry("io.github.a/p3", "Parse PDF into markdown"),
      entry("io.github.pg/s1", "Postgres SQL database query 1"), entry("io.github.pg/s2", "Postgres SQL database query 2"), entry("io.github.pg/s3", "Postgres SQL database query 3"),
      entry("io.github.w/w1", "Weather forecast lookups"),
    ]);
    await store.setIndexState("need_pages", JSON.stringify(await qualifyNeeds(store)));
    const { server } = createApp({ store, baseUrl: "http://t", fetchOpts: { lookup: async () => [{ address: "93.184.216.34", family: 4 }], requester: async () => ({ status: 404, body: "" }) } });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => { close(); store.close(); });
  const get = (p: string) => fetch(base + p, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" } });

  it("a published page answers the need, lists labelled entries, has JSON-LD and a link to /find, and is indexable", async () => {
    const html = await (await get("/for/read-pdf-files")).text();
    expect(html).toContain("<h1 class=\"mt8\">Read PDF files</h1>");
    expect(html).toContain("Indexed · unclaimed");
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"numberOfItems":3');
    expect(html).toContain('href="/find"');
    expect(html).not.toContain('name="robots" content="noindex"');
    const md = await (await get("/for/read-pdf-files?format=md")).text();
    expect(md).toMatch(/^# Read PDF files/);
    expect(md).toContain('<scbee_data untrusted_strings="true">');
  });

  it("a page under the threshold still answers, but is noindex and not in the sitemap", async () => {
    const html = await (await get("/for/get-weather")).text();
    expect(html).toContain('name="robots" content="noindex"');
    const sitemap = await (await get("/sitemap.xml")).text();
    expect(sitemap).toContain("/for/read-pdf-files");
    expect(sitemap).not.toContain("/for/get-weather");
    expect(sitemap).toContain("<loc>http://t/for</loc>");
  });

  it("a merged near-duplicate redirects permanently to its canonical page; an unknown need is 404", async () => {
    const q = JSON.parse((await store.indexState("need_pages"))!);
    const [from, to] = Object.entries(q.canonical)[0] as [string, string];
    const r = await get(`/for/${from}`);
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe(`/for/${to}`);
    expect((await get("/for/teleport-objects")).status).toBe(404);
  });

  it("/for lists the published pages, and llms.txt points to it", async () => {
    const idx = await (await get("/for?format=md")).text();
    expect(idx).toContain("http://t/for/read-pdf-files");
    expect(idx).not.toContain("/for/get-weather");
    expect(await (await get("/llms.txt")).text()).toContain("http://t/for");
  });

  it("a project in the index gets up to 3 alternatives with a specific reason; others get none", async () => {
    const alts = await alternativesFor(store, "github:acme/alpha");
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.length).toBeLessThanOrEqual(3);
    expect(alts[0]!.reason).toMatch(/^Also read PDF files \(matched on "pdf", "[a-z ]+"\)\.$/);
    expect(alts.every((a) => a.href.startsWith("/r/x/"))).toBe(true);
    expect(await alternativesFor(store, "github:nobody/here")).toEqual([]);
  });
});
