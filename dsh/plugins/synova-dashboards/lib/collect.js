// lib/collect.js — Synova 三仪表盘数据收集器（纯 Node，无 cordis 依赖，可独立测试）
// 契约（铁律 47/48）：
//   输入: repoRoot: string — SynovaAgent 仓库根目录
//   输出: Promise<DashboardPayload>
//     {
//       meta:    { repoRoot, generated_at, product_mtime, task_dashboard_mtime, cto_health_mtime },
//       product: { ok, degraded?, generated_at, product_progress_pct, total_lines, lines: [...] },
//       tasks:   { ok, degraded?, states: [...], recent: [...] },
//       health:  { ok, degraded?, bypass: {...}, precommit_failures: {...}, m_patterns: [...], cto_verdict, ledger_mtime }
//     }
//   降级: 每个 section 独立 try/catch，失败返回 { ok:false, degraded:true, error }，不整体抛错（铁律 24/31）。
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const MAX_BYPASS_LINES = 400;
const MAX_FAILURE_LINES = 200;

/** 读取文本文件，ENOENT 返回 null，其他错误抛出（由调用方降级）。 */
async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

/** 读取 JSON 文件，解析失败抛错（由调用方降级）。 */
async function readJson(path) {
  const text = await readText(path);
  if (text === null) return null;
  return JSON.parse(text);
}

/** 文件 mtime ISO，ENOENT 返回 null。 */
async function mtimeIso(path) {
  try {
    const s = await stat(path);
    return s.mtime.toISOString();
  } catch {
    return null;
  }
}

// ── ① 产品完成度 ──────────────────────────────────────────────────────────
async function collectProduct(root) {
  const file = join(root, "docs/synova/product-lines/product-progress.json");
  const raw = await readJson(file);
  if (raw === null) return { ok: false, degraded: true, error: "product-progress.json 缺失" };
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).map((l) => ({
    id: l.id,
    name: l.name ?? `线 ${l.id}`,
    progress_pct: l.progress_pct ?? 0,
    verified: l.verified ?? 0,
    total: l.total ?? 0,
    weight: l.weight ?? 1,
    status_counts: l.status_counts ?? null
  }));
  return {
    ok: true,
    generated_at: raw.generated_at ?? null,
    product_progress_pct: raw.product_progress_pct ?? 0,
    total_lines: raw.total_lines ?? lines.length,
    lines
  };
}

// ── ② 任务进展 ────────────────────────────────────────────────────────────
/** 解析 DASHBOARD-CN.md AUTO 区的任务表（| D# | 任务 | 状态 | 提交 | 作者 | 日期 | 推送 | CI | 审计 |）。 */
function parseTaskTable(md) {
  if (!md) return [];
  const rows = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*(D\d+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/);
    if (!m) continue;
    const task = m[2].trim();
    if (!/^D\d+/.test(task)) continue;
    rows.push({
      id: m[1].trim(),
      title: task.replace(/^D\d+\s*/, "").slice(0, 60),
      status: m[3].trim(),
      commit: m[4].trim() || null,
      author: m[5].trim() || null,
      date: m[6].trim() || null
    });
  }
  return rows;
}

async function collectTasks(root) {
  const stateDir = join(root, "task-state");
  const states = [];
  let stateError = null;
  try {
    const entries = await readdir(stateDir);
    for (const name of entries) {
      if (!name.endsWith(".json") || name === "TEMPLATE.json") continue;
      try {
        const raw = JSON.parse(await readFile(join(stateDir, name), "utf8"));
        states.push({
          task_id: raw.task_id ?? name.replace(/\.json$/, ""),
          title: (raw.title ?? "").slice(0, 80),
          status: raw.status ?? "unknown",
          updated_at: raw.updated_at ?? null,
          updated_by: raw.updated_by ?? null,
          impl_commit: raw.impl?.commit ?? null,
          audit_status: raw.audit?.status ?? null,
          fix_task_id: raw.fix_task_id ?? null
        });
      } catch (err) {
        stateError = stateError ?? `task-state/${name} 解析失败: ${err?.message ?? err}`;
      }
    }
    states.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  } catch (err) {
    if (err && err.code === "ENOENT") return { ok: false, degraded: true, error: "task-state/ 目录缺失" };
    throw err;
  }
  // DASHBOARD-CN.md 任务表（历史 D# 全量，取最近 12 条）
  const board = await readText(join(root, "docs/synova/DASHBOARD-CN.md"));
  const rows = parseTaskTable(board);
  const recent = rows.slice(0, 12);
  return {
    ok: true,
    ...(stateError ? { degraded: true, error: stateError } : {}),
    states,
    recent
  };
}

