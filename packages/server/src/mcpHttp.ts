import type { IncomingMessage, ServerResponse } from "node:http";
import { INTERNAL, toolNames } from "./traffic.js";
import { Readable } from "node:stream";

/**
 * The hosted MCP endpoint (POST /mcp): the same tools as `npx -y scbee-mcp`, minus the ones that need an API key, answered
 * over streamable HTTP so an agent can connect with one URL and install nothing. It is stateless: every request gets a fresh
 * server and a plain JSON answer, which is what a short-lived serverless function can honour. It holds no key and writes nothing.
 */
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

/** Names of the tools the hosted endpoint offers. Kept in step with scbee-mcp by a test. */
export const HOSTED_MCP_TOOLS = ["scbee_score", "scbee_find_complements", "scbee_search_agents", "scbee_handoff", "scbee_project_card"] as const;

/**
 * A fetch that is answered by this process's own request handler, so the tools reuse the public API (with its caching and
 * limits, counted against the caller's address) without a second network hop. Only the path and query of the URL are used:
 * it can never reach another host.
 */
export function inProcessFetch(handler: Handler, ip: string): typeof fetch {
  return async (input, init) => {
    const u = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    const body = typeof init?.body === "string" ? init.body : undefined;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    headers["x-forwarded-for"] = ip;
    const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { url: u.pathname + u.search, method: init?.method ?? "GET", headers, socket: { remoteAddress: ip }, [INTERNAL]: true });
    return new Promise<Response>((resolve, reject) => {
      let status = 200;
      const out = new Headers();
      const set = (k: string, v: unknown) => out.set(k, Array.isArray(v) ? v.join(", ") : String(v));
      const res = {
        setHeader(k: string, v: unknown) { set(k, v); return res; },
        getHeader: (k: string) => out.get(k) ?? undefined,
        removeHeader: (k: string) => out.delete(k),
        writeHead(s: number, h?: Record<string, unknown>) { status = s; for (const [k, v] of Object.entries(h ?? {})) set(k, v); return res; },
        end(chunk?: string | Uint8Array) {
          const empty = chunk === undefined || status === 204 || status === 304;
          resolve(new Response(empty ? null : typeof chunk === "string" ? chunk : Buffer.from(chunk), { status, headers: out }));
        },
      };
      Promise.resolve(handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)).catch(reject);
    });
  };
}

const rpcError = (res: ServerResponse, status: number, code: number, message: string, extra: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
};

export interface McpHttpOptions {
  baseUrl: string;
  handler: Handler;
  ip: string;
  /** Headers every answer carries (the site's security headers). */
  headers: Record<string, string>;
  /** Called once for a request that runs a tool, so calls can be counted. */
  onToolCall: (tools: string[]) => Promise<unknown> | void;
}

export async function handleMcp(req: IncomingMessage, res: ServerResponse, o: McpHttpOptions): Promise<void> {
  const method = req.method ?? "GET";
  // Read-only and public, so a browser-based client on another origin may call it. No cookies exist and no key is accepted.
  const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id", "access-control-max-age": "86400" };
  for (const [k, v] of Object.entries({ ...o.headers, ...cors, "cache-control": "no-store" })) res.setHeader(k, v);
  if (method === "OPTIONS") { res.writeHead(204); return void res.end(); }
  if (method !== "POST") return rpcError(res, 405, -32000, "This endpoint is stateless. Send JSON-RPC with POST.", { allow: "POST, OPTIONS" });

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) return rpcError(res, 413, -32600, "request body too large");
    chunks.push(c as Buffer);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return rpcError(res, 400, -32700, "body must be JSON"); }
  if (body === null || typeof body !== "object") return rpcError(res, 400, -32600, "body must be a JSON-RPC message");
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length > 10) return rpcError(res, 400, -32600, "at most 10 messages per request");
  if (messages.some((m) => (m as { method?: unknown } | null)?.method === "tools/call")) await o.onToolCall(toolNames(body));

  // Loaded on first use, so pages that never touch MCP do not pay for it at start-up.
  const [{ createServer }, { StreamableHTTPServerTransport }] = await Promise.all([import("scbee-mcp"), import("@modelcontextprotocol/sdk/server/streamableHttp.js")]);
  const server = createServer({ baseUrl: o.baseUrl, fetch: inProcessFetch(o.handler, o.ip), publicOnly: true, via: "mcp-http" });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport as never);
  await transport.handleRequest(req, res, body);
}

/** A plain description of the hosted endpoint for clients and directories that look under /.well-known. */
export const mcpManifest = (base: string, name: string, version: string) => ({
  name: `${name} MCP server`,
  description: "Launch-readiness and agent-ready scores for a repo, npm package or website, agent search by what they do, and hand-off to a verified agent that fits a need. Read-only; no account or key.",
  version,
  transport: { type: "streamable-http", url: `${base}/mcp`, stateless: true },
  authentication: { required: false },
  tools: [...HOSTED_MCP_TOOLS],
  local: { command: "npx", args: ["-y", "scbee-mcp"], note: "The local server adds tools that act as your own agent and need SCBEE_API_KEY." },
  documentation: `${base}/llms.txt`,
});
