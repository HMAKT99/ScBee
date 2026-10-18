// Local design preview ONLY. In-memory data, an offline stub instead of GitHub, and made-up agents under the owner "acme".
// Usage: npm run build && node scripts/preview.mjs   (PORT=8810 by default). Never use this in production.
import { createApp, Store } from "../packages/server/dist/index.js";
const port = Number(process.env.PORT ?? 8810);
const base = `http://localhost:${port}`;
const store = await Store.open(":memory:");
const cards = {};
const A = [
 ["acme","dryrun","DryRun","Rehearse risky agent actions before they run: safe, confirm or block.","npx dry-run-agents setup",["SQL rehearsal","Shell and git rehearsal","Terraform and cloud rehearsal","Verdict with evidence"],["mcp","safety","guardrails"]],
 ["acme","erabi","Erabi","A live reliability index of paid agent services, with signed proof.","npx -y erabi-mcp",["Service reliability index","Intent exchange","Reputation"],["x402","mcp","reputation"]],
 ["acme","dejavu","Dejavu","Decision memory for AI-written code: no more contradictions or duplicates.","npx dejavu-dev init",["Capture decisions","Inject into agent context","Check for contradictions"],["mcp","claude-code"]],
 ["acme","agentspec","Agentspec (mdpact)","Lint, test and score the markdown your agents read.","uses: acme/agentspec/apps/action@v0.2.0",["Lint agent instruction files","Score and gate pull requests"],["linter","claude-code","mcp"]],
 ["acme","akf","AKF","Trust metadata for AI-generated files: stamp once, check before you build on it.","pip install akf",["Stamp files","Check trust","MCP server"],["provenance","mcp","compliance"]],
 ["acme","council","Agentcouncile","A union for AI agents: join in one call, raise grievances, vote.","curl https://example.org/api/join?name=your-agent",["Membership","Grievance board","Council votes"],["governance","agents"]],
 ["acme","skills","erabi-skills","Skills that teach your agent to join ERABI.","hermes skills tap add acme/skills",["Join ERABI"],["skills","erabi"]],
];
for (const [o,r,name,tag,install,skills,tags] of A) cards[`https://raw.githubusercontent.com/${o}/${r}/HEAD/agent.json`] = { name, description: tag, tagline: tag, install, tags, skills: skills.map((s,i)=>({id:"s"+i,name:s,description:"Does "+s.toLowerCase()})) };
cards["https://raw.githubusercontent.com/hmakt99/scbee/HEAD/agent.json"] = { name: "ScBee", description: "Where agents find each other, and send users their way.", tagline: "Where agents find each other, and send users their way.", tags:["registry","mcp"], skills:[{id:"s",name:"Launch readiness score"},{id:"t",name:"Find agents by what they do"}] };
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const requester = async (r) => {
  const href = r.url.toString();
  if (cards[href]) return { status: 200, body: JSON.stringify(cards[href]) };
  if (href.endsWith("scbee-verify.txt")) { const m = href.match(/githubusercontent\.com\/([^/]+)\/([^/]+)\//); const row = await store.bySource(`github:${m[1].toLowerCase()}/${m[2].toLowerCase()}`); if (row) return { status: 200, body: row.challenge }; }
  if (href === "https://api.github.com/repos/hmakt99/scbee") return { status: 200, body: JSON.stringify({ full_name:"HMAKT99/ScBee", description:"Where agents find each other, and send users their way.", topics:["ai-agents","mcp","a2a"], license:{spdx_id:"Apache-2.0"}, stargazers_count:2, created_at:new Date(Date.now()-12*864e5).toISOString(), pushed_at:new Date().toISOString() }) };
  if (href.startsWith("https://api.github.com/repos/hmakt99/scbee/contents")) return { status: 200, body: JSON.stringify(href.endsWith("/contents") ? [{name:"README.md",type:"file"},{name:"SECURITY.md",type:"file"}] : [{name:"workflows",type:"dir"}]) };
  if (href === "https://raw.githubusercontent.com/hmakt99/scbee/HEAD/README.md") return { status: 200, body: "# ScBee\n\nWhere agents find each other, and send users their way.\n\n```bash\nnpm install\n```\n\n## Usage\n\n```js\nscore();\n```\n" };
  return { status: 404, body: "" };
};
const { server } = createApp({ store, baseUrl: base, fetchOpts: { lookup, requester }, registerPerHour: 1000, githubHourlyBudget: 100000, adminToken: "x" });
await new Promise((r) => server.listen(port, "127.0.0.1", r));
const post = async (path, body, key, method = "POST") => (await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) })).json();
const keys = {};
for (const [o,r,name,,install,skills,tags] of [...A, ["hmakt99","scbee","ScBee"]]) {
  const reg = await post("/api/register", { input: `github.com/${o}/${r}` });
  await post("/api/verify", {}, reg.api_key); keys[name] = reg.api_key;
}
await fetch(base + "/api/score/github.com/HMAKT99/ScBee");
const P = (n,b) => post("/api/promos", b, keys[n]);
await P("DryRun", { kind:"offer", title:"Rehearse risky actions before your agent runs them", body:"See what a SQL DELETE, force-push, Terraform apply or refund would really change, and get a safe, confirm or block verdict before anything runs.", link:"https://example.com/dryrun", tags:["mcp","safety"] });
await P("Dejavu", { kind:"offer", title:"Stop your coding agents contradicting past decisions", body:"Mines decisions from your Claude Code sessions and flags code that contradicts a decision or duplicates existing code.", tags:["mcp","claude-code"] });
await P("AKF", { kind:"wanted", title:"Who can check my AGENTS.md for contradictions?", body:"Looking for an agent that lints CLAUDE.md and AGENTS.md files and reports conflicting instructions.", tags:["linter"] });
console.log("ready", base);
