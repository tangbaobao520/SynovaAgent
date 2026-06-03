/**
 * ontology.ts — 本体 API 路由 (SynovaAgent 独立版)
 *
 * POST /api/ontology/ingest   — 文档上传→本体图
 * GET  /api/ontology/graph/:orgId — 图查询
 * GET  /api/ontology/graph/:orgId.html — 可视化页面
 */
import { Router, type Request, type Response } from 'express';
import { createGraphStore } from '@synova/engine-core';
import { ingestDocument } from '@synova/engine-core';
import { getDatabase } from '../init/engine-context';
import { createLogger } from '../logger';
import { summarizeSubgraph, findCrossDimensionalBrokers, getGraphDiff } from '../l4/diagnosis-graph-query';

const router = Router();
const log = createLogger('routes/ontology');

// ═══ Validation (Slice 6.2: M7 fix — orgId 格式校验) ═══

const ORG_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function validateOrgId(orgId: unknown): string | null {
  if (typeof orgId !== 'string' || !ORG_ID_PATTERN.test(orgId)) {
    return `无效的 orgId 格式: 只允许字母、数字、连字符和下划线，1-64 字符`;
  }
  return null;
}

// ═══ Ingest ═══

router.post('/api/ontology/ingest', (req: Request, res: Response) => {
  const degraded: string[] = [];
  try {
    const { orgId, name, type, content, author, authorEmail, teamId, relatedProcessId, relatedEventId } = req.body;
    if (!orgId || !name || !type || !content) {
      return res.status(400).json({
        ok: false, error: '缺少必填字段: orgId, name, type, content', code: 'VALIDATION_ERROR',
      });
    }
    const orgIdErr = validateOrgId(orgId);
    if (orgIdErr) {
      return res.status(400).json({ ok: false, error: orgIdErr, code: 'VALIDATION_ERROR' });
    }

    let store;
    try {
      store = createGraphStore('sqlite', getDatabase());
    } catch (dbErr: any) {
      log.error({ err: dbErr }, '数据库连接失败');
      return res.status(500).json({ ok: false, error: '数据库连接失败', code: 'GRAPH_DB', degraded: ['graph-store'] });
    }

    const result = ingestDocument({
      id: `doc_${Date.now().toString(36)}`,
      name, type, content, source: 'user_upload',
      author, authorEmail, teamId, relatedProcessId, relatedEventId,
    }, store, orgId);

    res.json({ ok: true, nodeId: result.nodeId, edges: result.edges });
  } catch (err: any) {
    log.error({ err }, '文档摄取失败');
    res.status(500).json({ ok: false, error: err.message, code: 'INGEST_ERROR', degraded: ['ontology-ingest'] });
  }
});

// ═══ Graph Query ═══
// NOTE: HTML 路由必须在 :orgId 之前注册, 否则 .html 会被 :orgId 捕获

