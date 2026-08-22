// lib/sync.js — @synova/task-board-adapter 同步核心（纯 Node，无 cordis 依赖，可独立测试）
//
// 契约（铁律 47）：
//   输入: repoRoot（Synova 仓库根，task-state/ 目录所在）、可选 { mapping, now, fetchImpl, requestIdFactory }
//   输出:
//     readTaskState(repoRoot) → { tasks: SynovaTask[], degraded: boolean, errors: string[] }
//     mapToBoardTask(raw, opts) → { task: BoardTask } | { error: string }
//     buildImportAction(tasks, sourceId) → dsh-web-ui TaskBoardAction<'import'>
//     syncOnce(opts) → { imported, sourceId, unknownStatuses, degraded, errors }
//   降级（铁律 24/31）:
//     task-state 目录缺失 / 单个文件坏 JSON → degraded: true + errors[]（不 throw，调用方可继续）
//     task-board API 不可达 / 非 2xx → syncOnce 抛错（由插件壳捕获记录，不崩溃进程）
//   设计依据（见 docs/p2-task-board-adapter-design-20260821.md）:
//     - 写入走官方 loopback API 的 import 动作：唯一能设置任意状态（含 done）的通道；
//     - import 按 sourceId 一次性、mergeTask 为 updatedAt 新者胜 → 每次同步用新 sourceId，
//       updatedAt 取同步时刻，保证镜像始终收敛到期望状态；
//     - 状态映射可配置；未知 Synova 状态落入 fallback（默认 todo）并计入 unknownStatuses。

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** Synova task-state 的字段子集（task-state/D###.json）。 */
export const TASK_STATE_FILE_RE = /^D\d+\.json$/;

/** 默认状态映射：Synova 状态 → 看板 5 列（backlog/todo/running/done/failed）。 */
export const DEFAULT_STATUS_MAPPING = Object.freeze({
  spec_done: "todo",
  claimed: "running",
  impl_done: "running",
  audited: "done",
  failed: "failed",
});

/** 未知 Synova 状态的落点。 */
export const FALLBACK_STATUS = "todo";

/**
 * 读取并解析 repoRoot/task-state/*.json。
 * @param {string} repoRoot - Synova 仓库根。
 * @returns {{ tasks: Array<Record<string, unknown>>, degraded: boolean, errors: string[] }}
 *   tasks 为已解析的原始条目（含 task_id/title/status/spec/impl/audit/updated_at/updated_by）。
 *   目录缺失 → degraded；单个文件坏 JSON → 跳过该文件并记入 errors。
 */
export function readTaskState(repoRoot) {
  const dir = join(repoRoot, "task-state");
  const errors = [];
  if (!existsSync(dir)) {
    return {
      tasks: [],
      degraded: true,
      errors: [`task-state 目录不存在: ${dir}`],
    };
  }
  const tasks = [];
  let files;
  try {
    files = readdirSync(dir).filter((f) => TASK_STATE_FILE_RE.test(f));
  } catch (err) {
    return { tasks: [], degraded: true, errors: [`读取 task-state 目录失败: ${err?.message ?? err}`] };
  }
  for (const file of files.sort(compareTaskId)) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push(`${file}: 非对象 JSON`);
        continue;
      }
      tasks.push(raw);
    } catch (err) {
      errors.push(`${file}: JSON 解析失败: ${err?.message ?? err}`);
    }
  }
  return { tasks, degraded: errors.length > 0, errors };
}

/** 按 D 编号数值排序（D9 < D10）。 */
function compareTaskId(a, b) {
  const na = Number(a.replace(/\D/g, ""));
  const nb = Number(b.replace(/\D/g, ""));
  return na - nb;
}

/**
 * 构造看板任务描述（多行摘要，供详情视图阅读）。
 * @param {Record<string, unknown>} raw - 原始 task-state 条目。
 * @param {boolean} unknown - 状态是否未映射。
 * @returns {string}
 */
export function buildDescription(raw, unknown = false) {
  const spec = raw?.spec && typeof raw.spec === "object" ? raw.spec : {};
  const impl = raw?.impl && typeof raw.impl === "object" ? raw.impl : {};
  const lines = [];
  lines.push(`Synova 状态: ${raw?.status ?? "—"}${unknown ? `（未映射，落入 ${FALLBACK_STATUS}）` : ""}`);
  lines.push(`规格: ${spec.path ?? "—"}${spec.commit ? ` (commit ${spec.commit})` : ""}`);
  lines.push(`实现: ${impl.commit ? `commit ${impl.commit}` : "—"}`);
  lines.push(`审计: ${raw?.audit ?? "未审计"}`);
  lines.push(`更新: ${raw?.updated_at ?? "—"}${raw?.updated_by ? ` by ${raw.updated_by}` : ""}`);
  return lines.join("\n");
}

