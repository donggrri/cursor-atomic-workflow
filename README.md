English | [한국어](README.kr.md)

# cursor-atomic-workflow

Cursor SDK workflow (`cursor-sdk`). Technical identifiers stay `cursor-atomic-*`.

Atomic explore → plan → task → execute → review workflow for Cursor (SDK runner + Task subagents).
`/cursor-atomic-explore` (optional) → `/cursor-atomic-plan` → `/cursor-atomic-task` → `/cursor-atomic-execute` → `/cursor-atomic-review` → `/cursor-atomic-wrapup`

Slash commands keep the `cursor-atomic-` prefix from the upstream workflow, but the package itself is **Cursor-only**.

---

## Table of contents

1. [What this package installs](#1-what-this-package-installs)
2. [Install into a project](#2-install-into-a-project)
3. [Usage](#3-usage)
4. [Automated pipeline runner](#4-automated-pipeline-runner)
5. [Per-phase models](#5-per-phase-models)
6. [Don'ts](#6-donts)
7. [Bundled upstream skills](#7-bundled-upstream-skills)
8. [Maintaining this package](#8-maintaining-this-package)
9. [Future work](#9-future-work)

---

## 1. What this package installs

Everything installs into the target Cursor project:

| Component | Location | Role |
|---|---|---|
| Command skills | `.cursor/skills/cursor-atomic-<name>/SKILL.md` | Each one is a slash command (`/cursor-atomic-plan`, …) and holds the command logic |
| Workflow skill | `.cursor/skills/cursor-atomic-workflow/` | Orchestration docs (`CONTEXT.md`, `reference.md`, `workers.md`, `testing.md`, `models.md`), the Cursor harness adapter (`references/harness.md`), and bundled copies of `work-status.mjs` / `run-done.mjs` |
| Subagents | `.cursor/agents/*.md` | 8 agents: `explorer`, `planner`, `plan-reviewer`, `tasker`, `worker`, `cursor-atomic-reviewer`, `tester`, `cli-delegate` |
| Runner scripts | `scripts/` | `install.mjs`, `run-pipeline.mjs`, `doctor.mjs`, `check-agents.mjs`, `work-status.mjs`, `run-done.mjs`, `lib/` |

Requires Node `>=22.13`. `@cursor/sdk` is an optional dependency at the package root and powers the SDK adapter of the pipeline runner.

The bundled upstream skills snapshot records its source, revision, and MIT license in `THIRD_PARTY_LICENSES/mattpocock-skills-*`.

---

## 2. Install into a project

From this repository (or an installed npm package directory), run:

```bash
node scripts/install.mjs --target /path/to/project
```

| Option | Meaning |
|---|---|
| `--target <dir>` | Target project (default: current directory) |
| `--skills-dir <path>` | Skills destination (default: `.cursor/skills`) |
| `--force` | Overwrite existing files (otherwise they are kept) |
| `--set-model <agent>=<model>` | Pin a phase model in the agent frontmatter (repeatable) |
| `--no-skills` / `--no-agents` | Skip a component |
| `-h, --help` | Help |

```bash
# reinstall over an existing install and pin a model
node scripts/install.mjs --target /path/to/project --force --set-model worker=composer-2.5
```

If the project still has an older install's `.cursor/commands/cursor-atomic-*.md`, delete those files: the command skills now provide the same slash commands, and keeping both shows each command twice. The installer and `doctor` list them.

Check the install state any time:

```bash
node scripts/doctor.mjs        # skill collisions, YAML frontmatter, bundled script sync, install state (--fix applies auto-fixes)
node scripts/check-agents.mjs  # .cursor/agents models match scripts/lib/roles.mjs
```

---

## 3. Usage

Default: once **PLAN is confirmed**, the pipeline runner runs **plan-review** (critical PLAN critique) → task → execute → review automatically. Commit only happens with `/cursor-atomic-wrapup`.

| Command | Role | Output |
|---|---|---|
| `/cursor-atomic-explore` | Phase 0: explore the codebase and tech in advance (optional) | `~/.cursor-atomic-workflow/docs/{shortRepo}/{slug}/EXPLORE-<slug>.md` (legacy: `.docs/<slug>/`) |
| `/cursor-atomic-plan` | Default pipeline after Phase 1 | `~/.cursor-atomic-workflow/docs/{shortRepo}/{slug}/PLAN-<slug>.md` + TASKS/code/REVIEW automatically |
| `/cursor-atomic-task` | Force Phase 2 only, or continue automatically | `~/.cursor-atomic-workflow/docs/{shortRepo}/{slug}/TASKS-<slug>.md` |
| `/cursor-atomic-execute` | Force Phase 3 only, or continue automatically | code changes + checked-off TASKS |
| `/cursor-atomic-delegate` | Phase 3: delegate to a specific worker | same |
| `/cursor-atomic-agy` | Delegate a user request to agy headless (plan: plan doc only, implement: code) | plan file under .cursor/plans/ or code changes |
| `/cursor-atomic-review` | Phase 4 | `~/.cursor-atomic-workflow/docs/{shortRepo}/{slug}/REVIEW-<slug>.md` |
| `/cursor-atomic-wrapup` | Phase 5: wrapup (commit, no push) | git commit + STATUS |
| `/cursor-atomic-run` | Explicit pipeline entry: skip triage and run the workflow from explore | same as plan |
| `/cursor-atomic-status` | Progress report (`npm run status` / `STATUS.json`) | text summary / table |
| `/cursor-atomic-config` | Manage workflow model/skill settings (`/cursor-atomic-settings`) | text/interactive settings |
| `/cursor-atomic-models` | Model settings guide (read-only) | text guide |
| `/cursor-atomic-doctor` | Diagnose skill collisions, YAML frontmatter syntax, and apply auto-fix | text report / auto-fix |

Artifacts live under `~/.cursor-atomic-workflow/docs/{shortRepo}/{slug}/` (override the home with `CURSOR_ATOMIC_WORKFLOW_HOME`).

If PLAN has blocking questions (security, scope, data loss), it stops there. To write a plan only, use `/cursor-atomic-plan 계획만`.

---

## 4. Automated pipeline runner

`scripts/run-pipeline.mjs` runs the phases headlessly instead of driving them from a chat session:

```bash
node scripts/run-pipeline.mjs <slug> [--auto] [--resume] [--adapter sdk|task-card] [--profile <id>] [--repo <dir>] [--dry-run]
```

- `--adapter sdk` (default) drives Cursor Task subagents through `@cursor/sdk`. Without the SDK it falls back to `--adapter task-card`, stops with exit code `10`, and leaves `next-card.json` for the parent session to execute and `--resume`. After the cost gate, **plan-review** runs `plan-reviewer` (writes `PLAN-REVIEW-<slug>.md`); blocking defects trigger one planner auto-revision and re-review, then exit `20` if defects remain. On **Review** entry (initial and after rework), exit `10` may be a **`kind: "bugbot"`** card first: the parent runs Cursor `bugbot`, saves output to `~/.cursor-atomic-workflow/runs/{shortRepo}/{slug}/bugbot-findings.md` (or a `# BUGBOT_FAILED` marker on failure), then `--resume` before the reviewer runs.
- The log lives at `~/.cursor-atomic-workflow/runs/{shortRepo}/{slug}/pipeline.log`; per-step command logs get a `.done.json` summary next to them. With the SDK adapter every role logs `▶ [phase] role started · model=…` and `■ [phase] role done · Ns`, plus nested subagent/status lines (`tail -f pipeline.log` to follow). Set `ATOMIC_PROGRESS=tools` to also log each tool call.
- `--resume` retries failed items (already checked items stay done).
- `--profile <id>` swaps only the plan and test instructions. Omit it and the runner uses the project file `.cursor-atomic-workflow.json`, then `~/.cursor-atomic-workflow/settings.json`, then `atomic`. PLAN, TASKS, and REVIEW stay under `~/.cursor-atomic-workflow/docs/{shortRepo}/{slug}/`. A profile JSON lives in `profiles/<id>.json` (package), `~/.cursor-atomic-workflow/profiles/<id>.json`, or the repo `profiles/<id>.json`. Later locations win. Do not put secrets in that JSON. The bundled `bsp` profile points at `~/edge_bsp_foundation` command files.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Pipeline finished |
| 2 | Usage error |
| 10 | Parent action required (bugbot pre-review card, task-card hand-off, or cli-delegate) |
| 20 | Human gate (PLAN approval, plan-review blocking defects after auto-revision, cost ack, …) |
| 30 | A task item failed, or plan-review step failed (missing/malformed PLAN-REVIEW) |
| 40 | Defects remained after the one rework round |
| 50 | Startup failure |

---

## 5. Per-phase models

The model for a phase is the `model` frontmatter of `.cursor/agents/<agent>.md`, and every Task call passes it explicitly. Defaults come from `scripts/lib/roles.mjs`, and `node scripts/check-agents.mjs` verifies the files still match it:

| Role | subagent_type | Task model |
|---|---|---|
| explorer | `explorer` | `claude-haiku-5-5-high` |
| planner | `planner` | `claude-sonnet-5-5-high` |
| plan-reviewer | `plan-reviewer` | `grok-4.7-high` |
| tasker | `tasker` | `composer-2.5` |
| worker | `worker` | `composer-2.5` |
| reviewer | `cursor-atomic-reviewer` | `claude-sonnet-5-5-high` |
| tester | `tester` | `claude-haiku-5-5-high` |
| cli-delegate | `cli-delegate` | `grok-4.7-high` |

To change a model, edit the agent frontmatter and keep `scripts/lib/roles.mjs` in agreement (`check-agents` fails otherwise), or pin it at install time with `--set-model <agent>=<model>` (repeatable).

---

## 6. Don'ts

- **No push**: `git push` only when you explicitly want it. The agent does not push.
- **No secrets**: Do not commit tokens, API keys, or `.env`, and do not put them in worker briefs.
- **Cursor only**: this package installs into Cursor projects only. It does not set up OpenCode, Claude Code, or Codex.
- **Do not edit installed package files casually**: installed `.cursor/agents/*.md` and skills are overwritten by `--force` reinstalls and package updates. Keep changes in this repository and reinstall.

---

## 7. Bundled upstream skills

Installing this package also installs the skills below, so they are discovered immediately — no separate skill-manager setup needed.

| Phase | Who runs it | Required skills |
|---|---|---|
| plan preflight | parent orchestrator | `grilling`, `domain-modeling`, `codebase-design`, `wayfinder` |
| plan | `planner` | the same skills + `cursor-atomic-workflow` |
| task | `tasker` | `to-tickets` (output is `TASKS-<slug>.md`) |
| execute | `worker` | `tdd` |
| review | `reviewer` | `code-review` (two axes, no grandchildren) |

`grill-me` and `wayfinder` are upstream user-invoked orchestrators with `disable-model-invocation: true`. So `/cursor-atomic-plan` reads and runs the model-invoked `grilling` skill that `grill-me` would otherwise delegate, at the parent stage. Large work is classified as tracker-less `local-wayfinding` by default. The upstream `wayfinder` tracker flow is used only when the user asks for it.

The bundled snapshot's source repository, revision, and MIT license are recorded in `THIRD_PARTY_LICENSES/mattpocock-skills-*`. When you refresh upstream, update the selected directories together and run `npm test` to verify agent references.

---

## 8. Maintaining this package

Edit files in place — there is no generator step.

| Change | Edit |
|---|---|
| Command behavior | `.cursor/skills/cursor-atomic-<name>/SKILL.md` |
| Agent role / per-phase model | `.cursor/agents/<agent>.md` (+ `scripts/lib/roles.mjs`) |
| Harness differences | `.cursor/skills/cursor-atomic-workflow/references/harness.md` |
| Workflow scripts | `scripts/work-status.mjs`, `scripts/run-done.mjs` — keep the copies in `.cursor/skills/cursor-atomic-workflow/scripts/` identical |

```bash
npm test                    # structure, agent, artifact-path and bundled-script sync tests
node scripts/doctor.mjs     # collisions, YAML frontmatter, sync + install state
```

To add a command, create `.cursor/skills/cursor-atomic-<name>/SKILL.md` with `disable-model-invocation: true` and a description ending in "사용자가 직접 호출할 때만 쓴다." (so it only runs when the user calls it), then run `npm test`.

---

## 9. Future work

These items are documented only. They are not implemented in this package yet. Priorities live in [ROADMAP.md](ROADMAP.md) (Korean). Note that ROADMAP's harness-unification section describes the earlier multi-harness structure and predates the Cursor-only rewrite.

- **CONTEXT.md vs `run-done` evidence path**: CONTEXT.md documents `runs/<slug>/<id>.done.json`, while `scripts/run-done.mjs` writes `${logPath}.done.json`.
- **Parallel worktree integration**: there is no merge step for sibling worktrees.
- **PR/CI**: this workflow has no pull-request or CI pipeline.
