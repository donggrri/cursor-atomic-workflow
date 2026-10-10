#!/usr/bin/env node
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Root scripts copied into the workflow skill. Edit the root file, then sync. */
export const BUNDLED_SCRIPTS = ["work-status.mjs", "run-done.mjs", "memory.mjs"];

export const BUNDLED_SCRIPT_DIR = join(
  ".cursor",
  "skills",
  "cursor-atomic-workflow",
  "scripts",
);

/**
 * @param {string} cwd
 * @param {string} script
 */
function scriptPair(cwd, script) {
  return {
    script,
    rootScript: join(cwd, "scripts", script),
    bundledScript: join(cwd, BUNDLED_SCRIPT_DIR, script),
  };
}

/**
 * Names that differ between scripts/ and the skill copy.
 * A missing skill file is reported as a path. Content drift is the file name.
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<string[]>}
 */
export async function bundledScriptDiffs(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const mismatches = [];
  for (const name of BUNDLED_SCRIPTS) {
    const { rootScript, bundledScript } = scriptPair(cwd, name);
    if (!existsSync(rootScript)) {
      mismatches.push(`missing scripts/${name}`);
      continue;
    }
    if (!existsSync(bundledScript)) {
      mismatches.push(`missing ${BUNDLED_SCRIPT_DIR}/${name}`);
      continue;
    }
    const [rootText, bundledText] = await Promise.all([
      readFile(rootScript, "utf8"),
      readFile(bundledScript, "utf8"),
    ]);
    if (rootText !== bundledText) mismatches.push(name);
  }
  return mismatches;
}

/**
 * Copy scripts/{work-status,run-done,memory}.mjs onto the skill copies.
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<string[]>}
 */
export async function syncBundledScripts(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const destDir = join(cwd, BUNDLED_SCRIPT_DIR);
  await mkdir(destDir, { recursive: true });
  const copied = [];
  for (const name of BUNDLED_SCRIPTS) {
    const { rootScript, bundledScript } = scriptPair(cwd, name);
    await copyFile(rootScript, bundledScript);
    copied.push(name);
  }
  return copied;
}

function usage() {
  return `Usage: node scripts/sync-bundled.mjs [--check]
Copies scripts/{${BUNDLED_SCRIPTS.join(",")}} to ${BUNDLED_SCRIPT_DIR}/.
--check exits 1 when the copies differ and does not write.`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  if (args.some((arg) => arg !== "--check")) {
    console.error(usage());
    process.exit(2);
  }
  const check = args.includes("--check");
  const cwd = process.cwd();
  if (!check) {
    const copied = await syncBundledScripts({ cwd });
    console.log(`synced ${copied.join(", ")}`);
  }
  const mismatches = await bundledScriptDiffs({ cwd });
  if (mismatches.length > 0) {
    for (const item of mismatches) console.error(item);
    process.exit(1);
  }
  if (check) console.log("ok");
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
