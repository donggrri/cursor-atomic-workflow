import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir, mkdtemp, rm, mkdir, writeFile, cp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  INVOKE_GUARD,
  OWNED_DIRS,
  checkHarnessSync,
  generateHarnessFiles,
  listAgents,
  listCommandSkills,
  readSource,
  splitFrontmatter
} from "../scripts/sync-harness.mjs";
import { checkHarnessInstall, checkHarnessSync as doctorCheckHarnessSync, validateSkillFrontmatter } from "../scripts/doctor.mjs";
import { install, parseInstallArgs } from "../scripts/install.mjs";

const COMMANDS = [
  "matt-pocock-atomic-config",
  "matt-pocock-atomic-delegate",
  "matt-pocock-atomic-doctor",
  "matt-pocock-atomic-execute",
  "matt-pocock-atomic-explore",
  "matt-pocock-atomic-models",
  "matt-pocock-atomic-plan",
  "matt-pocock-atomic-review",
  "matt-pocock-atomic-settings",
  "matt-pocock-atomic-status",
  "matt-pocock-atomic-task",
  "matt-pocock-atomic-wrapup"
];

const PI_ONLY_KEYS = [
  "advertise",
  "aliases",
  "tools",
  "thinking",
  "systemPromptMode",
  "inheritProjectContext",
  "inheritGlobalContext",
  "inheritSkills",
  "defaultContext",
  "async",
  "acceptanceRole",
  "completionGuard",
  "timeoutMs"
];

