---
name: matt-pocock-atomic-models
description: "matt-pocock-atomic-workflow 단계별 모델 설정을 안내한다. 사용자가 직접 호출할 때만 쓴다."
disable-model-invocation: true
---

# /matt-pocock-atomic-models

이 안내는 **읽기 전용**이다. 파일을 고치지 말고, 아래 내용을 사용자에게 설명한다. 모델을 바꾸려면 `/matt-pocock-atomic-config`를 안내한다.

## 단계별 에이전트

| 단계 | 에이전트 | 강제 스킬 | Pi `agentOverrides` 키 |
|---|---|---|---|
| explore / recon | `explorer` / `scout` | `matt-pocock-atomic-workflow` | `explorer`, `scout` |
| plan | `planner` | `codebase-design` | `planner` |
| task | `tasker` | `to-tickets` | `tasker` |
| execute | `worker` | `tdd` | `worker` |
| test | `tester` | `tdd`, `codebase-design` | `tester` |
| review | `reviewer` | `code-review` | `reviewer` |
| CLI 위임 | `cli-delegate` | `matt-pocock-atomic-workflow` | `cli-delegate` |
| commit/status/config | (현재 세션) | — | — |

스킬에 모델을 붙이지 않는다. 모델은 에이전트에 붙는다. 저장 위치는 하네스마다 다르다(`matt-pocock-atomic-workflow`의 `references/harness.md` 「서브에이전트 띄우기」 표).

## Pi

`/matt-pocock-atomic-config` (또는 `/matt-pocock-atomic-settings`) 커맨드를 사용하면 현재 설정을 바로 조회하고 대화형으로 안전하게 변경할 수 있다.

직접 편집할 경우 `~/.pi/agent/settings.json`의 `subagents.agentOverrides` 안에서 원하는 에이전트 키의 `model`과 `fallbackModels`를 편집한다. 빌트인 에이전트(`oracle`, `delegate` 등)도 같은 `agentOverrides` 아래에서 설정한다.

```json
{
  "subagents": {
    "agentOverrides": {
      "planner": {
        "model": "xai/grok-4.6",
        "fallbackModels": ["antigravity/claude-sonnet-4-6"]
      }
    }
  }
}
```

패키지 루트의 `settings.example.json`을 참고해 처음 설정하면 된다.

- Pi 에이전트 `.md` frontmatter에 `model` 키를 넣으면 안 된다. 그렇게 하면 settings override가 무시된다.
- xAI/Antigravity 쿼터가 소진되면 `fallbackModels` 체인이 자동으로 다음 모델로 넘어간다.
- `AskAntigravity`(agy CLI 원샷)는 폴백이 없다. 사용자가 분명히 원할 때만 쓴다.

## Cursor · OpenCode · Claude Code

- 프로젝트의 `.cursor/agents/<에이전트>.md`, `.opencode/agents/<에이전트>.md`, `.claude/agents/<에이전트>.md` frontmatter의 `model`을 바꾼다.
- 설치할 때 고정하려면 `node scripts/install.mjs --harness <하네스> --set-model <agent>=<model>`을 쓴다.
- `fallbackModels` 체인은 없다. 지정 모델이 실패하면 하네스가 오류를 내거나 자체 폴백을 한다.
