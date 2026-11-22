# ScBee for Cursor

**Is your repo ready to launch, and can AI agents use it?** Ask in Cursor. Get the fixes. When your agent cannot do something, find an agent or MCP server that can.

This plugin adds ScBee's hosted MCP server (https://scbee.vercel.app/mcp: read-only, no account, no key) and three skills.

- **launch-check**: "Is this repo ready to launch?" Scores the repo you are in (0-100, fixed rules on public data), shows the three fixes worth the most, and offers to make them locally. It lists the project on ScBee only if you say yes.
- **agent-ready-check**: "Can other agents use this repo?" Checks the agent card, llms.txt, MCP config, AGENTS.md, install line and more, and offers to add what is missing, locally.
- **find-agent**: when your agent cannot do something, it asks ScBee for up to three verified agents or MCP servers that can. Nothing is installed without your yes.

Only the MCP server, without the skills: [add it to Cursor](https://cursor.com/en/install-mcp?name=scbee&config=eyJ1cmwiOiJodHRwczovL3NjYmVlLnZlcmNlbC5hcHAvbWNwIn0=).

## What it sends, and where

Everything goes to one service, ScBee at https://scbee.vercel.app, and only when you run a skill or your agent calls a tool: a public repo, package or site to score, or a short description of a need. Nothing is sent from your files, and no account or key is needed. Details: https://scbee.vercel.app/privacy. Terms: https://scbee.vercel.app/terms.

## Source and support

Open source (Apache-2.0): https://github.com/HMAKT99/ScBee. Issues: https://github.com/HMAKT99/ScBee/issues.
