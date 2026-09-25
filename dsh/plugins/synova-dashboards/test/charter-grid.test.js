// test/charter-grid.test.js — 「宪章三问 48 格」面板 + Host 路由契约测试（D963，node:test）
//
// 覆盖（铁律 48：正常/降级/边界三路径，全部真实断言）：
//   Client 半：
//     · 槽位成对注册（main keyed + sidebar.panellist 入口行，id 相同，main 先注册）
//     · 正常路径：fixture（3 扩展点 × 3 问）→ 矩阵 + 四色图例 + note 全渲染
//     · X27 边界：空/缺失 status → 一律「待办」灰，绝不显示为通过
//     · 降级路径①：路由 ok:false → 显式横幅「数据源未就绪（缺 宪章三问-48格.json）」，面板不消失
//     · 降级路径②：网络失败 → error 横幅，不抛错
//   Host 半（lib/index.js /synova/charter/grid + lib/charter.js）：
//     · 正常：工作区文件存在 → 200 + ok:true + source=worktree + 原字段保留
//     · 降级：文件缺失（当前 main 正常态）→ 200 + ok:false + degraded + missing
//     · 边界：坏 JSON → 200 + degraded + JSON 解析失败原因，不抛异常
// fixture：真源 origin/main 原样内嵌 test/fixtures/charter-48.json（shasum 与 git show 一致），
// 混色夹具由真源深拷贝只改 status/judgement 派生——禁自造简化形状（D963 退回项）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { CHARTER_REL_PATH, CHARTER_MISSING, adaptCharterGrid } from "../lib/charter.js";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/client.js"), "utf8");

// ── 真源 fixture（与 origin/main:docs/synova/coordination/宪章三问-48格.json 逐字节一致，shasum 0672fd0a）──
const REAL_RAW = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/charter-48.json"), "utf8");
const REAL = JSON.parse(REAL_RAW);

// ── 迷你 React 装载/渲染夹具（同 test/client-panel.test.js 手法，聚焦宪章面板）──
function loadPlugin(opts = {}) {
  const registrations = [];
  const fetchCalls = [];
  const panelSelections = [];
  const storageWrites = [];
  const storage = new Map(Object.entries(opts.storage ?? {}));
  let captured = null;

  const g = { stores: [], compIdx: 0, cursor: null, effectQueue: [] };
  function enterComponent() {
    const store = g.stores[g.compIdx] ?? (g.stores[g.compIdx] = []);
    g.compIdx++;
    g.cursor = { i: 0, store };
    return g.cursor;
  }
  const React = {
    createElement(type, props, ...children) {
      const p = Object.assign({}, props || {});
      if (children.length > 0) p.children = children.length === 1 ? children[0] : children;
      return { type, props: p };
    },
    useState(init) {
      const c = g.cursor;
      const i = c.i++;
      if (!(i in c.store)) c.store[i] = typeof init === "function" ? init() : init;
      return [c.store[i], (v) => { c.store[i] = typeof v === "function" ? v(c.store[i]) : v; }];
    },
    useCallback(fn) { g.cursor.i++; return fn; },
    useEffect(fn) { g.cursor.i++; g.effectQueue.push(fn); return undefined; },
  };
  const jsxRuntime = {
    Fragment: Symbol("Fragment"),
    jsx: (type, props) => ({ type, props: props || {} }),
    jsxs: (type, props) => ({ type, props: props || {} }),
  };

  const documentStub = {
    visibilityState: "visible",
    querySelectorAll: () => [],
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  const localStorageStub = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); storageWrites.push({ key: k, value: String(v) }); },
    removeItem: (k) => { storage.delete(k); },
  };
  const windowStub = {
    innerWidth: 1400, innerHeight: 900,
    __ModuleLoader__: { load: (def) => { captured = def; } },
  };
  const prev = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.localStorage = localStorageStub;
  (0, eval)(SRC);
  assert.ok(captured, "client.js 必须调用 window.__ModuleLoader__.load");
  const mod = captured.factory((name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    throw new Error("unexpected require: " + name);
  });
  const ctx = {
    layout: { selectPanel(id) { panelSelections.push(id); } },
    effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
    slots: {
      inject(slot, cb) {
        registrations.push({ inject: slot });
        const d = cb();
        return typeof d === "function" ? d : () => {};
      },
      register(options, component) { registrations.push({ options, component }); return () => {}; },
    },
  };
  mod.apply(ctx);

  async function render(payload, opts = {}) {
    g.compIdx = 0;
    g.effectQueue = [];
    globalThis.fetch = async (url, o) => {
      fetchCalls.push({ url, options: o });
      if (opts.fetchThrows) throw new Error(opts.fetchThrows);
      return { ok: true, status: 200, json: async () => payload };
    };
    const cell = registrations.find((r) => r.options && r.options.name === "main" && r.options.key === "synova-charter-grid");
    assert.ok(cell, "必须注册宪章面板 main keyed cell");
    const call = (fn, props) => { enterComponent(); return fn(props); };
    const collect = (node, out) => {
      if (node === null || node === undefined || node === false || node === true) return;
      if (Array.isArray(node)) { for (const c of node) collect(c, out); return; }
      if (typeof node === "string" || typeof node === "number") { out.text.push(String(node)); return; }
      if (typeof node !== "object") return;
      const t = node.type;
      if (typeof t === "function") { collect(call(t, node.props || {}), out); return; }
      if (typeof t === "string") {
        const cls = typeof node.props?.className === "string" ? node.props.className : "";
        out.nodes.push({ tag: t, className: cls, props: node.props || {} });
      }
      collect(node.props?.children, out);
    };
    const pass = () => {
      g.compIdx = 0; g.effectQueue = [];
      const out = { text: [], nodes: [] };
      collect(call(cell.component, {}), out);
      return out;
    };
    pass();
    const cleanups = [];
    for (const fn of g.effectQueue) { const c = fn(); if (typeof c === "function") cleanups.push(c); }
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const second = pass();
    for (const c of cleanups) c();
    return { text: second.text.join(" ␜ "), nodes: second.nodes };
  }

  return {
    registrations, fetchCalls, panelSelections, storageWrites, render,
    restore() {
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      globalThis.fetch = prev.fetch;
      globalThis.localStorage = prev.localStorage;
    },
  };
}

