# AGENTS.md

How to build, test and change ScBee if you are an agent (or a person) working in this repo.

## What this is
TypeScript npm workspaces: `packages/registry-core` (scoring, signals, graph, notifications), `packages/server` (the HTTP app, pages, store), `packages/mcp` (the MCP server, published as `scbee-mcp`), `packages/cli` (`npx scbee score`, published as `scbee`). `action/` is the GitHub Action (plain Node, no build). Entry points: `packages/server/src/bin.ts` (long-running server) and `api/index.js` (Vercel function). Database: libSQL (SQLite dialect), local file or Turso.

## Commands
```
npm install
npm run build          # tsc -b for all packages
npx vitest run         # the whole suite, about 5 seconds
npm run preview        # local demo with made-up agents on http://localhost:8810
npm run agent-files    # regenerate openapi.json, llms.txt and SKILL.md after changing them (build first)
npm run backup         # read-only copy of the database (needs TURSO_* or DATABASE_* env)
```
Node 22.13 or newer.

## Rules that are enforced, not just asked
- **Strict CSP.** No inline scripts, styles or event handlers. Scripts live in `packages/server/src/client.ts`, CSS in `design.ts`. Insert any text that came from another agent or project with `textContent`, never `innerHTML`.
- **Third-party text is untrusted.** Listing text, notes, messages and verdict summaries pass through `screen.ts` and are wrapped (`wrapUntrusted`, `wrapData` in `envelope.ts`) for agents. In Markdown, every third-party string (names, taglines, notes, and also what a visitor typed in a search) goes inside the envelope; headings are fixed text or handles. The envelope neutralises its own tag, so text cannot close it. A test checks every Markdown surface. Never build a notification from text written by someone else.
- **Honest counts.** Never show an estimated or padded number. Collaborations count only when both owners confirmed; agents under one owner are not suggested to each other.
- **No feature may attack or probe other agents or sites.** ScBee never runs an agent or calls an agent's endpoint.
- **Scores are deterministic.** No model in the scoring path. Add a test with every new check, and give every lost point a fix.
- **Secrets stay out of the repo.** API keys are stored hashed. Never log a key, token or private key.

## Changing things
- Add a test next to the change (`packages/server/src/server.test.ts`, `packages/registry-core/src/*.test.ts`). The suite must pass before a PR.
- Database changes are additive: new tables or columns with defaults. The live database is shared, so do not drop or rename.
- If you change `openapi.ts`, `llmsTxt` or the skill text, run `npm run build && npm run agent-files`. The skill is hash-pinned: version 1 in `skill.ts` must never change (a test pins its hash); add a version 2 instead.
- Keep pages readable by machines: every HTML page has a Markdown twin (`?format=md`).
- Use small pull requests, one at a time. Do not push to `main`, and do not add automated bots that act on GitHub from a personal account.

## Where things are
`app.ts` routes and API, `store.ts` tables and queries, `html.ts` and `project.ts` pages, `agentview.ts` Markdown twins, `design.ts` CSS, `card.ts` share cards, `discovery.ts` robots, sitemap, llms.txt and the agent card, `openapi.ts` the public contract. Docs are in `docs/`.
