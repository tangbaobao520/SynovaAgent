// test/client-panel.test.js — 「项目总览」客户端面板渲染契约测试（node:test）
//
// 为什么能在 Node 里跑浏览器插件代码：lib/client.js 走 window.__ModuleLoader__.load 零构建工厂，
// 只依赖 react / react/jsx-runtime 两个静态种子模块。本测试注入迷你可控的 React 运行时
// （useState/useCallback/useEffect 真跑，两趟渲染：收集 effect → 驱动 fetch → 再渲染），
// 从而在无浏览器环境下真实验证：
//   · 槽位注册签名（sidebar.panellist {id,order,label} + main {key} 成对、id 相同）
//   · 正常账本 → 三数/26 线/阻塞/时间轴占位 全部渲染
//   · 路由级降级（ok:false）→ 显式降级文案，不白屏不抛错
//   · ledger 级部分降级（degraded:true）→ 警告条 + degraded_sources
//   · 零写入：全程只调用 GET，不触碰任何写接口
// 铁律 48：非空壳，每条路径都有真实断言。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── 迷你 React 装载/渲染夹具（原 test/harness.js；单消费者，内联以免多占一个 PR 文件位）──
const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/client.js"), "utf8");

/** 健康区默认夹具（多数用例只关心账本，给一份可用 health 让健康区正常渲染）。 */
const DASH_OK = {
  meta: { repoRoot: "/repo", generated_at: "2026-09-17T10:00:00+08:00" },
  product: { ok: true, product_progress_pct: 0, total_lines: 26, lines: [] },
  tasks: { ok: true, states: [], recent: [] },
  health: {
    ok: true,
    bypass: {
      present: true,
      total_events: 340,
      counts: { COMMITTED: 334, "detected-bypass": 0, BLOCKED: 0, DEGRADED: 0 },
      recent: [],
    },
    precommit_failures: { present: true, count: 0, recent: [] },
    m_patterns: [],
    cto_verdict: "🟢 绿",
  },
};

/**
 * 装载插件脚本。
 * @param {{storage?: Record<string,string>}} [opts] storage 为 localStorage 初始内容（键→值字符串）。
 * @returns {{registrations, fetchCalls, panelSelections, storageWrites, css, restore, render, renderDetailed}}
 */