/**
 * 构造看板执行 prompt：v1 为只读镜像文本，不触发真实执行（用户已确认）。
 * @param {string} id - D# 任务号。
 * @returns {string}
 */
export function buildPrompt(id) {
  return (
    `这是 Synova 任务 ${id} 的只读镜像。请根据描述中的规格/实现/审计信息总结该任务的当前进展，` +
    "不要修改任何代码、文件或任务状态。"
  );
}

/**
 * 将一条 Synova task-state 条目映射为看板 TaskRecord。
 * @param {Record<string, unknown>} raw - 原始条目。
 * @param {{ mapping?: Record<string, string>, now?: number, createdAt?: number }} [opts]
 *   createdAt 缺省用 now（首次出现）；传入既有值时保留（同步保真）。
 * @returns {{ task: import("types").BoardTask } | { error: string, unknown?: boolean }}
 */
export function mapToBoardTask(raw, opts = {}) {
  const mapping = opts.mapping ?? DEFAULT_STATUS_MAPPING;
  const now = opts.now ?? Date.now();
  const createdAt = opts.createdAt ?? now;
  const id = String(raw?.task_id ?? "").trim();
  const title = String(raw?.title ?? "").trim();
  if (!id || !title) {
    return { error: `task-state 条目缺 task_id/title: ${JSON.stringify(raw).slice(0, 100)}` };
  }
  const synStatus = String(raw?.status ?? "");
  const status = mapping[synStatus] ?? FALLBACK_STATUS;
  const unknown = !(synStatus in mapping);
  const task = {
    id,
    title: `${id} · ${title}`,
    description: buildDescription(raw, unknown),
    prompt: buildPrompt(id),
    status,
    createdAt,
    updatedAt: now,
    executions: [],
  };
  return unknown ? { task, unknown: true } : { task };
}

/**
 * 读取 board-backlog.json（无 D# 的待规划事项，自动化盲区的人工薄层）。
 * 文件缺失 = 正常（无待规划事项），不算 degraded。
 * @param {string} repoRoot - Synova 仓库根。
 * @returns {{ items: Array<Record<string, unknown>>, degraded: boolean, errors: string[] }}
 */
export function readBacklog(repoRoot) {
  const file = join(repoRoot, "docs", "synova", "coordination", "board-backlog.json");
  const errors = [];
  if (!existsSync(file)) {
    return { items: [], degraded: false, errors: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const items = Array.isArray(raw?.backlog) ? raw.backlog : [];
    return { items, degraded: false, errors: [] };
  } catch (err) {
    return { items: [], degraded: true, errors: [`backlog 解析失败: ${err?.message ?? err}`] };
  }
}

/**
 * 映射一条 backlog 项为看板任务（待规划事项恒落 todo 列）。
 * @param {Record<string, unknown>} item - backlog 项（id/title/note）。
 * @param {number} now - 时间戳。
 * @returns {{ task: import("types").BoardTask } | { error: string }}
 */
export function mapBacklogToBoardTask(item, now) {
  const id = String(item?.id ?? "").trim();
  const title = String(item?.title ?? "").trim();
  if (!id || !title) {
    return { error: `backlog 项缺 id/title: ${JSON.stringify(item).slice(0, 100)}` };
  }
  const note = item?.note ? String(item.note) : "—";
  return {
    task: {
      id,
      title: `${id} · ${title}`,
      description: `待规划（无 D#，人工薄层）\n说明: ${note}`,
      prompt: `这是 Synova 待规划事项 ${id} 的只读镜像，不要修改任何代码、文件或任务状态。`,
      status: "todo",
      createdAt: now,
      updatedAt: now,
      executions: [],
    },
  };
}

/**
 * 构造 import 动作（每次同步使用新 sourceId，见设计文档 §3 方案 1）。
 * @param {Array<import("types").BoardTask>} tasks - 映射后的看板任务。
 * @param {string} sourceId - 本次同步的源标识。
 * @returns {{ kind: "import", sourceId: string, tasks: unknown[] }}
 */
export function buildImportAction(tasks, sourceId) {
  return { kind: "import", sourceId, tasks };
}

/**
 * 通过官方 loopback API 提交一个动作。
 * @param {{ apiBase: string, requestId: string, action: unknown, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<unknown>} 任务板返回的 snapshot。
 * @throws 网络错误 / 非 2xx → 抛错（调用方记录）。
 */
export async function postAction({ apiBase, requestId, action, fetchImpl = fetch }) {
  const url = `${apiBase}/api/task-board/action`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: apiBase,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ requestId, action }),
  });
  if (!res.ok) {
    throw new Error(`task-board API 响应 ${res.status}: ${url}`);
  }
  return res.json();
}

