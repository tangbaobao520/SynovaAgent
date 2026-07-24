/**
 * routes/cockpit.ts — 创始人仪表盘主服务器集成 (D220-PHASE3)
 *
 * GET  /cockpit          — 返回完整仪表盘 HTML
 * GET  /api/cockpit/data — 返回仪表盘 JSON 数据（5 分钟轮询）
 *
 * 调用 generate-dashboard.py 的 collect_dashboard_data() + render_html()。
 * 降级: Python 不可用 → 500 + degraded:true
 */
import { Router, type Request, type Response } from 'express';
import { execSync } from 'child_process';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/cockpit');
const router = Router();

const PYTHON_SCRIPT = join(process.cwd(), 'scripts/control-tower/generate-dashboard.py');

function execPython(method: string, args: string = ''): string {
  return execSync(
    `python3 -c "import sys; sys.path.insert(0, '.'); from scripts.control_tower.generate_dashboard import ${method}; ${args}"`,
    { encoding: 'utf-8', timeout: 30000, cwd: process.cwd(), env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
  );
}

router.get('/cockpit', (_req: Request, res: Response) => {
  try {
    const html = execPython('collect_dashboard_data, render_html',
      'data = collect_dashboard_data(); print(render_html(data))');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    log.warn({ err }, 'Dashboard HTML generation failed');
    res.status(500).send('<html><body><h1>Dashboard unavailable</h1><p>degraded: true</p></body></html>');
  }
});

router.get('/api/cockpit/data', (_req: Request, res: Response) => {
  try {
    const result = execPython('collect_dashboard_data',
      'import json; data = collect_dashboard_data(); print(json.dumps(data, default=str))');
    res.json(JSON.parse(result));
  } catch (err) {
    log.warn({ err }, 'Dashboard data collection failed');
    res.status(500).json({ ok: false, error: 'Dashboard data unavailable', degraded: true });
  }
});

export default router;
