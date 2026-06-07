#!/usr/bin/env node
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";

const UCP_VERSION = "2026-04-08";
const cwd = process.cwd();
const dir = path.join(cwd, ".ucpgateway");
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));
const dryRun = flags.has("--dry-run");
const legacyDraft = flags.has("--legacy-draft");
const publicOnly = flags.has("--public-only");
const forceRotate = flags.has("--force-rotate");

const PRIVATE_FIELDS = new Set(["d", "p", "q", "dp", "dq", "qi", "k"]);

async function exists(file) {
  try { await access(file, constants.F_OK); return true; } catch { return false; }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value, mode) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode });
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

async function derivePublicFromPrivate(privateJwk) {
  try {
    await webcrypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  } catch (error) {
    throw new Error("Existing private_key.jwk is not an importable EC P-256 private JWK; refusing to derive public_key.jwk.", { cause: error });
  }
  if (privateJwk.kty !== "EC" || privateJwk.crv !== "P-256" || !privateJwk.x || !privateJwk.y) {
    throw new Error("Existing private_key.jwk must contain EC P-256 public coordinates x and y; refusing to write a mismatched public_key.jwk.");
  }
  const publicJwk = {
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    y: privateJwk.y
  };
  for (const field of ["kid", "alg", "use"]) {
    if (privateJwk[field] !== undefined) publicJwk[field] = privateJwk[field];
  }
  for (const field of PRIVATE_FIELDS) delete publicJwk[field];
  return publicJwk;
}

function samePublicCoordinates(a, b) {
  return a?.kty === b?.kty && a?.crv === b?.crv && a?.x === b?.x && a?.y === b?.y;
}

function profileDraft(publicJwk) {
  return {
    ucp: {
      version: UCP_VERSION,
      capabilities: {
        "dev.ucp.shopping.catalog.search": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.catalog.lookup": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.catalog": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.cart": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.checkout": [{ version: UCP_VERSION }]
      },
      payment_handlers: {}
    },
    signing_keys: [publicJwk],
    metadata: {
      name: process.env.UCP_AGENT_NAME || "OpenClaw UCP Shopping Agent",
      description: "Open-source agent using The Agent Times UCP Gateway for UCP Shopping handoff.",
      runtime: "openclaw",
      skill: "ucp-gateway-skill"
    }
  };
}

function dryRunMessage() {
  console.log("Would initialize ./.ucpgateway/ local identity. No files changed.");
  console.log("Partial-state handling: private-only derives public_key.jwk from private coordinates; public-only fails unless --public-only; existing private_key.jwk is never overwritten unless --force-rotate.");
  console.log("profile.draft.json is legacy-only; pass --legacy-draft to create it.");
}

if (dryRun) {
  dryRunMessage();
  process.exit(0);
}

await mkdir(dir, { recursive: true });
const privatePath = path.join(dir, "private_key.jwk");
const publicPath = path.join(dir, "public_key.jwk");
const draftPath = path.join(dir, "profile.draft.json");

const privateExists = await exists(privatePath);
const publicExists = await exists(publicPath);
let publicJwk;

if (forceRotate) {
  console.warn("--force-rotate requested: overwriting both private_key.jwk and public_key.jwk with a fresh local keypair.");
  const pair = await generateKeypair();
  await writeJson(privatePath, pair.privateJwk, 0o600);
  await writeJson(publicPath, pair.publicJwk, 0o644);
  publicJwk = pair.publicJwk;
} else if (privateExists && publicExists) {
  const privateJwk = await readJson(privatePath);
  publicJwk = await readJson(publicPath);
  const derivedPublic = await derivePublicFromPrivate(privateJwk);
  if (!samePublicCoordinates(publicJwk, derivedPublic)) {
    throw new Error("Existing public_key.jwk does not match private_key.jwk; refusing to continue. Fix the files or run with --force-rotate to intentionally replace both.");
  }
  console.log("Reusing existing local keypair.");
} else if (!privateExists && !publicExists) {
  const pair = await generateKeypair();
  await writeJson(privatePath, pair.privateJwk, 0o600);
  await writeJson(publicPath, pair.publicJwk, 0o644);
  publicJwk = pair.publicJwk;
  console.log("Generated new local keypair.");
} else if (privateExists && !publicExists) {
  const privateJwk = await readJson(privatePath);
  publicJwk = await derivePublicFromPrivate(privateJwk);
  await writeJson(publicPath, publicJwk, 0o644);
  console.log("Derived public_key.jwk from existing private_key.jwk.");
} else if (!privateExists && publicExists) {
  if (!publicOnly) {
    throw new Error("Found public_key.jwk but no private_key.jwk; refusing to continue with public-only state. Re-run with --public-only only if you intentionally manage the private key elsewhere.");
  }
  publicJwk = await readJson(publicPath);
  console.warn("Continuing with public-only state because --public-only was provided. Ensure the matching private key is managed elsewhere.");
}

if (legacyDraft && !(await exists(draftPath))) {
  await writeJson(draftPath, profileDraft(publicJwk), 0o644);
}

console.log(`Initialized ${path.relative(cwd, dir)}`);
console.log("Private key stays local and must never be uploaded. Next: node scripts/register-profile.mjs (sends public_key_jwk; gateway builds the UCP profile)." );
