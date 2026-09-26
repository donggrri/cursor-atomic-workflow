import assert from "node:assert/strict";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runDone } from "../scripts/run-done.mjs";

const requiredSkills = [
  "codebase-design",
  "domain-modeling",
  "grilling",
  "wayfinder",
  "to-tickets",
  "tdd",
  "code-review"
];

const workflowAgents = {
  explorer: ["matt-pocock-atomic-workflow"],
  planner: ["matt-pocock-atomic-workflow", "codebase-design", "domain-modeling", "grilling", "wayfinder"],
  tasker: ["matt-pocock-atomic-workflow", "to-tickets"],
  worker: ["matt-pocock-atomic-workflow", "tdd"],
  reviewer: ["matt-pocock-atomic-workflow", "code-review"],
  tester: ["matt-pocock-atomic-workflow", "tdd", "codebase-design"],
  "cli-delegate": ["matt-pocock-atomic-workflow"]
};

const oldAgentIds = ["g-explorer", "g-planner", "g-tasker", "g-worker", "g-reviewer"];

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

async function walkFiles(dir, files = []) {
  for (const name of await readdir(dir)) {
    if (name === ".git" || name === "node_modules" || name === "tests") continue;
    const path = join(dir, name);
    const stats = await stat(path);
    if (stats.isDirectory()) {
      await walkFiles(path, files);
    } else if (/\.(md|json|mjs|js|ps1)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function isAllowedOldAgentMention(line) {
  return /g-\*\.md/.test(line)
    || /still use `g-/.test(line)
    || /기존 설정에 `g-/.test(line);
}

test("package.json includes skills directory", async () => {
  const pkgStr = await readFile("package.json", "utf8");
  const pkg = JSON.parse(pkgStr);
  assert.ok(pkg.pi && pkg.pi.skills && pkg.pi.skills.includes("./skills"), "package.json must declare pi.skills array containing './skills'");
  assert.deepEqual(pkg.pi.subagents, { agents: ["./agents"] });
});

test("package.json meets public publish metadata contract", async () => {
  const pkgStr = await readFile("package.json", "utf8");
  const pkg = JSON.parse(pkgStr);
  const expectedKeywords = [
    "pi-package",
    "pi",
    "pi-coding-agent",
    "workflow",
    "atomic-workflow",
    "skills",
    "agents"
  ];
  const expectedFiles = [
    "agents/",
    "prompts/",
    "skills/",
    "scripts/",
    ".cursor/",
    "settings.example.json",
    "README.md",
    "README.kr.md",
    "THIRD_PARTY_LICENSES/",
    "LICENSE"
  ];

  assert.equal(pkg.name, "matt-pocock-atomic-workflow");
  assert.equal(pkg.version, "0.1.0");
  assert.ok(!Object.hasOwn(pkg, "private"), "package.json must not declare private");
  assert.equal(typeof pkg.description, "string");
  assert.ok(pkg.description.trim().length > 0, "description must be non-empty");
  assert.equal(pkg.license, "MIT");
  assert.deepEqual(pkg.repository, {
    type: "git",
    url: "git+https://github.com/donggrri/matt-pocock-atomic-workflow.git"
  });
  assert.equal(pkg.homepage, "https://github.com/donggrri/matt-pocock-atomic-workflow#readme");
  assert.equal(pkg.bugs?.url, "https://github.com/donggrri/matt-pocock-atomic-workflow/issues");
  for (const keyword of expectedKeywords) {
    assert.ok(pkg.keywords?.includes(keyword), `keywords must include ${keyword}`);
  }
  assert.deepEqual(pkg.files, expectedFiles);
  assert.deepEqual(pkg.pi?.skills, ["./skills"]);
  assert.deepEqual(pkg.pi?.prompts, ["./prompts"]);
  assert.deepEqual(pkg.pi?.subagents, { agents: ["./agents"] });

  const licenseStats = await stat("LICENSE").catch(() => null);
  assert.ok(licenseStats && licenseStats.isFile(), "root LICENSE file must exist");
});

test("bundled skills are present", async () => {
  for (const skill of requiredSkills) {
    const stats = await stat(join("skills", skill, "SKILL.md")).catch(() => null);
    assert.ok(stats && stats.isFile(), `skill ${skill} must exist in skills directory`);
  }
});

test("planning preflight is defined in prompts", async () => {
  const plan = await readFile("prompts/matt-pocock-atomic-plan.md", "utf8");
  assert.match(plan, /grilling/, "matt-pocock-atomic-plan.md must reference grilling");
  assert.match(plan, /wayfinder/, "matt-pocock-atomic-plan.md must reference wayfinder");
  assert.doesNotMatch(plan, /way-finder/, "matt-pocock-atomic-plan.md must not reference old way-finder typo");
});

test("artifact writers use slug folders under .docs and harness docs", async () => {
  const files = [
    "skills/matt-pocock-atomic-workflow/SKILL.md",
    "agents/explorer.md",
    "agents/planner.md",
    "prompts/matt-pocock-atomic-explore.md",
    "prompts/matt-pocock-atomic-plan.md",
    "prompts/matt-pocock-atomic-status.md"
  ];
  for (const file of files) {
    const body = await readFile(file, "utf8");
    assert.match(body, /\.docs\/<slug>\//, `${file} must mention .docs/<slug>/`);
    assert.match(body, /docs\/<slug>\//, `${file} must mention docs/<slug>/`);
    assert.doesNotMatch(
      body,
      /워크스페이스 루트에 `(?:PLAN|EXPLORE)-<slug>\.md`/,
      `${file} must not tell agents to write PLAN/EXPLORE at workspace root`
    );
    assert.doesNotMatch(
      body,
      /Write `(?:PLAN|EXPLORE)-<slug>\.md` in the current workspace root/,
      `${file} must not tell agents to write PLAN/EXPLORE at workspace root`
    );
  }
});

test("workflow agents are registered without g- prefix", async () => {
  const files = (await readdir("agents")).sort();
  assert.deepEqual(files, Object.keys(workflowAgents).map((name) => `${name}.md`).sort());

  for (const [name, skills] of Object.entries(workflowAgents)) {
    const file = `agents/${name}.md`;
    const body = await readFile(file, "utf8");
    const meta = parseFrontmatter(body, file);
    assert.equal(meta.name, name, `${file} name must match filename`);
    assert.equal(meta.advertise, "true", `${file} must be advertised`);
    assert.equal(meta.async, "true", `${file} must run async`);
    assert.ok(!("model" in meta), `${file} must not pin a model in frontmatter`);
    assert.match(meta.tools, /read/, `${file} must have tools`);
    const listed = (meta.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const skill of skills) {
      assert.ok(listed.includes(skill), `${name} must list skill ${skill}`);
    }
    assert.doesNotMatch(body, /^name: g-/m, `${file} must not use a g- name`);
    assert.doesNotMatch(meta.aliases || "", /\bg-/, `${file} aliases must not keep g- prefix`);
  }
});

test("planner contract uses correct skills", async () => {
  const planner = await readFile("agents/planner.md", "utf8");
  assert.match(planner, /skills:.*grilling/, "planner must use grilling");
  assert.match(planner, /skills:.*wayfinder/, "planner must use wayfinder");
  assert.doesNotMatch(planner, /grill-me/, "planner must not rely on grill-me directly");
  assert.match(planner, /brief/, "planner must require planning refinement brief");
});

test("prompts spawn the renamed agents", async () => {
  const prompts = {
    "prompts/matt-pocock-atomic-explore.md": ["explorer"],
    "prompts/matt-pocock-atomic-plan.md": ["planner", "tasker", "worker", "reviewer"],
    "prompts/matt-pocock-atomic-task.md": ["tasker"],
    "prompts/matt-pocock-atomic-execute.md": ["worker", "reviewer"],
    "prompts/matt-pocock-atomic-review.md": ["reviewer"],
    "prompts/matt-pocock-atomic-delegate.md": ["worker"]
  };
  for (const [file, agents] of Object.entries(prompts)) {
    const body = await readFile(file, "utf8");
    for (const agent of agents) {
      assert.match(body, new RegExp(`\\b${agent}\\b`), `${file} must spawn ${agent}`);
    }
    for (const oldId of oldAgentIds) {
      assert.doesNotMatch(body, new RegExp(`\\b${oldId}\\b`), `${file} must not spawn ${oldId}`);
    }
  }
});

test("settings example keys are unique and match agents", async () => {
  const raw = await readFile("settings.example.json", "utf8");
  const parsed = JSON.parse(raw);
  const keys = Object.keys(parsed.subagents.agentOverrides);
  assert.equal(new Set(keys).size, keys.length, "agentOverrides must not contain duplicate names");
  for (const name of Object.keys(workflowAgents)) {
    assert.ok(keys.includes(name), `settings.example.json must include ${name}`);
    assert.ok(!keys.includes(`g-${name}`), `settings.example.json must not keep g-${name}`);
    const entry = parsed.subagents.agentOverrides[name];
    assert.ok(entry.model && !String(entry.model).startsWith("YOUR_"), `${name} must have a real default model`);
    assert.ok(Array.isArray(entry.fallbackModels), `${name} must list fallbackModels`);
  }
  assert.doesNotMatch(raw, /YOUR_/, "settings.example.json must not keep YOUR_* placeholders");
  assert.equal(parsed.subagents.agentOverrides.explorer.model, "xai/grok-4.6");
  assert.equal(parsed.subagents.agentOverrides.planner.model, "antigravity/claude-sonnet-4-6");
  assert.equal(parsed.subagents.agentOverrides.worker.model, "cursor/composer-2.5");
  assert.equal(parsed.subagents.agentOverrides.reviewer.model, "antigravity/claude-sonnet-4-6");
});

test("documentation matches bundled behavior", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.doesNotMatch(readme, /npx skills add mattpocock/, "README must not instruct to run npx skills add in installation instructions (except as historical context)");
  assert.match(readme, /THIRD_PARTY_LICENSES/, "README must mention THIRD_PARTY_LICENSES");
});

test("workflow prompts use package-prefixed slash command names", async () => {
  const prompts = (await readdir("prompts")).sort();
  assert.deepEqual(prompts, [
    "matt-pocock-atomic-config.md",
    "matt-pocock-atomic-delegate.md",
    "matt-pocock-atomic-doctor.md",
    "matt-pocock-atomic-execute.md",
    "matt-pocock-atomic-explore.md",
    "matt-pocock-atomic-models.md",
    "matt-pocock-atomic-plan.md",
    "matt-pocock-atomic-review.md",
    "matt-pocock-atomic-settings.md",
    "matt-pocock-atomic-status.md",
    "matt-pocock-atomic-task.md",
    "matt-pocock-atomic-wrapup.md"
  ]);
});

test("bundled skills have valid frontmatter without unquoted colon mapping errors", async () => {
  const { validateSkillFrontmatter } = await import("../scripts/doctor.mjs");
  for (const skill of requiredSkills) {
    const file = join("skills", skill, "SKILL.md");
    const content = await readFile(file, "utf8");
    const result = validateSkillFrontmatter(content, file);
    assert.equal(result.valid, true, `${file} must not have YAML parse risks: ${JSON.stringify(result.issues)}`);
  }
});

test("doctor module correctly detects and fixes unquoted description syntax", async () => {
  const { validateSkillFrontmatter } = await import("../scripts/doctor.mjs");
  const badContent = `---\nname: test-skill\ndescription: Some text. After tag: details here\n---\n# Body`;
  const badResult = validateSkillFrontmatter(badContent, "test.md");
  assert.equal(badResult.valid, false, "Should detect unquoted colon in description");
  assert.equal(badResult.issues.length, 1);
  assert.equal(badResult.issues[0].suggestedFix, 'description: "Some text. After tag: details here"');

  const goodContent = `---\nname: test-skill\ndescription: "Some text. After tag: details here"\n---\n# Body`;
  const goodResult = validateSkillFrontmatter(goodContent, "test.md");
  assert.equal(goodResult.valid, true, "Should accept quoted description");
});

test("old g- agent ids remain only as migration/cleanup notes", async () => {
  const files = await walkFiles(".");
  const leftover = [];
  for (const file of files) {
    const body = await readFile(file, "utf8");
    for (const [i, line] of body.split("\n").entries()) {
      if (!oldAgentIds.some((id) => line.includes(id))) continue;
      if (isAllowedOldAgentMention(line)) continue;
      leftover.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  }
  assert.deepEqual(leftover, [], leftover.join("\n"));
});

test("run-done returns ok:true for successful command", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "test-run-done-"));
  try {
    const result = await runDone({
      cwd: tmpDir,
      command: "echo hello",
      logPath: join(tmpDir, "output.log"),
      timeoutMs: 5000,
    });
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    const summary = JSON.parse(await readFile(`${result.outputPath}`, "utf8"));
    assert.equal(summary.ok, true);
    assert.equal(summary.exitCode, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-done returns ok:false for failing command", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "test-run-done-"));
  try {
    const result = await runDone({
      cwd: tmpDir,
      command: "exit 1",
      logPath: join(tmpDir, "output.log"),
      timeoutMs: 5000,
    });
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 1);
    const summary = JSON.parse(await readFile(`${result.outputPath}`, "utf8"));
    assert.equal(summary.ok, false);
    assert.equal(summary.exitCode, 1);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-done handles timeout with ok:false and exitCode -1", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "test-run-done-"));
  try {
    const result = await runDone({
      cwd: tmpDir,
      command: "sleep 10",
      logPath: join(tmpDir, "output.log"),
      timeoutMs: 50,
    });
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, -1);
    const summary = JSON.parse(await readFile(`${result.outputPath}`, "utf8"));
    assert.equal(summary.ok, false);
    assert.equal(summary.exitCode, -1);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-done creates .done.json at logPath", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "test-run-done-"));
  try {
    const logPath = join(tmpDir, "build.log");
    await runDone({
      cwd: tmpDir,
      command: "echo test",
      logPath,
      timeoutMs: 5000,
    });
    const donePath = `${logPath}.done.json`;
    const exists = statSync(donePath).isFile();
    assert.ok(exists, ".done.json should exist");
    const content = await readFile(logPath, "utf8");
    assert.ok(content.includes("test"), "logPath should contain command output");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-done extracts errorTail of last 20 lines on command failure", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "test-run-done-"));
  try {
    const logPath = join(tmpDir, "output.log");
    const result = await runDone({
      cwd: tmpDir,
      command: `node -e "for (let i = 1; i <= 25; i++) console.log('line ' + i); process.exit(1);"`,
      logPath,
      timeoutMs: 5000,
    });
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 1);
    assert.ok(typeof result.errorTail === "string", "result.errorTail must be a string");
    const tailLines = result.errorTail.trim().split("\n");
    assert.equal(tailLines.length, 20);
    assert.equal(tailLines[0].trim(), "line 6");
    assert.equal(tailLines[tailLines.length - 1].trim(), "line 25");

    const summary = JSON.parse(await readFile(`${result.outputPath}`, "utf8"));
    assert.equal(summary.errorTail, result.errorTail);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-done extracts errorTail on command timeout", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "test-run-done-"));
  try {
    const logPath = join(tmpDir, "output.log");
    const result = await runDone({
      cwd: tmpDir,
      command: `node -e "console.log('timeout log line'); setTimeout(() => {}, 5000);"`,
      logPath,
      timeoutMs: 100,
    });
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, -1);
    assert.ok(typeof result.errorTail === "string", "result.errorTail must be a string");
    assert.ok(result.errorTail.includes("timeout log line"));

    const summary = JSON.parse(await readFile(`${result.outputPath}`, "utf8"));
    assert.equal(summary.errorTail, result.errorTail);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("pipeline recovery CONTEXT glossary", async () => {
  const context = await readFile("skills/matt-pocock-atomic-workflow/CONTEXT.md", "utf8");

  // 리뷰 재작업
  assert.match(context, /## 리뷰 재작업/, "CONTEXT.md must have section '## 리뷰 재작업'");
  assert.match(context, /REVIEW 결함을 열린 TASKS로 되돌리거나 새 항목을 붙인 뒤/, "CONTEXT.md must specify review defect task handling");
  assert.match(context, /worker→reviewer를 최대 1회 자동 재실행/, "CONTEXT.md must specify worker→reviewer retry limit (max 1)");
  assert.match(context, /한 바퀴 후에도 결함이면 멈추고 보고/, "CONTEXT.md must specify stop and report if defect persists after 1 retry");

  // 막힘 재개
  assert.match(context, /## 막힘 재개/, "CONTEXT.md must have section '## 막힘 재개'");
  assert.match(context, /실패한 항목만 재시도/, "CONTEXT.md must specify retrying only failed items");
  assert.match(context, /이미 \[x\]는 유지/, "CONTEXT.md must specify keeping already checked items");
  assert.match(context, /재시도 시작 때 그 항목의 `막힘:`만 지운다/, "CONTEXT.md must specify clearing 막힘: before retry");
  assert.match(context, /입구는 `?\/matt-pocock-atomic-execute`?/, "CONTEXT.md must specify entrypoint as /matt-pocock-atomic-execute");

  // 사람 게이트
  assert.match(context, /## 사람 게이트/, "CONTEXT.md must have section '## 사람 게이트'");
  assert.match(context, /PLAN\(Phase 1\)만/, "CONTEXT.md must specify human gate is PLAN(Phase 1) only");
  assert.match(context, /리뷰 재작업 1회·막힘 재개는 정책으로 자동/, "CONTEXT.md must specify review rework and retry are automated by policy");

  // 용어 요약 테이블 검증
  assert.match(context, /\|\s*리뷰 재작업\s*\|/, "CONTEXT.md summary table must contain 리뷰 재작업");
  assert.match(context, /\|\s*막힘 재개\s*\|/, "CONTEXT.md summary table must contain 막힘 재개");
  assert.match(context, /\|\s*사람 게이트\s*\|/, "CONTEXT.md summary table must contain 사람 게이트");
});

test("pipeline recovery reference bash", async () => {
  const reference = await readFile("skills/matt-pocock-atomic-workflow/reference.md", "utf8");

  // Cursor / PowerShell 블록 유지 및 분리 라벨
  assert.match(reference, /Cursor.*PowerShell/i, "reference.md must separate and label Cursor/PowerShell");
  assert.match(reference, /\$repoRoot = git rev-parse --show-toplevel/, "reference.md must retain PowerShell worktree snippet");
  assert.match(reference, /Get-Date -Format "yyyy-MM-dd"/, "reference.md must retain PowerShell evidence snippet");

  // Pi bash 워크트리 스니펫
  assert.match(reference, /Pi.*(?:bash)/i, "reference.md must have Pi (bash) section");
  assert.match(reference, /git rev-parse --show-toplevel/, "reference.md Pi bash must use git rev-parse");
  assert.match(reference, /\.\.\/\$repoName-\$slug/, "reference.md Pi bash must use ../$repoName-$slug");
  assert.match(reference, /feat\/\$slug/, "reference.md Pi bash must use feat/$slug");
  assert.match(reference, /이미 있으면.*재사용/, "reference.md Pi bash must state reusing worktree if already exists");

  // Pi bash 증거 아카이브
  assert.match(reference, /date \+%Y-%m-%d/, "reference.md Pi bash must use date +%Y-%m-%d");
  assert.match(reference, /\$HOME\/\.matt-pocock-workflow\/evidence\/|\$HOME\/\.pi\/agent\/matt-pocock-atomic-workflow\/evidence\//, "reference.md Pi bash must archive to evidence directory");
  assert.match(reference, /\.docs\/<slug>/, "reference.md Pi bash must mention .docs/<slug>");
  assert.match(reference, /원본은.*남긴다/, "reference.md Pi bash must state original is kept");
});

test("pipeline recovery SKILL orchestration", async () => {
  const skill = await readFile("skills/matt-pocock-atomic-workflow/SKILL.md", "utf8");

  // 사람 게이트 불변
  assert.match(skill, /사람 게이트는.*PLAN.*Phase 1.*만|사람 게이트는 \*\*PLAN뿐\*\*이다/, "SKILL.md must state human gate is PLAN(Phase 1) only");
  assert.match(skill, /리뷰 재작업 1회·막힘 재개는 정책으로 자동/, "SKILL.md must state review rework and block resume are automated by policy");

  // 리뷰 재작업
  assert.match(skill, /REVIEW 결함을 열린 TASKS로 되돌리거나 새 항목을 붙인 뒤/, "SKILL.md must specify resetting or appending task on review defect");
  assert.match(skill, /worker\s*→\s*reviewer를 한 번만 자동 재실행/, "SKILL.md must specify running worker->reviewer automatically once");
  assert.match(skill, /한 바퀴 후에도 결함이면 멈추고 보고/, "SKILL.md must specify stopping and reporting if defect persists");

  // 막힘 재개
  assert.match(skill, /실패한 항목만 재시도/, "SKILL.md must specify retrying only failed items");
  assert.match(skill, /이미 \[x\]는 유지/, "SKILL.md must specify keeping already checked items");
  assert.match(skill, /재시도 시작 때 그 항목의 `막힘:`만 지운다/, "SKILL.md must specify clearing 막힘: at start of retry");
  assert.match(skill, /입구는 `?\/matt-pocock-atomic-execute`?/, "SKILL.md must specify entrypoint as /matt-pocock-atomic-execute");

  // Status 다음 커맨드 execute 안내
  assert.match(skill, /막힘.*\/matt-pocock-atomic-execute/, "SKILL.md Status must guide to /matt-pocock-atomic-execute when blocked");

  // 멈추는 경우에 회복 명시
  assert.match(skill, /멈추는 경우:[\s\S]*?막힘 재개[\s\S]*?리뷰 재작업/, "SKILL.md 멈추는 경우 must reference recovery policies");
});

test("pipeline recovery workers and testing", async () => {
  const workers = await readFile("skills/matt-pocock-atomic-workflow/workers.md", "utf8");
  const testing = await readFile("skills/matt-pocock-atomic-workflow/testing.md", "utf8");

  for (const [file, content] of [["workers.md", workers], ["testing.md", testing]]) {
    // 1회 / 한 번
    assert.match(content, /(?:1회|한 번)/, `${file} must mention 1회 or 한 번 for review rework`);
    // 막힘 재개
    assert.match(content, /막힘 재개/, `${file} must mention 막힘 재개`);
    // execute 재입구
    assert.match(content, /\/matt-pocock-atomic-execute/, `${file} must mention /matt-pocock-atomic-execute`);
    // flake retry 없음
    assert.match(content, /flake retry 없음/, `${file} must mention flake retry 없음`);
    // 사람 게이트
    assert.match(content, /사람 게이트.*PLAN.*Phase 1.*만|사람 게이트는.*PLAN.*만/, `${file} must mention human gate is PLAN(Phase 1) only`);
  }
});

test("pipeline recovery prompts", async () => {
  const execute = await readFile("prompts/matt-pocock-atomic-execute.md", "utf8");
  const review = await readFile("prompts/matt-pocock-atomic-review.md", "utf8");
  const status = await readFile("prompts/matt-pocock-atomic-status.md", "utf8");
  const commit = await readFile("prompts/matt-pocock-atomic-wrapup.md", "utf8");

  // execute prompt recovery policy
  assert.match(execute, /막힘 재개/, "execute.md must mention 막힘 재개");
  assert.match(execute, /실패한 항목만 재시도/, "execute.md must specify retrying only failed items");
  assert.match(execute, /이미 \[x\]는 유지/, "execute.md must specify keeping already checked items");
  assert.match(execute, /재시도 시작 때 그 항목의 `?막힘:`?만 지운다/, "execute.md must specify clearing 막힘: at start of retry");
  assert.match(execute, /\/matt-pocock-atomic-execute/, "execute.md must mention entrypoint /matt-pocock-atomic-execute");
  assert.match(execute, /사람 게이트.*PLAN.*Phase 1.*만|사람 게이트는.*PLAN.*만/, "execute.md must state human gate is PLAN(Phase 1) only");
  assert.match(execute, /막힘 재개는 정책으로 자동/, "execute.md must state block resume is automated by policy");

  // review prompt recovery policy
  assert.match(review, /리뷰 재작업/, "review.md must mention 리뷰 재작업");
  assert.match(review, /REVIEW 결함/, "review.md must mention REVIEW 결함");
  assert.match(review, /worker\s*→\s*reviewer를 (?:1회|한 번만) 자동 재실행/, "review.md must specify running worker->reviewer automatically once (1회/한 번만)");
  assert.match(review, /한 바퀴 후에도 결함이면 멈추고 보고/, "review.md must specify stopping and reporting if defect persists");
  assert.match(review, /flake retry 없음/, "review.md must specify no flake retry");
  assert.match(review, /사람 게이트.*PLAN.*Phase 1.*만|사람 게이트는.*PLAN.*만/, "review.md must state human gate is PLAN(Phase 1) only");

  // status prompt recovery policy and Pi bash paths
  assert.match(status, /막힘.*\/matt-pocock-atomic-execute/, "status.md must guide to /matt-pocock-atomic-execute when blocked");
  assert.match(status, /~\/\.pi\/agent\/matt-pocock-atomic-workflow\/docs\/<slug>\/|\$HOME\/\.pi\/agent\/matt-pocock-atomic-workflow\/docs\/<slug>\//, "status.md must guide Pi bash harness docs path");
  assert.match(status, /~\/\.pi\/agent\/matt-pocock-atomic-workflow\/runs\//, "status.md must guide Pi bash harness runs path");
  assert.match(status, /PowerShell|%USERPROFILE%/, "status.md must retain Cursor PowerShell block/path");

  // commit prompt Pi bash evidence path and Cursor PowerShell
  assert.match(commit, /~\/\.pi\/agent\/matt-pocock-atomic-workflow\/evidence\/|\$HOME\/\.pi\/agent\/matt-pocock-atomic-workflow\/evidence\//, "commit.md must guide Pi bash harness evidence path");
  assert.match(commit, /PowerShell|%USERPROFILE%/, "commit.md must retain Cursor PowerShell block/path");
});

test("pipeline recovery reviewer agent", async () => {
  const reviewer = await readFile("agents/reviewer.md", "utf8");

  // 직접 리뷰어 및 CLI 디스패치 금지
  assert.match(reviewer, /직접 리뷰어/, "reviewer.md must state package reviewer is direct reviewer");
  assert.match(reviewer, /(?:agy|pi|codex).*디스패치하지 말 것|디스패치.*금지/, "reviewer.md must forbid CLI dispatch");
  assert.match(reviewer, /invoke-worker 금지/, "reviewer.md must forbid invoke-worker");

  // Fresh 검증
  assert.match(reviewer, /Fresh 검증/, "reviewer.md must mention Fresh 검증");
  assert.match(reviewer, /작업자 대화 맥락을 상속받지 않는 독립 컨텍스트로 검증/, "reviewer.md must specify verifying in independent context without worker conversation history");

  // 리뷰 재작업 및 결함 1회 / 한 번
  assert.match(reviewer, /리뷰 재작업/, "reviewer.md must mention 리뷰 재작업");
  assert.match(reviewer, /REVIEW 결함을 열린 TASKS로 되돌리거나 새 항목을 붙인 뒤/, "reviewer.md must specify resetting or appending task on review defect");
  assert.match(reviewer, /worker\s*→\s*reviewer를 (?:1회|한 번만) 자동 재실행/, "reviewer.md must specify running worker->reviewer automatically once (1회/한 번만)");
  assert.match(reviewer, /한 바퀴 후에도 결함이면 멈추고 보고/, "reviewer.md must specify stopping and reporting if defect persists");
  assert.match(reviewer, /flake retry 없음/, "reviewer.md must specify no flake retry");

  // 사람 게이트 PLAN-only
  assert.match(reviewer, /사람 게이트.*PLAN.*Phase 1.*만|사람 게이트는.*PLAN.*만/, "reviewer.md must state human gate is PLAN(Phase 1) only");
  assert.match(reviewer, /리뷰 재작업 1회는 정책으로 자동/, "reviewer.md must state review rework is automated by policy");
});





