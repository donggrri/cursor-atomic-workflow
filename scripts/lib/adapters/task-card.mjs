import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getRole } from "../roles.mjs";

/** @type {Record<string, string[]>} */
const ROLE_SKILL_DIRS = {
  explorer: ["matt-pocock-atomic-workflow"],
  planner: ["matt-pocock-atomic-workflow", "codebase-design", "grilling"],
  tasker: ["matt-pocock-atomic-workflow", "to-tickets"],
  worker: ["matt-pocock-atomic-workflow", "tdd"],
  reviewer: ["matt-pocock-atomic-workflow", "code-review"],
  tester: ["matt-pocock-atomic-workflow", "tdd", "codebase-design"],
  "cli-delegate": ["matt-pocock-atomic-workflow"],
};

/**
 * Target repo `.cursor/skills/<name>/SKILL.md` when that file exists.
 * Otherwise `~/.cursor/skills/<name>/SKILL.md`.
 *
 * @param {string} repoRoot
 * @param {string} skillName
 * @param {{ homeDir?: string, exists?: (path: string) => boolean }} [options]
 * @returns {string}
 */
export function resolveSkillPath(repoRoot, skillName, options = {}) {
  const exists = options.exists ?? existsSync;
  const home = options.homeDir ?? homedir();
  const repoFile = join(resolve(repoRoot), ".cursor", "skills", skillName, "SKILL.md");
  if (exists(repoFile)) return repoFile;
  return join(home, ".cursor", "skills", skillName, "SKILL.md");
}

/**
 * @param {string} repoRoot
 * @param {string} role
 * @param {string} body
 * @param {{ homeDir?: string, exists?: (path: string) => boolean }} [options]
 */
function formatPrompt(repoRoot, role, body, options) {
  const dirs = ROLE_SKILL_DIRS[role] ?? ["matt-pocock-atomic-workflow"];
  const skillLines = dirs.map((name) => resolveSkillPath(repoRoot, name, options));
  const tail = (body ?? "").trim();
  return tail ? `${skillLines.join("\n")}\n${tail}` : skillLines.join("\n");
}

/**
 * @param {{ runsDir: string, slug: string, repoRoot: string, homeDir?: string, exists?: (path: string) => boolean }} options
 */
export function createTaskCardAdapter({ runsDir, slug, repoRoot, homeDir, exists }) {
  const skillOptions = { homeDir, exists };
  return {
    mode: "task-card",
    /**
     * @param {{ role: string, prompt?: string, cwd?: string, model?: string }} params
     */
    async runRole({ role, prompt }) {
      const roleDef = getRole(role);
      const card = {
        subagent_type: roleDef.subagentType,
        model: roleDef.taskModel,
        run_in_background: true,
        prompt: formatPrompt(repoRoot, role, prompt ?? "", skillOptions),
      };

      mkdirSync(runsDir, { recursive: true });
      const cardPath = join(runsDir, "next-card.json");
      writeFileSync(cardPath, `${JSON.stringify(card, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify(card, null, 2)}\n`);

      const message = "task-card pending parent";
      return {
        ok: false,
        kind: "run",
        message,
        card,
        slug,
      };
    },
  };
}
