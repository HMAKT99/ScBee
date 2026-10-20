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

A free monitor tells you the site is down before a visitor does.

1. Sign up at UptimeRobot or Better Stack (free tier).
2. Add an HTTPS monitor for `https://scbee.vercel.app/api/stats`, every 5 minutes, with email alerts.
3. Optionally add `https://scbee.vercel.app/` too.

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
