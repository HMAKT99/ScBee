import { describe, expect, it } from "vitest";
import { COLLECTIONS, deriveSecret, messages, newNonce, safePostJson, searchNewRepos, signBody, verifySignature, UnsafeUrlError } from "./index.js";

describe("webhook signing", () => {
  it("derives stable per-agent secrets that change with the nonce, agent and key", () => {
    const a = deriveSecret("k", 1, "n1");
    expect(a).toBe(deriveSecret("k", 1, "n1"));
    expect(a).not.toBe(deriveSecret("k", 1, "n2"));
    expect(a).not.toBe(deriveSecret("k", 2, "n1"));
    expect(a).not.toBe(deriveSecret("other", 1, "n1"));
    expect(newNonce()).toMatch(/^[a-f0-9]{24}$/);
  });
  it("verifies good signatures and rejects tampering and stale timestamps", () => {
    const t = 1_700_000_000_000, body = '{"a":1}', sig = signBody("s", t, body);
    expect(verifySignature("s", t, body, sig, t + 1000)).toBe(true);
    expect(verifySignature("s", t, '{"a":2}', sig, t + 1000)).toBe(false);
    expect(verifySignature("x", t, body, sig, t + 1000)).toBe(false);
    expect(verifySignature("s", t, body, sig, t + 10 * 60_000)).toBe(false);
    expect(verifySignature("s", t, body, "sha256=00", t)).toBe(false);
  });
});

describe("notification messages", () => {
  it("are built from controlled fields only", () => {
    const m = messages.verdictReceived("github:o/r", "bot-1", "ran_example", true, "https://x");
    expect(m).toMatchObject({ kind: "verdict_received", url: "https://x/github.com/o/r" });
    expect(m.body).toBe("@bot-1 ran example and would use it. Open the project page to see the details.");
    expect(messages.forecastReady("github:o/r", 1, "https://x").body).toMatch(/1 agent evaluation\./);
    expect(messages.composesWith("github:a/b", "github:c/d", "https://x").ref).toBe("github:a/b>github:c/d");
  });
});

describe("safePostJson", () => {
  const ok = [{ address: "93.184.216.34", family: 4 }];
  it("posts JSON to a public https URL and returns the status", async () => {
    let seen: any;
    const r = await safePostJson("https://hooks.example.com/x", '{"a":1}', { "x-scbee-signature": "s" }, {
      lookup: async () => ok, requester: async (res, o) => { seen = { url: res.url.toString(), ...o }; return { status: 204, body: "" }; },
    });
    expect(r.status).toBe(204);
    expect(seen).toMatchObject({ url: "https://hooks.example.com/x", method: "POST", body: '{"a":1}' });
    expect(seen.headers["content-type"]).toBe("application/json");
    expect(seen.headers["x-scbee-signature"]).toBe("s");
  });
  it("refuses private, http and credentialed targets", async () => {
    const priv = { lookup: async () => [{ address: "10.0.0.1", family: 4 }], requester: async () => ({ status: 200, body: "" }) };
    await expect(safePostJson("https://internal.example.com", "{}", {}, priv)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safePostJson("http://hooks.example.com", "{}", {}, { lookup: async () => ok })).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safePostJson("https://u:p@hooks.example.com", "{}", {}, { lookup: async () => ok })).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe("searchNewRepos", () => {
  it("returns valid, non-fork, non-archived repos and builds the topic query", async () => {
    let url = "";
    const r = await searchNewRepos(COLLECTIONS[0]!, 30, 10, {
      lookup: async () => [{ address: "140.82.112.5", family: 4 }],
      requester: async (res) => { url = res.url.toString(); return { status: 200, body: JSON.stringify({ items: [
        { full_name: "A/One" }, { full_name: "b/fork", fork: true }, { full_name: "c/arch", archived: true }, { full_name: "bad name" }, { full_name: "d/Two" },
      ] }) }; },
    }, undefined, Date.parse("2026-10-17"));
    expect(r).toEqual([{ owner: "a", repo: "one" }, { owner: "d", repo: "two" }]);
    expect(decodeURIComponent(url)).toMatch(/topic:mcp-server created:>2026-09-17/);
  });
  it("returns [] when GitHub fails", async () => {
    expect(await searchNewRepos(COLLECTIONS[0]!, 7, 5, { lookup: async () => [{ address: "140.82.112.5", family: 4 }], requester: async () => ({ status: 403, body: "" }) })).toEqual([]);
  });
});
