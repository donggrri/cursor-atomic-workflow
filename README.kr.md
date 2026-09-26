[English](README.md) | 한국어

# matt-pocock-atomic-workflow

Pi용 코딩 워크플로 패키지. Cursor·OpenCode·Claude Code·Codex 프로젝트에도 설치할 수 있다.  
`/matt-pocock-atomic-explore`(선택) → `/matt-pocock-atomic-plan` → `/matt-pocock-atomic-task` → `/matt-pocock-atomic-execute` → `/matt-pocock-atomic-review` → `/matt-pocock-atomic-wrapup`

---

## 목차

1. [설치](#1-설치)
2. [settings.json 병합](#2-settingsjson-병합)
3. [로그인](#3-로그인)
4. [이전 에이전트 파일 삭제](#4-이전-에이전트-파일-삭제)
5. [Pi 재시작](#5-pi-재시작)
6. [사용법](#6-사용법)
7. [단계별 모델 바꾸는 법](#7-단계별-모델-바꾸는-법)
8. [하지 말 것](#8-하지-말-것)
9. [번들된 matt-pocock 스킬](#9-번들된-matt-pocock-스킬)
10. [Cursor·OpenCode·Claude Code·Codex에서 쓰기](#10-cursoropencodeclaude-codecodex에서-쓰기)
11. [추후 과제](#11-추후-과제)

---

## 1. 설치

```bash
pi install git:github.com/donggrri/pi-subagents
pi install npm:matt-pocock-atomic-workflow
```

Git에서 설치 (대안):

```bash
pi install git:github.com/donggrri/matt-pocock-atomic-workflow
```

아래는 필수가 아니다. 실제로 쓰는 것만 설치한다:

```bash
pi install npm:@rahularya01/pi-cursor                 # Cursor 모델 (`cursor/...`)
pi install git:github.com/donggrri/pi-antigravity-bridge  # Antigravity 모델 (`antigravity/...`) 또는 `agy`
```

---

## 2. settings.json 병합

`settings.example.json`을 복사해서 `~/.pi/agent/settings.json`에 병합한다. (또는 Pi에서 `/matt-pocock-atomic-config init` 실행)

```bash
# settings.json이 없으면 그대로 복사
cp settings.example.json ~/.pi/agent/settings.json

# 이미 있으면 두 파일을 직접 열어 agentOverrides 블록을 병합한다
# (jq가 있으면)
jq -s '.[0] * .[1]' ~/.pi/agent/settings.json settings.example.json > /tmp/merged.json
mv /tmp/merged.json ~/.pi/agent/settings.json
```

`YOUR_*` placeholder를 실제 모델 ID로 바꾼다. 모델은 원하는 것을 쓰면 되고, 아래 ID는 예시일 뿐이다.

```json
"explorer": {
  "model": "xai/grok-4.6",
  "fallbackModels": ["antigravity/claude-sonnet-4-6"]
},
"planner": {
  "model": "xai/grok-4.6",
  "fallbackModels": ["antigravity/claude-sonnet-4-6"]
}
```

사용 가능한 에이전트 키:  
`explorer`, `planner`, `tasker`, `worker`, `reviewer`, `scout`, `oracle`, `researcher`, `delegate`

기존 설정에 `g-explorer` / `g-planner` 키가 있으면 `explorer` / `planner` / `tasker` / `worker` / `reviewer`로 바꾼다.

단계별 키 설명과 현재 설정 확인은 `/matt-pocock-atomic-config` 또는 `/matt-pocock-atomic-models`를 실행하면 Pi가 안내해 준다.

---

## 3. 로그인

```bash
/login xai
/login cursor   # pi-cursor를 설치한 경우만
agy             # pi-antigravity-bridge를 설치한 경우만. 최초 한 번 대화형 인증
```

---

## 4. 이전 사용자 파일 삭제

이전에 직접 만들었던 사용자 홈 복사본이 있으면 지워야 한다.  
남겨 두면 이 패키지가 등록한 스킬·프롬프트·에이전트가 가려지고 충돌 경고가 난다.

```bash
rm ~/.pi/agent/agents/g-*.md
rm ~/.pi/agent/agents/{explorer,planner,tasker,worker,reviewer}.md
rm ~/.pi/agent/prompts/g-*.md ~/.pi/agent/prompts/matt-pocock-atomic-*.md
rm -rf ~/.agents/skills/matt-pocock-atomic-workflow
```

> **주의**: 삭제하기 전에 내용을 이 저장소의 파일과 비교해서 차이가 있으면 먼저 병합한다.

---

## 5. Pi 재시작

```bash
# Pi CLI를 쓰는 경우
pi restart

# 또는 Pi 앱을 재시작한다
```

재시작 후 `/matt-pocock-atomic-plan` 커맨드가 뜨면 설치 완료.

---

## 6. 사용법

기본: **PLAN만 확정하면** task → execute → review가 자동이다. 커밋은 `/matt-pocock-atomic-wrapup`일 때만.

| 커맨드 | 역할 | 산출물 |
|---|---|---|
| `/matt-pocock-atomic-explore` | Phase 0: 코드베이스 및 기술 사전 탐색 (선택) | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/EXPLORE-<slug>.md` (레거시: `.docs/<slug>/`) |
| `/matt-pocock-atomic-plan` | Phase 1 후 기본 파이프라인 | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/PLAN-<slug>.md` + 자동으로 TASKS/코드/REVIEW |
| `/matt-pocock-atomic-task` | Phase 2만 강제하거나 이어서 자동 | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/TASKS-<slug>.md` |
| `/matt-pocock-atomic-execute` | Phase 3만 강제하거나 이어서 자동 | 코드 변경 + 체크된 TASKS |
| `/matt-pocock-atomic-delegate` | Phase 3: 특정 워커에 위임 | 같음 |
| `/matt-pocock-atomic-review` | Phase 4 | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/REVIEW-<slug>.md` |
| `/matt-pocock-atomic-wrapup` | Phase 5: 마무리 (커밋, 푸시 없음) | git commit + STATUS |
| `/matt-pocock-atomic-status` | 진행 상황 보고 (`npm run status` / `STATUS.json`) | 텍스트 요약 / 테이블 |
| `/matt-pocock-atomic-config` | matt-pocock-atomic-workflow 모델/스킬 설정 관리 (`/matt-pocock-atomic-settings`) | 텍스트/대화형 설정 |
| `/matt-pocock-atomic-models` | 모델 설정 안내 (읽기 전용) | 텍스트 안내 |
| `/matt-pocock-atomic-doctor` | 스킬 충돌, YAML frontmatter 문법 진단 및 자동 교정(Auto-fix) | 진단 리포트 / 자동 교정 |

PLAN에 막힌 질문(보안·범위·데이터 손실)이 있으면 거기서 멈춘다. 계획만 쓰려면 `/matt-pocock-atomic-plan 계획만`.

단계마다 다른 모델을 쓰려면 `settings.json`의 `subagents.agentOverrides`에서 에이전트별로 고른다. 스킬 자체에는 모델을 붙일 수 없다.

---

## 7. 단계별 모델 바꾸는 법

간편하게 바꾸려면 Pi 세션에서 `/matt-pocock-atomic-config <에이전트> <모델>` 또는 대화형으로 `/matt-pocock-atomic-config`를 실행한다. 모델은 에이전트마다 원하는 것을 쓰면 된다.

직접 편집할 경우:
1. `~/.pi/agent/settings.json`을 열고 `subagents.agentOverrides` 안의 해당 에이전트 키를 찾는다.
2. `model`과 `fallbackModels`를 원하는 값으로 바꾼다.
3. Pi를 재시작하거나 새 대화를 열면 적용된다.

```json
{
  "subagents": {
    "agentOverrides": {
      "worker": {
        "model": "xai/grok-4.6",
        "fallbackModels": ["antigravity/claude-sonnet-4-6", "cursor/composer-2.5"]
      }
    }
  }
}
```

**에이전트 `.md` 파일을 직접 고치지 말 것.** frontmatter에 `model` 키를 넣으면 settings override가 무시된다.  
자세한 안내는 `/matt-pocock-atomic-models`.

---

## 8. 하지 말 것

- **푸시 금지**: `git push`는 직접 원할 때만. 에이전트는 푸시하지 않는다.
- **비밀 금지**: 토큰·API 키·`.env`를 커밋하거나 워커 브리프에 넣지 않는다.
- **다른 하네스**: `pi install`은 Pi만 설정한다. Cursor·OpenCode·Claude Code·Codex는 [10절](#10-cursoropencodeclaude-codecodex에서-쓰기)을 따른다.
- **설치된 패키지 파일 직접 편집 금지**: 설치된 `agents/*.md`, `prompts/*.md`, 스킬은 패키지 업데이트 시 덮어써진다. Pi에서는 모델을 settings.json에서만 바꾼다.

---

## 9. 번들된 matt-pocock 스킬

이 패키지를 설치하면 아래 스킬도 Pi package resource로 함께 설치·발견된다. 별도 `npx skills add`나 `~/.codex/skills` 설정이 필요 없다.

| 단계 | 실행 주체 | 강제 스킬 |
|---|---|---|
| plan preflight | 부모 오케스트레이터 | `grilling`, `domain-modeling`, `codebase-design`, `wayfinder` |
| plan | `planner` | 같은 스킬 + `matt-pocock-atomic-workflow` |
| task | `tasker` | `to-tickets` (산출물은 `TASKS-<slug>.md`) |
| execute | `worker` | `tdd` |
| review | `reviewer` | `code-review` (손자 없이 두 축) |

`grill-me`와 `wayfinder`는 upstream에서 `disable-model-invocation: true`인 사용자 호출용 orchestrator다. 따라서 `/matt-pocock-atomic-plan`은 `grill-me`가 위임하는 model-invoked `grilling`을 부모 단계에서 직접 읽고 실행한다. 큰 작업은 기본적으로 tracker 없는 `local-wayfinding`으로 분류하며, upstream `wayfinder` tracker 흐름은 사용자가 명시한 경우에만 사용한다.

번들 snapshot의 원본 저장소, revision, MIT 라이선스는 `THIRD_PARTY_LICENSES/mattpocock-skills-*`에 기록되어 있다. upstream을 갱신할 때는 선정 디렉터리를 함께 갱신하고 `npm test`로 에이전트 참조를 검증한다.

---

## 10. Cursor·OpenCode·Claude Code·Codex에서 쓰기

슬래시 커맨드는 모두 스킬이다. `skills/matt-pocock-atomic-<이름>/SKILL.md` 하나에 커맨드 로직을 하네스 중립 문구로 쓰고, `disable-model-invocation: true`로 사용자가 부를 때만 실행되게 한다. 하네스마다 다른 부분(서브에이전트 호출법, 인자가 들어오는 방식, 스크립트 경로, 하네스 전용 도구)은 `skills/matt-pocock-atomic-workflow/references/harness.md` 한 곳에만 둔다.

| 하네스 | 슬래시 커맨드 | 서브에이전트 | 단계 모델 |
|---|---|---|---|
| Pi | `/matt-pocock-atomic-plan` (`prompts/`의 얇은 shim) | `agents/*.md` | `settings.json`의 `subagents.agentOverrides` |
| Cursor | `/matt-pocock-atomic-plan` (스킬 직접 호출) | `.cursor/agents/*.md` | 에이전트 파일의 `model` |
| OpenCode | `/matt-pocock-atomic-plan` (`.opencode/commands/`의 얇은 shim) | `.opencode/agents/*.md` | 에이전트 파일의 `model` |
| Claude Code | `/matt-pocock-atomic-plan` (스킬 직접 호출) | `.claude/agents/*.md` | 에이전트 파일의 `model` |
| Codex | `$matt-pocock-atomic-plan` (스킬 직접 호출) | 없음 (message에 역할을 적어 띄운다) | 세션 모델 |

에이전트 7종(`explorer`, `planner`, `tasker`, `worker`, `reviewer`, `tester`, `cli-delegate`)이 모두 Cursor·OpenCode·Claude Code용으로 생성된다.

### 프로젝트에 설치

```bash
# 이 저장소(또는 설치된 npm 패키지)에서 실행
node scripts/install.mjs --harness cursor --target /path/to/project
node scripts/install.mjs --harness opencode,claude --target /path/to/project
```

| `--harness` | 스킬 (커맨드 스킬 포함 `skills/*` 전체) | 에이전트 | 커맨드 shim |
|---|---|---|---|
| `cursor` | `.agents/skills/` | `.cursor/agents/` | 필요 없음 |
| `opencode` | `.agents/skills/` | `.opencode/agents/` | `.opencode/commands/` |
| `claude` | `.claude/skills/` | `.claude/agents/` | 필요 없음 |
| `codex` | `.agents/skills/` | 없음 | 필요 없음 |

이미 있는 파일은 유지되며 `--force`일 때만 덮어쓴다. `--skills-dir`로 스킬 위치를 바꾸고, `--no-skills` / `--no-agents` / `--no-commands`로 구성 요소를 건너뛴다. 설치 시 단계 모델을 고정하려면 `--set-model`을 반복 지정한다:

```bash
node scripts/install.mjs --harness cursor --target /path/to/project --set-model worker=composer-2.5[]
```

예전 설치가 남긴 `.cursor/commands/matt-pocock-atomic-*.md`가 있으면 지운다. 이제 커맨드 스킬이 같은 슬래시 커맨드를 제공하므로, 둘 다 두면 커맨드가 두 번씩 보인다. 설치 스크립트와 `doctor`가 해당 파일을 알려 준다.

### 패키지 유지보수

원본만 고친다. 나머지는 생성물이다.

| 바꿀 것 | 고칠 파일 | 여기서 생성되는 파일 |
|---|---|---|
| 커맨드 동작 | `skills/matt-pocock-atomic-<이름>/SKILL.md` | `prompts/<이름>.md`, `.opencode/commands/<이름>.md` |
| 에이전트 역할 | `agents/<에이전트>.md` | `.cursor/agents/`, `.opencode/agents/`, `.claude/agents/` |
| 하네스 차이 | `skills/matt-pocock-atomic-workflow/references/harness.md` | — |
| 워크플로 스크립트 | `scripts/work-status.mjs`, `scripts/run-done.mjs` | `skills/matt-pocock-atomic-workflow/scripts/`의 복사본 |

```bash
node scripts/sync-harness.mjs          # 재생성 + 원본이 사라진 생성물 삭제
node scripts/sync-harness.mjs --check  # 드리프트 검사(CI용)
npm test                               # harness-sync 테스트 포함
node scripts/doctor.mjs                # 3번 섹션에서 동기화·설치 상태 점검
```

커맨드를 추가하려면 `skills/matt-pocock-atomic-<이름>/SKILL.md`를 만들고(`disable-model-invocation: true`, description 끝에 "사용자가 직접 호출할 때만 쓴다.") `node scripts/sync-harness.mjs`를 실행한다.

---

## 11. 추후 과제

이번 패키지에서 구현하지 않고 README에만 남긴 항목이다. 우선순위와 하네스 통합 계획은 [ROADMAP.md](ROADMAP.md)에 있다.

- **README 에이전트 키 누락**: 패키지 에이전트 일부(`tester`, `cli-delegate` 등)가 위 설정 키 목록에 없다.
- **CONTEXT.md vs `run-done` 증거 경로**: CONTEXT.md는 `runs/<slug>/<id>.done.json`인데 `scripts/run-done.mjs`는 `${logPath}.done.json`을 쓴다.
- **병렬 워크트리 통합**: 형제 워크트리 merge 단계가 없다.
- **PR/CI**: 이 워크플로에 대한 pull request·CI 파이프라인이 없다.
