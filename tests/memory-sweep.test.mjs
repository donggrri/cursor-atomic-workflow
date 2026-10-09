import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  autoSave,
  auditFile,
  commitMemoryChange,
  memoryDir,
} from "../scripts/memory.mjs";
import {
  CHILD_ENV,
  LOCK_STALE_MS,
  buildSweepPrompt,
  isSweepLocked,
  excerptTranscript,
  extractIds,
  findTranscript,
  handleHook,
  parseHookInput,
  shouldSweep,
} from "../scripts/memory-sweep.mjs";

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "memory-sweep-test-"));
  const dir = memoryDir(root);
  mkdirSync(join(dir, "projects"), { recursive: true });
  mkdirSync(join(dir, "gotchas"), { recursive: true });
  writeFileSync(join(dir, "human.md"), "---\ntype: human\n---\n\n# Human\n");
  writeFileSync(join(dir, "index.md"), "# Index\n");
  return { root, dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("parseHookInput tolerates invalid JSON", () => {
  assert.deepEqual(parseHookInput("not json"), {});
  assert.deepEqual(parseHookInput("{\"a\":1}"), { a: 1 });
});

test("extractIds reads common field spellings", () => {
  const ids = extractIds({
    conversation_id: "abc",
    transcript_path: "/x/y.jsonl",
    workspace_roots: ["/home/dongjin/repo"],
  });
  assert.equal(ids.conversationId, "abc");
  assert.equal(ids.transcriptPath, "/x/y.jsonl");
  assert.equal(ids.workspaceRoot, "/home/dongjin/repo");
});

test("findTranscript locates agent-transcripts by conversation id", () => {
  const base = mkdtempSync(join(tmpdir(), "projects-"));
  try {
    const dir = join(base, "proj-a", "agent-transcripts", "agent-1234");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "agent-1234.jsonl"), "{}\n");
    assert.equal(
      findTranscript({ conversationId: "agent-1234", projectsDir: base }),
      join(dir, "agent-1234.jsonl"),
    );
    assert.equal(findTranscript({ conversationId: "missing", projectsDir: base }), null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("excerptTranscript keeps text parts only and trims from the front", () => {
  const lines = [
    { role: "user", message: { content: [{ type: "text", text: "빌드는 make all이다" }] } },
    { role: "assistant", message: { content: [{ type: "tool_use", name: "Shell" }, { type: "text", text: "확인했다" }] } },
    "not an object",
  ].map((l) => (typeof l === "string" ? l : JSON.stringify(l)));
  const { text, messageCount } = excerptTranscript(lines.join("\n"));
  assert.equal(messageCount, 2);
  assert.match(text, /user: 빌드는 make all이다/);
  assert.match(text, /assistant: 확인했다/);
  assert.doesNotMatch(text, /tool_use/);

  const long = excerptTranscript(lines.join("\n"), 10);
  assert.match(long.text, /^…\(앞부분 생략\)/);
});

test("shouldSweep skips short conversations and unchanged transcripts", () => {
  assert.equal(shouldSweep({}, "t", 100, 1).ok, false);
  assert.equal(shouldSweep({ t: 100 }, "t", 100, 10).ok, false);
  assert.equal(shouldSweep({ t: 100 }, "t", 200, 10).ok, true);
});

test("buildSweepPrompt names the proposal file and the autosave command", () => {
  const prompt = buildSweepPrompt({
    excerpt: "user: x",
    shortRepo: "edge-tools",
    sweepId: "abc",
    memoryScript: "/repo/scripts/memory.mjs",
    memoryHome: "/vault/memory",
  });
  assert.match(prompt, /propose --auto/);
  assert.match(prompt, /memory-sweep-abc\.json/);
  assert.match(prompt, /projects\/edge-tools\.md/);
  assert.match(prompt, /<transcript>\nuser: x\n<\/transcript>/);
});

test("handleHook responds {} and never spawns inside a child agent", () => {
  const prev = process.env[CHILD_ENV];
  process.env[CHILD_ENV] = "1";
  try {
    assert.equal(handleHook("{\"conversation_id\":\"x\"}"), "{}");
  } finally {
    if (prev === undefined) delete process.env[CHILD_ENV];
    else process.env[CHILD_ENV] = prev;
  }
});

test("autoSave saves valid items, rejects secrets, and writes an audit line", () => {
  const f = tempRoot();
  try {
    const result = autoSave(f.root, {
      shortRepo: "edge-tools",
      slug: "auto-1",
      items: [
        { target: "gotchas/ssh-bind.md", text: "ssh는 BindAddress를 붙인다" },
        { target: "human.md", text: "password is hunter2" },
      ],
    }, { commit: false });

    assert.equal(result.saved.length, 1);
    assert.equal(result.rejected.length, 1);
    const note = readFileSync(join(f.dir, "gotchas", "ssh-bind.md"), "utf8");
    assert.match(note, /ssh는 BindAddress를 붙인다 <!-- src: edge-tools\/auto-1 -->/);

    const audit = readFileSync(auditFile(f.root), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(audit.map((a) => a.action).sort(), ["auto-save", "rejected"]);
  } finally {
    f.cleanup();
  }
});

test("commitMemoryChange skips when the memory directory is not in a git repo", () => {
  const f = tempRoot();
  try {
    const r = commitMemoryChange(f.dir, "memory: test");
    assert.equal(r.committed, false);
    assert.match(r.reason, /git 저장소 아님/);
  } finally {
    f.cleanup();
  }
});

test("commitMemoryChange commits only the memory folder inside a vault repo", () => {
  const f = tempRoot();
  try {
    const git = (args) => execFileSync("git", ["-C", f.root, ...args], { encoding: "utf8" });
    git(["init", "-q"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "test"]);
    writeFileSync(join(f.root, "unrelated.txt"), "keep\n");

    autoSave(f.root, {
      shortRepo: "edge-tools",
      slug: "auto-2",
      items: [{ target: "gotchas/git-note.md", text: "커밋은 메모리 폴더만 묶는다" }],
    });

    const log = git(["log", "--format=%s"]).trim().split("\n");
    assert.equal(log.length, 1);
    assert.match(log[0], /memory: edge-tools\/auto-2 자동 저장 1건/);
    const files = git(["show", "--name-only", "--format=", "HEAD"]).trim().split("\n");
    assert.ok(files.every((p) => p.startsWith("memory/")), files.join(","));
    assert.ok(existsSync(join(f.root, "unrelated.txt")));
  } finally {
    f.cleanup();
  }
});

test("commitMemoryChange works when the memory folder is a symlink into the vault", () => {
  const vault = mkdtempSync(join(tmpdir(), "vault-"));
  const home = mkdtempSync(join(tmpdir(), "wfhome-"));
  try {
    const git = (args) => execFileSync("git", ["-C", vault, ...args], { encoding: "utf8" });
    git(["init", "-q"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "test"]);
    mkdirSync(join(vault, "cursor-workflow", "memory", "gotchas"), { recursive: true });
    writeFileSync(join(vault, "cursor-workflow", "memory", "human.md"), "# Human\n\n(아직 기록 없음)\n");
    symlinkSync(join(vault, "cursor-workflow", "memory"), join(home, "memory"));

    autoSave(home, {
      shortRepo: "edge-tools",
      slug: "link-1",
      items: [{ target: "gotchas/link.md", text: "심볼릭 링크 경로에서도 커밋된다" }],
    });
    const log = git(["log", "--format=%s"]).trim().split("\n");
    assert.match(log[0], /memory: edge-tools\/link-1 자동 저장 1건/);
    const files = git(["show", "--name-only", "--format=", "HEAD"]).trim().split("\n");
    assert.ok(files.every((p) => p.startsWith("cursor-workflow/memory/")), files.join(","));
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("first real entry removes the template placeholder", () => {
  const f = tempRoot();
  try {
    writeFileSync(join(f.dir, "human.md"), "# Human\n\n(아직 기록 없음)\n");
    autoSave(f.root, {
      shortRepo: "edge-tools",
      slug: "ph",
      items: [{ target: "human.md", text: "답변은 한국어로 한다" }],
    }, { commit: false });
    const text = readFileSync(join(f.dir, "human.md"), "utf8");
    assert.doesNotMatch(text, /아직 기록 없음/);
    assert.match(text, /답변은 한국어로 한다/);
  } finally {
    f.cleanup();
  }
});

test("isSweepLocked honors a fresh lock and ignores a stale one", () => {
  const dir = mkdtempSync(join(tmpdir(), "lock-"));
  try {
    const lock = join(dir, "sweep.lock");
    assert.equal(isSweepLocked(lock), false);
    writeFileSync(lock, "1");
    assert.equal(isSweepLocked(lock), true);
    assert.equal(isSweepLocked(lock, Date.now() + LOCK_STALE_MS + 1000), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildSweepPrompt includes existing memory for de-duplication", () => {
  const prompt = buildSweepPrompt({
    excerpt: "user: x",
    shortRepo: "edge-tools",
    sweepId: "dup",
    memoryScript: "/repo/scripts/memory.mjs",
    memoryHome: "/vault/memory",
    existingMemory: "<memory>\n## 사용자\n- [2026-10-09] 커밋 메시지는 한국어로 작성한다\n</memory>",
  });
  assert.match(prompt, /기존 메모리 \(중복 저장 금지\)/);
  assert.match(prompt, /커밋 메시지는 한국어로 작성한다/);
  assert.match(prompt, /표현이 달라도 같은 사실이면 중복/);
});
