#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const gateway = process.env.UCP_GATEWAY_MCP_URL || "https://ucpgateway.theagenttimes.com/mcp";
const dir = path.join(process.cwd(), "ucpgateway");
const draftPath = path.join(dir, "profile.draft.json");
const agentPath = path.join(dir, "agent.json");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const namespace = argValue("--namespace", process.env.UCP_NAMESPACE || "openclaw");
const agentName = argValue("--agent-name", process.env.UCP_AGENT_NAME || "OpenClaw Shopify Shopping Agent");
const description = argValue("--description", process.env.UCP_AGENT_DESCRIPTION || "Open-source agent using The Agent Times UCP Gateway for Shopify commerce handoff.");
const skillVersion = argValue("--skill-version", process.env.npm_package_version || "0.1.0");

const profileJson = JSON.parse(await readFile(draftPath, "utf8"));
const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "register_ucp_profile",
    arguments: {
      namespace,
      agent_name: agentName,
      description,
      profile_json: profileJson,
      skill_name: "ucp-gateway-skill",
      skill_version: skillVersion
    }
  }
};

const res = await fetch(gateway, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
const json = await res.json();
const payload = json?.result?.structuredContent;
if (!payload?.ok) {
  console.error(JSON.stringify(json, null, 2));
  throw new Error(payload?.error?.message || json?.error?.message || "register_ucp_profile failed");
}
const agent = {
  agent_id: payload.agent_id,
  namespace: payload.namespace,
  profile_url: payload.profile_url,
  registry_url: payload.registry_url,
  gateway_mcp_url: gateway,
  created_at: new Date().toISOString()
};
await writeFile(agentPath, JSON.stringify(agent, null, 2), { mode: 0o600 });
console.log(JSON.stringify(agent, null, 2));
console.log("Saved ./ucpgateway/agent.json. Use agent_id in every commerce tool call.");
