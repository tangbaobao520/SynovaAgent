// lib/index.js — @synova/dsh-dashboards Host 半（dsh web 进程内运行的 Cordis 插件）
// 契约（铁律 47）：
//   @input  ctx.webServer（webServer 服务）、config.repoRoot（默认 process.cwd()）
//   @output 两条只读 GET 路由：
//     ① GET /synova/dashboards/data → JSON DashboardPayload（右栏三仪表盘，原有）
//     ② GET /synova/pm/ledger       → 200 application/json
//          成功: docs/synova/project/ledger.json **原文**（原样透传，含 generated_at/git_head）
//          降级: { ok:false, degraded:true, error:"..." }（D794 §A.4）
//   @degraded 数据收集/读盘失败 → 200 + degraded JSON（不 500，避免前端误判为断网；
//             不抛异常，避免拖垮宿主进程；铁律 24/31）
//   @caching 两条路由均无缓存，每次请求读盘（沿用现有 data 路由语义）
//   @write   零写入：只 readFile/execFile 只读 git，不写工作区/仓库（D794 红线）
import { collectDashboards } from "./collect.js";
import { readLedger } from "./ledger.js";

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
    const disposeData = ctx.webServer.register({
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
    const disposeLedger = ctx.webServer.register({
      kind: "exact",
      path: "/synova/pm/ledger",
      handler: async (req, res) => {
        const result = await readLedger(repoRoot);
        if (!result.ok) {
          // 铁律 24/31：降级必须留痕 + 显式标记，不静默、不抛异常
          ctx.logger.warn(`synova-dashboards/ledger: ${result.error}`);
          res.writeHead(200, HEADERS);
          res.end(JSON.stringify({
            ok: false,
            degraded: true,
            error: result.error,
            path: result.path
          }));
          return;
        }
        res.writeHead(200, HEADERS);
        res.end(result.raw);
      }
    });
    return () => {
      active = false;
      disposeData();
      disposeLedger();
    };
  }, "synova-dashboards: read-only routes");
}

/** 进程级挂载护栏：同一时刻只允许一个挂载持有数据路由（预设 standing scope / 并发挂载安全）。 */
let active = false;
