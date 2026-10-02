# matt-pocock-atomic-workflow 모델

SKILL.md를 먼저 읽는다. 위임할 모델이 필요할 때만 연다.

## 설정 위치

모델은 에이전트 파일(frontmatter)이 아니라 **settings에서 고른다**.

| 대상 | 설정 경로 |
|---|---|
| explorer, planner, tasker, worker, reviewer | `~/.pi/agent/settings.json` → `subagents.agentOverrides.<에이전트명>` |
| scout, researcher, oracle, delegate (빌트인) | 동일 `agentOverrides` 아래 별도 키 |

각 PC마다 선호 모델이 다를 수 있다. `settings.json`(또는 `settings.example.json`이 있으면 그것을 복사해 `settings.json`으로 만든 뒤)의 `agentOverrides`에서 `model`과 `fallbackModels`를 맞게 채운다. 에이전트 `.md` frontmatter에는 model 키를 두지 않는다.

Pi 자식 세션은 `provider/id` 또는 `provider/id:thinking`으로 고른다. Cursor와 Antigravity는 확장 프로바이더라서 이 모델을 쓰는 자식은 `async: true`(백그라운드)여야 한다.

## Cursor Task 모델

Pi `agentOverrides`와 별도다. Cursor는 에이전트 frontmatter를 호출에 자동으로 넣지 않으므로, 부모가 Task `model`에 아래 슬러그를 넣는다. 단일 소스는 `scripts/sync-harness.mjs`의 `CURSOR_AGENT_MODELS`다. 생성되는 `.cursor/agents/*.md` frontmatter와 이 표는 같다.

| 역할 | subagent_type | model |
|---|---|---|
| explorer | `explorer` | `composer-2.5` |
| planner | `planner` | `claude-opus-5-5-high` |
| plan-reviewer | `plan-reviewer` | `grok-4.7-high` |
| tasker | `tasker` | `composer-2.5` |
| worker | `worker` | `composer-2.5` |
| reviewer | `matt-pocock-atomic-reviewer` | `grok-4.7-xhigh` |
| tester | `tester` | `composer-2.5` |
| cli-delegate | `cli-delegate` | `composer-2.5` |

세션 `available_subagent_models`에 슬러그가 없으면 그 호출은 멈추고 목록을 보고한다. `inherit`로 부모 모델을 쓰지 않는다.

**예외 — bugbot 선행 검토:** 파이프라인 Review 진입 시 `subagent_type: "bugbot"` Task는 위 표·`ROLES`에 없다. 카드에 `model`을 두지 않고 **세션 기본 모델**로 호출한다(`references/harness.md` 「Bugbot 선행 검토 카드」).

## 단계 기본값

스킬에는 모델이 없다. 단계마다 **에이전트**를 띄워야 모델이 갈린다. 그 에이전트가 스킬을 읽는다.

| 단계 | 에이전트 | 강제 스킬 | settings 키 |
|---|---|---|---|
| explore / recon | `explorer` / `scout` | `matt-pocock-atomic-workflow` | `agentOverrides.explorer`, `agentOverrides.scout` |
| plan | `planner` | `matt-pocock-atomic-workflow`, `codebase-design` | `agentOverrides.planner` |
| plan-review | `plan-reviewer` | `matt-pocock-atomic-workflow`, `codebase-design`, `tdd` | `agentOverrides.plan-reviewer` |
| task | `tasker` | `matt-pocock-atomic-workflow`, `to-tickets` | `agentOverrides.tasker` |
| execute | `worker` | `matt-pocock-atomic-workflow`, `tdd` | `agentOverrides.worker` |
| review | `reviewer` | `matt-pocock-atomic-workflow`, `code-review` | `agentOverrides.reviewer` |
| commit/status/config | parent | (없음) | (현재 세션 모델) |

## 폴백 계약

pi-subagents `fallbackModels`는 **툴을 쓰기 전** 재시도 가능한 공급자 실패에만 다음 모델로 넘어간다.

포함: 구독 쿼터, 429, 모델 불가, 오버로드, 공급자 타임아웃.

포함하지 않음: 작업 실패, 런 타임아웃, 툴을 이미 쓴 뒤의 일반 오류.

xAI나 Antigravity 사용량이 끝나면 Cursor `grok-4.6` / `composer-2.5`로 넘어가게 되어 있다. 부모는 모델을 즉석에서 추측해 바꾸지 않는다. 체인이 모두 실패하면 그 오류를 보고하고 멈춘다.

## `/matt-pocock-atomic-execute` 별칭

특정 모델을 직접 지정하고 싶을 때 부모가 `agentOverrides`를 임시로 덮어쓰거나 다음 별칭 힌트를 참고한다:

- `agy` / `sonnet` → `antigravity/claude-sonnet-4-6`
- `pro` → `antigravity/gemini-3-1-pro:high`
- `flash` → `antigravity/gemini-3-8-flash:high`

`AskAntigravity`는 폴백이 없다. 사용자가 agy CLI 원샷을 분명히 원할 때만 쓴다.
