/**
 * @synova/engine-core task-store — 桥接到 Novis 服务端的 SQLite task-store
 *
 * 本模块是 engine-core 与 Novis 服务端的桥接层。
 * engine-core 的编排器（orchestrator）通过本模块更新管线进度；
 * 实际数据写入 Novis 服务端的 SQLite task-store（server/src/engine-server/task-store.ts）。
 *
 * 如果桥接不可用（如单元测试、独立运行），自动回退到 in-memory Map。
 */

import { createLogger } from './infra/logger';
import { createRequire } from 'node:module';

const log = createLogger('engine-server/task-store');

// 服务端 task-store 的类型（桥接层只用到 updateTaskProgress / markCompleted / markFailed）
interface RealTaskStore {
  updateTaskProgress(taskRequestId: string, updates: Record<string, unknown>): boolean;
  markCompleted(taskRequestId: string, result: Record<string, unknown>): boolean;
  markFailed(taskRequestId: string, error: Record<string, unknown>): boolean;
  getTaskStatus(taskRequestId: string): Record<string, unknown> | null;
  getTaskRecord(taskRequestId: string): Record<string, unknown> | null;
  getBlueprintRecord(taskRequestId: string): Record<string, unknown> | null;
  getOrCreateTask(request: Record<string, unknown>, requestId: string): { taskRequestId: string; isNew: boolean };
  listCompletedBlueprints(): Array<Record<string, unknown>>;
  updateTaskStatus(taskRequestId: string, status: Record<string, unknown>): boolean;
}

// ── 桥接获取（懒加载 + 缓存）──

let _realStore: RealTaskStore | null = null;
let _bridgeAttempted = false;

function getRealStore(): RealTaskStore | null {
  if (_bridgeAttempted) return _realStore;
  _bridgeAttempted = true;
  try {
    // 懒加载服务端 task-store 桥接, 回退到 in-memory Map
    // 使用 createRequire (ESM 标准) 替代裸 require(), 铁律 9 + 铁律 32
    const nodeRequire = createRequire(import.meta.url);
    _realStore = nodeRequire('../../../../dist/engine-server/task-store') as RealTaskStore;
    return _realStore;
  } catch {
    log.debug('[task-store] real task store bridge unavailable, falling back to in-memory map');
    return null;
  }
}

// ── 内存回退（桥接不可用时使用）──

const fallbackTasks = new Map<string, any>();

// ── 导出（委托给真实 store 或 fallback）──

export function getOrCreateTask(request: any, taskId?: string): any {
  const real = getRealStore();
  if (real) {
    return real.getOrCreateTask(request, taskId || `task-${Date.now()}`);
  }
  const id = taskId || request?.taskRequestId || `task-${Date.now()}`;
  if (!fallbackTasks.has(id)) {
    fallbackTasks.set(id, { id, taskRequestId: id, status: 'pending', progress: 0, createdAt: new Date().toISOString() });
  }
  return { taskRequestId: id, ...fallbackTasks.get(id) };
}

export function getTaskStatus(taskId: string): any {
  const real = getRealStore();
  if (real) return real.getTaskStatus(taskId);
  return fallbackTasks.get(taskId) || null;
}

export function getTaskRecord(taskId: string): any {
  const real = getRealStore();
  if (real) return real.getTaskRecord(taskId);
  return fallbackTasks.get(taskId) || null;
}

export function getBlueprintRecord(blueprintId: string): any {
  const real = getRealStore();
  if (real) return real.getBlueprintRecord(blueprintId);
  return null;
}

export function updateTaskProgress(taskId: string, data: any, _message?: string): void {
  const real = getRealStore();
  if (real) {
    real.updateTaskProgress(taskId, typeof data === 'object' ? data : { progress: data });
    return;
  }
  const task = fallbackTasks.get(taskId);
  if (task) {
    if (typeof data === 'object') {
      Object.assign(task, data, { status: 'processing' });
    } else {
      task.progress = data;
      task.status = 'processing';
    }
  }
}

export function updateTaskStatus(taskId: string, status: any, message?: string): void {
  const real = getRealStore();
  if (real) {
    real.updateTaskStatus(taskId, typeof status === 'object' ? status : { status });
    return;
  }
  const task = fallbackTasks.get(taskId);
  if (task) {
    task.status = typeof status === 'object' ? status.status : status;
    if (message) task.message = message;
  }
}

export function markCompleted(taskId: string, result: any): void {
  const real = getRealStore();
  if (real) {
    real.markCompleted(taskId, result);
    return;
  }
  const task = fallbackTasks.get(taskId);
  if (task) {
    task.status = 'completed';
    task.result = result;
    task.completedAt = new Date().toISOString();
  }
}

export function markFailed(taskId: string, error: any): void {
  const real = getRealStore();
  if (real) {
    real.markFailed(taskId, error);
    return;
  }
  const task = fallbackTasks.get(taskId);
  if (task) {
    task.status = 'failed';
    task.error = error;
  }
}

export function listCompletedBlueprints(): any[] {
  const real = getRealStore();
  if (real) return real.listCompletedBlueprints();
  return [];
}
