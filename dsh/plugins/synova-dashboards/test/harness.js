// test/harness.js — 客户端插件装载 + 迷你 React 渲染夹具（被 client-panel.test.js 与证据脚本共用）
// 说明见 client-panel.test.js 头部：lib/client.js 零构建、只依赖 react / react/jsx-runtime，
// 因此可在 Node 里用受控 React 运行时真实渲染并断言。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/client.js"), "utf8");

/** 装载插件脚本，返回 { apply, registrations, fetchCalls }。 */
export function loadPlugin() {
  const registrations = [];
  const fetchCalls = [];
  const panelSelections = [];
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
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  const windowStub = {
    innerWidth: 1400,
    __ModuleLoader__: { load: (def) => { captured = def; } },
  };
  const localStorageStub = { getItem: () => null, setItem() {} };

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
    restore() {
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      globalThis.localStorage = prev.localStorage;
      globalThis.fetch = prev.fetch;
    },
    /** 两趟渲染：跑 effect 拉数据 → 再渲染。返回渲染出的文本片段。 */
    async render(payload, opts = {}) {
      g.compIdx = 0;
      g.effectQueue = [];
      globalThis.fetch = async (url, o) => {
        fetchCalls.push({ url, options: o });
        if (opts.fetchThrows) throw new Error(opts.fetchThrows);
        if (opts.httpStatus) return { ok: false, status: opts.httpStatus, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => payload };
      };
      const panelReg = registrations.find((r) => r.options && r.options.name === "main");
      assert.ok(panelReg, "必须注册 main keyed cell");
      const call = (fn, props) => { enterComponent(); return fn(props); };
      const collect = (node, out) => {
        if (node === null || node === undefined || node === false || node === true) return;
        if (Array.isArray(node)) { for (const c of node) collect(c, out); return; }
        if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return; }
        if (typeof node !== "object") return;
        const t = node.type;
        if (typeof t === "function") {
          const rendered = call(t, node.props || {});
          collect(rendered, out);
          return;
        }
        collect(node.props ? node.props.children : undefined, out);
      };
      const pass = () => {
        g.compIdx = 0;
        g.effectQueue = [];
        const out = [];
        collect(call(panelReg.component, {}), out);
        return out;
      };
      pass(); // 第一趟：data=null
      const cleanups = [];
      for (const fn of g.effectQueue) {
        const c = fn();
        if (typeof c === "function") cleanups.push(c);
      }
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); // 驱动 fetch/await
      const texts = pass(); // 第二趟：data 已就位
      for (const c of cleanups) c();
      return texts.join(" ␟ ");
    },
  };
}
