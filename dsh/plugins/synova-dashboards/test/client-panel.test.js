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

import { loadPlugin } from "./harness.js";

const LEDGER_OK = {
  schema: "project-ledger/1",
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
    // 右栏三仪表盘仍然注册（不得影响现有功能）
    assert.ok(
      p.registrations.some((r) => r.options && r.options.name === "shell.overlay"),
      "原有 shell.overlay 右栏必须保留"
    );
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
    assert.ok(p.fetchCalls.length > 0, "必须真的请求账本");
    for (const c of p.fetchCalls) {
      assert.equal(c.url, "/synova/pm/ledger");
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