function loadPlugin(opts = {}) {
  const registrations = [];
  const fetchCalls = [];
  const panelSelections = [];
  const storageWrites = [];
  const injectedStyles = [];
  const storage = new Map(Object.entries(opts.storage ?? {}));
  let captured = null;

  // ── 迷你 React 运行时 ────────────────────────────────────────────────
  const g = { stores: [], compIdx: 0, cursor: null, effects: [], effectQueue: [] };

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
      return [c.store[i], (v) => {
        c.store[i] = typeof v === "function" ? v(c.store[i]) : v;
      }];
    },
    useCallback(fn) {
      g.cursor.i++;
      return fn;
    },
    useEffect(fn) {
      g.cursor.i++;
      g.effectQueue.push(fn);
      return undefined;
    },
    useMemo(fn) {
      g.cursor.i++;
      return fn();
    },
  };
  const Fragment = Symbol("Fragment");
  const jsxRuntime = {
    Fragment,
    jsx: (type, props) => ({ type, props: props || {} }),
    jsxs: (type, props) => ({ type, props: props || {} }),
  };

  const documentStub = {
    visibilityState: "visible",
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { appendChild: (tag) => injectedStyles.push(tag) },
    addEventListener() {},
    removeEventListener() {},
  };
  const windowStub = {
    innerWidth: 1400,
    innerHeight: 900,
    __ModuleLoader__: { load: (def) => { captured = def; } },
  };
  const localStorageStub = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); storageWrites.push({ key: k, value: String(v) }); },
    removeItem: (k) => { storage.delete(k); },
  };

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
  };
  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.localStorage = localStorageStub;

  // 执行插件脚本（它会调用 window.__ModuleLoader__.load 注册工厂）
  // 用 indirect eval 让脚本在全局作用域求值，语义与浏览器加载一致。
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
  assert.ok(captured, "client.js 必须调用 window.__ModuleLoader__.load 注册工厂");

  const requireStub = (name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    throw new Error("unexpected require: " + name);
  };
  const mod = captured.factory(requireStub);

  const ctx = {
    layout: {
      selectPanel(panelId) {
        panelSelections.push(panelId);
      },
    },
    // 真实 ctx.effect 会立即执行回调并把返回值当 disposer；这里同语义
    effect(fn) {
      const dispose = fn();
      return typeof dispose === "function" ? dispose : () => {};
    },
    slots: {
      inject(slot, cb) {
        registrations.push({ inject: slot });
        const dispose = cb();
        return typeof dispose === "function" ? dispose : () => {};
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };
  mod.apply(ctx);

  return {
    registrations,
    fetchCalls,
    panelSelections,
    storageWrites,
    /** 本插件注入的 CSS 全文（由 apply 写入 <style>）。 */
    css: () => injectedStyles.map((t) => t.textContent).join("\n"),
    restore() {
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      globalThis.localStorage = prev.localStorage;
      globalThis.fetch = prev.fetch;
    },
    /** 两趟渲染：跑 effect 拉数据 → 再渲染。返回渲染出的文本片段。 */
    /** 详细渲染：除文本外还返回元素节点（className/props/handlers/父 className）与根内联样式。 */
    async renderDetailed(payload, opts = {}) {
      const r = await run(payload, opts);
      return r;
    },
    async render(payload, opts = {}) {
      const r = await run(payload, opts);
      return r.text;
    },
    /** 兼容旧签名：文本形式。 */
    async __renderText(payload, opts = {}) {
      const r = await run(payload, opts);
      return r.text;
    },
  };

  async function run(payload, opts = {}) {
      g.compIdx = 0;
      g.effectQueue = [];
      globalThis.fetch = async (url, o) => {
        fetchCalls.push({ url, options: o });
        const isDash = String(url).includes("/synova/dashboards/data");
        if (opts.fetchThrows) throw new Error(opts.fetchThrows);
        if (opts.httpStatus) return { ok: false, status: opts.httpStatus, json: async () => ({}) };
        // 两条路由可分别注入失败，用于验证「各自独立降级」
        if (isDash && opts.dashThrows) throw new Error(opts.dashThrows);
        if (!isDash && opts.ledgerThrows) throw new Error(opts.ledgerThrows);
        if (isDash && opts.dashStatus) return { ok: false, status: opts.dashStatus, json: async () => ({}) };
        if (!isDash && opts.ledgerStatus) return { ok: false, status: opts.ledgerStatus, json: async () => ({}) };
        if (isDash) {
          return { ok: true, status: 200, json: async () => (opts.dash === undefined ? DASH_OK : opts.dash) };
        }
        return { ok: true, status: 200, json: async () => payload };
      };
      const panelReg = registrations.find((r) => r.options && r.options.name === "main");
      assert.ok(panelReg, "必须注册 main keyed cell");
      const call = (fn, props) => { enterComponent(); return fn(props); };
      const collect = (node, out, parentClass) => {
        if (node === null || node === undefined || node === false || node === true) return;
        if (Array.isArray(node)) { for (const c of node) collect(c, out, parentClass); return; }
        if (typeof node === "string" || typeof node === "number") { out.text.push(String(node)); return; }
        if (typeof node !== "object") return;
        const t = node.type;
        if (typeof t === "function") {
          collect(call(t, node.props || {}), out, parentClass);
          return;
        }
        const p = node.props || {};
        const cls = typeof p.className === "string" ? p.className : "";
        if (typeof t === "string") {
          out.nodes.push({
            tag: t,
            className: cls,
            parentClass,
            props: p,
            handlers: Object.keys(p).filter((k) => k.startsWith("on")),
          });
        }
        collect(p.children, out, cls || parentClass);
      };
      const pass = () => {
        g.compIdx = 0;
        g.effectQueue = [];
        const out = { text: [], nodes: [] };
        const root = call(panelReg.component, {});
        collect(root, out, null);
        return { out, root };
      };
      pass(); // 第一趟：data=null
      const cleanups = [];
      for (const fn of g.effectQueue) {
        const c = fn();
        if (typeof c === "function") cleanups.push(c);
      }
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); // 驱动 fetch/await
      const second = pass(); // 第二趟：data 已就位
      for (const c of cleanups) c();
      // 根样式取「实际渲染出的最外层宿主元素」（组件工厂返回的是元素描述，不是 DOM 节点）
      const rootNode = second.out.nodes.find((n) => n.className.includes("spo-root")) || second.out.nodes[0] || { props: {}, className: "" };
      return {
        text: second.out.text.join(" \u241F "),
        nodes: second.out.nodes,
        rootStyle: rootNode.props.style || {},
        rootClassName: rootNode.className,
      };
  }
}

