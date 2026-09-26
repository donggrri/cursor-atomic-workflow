English | [한국어](README.kr.md)

# matt-pocock-atomic-workflow

A Pi-based coding workflow package.  
`/matt-pocock-atomic-explore` (optional) → `/matt-pocock-atomic-plan` → `/matt-pocock-atomic-task` → `/matt-pocock-atomic-execute` → `/matt-pocock-atomic-review` → `/matt-pocock-atomic-wrapup`

---

## Table of contents

1. [Install](#1-install)
2. [Merge settings.json](#2-merge-settingsjson)
3. [Login](#3-login)
4. [Remove previous user files](#4-remove-previous-user-files)
5. [Restart Pi](#5-restart-pi)
6. [Usage](#6-usage)
7. [How to change models per phase](#7-how-to-change-models-per-phase)
8. [Don'ts](#8-donts)
9. [Bundled matt-pocock skills](#9-bundled-matt-pocock-skills)
10. [Use in Cursor](#10-use-in-cursor)
11. [Future work](#11-future-work)

---

## 1. Install

```bash
pi install git:github.com/donggrri/pi-subagents
pi install npm:matt-pocock-atomic-workflow
```

Install from Git (alternative):

```bash
pi install git:github.com/donggrri/matt-pocock-atomic-workflow
```

These are optional. Install only what you actually use:

```bash
pi install npm:@rahularya01/pi-cursor                 # Cursor models (`cursor/...`)
pi install git:github.com/donggrri/pi-antigravity-bridge  # Antigravity models (`antigravity/...`) or `agy`
```

---

## 2. Merge settings.json

Copy `settings.example.json` and merge it into `~/.pi/agent/settings.json`. (Or run `/matt-pocock-atomic-config init` in Pi.)

```bash
# If settings.json does not exist, copy it as-is
cp settings.example.json ~/.pi/agent/settings.json

# If it already exists, open both files and merge the agentOverrides block
# (if you have jq)
jq -s '.[0] * .[1]' ~/.pi/agent/settings.json settings.example.json > /tmp/merged.json
mv /tmp/merged.json ~/.pi/agent/settings.json
```

Replace `YOUR_*` placeholders with real model IDs. Use whatever models you want; the IDs below are examples only.

```json
"explorer": {
  "model": "xai/grok-4.6",
  "fallbackModels": ["antigravity/claude-sonnet-4-6"]
},
"planner": {
  "model": "xai/grok-4.6",
  "fallbackModels": ["antigravity/claude-sonnet-4-6"]
}
```

Available agent keys:  
`explorer`, `planner`, `tasker`, `worker`, `reviewer`, `scout`, `oracle`, `researcher`, `delegate`

If your settings still use `g-explorer` / `g-planner` keys, rename them to `explorer` / `planner` / `tasker` / `worker` / `reviewer`.

For per-phase key descriptions and current settings, run `/matt-pocock-atomic-config` or `/matt-pocock-atomic-models` and Pi will walk you through it.

---

## 3. Login

```bash
/login xai
/login cursor   # only if you installed pi-cursor
agy             # only if you installed pi-antigravity-bridge; interactive auth once
```

---

## 4. Remove previous user files

If you previously created copies in your user home, delete them.  
Leaving them in place will shadow the skills, prompts, and agents this package registers, and produce conflict warnings.

```bash
rm ~/.pi/agent/agents/g-*.md
rm ~/.pi/agent/agents/{explorer,planner,tasker,worker,reviewer}.md
rm ~/.pi/agent/prompts/g-*.md ~/.pi/agent/prompts/matt-pocock-atomic-*.md
rm -rf ~/.agents/skills/matt-pocock-atomic-workflow
```

> **Caution**: Compare them with this repository's files first. If there are differences, merge those changes before deleting.

---

## 5. Restart Pi

```bash
# If you use the Pi CLI
pi restart

# Or restart the Pi app
```

After restart, if `/matt-pocock-atomic-plan` appears, installation is complete.

---

## 6. Usage

Default: once **PLAN is confirmed**, task → execute → review run automatically. Commit only happens with `/matt-pocock-atomic-wrapup`.

| Command | Role | Output |
|---|---|---|
| `/matt-pocock-atomic-explore` | Phase 0: explore the codebase and tech in advance (optional) | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/EXPLORE-<slug>.md` (legacy: `.docs/<slug>/`) |
| `/matt-pocock-atomic-plan` | Default pipeline after Phase 1 | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/PLAN-<slug>.md` + TASKS/code/REVIEW automatically |
| `/matt-pocock-atomic-task` | Force Phase 2 only, or continue automatically | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/TASKS-<slug>.md` |
| `/matt-pocock-atomic-execute` | Force Phase 3 only, or continue automatically | code changes + checked-off TASKS |
| `/matt-pocock-atomic-delegate` | Phase 3: delegate to a specific worker | same |
| `/matt-pocock-atomic-review` | Phase 4 | `~/.matt-pocock-workflow/docs/{shortRepo}/{slug}/REVIEW-<slug>.md` |
| `/matt-pocock-atomic-wrapup` | Phase 5: wrapup (commit, no push) | git commit + STATUS |
| `/matt-pocock-atomic-status` | Progress report (`npm run status` / `STATUS.json`) | text summary / table |
| `/matt-pocock-atomic-config` | Manage matt-pocock-atomic-workflow model/skill settings (`/matt-pocock-atomic-settings`) | text/interactive settings |
| `/matt-pocock-atomic-models` | Model settings guide (read-only) | text guide |
| `/matt-pocock-atomic-doctor` | Diagnose skill collisions, YAML frontmatter syntax, and apply auto-fix | text report / auto-fix |

If PLAN has blocking questions (security, scope, data loss), it stops there. To write a plan only, use `/matt-pocock-atomic-plan 계획만`.

To use a different model per phase, pick it per agent in `settings.json` under `subagents.agentOverrides`. You cannot attach a model to a skill itself.

---

## 7. How to change models per phase

The easy way is to run `/matt-pocock-atomic-config <agent> <model>` in a Pi session, or `/matt-pocock-atomic-config` for the interactive flow. Pick any model you want per agent.

To edit it yourself:
1. Open `~/.pi/agent/settings.json` and find the agent key under `subagents.agentOverrides`.
2. Change `model` and `fallbackModels` to the values you want.
3. Restart Pi or start a new conversation for the change to take effect.

```json
{
  "subagents": {
    "agentOverrides": {
      "worker": {
        "model": "xai/grok-4.6",
        "fallbackModels": ["antigravity/claude-sonnet-4-6", "cursor/composer-2.5"]
      }
    }
  }
}
```

**Do not edit agent `.md` files directly.** If you put a `model` key in frontmatter, settings overrides are ignored.  
For more detail, run `/matt-pocock-atomic-models`.

---

## 8. Don'ts

- **No push**: `git push` only when you explicitly want it. The agent does not push.
- **No secrets**: Do not commit tokens, API keys, or `.env`, and do not put them in worker briefs.
- **No Cursor IDE slash commands**: This package is for Pi by default. To use it in Cursor, follow [Use in Cursor](#10-use-in-cursor) instead.
- **Do not edit agent files directly**: Changes to `agents/*.md` and `prompts/*.md` are overwritten on package update. Change models only in settings.json.

---

## 9. Bundled matt-pocock skills

Installing this package also installs the skills below as Pi package resources, so they are discovered immediately. You do not need a separate `npx skills add` or `~/.codex/skills` setup.

| Phase | Who runs it | Required skills |
|---|---|---|
| plan preflight | parent orchestrator | `grilling`, `domain-modeling`, `codebase-design`, `wayfinder` |
| plan | `planner` | the same skills + `matt-pocock-atomic-workflow` |
| task | `tasker` | `to-tickets` (output is `TASKS-<slug>.md`) |
| execute | `worker` | `tdd` |
| review | `reviewer` | `code-review` (two axes, no grandchildren) |

`grill-me` and `wayfinder` are upstream user-invoked orchestrators with `disable-model-invocation: true`. So `/matt-pocock-atomic-plan` reads and runs the model-invoked `grilling` skill that `grill-me` would otherwise delegate, at the parent stage. Large work is classified as tracker-less `local-wayfinding` by default. The upstream `wayfinder` tracker flow is used only when the user asks for it.

The bundled snapshot's source repository, revision, and MIT license are recorded in `THIRD_PARTY_LICENSES/mattpocock-skills-*`. When you refresh upstream, update the selected directories together and run `npm test` to verify agent references.

---

## 10. Use in Cursor

The same subagents and skills run in Cursor. `agents/`, `prompts/`, and `skills/` stay the single source; Cursor-ready files are generated from them.

| Cursor file | Source | What it is |
|---|---|---|
| `.cursor/agents/*.md` (5: `explorer`, `planner`, `tasker`, `worker`, `reviewer`) | `agents/*.md` | Subagents with Cursor frontmatter (`name`, `description`, `model: inherit`, `readonly: false`, `is_background: true`). Invoke with `/explorer` … or "Use the planner subagent …". |
| `.cursor/commands/matt-pocock-atomic-*.md` (12) | `prompts/*.md` | Slash commands as plain markdown (no frontmatter). Text after the command becomes the command's input. |
| `skills/*` (copied as-is) | `skills/*` | Standard Agent Skills, no conversion needed. |

### Install into a project

```bash
# from this repository (or the installed npm package)
node scripts/install-cursor.mjs --target /path/to/project
```

This copies `skills/*` → `<project>/.agents/skills/*` (portable: Cursor, Claude Code, and Codex all read it; pass `--skills-dir .cursor/skills` for a Cursor-only install) plus `.cursor/agents/` and `.cursor/commands/`. Existing files are kept unless you pass `--force`. To pin a phase model at install time, repeat `--set-model`:

```bash
node scripts/install-cursor.mjs --target /path/to/project --set-model worker=composer-2.5[]
```

### Per-phase models and maintenance

- In Cursor, pin a phase model in `.cursor/agents/<agent>.md` frontmatter (`model: composer-2.5[]`, `claude-opus-5[effort=high]`, …). There is no `settings.json` override or `fallbackModels` chain; Cursor falls back to a compatible model automatically.
- Delegation uses the Task tool with background subagents (the Cursor equivalent of Pi's `async: true`).
- After editing `agents/*.md` or `prompts/*.md`, regenerate and verify:

```bash
node scripts/sync-cursor.mjs          # regenerate .cursor/agents + .cursor/commands
node scripts/sync-cursor.mjs --check  # drift check (for CI)
npm test                              # includes cursor-sync tests
node scripts/doctor.mjs               # section 3 checks Cursor sync + install state
```

---

## 11. Future work

These items are documented only. They are not implemented in this package yet. Priorities and the harness-unification plan live in [ROADMAP.md](ROADMAP.md) (Korean).

- **Cursor sync drift**: `tester` is not in Cursor `AGENT_NAMES`. After `prompts/` or `agents/` edits, `node scripts/sync-cursor.mjs` is allowed; do not add `tester` to Cursor `AGENT_NAMES` in this slice.
- **README agent keys**: some package agents (for example `tester`, `cli-delegate`) are missing from the settings key list above.
- **CONTEXT.md vs `run-done` evidence path**: CONTEXT.md documents `runs/<slug>/<id>.done.json`, while `scripts/run-done.mjs` writes `${logPath}.done.json`.
- **Parallel worktree integration**: there is no merge step for sibling worktrees.
- **PR/CI**: this workflow has no pull-request or CI pipeline.
