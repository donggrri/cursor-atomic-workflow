---
description: matt-pocock-atomic-workflow 단계별 모델 설정을 안내한다.
---
# matt-pocock-atomic-workflow 모델 설정

이 파일은 **읽기 전용**이다. 함부로 고치지 말고, 모델을 바꾸려면 아래 안내에 따라 설정만 편집한다.

## 기본 프리셋

| 에이전트 | Cursor 기본 | Pi 기본 | Pi 폴백 |
|---|---|---|---|
| `explorer` | `cursor-grok-4.6-high` | `xai/grok-4.6` | `antigravity/gemini-3-1-pro:high` |
| `planner` | `claude-opus-5-thinking-high` | `antigravity/claude-sonnet-4-6` | `xai/grok-4.6` |
| `tasker` | `claude-sonnet-5-thinking-medium` | `cursor/composer-2.5` | `antigravity/gemini-3-8-flash:high` |
| `worker` | `composer-2.5` | `cursor/composer-2.5` | `xai/grok-4.6` |
| `reviewer` | `claude-sonnet-5-thinking-high` | `antigravity/claude-sonnet-4-6` | `xai/grok-4.6` |
| `tester` | `composer-2.5` 권장 (Cursor 에이전트 파일 없음) | `cursor/composer-2.5` | `xai/grok-4.6` |
| `cli-delegate` | `inherit` | `antigravity/gemini-3-8-flash:high` | `cursor/composer-2.5` |
| commit/status/config | (현재 세션) | (현재 세션) | — |

`reviewer`는 `worker`와 다른 계열을 유지한다.

## 단계별 에이전트

| 단계 | 에이전트 | 강제 스킬 | 설정 키 |
|---|---|---|---|
| explore / recon | `explorer` / `scout` | `matt-pocock-atomic-workflow` | `explorer`, `scout` |
| plan | `planner` | `codebase-design` | `planner` |
| task | `tasker` | `to-tickets` | `tasker` |
| execute | `worker` | `tdd` | `worker` |
| review | `reviewer` | `code-review` | `reviewer` |
| test | `tester` | `tdd`, `codebase-design` | `tester` |
| commit/status/config | (현재 세션) | — | — |

스킬에 모델을 붙이지 않는다.

## 바꾸는 법

`/matt-pocock-atomic-config` (또는 `/matt-pocock-atomic-settings`)로 조회·변경한다.

- **Cursor**: `.cursor/agents/<에이전트>.md` frontmatter의 `model`만 고친다. 기본값은 위 표이며 `sync-cursor.mjs`가 생성한다.
- **Pi**: `~/.pi/agent/settings.json`의 `subagents.agentOverrides`에서 `model` / `fallbackModels`를 고친다. `settings.example.json`이 기본 프리셋이다.

```json
{
  "subagents": {
    "agentOverrides": {
      "worker": {
        "model": "cursor/composer-2.5",
        "fallbackModels": ["xai/grok-4.6"]
      }
    }
  }
}
```

## 주의

- Pi 에이전트 `.md` frontmatter에 `model` 키를 넣으면 안 된다. settings override가 무시된다.
- Cursor는 `fallbackModels`가 없다. 지정 모델이 없으면 Cursor가 호환 모델로 폴백한다.
- `AskAntigravity`(agy CLI 원샷)는 폴백이 없다. 사용자가 분명히 원할 때만 쓴다.
