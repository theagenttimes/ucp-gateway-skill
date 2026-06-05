#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

function usage() {
  console.log(`Usage:
  node scripts/call-mcp.mjs <tool_name> '<json-arguments>'

Examples:
  node scripts/call-mcp.mjs shopping_search_products '{"query":"trail running shoes","limit":5}'
  node scripts/call-mcp.mjs shopping_get_product '{"product_id":"gid://shopify/Product/1111111111111","merchant_domain":"example-shop.myshopify.com"}'

The full JSON-RPC response is printed, including result.structuredContent.next_step.
Buyer fields use E.164 phone and ISO-2 country. Phone is optional.
If ./ucpgateway/agent.json exists, agent_id is injected automatically for Shopping tools when absent.`);
}

if (process.argv.includes("--help") || process.argv.length < 3) {
  usage();
  process.exit(0);
}

const gateway = process.env.UCP_GATEWAY_MCP_URL || "https://ucpgateway.theagenttimes.com/mcp";
const tool = process.argv[2];
let args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const agentPath = path.join(process.cwd(), "ucpgateway", "agent.json");

if (!args.agent_id && !["register_ucp_profile", "get_ucp_profile"].includes(tool)) {
  try {
    const agent = JSON.parse(await readFile(agentPath, "utf8"));
    args = { agent_id: agent.agent_id, ...args };
  } catch {
    throw new Error("Missing agent_id and ./ucpgateway/agent.json not found. Run init/register first.");
  }
}

const res = await fetch(gateway, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: tool, arguments: args } })
});
console.log(JSON.stringify(await res.json(), null, 2));
