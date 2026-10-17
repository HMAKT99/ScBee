// Vercel serverless entry. All routes are rewritten here (see vercel.json); the app does its own routing.
import { createApp, Store } from "../packages/server/dist/index.js";

let ready;
function init() {
  ready ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const store = await Store.open(url, process.env.DATABASE_AUTH_TOKEN);
    const baseUrl = (process.env.BASE_URL ?? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "localhost"}`).replace(/\/$/, "");
    return createApp({
      store,
      baseUrl,
      adminToken: process.env.ADMIN_TOKEN || undefined,
      trustProxy: true,
    }).handler;
  })().catch((e) => { ready = undefined; throw e; });
  return ready;
}

export default async function handler(req, res) {
  try {
    return await (await init())(req, res);
  } catch (e) {
    console.error("startup error:", e instanceof Error ? e.message : "unknown");
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "service unavailable" }));
  }
}
