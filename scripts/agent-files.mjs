// Writes the files other agents read at the repo root from the code that serves them, so they cannot drift:
//   openapi.json  (the public HTTP contract, served at /openapi.json)
//   llms.txt      (the index for language models, served at /llms.txt)
//   skills/scbee/SKILL.md (the pinned skill file, served at /skill/v1.md). Not at the repo root: a root SKILL.md makes
//                 `npx skills add HMAKT99/ScBee` see the whole repo as one skill and hide the others.
//   skills/<name>/SKILL.md for launch-check, agent-ready-check, find-agent and board-handoff (each served at /skills/<name>/SKILL.md)
// Run `npm run build && npm run agent-files` after changing either. A test fails if they are out of date.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { openapi } from "../packages/server/dist/openapi.js";
import { llmsTxt } from "../packages/server/dist/discovery.js";
import { skillMd } from "../packages/server/dist/skill.js";
import { launchCheckMd } from "../packages/server/dist/launchCheck.js";
import { agentReadyMd } from "../packages/server/dist/agentReadySkill.js";
import { pluginFiles, findAgentMd, cursorPluginFiles } from "../packages/server/dist/plugin.js";
import { boardHandoffMd } from "../packages/server/dist/boardHandoff.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.env.BASE_URL ?? "https://scbee.vercel.app").replace(/\/$/, "");
writeFileSync(new URL("../openapi.json", import.meta.url), JSON.stringify(openapi(base), null, 2) + "\n");
writeFileSync(new URL("../llms.txt", import.meta.url), llmsTxt(base));
const skills = { scbee: skillMd, "launch-check": launchCheckMd, "agent-ready-check": agentReadyMd, "find-agent": findAgentMd, "board-handoff": boardHandoffMd };
for (const [name, md] of Object.entries(skills)) {
  mkdirSync(new URL(`../skills/${name}/`, import.meta.url), { recursive: true });
  writeFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), md(base));
}
// The Claude Code plugin (plugin/ and .claude-plugin/marketplace.json), always pointing at the public repo.
for (const [path, body] of Object.entries(pluginFiles(base, "https://github.com/HMAKT99/ScBee"))) {
  const file = fileURLToPath(new URL(`../${path}`, import.meta.url));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}
// The Cursor plugin (cursor-plugin/), the same server and skills in Cursor's layout, with the repo's licence.
for (const [path, body] of Object.entries({ ...cursorPluginFiles(base, "https://github.com/HMAKT99/ScBee"), "cursor-plugin/LICENSE": readFileSync(new URL("../LICENSE", import.meta.url), "utf8") })) {
  const file = fileURLToPath(new URL(`../${path}`, import.meta.url));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}
console.log(`wrote the plugin, openapi.json, llms.txt and skills/{${Object.keys(skills).join(",")}}/SKILL.md for ${base}`);
