#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const toolNames = [
  "register_ucp_profile",
  "get_ucp_profile",
  "shopping_product_search",
  "shopping_product_get",
  "shopping_cart_create",
  "shopping_cart_get",
  "shopping_cart_update",
  "shopping_cart_cancel",
  "shopping_checkout_create",
  "shopping_checkout_get",
  "shopping_checkout_update",
  "shopping_checkout_cancel"
];
const oldAliases = [
  "shopping_search_products",
  "shopping_get_product",
  "shopping_create_cart",
  "shopping_get_cart",
  "shopping_update_cart",
  "shopping_cancel_cart",
  "shopping_create_checkout",
  "shopping_get_checkout",
  "shopping_update_checkout",
  "shopping_cancel_checkout"
];

function fail(message) {
  console.error(`check-skill: ${message}`);
  process.exitCode = 1;
}

const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
const match = skill.match(/^---\n([\s\S]*?)\n---\n/);
if (!match) fail("SKILL.md missing YAML frontmatter");
const frontmatter = match?.[1] ?? "";
const keys = frontmatter.split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(":")[0]);
for (const required of ["name", "description"]) {
  if (!keys.includes(required)) fail(`frontmatter missing ${required}`);
}
const extraKeys = keys.filter((key) => !["name", "description"].includes(key));
if (extraKeys.length) fail(`frontmatter contains unsupported keys: ${extraKeys.join(", ")}`);
if (/\balways\b/i.test(frontmatter)) fail("frontmatter must not contain always");

for (const name of toolNames) {
  if (!skill.includes(name)) fail(`SKILL.md missing tool name ${name}`);
}
if (/shopify_/i.test(skill)) fail("SKILL.md must not contain provider-specific shopify_* aliases");
for (const alias of oldAliases) {
  if (skill.includes(alias)) fail(`SKILL.md must not contain removed alias ${alias}`);
}

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const registerScript = await readFile(path.join(root, "scripts", "register-profile.mjs"), "utf8");
const fallback = registerScript.match(/npm_package_version\s*\|\|\s*"([^"]+)"/)?.[1];
if (!fallback) fail("register-profile.mjs missing npm_package_version fallback");
if (fallback && fallback !== pkg.version) fail(`register-profile fallback ${fallback} does not match package version ${pkg.version}`);

const examplesDir = path.join(root, "examples");
for (const file of await readdir(examplesDir)) {
  if (!file.endsWith(".json") && !file.endsWith(".json.example")) continue;
  try {
    JSON.parse(await readFile(path.join(examplesDir, file), "utf8"));
  } catch (error) {
    fail(`examples/${file} is not valid JSON: ${error.message}`);
  }
}

if (!process.exitCode) console.log(`check-skill: ok (${pkg.name}@${pkg.version})`);