const LEDGER_OK = {
  schema: "project-ledger/1",
  ok: true,
  source: "worktree", // 路由成功时总会带上取数来源（lib/index.js 注入）
  generated_by: "gen-project-board.py",
  generated_at: "2026-09-17T10:00:00+08:00",
  git_head: "6a06e853abcdef",
  degraded: false,
  degraded_sources: [],
  totals: {
    v1_total: 125, v1_passed: 5, v1_verified: 2, delivery_pct: 4, verify_pct: 40,
    freshness: { green: 3, yellow: 1, red: 2 }, blocked_count: 1,
  },
  lines: [
    {
      id: 1, name: "桌面端", v1_total: 5, v1_passed: 3, v1_verified: 1,
      freshness: { green: 2, yellow: 0, red: 1 },
      blocked: [{ reason: "等 Win 真机", since: "2026-09-15", needs: "Win 机器", days: 2 }],
      assertions: [
        { id: "1-1", text: "能装", verify: "scenario", kind: "scenario", ok: true, evidence: [], age_days: 2, fail_when: "装不上" },
        { id: "1-2", text: "能开", verify: "test", kind: "test", ok: false, evidence: [], age_days: null, fail_when: "开不了" },
      ],
    },
    { id: 2, name: "账本派生", v1_total: 5, v1_passed: 2, v1_verified: 1, freshness: { green: 1, yellow: 1, red: 1 }, blocked: [], assertions: [] },
  ],
  blocked: [{ id: "D793", reason: "等 Win 真机", since: "2026-09-15", needs: "Win 机器", days: 2 }],
  timeline: [],
};

test("注册契约：sidebar.panellist 入口行与 main keyed cell 成对，且 id/key 相同", () => {
  const p = loadPlugin();
  try {
    const entry = p.registrations.find((r) => r.options && r.options.name === "sidebar.panellist");
    const cell = p.registrations.find((r) => r.options && r.options.name === "main");
    assert.ok(entry, "必须注册 sidebar.panellist 入口行");
    assert.ok(cell, "必须注册 main keyed cell");
    // 官方协议：同一个 id 寻址 main；未注册 main key 时点击会抛错 → 两者必须同名成对
    assert.equal(entry.options.id, "synova-project-overview");
    assert.equal(cell.options.key, "synova-project-overview");
    assert.equal(entry.options.id, cell.options.key);
    assert.equal(entry.options.label, "项目总览");
    assert.equal(typeof entry.options.order, "number");
    // 先注册 main 再注册入口行（避免点击瞬间 main 尚未就绪）
    assert.ok(
      p.registrations.indexOf(cell) < p.registrations.indexOf(entry),
      "main cell 必须先于入口行注册"
    );
    // 入口唯一（创始人要求）：右栏 shell.overlay 必须不再注册
    assert.equal(
      p.registrations.filter((r) => r.options && r.options.name === "shell.overlay").length,
      0,
      "右栏已并入中央面板，不得再注册 shell.overlay"
    );
    // 除这两个槽位外不得注册任何其它槽位（D963 起第二面板宪章三问复用同两槽位，按名去重）
    const names = [...new Set(p.registrations.filter((r) => r.options).map((r) => r.options.name))].sort();
    assert.deepEqual(names, ["main", "sidebar.panellist"], "只允许注册 main + sidebar.panellist 两个槽位");
  } finally {
    p.restore();
  }
});

