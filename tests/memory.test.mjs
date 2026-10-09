import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addProposals,
  approveProposal,
  buildMemoryContext,
  containsSecret,
  listPending,
  memoryDir,
  rejectProposal,
  validateProposal,
  withMemoryContext,
  writeCapture,
  CONTEXT_BUDGET,
} from "../scripts/memory.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "memory-test-"));
  const dir = memoryDir(root);
  mkdirSync(join(dir, "projects"), { recursive: true });
  mkdirSync(join(dir, "decisions"), { recursive: true });
  mkdirSync(join(dir, "gotchas"), { recursive: true });
  writeFileSync(join(dir, "human.md"), "---\ntype: human\n---\n\n# Human\n\n(아직 기록 없음)\n");
  writeFileSync(join(dir, "index.md"), "# Index\n");
  return { root, dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("validateProposal accepts a short single-line entry for a known target", () => {
  const r = validateProposal({ target: "projects/edge-tools.md", text: "빌드는 make all로 한다" });
  assert.equal(r.ok, true);
});

test("validateProposal rejects unknown targets and paths outside memory", () => {
  for (const target of ["../etc/passwd", "projects/../x.md", "random.md", "projects/Upper.md"]) {
    const r = validateProposal({ target, text: "ok" });
    assert.equal(r.ok, false, target);
  }
});

test("validateProposal rejects multi-line, empty, and over-long text", () => {
  assert.equal(validateProposal({ target: "human.md", text: "a\nb" }).ok, false);
  assert.equal(validateProposal({ target: "human.md", text: "   " }).ok, false);
  assert.equal(validateProposal({ target: "human.md", text: "x".repeat(201) }).ok, false);
});

test("containsSecret blocks credential-looking text", () => {
  assert.equal(containsSecret("API key는 abc"), true);
  assert.equal(containsSecret("password is hunter2"), true);
  assert.equal(containsSecret("token 발급 순서는 A다"), true);
  assert.equal(containsSecret("sk-abcdefgh12345"), true);
  assert.equal(containsSecret("ghp_abcdefghij1234"), true);
  assert.equal(containsSecret("빌드는 make all로 한다"), false);
});

test("buildMemoryContext returns empty string while only the template exists", () => {
  const f = fixture();
  try {
    assert.equal(buildMemoryContext({ root: f.root, shortRepo: "edge-tools" }), "");
    assert.equal(withMemoryContext("Run tasker", ""), "Run tasker");
  } finally {
    f.cleanup();
  }
});

test("buildMemoryContext includes approved entries and respects the budget", () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.dir, "projects", "edge-tools.md"),
      "# edge-tools\n\n- [2026-10-09] 테스트는 npm test다 <!-- src: edge-tools/x -->\n",
    );
    writeFileSync(join(f.dir, "gotchas", "ssh.md"), "- [2026-10-09] ssh는 BindAddress를 붙인다\n");
    const big = Array.from({ length: 200 }, (_, i) => `- [2026-10-09] 긴 결정 ${i} ${"가".repeat(40)}`).join("\n");
    writeFileSync(join(f.dir, "decisions", "big.md"), `${big}\n`);

    const ctx = buildMemoryContext({ root: f.root, shortRepo: "edge-tools" });
    assert.match(ctx, /^<memory>/);
    assert.match(ctx, /테스트는 npm test다/);
    assert.match(ctx, /ssh는 BindAddress를 붙인다/);
    assert.match(ctx, /현재 지시나 PLAN과 충돌하면/);
    assert.ok(ctx.length <= CONTEXT_BUDGET + 400, `context too long: ${ctx.length}`);

    const prompt = withMemoryContext("Run tasker for slug x", ctx);
    assert.ok(prompt.endsWith("Run tasker for slug x"));
  } finally {
    f.cleanup();
  }
});

test("addProposals queues valid items and skips invalid and duplicate ones", () => {
  const f = fixture();
  try {
    const batch = {
      shortRepo: "edge-tools",
      slug: "demo",
      items: [
        { target: "projects/edge-tools.md", text: "테스트는 npm test다" },
        { target: "projects/edge-tools.md", text: "테스트는 npm test다" },
        { target: "human.md", text: "password is hunter2" },
      ],
    };
    const first = addProposals(f.root, batch);
    assert.equal(first.added.length, 1);
    assert.equal(first.rejected.length, 2);
    assert.equal(listPending(f.root).length, 1);
  } finally {
    f.cleanup();
  }
});

test("approveProposal appends one line with source and creates index link for new notes", () => {
  const f = fixture();
  try {
    addProposals(f.root, {
      shortRepo: "edge-tools",
      slug: "demo",
      items: [{ target: "gotchas/ssh-bind.md", text: "ssh는 BindAddress를 붙인다" }],
    });
    const [item] = listPending(f.root);
    const r = approveProposal(f.root, item.id, { today: "2026-10-09" });
    assert.equal(r.ok, true, r.message);

    const note = readFileSync(join(f.dir, "gotchas", "ssh-bind.md"), "utf8");
    assert.match(note, /- \[2026-10-09\] ssh는 BindAddress를 붙인다 <!-- src: edge-tools\/demo -->/);
    const index = readFileSync(join(f.dir, "index.md"), "utf8");
    assert.match(index, /\[\[gotchas\/ssh-bind\]\]/);

    const again = approveProposal(f.root, item.id);
    assert.equal(again.ok, false);
  } finally {
    f.cleanup();
  }
});

test("rejectProposal marks item rejected and it leaves the pending list", () => {
  const f = fixture();
  try {
    addProposals(f.root, {
      shortRepo: "edge-tools",
      slug: "demo",
      items: [{ target: "human.md", text: "답변은 한국어로 한다" }],
    });
    const [item] = listPending(f.root);
    assert.equal(rejectProposal(f.root, item.id).ok, true);
    assert.equal(listPending(f.root).length, 0);
    assert.equal(existsSync(join(f.dir, "human.md")), true);
  } finally {
    f.cleanup();
  }
});

test("writeCapture records the run location for the curator", () => {
  const f = fixture();
  try {
    const file = writeCapture({
      root: f.root,
      shortRepo: "edge-tools",
      slug: "demo",
      docsDir: "/tmp/docs/demo",
      runsDir: "/tmp/runs/demo",
      completedAt: "2026-10-09T12:00:00.000Z",
    });
    const record = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(record.shortRepo, "edge-tools");
    assert.equal(record.slug, "demo");
    assert.equal(record.docsDir, "/tmp/docs/demo");
  } finally {
    f.cleanup();
  }
});
