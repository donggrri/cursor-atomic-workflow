#!/usr/bin/env node
// 하네스별 파일 생성기.
//
// 단일 소스:
//   skills/matt-pocock-atomic-<이름>/SKILL.md  커맨드 로직 (하네스 중립)
//   agents/<에이전트>.md                       에이전트 본문 + Pi frontmatter
//   scripts/{work-status,run-done}.mjs         워크플로 스크립트
//
// 생성물 (직접 고치지 않는다):
//   prompts/<커맨드>.md                  Pi prompt shim
//   .opencode/commands/<커맨드>.md       OpenCode command shim
//   .cursor/agents/<에이전트>.md         Cursor 서브에이전트
//   .opencode/agents/<에이전트>.md       OpenCode 서브에이전트
//   .claude/agents/<에이전트>.md         Claude Code 서브에이전트
//   skills/matt-pocock-atomic-workflow/scripts/<스크립트>  설치 프로젝트용 복사본
//
// Cursor·Claude Code·Codex는 스킬을 슬래시로 직접 호출하므로 커맨드 shim이 없다.
//
//   node scripts/sync-harness.mjs          # 생성/갱신 + 남은 옛 생성물 삭제
//   node scripts/sync-harness.mjs --check  # 드리프트 검사만 (CI용)
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const WORKFLOW_SKILL = "matt-pocock-atomic-workflow";
export const COMMAND_PREFIX = "matt-pocock-atomic-";
export const INVOKE_GUARD = " 사용자가 직접 호출할 때만 쓴다.";
export const BUNDLED_SCRIPTS = ["work-status.mjs", "run-done.mjs"];

// 생성기가 소유하는 디렉터리. 여기 있는 .md 중 생성 목록에 없는 파일은 옛 생성물로 본다.
export const OWNED_DIRS = [
  "prompts",
  ".opencode/commands",
  ".cursor/agents",
  ".opencode/agents",
  ".claude/agents"
];

const AGENT_DESCRIPTION_SUFFIX = {
  explorer: " Use proactively for codebase exploration before planning.",
  planner: " Use after requirements are clarified to write the implementation plan.",
  tasker: " Use after the plan is confirmed to split it into verifiable tasks.",
  worker: " Use to implement one task item at a time.",
  reviewer: " Use after implementation to verify tasks, diff, and tests.",
  tester: " Use to write tests and run mutation checks for logic diffs.",
  "cli-delegate":
    " Use when TASKS worker is agy|pi|opencode|codex|claude to run invoke-worker headlessly."
};

/** frontmatter 블록과 본문을 분리한다. frontmatter가 없으면 null 을 반환한다. */
export function splitFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  return { frontmatter: match[1], body: text.slice(match[0].length) };
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

/**
 * 이 저장소 frontmatter에 필요한 만큼만 읽는 YAML 파서.
 * `key: value`와 한 단계 중첩 매핑(`metadata:` 아래 들여쓴 `sub: value`)을 지원한다.
 */
export function parseFrontmatter(frontmatter) {
  const data = {};
  let parent = null;
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indented = /^\s+/.test(line);
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (indented && parent) {
      data[parent][key] = unquote(value);
      continue;
    }
    if (value === "") {
      data[key] = {};
      parent = key;
    } else {
      data[key] = unquote(value);
      parent = null;
    }
  }
  return data;
}

export function readSource(text, label) {
  const split = splitFrontmatter(text);
  if (!split) throw new Error(`${label} must have YAML frontmatter`);
  return { data: parseFrontmatter(split.frontmatter), body: split.body };
}

