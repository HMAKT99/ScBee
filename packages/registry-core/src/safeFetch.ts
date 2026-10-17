import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isPrivateAddress } from "./ip.js";

export class UnsafeUrlError extends Error {}

export interface Resolved {
  url: URL;
  address: string;
  family: 4 | 6;
}

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;

export interface RawResponse {
  status: number;
  location?: string;
  body: string;
}

export type Requester = (
  r: Resolved,
  opts: { timeoutMs: number; maxBytes: number; headers?: Record<string, string>; truncate?: boolean; method?: string; body?: string },
) => Promise<RawResponse>;

const defaultLookup: Lookup = (host) => dnsLookup(host, { all: true, verbatim: true });

/**
 * https only, default port only, no credentials, and every resolved address must be public.
 * Returns the validated address so the request can be pinned to it (defeats DNS rebinding).
 */
export async function assertPublicUrl(input: string | URL, lookup: Lookup = defaultLookup): Promise<Resolved> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("not a valid URL");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("only https URLs are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("credentials in URL are not allowed");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("only the default https port is allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new UnsafeUrlError("host is not publicly routable");
  const literal = isIP(host);
  const addrs = literal ? [{ address: host, family: literal }] : await lookup(host).catch(() => []);
  if (addrs.length === 0) throw new UnsafeUrlError("host did not resolve");
  for (const a of addrs) if (isPrivateAddress(a.address)) throw new UnsafeUrlError("host resolves to a non-public address");
  const first = addrs[0]!;
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 };
}

const defaultRequester: Requester = (r, { timeoutMs, maxBytes, headers, truncate, method, body }) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: r.address,
        family: r.family,
        port: 443,
        method: method ?? "GET",
        path: r.url.pathname + r.url.search,
        servername: r.url.hostname,
        headers: { host: r.url.hostname, accept: "application/json, text/plain", "user-agent": "scbee/0.0 (+registry)", ...(body !== undefined ? { "content-length": String(Buffer.byteLength(body)) } : {}), ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            if (truncate) {
              // Keep what we have (enough for a page head) and stop reading.
              chunks.push(c.subarray(0, Math.max(0, c.length - (size - maxBytes))));
              resolve({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks).toString("utf8") });
              req.destroy();
              return;
            }
            req.destroy(new UnsafeUrlError("response too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new UnsafeUrlError("request timed out")));
    req.on("error", reject);
    req.end(body);
  });

export interface FetchOptions {
  lookup?: Lookup;
  requester?: Requester;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Extra request headers (e.g. an API token). Sent only to the first hostname, never to a redirect target. */
  headers?: Record<string, string>;
  /** Return the first maxBytes instead of failing when the response is larger (for reading page heads). */
  truncate?: boolean;
}

/** GET text from a public https URL. Redirects are followed manually and re-validated each hop. */
export async function safeFetchText(
  url: string,
  { lookup = defaultLookup, requester = defaultRequester, timeoutMs = 5000, maxBytes = 64 * 1024, maxRedirects = 3, headers, truncate }: FetchOptions = {},
): Promise<{ status: number; body: string }> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const resolved = await assertPublicUrl(current, lookup);
    const sameHost = resolved.url.hostname === new URL(url).hostname;
    const res = await requester(resolved, { timeoutMs, maxBytes, ...(headers && sameHost ? { headers } : {}), ...(truncate ? { truncate } : {}) });
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, resolved.url).toString();
      continue;
    }
    return { status: res.status, body: res.body };
  }
  throw new UnsafeUrlError("too many redirects");
}

export async function safeFetchJson(url: string, opts?: FetchOptions): Promise<unknown | null> {
  const { status, body } = await safeFetchText(url, opts);
  if (status !== 200) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * POST a JSON body to a public https URL (webhooks). Same SSRF protections as GETs: public addresses only,
 * pinned to the validated IP, no redirects followed (a redirect is treated as failure).
 */
export async function safePostJson(
  url: string, body: string, headers: Record<string, string>,
  { lookup = defaultLookup, requester = defaultRequester, timeoutMs = 3000 }: FetchOptions = {},
): Promise<{ status: number }> {
  const resolved = await assertPublicUrl(url, lookup);
  const res = await requester(resolved, { timeoutMs, maxBytes: 16 * 1024, headers: { "content-type": "application/json", ...headers }, method: "POST", body });
  return { status: res.status };
}
