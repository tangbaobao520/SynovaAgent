// test/harness.js — 客户端插件装载 + 迷你 React 渲染夹具（被 client-panel.test.js 与证据脚本共用）
// 说明见 client-panel.test.js 头部：lib/client.js 零构建、只依赖 react / react/jsx-runtime，
// 因此可在 Node 里用受控 React 运行时真实渲染并断言。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/client.js"), "utf8");

/** 健康区默认夹具（多数用例只关心账本，给一份可用 health 让健康区正常渲染）。 */
export const DASH_OK = {
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
export function loadPlugin(opts = {}) {
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