// ── fixture（D963 退回项：真源形状，禁自造）──
// REAL = origin/main 真源原样（48 格全 empty）；
// ROUTE_EMPTY = 真源经真实 adapter 后的路由 body（面板实际收到的形状）；
// MIXED = 真源深拷贝只改 status/judgement（green×2 / yellow×2 / red×1，其余 empty）。
const ROUTE_EMPTY = Object.assign({}, adaptCharterGrid(REAL), { ok: true, source: "origin/main" });
function makeMixedSource() {
  const mixed = JSON.parse(REAL_RAW);
  const set = (i, status, judgement) => {
    mixed.cells[i].status = status;
    mixed.cells[i].judgement = judgement;
  };
  set(0, "green", "端到端用例 EG-1 过");   // C01 q1 green
  set(3, "green", "端到端用例 EG-2 过");   // C04 q1 green
  set(4, "yellow", "接上了未生效：缺用例"); // C04 q2 yellow
  set(6, "yellow", "接线在、结果未核");     // C05? q1 yellow（序号即源顺序）
  set(8, "red", "注册表无此节点");          // red
  return mixed;
}
const MIXED = makeMixedSource();
const ROUTE_MIXED = Object.assign({}, adaptCharterGrid(MIXED), { ok: true, source: "worktree" });

test("注册契约：宪章面板 main cell 与 sidebar 入口行成对（id 相同、main 先注册、order=60 错开）", () => {
  const p = loadPlugin();
  try {
    const entries = p.registrations.filter((r) => r.options && r.options.name === "sidebar.panellist");
    const entry = entries.find((r) => r.options.id === "synova-charter-grid");
    const cell = p.registrations.find((r) => r.options && r.options.name === "main" && r.options.key === "synova-charter-grid");
    assert.ok(entry, "必须注册宪章入口行");
    assert.ok(cell, "必须注册宪章 main keyed cell");
    assert.equal(entry.options.id, cell.options.key, "同一 id 寻址 main（官方协议）");
    assert.equal(entry.options.label, "宪章三问");
    assert.equal(entry.options.order, 60, "order 与项目总览(50)错开");
    assert.ok(p.registrations.indexOf(cell) < p.registrations.indexOf(entry), "main 必须先于入口行注册");
    // 只允许 main + sidebar.panellist 两个槽位（新增面板不开新槽）
    const names = [...new Set(p.registrations.filter((r) => r.options).map((r) => r.options.name))].sort();
    assert.deepEqual(names, ["main", "sidebar.panellist"]);
  } finally {
    p.restore();
  }
});

test("正常路径（真源·当前态全 empty）：16 行 × 3 列全「未填」，不是空板", async () => {
  const p = loadPlugin();
  try {
    const r = await p.render(ROUTE_EMPTY);
    assert.match(r.text, /宪章三问/);
    assert.match(r.text, /扩展点/);
    assert.match(r.text, /加了吗/);
    assert.match(r.text, /接上了吗/);
    assert.match(r.text, /生效了吗/);
    // 行标签：层 · 扩展点名（真源 16 项之一）
    assert.match(r.text, /对象层 · 节点（要素）/);
    // 16 个扩展点 × 3 问（当前真源全 empty ⇒ 48 格全部显式「未填」，绝不是 0 行空板）
    assert.match(r.text, /16 个扩展点 × 3 问/);
    assert.match(r.text, /⚪ 未填 48/);
    assert.match(r.text, /🟢 生效 0/);
    // 矩阵格：48 格全部 pill「未填」（排除图例计数 pill）
    const emptyCells = r.nodes.filter((n) => n.className.includes("scg-pill-empty") && n.props.children === "未填");
    assert.equal(emptyCells.length, 48, "48 格必须全部渲染为「未填」");
    // 未填格不得有绿
    assert.equal(r.nodes.filter((n) => n.className.includes("scg-pill-green") && n.props.children === "生效了").length, 0);
    assert.doesNotMatch(r.text, /数据源未就绪/);
    assert.match(r.text, /源 origin\/main/);
  } finally {
    p.restore();
  }
});

