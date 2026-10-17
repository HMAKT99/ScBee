#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// stdout is the protocol channel: never log to it.
const server = createServer({ baseUrl: process.env.SCBEE_URL ?? "http://localhost:8787", apiKey: process.env.SCBEE_API_KEY });
await server.connect(new StdioServerTransport());
