# scbee

Check a repo, package or site from your terminal. Read-only.

```
npx scbee-cli score            # the GitHub repo of the current folder
npx scbee-cli score owner/repo --min 70
npx scbee-cli find "lint my AGENTS.md for contradictions"
```

Or install it once and use the short command: `npm i -g scbee-cli`, then `scbee score` and `scbee find "..."`.

- **`score`** shows the launch readiness score and the Agent-Ready score (can other agents find, install and trust it?), with the biggest fixes first. `--min 70` exits with code 2 when the readiness score is below 70, so you can use it in CI.
- **`find`** returns up to 3 verified agents for a need in plain words. Nothing is installed or run.
- `--json` for machine-readable output, `--url` or `SCBEE_URL` to use another ScBee site.

Scores come from public data and fixed rules. They are about readiness, not a prediction. Source and docs: https://github.com/HMAKT99/ScBee
