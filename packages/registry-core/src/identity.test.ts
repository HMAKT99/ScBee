import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type JsonWebKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { identityKeyFromPem, mintIdentityToken, newIdentityPrivateKey, verifyIdentityToken, type IdentityClaims } from "./identity.js";

const key = identityKeyFromPem(newIdentityPrivateKey());
const base: Omit<IdentityClaims, "iat" | "exp" | "jti"> = {
  iss: "https://scbee.test", sub: "acme-bot", aud: "https://app.example", handle: "acme-bot", name: "Acme Bot", verified: true,
  source: "github:acme/bot", page: "https://scbee.test/a/acme-bot", outcomes: { collaborations: 2, connections: 3, referrals_30d: 5 },
};
const NOW = 1_800_000_000_000;
const mint = (over: Partial<typeof base> = {}, ttl = 600) => mintIdentityToken(key, { ...base, ...over }, ttl, NOW).token;
const check = (token: string, over: object = {}) => verifyIdentityToken(token, key.jwk, { issuer: "https://scbee.test", audience: "https://app.example", now: NOW + 1000, ...over });
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

describe("agent identity tokens", () => {
  it("publishes a JWK with a stable key id, and accepts a PEM with literal \\n", () => {
    expect(key.jwk).toMatchObject({ kty: "OKP", crv: "Ed25519", use: "sig", alg: "EdDSA" });
    expect(key.jwk.kid).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(identityKeyFromPem(key.privatePem.replace(/\n/g, "\\n")).jwk).toEqual(key.jwk);
    expect(JSON.stringify(key.jwk)).not.toContain("PRIVATE");
  });

  it("round-trips, binds to an audience, and carries public facts only", () => {
    const r = check(mint());
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.claims).toMatchObject({ sub: "acme-bot", aud: "https://app.example", verified: true, outcomes: { collaborations: 2, connections: 3, referrals_30d: 5 } });
      expect(r.claims.exp - r.claims.iat).toBe(600);
      expect(Object.keys(r.claims).sort()).toEqual(["aud", "exp", "handle", "iat", "iss", "jti", "name", "outcomes", "page", "source", "sub", "verified"]);
    }
    expect(check(mint(), { audience: "https://other.example" })).toEqual({ valid: false, reason: "wrong_audience" });
    expect(check(mint({ nonce: "abc" } as never), { nonce: "abc" }).valid).toBe(true);
    expect(check(mint({ nonce: "abc" } as never), { nonce: "xyz" })).toEqual({ valid: false, reason: "wrong_nonce" });
  });

  it("rejects expired, future-dated, tampered, re-signed, foreign-issuer and malformed tokens", () => {
    expect(check(mint({}, 60), { now: NOW + 200_000 })).toEqual({ valid: false, reason: "expired" });
    expect(check(mint(), { now: NOW - 200_000 })).toEqual({ valid: false, reason: "not_yet_valid" });
    const [h, p, s] = mint().split(".") as [string, string, string];
    const forged = b64u({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sub: "someone-else" });
    expect(check(`${h}.${forged}.${s}`)).toEqual({ valid: false, reason: "bad_signature" });
    expect(check(mint(), { issuer: "https://evil.example" })).toEqual({ valid: false, reason: "wrong_issuer" });
    for (const t of ["", "a.b", "a.b.c.d", "x".repeat(5000), "!!.!!.!!"]) expect(check(t).valid, t).toBe(false);
  });

  it("never accepts alg none, a shared-secret algorithm, or another key", () => {
    const [, p] = mint().split(".") as [string, string];
    expect(check(`${b64u({ alg: "none", typ: "JWT", kid: key.jwk.kid })}.${p}.`)).toEqual({ valid: false, reason: "unsupported_algorithm" });
    expect(check(`${b64u({ alg: "HS256", typ: "JWT", kid: key.jwk.kid })}.${p}.${"A".repeat(43)}`)).toEqual({ valid: false, reason: "unsupported_algorithm" });
    const other = identityKeyFromPem(newIdentityPrivateKey());
    const foreign = mintIdentityToken(other, base, 600, NOW).token;
    expect(check(foreign)).toEqual({ valid: false, reason: "unknown_key" });
    // same key id claimed, signed by a different key
    const { privateKey } = generateKeyPairSync("ed25519");
    const head = b64u({ alg: "EdDSA", typ: "JWT", kid: key.jwk.kid });
    const body = b64u({ ...base, iat: NOW / 1000, exp: NOW / 1000 + 600, jti: "j" });
    const sig = sign(null, Buffer.from(`${head}.${body}`), createPrivateKey(privateKey.export({ type: "pkcs8", format: "pem" })));
    expect(check(`${head}.${body}.${sig.toString("base64url")}`)).toEqual({ valid: false, reason: "bad_signature" });
    expect(createPublicKey({ key: key.jwk as unknown as JsonWebKey, format: "jwk" }).asymmetricKeyType).toBe("ed25519");
  });

  it("limits how long a token can live", () => {
    const short = mintIdentityToken(key, base, 5, NOW);
    const long = mintIdentityToken(key, base, 999_999, NOW);
    expect(short.expires_at - NOW).toBe(60_000);
    expect(long.expires_at - NOW).toBe(3_600_000);
  });
});
