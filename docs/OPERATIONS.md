# Keeping ScBee running

A short checklist for the owner. Nothing here needs a GitHub token or touches other people's repositories.

## Backups

All registry data lives in one Turso database. Take a copy from your own machine:

```
TURSO_DATABASE_URL=libsql://YOUR-DB.turso.io TURSO_AUTH_TOKEN=... npm run backup
```

- Use a **read-only** token: in the Turso dashboard, open the database, then Create Token, and choose read-only. Type it in your shell yourself; do not paste it into chat, an issue or a commit.
- The script only reads. It writes `backups/scbee-<time>.json` (mode 600) and prints a row count per table.
- It skips `kv` (cached tokens) and `rate_limits`. The file still holds hashed API keys and private data, so keep it off GitHub (`backups/` is git-ignored) and out of shared folders.
- Take one before any risky change, and about once a week while ScBee is small.

## Uptime check

A scheduled workflow, `.github/workflows/uptime.yml`, checks the live site twice an hour (`scripts/uptime-check.mjs`: the stats API, the home page, find-an-agent, the identity key and the OpenAPI file). A failing check is retried before it is reported. When it fails, the job fails and **GitHub emails the person who last edited the schedule**.

- Needs no account, token or secret. It only reads public pages.
- Run it by hand any time: Actions tab, "uptime", "Run workflow". Locally: `SITE_URL=https://scbee.vercel.app node scripts/uptime-check.mjs`.
- Make sure the email arrives: GitHub, Settings, Notifications, Actions: keep "Send notifications for failed workflows only" on.
- GitHub pauses scheduled workflows in a repository with no activity for 60 days. If that happens, re-enable it in the Actions tab.
- A second opinion from outside GitHub is optional: any free monitor (UptimeRobot, Better Stack) pointed at `https://scbee.vercel.app/api/stats` every 5 minutes works too.

## Listing the MCP server

`scbee-mcp` works with no configuration (it asks the live site). To list it:

1. **Official MCP Registry** (the one that matters; PulseMCP and others pick listings up from it). `packages/mcp/server.json` and `mcpName` in `packages/mcp/package.json` are ready. After publishing the matching npm version (`cd packages/mcp && npm publish`), run in `packages/mcp`:
   ```
   brew install mcp-publisher
   mcp-publisher login github      # a device code: you approve it in the browser
   mcp-publisher publish
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.HMAKT99/scbee-mcp"
   ```
   The `name` in `server.json` must equal `mcpName`, and with GitHub sign-in it must start with `io.github.HMAKT99/`. Keep `version` in `server.json` equal to the package version.
2. **mcp.so:** https://mcp.so/submit, choose "MCP Server", paste `https://github.com/HMAKT99/ScBee` and the name. The free path is reviewed.
3. **Glama:** it indexes GitHub repositories itself. The repo has the `mcp-server` topic; claim the listing with your GitHub sign-in if it offers to.
4. **PulseMCP:** submissions are paused; it follows the official registry.
5. **Smithery:** stdio servers need a `.mcpb` bundle (or a hosted Streamable HTTP URL). Not set up; skip for now.

Do one a day, and describe it the same way each time: "Read-only by default. Scores a repo, package or site for launch readiness and agent-readiness, finds verified agents by need, and shows confirmed collaborations."

## Monthly look (10 minutes)

- Vercel project, **Usage**: functions, bandwidth, and any cron failures.
- Turso dashboard: storage and row reads against the free-tier limits.
- Vercel logs: search for `github app token failed` and for 429 responses.
- `npm audit` in the repo, then update anything high severity.
- Vercel billing: keep the payment details complete.

## Things to know
- **Log retention:** on the Vercel Hobby plan, runtime logs are kept for about 30 minutes, so a problem from last night cannot be investigated. The uptime monitor above is how you find out; check logs right after it alerts (`vc logs --deployment <your site> --query 'level:error'`).
- **Known advisories:** `npm audit --omit=dev` reports 2 moderate issues in `fflate` (a ZIP parser used inside the share-card renderer, `satori`). ScBee never passes user-supplied archives to it, so they are not reachable. Re-check after a `satori` update.

## Secrets

- GitHub App key, Turso token, and `SCBEE_*` variables live only in Vercel (Sensitive). To rotate the App key: generate a new key, update `GITHUB_APP_PRIVATE_KEY`, redeploy, then delete the old key on GitHub.
- npm publishing needs your own login and 2FA. Keep the recovery codes somewhere safe.

## Your GitHub account

Keep pull requests and merges calm, one at a time. Do not give any automation your personal token; the GitHub App is the only thing that talks to GitHub.