/** skills/ 아래 커맨드 스킬 이름 목록 (워크플로 스킬 제외). */
export async function listCommandSkills(root) {
  const entries = await readdir(join(root, "skills"), { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith(COMMAND_PREFIX) && e.name !== WORKFLOW_SKILL)
    .filter((e) => existsSync(join(root, "skills", e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

export async function listAgents(root) {
  return (await readdir(join(root, "agents")))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

/** 커맨드 스킬 description에서 자동 호출 방지 문구를 뗀 커맨드 설명. */
export function commandDescription(description) {
  return description.endsWith(INVOKE_GUARD)
    ? description.slice(0, -INVOKE_GUARD.length)
    : description;
}

const q = (value) => JSON.stringify(value);

function generatedComment(source) {
  return `# 생성 파일 - ${source} 에서 scripts/sync-harness.mjs 로 만든다. 직접 고치지 않는다.`;
}

export function renderPiPrompt(name, skill) {
  const lines = ["---", generatedComment(`skills/${name}/SKILL.md`)];
  lines.push(`description: ${q(commandDescription(skill.data.description))}`);
  const hint = skill.data.metadata?.["argument-hint"];
  if (hint) lines.push(`argument-hint: ${q(hint)}`);
  lines.push("---");
  return [
    ...lines,
    `\`${WORKFLOW_SKILL}\` 스킬과 같은 폴더에 있는 \`${name}/SKILL.md\` 커맨드 스킬을 읽고 그대로 따른다. 이 세션은 Pi다.`,
    "",
    "입력: ${@:-(없음)}",
    ""
  ].join("\n");
}

export function renderOpenCodeCommand(name, skill) {
  return [
    "---",
    generatedComment(`skills/${name}/SKILL.md`),
    `description: ${q(commandDescription(skill.data.description))}`,
    "---",
    `\`skill\` 도구로 \`${name}\` 스킬을 로드하고 그대로 따른다. 로드할 수 없으면 \`.agents/skills/${name}/SKILL.md\`를 읽는다. 이 세션은 OpenCode다.`,
    "",
    "입력: $ARGUMENTS",
    ""
  ].join("\n");
}

function agentDescription(name, data) {
  if (!data.description) throw new Error(`agents/${name}.md must have a description`);
  return `${data.description}${AGENT_DESCRIPTION_SUFFIX[name] || ""}`;
}

function canEditFiles(data) {
  const tools = String(data.tools || "").split(",").map((t) => t.trim());
  return tools.includes("edit") || tools.includes("write");
}

function agentBody(name, body, harness) {
  const note = [
    "",
    "## 하네스",
    "",
    `이 파일은 \`agents/${name}.md\`에서 생성한 ${harness} 서브에이전트다. ` +
      "서브에이전트 호출, 스크립트 경로, 하네스 전용 도구는 `matt-pocock-atomic-workflow` 스킬의 `references/harness.md`를 따른다. " +
      "단계 모델은 이 파일 frontmatter의 `model`로 지정한다.",
    ""
  ].join("\n");
  return `${body.trimEnd()}\n${note}`;
}

export function renderCursorAgent(name, agent) {
  const header = [
    "---",
    generatedComment(`agents/${name}.md`),
    `name: ${name}`,
    `description: ${q(agentDescription(name, agent.data))}`,
    "model: inherit",
    "readonly: false",
    "is_background: true",
    "---",
    ""
  ].join("\n");
  return header + agentBody(name, agent.body, "Cursor");
}

export function renderOpenCodeAgent(name, agent) {
  const lines = [
    "---",
    generatedComment(`agents/${name}.md`),
    `description: ${q(agentDescription(name, agent.data))}`,
    "mode: subagent"
  ];
  if (!canEditFiles(agent.data)) lines.push("permission:", "  edit: deny");
  lines.push("---", "");
  return lines.join("\n") + agentBody(name, agent.body, "OpenCode");
}

export function renderClaudeAgent(name, agent) {
  const lines = [
    "---",
    generatedComment(`agents/${name}.md`),
    `name: ${name}`,
    `description: ${q(agentDescription(name, agent.data))}`
  ];
  if (agent.data.skills) lines.push(`skills: ${agent.data.skills}`);
  if (!canEditFiles(agent.data)) lines.push("disallowedTools: Edit, Write");
  lines.push("model: inherit", "background: true", "---", "");
  return lines.join("\n") + agentBody(name, agent.body, "Claude Code");
}

/** 생성 결과를 { 상대경로: 내용 } 으로 만든다. write:true 이면 디스크에 쓰고 옛 생성물을 지운다. */
export async function generateHarnessFiles(options = {}) {
  const root = options.root || resolve(here, "..");
  const write = options.write !== false;
  const files = {};

  for (const name of await listCommandSkills(root)) {
    const skill = readSource(
      await readFile(join(root, "skills", name, "SKILL.md"), "utf8"),
      `skills/${name}/SKILL.md`
    );
    files[`prompts/${name}.md`] = renderPiPrompt(name, skill);
    files[`.opencode/commands/${name}.md`] = renderOpenCodeCommand(name, skill);
  }

  for (const name of await listAgents(root)) {
    const agent = readSource(await readFile(join(root, "agents", `${name}.md`), "utf8"), `agents/${name}.md`);
    files[`.cursor/agents/${name}.md`] = renderCursorAgent(name, agent);
    files[`.opencode/agents/${name}.md`] = renderOpenCodeAgent(name, agent);
    files[`.claude/agents/${name}.md`] = renderClaudeAgent(name, agent);
  }

  for (const script of BUNDLED_SCRIPTS) {
    files[`skills/${WORKFLOW_SKILL}/scripts/${script}`] = await readFile(join(root, "scripts", script), "utf8");
  }

  const stale = await findStale(root, files);
  const written = [];
  const removed = [];
  if (write) {
    for (const [rel, content] of Object.entries(files)) {
      const path = join(root, rel);
      const current = existsSync(path) ? await readFile(path, "utf8") : null;
      if (current === content) continue;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      written.push(rel);
    }
    for (const rel of stale) {
      await rm(join(root, rel));
      removed.push(rel);
    }
  }
  return { files, stale: write ? [] : stale, written, removed };
}

async function findStale(root, files) {
  const stale = [];
  for (const dir of OWNED_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const f of await readdir(abs)) {
      const rel = `${dir}/${f}`;
      if (f.endsWith(".md") && !(rel in files)) stale.push(rel);
    }
  }
  return stale.sort();
}

/** 커밋된 생성물이 원본과 일치하는지 검사한다. */
export async function checkHarnessSync(options = {}) {
  const root = options.root || resolve(here, "..");
  const { files, stale } = await generateHarnessFiles({ root, write: false });
  const mismatches = [];
  for (const [rel, expected] of Object.entries(files)) {
    const path = join(root, rel);
    const actual = existsSync(path) ? await readFile(path, "utf8") : null;
    if (actual !== expected) mismatches.push(rel);
  }
  return { inSync: mismatches.length === 0 && stale.length === 0, mismatches, stale };
}

if (process.argv[1] && process.argv[1].endsWith("sync-harness.mjs")) {
  const root = resolve(here, "..");
  if (process.argv.includes("--check")) {
    checkHarnessSync({ root }).then((res) => {
      if (res.inSync) {
        console.log("하네스 생성물이 원본과 일치합니다.");
        return;
      }
      if (res.mismatches.length) {
        console.error("원본과 다른 생성물:\n" + res.mismatches.map((m) => `  - ${m}`).join("\n"));
      }
      if (res.stale.length) {
        console.error("원본이 없는 옛 생성물:\n" + res.stale.map((m) => `  - ${m}`).join("\n"));
      }
      console.error("-> 'node scripts/sync-harness.mjs' 를 실행해 재생성하세요.");
      process.exitCode = 1;
    });
  } else {
    generateHarnessFiles({ root, write: true }).then((res) => {
      console.log(`하네스 생성물 ${Object.keys(res.files).length}개 확인.`);
      for (const f of res.written) console.log(`  ~ ${f}`);
      for (const f of res.removed) console.log(`  - ${f}`);
    });
  }
}
