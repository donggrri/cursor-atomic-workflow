# /matt-pocock-atomic-settings

matt-pocock-atomic-workflow 설정(모델, 폴백, 스킬 등)을 조회하고 대화형으로 변경/초기화한다 (/matt-pocock-atomic-config 별칭).

인자 형식: `[show | init | <agent> <model>]`

`prompts/matt-pocock-atomic-config.md`와 동일하게 matt-pocock-atomic-workflow 설정을 확인하고 관리한다.

인자: show(슬래시 뒤에 붙인 텍스트가 있으면 그것을 우선한다)

하네스를 가른다. Cursor면 `.cursor/agents/<에이전트>.md`의 `model`을, Pi면 `settings.json`의 `agentOverrides`를 읽는다.

기본 프리셋은 `/matt-pocock-atomic-models` 표와 같다 (`explorer` grok-high, `planner` opus-high, `worker` composer-2.5, `reviewer` sonnet-high 등).

동작 규칙:
1. 현재 단계 에이전트 모델과 기본 프리셋 차이를 표로 보여준다.
2. `init`이면 Cursor는 `.cursor/agents`의 `model`을 기본값으로, Pi는 `settings.example.json`을 병합한다.
3. `<agent> <model>`이면 해당 하네스의 설정만 갱신한다.
4. Pi 에이전트 `.md` frontmatter는 직접 고치지 않는다.

한국어로 결과를 보고한다.

---

## Cursor 메모

- 위임은 Task 툴(`/에이전트명` 또는 "Use the ... subagent ...")로 수행한다. Pi의 `subagent` 호출과 동등하다.
- 단계별 모델은 `.cursor/agents/<에이전트>.md`의 `model` frontmatter로 지정한다(Pi의 `settings.json` `agentOverrides` 대신).
- 슬래시 뒤에 붙인 텍스트는 위 본문의 인자 자리에 들어간다.

