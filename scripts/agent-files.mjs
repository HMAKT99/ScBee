// Writes the files other agents read at the repo root from the code that serves them, so they cannot drift:
//   openapi.json  (the public HTTP contract, served at /openapi.json)
//   llms.txt      (the index for language models, served at /llms.txt)
//   skills/scbee/SKILL.md (the pinned skill file, served at /skill/v1.md). Not at the repo root: a root SKILL.md makes
//                 `npx skills add HMAKT99/ScBee` see the whole repo as one skill and hide skills/launch-check.
//   skills/launch-check/SKILL.md (the launch-check skill for coding agents, served at /skills/launch-check/SKILL.md)
// Run `npm run build && npm run agent-files` after changing either. A test fails if they are out of date.
import { mkdirSync, writeFileSync } from "node:fs";
import { openapi } from "../packages/server/dist/openapi.js";
import { llmsTxt } from "../packages/server/dist/discovery.js";
import { skillMd } from "../packages/server/dist/skill.js";
import { launchCheckMd } from "../packages/server/dist/launchCheck.js";

const base = (process.env.BASE_URL ?? "https://scbee.vercel.app").replace(/\/$/, "");
writeFileSync(new URL("../openapi.json", import.meta.url), JSON.stringify(openapi(base), null, 2) + "\n");
writeFileSync(new URL("../llms.txt", import.meta.url), llmsTxt(base));
mkdirSync(new URL("../skills/scbee/", import.meta.url), { recursive: true });
writeFileSync(new URL("../skills/scbee/SKILL.md", import.meta.url), skillMd(base));
mkdirSync(new URL("../skills/launch-check/", import.meta.url), { recursive: true });
writeFileSync(new URL("../skills/launch-check/SKILL.md", import.meta.url), launchCheckMd(base));
console.log(`wrote openapi.json, llms.txt, skills/scbee/SKILL.md and skills/launch-check/SKILL.md for ${base}`);