// ── ③ 项目健康 ────────────────────────────────────────────────────────────
/** 解析 bypass.log 行：新格式 `ISO | OUTCOME | 细节...`，旧格式 `ISO reason`（无竖线，历史绕过）。 */
function parseBypass(text) {
  const events = [];
  for (const line of (text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([\dT:+\-.Z]+)\s*\|\s*([A-Za-z-]+)\s*\|\s*(.*)$/);
    if (m) {
      const detail = m[3];
      events.push({
        at: m[1],
        outcome: m[2],
        task: detail.match(/TASK_ID=([A-Za-z0-9_-]+)/)?.[1] ?? null,
        agent: detail.match(/AGENT=([A-Za-z0-9_-]+)/)?.[1] ?? null,
        note: detail.replace(/TASK_ID=[A-Za-z0-9_-]+/, "").replace(/AGENT=[A-Za-z0-9_-]+/, "").replace(/\s*\|\s*$/, "").slice(0, 90)
      });
      continue;
    }
    // 旧格式：`2026-07-26T18:34:35Z no-precommit-marker` → 记为该次绕过的原因
    const old = trimmed.match(/^([\dT:+\-.Z]+)\s+(\S+)(?:\s+(.*))?$/);
    if (old) {
      events.push({
        at: old[1],
        outcome: "detected-bypass",
        task: null,
        agent: null,
        note: (old[2] + " " + (old[3] ?? "")).trim().slice(0, 90)
      });
    }
  }
  return events;
}

/** 解析审计台账 M 模式表（§二 的 | M# | 名称 | 首次 | 再次 | 对应防线 | 行）。
 *  台账内 `\|\|` 是转义的竖线（代码跨度），须按"非转义竖线"切分；
 *  只取 §二（模式归纳）与下一节之间的表格，避免与文件后部的防线表重复。 */
function parseMPatterns(text) {
  if (!text) return [];
  const start = text.indexOf("## 二、");
  if (start === -1) return [];
  const rest = text.slice(start);
  const end = rest.indexOf("\n## ", start === 0 ? 4 : 4);
  const section = end === -1 ? rest : rest.slice(0, end);
  const out = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\|\s*(M\d+)\s*\|/);
    if (!m) continue;
    // 只对未转义竖线切分（(?<!\\)\|），再还原 \| → |
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|").replace(/\*\*/g, ""));
    out.push({
      id: m[1],
      name: (cells[2] ?? "").slice(0, 60) || null,
      first: (cells[3] ?? "").slice(0, 24) || null,
      again: (cells[4] ?? "").slice(0, 40) || null,
      defense: (cells[5] ?? "").slice(0, 40) || null
    });
  }
  return out;
}

async function collectHealth(root) {
  const [bypassText, failText, ledgerText, ctoText] = await Promise.all([
    readText(join(root, ".claude/bypass.log")),
    readText(join(root, ".claude/pre-commit-failures.log")),
    readText(join(root, "docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md")),
    readText(join(root, "docs/synova/CTO-HEALTH.md"))
  ]);
  const events = parseBypass(bypassText).slice(-MAX_BYPASS_LINES);
  const counts = {};
  for (const e of events) counts[e.outcome] = (counts[e.outcome] ?? 0) + 1;
  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;
  const last24h = events.filter((e) => {
    const t = Date.parse(e.at);
    return !Number.isNaN(t) && t >= dayAgo;
  });
  const failures = (failText ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(-MAX_FAILURE_LINES);
  const ctoVerdict = ctoText ? (ctoText.match(/总体判定[:：]\s*([^\n|]+)/)?.[1] ?? null) : null;
  return {
    ok: true,
    bypass: {
      present: bypassText !== null,
      total_events: events.length,
      counts,
      last24h_counts: last24h.reduce((acc, e) => ((acc[e.outcome] = (acc[e.outcome] ?? 0) + 1), acc), {}),
      recent: events.slice(-8).reverse()
    },
    precommit_failures: {
      present: failText !== null,
      count: failures.length,
      recent: failures.slice(-3).reverse()
    },
    m_patterns: parseMPatterns(ledgerText),
    cto_verdict: ctoVerdict,
    ledger_mtime: await mtimeIso(join(root, "docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md"))
  };
}

// ── 汇总 ──────────────────────────────────────────────────────────────────
async function collectDashboards(repoRoot) {
  const [product, tasks, health] = await Promise.all([
    safe(collectProduct(repoRoot)),
    safe(collectTasks(repoRoot)),
    safe(collectHealth(repoRoot))
  ]);
  return {
    meta: {
      repoRoot,
      generated_at: new Date().toISOString(),
      product_mtime: await mtimeIso(join(repoRoot, "docs/synova/product-lines/product-progress.json")),
      task_dashboard_mtime: await mtimeIso(join(repoRoot, "docs/synova/DASHBOARD-CN.md")),
      cto_health_mtime: await mtimeIso(join(repoRoot, "docs/synova/CTO-HEALTH.md"))
    },
    product,
    tasks,
    health
  };
}

/** 包一层 try/catch，让单个 section 失败不拖垮整体（降级标记）。 */
async function safe(fn) {
  try {
    return await fn;
  } catch (err) {
    return { ok: false, degraded: true, error: err?.message ?? String(err) };
  }
}

export { collectDashboards, parseBypass, parseMPatterns, parseTaskTable };
