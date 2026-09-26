# 하네스 어댑터

SKILL.md를 먼저 읽는다. 커맨드 스킬(`matt-pocock-atomic-*`)과 이 스킬 본문은 하네스 중립 문구로 쓴다. 하네스마다 다른 부분은 이 문서 하나에서만 정한다.

## 하네스 판별

1. `PI_CODING_AGENT` 또는 `PI_SESSION_ID` 환경 변수가 있으면 **Pi**.
2. 없으면 사용 가능한 도구로 가른다.

| 하네스 | 판별 단서 |
|---|---|
| Cursor | Task 툴에 `subagent_type`이 있고, `.cursor/agents/`의 에이전트가 목록에 보인다. Cloud Agent는 `CURSOR_CONVERSATION_ID`(`bc-…`)가 있다 |
| OpenCode | `task` 툴과 `skill` 툴이 있고, `.opencode/agents/`의 에이전트가 목록에 보인다 |
| Claude Code | Agent(Task) 툴이 있고, `.claude/agents/`의 에이전트가 목록에 보인다 |
| Codex | `spawn_agent` 계열 툴이 있다 |

판별이 안 되면 서브에이전트 없이 이 세션이 `self`로 진행하고 그 사실을 보고한다.

## 서브에이전트 띄우기

본문에서 "`<에이전트>` 서브에이전트를 백그라운드로 띄운다"는 아래 뜻이다. 어느 하네스든 브리프 첫 줄에 강제 스킬 경로를 적고, 비밀·토큰·`.env`는 넣지 않는다.

| 하네스 | 호출 | 에이전트 정의 | 단계 모델 설정 |
|---|---|---|---|
| Pi | `subagent` 툴, `async: true` | 패키지 `agents/<에이전트>.md` | `~/.pi/agent/settings.json`의 `subagents.agentOverrides.<에이전트>` (`model`, `fallbackModels`) |
| Cursor | Task 툴 `subagent_type: <에이전트>`, 백그라운드 | `.cursor/agents/<에이전트>.md` | 그 파일의 `model` frontmatter |
| OpenCode | `task` 툴 `subagent_type: <에이전트>` 또는 `@<에이전트>` | `.opencode/agents/<에이전트>.md` | 그 파일의 `model` frontmatter |
| Claude Code | Agent 툴로 `<에이전트>` 서브에이전트, 백그라운드 | `.claude/agents/<에이전트>.md` | 그 파일의 `model` frontmatter |
| Codex | `spawn_agent`. 에이전트 정의가 없으므로 message에 역할과 강제 스킬 경로를 직접 적는다 | 없음 | 세션 모델 |

- Pi에서 Cursor/Antigravity 모델을 쓰는 자식은 `async: true`로 띄운다. 포그라운드에는 확장 프로바이더가 없다.
- 모델 폴백 체인(`fallbackModels`)은 Pi에만 있다. 다른 하네스는 지정 모델이 실패하면 그 사실을 보고한다.
- TASKS `worker:`가 `agy|pi|opencode|codex|claude`이면 `cli-delegate`를 띄운다. `cli-delegate`는 [workers.md](../workers.md)의 `invoke-worker.sh`(bash) 또는 `invoke-worker.ps1`(Windows)만 실행한다.

## 커맨드 입력

커맨드 스킬의 "입력"은 사용자가 커맨드 뒤에 붙인 텍스트다.

| 하네스 | 커맨드 | 입력이 들어오는 방식 |
|---|---|---|
| Pi | `/matt-pocock-atomic-<이름>` (패키지 prompt shim) 또는 `/skill:matt-pocock-atomic-<이름>` | shim의 `입력:` 줄 또는 스킬 뒤에 붙는 사용자 요청 |
| Cursor | `/matt-pocock-atomic-<이름>` (스킬 직접 호출) | 스킬과 함께 보낸 메시지 |
| OpenCode | `/matt-pocock-atomic-<이름>` (`.opencode/commands/` shim) | shim의 `입력:` 줄 (`$ARGUMENTS`) |
| Claude Code | `/matt-pocock-atomic-<이름>` (스킬 직접 호출) | 스킬과 함께 보낸 메시지 |
| Codex | `$matt-pocock-atomic-<이름>` | 같은 프롬프트의 나머지 텍스트 |

입력이 비어 있으면 각 커맨드 스킬이 정한 기본값을 쓴다.

## 스크립트 경로

문서의 `scripts/<파일>`(`work-status.mjs`, `run-done.mjs`)은 아래 순서로 찾는다.

1. 이 패키지 저장소 안이면 루트 `scripts/<파일>`.
2. 그 외에는 이 스킬 디렉터리의 `scripts/<파일>`. 설치 프로젝트에서는 보통 `.agents/skills/matt-pocock-atomic-workflow/scripts/<파일>`, Claude Code 설치는 `.claude/skills/matt-pocock-atomic-workflow/scripts/<파일>`이다.

## 하네스 전용 도구

- Cursor 전용: `rename_chat`, `move_agent_to_root`. 다른 하네스에서는 부르지 않는다.
- Pi 전용: `contact_supervisor`, `subagent`.
- 셸이 PowerShell(Windows)이면 heredoc 대신 here-string을 쓰고, CLI 위임은 [workers.md](../workers.md)의 PowerShell 경로를 쓴다.
