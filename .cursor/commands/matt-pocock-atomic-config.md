# /matt-pocock-atomic-config

matt-pocock-atomic-workflow 설정(모델, 폴백, 스킬 등)을 조회하고 대화형으로 변경/초기화한다.

인자 형식: `[show | init | <agent> <model>]`

`matt-pocock-atomic-workflow` 스킬과 `models.md`를 참고하여 matt-pocock-atomic-workflow 관련 설정을 확인하고 관리한다.

인자: show(슬래시 뒤에 붙인 텍스트가 있으면 그것을 우선한다)

하네스를 가른다. `PI_CODING_AGENT` 또는 `PI_SESSION_ID`가 있으면 **Pi**. 아니면 **Cursor**.

기본 프리셋:

| 에이전트 | Cursor | Pi |
|---|---|---|
| explorer | `cursor-grok-4.6-high` | `xai/grok-4.6` |
| planner | `claude-opus-5-thinking-high` | `antigravity/claude-sonnet-4-6` |
| tasker | `claude-sonnet-5-thinking-medium` | `cursor/composer-2.5` |
| worker | `composer-2.5` | `cursor/composer-2.5` |
| reviewer | `claude-sonnet-5-thinking-high` | `antigravity/claude-sonnet-4-6` |
| tester | `composer-2.5` 권장 | `cursor/composer-2.5` |
| cli-delegate | `inherit` | `antigravity/gemini-3-8-flash:high` |

동작 규칙:
1. **Cursor**면 `.cursor/agents/*.md`의 `model` frontmatter를 읽는다. **Pi**면 `~/.pi/agent/settings.json`(및 프로젝트 `.pi/settings.json`)의 `subagents.agentOverrides`를 읽는다.
2. 단계 에이전트 현황을 표로 보여준다: `explorer`, `planner`, `tasker`, `worker`, `reviewer`, `tester`(Pi), `cli-delegate`. 기본 프리셋과 다르면 표시한다.
3. 인자 또는 사용자 요청:
   - `show` (기본값): 현재 값을 표로 출력하고 수정 옵션을 안내한다. 비어 있으면 위 기본 프리셋을 제안한다.
   - `init`:
     - Cursor: `.cursor/agents/<에이전트>.md`의 `model`을 위 Cursor 기본값으로 맞춘다. Pi `agents/*.md`는 건드리지 않는다.
     - Pi: `settings.example.json`을 `~/.pi/agent/settings.json`의 `agentOverrides`에 안전하게 병합한다. 기존 `packages`, `skills`는 보존한다.
   - `<agent> <model>`:
     - Cursor: 해당 `.cursor/agents/<agent>.md`의 `model:`만 바꾼다.
     - Pi: `settings.json`의 해당 `agentOverrides`만 바꾼다.
4. 주의:
   - Pi 에이전트 `.md` frontmatter에 `model`을 넣지 않는다.
   - Cursor는 `fallbackModels`가 없다.
   - JSON/YAML이 깨지지 않게 저장한다.
   - Pi는 재시작 또는 새 대화 후 적용됨을 안내한다.

한국어로 명확하고 친절하게 결과를 보고한다.

---

## Cursor 메모

- 위임은 Task 툴(`/에이전트명` 또는 "Use the ... subagent ...")로 수행한다. Pi의 `subagent` 호출과 동등하다.
- 단계별 모델은 `.cursor/agents/<에이전트>.md`의 `model` frontmatter로 지정한다(Pi의 `settings.json` `agentOverrides` 대신).
- 슬래시 뒤에 붙인 텍스트는 위 본문의 인자 자리에 들어간다.

