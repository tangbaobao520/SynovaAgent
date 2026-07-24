/**
 * src/routes/cockpit.ts — Founder Cockpit Express 路由 (D220-PHASE3)
 *
 * 将 D220 仪表盘从独立 Python HTTP 服务器集成到主 Express 服务器。
 * 同源访问，Codex 内嵌浏览器可直接加载。
 *
 * GET /cockpit        — 返回完整仪表盘 HTML
 * GET /api/cockpit/data — 返回 JSON 数据（5 分钟轮询）
 *
 * 契约:
 *   @input  — 无（GET 请求）
 *   @output — HTML / JSON
 *   @degraded — Python 脚本不可用 → 500 + degraded:true
 */
import { Router } from 'express';
import { execSync } from 'child_process';
import { join } from 'path';

const router = Router();
const SCRIPT_PATH = join(process.cwd(), 'scripts/control-tower/generate-dashboard.py');
const PYTHON = process.platform === 'win32' ? 'python3' : 'python3';

/**
 * 调用 Python 采集仪表盘数据。
 * 通过子进程执行 Python 脚本的 collect_dashboard_data() 并捕获 JSON 输出。
 */
function getDashboardData(): Record<string, unknown> {
  const code = `
import sys, json
sys.path.insert(0, '${process.cwd().replace(/\\/g, '/')}')
import importlib.util
spec = importlib.util.spec_from_file_location('gd', '${SCRIPT_PATH.replace(/\\/g, '/')}')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
data = mod.collect_dashboard_data()
print(json.dumps(data, default=str))
`;
  const result = execSync(`${PYTHON} -c "${code.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    encoding: 'utf-8',
    timeout: 30000,
    cwd: process.cwd(),
  });
  return JSON.parse(result.trim());
}

// GET /cockpit — 完整仪表盘 HTML
router.get('/cockpit', (_req, res) => {
  try {
    const htmlScript = join(process.cwd(), 'scripts/control-tower/generate-dashboard.py');
    const code = `
import sys, json
sys.path.insert(0, '${process.cwd().replace(/\\/g, '/')}')
import importlib.util
spec = importlib.util.spec_from_file_location('gd', '${htmlScript.replace(/\\/g, '/')}')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
data = mod.collect_dashboard_data()
print(mod.render_html(data))
`;
    const html = execSync(`${PYTHON} -c "${code.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: process.cwd(),
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html.trim());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: 'Dashboard unavailable: ' + msg, degraded: true });
  }
});

// GET /api/cockpit/data — JSON 数据端点（5 分钟轮询）
router.get('/api/cockpit/data', (_req, res) => {
  try {
    const data = getDashboardData();
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: 'Data unavailable: ' + msg, degraded: true });
  }
});

export default router;
