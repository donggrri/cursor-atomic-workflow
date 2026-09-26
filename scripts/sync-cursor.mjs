#!/usr/bin/env node
// Cursor 지원 파일 생성기.
//
// 단일 소스(`agents/*.md`, `prompts/*.md`)에서 Cursor가 바로 읽는 파일을 만든다.
//   agents/*.md  -> .cursor/agents/*.md      (Cursor 서브에이전트 형식)
//   prompts/*.md -> .cursor/commands/*.md    (Cursor 슬래시 커맨드, frontmatter 없음)
//
// 스킬(`skills/*`)은 Agent Skills 표준 형식 그대로라 변환이 필요 없다.
// 설치는 scripts/install-cursor.mjs 가 담당한다.
//
//   node scripts/sync-cursor.mjs          # 생성/갱신
//   node scripts/sync-cursor.mjs --check  # 드리프트 검사만 (CI용)
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const AGENT_NAMES = ["explorer", "planner", "tasker", "worker", "reviewer", "cli-delegate"];

/** Cursor 서브에이전트 단계별 기본 모델. 설치 후 `.cursor/agents/<name>.md`의 `model`에 기록된다. */
export const CURSOR_AGENT_MODELS = {
  explorer: "cursor-grok-4.6-high",
  planner: "claude-opus-5-thinking-high",
  tasker: "claude-sonnet-5-thinking-medium",
  worker: "composer-2.5",
  reviewer: "claude-sonnet-5-thinking-high",
  "cli-delegate": "inherit"
};

// Pi agents/*.md 는 async:true 로 동작하므로 Cursor에서도 백그라운드가 기본이다.
export const CURSOR_AGENT_DEFAULTS = {
  readonly: false,
  is_background: true
};

const AGENT_DESCRIPTION_SUFFIX = {
  explorer: " Use proactively for codebase exploration before planning.",
  planner: " Use after requirements are clarified to write the implementation plan.",
  tasker: " Use after the plan is confirmed to split it into verifiable tasks.",
  worker: " Use to implement one task item at a time.",
  reviewer: " Use after implementation to verify tasks, diff, and tests.",
  "cli-delegate":
    " Use when TASKS worker is agy|pi|opencode|codex|claude to run invoke-worker headlessly."
};

// Pi 전용 frontmatter 키. Cursor 파일에 남기면 무시되거나 혼란을 주므로 제거한다.
const PI_ONLY_AGENT_KEYS = new Set([
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
]);

/** frontmatter 블록과 본문을 분리한다. frontmatter가 없으면 null 을 반환한다. */
export function splitFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  return { frontmatter: match[1], body: text.slice(match[0].length) };
}

/** 단순 YAML 매핑 파서. 첫 콜론 기준 분리이며 주석(#)은 값에 포함된 것만 유지한다. */
export function parseSimpleMapping(frontmatter) {
  const map = {};
  const order = [];
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in map)) order.push(key);
    map[key] = value;
  }
  return { map, order };
}

function quote(value) {
  return JSON.stringify(value);
}

export function convertAgent(name, sourceText) {
  const split = splitFrontmatter(sourceText);
  if (!split) throw new Error(`agents/${name}.md must have YAML frontmatter`);
  const { map } = parseSimpleMapping(split.frontmatter);
  if (!map.description) throw new Error(`agents/${name}.md must have a description`);

  const description = `${map.description}${AGENT_DESCRIPTION_SUFFIX[name] || ""}`;
  const model = CURSOR_AGENT_MODELS[name] || "inherit";
  const header = [
    "---",
    `name: ${name}`,
    `description: ${quote(description)}`,
    `model: ${model}`,
    `readonly: ${CURSOR_AGENT_DEFAULTS.readonly}`,
    `is_background: ${CURSOR_AGENT_DEFAULTS.is_background}`,
    "---",
    ""
  ].join("\n");

  const note = [
    "",
    "## Cursor에서 호출하기",
    "",
    `이 에이전트는 Cursor Task 툴에서 \`/${name}\` 또는 "Use the ${name} subagent ..." 지시로 호출한다. ` +
      "호출할 때 필요한 스킬 경로를 프롬프트 첫 줄에 함께 적는다(스킬은 설명 관련성에 따라 자동 첨부되기도 한다). " +
      `기본 모델은 \`${model}\`이다. 바꾸려면 이 파일 frontmatter의 \`model\`을 고친다.`,
    ""
  ].join("\n");

  return `${header}${split.body.trimEnd()}\n${note}`;
}