test("正常路径：账本数据 → 三数 / 26 线 / 阻塞 / 时间轴占位 全部渲染", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render(LEDGER_OK);
    assert.match(text, /项目总览/);
    assert.match(text, /交付度 · V1 断言 5\/125/);
    assert.match(text, /验证率 · K3 已复核 2\/5/);
    assert.match(text, /保鲜红灯 · 🟢3 🟡1/);
    assert.match(text, /阻塞数/);
    // 26 线总览
    assert.match(text, /26 线总览/);
    assert.match(text, /桌面端/);
    assert.match(text, /V1 3\/5/);
    assert.match(text, /阻塞 1/);
    // 阻塞清单
    assert.match(text, /等 Win 真机/);
    assert.match(text, /已卡 2 天/);
    assert.match(text, /需要 Win 机器/);
    // 取数来源标注（验收 b）
    assert.match(text, /源 worktree/);
    // 执行看板区（并入原右栏「任务」页签）—— 本夹具无 tasks，断言显式空态
    assert.match(text, /执行看板/);
    assert.match(text, /ledger 无 tasks 数据（待 D795）/);
    // 健康区（并入原右栏「健康」页签）
    assert.match(text, /健康/);
    assert.match(text, /真绕过（detected-bypass）/);
    assert.match(text, /门禁拒绝（BLOCKED）/);
    // 时间轴占位（ledger 无 timeline → 显式文案，不得空白）
    assert.match(text, /待数据（D795）/);
    // 无硬降级横幅（⚠ 降级：）
    assert.doesNotMatch(text, /⚠ 降级：/);
  } finally {
    p.restore();
  }
});

test("降级① 路由级：ok:false → 显式 degraded 文案，不白屏不抛错", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render({ ok: false, degraded: true, error: "ledger 尚未产出：docs/synova/project/ledger.json 不存在（等 D795 派生器）" });
    assert.match(text, /⚠ 降级：/);
    assert.match(text, /ledger 尚未产出/);
    assert.match(text, /面板仍可用/);
    // 结构仍在：四区块不消失，只是无数值
    assert.match(text, /交付度/);
    assert.match(text, /26 线总览/);
    assert.match(text, /阻塞清单/);
    assert.match(text, /待数据（D795）/);
    assert.match(text, /ledger 无 lines 数据/);
  } finally {
    p.restore();
  }
});

test("降级② 网络/HTTP 失败 → error 横幅，不抛错", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render({}, { fetchThrows: "Failed to fetch" });
    assert.match(text, /⚠ 降级：Failed to fetch/);
    assert.match(text, /项目总览/);
  } finally {
    p.restore();
  }
});

test("降级③ ledger 内部分降级：degraded:true + degraded_sources → 警告条列出源", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render(Object.assign({}, LEDGER_OK, {
      degraded: true,
      degraded_sources: ["docs/synova/product-lines/product-lines.yaml", "scripts/golden-scenarios/evidence"],
    }));
    assert.match(text, /部分数据源降级/);
    assert.match(text, /product-lines\.yaml/);
    assert.match(text, /golden-scenarios\/evidence/);
    // 部分降级 ≠ 路由降级：不应出现硬降级横幅（⚠ 降级：）
    assert.doesNotMatch(text, /⚠ 降级：/);
  } finally {
    p.restore();
  }
});

