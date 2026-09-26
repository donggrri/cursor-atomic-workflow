# matt-pocock-atomic-workflow 모델

SKILL.md를 먼저 읽는다. 위임할 모델이 필요할 때만 연다.

스킬에는 모델이 없다. 단계마다 **에이전트**를 띄워야 모델이 갈린다. 그 에이전트가 스킬을 읽는다.

## 기본값

아래가 패키지 기본 프리셋이다. 설치 직후 이 값으로 동작한다. 바꾸려면 Cursor는 `.cursor/agents/<에이전트>.md`의 `model`, Pi는 `settings.json`의 `agentOverrides`만 고친다.

| 에이전트 | Cursor 기본 | Pi 기본 | Pi 폴백 |
|---|---|---|---|
| `explorer` | `cursor-grok-4.6-high` | `xai/grok-4.6` | `antigravity/gemini-3-1-pro:high` |
| `planner` | `claude-opus-5-thinking-high` | `antigravity/claude-sonnet-4-6` | `xai/grok-4.6` |
| `tasker` | `claude-sonnet-5-thinking-medium` | `cursor/composer-2.5` | `antigravity/gemini-3-8-flash:high` |
| `worker` | `composer-2.5` | `cursor/composer-2.5` | `xai/grok-4.6` |
| `reviewer` | `claude-sonnet-5-thinking-high` | `antigravity/claude-sonnet-4-6` | `xai/grok-4.6` |
| `tester` | (Cursor 에이전트 없음 · worker와 동일 권장 `composer-2.5`) | `cursor/composer-2.5` | `xai/grok-4.6` |
| `cli-delegate` | `inherit` | `antigravity/gemini-3-8-flash:high` | `cursor/composer-2.5` |
| commit/status/config | 현재 세션 | 현재 세션 | — |

`reviewer`는 `worker`와 다른 계열을 쓴다. 같은 모델이면 구현 실수에 둔감해진다.

`scout`/`researcher`는 explorer와 같고, `oracle`은 planner와 같다.

## 설정 위치

| 하네스 | 설정 경로 |
|---|---|
| Cursor | `.cursor/agents/<에이전트>.md` frontmatter `model` |
| Pi | `~/.pi/agent/settings.json` → `subagents.agentOverrides.<에이전트명>` |

Pi 에이전트 `.md` frontmatter에는 `model` 키를 두지 않는다. 넣으면 settings override가 무시된다.

Pi 자식 세션은 `provider/id` 또는 `provider/id:thinking`으로 고른다. Cursor와 Antigravity는 확장 프로바이더라서 이 모델을 쓰는 자식은 `async: true`(백그라운드)여야 한다.

## 단계 기본값

| 단계 | 에이전트 | 강제 스킬 | 설정 키 |
|---|---|---|---|
| explore / recon | `explorer` / `scout` | `matt-pocock-atomic-workflow` | `explorer`, `scout` |
| plan | `planner` | `matt-pocock-atomic-workflow`, `codebase-design` | `planner` |
| task | `tasker` | `matt-pocock-atomic-workflow`, `to-tickets` | `tasker` |
| execute | `worker` | `matt-pocock-atomic-workflow`, `tdd` | `worker` |
| review | `reviewer` | `matt-pocock-atomic-workflow`, `code-review` | `reviewer` |
| test | `tester` | `matt-pocock-atomic-workflow`, `tdd`, `codebase-design` | `tester` |
| commit/status/config | parent | (없음) | (현재 세션 모델) |

## 폴백 계약

pi-subagents `fallbackModels`는 **툴을 쓰기 전** 재시도 가능한 공급자 실패에만 다음 모델로 넘어간다.

포함: 구독 쿼터, 429, 모델 불가, 오버로드, 공급자 타임아웃.

포함하지 않음: 작업 실패, 런 타임아웃, 툴을 이미 쓴 뒤의 일반 오류.

Cursor에는 `fallbackModels`가 없다. 지정 모델이 없으면 Cursor가 호환 모델로 폴백한다.

체인이 모두 실패하면 그 오류를 보고하고 멈춘다. 부모는 모델을 즉석에서 추측해 바꾸지 않는다.

## `/matt-pocock-atomic-execute` 별칭

특정 모델을 직접 지정하고 싶을 때 부모가 `agentOverrides`를 임시로 덮어쓰거나 다음 별칭 힌트를 참고한다:

- `agy` / `sonnet` → `antigravity/claude-sonnet-4-6`
- `pro` → `antigravity/gemini-3-1-pro:high`
- `flash` → `antigravity/gemini-3-8-flash:high`

`AskAntigravity`는 폴백이 없다. 사용자가 agy CLI 원샷을 분명히 원할 때만 쓴다.