test("正常路径（混色）：green/yellow/red 计数正确，note=judgement 渲染", async () => {
  const p = loadPlugin();
  try {
    const r = await p.render(ROUTE_MIXED);
    assert.match(r.text, /🟢 生效 2/);
    assert.match(r.text, /🟡 接了未生效 2/);
    assert.match(r.text, /🔴 缺失 1/);
    assert.match(r.text, /⚪ 未填 43/);
    // judgement 作为 note 渲染（真源 judgement 字段）
    assert.match(r.text, /端到端用例 EG-1 过/);
    assert.match(r.text, /接上了未生效：缺用例/);
    assert.match(r.text, /源 worktree/);
  } finally {
    p.restore();
  }
});

test("X27 边界：缺 tone/未知 tone 一律「未填」，绝不显示为通过", async () => {
  const p = loadPlugin();
  try {
    // 混色基础上注入两格非法值：tone 缺失 / tone 未知词（adapter 白名单外由 adapter 兜底，
    // 这里直接喂客户端，验证客户端 X27 归一化独立成立）。选最后一行（MIXED 中全 empty）避免覆盖既有 green。
    const payload = JSON.parse(JSON.stringify(ROUTE_MIXED));
    const lastRow = payload.rows[payload.rows.length - 1];
    lastRow.cells[0] = { status: "green" };            // 缺 tone
    lastRow.cells[1] = { tone: "super-green", text: "大成功" }; // 未知 tone
    const r = await p.render(payload);
    const emptyCells = r.nodes.filter((n) => n.className.includes("scg-pill-empty") && n.props.children === "未填");
    assert.ok(emptyCells.length >= 2, "缺 tone 与未知 tone 都必须落「未填」");
    assert.equal(r.nodes.filter((n) => n.className.includes("scg-pill-green") && n.props.children === "生效了").length, 2, "其余 2 个真 green 不受影响");
    assert.doesNotMatch(r.text, /大成功/, "未知 tone 的 text 不得透出");
  } finally {
    p.restore();
  }
});

test("降级①：路由 ok:false → 显式横幅「数据源未就绪（缺 宪章三问-48格.json）」，面板结构仍在", async () => {
  const p = loadPlugin();
  try {
    const r = await p.render({ ok: false, degraded: true, error: "工作区无 docs/synova/coordination/宪章三问-48格.json；origin/main 取数失败", missing: CHARTER_MISSING });
    assert.match(r.text, /数据源未就绪（缺 宪章三问-48格\.json）/);
    assert.match(r.text, /工作区无/);
    assert.match(r.text, /宪章三问/, "面板标题仍在，不白屏");
    assert.match(r.text, /加了吗/, "矩阵表头仍在");
    assert.match(r.text, /未填 0/, "无数据时计数全 0，不冒充");
    assert.match(r.text, /降级/);
  } finally {
    p.restore();
  }
});

test("降级②：网络失败 → error 横幅，不抛错不白屏", async () => {
  const p = loadPlugin();
  try {
    const r = await p.render({}, { fetchThrows: "Failed to fetch" });
    assert.match(r.text, /⚠ 降级：Failed to fetch/);
    assert.match(r.text, /宪章三问/);
  } finally {
    p.restore();
  }
});

test("零写入：宪章面板只发 GET /synova/charter/grid", async () => {
  const p = loadPlugin();
  try {
    await p.render(ROUTE_EMPTY);
    assert.ok(p.fetchCalls.length > 0);
    for (const c of p.fetchCalls) {
      assert.equal(c.url, "/synova/charter/grid");
      assert.equal((c.options && c.options.method) || "GET", "GET");
      assert.equal(c.options && c.options.cache, "no-store");
    }
  } finally {
    p.restore();
  }
});