test("边界：空 lines/blocked/timeline → 各区块给显式空态文案，不崩", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render({ schema: "project-ledger/1", degraded: false, totals: { v1_total: 125, v1_passed: 0, v1_verified: 0, freshness: { green: 0, yellow: 0, red: 0 }, blocked_count: 0 }, lines: [], blocked: [], timeline: [] });
    assert.match(text, /ledger 无 lines 数据（待 D795）/);
    assert.match(text, /无阻塞（blocked 为空）/);
    assert.match(text, /待数据（D795）/);
  } finally {
    p.restore();
  }
});

test("零写入：面板只发 GET /synova/pm/ledger，无任何写方法", async () => {
  const p = loadPlugin();
  try {
    await p.render(LEDGER_OK);
    assert.ok(p.fetchCalls.length > 0, "必须真的请求数据");
    const urls = p.fetchCalls.map((c) => c.url).sort();
    assert.deepEqual(urls, ["/synova/dashboards/data", "/synova/pm/ledger"], "只允许这两条只读路由");
    for (const c of p.fetchCalls) {
      const method = (c.options && c.options.method) || "GET";
      assert.equal(method, "GET");
      assert.equal(c.options && c.options.cache, "no-store");
    }
  } finally {
    p.restore();
  }
});

test("返回会话：面板头部 onBack 走 layout.selectPanel(null)（恢复会话，不改当前 Session）", () => {
  const p = loadPlugin();
  try {
    const cell = p.registrations.find((r) => r.options && r.options.name === "main");
    assert.equal(typeof cell.component, "function", "main cell 必须注册为组件工厂");
    const el = cell.component({});
    assert.ok(el && el.props, "main cell 必须返回可渲染元素");
    assert.equal(typeof el.props.onBack, "function", "面板必须拿到 onBack 回调");
    // 未点击前不应改变布局选中态
    assert.deepEqual(p.panelSelections, []);
    el.props.onBack();
    // 官方契约：null = 显示 Conversation（不改变当前 Session）
    assert.deepEqual(p.panelSelections, [null]);
  } finally {
    p.restore();
  }
});

test("取数来源：source=origin/main（git 权威回退）→ 面板显式标出，不伪装成工作区", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render(Object.assign({}, LEDGER_OK, {
      source: "origin/main",
      source_detail: "工作区无 docs/synova/project/ledger.json；已回退 git 权威 origin/main",
    }));
    assert.match(text, /源 origin\/main/);
    assert.doesNotMatch(text, /源 worktree/);
    // 回退仍须出数：三数照常渲染
    assert.match(text, /交付度 · V1 断言 5\/125/);
  } finally {
    p.restore();
  }
});

test("健康区降级可见：健康路由失败 → 该区显式降级文案，账本区不受影响", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render(LEDGER_OK, { dashThrows: "Failed to fetch health" });
    assert.match(text, /健康区降级：/);
    assert.match(text, /Failed to fetch health/);
    // 账本区照常可用（各自独立降级，铁律 31）
    assert.match(text, /交付度 · V1 断言 5\/125/);
    assert.match(text, /26 线总览/);
    assert.doesNotMatch(text, /⚠ 降级：/, "账本未降级，不应出现硬降级横幅");
  } finally {
    p.restore();
  }
});

test("健康区降级可见：health.ok=false → 显示其 error，不白屏", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render(LEDGER_OK, {
      dash: { meta: {}, health: { ok: false, degraded: true, error: "AUDIT-FINDINGS-LEDGER.md 缺失" } },
    });
    assert.match(text, /健康区降级：/);
    assert.match(text, /AUDIT-FINDINGS-LEDGER\.md 缺失/);
  } finally {
    p.restore();
  }
});

