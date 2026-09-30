---
name: matt-pocock-atomic-config
description: "matt-pocock-atomic-workflow 설정(모델, 폴백, 스킬 등)을 조회하고 대화형으로 변경/초기화한다. 사용자가 직접 호출할 때만 쓴다."
disable-model-invocation: true
metadata:
  argument-hint: "[show | init | <agent> <model>]"
---

# /matt-pocock-atomic-config

입력: `show`, `init`, 또는 `<agent> <model>`. 비어 있으면 `show`로 본다.

`matt-pocock-atomic-workflow` 스킬을 참고하여 matt-pocock-atomic-workflow 관련 설정을 확인하고 관리한다. 단계 모델을 어디에 저장하는지는 하네스마다 다르다. `references/harness.md`의 「서브에이전트 띄우기」 표를 따른다.

## Pi

1. `~/.pi/agent/settings.json`(및 현재 프로젝트 `.pi/settings.json`이 있으면 함께)을 읽는다.
2. 현재 `subagents.agentOverrides`에 등록된 matt-pocock-atomic-workflow 에이전트 설정 현황을 정리해 보여준다:
   - `explorer` (Phase 0 탐색)
   - `planner` (Phase 1 계획)
   - `tasker` (Phase 2 태스크)
   - `worker` (Phase 3 실행)
   - `reviewer` (Phase 4 검토)
   - `tester`, `cli-delegate`
   - 기타 빌트인 에이전트(`scout`, `oracle`, `delegate` 등)
   - `packages` 목록
   - 설치된 패키지 안의 번들 스킬 `grilling`, `domain-modeling`, `codebase-design`, `wayfinder`, `to-tickets`, `tdd`, `code-review` 발견 여부
3. 입력에 따른 처리:
   - `show` (기본값):
     - **설정이 이미 존재하는 경우**: 현재 설정 상태를 보기 쉬운 표로 출력하고 수정 옵션을 안내한다.
     - **설정이 비어 있거나 미설정인 경우**:
       1. `pi --list-models` 등으로 현재 환경에서 사용 가능한 Provider 및 주요 모델을 확인한다.
       2. 사용자에게 사용 가능한 주요 모델 목록과 함께 matt-pocock-atomic-workflow 단계별 최적 추천 프리셋(예: Antigravity 조합, 혼합 성능 최적화 조합 등)을 제시하고 선택할 수 있도록 안내한다.
       3. 사용자의 선택 또는 답변에 따라 `settings.json`의 `subagents.agentOverrides`를 즉시 생성 및 저장한다.
   - `init`: `settings.example.json`을 기반으로 `~/.pi/agent/settings.json`의 `subagents.agentOverrides`를 안전하게 병합/초기화한다. 기존 `packages`, `skills`, 기타 설정은 보존한다. 번들 스킬 때문에 외부 `~/.codex/skills` 경로를 추가하지 않는다.
   - `<agent> <model>`: 지정된 에이전트의 `model`(및 필요시 `fallbackModels`)을 `settings.json`에 직접 업데이트한다.
   - 사용자가 대화로 특정 단계 모델 변경을 요청하면 이를 파악하여 `settings.json`을 올바르게 수정한다.
4. 주의사항:
   - Pi에서는 에이전트 `.md` 파일의 frontmatter를 직접 수정하지 말고 반드시 `settings.json`의 `subagents.agentOverrides`를 수정한다.
   - JSON 문법이 깨지지 않도록 유효성을 확인한 후 저장한다.
   - 수정 후에는 Pi 재시작 시 적용됨을 안내한다.
   - 필수 번들 스킬이 없으면 fallback 성공으로 표시하지 말고 패키지 revision/설치 상태를 점검하라고 안내한다.

## Cursor · OpenCode · Claude Code

1. 현재 프로젝트의 에이전트 파일(`.cursor/agents/`, `.opencode/agents/`, `.claude/agents/` 중 현재 하네스 것)을 읽고 에이전트별 `model` frontmatter를 표로 보여준다. `model`이 없거나 `inherit`이면 세션 모델을 따른다고 적는다.
2. `<agent> <model>`이면 그 파일의 `model` frontmatter만 바꾼다. 본문은 고치지 않는다.
3. 패키지를 다시 설치(`--force`)하면 이 변경이 덮어써진다고 안내한다. 설치할 때 고정하려면 `node scripts/install.mjs --harness <하네스> --set-model <agent>=<model>`을 쓴다.
4. `fallbackModels` 체인은 없다고 안내한다.

한국어로 명확하고 친절하게 결과를 보고한다.