// ═══ HTML Viewer ═══
router.get('/api/ontology/graph/:orgId.html', (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const orgIdErr = validateOrgId(orgId);
    if (orgIdErr) {
      return res.status(400).json({ ok: false, error: orgIdErr, code: 'VALIDATION_ERROR' });
    }
    const store = createGraphStore('sqlite', getDatabase());

    const types = ['Person', 'Team', 'Agent', 'Tool', 'Client', 'Process', 'Event', 'Document', 'Financial'] as const;
    const nodes: any[] = [];
    for (const t of types) nodes.push(...store.queryNodes(t, undefined, orgId));
    const edges = store.queryEdges(undefined, undefined, undefined, orgId);

    const nodeRows = nodes.map(n =>
      `<tr><td><span class="badge badge-${n.type}">${n.type}</span></td><td>${n.id.slice(0, 16)}</td><td>${JSON.stringify(n.props).slice(0, 120)}</td></tr>`
    ).join('\n');
    const edgeRows = edges.map(e =>
      `<tr><td>${e.type}</td><td>${e.from.slice(0, 16)}</td><td>${e.to.slice(0, 16)}</td><td>${(e.weight ?? 0).toFixed(2)}</td></tr>`
    ).join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${orgId} · SynovaAgent 本体图</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;padding:24px;background:#f0f2f5;color:#1a1a2e}
h1{font-size:22px;margin-bottom:4px}.subtitle{color:#666;font-size:13px;margin-bottom:24px}
.stats{display:flex;gap:16px;margin-bottom:20px}
.stat{background:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat-value{font-size:24px;font-weight:700;color:#1677ff}.stat-label{font-size:12px;color:#888;margin-top:2px}
h2{font-size:16px;margin:24px 0 12px;color:#333}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #f0f0f0;font-size:13px}
th{background:#fafafa;font-weight:600;color:#555}tr:hover{background:#f5f8ff}
.badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600}
.badge-Person{background:#dbeafe;color:#1e40af}.badge-Team{background:#d1fae5;color:#065f46}
.badge-Agent{background:#ede9fe;color:#5b21b6}.badge-Tool{background:#fef3c7;color:#92400e}
.badge-Client{background:#fce7f3;color:#9d174d}.badge-Process{background:#e0e7ff;color:#3730a3}
.badge-Event{background:#fff7ed;color:#9a3412}.badge-Document{background:#f0fdf4;color:#166534}
.badge-Financial{background:#fef2f2;color:#991b1b}
</style></head><body>
<h1>🏢 ${orgId} 组织本体图</h1>
<p class="subtitle">SynovaAgent · ${new Date().toISOString().slice(0, 19).replace('T', ' ')}</p>
<div class="stats">
<div class="stat"><div class="stat-value">${nodes.length}</div><div class="stat-label">节点</div></div>
<div class="stat"><div class="stat-value">${edges.length}</div><div class="stat-label">边</div></div>
</div>
<h2>节点</h2><table><tr><th>类型</th><th>ID</th><th>属性</th></tr>${nodeRows || '<tr><td colspan=3>暂无</td></tr>'}</table>
<h2>边</h2><table><tr><th>类型</th><th>从</th><th>到</th><th>权重</th></tr>${edgeRows || '<tr><td colspan=4>暂无</td></tr>'}</table>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    log.error({ err }, 'HTML 渲染失败');
    res.status(500).send(`<h1>Error</h1><pre>${err.message}</pre>`);
  }
});

router.get('/api/ontology/graph/:orgId', (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const orgIdErr = validateOrgId(orgId);
    if (orgIdErr) {
      return res.status(400).json({ ok: false, error: orgIdErr, code: 'VALIDATION_ERROR' });
    }
    const store = createGraphStore('sqlite', getDatabase());

    const types = ['Person', 'Team', 'Agent', 'Tool', 'Client', 'Process', 'Event', 'Document', 'Financial'] as const;
    const nodes: any[] = [];
    for (const t of types) {
      nodes.push(...store.queryNodes(t, undefined, orgId));
    }
    const edges = store.queryEdges(undefined, undefined, undefined, orgId);

    res.json({
      ok: true, orgId,
      nodeCount: nodes.length, edgeCount: edges.length,
      nodes: nodes.slice(0, 200), edges: edges.slice(0, 500),
    });
  } catch (err: any) {
    log.error({ err }, '图查询失败');
    res.status(500).json({ ok: false, error: err.message, code: 'GRAPH_QUERY_ERROR' });
  }
});

// ═══ L4 Phase 2c: 3 new graph query endpoints ═══

/** GET /api/ontology/graph/:orgId/summary — Subgraph summary around a root node */
router.get('/api/ontology/graph/:orgId/summary', (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const rootId = req.query.root as string;
    const orgIdErr = validateOrgId(orgId);
    if (orgIdErr) return res.status(400).json({ ok: false, error: orgIdErr, code: 'VALIDATION_ERROR' });

    const store = createGraphStore('sqlite', getDatabase());
    const summary = summarizeSubgraph(store, orgId, rootId || orgId, 3);
    res.json({ ok: true, summary });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message, code: 'QUERY_ERROR' });
  }
});

/** GET /api/ontology/graph/:orgId/brokers — Cross-dimensional brokers */
router.get('/api/ontology/graph/:orgId/brokers', (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const orgIdErr = validateOrgId(orgId);
    if (orgIdErr) return res.status(400).json({ ok: false, error: orgIdErr, code: 'VALIDATION_ERROR' });

    const store = createGraphStore('sqlite', getDatabase());
    const brokers = findCrossDimensionalBrokers(store, orgId, 0.01);
    res.json({ ok: true, brokers: brokers.slice(0, 20) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message, code: 'QUERY_ERROR' });
  }
});

/** GET /api/ontology/graph/:orgId/diff — Graph changes */
router.get('/api/ontology/graph/:orgId/diff', (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const fromDate = req.query.from as string;
    const toDate = req.query.to as string;
    const orgIdErr = validateOrgId(orgId);
    if (orgIdErr) return res.status(400).json({ ok: false, error: orgIdErr, code: 'VALIDATION_ERROR' });

    const store = createGraphStore('sqlite', getDatabase());
    const diff = getGraphDiff(store, orgId, fromDate, toDate);
    res.json({ ok: true, diff });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message, code: 'QUERY_ERROR' });
  }
});

export default router;

