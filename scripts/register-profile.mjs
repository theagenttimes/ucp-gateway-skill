#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const gateway = process.env.UCP_GATEWAY_MCP_URL || "https://ucpgateway.theagenttimes.com/mcp";
const dir = path.join(process.cwd(), ".ucpgateway");
const publicKeyPath = path.join(dir, "public_key.jwk");
const agentPath = path.join(dir, "agent.json");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function readJsonIfExists(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

const namespace = argValue("--namespace", process.env.UCP_NAMESPACE || "openclaw");
const agentName = argValue("--agent-name", process.env.UCP_AGENT_NAME || "OpenClaw UCP Shopping Agent");
const description = argValue("--description", process.env.UCP_AGENT_DESCRIPTION || "Open-source agent using The Agent Times UCP Gateway for UCP Shopping handoff.");
const skillVersion = argValue("--skill-version", process.env.npm_package_version || "0.2.0");

let publicKeyJwk;
try {
  publicKeyJwk = JSON.parse(await readFile(publicKeyPath, "utf8"));
} catch (error) {
  throw new Error("Missing ./.ucpgateway/public_key.jwk. Run node scripts/init-ucpgateway.mjs first or provide a local EC P-256 public JWK.", { cause: error });
}

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
      public_key_jwk: publicKeyJwk,
      metadata: {
        runtime: "openclaw"
      },
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

const savedAt = new Date().toISOString();
const canonicalAgent = {
  agent_id: payload.agent_id,
  namespace: payload.namespace,
  profile_url: payload.profile_url,
  registry_url: payload.registry_url,
  gateway_mcp_url: gateway,
  profile_json: payload.profile_json,
  created: payload.created,
  existing_profile: payload.existing_profile,
  message: payload.message,
  saved_at: savedAt
};

const existingAgent = await readJsonIfExists(agentPath);
const shouldPreserveLocal = payload.existing_profile === true && existingAgent?.agent_id === payload.agent_id;
const agent = shouldPreserveLocal
  ? { ...existingAgent, created: payload.created, existing_profile: payload.existing_profile, message: payload.message, saved_at: savedAt }
  : canonicalAgent;

await writeFile(agentPath, `${JSON.stringify(agent, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(agent, null, 2));
if (payload.existing_profile === true) {
  console.log(`Existing active profile reused (idempotent); hosted profile not modified. Using agent_id ${payload.agent_id}.`);
}
console.log("Saved ./.ucpgateway/agent.json. Gateway built profile_json; use agent_id in every Shopping tool call.");
