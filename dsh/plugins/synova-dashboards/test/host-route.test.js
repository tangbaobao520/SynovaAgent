// test/host-route.test.js — Host 半路由契约测试（node:test）
// 用假 ctx.webServer 捕获真实 handler，再以假 req/res 驱动，验证 D794 §A.4 契约：
//   GET /synova/pm/ledger  成功 → 200 + ledger.json 原文
//                          降级 → 200 + { ok:false, degraded:true, error }（不 500、不抛异常）
// 同时验证原有 /synova/dashboards/data 路由仍在（不影响既有右栏）。
// 铁律 48：非空壳，正常/降级/边界三路径都有真实断言。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { name, inject } from "../lib/index.js";
import { LEDGER_REL_PATH } from "../lib/ledger.js";

// lib/index.js 有进程级挂载护栏（let active）——生产上防重复挂载是正确的，
// 但同一进程里多次 apply 会被它挡掉。测试用带 query 的动态 import 取独立模块实例。
let moduleSeq = 0;
async function freshApply() {
  const mod = await import(`../lib/index.js?case=${moduleSeq++}`);
  return mod.apply;
}

/** 装载 Host 半，捕获注册的路由与 handler。 */
async function loadHost(repoRoot) {
  const apply = await freshApply();
  const routes = [];
  const warnings = [];
  const ctx = {
    logger: { warn: (m) => warnings.push(String(m)), error: (m) => warnings.push(String(m)) },
    effect(fn) {
      const dispose = fn();
      return typeof dispose === "function" ? dispose : () => {};
    },
    webServer: {
      register(spec) {
        routes.push(spec);
        return () => {};
      },
    },
  };
  apply(ctx, { repoRoot });
  return { routes, warnings };
}

/** 假 res：记录 status/headers/body。 */
function fakeRes() {
  return {
    statusCode: null,
    headers: null,
    body: undefined,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(payload) { this.body = payload; },
  };
}

function makeRepo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "synova-route-"));
  for (const [rel, content] of Object.entries(files)) {
    if (content === undefined) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const GOOD_LEDGER = JSON.stringify({
  schema: "project-ledger/1",
  generated_at: "2026-09-17T10:00:00+08:00",
  git_head: "6a06e853",
  degraded: false,
  totals: { v1_total: 125, v1_passed: 0, v1_verified: 0, freshness: { green: 0, yellow: 0, red: 1 }, blocked_count: 0 },
  lines: [], blocked: [], timeline: [],
});

function findRoute(routes, path) {
  const r = routes.find((x) => x.path === path);
  assert.ok(r, `必须注册路由 ${path}`);
  return r;
}

test("Host 半导出契约：name / inject 保持 webServer（bundle 层按此挂载）", () => {
  assert.equal(name, "synova-dashboards");
  assert.deepEqual(inject, ["webServer"]);
});

test("同时注册两条只读路由：/synova/dashboards/data（原有）与 /synova/pm/ledger（新增）", async () => {
  const root = makeRepo({ [LEDGER_REL_PATH]: GOOD_LEDGER });
  const { routes } = await loadHost(root);
  assert.equal(routes.length, 2, "应恰好注册两条路由");
  for (const r of routes) assert.equal(r.kind, "exact");
  findRoute(routes, "/synova/dashboards/data");
  findRoute(routes, "/synova/pm/ledger");
});

test("正常路径：ledger.json 存在 → 200 + 原文逐字节一致，且带 no-store", async () => {
  const root = makeRepo({ [LEDGER_REL_PATH]: GOOD_LEDGER });
  const { routes } = await loadHost(root);
  const res = fakeRes();
  await findRoute(routes, "/synova/pm/ledger").handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.body, GOOD_LEDGER, "契约要求「原样内容」，不得 parse→stringify 改写");
  assert.equal(JSON.parse(res.body).totals.v1_total, 125);
});

test("降级①：ledger.json 缺失 → 200 + ok:false/degraded:true（D795 未产出时的正常态）", async () => {
  const root = makeRepo({}); // 无 ledger.json
  const { routes, warnings } = await loadHost(root);
  const res = fakeRes();
  await findRoute(routes, "/synova/pm/ledger").handler({}, res);
  assert.equal(res.statusCode, 200, "降级不得返回 5xx（前端会误判为断网）");
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.degraded, true);
  assert.match(body.error, /尚未产出/);
  assert.ok(warnings.some((w) => w.includes("ledger")), "降级必须留痕（铁律 24：禁静默）");
});

test("降级②：坏 JSON → 200 + degraded:true + 解析原因，且不抛异常", async () => {
  const root = makeRepo({ [LEDGER_REL_PATH]: "{ not json" });
  const { routes, warnings } = await loadHost(root);
  const res = fakeRes();
  await assert.doesNotReject(
    () => findRoute(routes, "/synova/pm/ledger").handler({}, res),
    "坏 JSON 不得把异常抛给宿主"
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.degraded, true);
  assert.match(body.error, /JSON 解析失败/);
  assert.ok(warnings.length > 0);
});

test("原有路由仍可用：/synova/dashboards/data 在无数据仓库下也不抛异常（返回 JSON）", async () => {
  const root = makeRepo({});
  const { routes } = await loadHost(root);
  const res = fakeRes();
  await findRoute(routes, "/synova/dashboards/data").handler({}, res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(typeof body, "object");
  assert.ok(body.meta, "原有 payload 结构应保留 meta 字段");
});
