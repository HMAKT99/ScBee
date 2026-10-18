import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appJwt, fetchInstallationToken, normalizePem } from "./index.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const lookup = async () => [{ address: "140.82.112.5", family: 4 }];

describe("appJwt", () => {
  it("is a valid RS256 JWT with a short expiry and the app id as issuer", () => {
    const now = 1_800_000_000_000;
    const jwt = appJwt("12345", privateKey, now);
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims).toEqual({ iat: 1_800_000_000 - 60, exp: 1_800_000_000 + 540, iss: "12345" });
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
  it("accepts a key whose newlines were escaped by an env var", () => {
    const escaped = privateKey.replace(/\n/g, "\\n");
    expect(normalizePem(escaped)).toBe(privateKey);
    expect(appJwt("1", escaped).split(".")).toHaveLength(3);
  });
});

describe("fetchInstallationToken", () => {
  it("posts the JWT to the installation endpoint and returns the token and expiry", async () => {
    let seen: any;
    const t = await fetchInstallationToken("12345", privateKey, "999", {
      lookup, requester: async (r, o) => { seen = { url: r.url.toString(), ...o }; return { status: 201, body: JSON.stringify({ token: "ghs_test", expires_at: "2026-10-18T12:00:00Z" }) }; },
    });
    expect(t).toEqual({ token: "ghs_test", expiresAt: Date.parse("2026-10-18T12:00:00Z") });
    expect(seen.url).toBe("https://api.github.com/app/installations/999/access_tokens");
    expect(seen.method).toBe("POST");
    expect(seen.headers.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });
  it("fails clearly, without leaking secrets, on refusal or odd input", async () => {
    const bad = await fetchInstallationToken("1", privateKey, "2", { lookup, requester: async () => ({ status: 401, body: "{}" }) }).catch((e) => e);
    expect(String(bad.message)).toMatch(/HTTP 401/);
    expect(String(bad.message)).not.toContain("BEGIN");
    await expect(fetchInstallationToken("abc", privateKey, "2", { lookup })).rejects.toThrow(/invalid/);
    await expect(fetchInstallationToken("1", privateKey, "2", { lookup, requester: async () => ({ status: 201, body: "{}" }) })).rejects.toThrow(/unexpected/);
  });
});