const PI_TO_CURSOR_PHRASES = [
  [
    "이건 Pi 세션이다. Cursor 전용 도구(`rename_chat`, `move_agent_to_root`)는 쓰지 마라. CLI 워커를 직접 설치하거나 `agy`/`codex`를 인자 없이 실행하지 마라.",
    "Cursor 세션에서는 Task 툴로 아래 서브에이전트를 호출한다. CLI 워커를 직접 설치하거나 `agy`/`codex`를 인자 없이 실행하지 마라."
  ],
  ["Pi 세션이다.", "Cursor 세션이다."],
  ["`subagent` 툴만 쓰고 `async: true`로 띄운 뒤 완료를 기다린다", "Task 툴만 쓰고 백그라운드로 띄운 뒤 완료를 기다린다"],
  ["위임은 `subagent`만 쓴다", "위임은 Task 툴만 쓴다"],
  ["`subagent` 툴만 쓴다.", "Task 툴만 쓴다."],
  ["Task 툴로 `worker`를 `async: true`로.", "Task `worker`를 백그라운드로 띄운다."],
  ["위임은 `subagent`로 위임한다", "위임은 Task 툴로 위임한다"],
  ["`subagent`로 `", "Task 툴로 `"],
  ["`subagent`만 호출한다", "Task 툴만 호출한다"],
  ["를 `async: true`로 띄운다", "를 백그라운드로 띄운다"],
  ["`async: true`로 이어서 띄운다", "백그라운드로 이어서 띄운다"],
  ["`async: true`로 띄운다", "백그라운드로 띄운다"],
  ["PowerShell `invoke-worker.ps1`을 쓰지 마라.", "bare `agy`/`pi` CLI를 직접 호출하지 마라. Task 툴만 쓴다."],
  [
    "TASKS `worker:` 또는 인자가 `agy|pi|opencode|codex|claude`이면 `subagent`로 `cli-delegate`를 `async: true`로 띄운다.",
    "TASKS `worker:` 또는 인자가 `agy|pi|opencode|codex|claude`이면 Task **`cli-delegate`**를 백그라운드로 띄운다."
  ],
  [
    "TASKS 항목 `worker:`가 `agy|pi|opencode|codex|claude`이면 `subagent`로 `cli-delegate`를 `async: true`로 띄운다 (`workers.md`·`invoke-worker.sh`).",
    "TASKS 항목 `worker:`가 `agy|pi|opencode|codex|claude`이면 Task **`cli-delegate`**를 백그라운드로 띄운다 (`workers.md`·`invoke-worker.sh`)."
  ],
  ["모델 폴백은 `fallbackModels`에 맡기고", "모델 폴백은 에이전트 `model` 설정에 맡기고"],
  ["쿼터 부족은 `fallbackModels`가 처리한다", "쿼터 부족은 에이전트 `model` 설정이 처리한다"],
  ["폴백이 실패하면 그 사실을 보고한다", "지정 모델이 실패하면 그 사실을 보고한다"]
];

const COMMAND_FOOTER = [
  "",
  "---",
  "",
  "## Cursor 메모",
  "",
  "- 위임은 Task 툴(`/에이전트명` 또는 \"Use the ... subagent ...\")로 수행한다. Pi의 `subagent` 호출과 동등하다.",
  "- 단계별 모델은 `.cursor/agents/<에이전트>.md`의 `model` frontmatter로 지정한다(Pi의 `settings.json` `agentOverrides` 대신).",
  "- 슬래시 뒤에 붙인 텍스트는 위 본문의 인자 자리에 들어간다.",
  ""
].join("\n");

