// lib/index.js — @synova/dsh-dashboards Host 半（dsh web 进程内运行的 Cordis 插件）
// 契约（铁律 47）：
//   @input  ctx.webServer（webServer 服务）、config.repoRoot（默认 process.cwd()）
//   @output 两条只读 GET 路由：
//     ① GET /synova/dashboards/data → JSON DashboardPayload（三仪表盘数据源；健康区仍走它）
//     ② GET /synova/pm/ledger       → 200 application/json，body = 账本对象 + 顶层元字段：
//          { ...ledger, ok:true, source:"worktree"|"origin/main"[, source_detail] }
//          · source      —— 三级取数的实际来源（见 lib/ledger.js 契约）
//          · source_detail —— 发生了回退时的说明（工作区缺失原因）
//          取数顺序：工作区文件 → git origin/main → 显式降级
//          降级: { ok:false, degraded:true, error:"<两级原因>", attempts:[...] }
//   @degraded 数据收集/读盘失败 → 200 + degraded JSON（不 500，避免前端误判为断网；
//             不抛异常，避免拖垮宿主进程；铁律 24/31）
//     ③ GET /synova/charter/grid    → 200，宪章三问 48 格数据（D963）：
//          成功 → { ...grid, ok:true, source:"worktree"|"origin/main" }
//          降级 → { ok:false, degraded:true, error, missing:"宪章三问-48格.json" }
//          （文件当前 main 上不存在，降级是预期正常态；禁 500 禁空白，见 lib/charter.js）
//   @caching 两条路由均无缓存，每次请求读盘（沿用现有 data 路由语义）
//   @write   零写入：只 readFile/execFile 只读 git，不写工作区/仓库（D794 红线）
import { collectDashboards } from "./collect.js";
import { readLedger } from "./ledger.js";
import { readCharter, adaptCharterGrid } from "./charter.js";

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
            attempts: result.attempts,
            path: result.path
          }));
          return;
        }
        // 命中回退时也留痕（可观测：说明为什么没走工作区）
        if (result.fallback_note) ctx.logger.warn(`synova-dashboards/ledger: ${result.fallback_note}`);
        // 账本字段保持在顶层（前端与既有 schema 不变），只追加元字段 ok / source / source_detail。
        // 账本必须是对象才注入；非对象（null/数组）时用 ledger 字段包裹，避免丢数据。
        const p = result.parsed;
        const body = p !== null && typeof p === "object" && !Array.isArray(p)
          ? Object.assign({}, p, { ok: true, source: result.source, ...(result.fallback_note ? { source_detail: result.fallback_note } : {}) })
          : { ok: true, source: result.source, ledger: p };
        res.writeHead(200, HEADERS);
        res.end(JSON.stringify(body));
      }
    });
    const disposeCharter = ctx.webServer.register({
      kind: "exact",
      path: "/synova/charter/grid",
      handler: async (req, res) => {
        const result = await readCharter(repoRoot);
        if (!result.ok) {
          // 铁律 24/31：降级必须留痕 + 显式标记 + missing 标注（禁 500、禁空白）
          ctx.logger.warn(`synova-dashboards/charter: ${result.error}`);
          res.writeHead(200, HEADERS);
          res.end(JSON.stringify({
            ok: false,
            degraded: true,
            error: result.error,
            attempts: result.attempts,
            path: result.path,
            missing: result.missing
          }));
          return;
        }
        if (result.fallback_note) ctx.logger.warn(`synova-dashboards/charter: ${result.fallback_note}`);
        // D963 退回项：真源 cells[] 在 Host 半经 adaptCharterGrid 映射为面板契约
        // （rows[]×3 + 四色 tone），前端只管渲染——路由与面板单一契约，不再各自猜形状。
        const grid = adaptCharterGrid(result.parsed);
        const body = Object.assign({}, grid, { ok: true, source: result.source, ...(result.fallback_note ? { source_detail: result.fallback_note } : {}) });
        res.writeHead(200, HEADERS);
        res.end(JSON.stringify(body));
      }
    });
    return () => {
      active = false;
      disposeData();
      disposeLedger();
      disposeCharter();
    };
  }, "synova-dashboards: read-only routes");
}

/** 进程级挂载护栏：同一时刻只允许一个挂载持有数据路由（预设 standing scope / 并发挂载安全）。 */
let active = false;
