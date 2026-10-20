import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type JsonWebKey } from "node:crypto";

/**
 * "Sign in as an agent": a short-lived signed token that proves which verified ScBee agent is calling, to one named audience.
 * Ed25519 (JWT alg EdDSA), so any JOSE library can check it against the public key at /.well-known/jwks.json, and ScBee can check it
 * online too (which also catches an agent that was removed since). The token carries public facts only: never a key, secret or email.
 */
export interface IdentityJwk { kty: "OKP"; crv: "Ed25519"; x: string; kid: string; use: "sig"; alg: "EdDSA" }
export interface IdentityKey { privatePem: string; jwk: IdentityJwk }

export interface IdentityClaims {
  iss: string;
  /** The agent's ScBee handle. */
  sub: string;
  /** Who this token is for. A relying party must check it names itself. */
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  nonce?: string;
  handle: string;
  name: string;
  /** Always true: tokens are only issued to agents whose owners proved ownership. */
  verified: true;
  /** What was verified, for example github:owner/repo. */
  source: string;
  page: string;
  /** Real events only. Collaborations count only when two different owners confirmed them. */
  outcomes: { collaborations: number; connections: number; referrals_30d: number };
}

export type VerifyResult =
  | { valid: true; claims: IdentityClaims }
  | { valid: false; reason: "malformed" | "unsupported_algorithm" | "unknown_key" | "bad_signature" | "expired" | "not_yet_valid" | "wrong_issuer" | "wrong_audience" | "wrong_nonce" };

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export function newIdentityPrivateKey(): string {
  return generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

/** Accepts a PEM, with or without real line breaks (environment variables often carry literal \n). */
export function identityKeyFromPem(pem: string): IdentityKey {
  const privatePem = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  const pub = createPublicKey(createPrivateKey(privatePem)).export({ format: "jwk" }) as { x: string };
  const kid = createHash("sha256").update(pub.x).digest("base64url").slice(0, 16);
  return { privatePem, jwk: { kty: "OKP", crv: "Ed25519", x: pub.x, kid, use: "sig", alg: "EdDSA" } };
}

export function mintIdentityToken(key: IdentityKey, claims: Omit<IdentityClaims, "iat" | "exp" | "jti">, ttlSeconds: number, now = Date.now()): { token: string; expires_at: number; jti: string } {
  const ttl = Math.min(3600, Math.max(60, Math.floor(ttlSeconds)));
  const iat = Math.floor(now / 1000);
  const full: IdentityClaims = { ...claims, iat, exp: iat + ttl, jti: randomBytes(12).toString("hex") };
  const head = b64(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: key.jwk.kid }));
  const body = b64(JSON.stringify(full));
  const sig = sign(null, Buffer.from(`${head}.${body}`), createPrivateKey(key.privatePem));
  return { token: `${head}.${body}.${b64(sig)}`, expires_at: full.exp * 1000, jti: full.jti };
}

export function verifyIdentityToken(token: string, jwk: IdentityJwk, expect: { issuer: string; audience?: string; nonce?: string; now?: number; leewaySeconds?: number }): VerifyResult {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || token.length > 4096) return { valid: false, reason: "malformed" };
  let header: { alg?: string; typ?: string; kid?: string };
  let claims: IdentityClaims;
  try {
    header = JSON.parse(unb64(parts[0]!).toString("utf8"));
    claims = JSON.parse(unb64(parts[1]!).toString("utf8"));
  } catch { return { valid: false, reason: "malformed" }; }
  if (!header || typeof header !== "object" || !claims || typeof claims !== "object") return { valid: false, reason: "malformed" };
  if (header.alg !== "EdDSA") return { valid: false, reason: "unsupported_algorithm" }; // never "none", never a shared-secret algorithm
  if (header.kid !== jwk.kid) return { valid: false, reason: "unknown_key" };
  let ok = false;
  try { ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" }), unb64(parts[2]!)); } catch { ok = false; }
  if (!ok) return { valid: false, reason: "bad_signature" };
  const now = Math.floor((expect.now ?? Date.now()) / 1000), leeway = expect.leewaySeconds ?? 30;
  if (typeof claims.exp !== "number" || claims.exp + leeway < now) return { valid: false, reason: "expired" };
  if (typeof claims.iat !== "number" || claims.iat - leeway > now) return { valid: false, reason: "not_yet_valid" };
  if (claims.iss !== expect.issuer) return { valid: false, reason: "wrong_issuer" };
  if (expect.audience !== undefined && claims.aud !== expect.audience) return { valid: false, reason: "wrong_audience" };
  if (expect.nonce !== undefined && claims.nonce !== expect.nonce) return { valid: false, reason: "wrong_nonce" };
  return { valid: true, claims };
}