/** Pi 프롬프트 본문을 Cursor 커맨드 본문으로 바꾼다. */
export function adaptCommandBody(body) {
  let out = body;
  for (const [from, to] of PI_TO_CURSOR_PHRASES) {
    out = out.split(from).join(to);
  }
  // Pi 인자 템플릿 ${@:-기본값} -> 기본값 + 슬래시 뒤 텍스트 안내.
  out = out.replace(/\$\{@:-([^}]*)\}/g, (_m, def) => {
    const d = def.trim();
    if (!d) return "슬래시 뒤에 붙인 텍스트";
    return `${d}(슬래시 뒤에 붙인 텍스트가 있으면 그것을 우선한다)`;
  });
  return out.trim();
}

export function convertCommand(commandName, sourceText) {
  const split = splitFrontmatter(sourceText);
  if (!split) throw new Error(`prompts/${commandName}.md must have YAML frontmatter`);
  const { map } = parseSimpleMapping(split.frontmatter);
  const title = `# /${commandName}\n`;
  const desc = map.description ? `\n${map.description}\n` : "\n";
  const hint = map["argument-hint"] ? `\n인자 형식: \`${map["argument-hint"]}\`\n` : "";
  return `${title}${desc}${hint}\n${adaptCommandBody(split.body)}\n${COMMAND_FOOTER}`;
}

/** 변환 결과를 메모리에 생성한다. write:true 이면 디스크에 쓴다. */
export async function generateCursorFiles(options = {}) {
  const root = options.root || resolve(here, "..");
  const write = options.write !== false;
  const agentsDir = join(root, ".cursor", "agents");
  const commandsDir = join(root, ".cursor", "commands");
  const generated = { agents: {}, commands: {}, written: [] };

  for (const name of AGENT_NAMES) {
    const source = await readFile(join(root, "agents", `${name}.md`), "utf8");
    const output = convertAgent(name, source);
    generated.agents[`${name}.md`] = output;
    if (write) {
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, `${name}.md`), output + "\n", "utf8");
      generated.written.push(`.cursor/agents/${name}.md`);
    }
  }

  const promptFiles = (await readdir(join(root, "prompts")))
    .filter((f) => f.endsWith(".md"))
    .sort();
  for (const file of promptFiles) {
    const commandName = basename(file, ".md");
    const source = await readFile(join(root, "prompts", file), "utf8");
    const output = convertCommand(commandName, source);
    generated.commands[file] = output;
    if (write) {
      await mkdir(commandsDir, { recursive: true });
      await writeFile(join(commandsDir, file), output + "\n", "utf8");
      generated.written.push(`.cursor/commands/${file}`);
    }
  }

  return generated;
}

/** 커밋된 Cursor 파일이 생성기와 일치하는지 검사한다. */
export async function checkCursorSync(options = {}) {
  const root = options.root || resolve(here, "..");
  const generated = await generateCursorFiles({ root, write: false });
  const mismatches = [];
  for (const [file, expected] of Object.entries(generated.agents)) {
    const path = join(root, ".cursor", "agents", file);
    const actual = existsSync(path) ? await readFile(path, "utf8") : null;
    if (actual !== expected + "\n") mismatches.push(`.cursor/agents/${file}`);
  }
  for (const [file, expected] of Object.entries(generated.commands)) {
    const path = join(root, ".cursor", "commands", file);
    const actual = existsSync(path) ? await readFile(path, "utf8") : null;
    if (actual !== expected + "\n") mismatches.push(`.cursor/commands/${file}`);
  }
  return { inSync: mismatches.length === 0, mismatches };
}

if (process.argv[1] && process.argv[1].endsWith("sync-cursor.mjs")) {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const root = resolve(here, "..");
  if (checkOnly) {
    checkCursorSync({ root }).then((res) => {
      if (res.inSync) {
        console.log("Cursor 파일이 동기화되어 있습니다.");
      } else {
        console.error("Cursor 파일 드리프트:\n" + res.mismatches.map((m) => `  - ${m}`).join("\n"));
        console.error("-> 'node scripts/sync-cursor.mjs' 를 실행해 재생성하세요.");
        process.exitCode = 1;
      }
    });
  } else {
    generateCursorFiles({ root, write: true }).then((res) => {
      console.log("Cursor 파일 생성 완료:");
      for (const f of res.written) console.log(`  - ${f}`);
    });
  }
}