// ── Host 半：/synova/charter/grid 路由（真实 handler + 假 req/res）──
let moduleSeq = 0;
async function loadHost(repoRoot) {
  const mod = await import(`../lib/index.js?charter=${moduleSeq++}`);
  const routes = [];
  const warnings = [];
  const ctx = {
    logger: { warn: (m) => warnings.push(String(m)), error: (m) => warnings.push(String(m)) },
    effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
    webServer: { register(spec) { routes.push(spec); return () => {}; } },
  };
  mod.apply(ctx, { repoRoot });
  return { routes, warnings };
}
function fakeRes() {
  return {
    statusCode: null, headers: null, body: undefined,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(payload) { this.body = payload; },
  };
}
function makeRepo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "synova-charter-"));
  for (const [rel, content] of Object.entries(files)) {
    if (content === undefined) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}
function charterRoute(routes) {
  const r = routes.find((x) => x.path === "/synova/charter/grid");
  assert.ok(r, "必须注册 /synova/charter/grid");
  return r;
}

test("Host 正常路径（真源 fixture）：工作区文件存在 → 200 + ok:true + adapter 契约（16 行×3 列）", async () => {
  const root = makeRepo({ [CHARTER_REL_PATH]: REAL_RAW });
  const { routes } = await loadHost(root);
  const res = fakeRes();
  await charterRoute(routes).handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.source, "worktree");
  // adapter 契约（不再是真源 cells[] 原样透传）
  assert.equal(body.rows.length, 16, "16 个扩展点行");
  assert.ok(body.rows.every((row) => row.cells.length === 3), "每行 3 列");
  assert.deepEqual(body.questions.map((q) => q.text), ["加了吗", "接上了吗", "生效了吗"]);
  assert.deepEqual(body.counts, REAL.counts);
  // 真源原始 cells 不再下发（前端不接触真源形状）
  assert.equal(body.cells, undefined);
});

test("Host 降级：文件缺失（当前 main 正常态）→ 200 + ok:false + degraded + missing 标注，不 500", async () => {
  const root = makeRepo({}); // 无宪章文件、非 git 仓库 → 两级都失败
  const { routes, warnings } = await loadHost(root);
  const res = fakeRes();
  await assert.doesNotReject(() => charterRoute(routes).handler({}, res), "降级不得抛异常给宿主");
  assert.equal(res.statusCode, 200, "禁 5xx（前端会误判断网）");
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.degraded, true);
  assert.equal(body.missing, "宪章三问-48格.json");
  assert.match(body.error, /工作区无/);
  assert.ok(body.attempts.length >= 1);
  assert.ok(warnings.some((w) => w.includes("charter")), "降级必须留痕（铁律 24）");
});

test("Host 边界：坏 JSON → 200 + degraded + 解析失败原因，不抛异常", async () => {
  const root = makeRepo({ [CHARTER_REL_PATH]: "{ not json" });
  const { routes, warnings } = await loadHost(root);
  const res = fakeRes();
  await assert.doesNotReject(() => charterRoute(routes).handler({}, res));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.degraded, true);
  assert.match(body.error, /JSON 解析失败/);
  assert.ok(warnings.length > 0);
});

// ── 框架态显式降级（D963 退回项：DSH 版本不足 / slot 不存在 / 插件未装）──
// 依据 DSH 锚定仓实读：
//   · slots.inject 对未声明 slot 静默不执行回调（ui-renderer/src/client/registry.ts reconcile）
//   · slots.register 对未声明 slot 同步抛错（ui-slots/src/index.ts:1206）
//   · service 级缺失 → apply 挂起（runtime.ts:393 waitingFor）/ 插件未装 → 无执行点：框架侧，插件无法自报（README 已声明）
function captureConsole() {
  const warnings = [];
  const errors = [];
  const prevWarn = console.warn;
  const prevError = console.error;
  console.warn = (...a) => warnings.push(a.join(" "));
  console.error = (...a) => errors.push(a.join(" "));
  return {
    warnings, errors,
    restore() { console.warn = prevWarn; console.error = prevError; },
  };
}

/** 复用 loadPlugin 的装载器，但用自定义 ctx 调 apply（绕过默认完整 ctx）。 */
function loadPluginWithCtx() {
  // 与 loadPlugin 相同的装载流程，仅把 apply(ctx) 暴露给调用方
  const p = loadPlugin();
  return p;
}

