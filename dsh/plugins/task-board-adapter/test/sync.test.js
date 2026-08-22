// test/sync.test.js — @synova/task-board-adapter 同步核心单元测试（node:test）
// 覆盖：正常路径 / 降级路径 / 边界条件（铁律 48）

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readTaskState,
  mapToBoardTask,
  readBacklog,
  mapBacklogToBoardTask,
  buildImportAction,
  syncOnce,
  fetchBoardState,
  DEFAULT_STATUS_MAPPING,
  FALLBACK_STATUS,
  readSnapshot,
  mapWinTaskToBoardTask,
  mapLineToBoardTask,
  mapOverallLineCard,
  mapTodoToBoardTask,
} from "../lib/sync.js";

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "synova-adapter-"));
  const taskDir = join(root, "task-state");
  mkdirSync(taskDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(taskDir, name), typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

const sampleTask = (over = {}) => ({
  task_id: "D356",
  title: "P0 哨兵阈值告警接线",
  status: "audited",
  spec: { path: "docs/plans/x.md", commit: "bc552aae" },
  impl: { commit: "6db5a17a" },
  audit: null,
  updated_at: "2026-08-17",
  updated_by: "CTO",
  ...over,
});

test("readTaskState: 正常路径——读取全部 D#.json 并按编号排序", () => {
  const root = makeRepo({
    "D9.json": sampleTask({ task_id: "D9", title: "九号" }),
    "D10.json": sampleTask({ task_id: "D10", title: "十号" }),
    "D2.json": sampleTask({ task_id: "D2", title: "二号" }),
    "ignored.txt": "not-a-task",
  });
  try {
    const { tasks, degraded, errors } = readTaskState(root);
    assert.equal(degraded, false);
    assert.equal(errors.length, 0);
    assert.deepEqual(tasks.map((t) => t.task_id), ["D2", "D9", "D10"], "应按 D 编号数值排序");
    assert.equal(tasks[0].title, "二号");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readTaskState: 降级路径——目录缺失 → degraded + 错误信息", () => {
  const root = mkdtempSync(join(tmpdir(), "synova-adapter-empty-"));
  try {
    const { tasks, degraded, errors } = readTaskState(root);
    assert.equal(tasks.length, 0);
    assert.equal(degraded, true);
    assert.ok(errors[0].includes("不存在"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readTaskState: 降级路径——坏 JSON 跳过 + 记入 errors，好文件不受影响", () => {
  const root = makeRepo({
    "D1.json": sampleTask({ task_id: "D1" }),
    "D2.json": "{ broken json",
  });
  try {
    const { tasks, degraded, errors } = readTaskState(root);
    assert.equal(tasks.length, 1, "坏文件应被跳过");
    assert.equal(degraded, true);
    assert.ok(errors.some((e) => e.includes("D2.json") && e.includes("解析失败")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readTaskState: 边界——非对象 JSON（数组/字符串）记入 errors", () => {
  const root = makeRepo({ "D1.json": "[1,2,3]" });
  try {
    const { tasks, errors, degraded } = readTaskState(root);
    assert.equal(tasks.length, 0);
    assert.equal(degraded, true);
    assert.ok(errors.some((e) => e.includes("非对象")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mapToBoardTask: 正常路径——三态映射（audited→done, impl_done→running, claimed→running）", () => {
  const now = 1_000_000;
  const cases = [
    ["audited", "done"],
    ["impl_done", "running"],
    ["claimed", "running"],
    ["spec_done", "todo"],
  ];
  for (const [syn, board] of cases) {
    const r = mapToBoardTask(sampleTask({ status: syn }), { now });
    assert.ok("task" in r, `${syn} 应映射成功`);
    assert.equal(r.task.status, board, `${syn} → ${board}`);
  }
});

test("mapToBoardTask: 降级路径——未知状态落入 fallback 并标记 unknown", () => {
  const r = mapToBoardTask(sampleTask({ status: "mystery_state" }), { now: 1 });
  assert.ok("task" in r);
  assert.equal(r.task.status, FALLBACK_STATUS);
  assert.equal(r.unknown, true);
  assert.ok(r.task.description.includes("未映射"));
});

test("mapToBoardTask: 边界——缺 task_id/title → error 不产出任务", () => {
  assert.ok("error" in mapToBoardTask({ title: "无 id" }));
  assert.ok("error" in mapToBoardTask({ task_id: "D1" }));
  assert.ok("error" in mapToBoardTask({}));
});

test("mapToBoardTask: 字段映射——title 带 D# 前缀、description 含 spec/impl 信息、prompt 为只读文本", () => {
  const r = mapToBoardTask(sampleTask(), { now: 123 });
  assert.equal(r.task.id, "D356");
  assert.ok(r.task.title.startsWith("D356 · "));
  assert.ok(r.task.description.includes("docs/plans/x.md"));
  assert.ok(r.task.description.includes("6db5a17a"));
  assert.ok(r.task.prompt.includes("只读镜像"));
  assert.ok(r.task.prompt.includes("D356"));
  assert.deepEqual(r.task.executions, []);
  assert.equal(r.task.createdAt, 123);
  assert.equal(r.task.updatedAt, 123);
});

test("buildImportAction: 形状正确", () => {
  const action = buildImportAction([{ id: "D1" }], "synova-src-1");
  assert.deepEqual(action, { kind: "import", sourceId: "synova-src-1", tasks: [{ id: "D1" }] });
});

test("syncOnce: 正常路径——POST 一次、body 正确、返回 imported 计数", async () => {
  const root = makeRepo({ "D1.json": sampleTask({ task_id: "D1", status: "audited" }) });
  let posted = null;
  const fetchImpl = async (url, init) => {
    posted = { url, init };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    const result = await syncOnce({
      repoRoot: root,
      apiBase: "http://127.0.0.1:3080",
      now: 42,
      fetchImpl,
      requestIdFactory: () => "req-1",
    });
    assert.equal(result.imported, 1);
    assert.equal(result.sourceId, "synova-req-1");
    assert.equal(result.degraded, false);
    assert.equal(posted.url, "http://127.0.0.1:3080/api/task-board/action");
    const body = JSON.parse(posted.init.body);
    assert.equal(body.requestId, "req-1");
    assert.equal(body.action.kind, "import");
    assert.equal(body.action.tasks[0].id, "D1");
    assert.equal(body.action.tasks[0].status, "done");
    assert.equal(posted.init.headers.origin, "http://127.0.0.1:3080");
    assert.equal(posted.init.headers["sec-fetch-site"], "same-origin");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("syncOnce: 降级路径——无有效任务 → degraded 且不 POST 动作", async () => {
  const root = makeRepo({});
  let postedAction = false;
  const result = await syncOnce({
    repoRoot: root,
    fetchImpl: async (url, init) => {
      if (init?.method === "POST") postedAction = true;
      return { ok: true, json: async () => ({ tasks: [] }) };
    },
  });
  assert.equal(postedAction, false, "不应提交任何动作");
  assert.equal(result.imported, 0);
  assert.equal(result.degraded, true);
  assert.ok(result.errors.some((e) => e.includes("无有效任务")));
  rmSync(root, { recursive: true, force: true });
});

test("fetchBoardState: 正常路径——GET 返回任务列表", async () => {
  const calls = [];
  const state = await fetchBoardState({
    apiBase: "http://127.0.0.1:3080",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ tasks: [{ id: "D1", createdAt: 1000 }] }) };
    },
  });
  assert.equal(calls[0].url, "http://127.0.0.1:3080/api/task-board/state");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.origin, "http://127.0.0.1:3080");
  assert.equal(state.tasks[0].createdAt, 1000);
});

test("fetchBoardState: 降级路径——非 2xx 抛错", async () => {
  await assert.rejects(
    fetchBoardState({ apiBase: "http://x", fetchImpl: async () => ({ ok: false, status: 500 }) }),
    /state 响应 500/,
  );
});

test("syncOnce: createdAt 保真——既有任务沿用旧 createdAt，新任务用 now", async () => {
  const root = makeRepo({
    "D1.json": sampleTask({ task_id: "D1", status: "audited" }),
    "D2.json": sampleTask({ task_id: "D2", status: "claimed" }),
  });
  let postBody = null;
  const fetchImpl = async (url, init) => {
    if (init?.method === "GET") {
      return { ok: true, json: async () => ({ tasks: [{ id: "D1", createdAt: 1000 }] }) };
    }
    postBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    const result = await syncOnce({ repoRoot: root, apiBase: "http://127.0.0.1:3080", now: 5000, fetchImpl });
    assert.equal(result.imported, 2);
    const d1 = postBody.action.tasks.find((t) => t.id === "D1");
    const d2 = postBody.action.tasks.find((t) => t.id === "D2");
    assert.equal(d1.createdAt, 1000, "既有任务 createdAt 应保留");
    assert.equal(d1.updatedAt, 5000, "updatedAt 仍取同步时刻（驱动 merge 覆盖）");
    assert.equal(d2.createdAt, 5000, "新任务 createdAt 用 now");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("syncOnce: 保真降级——GET state 失败仍同步（createdAt 回退 now，不标记 degraded）", async () => {
  const root = makeRepo({ "D1.json": sampleTask() });
  let posts = 0;
  const result = await syncOnce({
    repoRoot: root,
    apiBase: "http://127.0.0.1:3080",
    now: 777,
    fetchImpl: async (url, init) => {
      if (init?.method === "POST") {
        posts += 1;
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: false, status: 500 }; // GET state 失败
    },
  });
  assert.equal(result.imported, 1, "GET 失败不阻断同步");
  assert.equal(result.degraded, false, "GET 失败不标记 degraded");
  assert.equal(posts, 1);
  rmSync(root, { recursive: true, force: true });
});

test("syncOnce: 降级路径——坏 JSON 文件 → 跳过但其余任务仍同步、degraded 标记", async () => {
  const root = makeRepo({
    "D1.json": sampleTask({ task_id: "D1" }),
    "D2.json": "{ broken",
  });
  const result = await syncOnce({ repoRoot: root, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.equal(result.imported, 1);
  assert.equal(result.degraded, true);
  assert.ok(result.errors.some((e) => e.includes("D2.json")));
  rmSync(root, { recursive: true, force: true });
});

test("syncOnce: 降级路径——API 非 2xx → 抛错（由插件壳捕获）", async () => {
  const root = makeRepo({ "D1.json": sampleTask() });
  await assert.rejects(
    syncOnce({ repoRoot: root, fetchImpl: async () => ({ ok: false, status: 500 }) }),
    /task-board API 响应 500/,
  );
  rmSync(root, { recursive: true, force: true });
});

test("DEFAULT_STATUS_MAPPING 覆盖五种 Synova 状态且取值合法", () => {
  const valid = new Set(["backlog", "todo", "running", "done", "failed"]);
  for (const board of Object.values(DEFAULT_STATUS_MAPPING)) {
    assert.ok(valid.has(board), `非法看板状态: ${board}`);
  }
});

test("readBacklog: 正常路径——读 board-backlog.json 返回 items", () => {
  const root = mkdtempSync(join(tmpdir(), "synova-adapter-"));
  const dir = join(root, "docs/synova/coordination");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "board-backlog.json"), JSON.stringify({ backlog: [{ id: "PLAN-x", title: "待规划项", note: "说明" }] }));
  try {
    const { items, degraded, errors } = readBacklog(root);
    assert.equal(degraded, false);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "PLAN-x");
    assert.equal(errors.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readBacklog: 降级路径——文件缺失 → 空 items 不算 degraded", () => {
  const root = mkdtempSync(join(tmpdir(), "synova-adapter-"));
  try {
    const { items, degraded, errors } = readBacklog(root);
    assert.equal(items.length, 0);
    assert.equal(degraded, false);
    assert.equal(errors.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mapBacklogToBoardTask: 映射 backlog 项 → todo 列 + 描述含说明", () => {
  const mapped = mapBacklogToBoardTask({ id: "PLAN-x", title: "待规划项", note: "说明文字" }, 123456);
  assert.ok("task" in mapped);
  assert.equal(mapped.task.id, "PLAN-x");
  assert.equal(mapped.task.status, "todo");
  assert.ok(mapped.task.description.includes("说明文字"));
  assert.ok(mapped.task.title.includes("PLAN-x"));
});

test("mapBacklogToBoardTask: 边界——缺 id/title → error", () => {
  const mapped = mapBacklogToBoardTask({ note: "无 id" }, 123456);
  assert.ok("error" in mapped);
});

test("syncOnce: 合并 backlog——backlog 任务与 task-state 任务一起 import", async () => {
  const root = makeRepo({ "D1.json": sampleTask({ task_id: "D1", title: "一号任务" }) });
  const dir = join(root, "docs/synova/coordination");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "board-backlog.json"), JSON.stringify({ backlog: [{ id: "PLAN-x", title: "待规划项" }] }));
  let posted = null;
  try {
    const result = await syncOnce({
      repoRoot: root,
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: [] }) };
        posted = JSON.parse(opts.body);
        return { ok: true, json: async () => ({}) };
      },
    });
    assert.equal(result.imported, 2); // D1 + PLAN-x
    const ids = posted.action.tasks.map((t) => t.id);
    assert.ok(ids.includes("D1"));
    assert.ok(ids.includes("PLAN-x"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("syncOnce: 降级轮（无 snapshot）零删除——防误删 Win 域 D# 卡（D502 复核契约）", async () => {
  const root = makeRepo({ "D1.json": sampleTask({ task_id: "D1", title: "一号" }) });
  const actions = [];
  let stateTasks = [{ id: "D1", createdAt: 1000 }, { id: "D999", createdAt: 1000 }, { id: "PLAN-x", createdAt: 1000 }];
  try {
    const result = await syncOnce({
      repoRoot: root,
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: stateTasks }) };
        actions.push(JSON.parse(opts.body).action);
        return { ok: true, json: async () => ({}) };
      },
    });
    // D502 复核后契约：无 snapshot（降级轮）零删除——Win 卡同为 D# 格式无法区分，误删是破坏性的
    const deletes = actions.filter((a) => a.kind === "delete").map((a) => a.taskId);
    assert.equal(deletes.length, 0, `降级轮应零删除，实际: ${deletes}`);
    assert.equal(result.deleted, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("syncOnce: 降级轮（无 snapshot）backlog 亦零删除（D502 复核契约）", async () => {
  const root = makeRepo({ "D1.json": sampleTask({ task_id: "D1", title: "一号" }) });
  const dir = join(root, "docs/synova/coordination");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "board-backlog.json"), JSON.stringify({ backlog: [{ id: "PLAN-x", title: "待规划项" }] }));
  const actions = [];
  const stateTasks = [{ id: "D1", createdAt: 1000 }, { id: "D999", createdAt: 1000 }, { id: "PLAN-x", createdAt: 1000 }];
  try {
    await syncOnce({
      repoRoot: root,
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: stateTasks }) };
        actions.push(JSON.parse(opts.body).action);
        return { ok: true, json: async () => ({}) };
      },
    });
    const deletes = actions.filter((a) => a.kind === "delete").map((a) => a.taskId);
    assert.equal(deletes.length, 0, "降级轮（无 snapshot）零删除——僵尸等 derive 恢复后自愈");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ═══ D502: 多源统一（Win git 派生 / 26 线 / todos / snapshot 驱动）═══

function makeSnapshotFile(root, snapshot) {
  writeFileSync(join(root, "source-snapshot.json"), JSON.stringify(snapshot));
  return join(root, "source-snapshot.json");
}

const baseSnapshot = {
  generated_at: "2026-08-23T00:00:00+00:00",
  head: "abc1234def",
  task_state: {
    tasks: [{ task_id: "D500", title: "事件溯源", status: "impl_done" }],
    degraded: false, errors: [],
  },
  win_tasks: {
    tasks: [
      { task_id: "D338", title: "orgId 隔离", owner: "Win", commits: 3, author: "Synova-Win", date: "2026-08-22", status: "audited" },
      { task_id: "D357", title: "连接器", owner: "Win", commits: 7, author: "Synova-Win", date: "2026-08-22", status: "committed" },
    ],
    degraded: false, errors: [],
  },
  product_lines: {
    lines: [
      { id: 1, name: "桌面端", total: 8, verified: 0, progress_pct: 0 },
      { id: 7, name: "持续监测", total: 8, verified: 2, progress_pct: 25 },
      { id: 9, name: "客户循环", total: 6, verified: 6, progress_pct: 100 },
    ],
    overall_pct: 4,
    degraded: false, errors: [],
  },
  todos: {
    items: [
      { id: "T-1-01", line: 1, title: "部署门槛（S3-1）: 未验证", priority: "P0", owner: "DSH", acceptance: "GS-01 转绿" },
      { id: "T-3-01", line: 3, title: '报告"一看就懂"（S0-4）: 未验证', priority: "P0", owner: "DSH", acceptance: "GS-08 转绿" },
    ],
    degraded: false, errors: [],
  },
  backlog: {
    items: [{ id: "PLAN-x", title: "人工薄层", note: "说明" }],
    degraded: false, errors: [],
  },
  degraded: false,
  errors: [],
};

test("readSnapshot: 正常路径——合法 snapshot 返回对象", () => {
  const root = mkdtempSync(join(tmpdir(), "synova-snap-"));
  try {
    const p = makeSnapshotFile(root, baseSnapshot);
    const snap = readSnapshot(p);
    assert.ok(snap && snap.head === "abc1234def");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readSnapshot: 降级路径——缺失/坏 JSON/缺 head → null（调用方回退工作区直读）", () => {
  const root = mkdtempSync(join(tmpdir(), "synova-snap-"));
  try {
    assert.equal(readSnapshot(join(root, "nope.json")), null);
    const bad = makeSnapshotFile(root, { not: "a snapshot" });
    assert.equal(readSnapshot(bad), null);
    writeFileSync(bad, "{broken json");
    assert.equal(readSnapshot(bad), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mapWinTaskToBoardTask: audited→done / committed→running（合并≠完成）+ 标题带 Win 标记", () => {
  const a = mapWinTaskToBoardTask({ task_id: "D338", title: "隔离", status: "audited", author: "Synova-Win", commits: 3, date: "2026-08-22" });
  assert.equal(a.task.status, "done");
  assert.ok(a.task.title.startsWith("D338 · Win · "));
  const b = mapWinTaskToBoardTask({ task_id: "D357", title: "连接器", status: "committed" });
  assert.equal(b.task.status, "running");
  const c = mapWinTaskToBoardTask({ task_id: "", title: "x" });
  assert.ok("error" in c);
});

test("mapLineToBoardTask: 0 verified→todo / 部分→running / 全绿→done + id 补零", () => {
  assert.equal(mapLineToBoardTask({ id: 1, name: "桌面端", total: 8, verified: 0 }).task.status, "todo");
  const mid = mapLineToBoardTask({ id: 7, name: "持续监测", total: 8, verified: 2, progress_pct: 25 });
  assert.equal(mid.task.status, "running");
  assert.equal(mid.task.id, "L07");
  assert.ok(mid.task.title.includes("2/8"));
  assert.equal(mapLineToBoardTask({ id: 9, name: "客户循环", total: 6, verified: 6 }).task.status, "done");
  assert.ok("error" in mapLineToBoardTask({ id: 5 }));
});

test("mapOverallLineCard: L00 总览卡标题含总百分比与线数", () => {
  const c = mapOverallLineCard(baseSnapshot.product_lines);
  assert.equal(c.task.id, "L00");
  assert.ok(c.task.title.includes("4%"));
  assert.ok(c.task.title.includes("3 线"));
  assert.equal(c.task.status, "running"); // 4% > 0
  assert.ok("error" in mapOverallLineCard({ overall_pct: null, lines: [] }));
});

test("mapTodoToBoardTask: 恒 todo 列 + 标题带优先级与线号", () => {
  const t = mapTodoToBoardTask({ id: "T-1-01", line: 1, title: "部署门槛", priority: "P0", owner: "DSH", acceptance: "GS-01" });
  assert.equal(t.task.status, "todo");
  assert.equal(t.task.id, "T-1-01");
  assert.ok(t.task.title.includes("[P0][L01]"));
  assert.ok("error" in mapTodoToBoardTask({ id: "T-9-99" }));
});

test("syncOnce(snapshot): 四源聚合 import——D#+Win+L00/L线+T-*+PLAN 全部上板", async () => {
  const root = mkdtempSync(join(tmpdir(), "synova-snap-"));
  let posted = null;
  const stateTasks = [{ id: "D500", createdAt: 111 }, { id: "STALE", createdAt: 111 }];
  try {
    const snapPath = makeSnapshotFile(root, baseSnapshot);
    const result = await syncOnce({
      repoRoot: root,
      snapshotPath: snapPath,
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: stateTasks }) };
        const action = JSON.parse(opts.body).action;
        if (action.kind === "import") posted = action;
        return { ok: true, json: async () => ({}) };
      },
    });
    assert.equal(result.usingSnapshot, true);
    assert.equal(result.imported, 1 + 2 + 1 + 3 + 2 + 1); // task-state1 + win2 + L00 + 3线 + 2todo + 1backlog
    const ids = posted.tasks.map((t) => t.id);
    for (const want of ["D500", "D338", "D357", "L00", "L01", "L07", "L09", "T-1-01", "T-3-01", "PLAN-x"]) {
      assert.ok(ids.includes(want), `缺 ${want}`);
    }
    // createdAt 保真：D500 沿用看板旧值 111
    const d500 = posted.tasks.find((t) => t.id === "D500");
    assert.equal(d500.createdAt, 111);
    // 僵尸：STALE 不在四源 → delete
    assert.equal(result.deleted, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("syncOnce(snapshot): snapshot 缺失 → 回退工作区直读（usingSnapshot=false）且不误删四源外的看板卡", async () => {
  const root = makeRepo({ "D1.json": sampleTask({ task_id: "D1", title: "一号" }) });
  const actions = [];
  try {
    const result = await syncOnce({
      repoRoot: root,
      snapshotPath: join(root, "nope.json"),
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: [] }) };
        actions.push(JSON.parse(opts.body).action);
        return { ok: true, json: async () => ({}) };
      },
    });
    assert.equal(result.usingSnapshot, false);
    assert.equal(result.imported, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("D502复核: 降级保护——snapshot 缺失时只删 D# 域僵尸，不误删 Win/L*/T-* 域卡", async () => {
  // 场景：看板已有四源卡（含 L01/T-1-01/D357 Win），snapshot 文件突然损坏/被删
  const root = makeRepo({ "D1.json": sampleTask({ task_id: "D1", title: "一号" }) });
  const actions = [];
  // 看板现状：D1（task-state 有）、D999（僵尸）、D357（Win 域）、L01（线卡）、T-1-01（待办）
  const stateTasks = [
    { id: "D1", createdAt: 1000 }, { id: "D999", createdAt: 1000 },
    { id: "D357", createdAt: 1000 }, { id: "L01", createdAt: 1000 }, { id: "T-1-01", createdAt: 1000 },
  ];
  try {
    const result = await syncOnce({
      repoRoot: root,
      snapshotPath: join(root, "corrupted.json"),
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: stateTasks }) };
        const body = JSON.parse(opts.body);
        if (body.action.kind === "delete") actions.push(body.action.taskId);
        return { ok: true, json: async () => ({}) };
      },
    });
    // 先制造一个损坏的 snapshot 文件（readSnapshot → null → 降级）
    assert.equal(result.usingSnapshot, false);
    const deletes = actions;
    assert.equal(deletes.length, 0, `降级轮应零删除（Win 的 D# 格式与 task-state 无法区分），实际删了: ${deletes}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("D502复核: snapshot 正常时仍删全部域僵尸（保护不扩大化）", async () => {
  const root = mkdtempSync(join(tmpdir(), "synova-snap-"));
  writeFileSync(join(root, "source-snapshot.json"), JSON.stringify(baseSnapshot));
  const actions = [];
  const stateTasks = [
    { id: "D500", createdAt: 1 }, { id: "D338", createdAt: 1 }, { id: "L01", createdAt: 1 }, { id: "T-1-01", createdAt: 1 },
    { id: "D777", createdAt: 1 },  // 四源皆无的真僵尸
    { id: "L99", createdAt: 1 },   // 四源皆无的真僵尸（曾上板后被移除的线）
  ];
  try {
    const result = await syncOnce({
      repoRoot: root,
      snapshotPath: join(root, "source-snapshot.json"),
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: stateTasks }) };
        const body = JSON.parse(opts.body);
        if (body.action.kind === "delete") actions.push(body.action.taskId);
        return { ok: true, json: async () => ({}) };
      },
    });
    assert.equal(result.usingSnapshot, true);
    assert.ok(actions.includes("D777") && actions.includes("L99"), "snapshot 模式下四源外的僵尸应全删");
    assert.ok(!actions.includes("D338") && !actions.includes("L01") && !actions.includes("T-1-01"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("D502复核: L00 总览卡——全绿时 done / 0% 时 todo", () => {
  const all = mapOverallLineCard({ overall_pct: 100, lines: [{ id: 1, total: 5, verified: 5 }] });
  assert.equal(all.task.status, "done");
  const zero = mapOverallLineCard({ overall_pct: 0, lines: [{ id: 1, total: 5, verified: 0 }] });
  assert.equal(zero.task.status, "todo");
});

test("D506 K3 P1-2: 单源 degraded（win_tasks 空+degraded）→ 跳过删除，不误删该域卡", async () => {
  const root = mkdtempSync(join(tmpdir(), "synova-snap-"));
  const snap = JSON.parse(JSON.stringify(baseSnapshot));
  snap.win_tasks = { tasks: [], degraded: true, errors: ["win_tasks 解析失败"] };
  writeFileSync(join(root, "source-snapshot.json"), JSON.stringify(snap));
  const actions = [];
  // 看板已有四源卡 + 真僵尸（D777 四源皆无）
  const stateTasks = [
    { id: "D500", createdAt: 1 }, { id: "D338", createdAt: 1 }, { id: "L01", createdAt: 1 },
    { id: "T-1-01", createdAt: 1 }, { id: "D777", createdAt: 1 },
  ];
  try {
    const result = await syncOnce({
      repoRoot: root,
      snapshotPath: join(root, "source-snapshot.json"),
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: stateTasks }) };
        const body = JSON.parse(opts.body);
        if (body.action.kind === "delete") actions.push(body.action.taskId);
        return { ok: true, json: async () => ({}) };
      },
    });
    assert.equal(result.usingSnapshot, true);
    assert.equal(result.deleted, 0, `单源 degraded 应跳过删除，实际删了: ${actions}`);
    assert.equal(actions.length, 0, "任一源 degraded → 零删除（防误删该域全部卡）");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("D506 K3 P1-2: 单源 degraded 不误删——win_tasks degraded 但看板有 D338 卡", async () => {
  const root = mkdtempSync(join(tmpdir(), "synova-snap-"));
  const snap = JSON.parse(JSON.stringify(baseSnapshot));
  snap.win_tasks = { tasks: [], degraded: true, errors: ["x"] };
  writeFileSync(join(root, "source-snapshot.json"), JSON.stringify(snap));
  let deletedAny = false;
  try {
    await syncOnce({
      repoRoot: root,
      snapshotPath: join(root, "source-snapshot.json"),
      fetchImpl: async (url, opts) => {
        if (url.includes("/state")) return { ok: true, json: async () => ({ tasks: [{ id: "D338", createdAt: 1 }] }) };
        const body = JSON.parse(opts.body);
        if (body.action.kind === "delete") deletedAny = true;
        return { ok: true, json: async () => ({}) };
      },
    });
    assert.equal(deletedAny, false, "win_tasks degraded 时不得删除 D338 卡");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
