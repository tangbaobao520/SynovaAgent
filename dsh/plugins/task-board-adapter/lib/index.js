// lib/index.js — @synova/task-board-adapter Host 插件壳（dsh web 进程内运行的 Cordis 插件）
//
// 契约（铁律 47）：
//   输入: ctx（cordis 上下文）、config.repoRoot（默认 process.cwd()，生产应显式配置为 Synova 仓库根）、
//         config.apiBase（默认 http://127.0.0.1:3080）、config.intervalMs（默认 5 分钟）、
//         config.statusMapping（覆盖默认映射，可选）
//   输出: 启动时立即同步一次（失败按 5s/20s/60s 退避重试），随后每 intervalMs 定时同步；结果写 console
//   降级（铁律 24/31）:
//     - 同步 API 失败 → console.warn，进程不崩，按退避重试/下轮定时
//     - task-state 读取降级 → 记录 imported 数 + degraded 标记
//     - 重复挂载（standing scope / 双路径安装）→ 首个挂载持有同步循环，其余静默加入
//   可观测性: 日志走 console（实测 cordis ctx.logger 不写 stdout/任何可观测位置，
//     与 @linxin666/dsh-client-ui-skin-center 的 console.warn 模式一致，保证 out.log 可见）
//   安全: 只读单向（仓库 → 看板），从不写回 task-state；API 走本机 loopback + 同源标记

import { syncOnce, DEFAULT_STATUS_MAPPING } from "./sync.js";

export const name = "task-board-adapter";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 1000;
/** 启动同步失败时的退避重试间隔（ms）。webServer 在 apply 阶段可能尚未就绪，需重试。 */
const STARTUP_RETRY_MS = [5_000, 20_000, 60_000];

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx, config = {}) {
  if (active) return; // 重复挂载护栏
  const repoRoot = (config && config.repoRoot) || process.cwd();
  const apiBase = (config && config.apiBase) || "http://127.0.0.1:3080";
  let intervalMs = Number(config?.intervalMs ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(intervalMs) || intervalMs < MIN_INTERVAL_MS) {
    console.warn(`[task-board-adapter] intervalMs=${intervalMs} 非法，使用默认 ${DEFAULT_INTERVAL_MS}ms`);
    intervalMs = DEFAULT_INTERVAL_MS;
  }
  const mapping = { ...DEFAULT_STATUS_MAPPING, ...(config?.statusMapping ?? {}) };

  let syncing = false;
  let intervalTimer = null;
  let retryTimer = null;
  let startupSucceeded = false;

  /**
   * 一次同步（串行护栏：上轮未完成则跳过本轮）。
   * @param {string} reason - 触发原因（startup / startup-retry-N / interval）。
   * @returns {Promise<boolean>} 同步是否成功（供启动退避判断）。
   */
  const run = async (reason) => {
    if (syncing) return false;
    syncing = true;
    try {
      const result = await syncOnce({ repoRoot, apiBase, mapping });
      startupSucceeded = true;
      console.log(`[task-board-adapter] ${reason} 同步完成 imported=${result.imported}${result.degraded ? " degraded" : ""}`);
      if (result.unknownStatuses > 0) {
        console.warn(`[task-board-adapter] ${result.unknownStatuses} 个未知 Synova 状态落入 "todo" 列`);
      }
      if (result.errors.length > 0) {
        console.warn(`[task-board-adapter] ${result.errors.length} 条读取警告，首条: ${result.errors[0]}`);
      }
      return true;
    } catch (err) {
      console.warn(`[task-board-adapter] ${reason} 同步失败: ${err?.message ?? err}`);
      return false;
    } finally {
      syncing = false;
    }
  };

  /** 启动失败退避重试（直到成功或轮次用尽；成功后由 interval 接管）。 */
  const scheduleStartupRetry = (attempt) => {
    if (startupSucceeded || attempt >= STARTUP_RETRY_MS.length) return;
    retryTimer = setTimeout(async () => {
      const ok = await run(`startup-retry-${attempt + 1}`);
      if (!ok) scheduleStartupRetry(attempt + 1);
    }, STARTUP_RETRY_MS[attempt]);
  };

  active = true;
  ctx.effect(() => {
    run("startup").then((ok) => {
      if (!ok) scheduleStartupRetry(0);
    });
    intervalTimer = setInterval(() => run("interval"), intervalMs);
    return () => {
      active = false;
      if (intervalTimer !== null) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };
  }, "task-board-adapter: sync loop");
}

/** 进程级挂载护栏：同一时刻只允许一个挂载持有同步循环。 */
let active = false;
