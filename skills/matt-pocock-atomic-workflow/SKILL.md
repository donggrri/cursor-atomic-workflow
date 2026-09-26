---
name: matt-pocock-atomic-workflow
description: >-
  Runs matt-pocock-atomic-workflow phases (explore, plan, task, execute, review, commit, status, config).
  Use when the user invokes /matt-pocock-atomic-explore, /matt-pocock-atomic-plan, /matt-pocock-atomic-task, /matt-pocock-atomic-execute, /matt-pocock-atomic-delegate,
  /matt-pocock-atomic-review, /matt-pocock-atomic-wrapup, /matt-pocock-atomic-status, /matt-pocock-atomic-config, /matt-pocock-atomic-settings, or mentions matt-pocock-atomic-workflow or matt-pocock-atomic-workflow.
---

# Atomic Workflow (matt-pocock-atomic-workflow)

Pi 패키지 스킬이다. 프롬프트·에이전트는 이 패키지가 등록한다. `~/.agents/skills/matt-pocock-atomic-workflow`, `~/.pi/agent/prompts/g-*.md`, `~/.pi/agent/prompts/matt-pocock-atomic-*.md`, `~/.pi/agent/agents/g-*.md`, `~/.pi/agent/agents/{explorer,planner,tasker,worker,reviewer}.md`를 남겨 두면 패키지가 가려지고 충돌 경고가 난다.

사용자에게는 한국어로 말한다. 템플릿은 [reference.md](reference.md), 위임은 [workers.md](workers.md), 모델은 [models.md](models.md), 테스트는 [testing.md](testing.md)를 이 파일을 읽은 뒤에만 연다.

## 바로 할 일

1. 이 파일 전체를 읽는다.
2. 하네스를 가른다. `PI_CODING_AGENT` 또는 `PI_SESSION_ID`가 있으면 **Pi**. 아니면 **Cursor**.
3. Cursor면 채팅 제목을 3~5단어로 `rename_chat` 한다. Pi면 건너뛴다.
4. 의도가 **워크플로 자체 수정**인지 **제품 기능**인지 가른다.

**PLAN 위치 규칙** (템플릿 필드는 양쪽 동일. `PREFIX-<slug>.md` 파일명은 유지. 쓰기 전 슬러그 디렉토리를 만든다):

- **단일 전역 홈**: 모든 작업(제품 기능 및 워크플로 자체)은 `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/PLAN-<slug>.md`에 쓴다 (같은 폴더에 `STATUS.json`, EXPLORE/TASKS/REVIEW). 홈·스킬 폴더·제품 `docs/`와 혼용하지 않는다.
- `shortRepo`: `path.basename(repoRoot)` 기반 소문자 kebab-case 정규화 (최대 24자).
- **레거시 호환**: 기존 저장소 `.docs/<slug>/` 및 하네스 `docs/<slug>/`는 상태 조회 시 읽기 전용 fallback으로만 지원하며, 신규 쓰기는 하지 않는다.

**STATUS 자동 동기화** — 슬러그 폴더에 EXPLORE/PLAN/TASKS/REVIEW를 쓰거나 TASKS 체크박스·`막힘:`을 갱신한 **직후** 전역 `STATUS.json`을 맞춘다:

```bash
node scripts/work-status.mjs sync <slug>
```

Cursor 설치 프로젝트(`scripts/` 없음): `node .agents/skills/matt-pocock-atomic-workflow/scripts/work-status.mjs sync <slug>`

Wrapup 커밋 후: `sync <slug> commit`. 파이프라인 종료: `sync <slug> complete` (또는 `complete <slug>`).

Cursor Cloud Agent는 `CURSOR_CONVERSATION_ID`(`bc-…`)를 `STATUS.json`의 `sessionId`에 기록한다. 로컬 Cursor는 환경 변수가 없으면 `--session-id <id>`로 넘긴다.

워크플로 자체일 때 같이 맞추는 파일 목록:

- 패키지 저장소: `skills/matt-pocock-atomic-workflow/`, `prompts/`, `agents/`, `README.md`, `settings.example.json`
- 필요하면 `~/.pi/agent/settings.json`의 `packages`와 `subagents`

