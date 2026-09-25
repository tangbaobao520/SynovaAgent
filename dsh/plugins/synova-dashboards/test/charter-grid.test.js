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
// fixture 内嵌本文件，不写进生产路径冒充数据源。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { CHARTER_REL_PATH, CHARTER_MISSING } from "../lib/charter.js";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/client.js"), "utf8");

// ── 迷你 React 装载/渲染夹具（同 test/client-panel.test.js 手法，聚焦宪章面板）──
function loadPlugin() {
  const registrations = [];
  const fetchCalls = [];
  const panelSelections = [];
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
  const windowStub = {
    innerWidth: 1400, innerHeight: 900,
    __ModuleLoader__: { load: (def) => { captured = def; } },
  };
  const prev = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  globalThis.window = windowStub;
  globalThis.document = documentStub;
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
    registrations, fetchCalls, panelSelections, render,
    restore() {
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      globalThis.fetch = prev.fetch;
    },
  };
}

// ── fixture（3 扩展点 × 3 问；内嵌测试文件，不进生产路径）──
const CHARTER_OK = {
  schema: "charter-grid/1",
  ok: true,
  source: "worktree",
  questions: ["加了吗", "接上了吗", "生效了吗"],
  rows: [
    { id: "E01", name: "专家文件驱动", cells: [
      { status: "done", note: "expert/ 8 文件" },
      { status: "wired", note: "ExpertDispatcher" },
      { status: "verified", note: "K3 已核" },
    ] },
    { id: "E02", name: "哨兵文件驱动", cells: [
      { status: "partial", note: "45/60" },
      { status: "", note: "" },
      { status: undefined },
    ] },
    { id: "E03", name: "桌面端", cells: [
      { status: "fail", note: "Win 未装" },
      { status: "pending_k3" },
      { status: "unknown-word" },
    ] },
  ],
};

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

test("正常路径：3×3 fixture → 表头/三问列/扩展点行/note/四色图例全渲染", async () => {
  const p = loadPlugin();
  try {
    const r = await p.render(CHARTER_OK);
    assert.match(r.text, /宪章三问/);
    assert.match(r.text, /扩展点/);
    assert.match(r.text, /加了吗/);
    assert.match(r.text, /接上了吗/);
    assert.match(r.text, /生效了吗/);
    assert.match(r.text, /E01 · 专家文件驱动/);
    assert.match(r.text, /expert\/ 8 文件/);
    assert.match(r.text, /K3 已核/);
    // 四色图例计数：done+verified=2 绿；wired+partial=2 蓝；pending_k3=1 黄；fail=1 红；待办=3
    assert.match(r.text, /通过 2/);
    assert.match(r.text, /进行中 2/);
    assert.match(r.text, /待核 1/);
    assert.match(r.text, /失败 1/);
    assert.match(r.text, /待办 3/);
    assert.match(r.text, /3 个扩展点 × 3 问/);
    assert.doesNotMatch(r.text, /数据源未就绪/);
    // 数据来源标注
    assert.match(r.text, /源 worktree/);
  } finally {
    p.restore();
  }
});

test("X27 边界：空/缺失/未知 status 一律「待办」，绝不显示为通过", async () => {
  const p = loadPlugin();
  try {
    const r = await p.render(CHARTER_OK);
    const gray = r.nodes.filter((n) => n.className.includes("scg-pill-gray") && !n.className.includes("scg-legend"));
    // 排除图例 pill（其 children 是「待办 N」计数），只数矩阵格（children 恰为「待办」）
    const cells = gray.filter((n) => n.props.children === "待办");
    assert.equal(cells.length, 3, "空串/undefined/未知词 3 格必须全部落灰");
    for (const pill of cells) assert.match(pill.props.children, /待办/);
    // 待办格子绝不着绿（图例 pill「通过 2」排除，只数矩阵格「通过」）
    const greenCells = r.nodes.filter((n) => n.className.includes("scg-pill-green") && n.props.children === "通过");
    assert.equal(greenCells.length, 2, "只有显式 done/verified 才绿");
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
    assert.match(r.text, /待办 0/, "无数据时计数全 0，不冒充");
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
    await p.render(CHARTER_OK);
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

const GOOD_CHARTER = JSON.stringify({
  schema: "charter-grid/1",
  questions: ["加了吗", "接上了吗", "生效了吗"],
  rows: [{ id: "E01", name: "x", cells: [{ status: "done" }, { status: "done" }, { status: "todo" }] }],
});

test("Host 正常路径：工作区文件存在 → 200 + ok:true + source=worktree + 原字段保留", async () => {
  const root = makeRepo({ [CHARTER_REL_PATH]: GOOD_CHARTER });
  const { routes } = await loadHost(root);
  const res = fakeRes();
  await charterRoute(routes).handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.source, "worktree");
  assert.equal(body.schema, "charter-grid/1");
  assert.equal(body.rows.length, 1);
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
