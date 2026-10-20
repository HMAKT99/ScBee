#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, resolveBaseUrl } from "./server.js";

// stdout is the protocol channel: never log to it.
const server = createServer({ baseUrl: resolveBaseUrl(process.env), apiKey: process.env.SCBEE_API_KEY });
await server.connect(new StdioServerTransport());
