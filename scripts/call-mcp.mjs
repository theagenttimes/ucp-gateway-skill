#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function usage() {
  console.log(`Usage:
  node scripts/call-mcp.mjs <tool_name> '<json-arguments>'
  node scripts/call-mcp.mjs --initialize
  node scripts/call-mcp.mjs --tools
  node scripts/call-mcp.mjs --resources
  node scripts/call-mcp.mjs --resource <uri>
  node scripts/call-mcp.mjs --prompts
  node scripts/call-mcp.mjs --prompt <name> [--prompt-arg key=value ...]

Examples:
  node scripts/call-mcp.mjs --initialize
  node scripts/call-mcp.mjs --tools
  node scripts/call-mcp.mjs --resource ucp://gateway/skill-runtime-guide
  node scripts/call-mcp.mjs --prompt ucp-skill-runtime-guide --prompt-arg shopping_goal='trail running shoes'
  node scripts/call-mcp.mjs shopping_product_search '{"query":"trail running shoes","limit":5}'
  node scripts/call-mcp.mjs shopping_product_get '{"product_id":"provider-product-id","merchant_domain":"merchant.example"}'

The full JSON-RPC response is printed, including result.next_step and result.structuredContent.next_step.
Discovery modes do not require ./.ucpgateway/agent.json.
If ./.ucpgateway/agent.json exists, agent_id is injected automatically for Shopping tools when absent.`);
}

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parsePromptArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] !== "--prompt-arg") continue;
    const pair = process.argv[i + 1];
    if (!pair || pair.startsWith("--") || !pair.includes("=")) {
      throw new Error("--prompt-arg must be provided as key=value");
    }
    const [key, ...rest] = pair.split("=");
    args[key] = rest.join("=");
    i += 1;
  }
  return args;
}

function discoveryRequest() {
  if (hasFlag("--initialize")) return { method: "initialize" };
  if (hasFlag("--tools")) return { method: "tools/list" };
  if (hasFlag("--resources")) return { method: "resources/list" };
  if (hasFlag("--resource")) {
    const uri = flagValue("--resource");
    if (!uri || uri.startsWith("--")) throw new Error("--resource requires a URI");
    return { method: "resources/read", params: { uri } };
  }
  if (hasFlag("--prompts")) return { method: "prompts/list" };
  if (hasFlag("--prompt")) {
    const name = flagValue("--prompt");
    if (!name || name.startsWith("--")) throw new Error("--prompt requires a prompt name");
    return { method: "prompts/get", params: { name, arguments: parsePromptArgs() } };
  }
  return null;
}

if (hasFlag("--help") || process.argv.length < 3) {
  usage();
  process.exit(0);
}

const gateway = process.env.UCP_GATEWAY_MCP_URL || "https://ucpgateway.theagenttimes.com/mcp";
let request = discoveryRequest();

if (!request) {
  const tool = process.argv[2];
  let args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  const agentPath = path.join(process.cwd(), ".ucpgateway", "agent.json");

  if (!args.agent_id && !["register_ucp_profile", "get_ucp_profile"].includes(tool)) {
    try {
      const agent = JSON.parse(await readFile(agentPath, "utf8"));
      args = { agent_id: agent.agent_id, ...args };
    } catch {
      throw new Error("Missing agent_id and ./.ucpgateway/agent.json not found. Run init/register first.");
    }
  }
  request = { method: "tools/call", params: { name: tool, arguments: args } };
}

const res = await fetch(gateway, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), ...request })
});
console.log(JSON.stringify(await res.json(), null, 2));