const PI_ONLY_WORDING = [/Pi 세션이다/, /`subagent`로/, /`async: true`로/, /\$\{@/];

async function read(rel) {
  return readFile(rel, "utf8");
}

async function frontmatterOf(rel) {
  return readSource(await read(rel), rel).data;
}

test("harness files are generated and in sync with sources", async () => {
  const res = await checkHarnessSync({ root: "." });
  assert.deepEqual(res.mismatches, [], `drifted: ${res.mismatches.join(", ")}`);
  assert.deepEqual(res.stale, [], `stale: ${res.stale.join(", ")}`);
  assert.equal(res.inSync, true);
});

test("every slash command has exactly one command skill as its source", async () => {
  assert.deepEqual(await listCommandSkills("."), COMMANDS);
  const prompts = (await readdir("prompts")).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(prompts, COMMANDS.map((c) => `${c}.md`));
  const opencode = (await readdir(".opencode/commands")).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(opencode, COMMANDS.map((c) => `${c}.md`));
});

test("command skills are user-invoked only and harness neutral", async () => {
  for (const name of COMMANDS) {
    const rel = `skills/${name}/SKILL.md`;
    const text = await read(rel);
    const meta = await frontmatterOf(rel);
    assert.equal(meta.name, name, `${rel} name must match its folder`);
    assert.equal(meta["disable-model-invocation"], "true", `${rel} must set disable-model-invocation: true`);
    assert.ok(meta.description.endsWith(INVOKE_GUARD), `${rel} description must end with the invoke guard`);
    assert.equal(validateSkillFrontmatter(text, rel).valid, true, `${rel} frontmatter must be YAML safe`);
    assert.ok(splitFrontmatter(text).body.includes(`# /${name}`), `${rel} must title the slash command`);
    for (const pattern of PI_ONLY_WORDING) {
      assert.doesNotMatch(text, pattern, `${rel} must not keep Pi-only wording ${pattern}`);
    }
  }
});

test("command skills point at the harness adapter reference", async () => {
  const harness = await read("skills/matt-pocock-atomic-workflow/references/harness.md");
  for (const section of ["## 하네스 판별", "## 서브에이전트 띄우기", "## 커맨드 입력", "## 스크립트 경로"]) {
    assert.ok(harness.includes(section), `harness.md must define ${section}`);
  }
  for (const h of ["Pi", "Cursor", "OpenCode", "Claude Code", "Codex"]) {
    assert.match(harness, new RegExp(`\\| ${h} \\|`), `harness.md must cover ${h}`);
  }
  for (const name of COMMANDS.filter((c) => !["matt-pocock-atomic-settings", "matt-pocock-atomic-doctor"].includes(c))) {
    const body = await read(`skills/${name}/SKILL.md`);
    assert.match(body, /references\/harness\.md/, `${name} must defer harness details to references/harness.md`);
  }
  const workflow = await read("skills/matt-pocock-atomic-workflow/SKILL.md");
  assert.match(workflow, /references\/harness\.md/, "workflow SKILL.md must link references/harness.md");
});

test("Pi and OpenCode shims only forward to the command skill", async () => {
  for (const name of COMMANDS) {
    const skill = await frontmatterOf(`skills/${name}/SKILL.md`);
    const pi = await read(`prompts/${name}.md`);
    const piMeta = await frontmatterOf(`prompts/${name}.md`);
    assert.equal(piMeta.description, skill.description.slice(0, -INVOKE_GUARD.length));
    if (skill.metadata?.["argument-hint"]) {
      assert.equal(piMeta["argument-hint"], skill.metadata["argument-hint"]);
    }
    assert.ok(pi.includes(`\`${name}/SKILL.md\``), `prompts/${name}.md must point at the command skill`);
    assert.ok(pi.includes("${@:-(없음)}"), `prompts/${name}.md must forward Pi arguments`);
    assert.ok(splitFrontmatter(pi).body.split("\n").length <= 4, `prompts/${name}.md must stay a thin shim`);

    const oc = await read(`.opencode/commands/${name}.md`);
    assert.ok(oc.includes(`\`${name}\` 스킬을 로드`), `.opencode/commands/${name}.md must load the skill`);
    assert.ok(oc.includes("$ARGUMENTS"), `.opencode/commands/${name}.md must forward $ARGUMENTS`);
  }
});

test("generated agents keep the Pi body and use each harness schema", async () => {
  const agents = await listAgents(".");
  assert.ok(agents.includes("tester") && agents.includes("cli-delegate"));
  for (const name of agents) {
    const source = readSource(await read(`agents/${name}.md`), `agents/${name}.md`);
    const firstLine = source.body.trim().split("\n")[0];

    const cursor = await frontmatterOf(`.cursor/agents/${name}.md`);
    assert.equal(cursor.name, name);
    assert.equal(cursor.model, "inherit");
    assert.equal(cursor.readonly, "false");
    assert.equal(cursor.is_background, "true");

    const opencode = await frontmatterOf(`.opencode/agents/${name}.md`);
    assert.equal(opencode.mode, "subagent");
    assert.ok(!("name" in opencode), "OpenCode agent name comes from the filename");

    const claude = await frontmatterOf(`.claude/agents/${name}.md`);
    assert.equal(claude.name, name);
    assert.equal(claude.background, "true");
    assert.equal(claude.skills, source.data.skills);

    for (const dir of [".cursor/agents", ".opencode/agents", ".claude/agents"]) {
      const text = await read(`${dir}/${name}.md`);
      const meta = await frontmatterOf(`${dir}/${name}.md`);
      assert.ok(meta.description.startsWith(source.data.description), `${dir}/${name}.md must keep the Pi description`);
      for (const key of PI_ONLY_KEYS) {
        assert.ok(!(key in meta), `${dir}/${name}.md must not keep Pi-only key ${key}`);
      }
      assert.ok(text.includes(firstLine), `${dir}/${name}.md must contain the Pi body`);
      assert.match(text, /references\/harness\.md/, `${dir}/${name}.md must point at the harness reference`);
    }
  }
  const cliOpenCode = await read(".opencode/agents/cli-delegate.md");
  assert.match(cliOpenCode, /permission:\n {2}edit: deny/, "read-only Pi agents must deny edits in OpenCode");
  assert.match(await read(".claude/agents/cli-delegate.md"), /^disallowedTools: Edit, Write$/m);
});

test("bundled workflow scripts match the root scripts", async () => {
  for (const script of ["work-status.mjs", "run-done.mjs"]) {
    assert.equal(
      await read(`skills/matt-pocock-atomic-workflow/scripts/${script}`),
      await read(`scripts/${script}`),
      `${script} copy inside the workflow skill must match scripts/${script}`
    );
  }
});

test("legacy .cursor/commands is gone from the package", async () => {
  assert.equal(existsSync(".cursor/commands"), false, "Cursor invokes command skills directly; .cursor/commands would duplicate them");
});

test("generator is pure, writes nothing in check mode, and prunes stale shims", async () => {
  const a = await generateHarnessFiles({ root: ".", write: false });
  const b = await generateHarnessFiles({ root: ".", write: false });
  assert.deepEqual(a.files, b.files);
  assert.deepEqual(a.written, []);

  const root = await mkdtemp(join(tmpdir(), "harness-sync-"));
  try {
    for (const dir of ["agents", "skills", "scripts"]) await cp(dir, join(root, dir), { recursive: true });
    await mkdir(join(root, "prompts"), { recursive: true });
    await writeFile(join(root, "prompts", "matt-pocock-atomic-gone.md"), "old\n");

    const before = await checkHarnessSync({ root });
    assert.equal(before.inSync, false);
    assert.ok(before.stale.includes("prompts/matt-pocock-atomic-gone.md"));

    const res = await generateHarnessFiles({ root, write: true });
    assert.deepEqual(res.removed, ["prompts/matt-pocock-atomic-gone.md"]);
    assert.equal((await checkHarnessSync({ root })).inSync, true);

    const plan = join(root, "skills", "matt-pocock-atomic-plan", "SKILL.md");
    await writeFile(plan, (await readFile(plan, "utf8")).replace("Phase 1.", "Phase 1 (changed)."));
    const drift = await checkHarnessSync({ root });
    assert.ok(drift.mismatches.includes("prompts/matt-pocock-atomic-plan.md"));
    assert.ok(drift.mismatches.includes(".opencode/commands/matt-pocock-atomic-plan.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  assert.deepEqual(OWNED_DIRS.includes(".cursor/commands"), false);
});

test("installer places skills, agents, and shims per harness", async () => {
  assert.deepEqual(parseInstallArgs(["--harness", "cursor,opencode"]).harnesses, ["cursor", "opencode"]);
  assert.throws(() => parseInstallArgs(["--harness", "nope"]), /알 수 없는 하네스/);

  const target = await mkdtemp(join(tmpdir(), "harness-install-"));
  try {
    await mkdir(join(target, ".cursor", "commands"), { recursive: true });
    await writeFile(join(target, ".cursor", "commands", "matt-pocock-atomic-plan.md"), "# /old\n");

    const res = await install({ root: ".", target, harnesses: ["cursor", "opencode", "claude", "codex"] });
    assert.deepEqual(res.skillsDirs.sort(), [".agents/skills", ".claude/skills"]);
    assert.equal(res.legacy.length, 1, "installer must report legacy .cursor/commands files");

    for (const skillsDir of [".agents/skills", ".claude/skills"]) {
      for (const skill of ["matt-pocock-atomic-workflow", "matt-pocock-atomic-plan", "tdd", "grilling"]) {
        assert.ok(existsSync(join(target, skillsDir, skill, "SKILL.md")), `${skillsDir}/${skill} must be installed`);
      }
      for (const script of ["work-status.mjs", "run-done.mjs"]) {
        assert.ok(
          existsSync(join(target, skillsDir, "matt-pocock-atomic-workflow", "scripts", script)),
          `${script} must ship inside the installed workflow skill`
        );
      }
    }
    const agents = await listAgents(".");
    for (const dir of [".cursor/agents", ".opencode/agents", ".claude/agents"]) {
      const files = (await readdir(join(target, dir))).sort();
      assert.deepEqual(files, agents.map((a) => `${a}.md`), `${dir} must hold every agent`);
    }
    assert.equal((await readdir(join(target, ".opencode", "commands"))).length, COMMANDS.length);
    assert.equal(existsSync(join(target, ".cursor", "skills")), false);

    const doctor = await checkHarnessInstall({ cwd: target, root: "." });
    assert.equal(doctor.skillsInstalled, true);
    assert.equal(doctor.commandSkills.length, COMMANDS.length);
    assert.equal(doctor.harnesses.opencode.commands.found.length, COMMANDS.length);
    assert.deepEqual(doctor.harnesses.claude.agents.missing, []);
    assert.equal(doctor.legacyCursorCommands.length, 1);

    const second = await install({ root: ".", target, harnesses: ["cursor"] });
    assert.equal(second.copied.length, 0, "second install must not copy");
    assert.ok(second.skipped.length > 0, "second install must skip existing files");

    await install({ root: ".", target, harnesses: ["cursor", "opencode"], force: true, setModel: { worker: "composer-2.5[]" } });
    assert.match(await read(join(target, ".cursor/agents/worker.md")), /^model: composer-2\.5\[\]$/m);
    assert.match(await read(join(target, ".opencode/agents/worker.md")), /^model: composer-2\.5\[\]$/m);
    assert.doesNotMatch(await read(join(target, ".opencode/agents/planner.md")), /^model:/m);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test("doctor sees the package repo in sync and skips sync outside it", async () => {
  const sync = await doctorCheckHarnessSync({ cwd: "." });
  assert.equal(sync.inSync, true, `doctor must see harness files in sync: ${sync.mismatches.join(", ")}`);
  const outside = await mkdtemp(join(tmpdir(), "harness-outside-"));
  try {
    const res = await doctorCheckHarnessSync({ cwd: outside });
    assert.equal(res.skipped, true);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
