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
import {

  PLAN_REVIEW_DEFECTS_HEADING,
  planReviewPath,
  parsePlanReview,
  planReviewHasDefects,
  planReviewGate,
} from "../scripts/lib/plan-review.mjs";

const SLUG = "plan-review";
const REPO_ROOT = "/tmp/plan-review-repo";

/** @param {string} prefix */
function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** @param {string} body */
function planReviewDoc(body) {
  return `# PLAN-REVIEW\n\n${PLAN_REVIEW_DEFECTS_HEADING}\n\n${body}\n\n## 개선 제안\n\n(none)\n`;
}

test("PLAN_REVIEW_DEFECTS_HEADING", () => {
  assert.equal(PLAN_REVIEW_DEFECTS_HEADING, "## 계획 결함");
});

test("planReviewPath joins docsDir with PLAN-REVIEW file", () => {
  assert.equal(
    planReviewPath("/docs/my-slug", "my-slug"),
    join("/docs/my-slug", "PLAN-REVIEW-my-slug.md")
  );
});

test("parsePlanReview: 없음 -> wellFormed, no defects", () => {
  assert.deepEqual(parsePlanReview(planReviewDoc("없음")), {
    wellFormed: true,
    hasDefects: false,
  });
});

test("parsePlanReview: defect bullets -> hasDefects", () => {
  const text = planReviewDoc("- [설계] missing test — breaks contract");
  assert.deepEqual(parsePlanReview(text), {
    wellFormed: true,
    hasDefects: true,
  });
  assert.equal(planReviewHasDefects(text), true);
});

test("parsePlanReview: missing defects section -> not wellFormed", () => {
  const text = "# PLAN-REVIEW\n\n## 개선 제안\n\n- tip\n";
  assert.deepEqual(parsePlanReview(text), {
    wellFormed: false,
    hasDefects: false,
  });
});

test("parsePlanReview: ### subsection stays in defects body", () => {
  const text = planReviewDoc("### detail\n- blocking item\n");
  assert.deepEqual(parsePlanReview(text), {
    wellFormed: true,
    hasDefects: true,
  });
});

test("parsePlanReview: ## 결함 does not satisfy plan-review section", () => {
  const text = `# REVIEW\n\n## 결함\n\n- T1: bug\n\n${PLAN_REVIEW_DEFECTS_HEADING}\n\n없음\n`;
  assert.deepEqual(parsePlanReview(text), {
    wellFormed: true,
    hasDefects: false,
  });
  const onlyLegacy = "## 결함\n\n- real bug\n";
  assert.deepEqual(parsePlanReview(onlyLegacy), {
    wellFormed: false,
    hasDefects: false,
  });
});

/** @param {{
 *   docsDir: string,
 *   runsDir: string,
 *   planReview?: object,
 *   planText?: string,
 *   planReviewText?: string | null,
 *   runRole?: (role: string, prompt: string) => Promise<{ ok: boolean, exitCode?: number }>,
 *   isBlocked?: (planText: string) => boolean,
 * }} opts */
function gateEnv(opts) {
  const docsDir = opts.docsDir;
  mkdirSync(docsDir, { recursive: true });
  const planPath = join(docsDir, `PLAN-${SLUG}.md`);
  const reviewPath = planReviewPath(docsDir, SLUG);
  const planText = opts.planText ?? "# PLAN\n\n## 막힌 질문\n\n없음\n";
  writeFileSync(planPath, planText, "utf8");
  if (opts.planReviewText !== undefined && opts.planReviewText !== null) {
    writeFileSync(reviewPath, opts.planReviewText, "utf8");
  }
  const logLines = [];
  const saves = [];
  const roles = [];
  const defaultRunRole = async (role, prompt) => {
    roles.push({ role, prompt });
    return { ok: true };
  };
  return {
    planPath,
    reviewPath,
    logLines,
    saves,
    roles,
    async runGate(planReview = opts.planReview ?? {}) {
      return planReviewGate({
        planReview,
        slug: SLUG,
        repoRoot: REPO_ROOT,
        planPath,
        planReviewPath: reviewPath,
        runsDir: opts.runsDir,
        runRole: opts.runRole ?? defaultRunRole,
        isBlocked: opts.isBlocked ?? (() => false),
        save: (pr) => {
          saves.push(structuredClone(pr));
        },
        appendLog: (line) => {
          logLines.push(line);
        },
      });
    },
  };
}

