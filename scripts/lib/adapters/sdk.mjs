import { resolve } from "node:path";
import { getRole } from "../roles.mjs";

const SETTING_SOURCES = ["user", "project", "plugins"];

/**
 * @param {() => Promise<unknown>} [importFn]
 * @returns {Promise<import("@cursor/sdk") | null>}
 */
export async function loadSdk(importFn, onError) {
  const doImport =
    typeof importFn === "function" ? importFn : () => import("@cursor/sdk");
  try {
    return await doImport();
  } catch (err) {
    if (typeof onError === "function") onError(err);
    return null;
  }
}

/**
 * @param {unknown} err
 * @param {new (...args: unknown[]) => Error} [CursorAgentError]
 */
function isStartupFailure(err, CursorAgentError) {
  if (CursorAgentError && err instanceof CursorAgentError) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /Authentication|Configuration/i.test(msg);
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function safeErrorMessage(err) {
  if (err instanceof Error) {
    return err.message || err.name || "SDK startup failed";
  }
  return String(err);
}

/**
 * @param {{ dispose?: () => Promise<void>, close?: () => Promise<void> }} agent
 */
async function disposeAgent(agent) {
  if (!agent) return;
  const asyncDispose = agent[Symbol.asyncDispose];
  if (typeof asyncDispose === "function") {
    await asyncDispose.call(agent);
    return;
  }
  if (typeof agent.close === "function") {
    await agent.close();
  }
}

/**
 * @param {{ repoRoot: string, sdk?: Awaited<ReturnType<typeof loadSdk>> }} options
 */
export async function createSdkAdapter({ repoRoot, sdk: sdkOverride }) {
  const sdk = sdkOverride ?? await loadSdk();
  if (!sdk) {
    return null;
  }

  const { Agent, CursorAgentError } = sdk;

  return {
    mode: "sdk",
    /**
     * @param {{ role: string, prompt?: string, cwd?: string }} params
     */
    async runRole({ role, prompt, cwd }) {
      const roleDef = getRole(role);
      const workCwd = cwd ?? repoRoot;
      let agent;

      try {
        agent = await Agent.create({
          model: roleDef.sdk,
          local: {
            cwd: resolve(workCwd),
            settingSources: SETTING_SOURCES,
          },
        });

        const run = await agent.send(prompt ?? "");
        const result = await run.wait();

        if (result.status === "error") {
          const message =
            result.error?.message ?? `run status error (${result.id ?? "unknown"})`;
          return { ok: false, kind: "run", message };
        }

        const runId = result.id ?? run.id ?? "unknown";
        return {
          ok: true,
          summary: `status=${result.status} runId=${runId}`,
        };
      } catch (err) {
        if (isStartupFailure(err, CursorAgentError)) {
          return { ok: false, kind: "startup", message: safeErrorMessage(err) };
        }
        throw err;
      } finally {
        if (agent) {
          await disposeAgent(agent);
        }
      }
    },
  };
}
