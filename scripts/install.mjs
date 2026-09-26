#!/usr/bin/env node
// 프로젝트에 워크플로를 하네스별로 설치한다.
//
//   node scripts/install.mjs --harness cursor,opencode --target <프로젝트> [--force]
//                            [--set-model worker=composer-2.5] [--skills-dir <경로>]
//                            [--no-skills] [--no-agents] [--no-commands]
//
// 하네스별 복사 내용 (스킬은 커맨드 스킬 포함 skills/* 전체):
//   cursor    skills -> .agents/skills,  .cursor/agents
//   opencode  skills -> .agents/skills,  .opencode/agents, .opencode/commands
//   claude    skills -> .claude/skills,  .claude/agents
//   codex     skills -> .agents/skills
//
// Pi는 `pi install`로 패키지를 설치한다. 이미 있으면 건너뛰고 --force 일 때만 덮어쓴다.
import { readFile, writeFile, mkdir, readdir, stat, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const HARNESSES = {
  cursor: { skillsDir: ".agents/skills", agentsDir: ".cursor/agents", commandsDir: null },
  opencode: { skillsDir: ".agents/skills", agentsDir: ".opencode/agents", commandsDir: ".opencode/commands" },
  claude: { skillsDir: ".claude/skills", agentsDir: ".claude/agents", commandsDir: null },
  codex: { skillsDir: ".agents/skills", agentsDir: null, commandsDir: null }
};

export const LEGACY_CURSOR_COMMANDS_DIR = ".cursor/commands";

export function parseInstallArgs(args) {
  const opts = {
    harnesses: ["cursor"],
    target: process.cwd(),
    skillsDir: null,
    force: false,
    setModel: {},
    components: { skills: true, agents: true, commands: true }
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--harness" && args[i + 1]) {
      opts.harnesses = args[++i].split(",").map((h) => h.trim()).filter(Boolean);
      for (const h of opts.harnesses) {
        if (!HARNESSES[h]) {
          throw new Error(`알 수 없는 하네스: ${h} (가능: ${Object.keys(HARNESSES).join(", ")})`);
        }
      }
    } else if (a === "--target" && args[i + 1]) opts.target = resolve(args[++i]);
    else if (a === "--skills-dir" && args[i + 1]) opts.skillsDir = args[++i];
    else if (a === "--force") opts.force = true;
    else if (a === "--no-skills") opts.components.skills = false;
    else if (a === "--no-agents") opts.components.agents = false;
    else if (a === "--no-commands") opts.components.commands = false;
    else if (a === "--set-model" && args[i + 1]) {
      const pair = args[++i];
      const eq = pair.indexOf("=");
      if (eq === -1) throw new Error(`--set-model 형식은 <agent>=<model> (입력: ${pair})`);
      opts.setModel[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return opts;
}

export function applyModelOverride(content, model) {
  if (/^model:\s*.*$/m.test(content)) {
    return content.replace(/^model:\s*.*$/m, `model: ${model}`);
  }
  return content.replace(/^---\r?\n/, `---\nmodel: ${model}\n`);
}

async function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
}

/** 대상 프로젝트에 남은 레거시 Cursor 커맨드(같은 이름의 스킬과 슬래시 메뉴에서 겹친다). */
export async function findLegacyCursorCommands(target) {
  return (await listMarkdown(join(target, LEGACY_CURSOR_COMMANDS_DIR)))
    .filter((f) => f.startsWith("matt-pocock-atomic-"))
    .map((f) => join(target, LEGACY_CURSOR_COMMANDS_DIR, f));
}

async function installSkills(root, target, skillsDir, force, record) {
  const srcSkills = join(root, "skills");
  for (const entry of (await readdir(srcSkills)).sort()) {
    const src = join(srcSkills, entry);
    const st = await stat(src).catch(() => null);
    if (!st || !st.isDirectory()) continue;
    const dest = join(target, skillsDir, entry);
    const existed = existsSync(dest);
    if (existed && !force) {
      record.skipped.push(dest + "/");
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true, force });
    record[existed ? "overwritten" : "copied"].push(dest + "/");
  }
}

async function installFiles(root, target, relDir, force, setModel, record) {
  const srcDir = join(root, relDir);
  const files = await listMarkdown(srcDir);
  if (files.length === 0) {
    throw new Error(`${relDir}/ 가 비어 있습니다. 먼저 'node scripts/sync-harness.mjs' 를 실행하세요.`);
  }
  for (const file of files) {
    let content = await readFile(join(srcDir, file), "utf8");
    const name = file.replace(/\.md$/, "");
    if (setModel && setModel[name]) content = applyModelOverride(content, setModel[name]);
    const dest = join(target, relDir, file);
    const existed = existsSync(dest);
    if (existed && !force) {
      record.skipped.push(dest);
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content, "utf8");
    record[existed ? "overwritten" : "copied"].push(dest);
  }
}

export async function install(options = {}) {
  const root = options.root || resolve(here, "..");
  const target = resolve(options.target || process.cwd());
  const harnesses = options.harnesses || ["cursor"];
  const force = !!options.force;
  const setModel = options.setModel || {};
  const components = options.components || { skills: true, agents: true, commands: true };
  const record = { copied: [], overwritten: [], skipped: [] };

  const skillsDirs = new Set();
  for (const h of harnesses) {
    const spec = HARNESSES[h];
    if (!spec) throw new Error(`알 수 없는 하네스: ${h}`);
    skillsDirs.add(options.skillsDir || spec.skillsDir);
  }

  if (components.skills) {
    for (const dir of skillsDirs) await installSkills(root, target, dir, force, record);
  }
  for (const h of harnesses) {
    const spec = HARNESSES[h];
    if (components.agents && spec.agentsDir) {
      await installFiles(root, target, spec.agentsDir, force, setModel, record);
    }
    if (components.commands && spec.commandsDir) {
      await installFiles(root, target, spec.commandsDir, force, null, record);
    }
  }

  const legacy = harnesses.includes("cursor") ? await findLegacyCursorCommands(target) : [];
  return { target, harnesses, skillsDirs: [...skillsDirs], legacy, ...record };
}

if (process.argv[1] && process.argv[1].endsWith("install.mjs")) {
  let opts;
  try {
    opts = parseInstallArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  install({ ...opts, root: resolve(here, "..") })
    .then((res) => {
      console.log(`설치 대상: ${res.target} (하네스: ${res.harnesses.join(", ")})`);
      console.log(`  스킬 위치: ${res.skillsDirs.join(", ")}`);
      for (const f of res.copied) console.log(`  + ${f}`);
      for (const f of res.overwritten) console.log(`  ~ ${f}`);
      for (const f of res.skipped) console.log(`  = 유지(있음): ${f}`);
      if (res.legacy.length) {
        console.log("\n레거시 Cursor 커맨드가 남아 있습니다. 같은 이름의 스킬과 슬래시 메뉴에서 겹치므로 지우세요:");
        for (const f of res.legacy) console.log(`  rm ${f}`);
      }
      console.log("\n설치 완료. 커맨드: Cursor·Claude Code `/matt-pocock-atomic-plan`, OpenCode `/matt-pocock-atomic-plan`, Codex `$matt-pocock-atomic-plan`.");
      console.log("단계별 모델은 각 하네스 에이전트 파일의 `model`로 지정합니다.");
    })
    .catch((err) => {
      console.error("설치 실패:", err.message);
      process.exit(1);
    });
}