## 단계

| 단계 | 커맨드 | 산출물 | 다음 |
|---|---|---|---|
| 0 | `/matt-pocock-atomic-explore` | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/EXPLORE-<slug>.md` (레거시: `.docs/<slug>/`, `docs/<slug>/`) | 탐색 보고 후 `/matt-pocock-atomic-plan` 안내 |
| 1 | `/matt-pocock-atomic-plan` 또는 사용자가 쓴 PLAN | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/PLAN-<slug>.md` | 막힌 질문 없으면 **자동** Phase 2 |
| 2 | (자동) `tasker` | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/TASKS-<slug>.md` | **자동** Phase 3 |
| 3 | (자동) `worker` | 코드 + 체크된 TASKS | **자동** Phase 4 |
| 4 | (자동) `reviewer` | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/REVIEW-<slug>.md` + 테스트 | 보고. 커밋은 수동 |
| 5 | `/matt-pocock-atomic-wrapup` | 커밋 + 상태 기록 (푸시 없음) | 사용자가 원할 때만 PR |
| — | `/matt-pocock-atomic-status` | 진행 보고 (`work-status.mjs` 조회) | 이어서 할 커맨드 |
| — | `/matt-pocock-atomic-config` (`/matt-pocock-atomic-settings`) | 설정 조회 및 대화형 변경 | 설정 확인 및 저장 |

슬러그: 의도에서 만든 짧은 ASCII kebab-case (`space-notes`, `mcp-http`).

## 기본 파이프라인 (Plan 이후 자동)

사람 게이트는 **PLAN(Phase 1)뿐**이다. 리뷰 재작업 1회·막힘 재개는 정책으로 자동 실행된다. 모델은 스킬이 아니라 서브에이전트에 붙는다. 그래서 단계마다 자식을 띄우고, 그 자식이 스킬을 읽게 한다. 일상 작업은 Plan → Task → Worker → Reviewer로 직행한다. 대규모 아키텍처 개편이나 공개 API 설계 등 중대 작업인 경우에만 부모가 선택적으로 Challenge / Simplify 검토 단계를 거친다.

PLAN이 있고 막힌 질문(보안·범위·데이터 손실)이 없으면 부모는 멈추지 않는다.

1. `tasker`를 `async: true`로 띄운다.
2. TASKS의 의존 순서대로 `worker`를 `async: true`로 띄운다. `parallel: yes`이고 파일이 안 겹치면 같이 띄워도 된다. 워크트리당 쓰기 워커는 하나.
3. 항목마다 **부모가 `scripts/run-done.mjs`로 `done` 명령을 재실행하고 `.done.json` 증거가 있을 때만** `[x]`.
4. 열린 항목이 없으면 `reviewer`를 `async: true`로 띄운다 (작업자의 대화 맥락을 상속받지 않는 독립 fresh 컨텍스트로 띄워 객관적 검증 보장). 결함이 있으면 REVIEW 결함을 열린 TASKS로 되돌리거나 새 항목을 붙인 뒤 worker → reviewer를 한 번만 자동 재실행한다. 한 바퀴 후에도 결함이면 멈추고 보고한다. reviewer가 완료되면 `tester`를 띄운다. tester가 완료되고 통과하면 `[x]`로 마무리한다.
5. 결과를 한국어로 보고한다. 커밋하지 않는다.

멈추는 경우:

- PLAN에 막힌 질문이 있다
- 사용자가 「계획만」/「태스크만」/「구현만」이라고 했다
- 항목 `done`이 실패했다 (막힘 재개: 실패한 항목만 재시도. 이미 [x]는 유지. 재시도 시작 때 그 항목의 `막힘:`만 지운다. 입구는 `/matt-pocock-atomic-execute`)
- 리뷰 재작업 한 바퀴 후에도 결함이 남았다 (한 바퀴 후에도 결함이면 멈추고 보고)
- `/matt-pocock-atomic-wrapup` 또는 「커밋해」가 없다 → 커밋하지 않는다

