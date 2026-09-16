// test/ledger.test.js — 项目总览账本读取器单元测试（node:test）
// 覆盖：正常路径 / 降级路径（ENOENT、BAD_JSON）/ 边界条件（空文件、非对象 JSON、只读性）
// 铁律 48：非空壳，每条路径都有真实断言。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { readLedger, LEDGER_REL_PATH } from "../lib/ledger.js";

/** 建临时仓库夹具；files 为 {相对路径: 内容}，值为 undefined 表示不创建该文件。 */
function makeRepo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "synova-ledger-"));
  for (const [rel, content] of Object.entries(files)) {
    if (content === undefined) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const GOOD = JSON.stringify({
  schema: "project-ledger/1",
  generated_by: "gen-project-board.py",
  generated_at: "2026-09-17T10:00:00+08:00",
  git_head: "6a06e853",
  degraded: false,
  degraded_sources: [],
  totals: { v1_total: 125, v1_passed: 0, v1_verified: 0, delivery_pct: 0, verify_pct: 0, freshness: { green: 0, yellow: 0, red: 1 }, blocked_count: 0 },
  lines: [],
  blocked: [],
  timeline: []
});

test("readLedger 正常路径：合法 ledger.json → ok:true，且 raw 为原文逐字节一致", async () => {
  const root = makeRepo({ [LEDGER_REL_PATH]: GOOD });
  const r = await readLedger(root);
  assert.equal(r.ok, true);
  assert.equal(r.degraded, false);
  assert.equal(r.path, join(root, LEDGER_REL_PATH));
  // 契约「原样透传」：raw 必须与磁盘内容完全一致（不得被 parse→stringify 改写）
  assert.equal(r.raw, GOOD);
  assert.equal(JSON.parse(r.raw).totals.v1_total, 125);
});

test("readLedger 降级① ENOENT：文件不存在 → ok:false + degraded:true + code=ENOENT，不抛异常", async () => {
  const root = makeRepo({}); // 夹具里根本没有 ledger.json（D795 未产出时的真实态）
  const r = await readLedger(root);
  assert.equal(r.ok, false);
  assert.equal(r.degraded, true);
  assert.equal(r.code, "ENOENT");
  assert.match(r.error, /尚未产出/);
  assert.equal(r.raw, undefined);
});

test("readLedger 降级② BAD_JSON：坏 JSON → ok:false + code=BAD_JSON，不抛异常", async () => {
  const root = makeRepo({ [LEDGER_REL_PATH]: '{"schema":"project-ledger/1", "totals": {' });
  const r = await readLedger(root);
  assert.equal(r.ok, false);
  assert.equal(r.degraded, true);
  assert.equal(r.code, "BAD_JSON");
  assert.match(r.error, /JSON 解析失败/);
});

test("readLedger 降级③ 非法 UTF-8/目录占位：读盘失败不抛异常，带 code", async () => {
  // 用目录冒充 ledger.json —— readFile 抛 EISDIR，验证非 ENOENT 分支也走降级
  const root = makeRepo({});
  mkdirSync(join(root, LEDGER_REL_PATH), { recursive: true });
  const r = await readLedger(root);
  assert.equal(r.ok, false);
  assert.equal(r.degraded, true);
  assert.equal(typeof r.code, "string");
  assert.notEqual(r.code, "ENOENT");
  assert.match(r.error, /读取失败/);
});

test("readLedger 边界：空文件视为坏 JSON（不静默当成功）", async () => {
  const root = makeRepo({ [LEDGER_REL_PATH]: "" });
  const r = await readLedger(root);
  assert.equal(r.ok, false);
  assert.equal(r.code, "BAD_JSON");
});

test("readLedger 边界：合法 JSON 但非对象（null / 数组）仍算读成功，交由调用方判形", async () => {
  const root = makeRepo({ [LEDGER_REL_PATH]: "null" });
  const r = await readLedger(root);
  assert.equal(r.ok, true);
  assert.equal(r.raw, "null");
});

test("readLedger 只读性：读取前后 ledger.json 的 mtime 与内容不变（红线：插件零写入）", async () => {
  const root = makeRepo({ [LEDGER_REL_PATH]: GOOD });
  const abs = join(root, LEDGER_REL_PATH);
  const before = statSync(abs);
  await readLedger(root);
  await readLedger(root);
  const after = statSync(abs);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.size, before.size);
  assert.equal(readFileSync(abs, "utf8"), GOOD);
});
