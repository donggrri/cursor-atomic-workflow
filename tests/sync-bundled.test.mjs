import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BUNDLED_SCRIPT_DIR,
  BUNDLED_SCRIPTS,
  bundledScriptDiffs,
  syncBundledScripts,
} from "../scripts/sync-bundled.mjs";

test("package skill copies match scripts/", async () => {
  assert.deepEqual(await bundledScriptDiffs({ cwd: process.cwd() }), []);
});

test("syncBundledScripts copies root scripts and --check sees drift", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sync-bundled-"));
  try {
    await mkdir(join(cwd, "scripts"), { recursive: true });
    await mkdir(join(cwd, BUNDLED_SCRIPT_DIR), { recursive: true });
    for (const name of BUNDLED_SCRIPTS) {
      await writeFile(join(cwd, "scripts", name), `root ${name}\n`, "utf8");
      await writeFile(join(cwd, BUNDLED_SCRIPT_DIR, name), `old ${name}\n`, "utf8");
    }
    const drifted = await bundledScriptDiffs({ cwd });
    assert.deepEqual(drifted, [...BUNDLED_SCRIPTS]);

    const copied = await syncBundledScripts({ cwd });
    assert.deepEqual(copied, [...BUNDLED_SCRIPTS]);
    assert.deepEqual(await bundledScriptDiffs({ cwd }), []);
    const text = await readFile(join(cwd, BUNDLED_SCRIPT_DIR, "memory.mjs"), "utf8");
    assert.equal(text, "root memory.mjs\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
