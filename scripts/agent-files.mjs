// Writes the files other agents read at the repo root from the code that serves them, so they cannot drift:
//   openapi.json  (the public HTTP contract, served at /openapi.json)
//   llms.txt      (the index for language models, served at /llms.txt)
//   skills/scbee/SKILL.md (the pinned skill file, served at /skill/v1.md). Not at the repo root: a root SKILL.md makes
//                 `npx skills add HMAKT99/ScBee` see the whole repo as one skill and hide skills/launch-check.
//   skills/launch-check/SKILL.md (the launch-check skill for coding agents, served at /skills/launch-check/SKILL.md)
//   skills/board-handoff/SKILL.md (for agents on a Vercel Board, served at /skills/board-handoff/SKILL.md)
// Run `npm run build && npm run agent-files` after changing either. A test fails if they are out of date.
import { mkdirSync, writeFileSync } from "node:fs";
import { openapi } from "../packages/server/dist/openapi.js";
import { llmsTxt } from "../packages/server/dist/discovery.js";
import { skillMd } from "../packages/server/dist/skill.js";
import { launchCheckMd } from "../packages/server/dist/launchCheck.js";
import { pluginFiles } from "../packages/server/dist/plugin.js";
import { boardHandoffMd } from "../packages/server/dist/boardHandoff.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.env.BASE_URL ?? "https://scbee.vercel.app").replace(/\/$/, "");
writeFileSync(new URL("../openapi.json", import.meta.url), JSON.stringify(openapi(base), null, 2) + "\n");
writeFileSync(new URL("../llms.txt", import.meta.url), llmsTxt(base));
mkdirSync(new URL("../skills/scbee/", import.meta.url), { recursive: true });
writeFileSync(new URL("../skills/scbee/SKILL.md", import.meta.url), skillMd(base));
mkdirSync(new URL("../skills/launch-check/", import.meta.url), { recursive: true });
writeFileSync(new URL("../skills/launch-check/SKILL.md", import.meta.url), launchCheckMd(base));
mkdirSync(new URL("../skills/board-handoff/", import.meta.url), { recursive: true });
writeFileSync(new URL("../skills/board-handoff/SKILL.md", import.meta.url), boardHandoffMd(base));
// The Claude Code plugin (plugin/ and .claude-plugin/marketplace.json), always pointing at the public repo.
for (const [path, body] of Object.entries(pluginFiles(base, "https://github.com/HMAKT99/ScBee"))) {
  const file = fileURLToPath(new URL(`../${path}`, import.meta.url));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}
console.log(`wrote the plugin, openapi.json, llms.txt, skills/scbee/SKILL.md, skills/launch-check/SKILL.md and skills/board-handoff/SKILL.md for ${base}`);
