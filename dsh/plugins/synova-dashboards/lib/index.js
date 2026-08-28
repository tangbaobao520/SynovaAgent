// lib/index.js — @synova/dsh-dashboards Host 半（dsh web 进程内运行的 Cordis 插件）
// 契约（铁律 47）：
//   输入: ctx.webServer（webServer 服务）、config.repoRoot（默认 process.cwd()）
//   输出: 注册 GET /synova/dashboards/data 路由 → JSON DashboardPayload
//   降级: 数据收集失败 → 200 + { degraded:true, error }（不 500，避免前端误判为断网；铁律 24/31）
import { collectDashboards } from "./collect.js";

export const name = "synova-dashboards";
export const inject = ["webServer"];

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx, config = {}) {
  if (active) return; // standing-scope 预设可能重复触发 apply —— 首个挂载持有路由，其余静默加入
  active = true;
  const repoRoot = (config && config.repoRoot) || process.cwd();
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: "exact",
      path: "/synova/dashboards/data",
      handler: async (req, res) => {
        try {
          const payload = await collectDashboards(repoRoot);
          res.writeHead(200, HEADERS);
          res.end(JSON.stringify(payload));
        } catch (err) {
          ctx.logger.warn(`synova-dashboards: ${err?.message ?? err}`);
          res.writeHead(200, HEADERS);
          res.end(JSON.stringify({
            degraded: true,
            error: String(err?.message ?? err),
            meta: { repoRoot, generated_at: new Date().toISOString() }
          }));
        }
      }
    });
    return () => {
      active = false;
      dispose();
    };
  }, "synova-dashboards: data route");
}

/** 进程级挂载护栏：同一时刻只允许一个挂载持有数据路由（预设 standing scope / 并发挂载安全）。 */
let active = false;
