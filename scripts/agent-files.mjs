// Writes the files other agents read at the repo root from the code that serves them, so they cannot drift:
//   openapi.json  (the public HTTP contract, served at /openapi.json)
//   llms.txt      (the index for language models, served at /llms.txt)
// Run `npm run build && npm run agent-files` after changing either. A test fails if they are out of date.
import { writeFileSync } from "node:fs";
import { openapi } from "../packages/server/dist/openapi.js";
import { llmsTxt } from "../packages/server/dist/discovery.js";

const base = (process.env.BASE_URL ?? "https://scbee.vercel.app").replace(/\/$/, "");
writeFileSync(new URL("../openapi.json", import.meta.url), JSON.stringify(openapi(base), null, 2) + "\n");
writeFileSync(new URL("../llms.txt", import.meta.url), llmsTxt(base));
console.log(`wrote openapi.json and llms.txt for ${base}`);
