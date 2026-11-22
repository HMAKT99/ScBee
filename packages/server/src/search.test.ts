import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { needForQuery, rankForQuery } from "./needs.js";
import { rankIndexed } from "./indexer.js";
import { Store } from "./store.js";

const e = (key: string, title: string, description: string) =>
  ({ key, title, description, version: "1", repo: null, website: `https://${key.split("/").pop()}.example`, remote: null, pkg: null, status: "active", updatedAt: new Date().toISOString() });

describe("search and hand-off precision (the live case: 'read PDF files' returned a catalog builder)", () => {
  let store: Store;
  let base = "";
  let close = () => {};
  beforeAll(async () => {
    store = await Store.open(":memory:");
    await store.applyIndexed([
      e("io.x/campaign", "Campaign Pack", "Turn a product photo and a brief into an ad campaign: scripts, stills, client-ready PDF."),
      e("io.x/cattalog", "Cattalog", "Build print-ready PDF catalogs from templates and spreadsheet data."),
      e("io.x/pdf-reader", "PDF Reader", "Extract text and tables from PDF files."),
      e("io.x/docparse", "DocParse", "Parse PDF and Word documents into clean text."),
      e("io.x/mailer", "Mailer", "Send email to your customers through SMTP."),
    ]);
    const { server } = createApp({ store, baseUrl: "http://t", fetchOpts: { lookup: async () => [{ address: "93.184.216.34", family: 4 }], requester: async () => ({ status: 404, body: "" }) } });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => { close(); store.close(); });

  it("maps a request to its curated need, however it is worded", () => {
    expect(needForQuery("read PDF files")?.slug).toBe("read-pdf-files");
    expect(needForQuery("Find an MCP server that can read PDF files.")?.slug).toBe("read-pdf-files");
    expect(needForQuery("send email to customers")?.slug).toBe("send-email");
    expect(needForQuery("pdf")).toBeNull(); // a bare word is not a need: it falls back to word ranking
  });

  it("a need request returns only entries that do the job", async () => {
    const { need, matches } = await rankForQuery(store, "read PDF files", 10);
    expect(need?.slug).toBe("read-pdf-files");
    expect(matches.map((m) => m.row.title).sort()).toEqual(["DocParse", "PDF Reader"]);
  });

  it("word ranking keeps only the entries that match the most words of the request", async () => {
    const got = (await rankIndexed(store, "pdf text tables", 10)).map((m) => m.row.title);
    expect(got).toEqual(["PDF Reader"]);
  });

  it("the hand-off and search APIs use it, and point to the need page", async () => {
    const h = await (await fetch(`${base}/api/handoff?need=${encodeURIComponent("read PDF files")}`)).json();
    expect(h.indexed.map((m: { name: string }) => m.name)).not.toContain("Cattalog");
    expect(h.indexed.map((m: { name: string }) => m.name)).not.toContain("Campaign Pack");
    expect(h.need).toEqual({ title: "Read PDF files", page: "http://t/for/read-pdf-files" });
    const s = await (await fetch(`${base}/api/agents?q=${encodeURIComponent("send email to customers")}`)).json();
    expect(s.indexed.map((m: { name: string }) => m.name)).toEqual(["Mailer"]);
    expect(s.need.page).toBe("http://t/for/send-email");
  });
});