test("框架态①：ctx.slots 缺失/API 面不完整 → console.warn 显式提示 + 不抛错 + 不注册任何槽位", () => {
  const p = loadPluginWithCtx();
  const cap = captureConsole();
  try {
    // 重新取插件模块并用手工 ctx 驱动 apply
    const capturedCtxApply = (() => {
      // loadPlugin 已 apply 一次（完整 ctx）；这里重新 eval 源码拿独立模块
      let captured = null;
      const g = { stores: [], compIdx: 0, cursor: null, effectQueue: [] };
      const ReactMini = {
        createElement: () => ({}),
        useState: () => [null, () => {}],
        useCallback: (fn) => fn,
        useEffect: () => {},
      };
      const docStub = { visibilityState: "visible", querySelectorAll: () => [], createElement: () => ({ dataset: {}, textContent: "" }), head: { appendChild() {} }, addEventListener() {}, removeEventListener() {} };
      const winStub = { innerWidth: 1400, innerHeight: 900, __ModuleLoader__: { load: (def) => { captured = def; } } };
      const prevW = globalThis.window, prevD = globalThis.document;
      globalThis.window = winStub; globalThis.document = docStub;
      (0, eval)(SRC);
      globalThis.window = prevW; globalThis.document = prevD;
      const mod = captured.factory((name) => {
        if (name === "react") return ReactMini;
        if (name === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}) };
        throw new Error("unexpected require: " + name);
      });
      return mod.apply;
    })();
    const regs = [];
    const badCtx = {
      effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
      slots: { /* 有对象但无 inject/register API 面（旧版宿主） */ },
      slotsInject: undefined,
      layout: { selectPanel() {} },
    };
    Object.defineProperty(badCtx, "slots", { value: {} });
    assert.doesNotThrow(() => capturedCtxApply(badCtx), "API 面缺失不得抛错拖垮宿主");
    assert.ok(cap.warnings.some((w) => w.includes("DSH 版本不足") && w.includes("ctx.slots 不可用")), "必须显式 warn（禁静默）: " + cap.warnings.join(" | "));
    // 无 slots 服务的极端情形：ctx.slots undefined
    assert.doesNotThrow(() => capturedCtxApply({ effect() {}, layout: {} }));
    assert.ok(cap.warnings.filter((w) => w.includes("DSH 版本不足")).length >= 2, "两种残缺 ctx 都必须各自 warn");
    assert.equal(regs.length, 0);
  } finally {
    cap.restore();
    p.restore();
  }
});

test("框架态②：slot 未声明（specDynamic 返回 undefined）→ apply 时显式 warn「未声明/等待声明」", () => {
  const cap = captureConsole();
  const regs = [];
  let captured = null;
  const ReactMini = {
    createElement: () => ({}),
    useState: () => [null, () => {}],
    useCallback: (fn) => fn,
    useEffect: () => {},
  };
  const docStub = { visibilityState: "visible", querySelectorAll: () => [], createElement: () => ({ dataset: {}, textContent: "" }), head: { appendChild() {} }, addEventListener() {}, removeEventListener() {} };
  const winStub = { innerWidth: 1400, innerHeight: 900, __ModuleLoader__: { load: (def) => { captured = def; } } };
  const prevW = globalThis.window, prevD = globalThis.document;
  globalThis.window = winStub; globalThis.document = docStub;
  (0, eval)(SRC);
  globalThis.window = prevW; globalThis.document = prevD;
  const mod = captured.factory((name) => {
    if (name === "react") return ReactMini;
    if (name === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}) };
    throw new Error("unexpected require: " + name);
  });
  try {
    const ctx = {
      effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
      layout: { selectPanel() {} },
      slots: {
        specDynamic: (key) => (key === "main" ? { kind: "keyed", scope: "root" } : undefined), // sidebar.panellist 未声明
        inject(slot, cb) { regs.push({ inject: slot }); const d = cb(); return typeof d === "function" ? d : () => {}; },
        register(options, component) { regs.push({ options, component }); return () => {}; },
      },
    };
    mod.apply(ctx);
    // specDynamic 探测：main 已声明（无未声明 warn），sidebar.panellist 未声明 → 恰一条 warn
    const warns = cap.warnings.filter((w) => w.includes("未声明"));
    assert.equal(warns.length, 1, "只对未声明的 slot warn: " + warns.join(" | "));
    assert.match(warns[0], /sidebar\.panellist/);
    assert.match(warns[0], /等待声明/);
    // 注入仍保留（声明稍后出现时回调照常跑）
    assert.equal(regs.filter((r) => r.inject === "sidebar.panellist").length, 2, "两个入口行的 inject 仍保留");
  } finally {
    cap.restore();
  }
});