/**
 * 读取看板当前状态（用于保留既有任务的 createdAt，避免每次同步重置创建时间）。
 * 走与 action 相同的 loopback 同源通道；失败不阻断同步（调用方自行降级）。
 * @param {{ apiBase: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<unknown>} TaskBoardSnapshot。
 * @throws 网络错误 / 非 2xx。
 */
export async function fetchBoardState({ apiBase, fetchImpl = fetch }) {
  const res = await fetchImpl(`${apiBase}/api/task-board/state`, {
    method: "GET",
    headers: {
      origin: apiBase,
      "sec-fetch-site": "same-origin",
    },
  });
  if (!res.ok) {
    throw new Error(`task-board API state 响应 ${res.status}`);
  }
  return res.json();
}

/**
 * 执行一次完整同步：读 task-state → 映射 → import 动作 → POST loopback。
 * createdAt 保真：先 GET 看板状态，已存在任务的 createdAt 沿用旧值（首次出现才用 now）。
 * @param {{ repoRoot: string, apiBase?: string, mapping?: Record<string, string>, now?: number, fetchImpl?: typeof fetch, requestIdFactory?: () => string }} opts
 * @returns {Promise<{ imported: number, sourceId: string, unknownStatuses: number, degraded: boolean, errors: string[] }>}
 * @throws 无有效任务可同步时返回 degraded；API 失败时抛错。
 */
export async function syncOnce(opts) {
  const apiBase = opts.apiBase ?? "http://127.0.0.1:3080";
  const now = opts.now ?? Date.now();
  const newId = opts.requestIdFactory ?? randomUUID;
  const read = readTaskState(opts.repoRoot);
  const errors = [...read.errors];

  // createdAt 保真（best-effort）：GET 失败不阻断同步，回退为 now。
  const existingCreatedAt = new Map();
  if (apiBase) {
    try {
      const state = await fetchBoardState({ apiBase, fetchImpl: opts.fetchImpl });
      for (const task of state?.tasks ?? []) {
        if (typeof task?.id === "string" && typeof task?.createdAt === "number") {
          existingCreatedAt.set(task.id, task.createdAt);
        }
      }
    } catch {
      // 保真失败：静默回退（不标记 degraded，同步本身仍成功）
    }
  }

  const tasks = [];
  let unknownStatuses = 0;
  for (const raw of read.tasks) {
    const mapped = mapToBoardTask(raw, {
      mapping: opts.mapping,
      now,
      createdAt: existingCreatedAt.get(String(raw?.task_id ?? "")) ?? now,
    });
    if ("task" in mapped) {
      tasks.push(mapped.task);
      if (mapped.unknown) unknownStatuses += 1;
    } else {
      errors.push(mapped.error);
    }
  }
  // 合并 backlog（无 D# 的待规划事项，自动化盲区的人工薄层）
  const backlog = readBacklog(opts.repoRoot);
  for (const item of backlog.items) {
    const mapped = mapBacklogToBoardTask(item, now);
    if ("task" in mapped) {
      tasks.push(mapped.task);
    } else {
      errors.push(mapped.error);
    }
  }
  if (backlog.degraded) {
    errors.push(...backlog.errors);
  }
  if (tasks.length === 0) {
    return {
      imported: 0,
      sourceId: "",
      unknownStatuses,
      degraded: true,
      errors: [...errors, "无有效任务可同步"],
    };
  }
  const sourceId = `synova-${newId()}`;
  const requestId = newId();
  const action = buildImportAction(tasks, sourceId);
  await postAction({ apiBase, requestId, action, fetchImpl: opts.fetchImpl });
  return { imported: tasks.length, sourceId, unknownStatuses, degraded: read.degraded || errors.length > 0, errors };
}
