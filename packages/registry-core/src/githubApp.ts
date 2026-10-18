import { createSign } from "node:crypto";
import { safePostJson, type FetchOptions } from "./safeFetch.js";

/**
 * Authenticate ScBee to GitHub as its own GitHub App (a separate identity, never a person's account).
 * Public data only: the app needs no repository permissions. Secrets (private key, JWT, tokens) are never logged.
 */

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The private key may arrive from an env var with literal "\n" sequences. */
export const normalizePem = (pem: string) => pem.includes("\\n") && !pem.includes("\n") ? pem.replace(/\\n/g, "\n") : pem;

/** A short-lived JWT that proves we are the app. GitHub allows at most 10 minutes. */
export function appJwt(appId: string, privateKeyPem: string, nowMs = Date.now()): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: Math.floor(nowMs / 1000) - 60, exp: Math.floor(nowMs / 1000) + 9 * 60, iss: appId }));
  const sig = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(normalizePem(privateKeyPem));
  return `${header}.${payload}.${b64url(sig)}`;
}

export interface InstallationToken { token: string; expiresAt: number }

/** Exchange the app JWT for an installation token (valid about an hour). */
export async function fetchInstallationToken(appId: string, privateKeyPem: string, installationId: string, opts: FetchOptions = {}): Promise<InstallationToken> {
  if (!/^\d{1,20}$/.test(appId) || !/^\d{1,20}$/.test(installationId)) throw new Error("invalid GitHub App id");
  const jwt = appJwt(appId, privateKeyPem);
  const res = await safePostJson(`https://api.github.com/app/installations/${installationId}/access_tokens`, "{}", {
    authorization: `Bearer ${jwt}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28",
  }, { ...opts, timeoutMs: 8000 });
  if (res.status !== 201) throw new Error(`GitHub refused the app token request (HTTP ${res.status})`);
  const j = JSON.parse(res.body) as { token?: string; expires_at?: string };
  if (!j.token || !j.expires_at) throw new Error("unexpected GitHub response");
  return { token: j.token, expiresAt: Date.parse(j.expires_at) };
}