사용자가 이미 `.docs/<slug>/PLAN-<slug>.md`(또는 워크플로 자체 `docs/<slug>/PLAN-<slug>.md`)를 써 두었거나 메시지에 계획을 주면 Phase 1 자식을 건너뛴다. `/matt-pocock-atomic-plan`에 의도만 있으면 `planner`가 PLAN을 쓴 뒤 위 루프로 들어간다.

자식을 띄울 때 task **첫 줄**에 강제 스킬 경로를 적는다. 부모의 `available_skills`에서 찾고, 없으면 「이 스킬 없음. matt-pocock-atomic-workflow만으로 진행」이라고 적는다. 브리프에 비밀·토큰·`.env`를 넣지 않는다.

## 하네스

### Pi

오케스트레이터는 이 세션이다. 구현/계획/리뷰가 필요하면 `subagent` 툴로 아래 에이전트를 띄운다.

| 단계 | 에이전트 | 기본 |
|---|---|---|
| explore / recon | `explorer` / `scout` | 코드가 낯설거나 탐색/리서치 필요 시 |
| plan | `planner` | PLAN이 이미 있으면 건너뜀. 그 외는 항상 자식 |
| task | `tasker` | 항상 자식. `self`를 말한 경우만 직접 |
| execute | `worker` | 항상 자식. `self`를 말한 경우만 직접 |
| review | `reviewer` | 항상 자식 |
| test | `tester` | reviewer 완료 후, 테스트 작성 + mutation 검증 |
| commit/status/config | self | 서브에이전트 금지 |

런 로그: `~/.matt-pocock-workflow/runs/{shortRepo}/{slug}/`
증거: `~/.matt-pocock-workflow/evidence/{shortRepo}/<YYYY-MM-DD>-<slug>/`

- `rename_chat`, `move_agent_to_root`를 호출하지 않는다.
- `scripts/ensure-workers.ps1`으로 CLI를 설치하지 않는다.
- `agy`를 인자 없이 실행하지 않는다.
- Cursor/Antigravity 모델을 쓰는 자식은 `async: true`로 띄운다. 포그라운드에는 확장 프로바이더가 없다.
- 모델 폴백은 에이전트 `fallbackModels`가 한다. [models.md](models.md).

### Cursor

기존 제약:

- **Plan 모드**는 쓰기 금지. 동의를 구하지 않고 모드를 바꾸지 않는다.
- 워크트리를 만들었으면 즉시 `cursor-app-control.move_agent_to_root`로 옮긴다.
- 셸은 PowerShell이다. heredoc 대신 here-string.
- 이 머신 git 설정·`--no-verify`·force push는 하지 않는다.

런 로그: `~/.matt-pocock-workflow/runs/{shortRepo}/{slug}/`
증거: `~/.matt-pocock-workflow/evidence/{shortRepo}/<YYYY-MM-DD>-<slug>/`

구현을 CLI에 넘길 때만 [workers.md](workers.md)의 PowerShell 경로를 쓴다.

단계 모델 기본값: `explorer`=`cursor-grok-4.6-high`, `planner`=`claude-opus-5-thinking-high`, `tasker`=`claude-sonnet-5-thinking-medium`, `worker`=`composer-2.5`, `reviewer`=`claude-sonnet-5-thinking-high`, `cli-delegate`=`inherit`. 바꾸려면 `.cursor/agents/<에이전트>.md`의 `model` 또는 `/matt-pocock-atomic-config`.

## 워크트리

조건이 맞을 때만 만든다. 항상 만들라는 뜻이 아니다. 단일 워커 순차 작업은 기본 작업공간/브랜치에서 진행하여 오버헤드를 최소화한다.

**만든다** (쓰기가 허용된 모드, git 저장소):

- 동시 병렬 수정(다중 에이전트 동시 변경)이 필요하거나
- 현재 작업공간에 이번 일과 무관한 변경이 있어 충돌 방지 및 격리가 필요하거나
- 사용자가 명시적으로 병렬/격리를 원할 때

위치: 저장소 부모의 `../<repo>-<slug>`, 브랜치 `feat/<slug>`. 이미 있으면 재사용한다. 명령은 [reference.md](reference.md).

**만들지 않는다** (기본 작업공간에서 진행):

