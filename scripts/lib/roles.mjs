/** @typedef {{ id: string, params?: Array<{ id: string, value: string }> }} SdkModel */

/** @typedef {{ subagentType: string, taskModel: string, sdk: SdkModel }} RoleDef */

/** @type {Record<string, RoleDef>} */
export const ROLES = {
  explorer: {
    subagentType: "explorer",
    taskModel: "composer-2.5",
    sdk: {
      id: "glm-5p3-flash",
      params: [{ id: "effort", value: "max" }],
    },
  },
  planner: {
    subagentType: "planner",
    taskModel: "claude-opus-5-5-high",
    sdk: {
      id: "claude-opus-5-5",
      params: [
        { id: "effort", value: "high" },
        { id: "context", value: "300k" },
        { id: "fast", value: "false" },
      ],
    },
  },
  "plan-reviewer": {
    subagentType: "plan-reviewer",
    taskModel: "grok-4.7-high",
    sdk: {
      id: "grok-4.7",
      params: [{ id: "reasoning_effort", value: "high" }],
    },
  },
  tasker: {
    subagentType: "tasker",
    taskModel: "composer-2.5",
    sdk: {
      id: "glm-5p3-flash",
      params: [{ id: "effort", value: "max" }],
    },
  },
  worker: {
    subagentType: "worker",
    taskModel: "composer-2.5",
    sdk: {
      id: "glm-5p3-flash",
      params: [{ id: "effort", value: "max" }],
    },
  },
  reviewer: {
    subagentType: "matt-pocock-atomic-reviewer",
    taskModel: "grok-4.7-xhigh",
    taskModelFallback: "claude-sonnet-5-5-high",
    sdk: {
      id: "grok-4.7",
      params: [{ id: "reasoning_effort", value: "xhigh" }],
    },
  },
  tester: {
    subagentType: "tester",
    taskModel: "composer-2.5",
    sdk: {
      id: "glm-5p3-flash",
      params: [{ id: "effort", value: "max" }],
    },
  },
  "cli-delegate": {
    subagentType: "cli-delegate",
    taskModel: "composer-2.5",
    sdk: {
      id: "glm-5p3-flash",
      params: [{ id: "effort", value: "max" }],
    },
  },
};

/** @returns {string[]} */
export function roleNames() {
  return Object.keys(ROLES);
}

/**
 * @param {string} name
 * @returns {RoleDef}
 */
export function getRole(name) {
  const role = ROLES[name];
  if (!role) {
    throw new Error(`Unknown role: ${name}`);
  }
  return role;
}

/**
 * @param {string} name role key in ROLES
 * @returns {string} agent markdown file name
 */
export function agentFileName(name) {
  return `${getRole(name).subagentType}.md`;
}

/**
 * @param {string} modelId
 * @returns {string}
 */
export function modelFamily(modelId) {
  if (modelId.startsWith("composer-")) return "composer";
  if (modelId.startsWith("muse-spark-")) return "muse-spark";
  if (modelId.startsWith("claude-")) return "claude";
  if (modelId.startsWith("gpt-")) return "gpt";
  if (modelId.startsWith("grok-")) return "grok";
  if (modelId.startsWith("gemini-")) return "gemini";
  if (modelId.startsWith("kimi-")) return "kimi";
  const first = modelId.split("-")[0];
  return first || modelId;
}