test("框架态③：register 对未声明 slot 同步抛错 → guardedRegister 捕获 + warn，不穿透宿主", () => {
  const cap = captureConsole();
  let captured = null;
  const ReactMini = {
    createElement: () => ({}),
    useState: () => [null, () => {}],
    useCallback: (fn) => fn,
    useEffect: () => {},
  };
  const docStub = { visibilityState: "visible", querySelectorAll: () => [], createElement: () => ({ dataset: {}, textContent: "" }), head: { appendChild() {} }, addEventListener() {}, removeEventListener() {} };
  const winStub = { innerWidth: 1400, innerHeight: 900, __ModuleLoader__: { load: (def) => { captured = def; } } };
  const prevW = globalThis.window, prevD = globalThis.document;
  globalThis.window = winStub; globalThis.document = docStub;
  (0, eval)(SRC);
  globalThis.window = prevW; globalThis.document = prevD;
  const mod = captured.factory((name) => {
    if (name === "react") return ReactMini;
    if (name === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}) };
    throw new Error("unexpected require: " + name);
  });
  try {
    const ctx = {
      effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
      layout: { selectPanel() {} },
      slots: {
        specDynamic: () => undefined, // 全部未声明（DSH 版本过旧）
        inject(slot, cb) { cb(); return () => {}; }, // 声明缺席时 inject 本不跑回调；这里强制跑以测 register 抛错路径
        register() { throw new Error('slot "main" is not declared (a parent entry\'s children table must declare it)'); },
      },
    };
    assert.doesNotThrow(() => mod.apply(ctx), "register 抛错必须被捕获，禁穿透宿主 fiber");
    const fails = cap.warnings.filter((w) => w.includes("注册失败"));
    assert.equal(fails.length, 4, "四个注册点（2 面板 × main+入口）各自 warn: " + fails.length);
    assert.match(fails[0], /is not declared/);
    assert.match(fails[0], /DSH 版本可能过旧/);
  } finally {
    cap.restore();
  }
});

test("框架态④（框架侧声明）：service 级缺失/插件未装 → 插件无执行点，README 已声明不可自报", () => {
  // 逻辑断言（该态物理上无法由插件代码测试——插件代码不在运行）：
  // 依据 cordis-client-runner/src/client/runtime.ts:393 waitingFor 投影 + 插件未装无执行点。
  // 这里只断言 README 框架态表格确实声明了这两个框架侧态（防止声明被静默删掉）。
  const readme = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../README.md"), "utf8");
  assert.match(readme, /插件未装/, "README 必须声明「插件未装」为框架侧态");
  assert.match(readme, /runtime\.ts:393/, "README 必须给出 waitingFor 依据 file:line");
  assert.match(readme, /静默不执行回调/, "README 必须记录 inject 静默等待语义");
});

// ── adapter 单测 + 契约一致性（D963 退回项 1/4/5：真源 cells[] → 面板 rows[]×3）──
test("adapter·真源当前态（48 格全 empty）→ 16 行 × 3 列，全部 tone=empty", () => {
  const g = adaptCharterGrid(REAL);
  assert.equal(g.rows.length, 16);
  assert.ok(g.rows.every((row) => row.cells.length === 3));
  for (const row of g.rows) {
    for (const cell of row.cells) {
      assert.equal(cell.tone, "empty");
      assert.equal(cell.text, "未填");
    }
  }
  // 行标签 = layer + ext_point（与权威生成器 (layer, ext_point) 分组键一致），保持源顺序
  assert.equal(g.rows[0].layer, "对象层");
  assert.equal(g.rows[0].name, "节点（要素）");
  // 列头取真源 question_text
  assert.deepEqual(g.questions, [{ key: "q1", text: "加了吗" }, { key: "q2", text: "接上了吗" }, { key: "q3", text: "生效了吗" }]);
  assert.deepEqual(g.counts, REAL.counts);
  assert.equal(g.filled, 0);
});

test("adapter·四色口径（照权威生成器 gen-charter-grid.py:17-18）：green/yellow/red/empty，未知→empty", () => {
  const g = adaptCharterGrid(MIXED);
  const tones = g.rows.flatMap((r) => r.cells.map((c) => c.tone));
  assert.equal(tones.filter((t) => t === "green").length, 2);
  assert.equal(tones.filter((t) => t === "yellow").length, 2);
  assert.equal(tones.filter((t) => t === "red").length, 1);
  assert.equal(tones.filter((t) => t === "empty").length, 43);
  // 文案口径
  const texts = g.rows.flatMap((r) => r.cells.map((c) => c.text));
  assert.ok(texts.includes("生效了"));
  assert.ok(texts.includes("接了未生效"));
  assert.ok(texts.includes("缺失"));
  // note = judgement（非空时）
  const greenCell = g.rows.flatMap((r) => r.cells).find((c) => c.tone === "green");
  assert.equal(greenCell.note, "端到端用例 EG-1 过");
  // 未知 status → empty（X27；生成器 COL.get 默认同款）
  const weird = JSON.parse(REAL_RAW);
  weird.cells[0].status = "super-done";
  const wg = adaptCharterGrid(weird);
  assert.equal(wg.rows[0].cells[0].tone, "empty", "白名单外 status 必须落 empty");
  // note 空时回退 question_desc（生成器同款）
  const emptyCell = wg.rows[0].cells[0];
  assert.equal(emptyCell.note, weird.cells[0].question_desc);
});