test("执行看板：ledger.tasks → D#/状态/owner/停滞天数 全渲染，按停滞降序", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render(Object.assign({}, LEDGER_OK, {
      tasks: [
        { id: "D1", title: "久拖未决", status: "claimed", owner: "mac-coding", stale_days: 30, updated_at: "2026-08-18" },
        { id: "D2", title: "刚开工", status: "impl_done", owner: "create-mode", stale_days: 1, updated_at: "2026-09-16" },
      ],
    }));
    assert.match(text, /执行看板/);
    assert.match(text, /2 个任务/);
    assert.match(text, /D1/);
    assert.match(text, /mac-coding · 停滞 30 天/);
    assert.match(text, /D2/);
    assert.match(text, /create-mode · 停滞 1 天/);
    // 状态分布标签（原右栏 statusText 复用）
    assert.match(text, /已认领 1/);
    assert.match(text, /实现完成 1/);
    // 停滞降序：D1 先于 D2
    assert.ok(text.indexOf("D1") < text.indexOf("D2"), "必须按停滞天数降序");
  } finally {
    p.restore();
  }
});

test("执行看板空态：ledger 无 tasks → 显式文案，不空白", async () => {
  const p = loadPlugin();
  try {
    const text = await p.render(LEDGER_OK);
    assert.match(text, /ledger 无 tasks 数据（待 D795）/);
  } finally {
    p.restore();
  }
});

test("尺寸/位置记忆：localStorage 几何生效；拖动/缩放写回且被夹在 min~视口-32 内", async () => {
  const p = loadPlugin({ storage: { "synova.pm.panel.v1": JSON.stringify({ left: 123, top: 45, width: 900, height: 640 }) } });
  try {
    const r = await p.renderDetailed(LEDGER_OK);
    assert.equal(r.rootClassName, "spo-root");
    // 记忆的几何必须原样生效（刷新后保持的前提）
    assert.equal(r.rootStyle.left, "123px");
    assert.equal(r.rootStyle.top, "45px");
    assert.equal(r.rootStyle.width, "900px");
    assert.equal(r.rootStyle.height, "640px");

    const grip = r.nodes.find((n) => n.className.includes("spo-grip"));
    assert.ok(grip, "标题栏必须作为拖拽区存在");
    for (const h of ["onPointerDown", "onPointerMove", "onPointerUp"]) {
      assert.ok(grip.handlers.includes(h), "标题栏必须挂 " + h);
    }
    const cap = { setPointerCapture() {} };
    grip.props.onPointerDown({ clientX: 200, clientY: 100, pointerId: 1, currentTarget: cap });
    grip.props.onPointerMove({ clientX: 260, clientY: 130 }); // +60 / +30
    grip.props.onPointerUp({});
    let saved = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(saved.left, 183, "拖动位移必须落到 localStorage");
    assert.equal(saved.top, 75);
    assert.equal(saved.width, 900, "拖动不得改变尺寸");

    // 越界拖动 → 夹回视口内（视口 1400×900）
    grip.props.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1, currentTarget: cap });
    grip.props.onPointerMove({ clientX: 99999, clientY: 99999 });
    grip.props.onPointerUp({});
    saved = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(saved.left, 1400 - 900);
    assert.equal(saved.top, 900 - 640);

    // 缩放：min 720×480
    const handle = r.nodes.find((n) => n.className.includes("spo-resize"));
    assert.ok(handle, "右下角必须有 resize 手柄");
    for (const h of ["onPointerDown", "onPointerMove", "onPointerUp"]) {
      assert.ok(handle.handlers.includes(h), "手柄必须挂 " + h);
    }
    handle.props.onPointerDown({ clientX: 0, clientY: 0, pointerId: 2, currentTarget: cap });
    handle.props.onPointerMove({ clientX: -9999, clientY: -9999 });
    handle.props.onPointerUp({});
    saved = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(saved.width, 720, "min 宽 720");
    assert.equal(saved.height, 480, "min 高 480");

    // 缩放：max 视口-32
    handle.props.onPointerDown({ clientX: 0, clientY: 0, pointerId: 3, currentTarget: cap });
    handle.props.onPointerMove({ clientX: 99999, clientY: 99999 });
    handle.props.onPointerUp({});
    saved = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(saved.width, 1400 - 32);
    assert.equal(saved.height, 900 - 32);
  } finally {
    p.restore();
  }
});

