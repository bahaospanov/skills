#!/usr/bin/env node
// Lockstep: package.json's version is every plugin's; `npm run version` runs this after `changeset version`.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const check = process.argv.includes("--check");

const manifests = [".", ...readdirSync(repo, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)]
  .map((dir) => join(repo, dir, ".claude-plugin", "plugin.json"))
  .filter(existsSync);

let drift = 0;
for (const path of manifests) {
  const source = readFileSync(path, "utf8");
  const { name, version: current } = JSON.parse(source);
  if (current === version) continue;
  if (check) {
    console.error(`${name}: plugin.json is ${current}, package.json is ${version}`);
    drift++;
    continue;
  }
  writeFileSync(path, source.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`));
  console.log(`${name}: ${current} -> ${version}`);
}

if (drift) {
  console.error("Run `node scripts/sync-plugin-versions.mjs`.");
  process.exit(1);
}
console.log(`${manifests.length} plugins at ${version}`);
