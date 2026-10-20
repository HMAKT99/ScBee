// Vercel serverless entry. All routes are rewritten here (see vercel.json); the app does its own routing.
import { createApp, Store, siteFromEnv } from "../packages/server/dist/index.js";

let ready;
function init() {
  ready ??= (async () => {
    // DATABASE_* are ScBee's names; TURSO_* are what the Vercel Turso integration provides.
    const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const store = await Store.open(url, process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN);
    const baseUrl = (process.env.BASE_URL ?? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "localhost"}`).replace(/\/$/, "");
    return createApp({
      store,
      baseUrl,
      adminToken: process.env.ADMIN_TOKEN || undefined,
      trustProxy: true,
      githubToken: process.env.GITHUB_TOKEN || undefined,
      githubApp: process.env.GITHUB_APP_ID && process.env.GITHUB_APP_INSTALLATION_ID && process.env.GITHUB_APP_PRIVATE_KEY
        ? { appId: process.env.GITHUB_APP_ID, installationId: process.env.GITHUB_APP_INSTALLATION_ID, privateKey: process.env.GITHUB_APP_PRIVATE_KEY } : undefined,
      cronSecret: process.env.CRON_SECRET || undefined,
      githubHourlyBudget: process.env.GITHUB_HOURLY_BUDGET ? Number(process.env.GITHUB_HOURLY_BUDGET) : undefined,
      webhookKey: process.env.WEBHOOK_KEY || undefined,
      site: siteFromEnv(process.env),
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