test("折叠记忆：折叠态来自 localStorage、开关写回、区块之间互不影响", async () => {
  const p = loadPlugin({ storage: { "synova.pm.collapse.v1": JSON.stringify({ lines: true, health: true }) } });
  try {
    const r = await p.renderDetailed(LEDGER_OK);
    // 标题始终在（折叠只隐藏内容）
    assert.match(r.text, /26 线总览/);
    assert.match(r.text, /健康/);
    // 折叠的区块内容不渲染
    assert.doesNotMatch(r.text, /V1 3\/5/, "折叠后不得渲染 26 线明细");
    assert.doesNotMatch(r.text, /真绕过（detected-bypass）/, "折叠后不得渲染健康区数值");
    // 未折叠的区块照常渲染
    assert.match(r.text, /执行看板/);
    assert.match(r.text, /时间轴/);

    const folds = r.nodes.filter((n) => n.className.includes("spo-fold"));
    assert.equal(folds.length, 5, "五个区块各有一个折叠开关");
    const byId = {};
    for (const f of folds) byId[f.props["data-section"]] = f;
    assert.deepEqual(Object.keys(byId).sort(), ["blocked", "health", "lines", "tasks", "timeline"]);
    assert.equal(byId.lines.props["aria-expanded"], "false", "记忆里折叠的区块必须收起");
    assert.equal(byId.health.props["aria-expanded"], "false");
    assert.equal(byId.tasks.props["aria-expanded"], "true", "未记忆的区块必须展开");
    assert.equal(byId.timeline.props["aria-expanded"], "true");
    assert.equal(byId.lines.props.children, "▸", "收起态图标 ▸");
    assert.equal(byId.tasks.props.children, "▾", "展开态图标 ▾");

    // 点击「时间轴」开关 → 写回，且保留其它区块既有折叠态
    byId.timeline.props.onClick();
    const saved = JSON.parse(p.storageWrites[p.storageWrites.length - 1].value);
    assert.equal(saved.timeline, true, "本次点击必须写回");
    assert.equal(saved.lines, true, "其它区块折叠态必须保留");
    assert.equal(saved.health, true);
  } finally {
    p.restore();
  }
});

test("修裁切/重叠：子项 flex:none、列表自带滚动、区块是 .spo-body 直接子项、断言默认收起", async () => {
  const p = loadPlugin();
  try {
    const css = p.css();
    assert.match(css, /\.spo-body>\*\{flex:none\}/, "根因修复：子项不得被 flex 压缩");
    assert.match(css, /\.spo-sec\{flex:none\}/);
    assert.match(css, /\.spo-list\{max-height:40vh;overflow-y:auto\}/, "列表类区块必须自带滚动");
    assert.match(css, /\.spo-root\{position:fixed/, "浮动定位是拖动/缩放的前提");

    const r = await p.renderDetailed(LEDGER_OK);
    const secs = r.nodes.filter((n) => n.className === "spo-sec");
    assert.ok(secs.length >= 5, "五个区块都在场，实际 " + secs.length);
    assert.ok(
      secs.every((s) => s.parentClass === "spo-body"),
      "区块必须是 .spo-body 的直接子项，flex:none 规则才命中"
    );
    const lists = r.nodes.filter((n) => (n.className || "").includes("spo-list"));
    assert.ok(lists.length >= 4, "列表类区块必须有 .spo-list 容器，实际 " + lists.length);
    assert.equal(
      r.nodes.filter((n) => (n.className || "").includes("spo-detail")).length,
      0,
      "断言明细默认必须收起"
    );
    const row = r.nodes.find((n) => n.className === "spo-line");
    assert.ok(row, "26 线必须渲染出行");
    assert.ok(row.handlers.includes("onClick"), "行必须可点击展开断言明细");
  } finally {
    p.restore();
  }
});
