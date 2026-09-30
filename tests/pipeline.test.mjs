/**
 * Pipeline runner seam (T3 implements scripts/lib/pipeline.mjs).
 *
 * import { runPipeline } from "../scripts/lib/pipeline.mjs";
 *
 * runPipeline({
 *   repoRoot,       // absolute path to product repo (non-git folder ok)
 *   slug,           // kebab-case slug
 *   flags: { auto: boolean, resume: boolean, dryRun: boolean },
 *   adapter,        // { runRole({ role, prompt, cwd, model }) -> Promise<
 *                   //   { ok: true, summary: string } |
 *                   //   { ok: false, kind: "startup"|"run", message: string }
 *                   // > }
 *   runDone,        // ({ taskId, command, cwd }) -> Promise<{ ok: boolean, message?: string }>
 *   statusSync,     // (slug) -> Promise<void>
 *   clock,          // () => Date | ISO string
 *   log,            // (...args) => void
 *   docsHome,       // optional; default join(workflowHome,"docs")
 *   runsHome,       // optional; default join(workflowHome,"runs")
 *   now,            // optional ISO string for timestamps (overrides clock when writing state)
 * }) -> Promise<{ exitCode: number, state: object }>
 *
 * Fixture layout (workflowHome = MATT_POCOCK_WORKFLOW_HOME or docsHome/../):
 *   docsHome/<shortRepo>/<slug>/PLAN-<slug>.md
 *   docsHome/<shortRepo>/<slug>/TASKS-<slug>.md
 *   docsHome/<shortRepo>/<slug>/REVIEW-<slug>.md
 *   runsHome/<shortRepo>/<slug>/pipeline.json
 *   runsHome/<shortRepo>/<slug>/next-card.json  (task-card adapter)
 *
 * shortRepo: basename(repoRoot) kebab-case, max 24 chars (see work-status getShortRepo).
 * Test repo basename is fixed to "pipe-repo" → shortRepo "pipe-repo".
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getWorkflowPaths } from "../scripts/work-status.mjs";
import { runPipeline } from "../scripts/lib/pipeline.mjs";
import { resolvePipelineAdapter } from "../scripts/run-pipeline.mjs";
import { createSdkAdapter, loadSdk } from "../scripts/lib/adapters/sdk.mjs";
import { createTaskCardAdapter } from "../scripts/lib/adapters/task-card.mjs";

const SLUG = "pipe-run";
const REPO_BASENAME = "pipe-repo";

function planMd(blockedSection) {
  return `# PLAN: pipeline test

## 막힌 질문

${blockedSection}
`;
}

function tasksTwoItems({ t1Checked = false, t2Checked = false, t2Worker = "worker" } = {}) {
  const c1 = t1Checked ? "x" : " ";
  const c2 = t2Checked ? "x" : " ";
  return `# TASKS: pipe

PLAN: PLAN-${SLUG}.md
상태: Phase 2

## 진행

- [${c1}] T1 first task
  - id: T1
  - files: \`src/a.mjs\`
  - depends: (없음)
  - parallel: no
  - worker: worker
  - done: \`node -e "process.exit(0)"\`

- [${c2}] T2 second task
  - id: T2
  - files: \`src/b.mjs\`
  - depends: T1
  - parallel: no
  - worker: ${t2Worker}
  - done: \`node -e "process.exit(0)"\`
`;
}

function reviewMd(defectsBody) {
  return `# REVIEW: pipe

TASKS: TASKS-${SLUG}.md

## 결함

${defectsBody}
`;
}

function createFixture(home, { planBlocked = "없음", tasksContent, pipelineJson } = {}) {
  const repoRoot = join(home, REPO_BASENAME);
  mkdirSync(repoRoot, { recursive: true });
  const paths = getWorkflowPaths(repoRoot, SLUG);
  mkdirSync(paths.docsDir, { recursive: true });
  writeFileSync(join(paths.docsDir, `PLAN-${SLUG}.md`), planMd(planBlocked), "utf8");
  writeFileSync(
    join(paths.docsDir, `TASKS-${SLUG}.md`),
    tasksContent ?? tasksTwoItems(),
    "utf8"
  );
  if (pipelineJson !== undefined) {
    mkdirSync(paths.runsDir, { recursive: true });
    writeFileSync(
      join(paths.runsDir, "pipeline.json"),
      JSON.stringify(pipelineJson, null, 2),
      "utf8"
    );
  }
  return { repoRoot, paths };
}

function pipelineOpts(repoRoot, home, overrides = {}) {
  return {
    repoRoot,
    slug: SLUG,
    flags: { auto: false, resume: false, dryRun: false, ...overrides.flags },
    docsHome: join(home, "docs"),
    runsHome: join(home, "runs"),
    clock: () => new Date("2026-09-29T00:00:00.000Z"),
    now: "2026-09-29T00:00:00.000Z",
    log: () => {},
    ...overrides,
  };
}

function readTasks(home, repoRoot) {
  const { docsDir } = getWorkflowPaths(repoRoot, SLUG);
  return readFileSync(join(docsDir, `TASKS-${SLUG}.md`), "utf8");
}

function taskLineChecked(tasksText, taskId) {
  const re = new RegExp(`- \\[([ x])\\] ${taskId}\\b`);
  const m = tasksText.match(re);
  assert.ok(m, `task line for ${taskId}`);
  return m[1] === "x";
}

async function withHome(fn) {
  const home = mkdtempSync(join(tmpdir(), "pipeline-wf-"));
  const orig = process.env.MATT_POCOCK_WORKFLOW_HOME;
  process.env.MATT_POCOCK_WORKFLOW_HOME = home;
  try {
    await fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
    if (orig !== undefined) process.env.MATT_POCOCK_WORKFLOW_HOME = orig;
    else delete process.env.MATT_POCOCK_WORKFLOW_HOME;
  }
}

test("1 정상 완주 — exit 0, TASKS [x], statusSync, pipeline.json", async () => {
  await withHome(async (home) => {
    const { repoRoot, paths } = createFixture(home);
    const syncCalls = [];
    let reviewerPass = 0;

    const adapter = {
      async runRole({ role }) {
        if (role === "reviewer") {
          reviewerPass += 1;
          writeFileSync(
            join(paths.docsDir, `REVIEW-${SLUG}.md`),
            reviewMd("없음"),
            "utf8"
          );
        }
        return { ok: true, summary: `${role} ok` };
      },
    };

    const result = await runPipeline(
      pipelineOpts(repoRoot, home, {
        flags: { auto: true, resume: false, dryRun: false },
        adapter,
        runDone: async () => ({ ok: true }),
        statusSync: async (slug) => {
          assert.equal(slug, SLUG);
          syncCalls.push(slug);
        },
      })
    );

    assert.equal(result.exitCode, 0);
    const tasks = readTasks(home, repoRoot);
    assert.ok(taskLineChecked(tasks, "T1"));
    assert.ok(taskLineChecked(tasks, "T2"));
    assert.ok(syncCalls.length >= 4, "statusSync at least once per major stage");
    assert.ok(existsSync(join(paths.runsDir, "pipeline.json")));
    assert.equal(reviewerPass, 1);
  });
});

test("2 done 실패 — exit 30, 막힘 on T1, preserve [x], skip T2", async () => {
  await withHome(async (home) => {
    const tasksContent = `# TASKS: pipe

- [x] T0 preserved
  - id: T0
  - worker: worker
  - done: \`true\`

- [ ] T1 fails done
  - id: T1
  - depends: (없음)
  - worker: worker
  - done: \`false\`

- [ ] T2 never runs
  - id: T2
  - depends: T1
  - worker: worker
  - done: \`true\`
`;
    const { repoRoot } = createFixture(home, { tasksContent });
    const roles = [];

    const result = await runPipeline(
      pipelineOpts(repoRoot, home, {
        flags: { auto: true, resume: false, dryRun: false },
        adapter: {
          async runRole({ role }) {
            roles.push(role);
            return { ok: true, summary: "ok" };
          },
        },
        runDone: async ({ taskId }) => {
          if (taskId === "T1") return { ok: false, message: "done command failed" };
          return { ok: true };
        },
        statusSync: async () => {},
      })
    );

    assert.equal(result.exitCode, 30);
    const tasks = readTasks(home, repoRoot);
    assert.ok(taskLineChecked(tasks, "T0"));
    assert.ok(!taskLineChecked(tasks, "T1"));
    assert.ok(!taskLineChecked(tasks, "T2"));
    assert.match(tasks, /막힘:/);
    assert.ok(!roles.includes("worker") || roles.filter((r) => r === "worker").length <= 1);
    assert.equal(roles.filter((r) => r === "worker").length, 1);
  });
});

test("3 리뷰 재작업 1회 후에도 결함 — exit 40, reviewer 2회만", async () => {
  await withHome(async (home) => {
    const { repoRoot, paths } = createFixture(home, {
      tasksContent: tasksTwoItems({ t2Checked: false }),
    });
    let reviewerCalls = 0;

    const adapter = {
      async runRole({ role }) {
        if (role === "reviewer") {
          reviewerCalls += 1;
          const body = reviewerCalls === 1 ? "- spec gap in T1" : "- still broken";
          writeFileSync(join(paths.docsDir, `REVIEW-${SLUG}.md`), reviewMd(body), "utf8");
        }
        return { ok: true, summary: `${role} ok` };
      },
    };

    const result = await runPipeline(
      pipelineOpts(repoRoot, home, {
        flags: { auto: true, resume: false, dryRun: false },
        adapter,
        runDone: async () => ({ ok: true }),
        statusSync: async () => {},
      })
    );

    assert.equal(result.exitCode, 40);
    assert.equal(reviewerCalls, 2);
  });
});

test("4 시작 실패 재시도 후 — exit 50 (startup x2 on same step)", async () => {
  await withHome(async (home) => {
    const { repoRoot } = createFixture(home);
    let calls = 0;

    const result = await runPipeline(
      pipelineOpts(repoRoot, home, {
        flags: { auto: true, resume: false, dryRun: false },
        adapter: {
          async runRole() {
            calls += 1;
            return { ok: false, kind: "startup", message: "CursorAgentError: auth" };
          },
        },
        runDone: async () => ({ ok: true }),
        statusSync: async () => {},
      })
    );

    assert.equal(result.exitCode, 50);
    assert.equal(calls, 2);
  });
});

test("5 막힌 질문 게이트 — exit 20, adapter 0회", async () => {
  await withHome(async (home) => {
    const { repoRoot } = createFixture(home, {
      planBlocked: "- 데이터를 삭제해도 되는가?",
    });
    let calls = 0;

    const result = await runPipeline(
      pipelineOpts(repoRoot, home, {
        adapter: {
          async runRole() {
            calls += 1;
            return { ok: true, summary: "ok" };
          },
        },
        runDone: async () => ({ ok: true }),
        statusSync: async () => {},
      })
    );

    assert.equal(result.exitCode, 20);
    assert.equal(calls, 0);
  });
});

test("6 비용 게이트 — exit 20 then auto or costAck+resume", async () => {
  await withHome(async (home) => {
    const tasksContent = `# TASKS: pipe

- [ ] T1 only
  - id: T1
  - depends: (없음)
  - worker: worker
  - done: \`node -e "process.exit(0)"\`
`;
    const { repoRoot, paths } = createFixture(home, { tasksContent });

    let adapterCalls = 0;
    const adapter = {
      async runRole({ role }) {
        adapterCalls += 1;
        if (role === "reviewer") {
          writeFileSync(
            join(paths.docsDir, `REVIEW-${SLUG}.md`),
            reviewMd("없음"),
            "utf8"
          );
        }
        return { ok: true, summary: "ok" };
      },
    };

    const base = {
      adapter,
      runDone: async () => ({ ok: true }),
      statusSync: async () => {},
    };

    const gated = await runPipeline(
      pipelineOpts(repoRoot, home, { ...base, flags: { auto: false, resume: false, dryRun: false } })
    );
    assert.equal(gated.exitCode, 20);
    assert.equal(adapterCalls, 0);

    adapterCalls = 0;
    const autoRun = await runPipeline(
      pipelineOpts(repoRoot, home, {
        ...base,
        flags: { auto: true, resume: false, dryRun: false },
      })
    );
    assert.equal(autoRun.exitCode, 0);
    assert.ok(adapterCalls > 0);

    adapterCalls = 0;
    mkdirSync(paths.runsDir, { recursive: true });
    writeFileSync(
      join(paths.runsDir, "pipeline.json"),
      JSON.stringify({ costAck: true, cursor: { phase: "cost-gate" } }, null, 2),
      "utf8"
    );

    const resumed = await runPipeline(
      pipelineOpts(repoRoot, home, {
        ...base,
        flags: { auto: false, resume: true, dryRun: false },
      })
    );
    assert.equal(resumed.exitCode, 0);
    assert.ok(adapterCalls > 0);
  });
});

test("7 cli-delegate 항목 — worker agy → exit 10, 이후 미실행", async () => {
  await withHome(async (home) => {
    const tasksContent = `# TASKS: pipe

- [ ] T1 cli delegate
  - id: T1
  - depends: (없음)
  - worker: agy
  - done: \`echo agy\`

- [ ] T2 after delegate
  - id: T2
  - depends: T1
  - worker: worker
  - done: \`node -e "process.exit(0)"\`
`;
    const { repoRoot, paths } = createFixture(home, { tasksContent });
    const roles = [];

    const result = await runPipeline(
      pipelineOpts(repoRoot, home, {
        flags: { auto: true, resume: false, dryRun: false },
        adapter: {
          async runRole({ role }) {
            roles.push(role);
            return { ok: true, summary: "ok" };
          },
        },
        runDone: async () => ({ ok: true }),
        statusSync: async () => {},
      })
    );

    assert.equal(result.exitCode, 10);
    assert.ok(existsSync(join(paths.runsDir, "pipeline.json")));
    const tasks = readTasks(home, repoRoot);
    assert.ok(!taskLineChecked(tasks, "T1"));
    assert.ok(!taskLineChecked(tasks, "T2"));
    assert.deepEqual(roles.filter((r) => r === "worker"), []);
  });
});

test("8 resume 커서 복원 — T1 스kip, T2부터", async () => {
  await withHome(async (home) => {
    const { repoRoot, paths } = createFixture(home, {
      tasksContent: tasksTwoItems({ t1Checked: true, t2Checked: false }),
      pipelineJson: {
        cursor: { phase: "execute", taskId: "T2" },
        reworkUsed: false,
        costAck: true,
      },
    });

    const workerTasks = [];
    let reviewerRan = false;

    const result = await runPipeline(
      pipelineOpts(repoRoot, home, {
        flags: { auto: true, resume: true, dryRun: false },
        adapter: {
          async runRole({ role, prompt }) {
            if (role === "worker") {
              workerTasks.push(prompt?.includes("T2") ? "T2" : "other");
            }
            if (role === "reviewer") {
              reviewerRan = true;
              writeFileSync(
                join(paths.docsDir, `REVIEW-${SLUG}.md`),
                reviewMd("없음"),
                "utf8"
              );
            }
            return { ok: true, summary: "ok" };
          },
        },
        runDone: async ({ taskId }) => {
          workerTasks.push(`done:${taskId}`);
          return { ok: true };
        },
        statusSync: async () => {},
      })
    );

    assert.equal(result.exitCode, 0);
    assert.ok(!workerTasks.includes("done:T1"));
    assert.ok(workerTasks.includes("done:T2"));
    assert.equal(reviewerRan, true);
    assert.ok(taskLineChecked(readTasks(home, repoRoot), "T1"));
    assert.ok(taskLineChecked(readTasks(home, repoRoot), "T2"));
  });
});

test("9 task-card 어댑터 — exit 10 + next-card.json, resume after TASKS 산출물", async () => {
  await withHome(async (home) => {
    const { repoRoot, paths } = createFixture(home, {
      planBlocked: "없음",
      tasksContent: undefined,
      pipelineJson: undefined,
    });
    writeFileSync(join(paths.docsDir, `PLAN-${SLUG}.md`), planMd("없음"), "utf8");
    writeFileSync(join(paths.docsDir, `TASKS-${SLUG}.md`), tasksTwoItems(), "utf8");

    const taskCardAdapter = {
      mode: "task-card",
      async runRole({ role }) {
        const card = {
          subagent_type: role === "tasker" ? "tasker" : role,
          model: "composer-2.5",
          run_in_background: true,
          prompt: `run ${role}`,
        };
        mkdirSync(paths.runsDir, { recursive: true });
        writeFileSync(join(paths.runsDir, "next-card.json"), JSON.stringify(card, null, 2), "utf8");
        return { ok: false, kind: "run", message: "task-card pending parent" };
      },
    };

    const first = await runPipeline(
      pipelineOpts(repoRoot, home, {
        flags: { auto: true, resume: false, dryRun: false },
        adapter: taskCardAdapter,
        runDone: async () => ({ ok: true }),
        statusSync: async () => {},
      })
    );

    assert.equal(first.exitCode, 10);
    const cardPath = join(paths.runsDir, "next-card.json");
    assert.ok(existsSync(cardPath));
    const card = JSON.parse(readFileSync(cardPath, "utf8"));
    assert.equal(card.subagent_type, "tasker");
    assert.equal(card.model, "composer-2.5");
    assert.equal(card.run_in_background, true);

    writeFileSync(
      join(paths.runsDir, "pipeline.json"),
      JSON.stringify(
        {
          cursor: { phase: "tasker", role: "tasker" },
          costAck: true,
          adapter: "task-card",
        },
        null,
        2
      ),
      "utf8"
    );

    let reviewerCalls = 0;
    const resumeAdapter = {
      mode: "task-card",
      async runRole({ role }) {
        if (role === "reviewer") {
          reviewerCalls += 1;
          writeFileSync(
            join(paths.docsDir, `REVIEW-${SLUG}.md`),
            reviewMd("없음"),
            "utf8"
          );
          return { ok: true, summary: "review ok" };
        }
        if (role === "tasker") {
          return { ok: true, summary: "tasker artifact present" };
        }
        return { ok: true, summary: `${role} ok` };
      },
    };

    const second = await runPipeline(
      pipelineOpts(repoRoot, home, {
        flags: { auto: true, resume: true, dryRun: false },
        adapter: resumeAdapter,
        runDone: async () => ({ ok: true }),
        statusSync: async () => {},
      })
    );

    assert.equal(second.exitCode, 0);
    assert.ok(taskLineChecked(readTasks(home, repoRoot), "T1"));
    assert.ok(taskLineChecked(readTasks(home, repoRoot), "T2"));
    assert.ok(reviewerCalls >= 1);
  });
});

test("10 SDK 미설치(loadSdk null) — resolvePipelineAdapter가 task-card 선택", async () => {
  await withHome(async (home) => {
    const { repoRoot } = createFixture(home);
    const hints = [];
    const { adapter, used } = await resolvePipelineAdapter({
      adapterName: null,
      repo: repoRoot,
      slug: SLUG,
      loadSdkFn: async () => null,
      logHint: (m) => hints.push(m),
    });
    assert.equal(used, "task-card");
    assert.equal(adapter.mode, "task-card");
    assert.ok(hints.some((h) => h.includes("@cursor/sdk")));
    assert.equal(hints.length, 1);
    assert.match(hints[0], /task-card selected:/);
    const paths = getWorkflowPaths(repoRoot, SLUG);
    assert.equal(
      readFileSync(join(paths.runsDir, "pipeline.log"), "utf8"),
      `${hints[0]}\n`,
    );
  });
});

test("11 sdk adapter — Agent.create startup throw → kind startup", async () => {
  class CursorAgentError extends Error {
    constructor(message) {
      super(message);
      this.name = "CursorAgentError";
    }
  }

  const fakeSdk = {
    CursorAgentError,
    Agent: {
      async create() {
        throw new CursorAgentError("Authentication required");
      },
    },
  };

  const adapter = await createSdkAdapter({
    repoRoot: process.cwd(),
    sdk: fakeSdk,
  });
  assert.equal(adapter?.mode, "sdk");

  const result = await adapter.runRole({
    role: "worker",
    prompt: "noop",
    cwd: process.cwd(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.kind, "startup");
  assert.match(result.message, /Authentication/i);
});

test("12 loadSdk — import 실패 시 null (과금 없음)", async () => {
  const mod = await loadSdk(async () => {
    const err = new Error("Cannot find package '@cursor/sdk'");
    err.code = "ERR_MODULE_NOT_FOUND";
    throw err;
  });
  assert.equal(mod, null);
});

test("13 SDK import 성공 — 기본 어댑터는 sdk, task-card 로그 없음", async () => {
  await withHome(async (home) => {
    const { repoRoot, paths } = createFixture(home);
    const hints = [];
    const fakeSdk = {
      Agent: {
        async create() {
          throw new Error("runRole must not be called");
        },
      },
    };
    const { adapter, used } = await resolvePipelineAdapter({
      adapterName: null,
      repo: repoRoot,
      slug: SLUG,
      loadSdkFn: async () => fakeSdk,
      logHint: (m) => hints.push(m),
    });
    assert.equal(used, "sdk");
    assert.equal(adapter.mode, "sdk");
    assert.deepEqual(hints, []);
    assert.equal(existsSync(join(paths.runsDir, "pipeline.log")), false);
  });
});

test("14 이 패키지 @cursor/sdk import가 되면 task-card로 떨어지지 않는다", async (t) => {
  const sdk = await loadSdk();
  if (!sdk) {
    t.skip("@cursor/sdk optional dependency is not installed");
    return;
  }
  await withHome(async (home) => {
    const { repoRoot } = createFixture(home);
    const hints = [];
    const { adapter, used } = await resolvePipelineAdapter({
      adapterName: null,
      repo: repoRoot,
      slug: SLUG,
      logHint: (m) => hints.push(m),
    });
    assert.equal(used, "sdk");
    assert.equal(adapter?.mode, "sdk");
    assert.deepEqual(hints, []);
  });
});

test("15 SDK 모듈은 있으나 어댑터 객체가 없으면 task-card를 고르지 않는다", async () => {
  await withHome(async (home) => {
    const { repoRoot } = createFixture(home);
    const hints = [];
    const { adapter, used } = await resolvePipelineAdapter({
      adapterName: null,
      repo: repoRoot,
      slug: SLUG,
      loadSdkFn: async () => ({ Agent: {} }),
      createSdkAdapterFn: async () => null,
      logHint: (m) => hints.push(m),
    });
    assert.equal(used, "sdk");
    assert.equal(adapter, null);
    assert.equal(hints.length, 1);
    assert.doesNotMatch(hints[0], /^task-card selected:/);
  });
});

test("16 명시적 task-card — 이유 한 줄, import는 호출하지 않음", async () => {
  await withHome(async (home) => {
    const { repoRoot } = createFixture(home);
    const hints = [];
    let imported = false;
    const { adapter, used } = await resolvePipelineAdapter({
      adapterName: "task-card",
      repo: repoRoot,
      slug: SLUG,
      loadSdkFn: async () => {
        imported = true;
        return { Agent: {} };
      },
      logHint: (m) => hints.push(m),
    });
    assert.equal(imported, false);
    assert.equal(used, "task-card");
    assert.equal(adapter.mode, "task-card");
    assert.deepEqual(hints, ["task-card selected: --adapter task-card"]);
    const paths = getWorkflowPaths(repoRoot, SLUG);
    assert.equal(
      readFileSync(join(paths.runsDir, "pipeline.log"), "utf8"),
      "task-card selected: --adapter task-card\n",
    );
  });
});

test("17 --adapter sdk 인데 import 실패 — task-card로 떨어지지 않음", async () => {
  await withHome(async (home) => {
    const { repoRoot } = createFixture(home);
    const hints = [];
    const { adapter, used } = await resolvePipelineAdapter({
      adapterName: "sdk",
      repo: repoRoot,
      slug: SLUG,
      loadSdkFn: (importFn, onError) =>
        loadSdk(async () => {
          throw new Error("sdk-probe-missing");
        }, onError),
      logHint: (m) => hints.push(m),
    });
    assert.equal(used, "sdk");
    assert.equal(adapter, null);
    assert.equal(hints.length, 1);
    assert.match(hints[0], /@cursor\/sdk/);
    assert.match(hints[0], /sdk-probe-missing/);
    assert.doesNotMatch(hints[0], /^task-card selected:/);
  });
});

test("18 import 실패 이유가 task-card 선택 로그 한 줄에 포함", async () => {
  await withHome(async (home) => {
    const { repoRoot } = createFixture(home);
    const hints = [];
    const { adapter, used } = await resolvePipelineAdapter({
      adapterName: null,
      repo: repoRoot,
      slug: SLUG,
      loadSdkFn: (importFn, onError) =>
        loadSdk(async () => {
          throw new Error("Cannot find package '@cursor/sdk' probe-token");
        }, onError),
      logHint: (m) => hints.push(m),
    });
    assert.equal(used, "task-card");
    assert.equal(adapter.mode, "task-card");
    assert.equal(hints.length, 1);
    assert.match(hints[0], /task-card selected:/);
    assert.match(hints[0], /probe-token/);
    const paths = getWorkflowPaths(repoRoot, SLUG);
    assert.equal(readFileSync(join(paths.runsDir, "pipeline.log"), "utf8"), `${hints[0]}\n`);
  });
});

test("19 task-card 스킬 경로 — 저장소 파일이 있을 때만 그 경로", async () => {
  await withHome(async (home) => {
    const { repoRoot, paths } = createFixture(home);
    const skillHome = join(home, "cursor-home");
    const repoWorkflow = join(
      repoRoot,
      ".cursor",
      "skills",
      "matt-pocock-atomic-workflow",
      "SKILL.md",
    );
    const repoTickets = join(repoRoot, ".cursor", "skills", "to-tickets", "SKILL.md");
    const homeTickets = join(skillHome, ".cursor", "skills", "to-tickets", "SKILL.md");
    const homeWorkflow = join(
      skillHome,
      ".cursor",
      "skills",
      "matt-pocock-atomic-workflow",
      "SKILL.md",
    );
    mkdirSync(join(repoWorkflow, ".."), { recursive: true });
    writeFileSync(repoWorkflow, "# repo workflow\n", "utf8");
    mkdirSync(join(homeTickets, ".."), { recursive: true });
    writeFileSync(homeTickets, "# home tickets\n", "utf8");
    mkdirSync(join(homeWorkflow, ".."), { recursive: true });
    writeFileSync(homeWorkflow, "# home workflow\n", "utf8");

    const adapter = createTaskCardAdapter({
      runsDir: paths.runsDir,
      slug: SLUG,
      repoRoot,
      homeDir: skillHome,
    });
    await adapter.runRole({ role: "tasker", prompt: "split tasks" });
    const card = JSON.parse(readFileSync(join(paths.runsDir, "next-card.json"), "utf8"));
    assert.ok(card.prompt.includes(repoWorkflow));
    assert.ok(card.prompt.includes(homeTickets));
    assert.equal(card.prompt.includes(repoTickets), false);
    assert.equal(card.prompt.includes(homeWorkflow), false);

    const emptyRepo = join(home, "empty-repo");
    mkdirSync(emptyRepo, { recursive: true });
    const adapterEmpty = createTaskCardAdapter({
      runsDir: paths.runsDir,
      slug: SLUG,
      repoRoot: emptyRepo,
      homeDir: skillHome,
    });
    await adapterEmpty.runRole({ role: "tasker", prompt: "again" });
    const cardEmpty = JSON.parse(readFileSync(join(paths.runsDir, "next-card.json"), "utf8"));
    const missingRepoWorkflow = join(
      emptyRepo,
      ".cursor",
      "skills",
      "matt-pocock-atomic-workflow",
      "SKILL.md",
    );
    assert.ok(cardEmpty.prompt.includes(homeWorkflow));
    assert.ok(cardEmpty.prompt.includes(homeTickets));
    assert.equal(cardEmpty.prompt.includes(missingRepoWorkflow), false);
    assert.equal(cardEmpty.prompt.includes(repoWorkflow), false);
  });
});
