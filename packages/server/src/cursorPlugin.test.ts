import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cursorInstallUrl, cursorPluginFiles, CURSOR_PLUGIN_VERSION } from "./plugin.js";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { Store } from "./store.js";

const root = new URL("../../../", import.meta.url);
const BASE = "https://scbee.vercel.app";

describe("Cursor plugin and the Add to Cursor link", () => {
  const files = cursorPluginFiles(BASE, "https://github.com/HMAKT99/ScBee");

  it("the files in cursor-plugin/ are generated from the code (run npm run agent-files)", () => {
    for (const [path, body] of Object.entries(files)) expect(readFileSync(new URL(path, root), "utf8"), path).toBe(body);
    expect(readFileSync(new URL("cursor-plugin/LICENSE", root), "utf8")).toBe(readFileSync(new URL("LICENSE", root), "utf8"));
  });

  it("points at the hosted MCP server with no key, and bundles the three skills", () => {
    expect(JSON.parse(files["cursor-plugin/mcp.json"]!)).toEqual({ mcpServers: { scbee: { url: `${BASE}/mcp` } } });
    const manifest = JSON.parse(files["cursor-plugin/.cursor-plugin/plugin.json"]!);
    expect(manifest).toMatchObject({ name: "scbee", version: CURSOR_PLUGIN_VERSION, license: "Apache-2.0" });
    for (const s of ["launch-check", "agent-ready-check", "find-agent"]) expect(files[`cursor-plugin/skills/${s}/SKILL.md`]).toMatch(/^---\nname: /);
    expect(Object.values(files).join("\n")).not.toMatch(/api[_-]?key=|SCBEE_API_KEY/);
  });

  it("the install link carries the hosted URL, and the home page and docs offer it", async () => {
    const u = new URL(cursorInstallUrl(BASE));
    expect(u.origin + u.pathname).toBe("https://cursor.com/en/install-mcp");
    expect(JSON.parse(Buffer.from(u.searchParams.get("config")!, "base64").toString())).toEqual({ url: `${BASE}/mcp` });
    expect(readFileSync(new URL("docs/MCP.md", root), "utf8")).toContain(u.searchParams.get("config")!);
    const store = await Store.open(":memory:");
    const { server } = createApp({ store, baseUrl: BASE });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const home = await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { headers: { "user-agent": "Mozilla/5.0 Chrome/130" } })).text();
    server.close(); store.close();
    expect(home).toContain(`href="${cursorInstallUrl(BASE).replaceAll("&", "&amp;")}"`);
    expect(home).toContain("Add to Cursor");
  });
});
