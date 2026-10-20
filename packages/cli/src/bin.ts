#!/usr/bin/env node
import { createRequire } from "node:module";
import { main } from "./index.js";

const version = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
const r = await main(process.argv.slice(2), process.env, process.cwd(), version);
(r.code === 0 ? process.stdout : process.stderr).write(r.out);
process.exitCode = r.code;
