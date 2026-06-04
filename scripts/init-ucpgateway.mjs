#!/usr/bin/env node
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";

const UCP_VERSION = "2026-04-08";
const cwd = process.cwd();
const dir = path.join(cwd, "ucpgateway");
const dryRun = process.argv.includes("--dry-run");

async function exists(file) {
  try { await access(file, constants.F_OK); return true; } catch { return false; }
}

async function generateKeypair() {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    privateJwk: { ...privateJwk, kid: "local-key-1", alg: "ES256", use: "sig" },
    publicJwk: { ...publicJwk, kid: "local-key-1", alg: "ES256", use: "sig" }
  };
}

function profileDraft(publicJwk) {
  return {
    ucp: {
      version: UCP_VERSION,
      capabilities: {
        "dev.ucp.shopping.catalog.search": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.catalog.lookup": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.cart": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.checkout": [{ version: UCP_VERSION }]
      },
      payment_handlers: {}
    },
    signing_keys: [publicJwk],
    metadata: {
      name: process.env.UCP_AGENT_NAME || "OpenClaw Shopify Shopping Agent",
      description: "Open-source agent using The Agent Times UCP Gateway for Shopify commerce handoff.",
      runtime: "openclaw",
      skill: "ucp-gateway-skill"
    }
  };
}

if (dryRun) {
  console.log("Would create ./ucpgateway/{private_key.jwk,public_key.jwk,profile.draft.json}. No files changed.");
  process.exit(0);
}

await mkdir(dir, { recursive: true });
const privatePath = path.join(dir, "private_key.jwk");
const publicPath = path.join(dir, "public_key.jwk");
const draftPath = path.join(dir, "profile.draft.json");

let publicJwk;
if (await exists(publicPath)) {
  publicJwk = JSON.parse(await readFile(publicPath, "utf8"));
} else {
  const { privateJwk, publicJwk: generatedPublic } = await generateKeypair();
  publicJwk = generatedPublic;
  if (!(await exists(privatePath))) await writeFile(privatePath, JSON.stringify(privateJwk, null, 2), { mode: 0o600 });
  await writeFile(publicPath, JSON.stringify(publicJwk, null, 2), { mode: 0o644 });
}

if (!(await exists(draftPath))) {
  await writeFile(draftPath, JSON.stringify(profileDraft(publicJwk), null, 2));
}

console.log(`Initialized ${path.relative(cwd, dir)}`);
console.log("Private key stays local and must never be uploaded. Next: node scripts/register-profile.mjs");
