// test/ledger.test.js — 账本读取器单元测试（node:test）：三级取数契约
// 覆盖：worktree 命中 / origin/main 回退（缺失 & 坏 JSON 两种触发）/ 两级皆失败降级 /
//       边界（空文件、非对象 JSON）/ 只读性
// 铁律 48：非空壳，每条路径都有真实断言。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { readLedger, LEDGER_REL_PATH, LEDGER_REF } from "../lib/ledger.js";

const GOOD = JSON.stringify({
  schema: "project-ledger/1",
  generated_by: "gen-project-board.py",
  generated_at: "2026-09-17T10:00:00+08:00",
  git_head: "6a06e853",
  degraded: false,
  degraded_sources: [],
  totals: { v1_total: 125, v1_passed: 21, v1_verified: 12, freshness: { green: 14, yellow: 1, red: 6 }, blocked_count: 0 },
  lines: [],
  blocked: [],
  timeline: [],
});

/** 纯文件夹具（非 git 仓库）。 */
function makeDir(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "synova-ledger-"));
  for (const [rel, content] of Object.entries(files)) {
    if (content === undefined) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/**
 * git 夹具：把某份账本提交到 main 并建出 refs/remotes/origin/main，
 * 之后可独立增删/改坏工作区副本 —— 用于验证「工作区不通时仍能从 git 取到」。
 */
function makeGitRepo({ originLedger = GOOD, worktree = "same" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "synova-git-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  const abs = join(root, LEDGER_REL_PATH);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, originLedger);
  git("add", LEDGER_REL_PATH);
  git("commit", "-q", "-m", "ledger");
  // 无 remote 也能让 `git show origin/main:<path>` 生效：直接建远端跟踪 ref
  git("update-ref", `refs/remotes/${LEDGER_REF}`, "HEAD");
  if (worktree === "remove") rmSync(abs);
  else if (worktree !== "same") writeFileSync(abs, worktree);
  return root;
}

test("三级① 工作区命中：source=worktree，无回退说明，parsed 为对象", async () => {
  const root = makeDir({ [LEDGER_REL_PATH]: GOOD });
  const r = await readLedger(root);
  assert.equal(r.ok, true);
  assert.equal(r.degraded, false);
  assert.equal(r.source, "worktree");
  assert.equal(r.fallback_note, null);
  assert.equal(r.parsed.totals.v1_total, 125);
  assert.equal(r.raw, GOOD, "raw 必须是逐字节原文，供调用方按需透传");
});

test("三级② origin/main 回退：工作区文件缺失 → 仍取到数据，source=origin/main", async () => {
  const root = makeGitRepo({ worktree: "remove" }); // 模拟“checkout 了别的分支”
  const r = await readLedger(root);
  assert.equal(r.ok, true, "工作区没有账本时不得判死——必须回退 git");
  assert.equal(r.degraded, false);
  assert.equal(r.source, LEDGER_REF);
  assert.equal(r.parsed.totals.v1_total, 125);
  assert.match(r.fallback_note, /工作区无/);
  assert.match(r.fallback_note, new RegExp(LEDGER_REF));
});

test("三级② origin/main 回退：工作区账本坏 JSON → 跳过并回退（不得直接判死）", async () => {
  const root = makeGitRepo({ worktree: '{"schema":"project-ledger/1", "totals": {' });
  const r = await readLedger(root);
  assert.equal(r.ok, true);
  assert.equal(r.source, LEDGER_REF);
  assert.match(r.fallback_note, /JSON 解析失败/);
  assert.equal(r.parsed.totals.v1_passed, 21);
});

test("三级③ 两级皆失败：显式降级 + 两级原因都带在 error/attempts 里，不抛异常", async () => {
  const root = makeDir({}); // 既无工作区文件，也不是 git 仓库
  const r = await readLedger(root);
  assert.equal(r.ok, false);
  assert.equal(r.degraded, true);
  assert.equal(r.attempts.length, 2, "两级失败原因都要记录");
  assert.match(r.attempts[0], /工作区无/);
  assert.match(r.attempts[1], /origin\/main/);
  assert.match(r.error, /工作区无/);
  assert.match(r.error, /origin\/main/);
  assert.equal(r.path, join(root, LEDGER_REL_PATH));
  assert.equal(r.raw, undefined);
});

test("三级③ 工作区坏 JSON 且 origin/main ref 不存在 → 降级（坏 JSON 原因同样入账）", async () => {
  const root = makeGitRepo({ worktree: "{ not json" });
  execFileSync("git", ["-C", root, "update-ref", "-d", `refs/remotes/${LEDGER_REF}`], { stdio: "pipe" });
  const r = await readLedger(root);
  assert.equal(r.ok, false);
  assert.match(r.attempts[0], /JSON 解析失败/);
  assert.match(r.attempts[1], /origin\/main/);
});

test("边界：空工作区文件视为坏 JSON → 走回退；两端都空则降级", async () => {
  const ok = makeGitRepo({ worktree: "" });
  const r1 = await readLedger(ok);
  assert.equal(r1.ok, true);
  assert.equal(r1.source, LEDGER_REF);

  const bad = makeDir({ [LEDGER_REL_PATH]: "" });
  const r2 = await readLedger(bad);
  assert.equal(r2.ok, false);
  assert.match(r2.attempts[0], /JSON 解析失败/);
});

test("边界：合法 JSON 但非对象（null）→ 工作区即命中，交由路由层判形", async () => {
  const root = makeDir({ [LEDGER_REL_PATH]: "null" });
  const r = await readLedger(root);
  assert.equal(r.ok, true);
  assert.equal(r.source, "worktree");
  assert.equal(r.parsed, null);
});

test("只读性：读取前后账本 mtime/内容不变（红线：插件零写入）", async () => {
  const root = makeDir({ [LEDGER_REL_PATH]: GOOD });
  const abs = join(root, LEDGER_REL_PATH);
  const before = statSync(abs);
  await readLedger(root);
  await readLedger(root);
  const after = statSync(abs);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.size, before.size);
  assert.equal(readFileSync(abs, "utf8"), GOOD);
});