- 단일 워커 순차 작업 (기본 작업공간/브랜치 진행 권장)
- Cursor Plan 모드
- git 저장소가 아님 → 현재 폴더에서 진행하고 그 사실을 말한다
- 한두 파일 수정, 문서만, 워크플로 설정만
- 이미 해당 `feat/<slug>` 워크트리 안에 있음

Pi에서는 워크트리를 만든 뒤 그 경로를 작업 `cwd`로 쓴다. Cursor 루트 이동 툴은 없다.

## 웹 검색

외부 API·보안·인프라·처음 쓰는 라이브러리면 검색한다. 이미 아는 코드의 로컬 리팩터는 검색하지 않는다. 「best practices」만 있는 검색은 하지 않는다.

## 프로젝트 문서

저장소에 `docs/README.md`가 있으면 그 표를 따른다. 없으면 `README.md`를 본다.

- 자격 증명·실토큰은 문서·커밋에 넣지 않는다.
- 워크플로 설정(`~/.cursor/...`, `~/.pi/...`, `~/.agents/...`)만 고친 세션에서는 제품 문서에 기능 상태를 적지 않는다.

## Phase 0 — Explore

1. 코드베이스 구조, 설정, 기존 `.docs/*/`·하네스 `docs/<slug>/`의 `EXPLORE-*.md` / `PLAN-*.md`를 검토한다.
2. 코드가 낯설거나 아키텍처/외부 라이브러리 리서치가 필요할 때 `/matt-pocock-atomic-explore`를 실행한다.
3. `subagent`로 `explorer`를 `async: true`로 띄워 [reference.md](reference.md) 템플릿으로 `EXPLORE-<slug>.md`를 작성한다 (제품 기능이면 `.docs/<slug>/`, 워크플로 자체면 `~/.pi/agent/matt-pocock-atomic-workflow/docs/<slug>/`).
4. 핵심 대상 파일, 인터페이스/타입, 아키텍처 흐름, 리스크, 권장 방향을 정리한다.
5. 탐색 완료 후 `node scripts/work-status.mjs sync <slug>`로 STATUS를 갱신하고 `/matt-pocock-atomic-plan`으로 이어지도록 안내한다. 코드를 직접 변경하거나 커밋하지 않는다.

## Phase 1 — Plan

1. 코드·문서·기존 `.docs/*/`·하네스 `docs/<slug>/`의 `EXPLORE-*.md`/`PLAN-*.md`/`TASKS-*.md`를 읽는다. `.docs/<slug>/EXPLORE-<slug>.md`(또는 `docs/<slug>/`)가 있으면 탐색 결과를 계획에 즉시 반영한다.
2. 필요하면 웹 검색. 코드가 낯설고 탐색 보고서가 없으면 Pi에서 `explorer` 또는 `scout`를 먼저 띄워도 된다.
3. 워크트리 규칙에 따라 격리 여부를 정한다 (단일 순차 작업은 기본 작업공간 진행 권장).
4. **부모 오케스트레이터가 먼저 planning preflight를 수행한다.** 패키지에 번들된 `grilling`, `domain-modeling`, `codebase-design`, `wayfinder`를 직접 읽는다. `grilling`의 decision frontier에 사용자 결정이 있으면 번호와 추천 답을 제시하고 답을 기다린다. async `planner`에게 사용자 인터뷰를 떠넘기지 않는다.
5. 작업이 한 세션에 선명하면 `bounded`, 여러 세션·fog·독립 결정이 있으면 `local-wayfinding`으로 라우팅한다. `wayfinder`는 사용자 호출용이므로 사용자가 명시한 경우만 `explicit-wayfinder`로 넘긴다.
6. [reference.md](reference.md) 템플릿으로 PLAN 위치 규칙에 따라 `.docs/<slug>/PLAN-<slug>.md`(워크플로 자체는 `docs/<slug>/PLAN-<slug>.md`)를 쓴다. 부모가 만든 `계획 정제` brief를 planner에게 전달하며, brief가 없으면 PLAN 완료를 허용하지 않는다.
7. 한 줄 목표, 하지 않을 것, 의존 순서, 위험, 막힌 질문과 계획 정제 증거를 넣는다.
8. PLAN 저장 직후 `node scripts/work-status.mjs sync <slug>`로 STATUS를 갱신한다.
9. 막힌 질문·남은 fog가 있거나 사용자가 「계획만」이면 멈추고 계획을 보여 준다. 아니면 **기본 파이프라인**으로 Phase 2부터 자동 진행한다.

