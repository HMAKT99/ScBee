import { randomBytes } from "node:crypto";
import { candidateHandle } from "./handle.js";
import { parseCard, type AgentCard } from "./schema.js";
import { safeFetchJson, safeFetchText, type FetchOptions, UnsafeUrlError } from "./safeFetch.js";

export type Source =
  | { kind: "github"; owner: string; repo: string; key: string; ownerKey: string }
  | { kind: "endpoint"; origin: string; host: string; key: string; ownerKey: string };

const GH_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_])?$/;

export class InputError extends Error {}

/** Accepts a GitHub repo URL (or owner/repo) or an https endpoint URL. */
export function parseSource(input: string): Source {
  const s = input.trim();
  if (!s || s.length > 300) throw new InputError("enter a GitHub repo URL or an agent URL");
  const short = s.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  let owner: string | undefined;
  let repo: string | undefined;
  if (short) [, owner, repo] = short;
  else {
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    } catch {
      throw new InputError("not a valid URL");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new InputError("only https URLs are supported");
    if (u.hostname === "github.com" || u.hostname === "www.github.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length < 2) throw new InputError("use the repo URL, e.g. github.com/owner/repo (not a profile)");
      [owner, repo] = parts;
    } else {
      if (u.protocol !== "https:") throw new InputError("agent URLs must use https");
      if (u.username || u.password) throw new InputError("credentials in URL are not allowed");
      return { kind: "endpoint", origin: u.origin, host: u.hostname.toLowerCase(), key: `url:${u.origin}`, ownerKey: `host:${u.hostname.toLowerCase()}` };
    }
  }
  repo = repo?.replace(/\.git$/, "");
  if (!owner || !repo || !GH_NAME.test(owner) || !GH_NAME.test(repo)) throw new InputError("not a valid GitHub repo");
  const o = owner.toLowerCase();
  const r = repo.toLowerCase();
  return { kind: "github", owner: o, repo: r, key: `github:${o}/${r}`, ownerKey: `github:${o}` };
}

export function cardUrls(src: Source): string[] {
  if (src.kind === "github") {
    const base = `https://raw.githubusercontent.com/${src.owner}/${src.repo}/HEAD`;
    return [`${base}/agent.json`, `${base}/.well-known/agent-card.json`];
  }
  return [`${src.origin}/.well-known/agent-card.json`, `${src.origin}/.well-known/agent.json`];
}

export function verifyUrl(src: Source): string {
  return src.kind === "github"
    ? `https://raw.githubusercontent.com/${src.owner}/${src.repo}/HEAD/scbee-verify.txt`
    : `${src.origin}/.well-known/scbee-verify.txt`;
}

export function verifyFilePath(src: Source): string {
  return src.kind === "github" ? "scbee-verify.txt (repo root)" : "/.well-known/scbee-verify.txt";
}

/** Where an opt-out token file must be placed (same proof of control as verification, different file). */
export function optoutUrl(src: Source): string {
  return src.kind === "github"
    ? `https://raw.githubusercontent.com/${src.owner}/${src.repo}/HEAD/scbee-optout.txt`
    : `${src.origin}/.well-known/scbee-optout.txt`;
}
export const optoutFilePath = (src: Source) => (src.kind === "github" ? "scbee-optout.txt (repo root)" : "/.well-known/scbee-optout.txt");

export function newOptoutToken(): string {
  return `scbee-optout-${randomBytes(16).toString("hex")}`;
}

/** Fetch the opt-out file. Returns its text, "missing" for a clean 404, or null when we could not tell. */
export async function readOptoutFile(src: Source, opts?: FetchOptions): Promise<string | "missing" | null> {
  try {
    const { status, body } = await safeFetchText(optoutUrl(src), opts);
    if (status === 200) return body;
    return status === 404 ? "missing" : null;
  } catch {
    return null;
  }
}

export function newChallenge(): string {
  return `scbee-verify-${randomBytes(16).toString("hex")}`;
}

export interface Resolution {
  source: Source;
  card: AgentCard;
  cardFound: boolean;
  cardUrl: string | null;
  handleBase: string;
}

/** Find and validate the agent card. GitHub repos without a card register with a minimal card. */
export async function resolveAgent(input: string, opts?: FetchOptions): Promise<Resolution> {
  const source = parseSource(input);
  for (const url of cardUrls(source)) {
    let raw: unknown | null;
    try {
      raw = await safeFetchJson(url, opts);
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new InputError(`cannot fetch agent card: ${e.message}`);
      continue;
    }
    if (raw == null) continue;
    const parsed = parseCard(raw);
    if (!parsed.ok) throw new InputError(parsed.error);
    const hb = source.kind === "github" ? `${source.owner}-${source.repo}` : source.host;
    return { source, card: parsed.card, cardFound: true, cardUrl: url, handleBase: candidateHandle(hb) ?? candidateHandle(parsed.card.name) ?? "agent" };
  }
  if (source.kind === "github") {
    const base = `${source.owner}-${source.repo}`;
    return {
      source,
      card: { name: source.repo.slice(0, 80), skills: [] },
      cardFound: false,
      cardUrl: null,
      handleBase: candidateHandle(base) ?? "agent",
    };
  }
  throw new InputError("no agent card found at /.well-known/agent-card.json");
}

/** True when the challenge token appears in the verification file for this source. */
export async function checkChallenge(src: Source, token: string, opts?: FetchOptions): Promise<boolean> {
  try {
    const { status, body } = await safeFetchText(verifyUrl(src), opts);
    return status === 200 && body.includes(token);
  } catch {
    return false;
  }
}
