/**
 * ontology-admin.ts — 本体管理 Web 界面 (L1)
 *
 * GET /ontology-admin → GA 查看/管理本体类型
 *
 * 铁律39: L1 → L2/L4 via API, 不直接 import L4
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
const log = createLogger('src.routes.ontology-admin');

const router = Router();

router.get('/ontology-admin', async (_req: Request, res: Response) => {
  try {
    const { loadOntology } = await import('../l4/ontology-loader');
    const { ontology } = loadOntology();

    const nodeRows = ontology.nodeTypes.map(n =>
      `<tr><td>${n.$id.replace('node-type/', '')}</td><td>${n.label}</td><td>${(n.tags || []).join(', ')}</td><td>${(n.requiredProps || []).join(', ')}</td><td>${Object.keys(n.optionalProps || {}).join(', ') || '-'}</td></tr>`
    ).join('');

    const edgeRows = ontology.edgeTypes.map(e =>
      `<tr><td>${e.$id.replace('edge-type/', '')}</td><td>${e.label}</td><td>${(e.tags || []).join(', ')}</td><td>${(e.allowedFrom || []).join(', ')}</td><td>${(e.allowedTo || []).join(', ')}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Synova · 本体管理</title>
<style>
:root{--bg:#0f0f14;--panel:#1a1a24;--border:#2a2a3a;--text:#e0e0e0;--dim:#888;--accent:#6c5ce7}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:var(--bg);color:var(--text);padding:20px;max-width:1200px;margin:0 auto}
h1{font-size:20px;margin-bottom:8px;color:var(--accent)}
h2{font-size:16px;margin:24px 0 8px}
p{color:var(--dim);font-size:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}
th{background:var(--panel);padding:6px 8px;text-align:left;border:1px solid var(--border);color:var(--accent);font-weight:600}
td{padding:5px 8px;border:1px solid var(--border);vertical-align:top}
tr:nth-child(even){background:rgba(255,255,255,0.02)}
.tag{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;background:var(--panel);border:1px solid var(--border);margin:1px}
</style>
</head><body>
<h1>🔍 Synova 本体管理</h1>
<p>节点类型 ${ontology.nodeTypes.length} 个 · 边类型 ${ontology.edgeTypes.length} 个 · 只读视图</p>
<h2>节点类型 (${ontology.nodeTypes.length})</h2>
<table><tr><th>ID</th><th>标签</th><th>标签</th><th>必填字段</th><th>可选字段</th></tr>${nodeRows}</table>
<h2>边类型 (${ontology.edgeTypes.length})</h2>
<table><tr><th>ID</th><th>标签</th><th>标签</th><th>允许起点</th><th>允许终点</th></tr>${edgeRows}</table>
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: unknown) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "动态模块加载失败");
    res.status(500).send(`本体加载失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

export default router;