## 단계 스킬 (강제)

스킬에는 모델이 없다. Pi 모델은 `settings.json`의 `subagents.agentOverrides.<에이전트>`, Cursor 모델은 `.cursor/agents/<에이전트>.md`의 `model`에 있다. 기본 프리셋은 [models.md](models.md). 단계 에이전트를 띄우고 그 에이전트가 스킬을 읽는다.

필요한 matt-pocock 스킬은 이 Pi 패키지에 번들되며 설치 시 함께 발견된다. 자식 frontmatter는 `inheritSkills: false` + 아래 `skills`를 사용한다. 필수 스킬이 없으면 성공한 척 fallback하지 말고 패키지 설치/리소스 상태를 보고한다. `setup-matt-pocock-skills`와 `implement`는 자동 파이프라인에 넣지 않는다.

| 단계 | 에이전트 | 강제 스킬 | 적용 방식 |
|---|---|---|---|
| explore | `explorer` | `matt-pocock-atomic-workflow` | `.docs/<slug>/EXPLORE-<slug>.md`(워크플로 자체는 `docs/<slug>/`)만 쓴다. 코드베이스 탐색, 인터페이스 식별, 리서치 전담. 코드 수정 금지 |
| plan preflight | 부모 | `grilling`, `domain-modeling`, `codebase-design`, `wayfinder` | 사용자 대화와 bounded/wayfinding 라우팅. refinement brief가 나올 때까지 PLAN 금지 |
| plan | `planner` | `matt-pocock-atomic-workflow`, `codebase-design`, `domain-modeling`, `grilling`, `wayfinder` | 부모 brief를 PLAN으로 구체화. 인터뷰나 tracker 발행 금지 |
| task | `tasker` | `matt-pocock-atomic-workflow`, `to-tickets` | 수직 슬라이스·의존만 가져온다. 산출물은 `.docs/<slug>/TASKS-<slug>.md`(워크플로 자체는 `docs/<slug>/`). 트래커 발행·사용자 퀴즈 금지 |
| execute | `worker` | `matt-pocock-atomic-workflow`, `tdd` | 로직은 red→green. 커밋 금지 |
| review | `reviewer` | `matt-pocock-atomic-workflow`, `code-review` | **Fresh Context 독립 검증**: 작업자 대화 맥락을 상속받지 않고 독립 실행. Standards / Spec 두 축을 **이 에이전트가 직접** 객관적으로 검증 (Spec = PLAN+TASKS와 git diff 대조). 손자 금지. 산출물은 `.docs/<slug>/REVIEW-<slug>.md`(워크플로 자체는 `docs/<slug>/`) |
| test | `tester` | `matt-pocock-atomic-workflow`, `tdd`, `codebase-design` | reviewer 완료 후 로직 diff에 대한 테스트 작성 + mutation 검증. `run-done`으로 증거 검증 |

번들 출처와 revision은 패키지의 `THIRD_PARTY_LICENSES/mattpocock-skills-*`에 기록한다. 별도 `npx skills add`나 `settings.json`의 외부 skills 경로는 필요 없다.

## 오케스트레이션

부모는 파이프라인만 돌린다. 단계 일은 해당 모델의 자식이 한다. Commit만 부모.

Pi 워커: `explorer` · `planner` · `tasker` · `worker` · `reviewer` · `scout` · `oracle` · `self`.
Cursor Task 워커: `explorer` · `planner` · `tasker` · `worker` · `reviewer` · `cli-delegate` · `self`.
Cursor CLI 워커 (TASKS `worker:` opt-in): `agy` · `pi` · `opencode` · `codex` · `claude`.