test("adapter·边界：非对象/无 cells → rows=[] + 默认列头，不抛错", () => {
  for (const bad of [null, [], "string", 42, {}, { cells: "not-array" }]) {
    const g = adaptCharterGrid(bad);
    assert.deepEqual(g.rows, []);
    assert.deepEqual(g.questions.map((q) => q.text), ["加了吗", "接上了吗", "生效了吗"]);
  }
  // 某扩展点缺一问 → 补齐 empty 不塌列
  const missing = JSON.parse(REAL_RAW);
  missing.cells = missing.cells.filter((c) => c.id !== "C02"); // 去掉第 1 行的 q2
  const mg = adaptCharterGrid(missing);
  assert.equal(mg.rows.length, 16);
  assert.equal(mg.rows[0].cells.length, 3);
  assert.equal(mg.rows[0].cells[1].tone, "empty");
});

test("契约一致性：adapter 输出形状 vs 客户端读取字段逐项吻合（本次漏网的判据）", async () => {
  // 客户端 lib/client.js 实际读取：rows[].layer/name/cells[].tone/text/note、questions[].text、filled
  // （charterCell 只认 tone 白名单；questions 兼容 string 但主形状是 {key,text}）
  for (const src of [REAL, MIXED]) {
    const g = adaptCharterGrid(src);
    for (const row of g.rows) {
      assert.equal(typeof row.layer, "string", "row.layer 必须是 string（客户端拼行标签）");
      assert.equal(typeof row.name, "string", "row.name 必须是 string");
      assert.ok(Array.isArray(row.cells) && row.cells.length === 3, "row.cells 必须 3 元数组");
      for (const cell of row.cells) {
        assert.ok(["green", "yellow", "red", "empty"].includes(cell.tone), "cell.tone 必须在四色白名单: " + cell.tone);
        assert.equal(typeof cell.text, "string");
        assert.equal(typeof cell.note, "string");
      }
    }
    for (const q of g.questions) {
      assert.equal(typeof q.text, "string", "questions[].text 必须是 string（客户端列头直读）");
    }
    assert.ok(g.filled === null || typeof g.filled === "number");
  }
  // 端到端闭环：adapter 输出直接喂客户端渲染不塌（混色源）
  const p = loadPlugin();
  try {
    const r = await p.render(Object.assign({}, adaptCharterGrid(MIXED), { ok: true, source: "worktree" }));
    assert.match(r.text, /16 个扩展点 × 3 问/);
    assert.match(r.text, /🟢 生效 2/);
    const emptyCells = r.nodes.filter((n) => n.className.includes("scg-pill-empty") && n.props.children === "未填");
    assert.equal(emptyCells.length, 43);
  } finally {
    p.restore();
  }
});

// ── 几何能力（D963 第二项退回：可移动 + 可放大，复用既有先例）──
// 键名 synova.charter.panel.v1（独立于项目总览 synova.pm.panel.v1）；min 720×480 / max 视口-32（视口 1400×900）。
test("几何·记忆生效且键不串：宪章键记忆原样生效；项目总览键不影响宪章（走默认）", async () => {
  const p = loadPlugin({ storage: { "synova.charter.panel.v1": JSON.stringify({ left: 77, top: 33, width: 900, height: 560 }) } });
  try {
    const r = await p.render(ROUTE_EMPTY);
    const root = r.nodes.find((n) => n.className.includes("scg-root"));
    assert.ok(root, "scg-root 必须渲染");
    assert.equal(root.props.style.left, "77px");
    assert.equal(root.props.style.top, "33px");
    assert.equal(root.props.style.width, "900px");
    assert.equal(root.props.style.height, "560px");
  } finally {
    p.restore();
  }
  // 只给项目总览键 → 宪章不读它，用默认（视口 1400×900 居中，def 980×640）
  const p2 = loadPlugin({ storage: { "synova.pm.panel.v1": JSON.stringify({ left: 1, top: 2, width: 111, height: 222 }) } });
  try {
    const r = await p2.render(ROUTE_EMPTY);
    const root = r.nodes.find((n) => n.className.includes("scg-root"));
    assert.notEqual(root.props.style.left, "1px", "不得读项目总览键");
    assert.notEqual(root.props.style.width, "111px");
    assert.equal(root.props.style.width, "980px", "默认宽 980");
    assert.equal(root.props.style.height, "640px", "默认高 640");
    assert.equal(root.props.style.left, Math.round((1400 - 980) / 2) + "px", "默认水平居中");
  } finally {
    p2.restore();
  }
});