test("planReviewGate: first review passes (SDK path)", async () => {
  const runsDir = makeTempDir("pr-pass-");
  const docsDir = join(runsDir, "docs");
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      planReviewText: null,
      runRole: async (role) => {
        assert.equal(role, "plan-reviewer");
        writeFileSync(
          planReviewPath(docsDir, SLUG),
          planReviewDoc("없음"),
          "utf8"
        );
        return { ok: true };
      },
    });

    const result = await env.runGate({ stage: "review", round: 0, revised: false, awaiting: false });

    assert.equal(result.outcome, "passed");
    assert.equal(result.planReview.stage, "passed");
    assert.equal(result.planReview.round, 1);
    assert.ok(env.logLines.some((l) => l === "plan-review round 1: passed"));
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: defects -> planner revise -> re-review passes", async () => {
  const runsDir = makeTempDir("pr-revise-");
  const docsDir = join(runsDir, "docs");
  try {
    let reviewPass = 0;
    const env = gateEnv({
      docsDir,
      runsDir,
      planReviewText: null,
      runRole: async (role) => {
        if (role === "plan-reviewer") {
          reviewPass += 1;
          const body =
            reviewPass === 1 ? "- [설계] gap" : "없음";
          writeFileSync(
            planReviewPath(docsDir, SLUG),
            planReviewDoc(body),
            "utf8"
          );
          return { ok: true };
        }
        if (role === "planner") {
          writeFileSync(
            join(docsDir, `PLAN-${SLUG}.md`),
            "# PLAN\n\n## 막힌 질문\n\n없음\n\n## 자동 수정 기록\n\nfixed\n",
            "utf8"
          );
          return { ok: true };
        }
        throw new Error(`unexpected role ${role}`);
      },
    });

    const result = await env.runGate();

    assert.equal(result.outcome, "passed");
    assert.equal(result.planReview.revised, true);
    assert.equal(reviewPass, 2);
    assert.ok(
      env.logLines.some((l) =>
        l.includes("plan-review round 1: defects -> planner auto-revision (1/1)")
      )
    );
    assert.ok(
      env.logLines.some((l) =>
        l.includes("plan-review: PLAN auto-revised by planner; differs from user-approved PLAN")
      )
    );
    const approved = join(runsDir, "plan-review", `PLAN-${SLUG}.approved.md`);
    assert.equal(existsSync(approved), true);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: second review still has defects -> human", async () => {
  const runsDir = makeTempDir("pr-human-");
  const docsDir = join(runsDir, "docs");
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      planReview: {
        stage: "review",
        round: 1,
        revised: true,
        awaiting: true,
        planSha: null,
        approvedCopy: join(runsDir, "plan-review", `PLAN-${SLUG}.approved.md`),
      },
      planReviewText: planReviewDoc("- [설계] still bad"),
    });

    const result = await env.runGate({
      stage: "review",
      round: 1,
      revised: true,
      awaiting: true,
    });

    assert.equal(result.outcome, "human");
    assert.equal(result.planReview.stage, "human");
    assert.ok(
      env.logLines.some((l) =>
        l.includes("plan-review round 1: defects remain -> human gate (exit 20)")
      )
    );
    assert.equal(env.roles.length, 0);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: missing PLAN-REVIEW after ok -> failed", async () => {
  const runsDir = makeTempDir("pr-fail-missing-");
  const docsDir = join(runsDir, "docs");
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      planReviewText: null,
      runRole: async () => ({ ok: true }),
    });

    const result = await env.runGate({
      stage: "review",
      round: 1,
      revised: false,
      awaiting: true,
    });

    assert.equal(result.outcome, "failed");
    assert.equal(result.planReview.awaiting, false);
    assert.ok(
      env.logLines.some((l) =>
        l.includes(
          "plan-review round 1: PLAN-REVIEW missing or malformed (exit 30)"
        )
      )
    );
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: planner did not modify PLAN -> human", async () => {
  const runsDir = makeTempDir("pr-no-edit-");
  const docsDir = join(runsDir, "docs");
  const planBody = "# PLAN\n\n## 막힌 질문\n\n없음\n";
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      planText: planBody,
      planReviewText: null,
      runRole: async (role) => {
        if (role === "plan-reviewer") {
          writeFileSync(
            planReviewPath(docsDir, SLUG),
            planReviewDoc("- [설계] fix me"),
            "utf8"
          );
          return { ok: true };
        }
        return { ok: true };
      },
    });

    const result = await env.runGate();

    assert.equal(result.outcome, "human");
    assert.ok(
      env.logLines.some((l) =>
        l.includes("plan-review: planner did not modify PLAN -> human gate (exit 20)")
      )
    );
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: revised PLAN blocked -> human", async () => {
  const runsDir = makeTempDir("pr-blocked-");
  const docsDir = join(runsDir, "docs");
  try {
    let reviewerCalls = 0;
    const env = gateEnv({
      docsDir,
      runsDir,
      planReviewText: null,
      runRole: async (role) => {
        if (role === "plan-reviewer") {
          reviewerCalls += 1;
          writeFileSync(
            planReviewPath(docsDir, SLUG),
            planReviewDoc("- [설계] fix"),
            "utf8"
          );
          return { ok: true };
        }
        if (role === "planner") {
          writeFileSync(
            join(docsDir, `PLAN-${SLUG}.md`),
            "# PLAN\n\n## 막힌 질문\n\n- scope?\n",
            "utf8"
          );
          return { ok: true };
        }
        throw new Error(role);
      },
      isBlocked: (text) => text.includes("- scope?"),
    });

    const result = await env.runGate();

    assert.equal(result.outcome, "human");
    assert.equal(reviewerCalls, 1);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: awaiting re-entry does not re-issue runRole", async () => {
  const runsDir = makeTempDir("pr-await-");
  const docsDir = join(runsDir, "docs");
  try {
    let calls = 0;
    const env = gateEnv({
      docsDir,
      runsDir,
      planReviewText: planReviewDoc("없음"),
      runRole: async () => {
        calls += 1;
        return { ok: true };
      },
    });

    const result = await env.runGate({
      stage: "review",
      round: 1,
      revised: false,
      awaiting: true,
    });

    assert.equal(result.outcome, "passed");
    assert.equal(calls, 0);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: human resume runs one review without auto-revise", async () => {
  const runsDir = makeTempDir("pr-human-resume-");
  const docsDir = join(runsDir, "docs");
  try {
    const roles = [];
    const env = gateEnv({
      docsDir,
      runsDir,
      planReviewText: null,
      runRole: async (role, prompt) => {
        roles.push({ role, prompt });
        writeFileSync(
          planReviewPath(docsDir, SLUG),
          planReviewDoc("- [설계] still"),
          "utf8"
        );
        return { ok: true };
      },
    });

    const result = await env.runGate({
      stage: "human",
      round: 1,
      revised: true,
      awaiting: false,
    });

    assert.equal(result.outcome, "human");
    assert.equal(roles.length, 1);
    assert.equal(roles[0].role, "plan-reviewer");
    assert.equal(roles.some((r) => r.role === "planner"), false);
    assert.equal(result.planReview.revised, true);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: archives prior PLAN-REVIEW before new round", async () => {
  const runsDir = makeTempDir("pr-archive-");
  const docsDir = join(runsDir, "docs");
  try {
    mkdirSync(docsDir, { recursive: true });
    const oldBody = planReviewDoc("없음");
    writeFileSync(planReviewPath(docsDir, SLUG), oldBody, "utf8");
    mkdirSync(join(runsDir, "plan-review"), { recursive: true });

    const env = gateEnv({
      docsDir,
      runsDir,
      planReviewText: oldBody,
      runRole: async () => {
        writeFileSync(
          planReviewPath(docsDir, SLUG),
          planReviewDoc("없음"),
          "utf8"
        );
        return { ok: true };
      },
    });

    await env.runGate({ stage: "review", round: 1, revised: false, awaiting: false });

    const archive = join(runsDir, "plan-review", "PLAN-REVIEW.round1.md");
    assert.equal(existsSync(archive), true);
    assert.equal(readFileSync(archive, "utf8"), oldBody);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: runRole exit 10 -> parent", async () => {
  const runsDir = makeTempDir("pr-parent-");
  const docsDir = join(runsDir, "docs");
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      runRole: async () => ({ ok: false, exitCode: 10 }),
    });

    const result = await env.runGate();
    assert.equal(result.outcome, "parent");
    assert.equal(result.planReview.awaiting, true);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: runRole exit 50 -> startup", async () => {
  const runsDir = makeTempDir("pr-startup-");
  const docsDir = join(runsDir, "docs");
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      runRole: async () => ({ ok: false, exitCode: 50 }),
    });

    const result = await env.runGate();
    assert.equal(result.outcome, "startup");
    assert.equal(result.planReview.awaiting, false);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: malformed PLAN-REVIEW when awaiting -> failed", async () => {
  const runsDir = makeTempDir("pr-malformed-");
  const docsDir = join(runsDir, "docs");
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      planReviewText: "# PLAN-REVIEW\n\n## 개선 제안\n\n- tip\n",
    });

    const result = await env.runGate({
      stage: "review",
      round: 1,
      revised: false,
      awaiting: true,
    });

    assert.equal(result.outcome, "failed");
    assert.equal(result.planReview.awaiting, false);
    assert.ok(
      env.logLines.some((l) =>
        l.includes(
          "plan-review round 1: PLAN-REVIEW missing or malformed (exit 30)"
        )
      )
    );
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: critique prompt shape", async () => {
  const runsDir = makeTempDir("pr-prompt-");
  const docsDir = join(runsDir, "docs");
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      runRole: async (role, prompt) => {
        assert.equal(role, "plan-reviewer");
        assert.match(prompt, /^Critique PLAN for slug plan-review \(plan-review round 1\)/);
        assert.match(prompt, /Instructions:/);
        assert.match(prompt, /PLAN: .+PLAN-plan-review\.md/);
        assert.match(prompt, /Write: .+PLAN-REVIEW-plan-review\.md/);
        assert.match(prompt, /## 계획 결함/);
        writeFileSync(planReviewPath(docsDir, SLUG), planReviewDoc("없음"), "utf8");
        return { ok: true };
      },
    });

    await env.runGate();
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: revise prompt shape", async () => {
  const runsDir = makeTempDir("pr-revise-prompt-");
  const docsDir = join(runsDir, "docs");
  try {
    let sawPlanner = false;
    const env = gateEnv({
      docsDir,
      runsDir,
      runRole: async (role, prompt) => {
        if (role === "plan-reviewer") {
          writeFileSync(
            planReviewPath(docsDir, SLUG),
            planReviewDoc("- [x] issue"),
            "utf8"
          );
          return { ok: true };
        }
        sawPlanner = true;
        assert.match(
          prompt,
          /^Revise PLAN for slug plan-review \(plan-review auto-revision 1\/1\)/
        );
        assert.match(prompt, /PLAN-REVIEW:/);
        assert.match(prompt, /Fix only `## 계획 결함`/);
        writeFileSync(
          join(docsDir, `PLAN-${SLUG}.md`),
          "# changed\n",
          "utf8"
        );
        return { ok: true };
      },
    });

    await env.runGate();
    assert.equal(sawPlanner, true);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

test("planReviewGate: blocked PLAN at review start -> human", async () => {
  const runsDir = makeTempDir("pr-block-start-");
  const docsDir = join(runsDir, "docs");
  try {
    const env = gateEnv({
      docsDir,
      runsDir,
      planText: "# PLAN\n\n## 막힌 질문\n\n- wait\n",
      isBlocked: () => true,
    });

    const result = await env.runGate();
    assert.equal(result.outcome, "human");
    assert.equal(result.planReview.stage, "human");
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
});