1. 사용자가 워커를 지목했거나 TASKS에 `worker:`가 있으면 [workers.md](workers.md)를 읽는다. 기본 구현 워커는 `worker`(Pi) 또는 Task `worker`(Cursor).
2. Pi면 `subagent`만 호출한다. Cursor에서 TASKS `worker:`가 `agy|pi|opencode|codex|claude`이면 Task `cli-delegate`로 위임한다. `cli-delegate`는 `invoke-worker.sh`(bash) 또는 `invoke-worker.ps1`(Windows)만 실행한다. 부모는 bare `agy`/`pi`를 직접 실행하지 않는다.
3. 브리프 첫 줄에 강제 스킬 경로. 비밀·토큰·`.env` 금지.
4. 워커가 끝나면 오케스트레이터가 `git diff`와 테스트를 직접 확인한다. 「완료」로그를 믿지 않는다.
5. 워크트리당 쓰기 워커는 하나. 워커는 커밋·푸시하지 않는다.
6. `agy`를 인자 없이 실행하지 않는다 (TUI 정지).

### Challenge / Simplify 선택적 루프 (중대 작업 시)

- **일상 작업**: Worker(구현) → Reviewer(검증)로 직행한다. 불필요한 단계를 추가하지 않는다.
- **선택적 적용 대상**: 대규모 아키텍처 개편, 코어 데이터 모델 변경, 공개 API 설계 등 복잡도가 급증하거나 설계 가정이 위험한 중대 작업.
- **오케스트레이션 지침**:
  - **Simplify (단순화)**: 불필요한 간접 계층(over-engineering)이 없는지 점검하고, 최소한의 개념과 깊은 모듈(deep module)로 단순화하도록 유도한다.
  - **Challenge (설계 도전)**: 핵심 설계 가정, 숨겨진 결함, 엣지 케이스, 비기능 요구사항(동시성·성능·보안)을 비판적으로 도전하여 설계를 검증한다.
  - 부모는 필요 시 Plan 수립 후 또는 대규모 구현 전후에 `oracle` 또는 `scout`를 활용하거나 직접 Challenge/Simplify 점검을 수행할 수 있다.

## Phase 2 — Task

1. `.docs/<slug>/PLAN-<slug>.md`(워크플로 자체는 `docs/<slug>/PLAN-<slug>.md`)를 읽는다. 없으면 Phase 1부터.
2. `tasker`가 같은 슬러그 폴더에 `TASKS-<slug>.md`를 만든다. 각 항목은 한 번에 검증 가능한 크기.
3. `id`, 체크박스, `files`, `depends`, `parallel`, `worker`, `done`을 적는다.
4. 같은 파일을 안 건드리는 독립 항목만 `parallel: yes`.
5. 제품 기능이면 [testing.md](testing.md)대로 테스트 항목을 넣는다. `done`에 실제 명령을 적는다.
6. Pi 구현 항목의 기본 `worker`는 `worker`. 문서 항목은 `self`.
7. TASKS 저장 직후 `node scripts/work-status.mjs sync <slug>`로 STATUS를 갱신한다.
8. 사용자가 「태스크만」이 아니면 **기본 파이프라인**으로 Phase 3으로 간다.

## Phase 3 — Execute

1. `.docs/<slug>/TASKS-<slug>.md`(워크플로 자체는 `docs/<slug>/`)가 없으면 Phase 2를 먼저 한다.
2. `worker`가 `self`이거나 사용자가 `self`를 말한 경우만 이 세션이 구현한다. 기본은 `worker`.
3. Pi에서 `worker` / 모델 별칭은 `subagent`로 위임한다. Cursor CLI면 invoke 스크립트만 쓴다.
4. 항목마다: 위임 → [testing.md](testing.md)의 `done` 명령을 오케스트레이터가 `run-done`으로 실행 → `.done.json` 증거 확인 → `[x]` → `node scripts/work-status.mjs sync <slug>`. 실패하면 `막힘:`과 로그 경로를 남기고 `sync <slug>` 후 멈춘다.
5. **막힘 재개**: 실패한 항목만 재시도한다. 이미 [x]는 유지한다. 재시도 시작 때 그 항목의 `막힘:`만 지운다. 입구는 `/matt-pocock-atomic-execute`이다. 사람 게이트는 PLAN(Phase 1)만이며 막힘 재개는 정책으로 자동 실행된다.
6. PLAN의 「하지 않을 것」을 지킨다. 커밋하지 않는다.
7. 열린 항목이 없고 「구현만」이 아니면 **기본 파이프라인**으로 Phase 4로 간다.

