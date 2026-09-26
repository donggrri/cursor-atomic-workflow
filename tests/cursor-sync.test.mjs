import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  AGENT_NAMES,
  CURSOR_AGENT_MODELS,
  convertAgent,
  convertCommand,
  generateCursorFiles,
  checkCursorSync
} from "../scripts/sync-cursor.mjs";
import { checkCursorInstall, checkCursorSync as doctorCheckCursorSync } from "../scripts/doctor.mjs";
import { installCursor } from "../scripts/install-cursor.mjs";

const PI_ONLY_KEYS = [
  "advertise",
  "aliases",
  "tools",
  "thinking",
  "systemPromptMode",
  "inheritProjectContext",
  "inheritGlobalContext",
  "inheritSkills",
  "skills",
  "defaultContext",
  "async",
  "acceptanceRole",
  "completionGuard",
  "timeoutMs"
];

function parseFrontmatter(text, file) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${file} must have YAML frontmatter`);
  const map = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return map;
}

test("cursor agents are generated and in sync", async () => {
  const res = await checkCursorSync({ root: "." });
  assert.equal(res.inSync, true, `cursor files drifted: ${res.mismatches.join(", ")}`);

  const files = (await readdir(".cursor/agents")).sort();
  assert.deepEqual(files, [...AGENT_NAMES].sort().map((n) => `${n}.md`));
});

test("cursor agent frontmatter follows Cursor subagent schema", async () => {
  for (const name of AGENT_NAMES) {
    const file = `.cursor/agents/${name}.md`;
    const body = await readFile(file, "utf8");
    const meta = parseFrontmatter(body, file);
    assert.equal(meta.name, name, `${file} name must match filename`);
    assert.ok(meta.description && meta.description.length > 0, `${file} must have a description`);
    assert.equal(
      meta.model,
      CURSOR_AGENT_MODELS[name],
      `${file} must use the packaged default model ${CURSOR_AGENT_MODELS[name]}`
    );
    assert.equal(meta.readonly, "false", `${file} must be writable (agents write artifacts)`);
    assert.equal(meta.is_background, "true", `${file} must run in background like Pi async agents`);
    for (const key of PI_ONLY_KEYS) {
      assert.ok(!(key in meta), `${file} must not keep Pi-only frontmatter key ${key}`);
    }
    assert.doesNotMatch(body, /contact_supervisor/, `${file} must not reference Pi-only tools`);
  }
});

test("cursor agent bodies stay aligned with Pi sources", async () => {
  for (const name of AGENT_NAMES) {
    const source = await readFile(`agents/${name}.md`, "utf8");
    const generated = await readFile(`.cursor/agents/${name}.md`, "utf8");
    const sourceBody = source.slice(source.indexOf("---", 3)).replace(/^---\n/, "").trim();
    assert.ok(
      generated.includes(sourceBody.split("\n")[2].trim()),
      `.cursor/agents/${name}.md must contain the Pi source body`
    );
    assert.match(generated, /## Cursor에서 호출하기/, `${name} must include the Cursor invocation note`);
  }
});

test("cursor commands mirror every Pi prompt without frontmatter", async () => {
  const prompts = (await readdir("prompts")).filter((f) => f.endsWith(".md")).sort();
  const commands = (await readdir(".cursor/commands")).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(commands, prompts);

  for (const file of commands) {
    const body = await readFile(join(".cursor/commands", file), "utf8");
    const name = file.replace(/\.md$/, "");
    assert.ok(body.startsWith(`# /${name}\n`), `${file} must start with the slash command title`);
    assert.ok(!body.startsWith("---\n"), `${file} must not have YAML frontmatter (Cursor commands are plain markdown)`);
    assert.doesNotMatch(body, /\$\{@:-/, `${file} must not keep Pi argument templates`);
    assert.doesNotMatch(body, /Pi 세션이다/, `${file} must not claim to be a Pi session`);
    // 푸터(## Cursor 메모)는 Pi 호출과의 대응 설명이라 제외하고 본문만 검사한다.
    const main = body.split("## Cursor 메모")[0];
    assert.doesNotMatch(main, /`subagent`/, `${file} must use Task tool wording instead of Pi subagent calls`);
  }
});

test("convert functions stay pure and deterministic", async () => {
  const source = await readFile("agents/worker.md", "utf8");
  assert.equal(convertAgent("worker", source), convertAgent("worker", source));
  assert.match(convertAgent("worker", source), /^model: composer-2\.5$/m);
  const planner = await readFile("agents/planner.md", "utf8");
  assert.match(convertAgent("planner", planner), /^model: claude-opus-5-thinking-high$/m);
  const prompt = await readFile("prompts/matt-pocock-atomic-plan.md", "utf8");
  assert.equal(
    convertCommand("matt-pocock-atomic-plan", prompt),
    convertCommand("matt-pocock-atomic-plan", prompt)
  );
  const mem = await generateCursorFiles({ root: ".", write: false });
  assert.equal(Object.keys(mem.agents).length, 6);
  assert.equal(Object.keys(mem.commands).length, 12);
  assert.deepEqual(mem.written, []);
});

test("installer copies skills, agents, and commands into a target project", async () => {
  const target = await mkdtemp(join(tmpdir(), "cursor-install-"));
  try {
    const res = await installCursor({ root: ".", target, force: false });
    assert.ok(res.copied.length > 0, "installer must copy files");

    const { stat } = await import("node:fs/promises");
    for (const skill of ["matt-pocock-atomic-workflow", "tdd", "code-review", "grilling"]) {
      const st = await stat(join(target, ".agents", "skills", skill, "SKILL.md"));
      assert.ok(st.isFile(), `skill ${skill} must be installed`);
    }
    for (const name of AGENT_NAMES) {
      const st = await stat(join(target, ".cursor", "agents", `${name}.md`));
      assert.ok(st.isFile(), `agent ${name} must be installed`);
    }
    const installedCommands = await readdir(join(target, ".cursor", "commands"));
    assert.equal(installedCommands.length, 12);

    const bundledStatus = join(
      target,
      ".agents",
      "skills",
      "matt-pocock-atomic-workflow",
      "scripts",
      "work-status.mjs"
    );
    assert.ok(existsSync(bundledStatus), "installer must bundle work-status.mjs in workflow skill");
    const rootStatus = await readFile("scripts/work-status.mjs", "utf8");
    const installedStatus = await readFile(bundledStatus, "utf8");
    assert.equal(installedStatus, rootStatus, "bundled work-status.mjs must match scripts/work-status.mjs");

    const second = await installCursor({ root: ".", target, force: false });
    assert.ok(second.skipped.length > 0, "second install must skip existing files");
    assert.equal(second.copied.length, 0);

    const withModel = await installCursor({
      root: ".",
      target,
      force: true,
      setModel: { worker: "composer-2.5[]" }
    });
    assert.ok(withModel.copied.length > 0);
    const worker = await readFile(join(target, ".cursor", "agents", "worker.md"), "utf8");
    assert.match(worker, /^model: composer-2\.5\[\]$/m, "set-model must rewrite the agent model");
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test("doctor reports cursor sync and install state", async () => {
  const sync = await doctorCheckCursorSync({ cwd: "." });
  assert.equal(sync.inSync, true, `doctor must see cursor files in sync: ${sync.mismatches.join(", ")}`);

  const install = await checkCursorInstall({ cwd: "." });
  assert.equal(install.agentsInstalled, 5, "this repo must have all 5 cursor agents");
  assert.equal(install.commandsInstalled, 12, "this repo must have all 12 cursor commands");
});