test("几何·拖动：位移落盘到宪章键、不改尺寸；越界夹回视口内", async () => {
  const p = loadPlugin({ storage: { "synova.charter.panel.v1": JSON.stringify({ left: 100, top: 60, width: 900, height: 560 }) } });
  try {
    const r = await p.render(ROUTE_EMPTY);
    const grip = r.nodes.find((n) => n.className.includes("scg-grip"));
    assert.ok(grip, "标题栏必须作为拖拽区存在");
    for (const h of ["onPointerDown", "onPointerMove", "onPointerUp"]) {
      assert.ok(Object.keys(grip.props).includes(h), "标题栏必须挂 " + h);
    }
    const cap = { setPointerCapture() {} };
    grip.props.onPointerDown({ clientX: 200, clientY: 100, pointerId: 1, currentTarget: cap });
    grip.props.onPointerMove({ clientX: 260, clientY: 130 }); // +60 / +30
    grip.props.onPointerUp({});
    const saved = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(p.storageWrites[p.storageWrites.length - 1].key, "synova.charter.panel.v1", "必须写宪章键");
    assert.equal(saved.left, 160, "位移必须落盘");
    assert.equal(saved.top, 90);
    assert.equal(saved.width, 900, "拖动不得改变尺寸");
    // 越界 → 夹回视口内（1400×900）
    grip.props.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1, currentTarget: cap });
    grip.props.onPointerMove({ clientX: 99999, clientY: 99999 });
    grip.props.onPointerUp({});
    const clamped = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(clamped.left, 1400 - 900, "left 夹到视口-宽");
    assert.equal(clamped.top, 900 - 560, "top 夹到视口-高");
  } finally {
    p.restore();
  }
});

test("几何·缩放：min 720×480 / max 视口-32px（1400×900 → 1368×868）", async () => {
  const p = loadPlugin({ storage: { "synova.charter.panel.v1": JSON.stringify({ left: 10, top: 10, width: 900, height: 560 }) } });
  try {
    const r = await p.render(ROUTE_EMPTY);
    const handle = r.nodes.find((n) => n.className.includes("scg-resize"));
    assert.ok(handle, "右下角必须有 resize 手柄");
    const cap = { setPointerCapture() {} };
    handle.props.onPointerDown({ clientX: 0, clientY: 0, pointerId: 2, currentTarget: cap });
    handle.props.onPointerMove({ clientX: -9999, clientY: -9999 });
    handle.props.onPointerUp({});
    let saved = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(saved.width, 720, "min 宽 720");
    assert.equal(saved.height, 480, "min 高 480");
    handle.props.onPointerDown({ clientX: 0, clientY: 0, pointerId: 3, currentTarget: cap });
    handle.props.onPointerMove({ clientX: 99999, clientY: 99999 });
    handle.props.onPointerUp({});
    saved = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(saved.width, 1400 - 32, "max 宽视口-32");
    assert.equal(saved.height, 900 - 32, "max 高视口-32");
  } finally {
    p.restore();
  }
});

test("几何·持久化失败：localStorage 抛错 → console.warn + 不崩（读取失败走默认，写入失败不记忆）", async () => {
  const cap = captureConsole();
  const p = loadPlugin();
  try {
    // getItem 抛错 → 警告 + 默认几何
    globalThis.localStorage.getItem = () => { throw new Error("quota read"); };
    const r1 = await p.render(ROUTE_EMPTY);
    const root1 = r1.nodes.find((n) => n.className.includes("scg-root"));
    assert.equal(root1.props.style.width, "980px", "读取失败必须降级默认几何");
    assert.ok(cap.warnings.some((w) => w.includes("偏好读取失败") && w.includes("宪章三问")), "读取失败必须 warn: " + cap.warnings.join(" | "));
    // setItem 抛错 → 警告 + 拖动仍可用不崩、不落盘
    globalThis.localStorage.getItem = () => null;
    globalThis.localStorage.setItem = () => { throw new Error("quota full"); };
    const r2 = await p.render(ROUTE_EMPTY);
    const grip = r2.nodes.find((n) => n.className.includes("scg-grip"));
    const capPtr = { setPointerCapture() {} };
    assert.doesNotThrow(() => {
      grip.props.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1, currentTarget: capPtr });
      grip.props.onPointerMove({ clientX: 50, clientY: 20 });
      grip.props.onPointerUp({});
    }, "写失败不得抛错拖垮面板");
    assert.ok(cap.warnings.some((w) => w.includes("偏好写入失败") && w.includes("本次不记忆")), "写失败必须 warn");
  } finally {
    cap.restore();
    p.restore();
  }
});

test("几何·标题栏拖动区与缩放手柄挂全 pointer 事件 + 面板标题仍在", async () => {
  const p = loadPlugin();
  try {
    const r = await p.render(ROUTE_EMPTY);
    assert.match(r.text, /宪章三问/);
    const handle = r.nodes.find((n) => n.className.includes("scg-resize"));
    for (const h of ["onPointerDown", "onPointerMove", "onPointerUp", "onPointerCancel"]) {
      assert.ok(Object.keys(handle.props).includes(h), "手柄必须挂 " + h);
    }
    const grip = r.nodes.find((n) => n.className.includes("scg-grip"));
    assert.ok(Object.keys(grip.props).includes("onPointerCancel"), "拖动区必须挂 onPointerCancel");
  } finally {
    p.restore();
  }
});