## Phase 4 — Review

`reviewer`는 작업자(`worker`)의 대화 맥락을 상속받지 않는 **독립 fresh 컨텍스트**로 실행된다. 작업자의 주관적 설명이나 변명에 의존하지 않고, 오직 요구사항 명세(PLAN, TASKS), 실제 코드 변경(`git diff`), 테스트/린트 결과만을 대조하여 Standards(품질/규격)와 Spec(명세 일치도)을 객관적으로 독립 검증한다.

1. [testing.md](testing.md)를 읽고 저장소의 단위 테스트·린트를 실행한다. 없으면 REVIEW에 「없음」을 적는다. `run-done`으로 테스트를 실행하고 `.done.json` 증거를 확인한다. 없으면 REVIEW에 「없음」을 적는다.
2. TASKS의 완료 조건과 diff를 대조한다. 빠진 테스트·문서를 적는다.
3. `tester`가 작성한 테스트와 mutation 검증 결과를 확인한다. tester 이후에 테스트를 재검증한다.
4. 로직 파일이 바뀌었으면 이번 파일만 mutation (`npx stryker run --mutate <파일>`). 생존한 인증·계약 돌연변이는 결함이다. 설정이 없으면 설치하지 않는다.
5. `reviewer`가 `.docs/<slug>/REVIEW-<slug>.md`(워크플로 자체는 `docs/<slug>/`)를 쓴다. 실패한 테스트나 break 미만 mutation을 통과로 쓰지 않는다.
6. **리뷰 재작업**: REVIEW 결함을 열린 TASKS로 되돌리거나 새 항목을 붙인 뒤 worker → reviewer를 한 번만 자동 재실행한다. 한 바퀴 후에도 결함이면 멈추고 보고한다. 사람 게이트는 PLAN(Phase 1)만이며 리뷰 재작업 1회는 정책으로 자동 실행된다.
7. 제품 기능이 끝났고 검사가 통과하면 `docs/README.md` 표대로 문서를 갱신한다.
8. REVIEW 저장 직후 `node scripts/work-status.mjs sync <slug>`로 STATUS를 갱신한다. 커밋하지 않는다. `/matt-pocock-atomic-wrapup`을 안내한다.

## Phase 5 — Wrapup

1. `/matt-pocock-atomic-wrapup` 또는 「커밋해」/「마무리」가 있을 때만 한다. 서브에이전트에 넘기지 않는다.
2. `git status` / `git diff` / `git log`를 본 뒤, 비밀 파일은 제외하고 커밋한다. PLAN/TASKS/REVIEW는 기본적으로 커밋하지 않는다.
3. 슬러그 폴더의 산출물 복사본을 하네스 `evidence/<YYYY-MM-DD>-<slug>/`에 둔다. 원본은 슬러그 폴더에 남긴다.
4. 푸시하지 않는다. 커밋 해시와 남은 일을 보고한다.
5. 커밋 성공 후 `node scripts/work-status.mjs sync <slug> commit`으로 전역 상태를 갱신한다. 파이프라인 종료(완료)는 `node scripts/work-status.mjs sync <slug> complete`(또는 `complete <slug>`)다. 푸시만으로는 `STATUS.json`이 바뀌지 않는다.

## Status

기본은 전역 목록이다. `node scripts/work-status.mjs list` (`npm run status`)로 `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/STATUS.json` 전체를 보고한다. 현재 작업공간 하나만 보여 주지 않는다. 인자에 슬러그가 있으면 `show <slug>`다. 목록·상세에는 Cursor `sessionId`를 포함한다. 레거시 `.docs/*/`, 형제 워크트리 `.docs/*/`, 하네스 `docs/<slug>/`는 목록에 없는 것만 덧붙인다. 루트/홈에 남은 레거시 평탄 파일은 언급만 하고 자동 이동하지 않는다. 막힘 발생 시 실패한 항목만 재시도하도록 다음 커맨드로 `/matt-pocock-atomic-execute`를 안내한다.
