import { describe, expect, it } from "vitest";
import {
  assertPublicUrl, candidateHandle, checkChallenge, isPrivateAddress, isValidHandle, parseCard, parseSource,
  resolveAgent, safeFetchText, UnsafeUrlError, InputError, type Requester,
} from "./index.js";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1",
    "::ffff:10.0.0.1", "::ffff:7f00:1", "ff02::1", "64:ff9b::1", "2001:db8::1", "not-an-ip",
  ])("%s is private", (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("assertPublicUrl", () => {
  const pub = async () => [{ address: "93.184.216.34", family: 4 }];
  it("rejects non-https, credentials, ports, localhost, IP literals and private DNS", async () => {
    for (const u of [
      "http://example.com", "https://user:pw@example.com", "https://example.com:8443", "https://localhost/x",
      "https://foo.localhost/x", "https://127.0.0.1/", "https://[::1]/", "https://169.254.169.254/latest", "ftp://x.com", "nope",
      "https://metadata.internal/",
    ])
      await expect(assertPublicUrl(u, pub)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("https://evil.example", async () => [{ address: "10.0.0.5", family: 4 }])).rejects.toThrow(/non-public/);
    // one bad address among good ones is enough to reject (rebinding-style multi-record trick)
    await expect(assertPublicUrl("https://evil.example", async () => [
      { address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 },
    ])).rejects.toThrow(/non-public/);
    await expect(assertPublicUrl("https://nx.example", async () => [])).rejects.toThrow(/resolve/);
  });
  it("accepts a public https host and pins the address", async () => {
    const r = await assertPublicUrl("https://example.com/a?b=1", pub);
    expect(r.address).toBe("93.184.216.34");
  });
});

describe("safeFetchText redirects", () => {
  const lookup = async (h: string) => [{ address: h === "internal.example" ? "10.0.0.1" : "93.184.216.34", family: 4 }];
  it("re-validates every hop", async () => {
    const requester: Requester = async (r) =>
      r.url.hostname === "a.example"
        ? { status: 302, location: "https://internal.example/secret", body: "" }
        : { status: 200, body: "leaked" };
    await expect(safeFetchText("https://a.example/x", { lookup, requester })).rejects.toThrow(/non-public/);
  });
  it("limits redirect count", async () => {
    const requester: Requester = async () => ({ status: 302, location: "https://a.example/y", body: "" });
    await expect(safeFetchText("https://a.example/x", { lookup, requester })).rejects.toThrow(/redirects/);
  });
});

describe("handles", () => {
  it("validates", () => {
    expect(isValidHandle("hmakt99-dryrun")).toBe(true);
    for (const h of ["ab", "-ab", "ab-", "a--b", "admin", "API", "a b", "x".repeat(40), "é-agent"]) expect(isValidHandle(h)).toBe(false);
  });
  it("derives candidates", () => {
    expect(candidateHandle("HMAKT99/DryRun")).toBe("hmakt99-dryrun");
    expect(candidateHandle("x")).toBe("x-agent");
    expect(candidateHandle("admin")).toBe("admin-agent");
  });
});

describe("parseSource", () => {
  it("parses GitHub forms", () => {
    for (const s of ["https://github.com/HMAKT99/DryRun", "github.com/HMAKT99/DryRun.git", "HMAKT99/DryRun", "https://github.com/HMAKT99/DryRun/tree/main"]) {
      const r = parseSource(s);
      expect(r.key).toBe("github:hmakt99/dryrun");
    }
  });
  it("rejects profiles and junk", () => {
    expect(() => parseSource("https://github.com/HMAKT99")).toThrow(InputError);
    expect(() => parseSource("")).toThrow(InputError);
    expect(() => parseSource("http://example.com")).toThrow(InputError);
    expect(() => parseSource("https://u:p@example.com")).toThrow(InputError);
    expect(() => parseSource("javascript:alert(1)")).toThrow(InputError);
  });
  it("parses endpoints", () => {
    expect(parseSource("https://agent.example.com/anything").key).toBe("url:https://agent.example.com");
  });
});

describe("parseCard", () => {
  it("accepts a minimal card and drops unknown fields", () => {
    const r = parseCard({ name: "Bot", evil: "<script>", skills: [{ id: "a", name: "A" }] });
    expect(r.ok && Object.keys(r.card)).not.toContain("evil");
  });
  it("rejects hostile or invalid fields", () => {
    expect(parseCard({ name: "" }).ok).toBe(false);
    expect(parseCard({ name: "a‮b" }).ok).toBe(false);
    expect(parseCard({ name: "ok", url: "http://x.com" }).ok).toBe(false);
    expect(parseCard({ name: "ok", url: "javascript:alert(1)" }).ok).toBe(false);
    expect(parseCard({ name: "ok", skills: Array(21).fill({ id: "a", name: "A" }) }).ok).toBe(false);
    expect(parseCard("string").ok).toBe(false);
  });
});

describe("resolveAgent / checkChallenge", () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const serve = (files: Record<string, string>): Requester => async (r) => {
    const body = files[r.url.toString()];
    return body === undefined ? { status: 404, body: "" } : { status: 200, body };
  };
  it("reads agent.json from a GitHub repo", async () => {
    const requester = serve({ "https://raw.githubusercontent.com/o/r/HEAD/agent.json": JSON.stringify({ name: "Bot", skills: [] }) });
    const res = await resolveAgent("github.com/o/r", { lookup, requester });
    expect(res.cardFound).toBe(true);
    expect(res.handleBase).toBe("o-r");
  });
  it("registers a repo without a card using a minimal card", async () => {
    const res = await resolveAgent("github.com/o/r", { lookup, requester: serve({}) });
    expect(res.cardFound).toBe(false);
    expect(res.card.name).toBe("r");
  });
  it("requires a card for endpoints and rejects invalid ones", async () => {
    await expect(resolveAgent("https://a.example", { lookup, requester: serve({}) })).rejects.toThrow(/no agent card/);
    const bad = serve({ "https://a.example/.well-known/agent-card.json": JSON.stringify({ name: "" }) });
    await expect(resolveAgent("https://a.example", { lookup, requester: bad })).rejects.toThrow(/invalid agent card/);
  });
  it("blocks endpoints that resolve to private addresses", async () => {
    await expect(resolveAgent("https://a.example", { lookup: async () => [{ address: "127.0.0.1", family: 4 }], requester: serve({}) }))
      .rejects.toThrow(/non-public/);
  });
  it("verifies the challenge token", async () => {
    const src = parseSource("github.com/o/r");
    const ok = serve({ "https://raw.githubusercontent.com/o/r/HEAD/agent-network-verify.txt": "tok123\n" });
    expect(await checkChallenge(src, "tok123", { lookup, requester: ok })).toBe(true);
    expect(await checkChallenge(src, "other", { lookup, requester: ok })).toBe(false);
    expect(await checkChallenge(src, "tok123", { lookup, requester: serve({}) })).toBe(false);
  });
});
