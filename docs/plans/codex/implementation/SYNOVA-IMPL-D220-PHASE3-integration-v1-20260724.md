# SynovaAgent -- D220-PHASE3 仪表盘主服务器集成 实施方案 v1.0

> 2026-07-24 | 问题：localhost:8899 无法在 Codex 内嵌浏览器中访问（chrome-error:// 协议限制）
> **将 Founder Cockpit 从独立 Python HTTP 服务器集成到主 Express 服务器（3000 端口）**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/server.ts` 存在（L274 `express.static('app')` 静态文件服务），`scripts/control-tower/generate-dashboard.py` 存在（D220 交付，`collect_dashboard_data()` + `render_html()` 可独立调用），`app/` 目录存在
- [x] Get-Content 读取：server.ts L274 — `app.use('/app', express.static(...))` 将 `app/` 目录映射到 `/app` URL 路径。server.ts L330 — `app.listen(port, ...)` 主服务器监听 3000 端口
- [x] Select-String 验证：generate-dashboard.py — `collect_dashboard_data()` 函数返回完整 dict，`render_html(data)` 函数返回 HTML 字符串——两者均无副作用，可被外部 import 调用
- [x] 引用 — Ch7 §五验收标准："局部更新四个区域" + "5 分钟自动刷新" + "网络中断静默降级"

---

## 问题根因

D220 使用 Python `http.server` 在 8899 端口独立运行。Codex 内嵌浏览器使用 `chrome-error://` 协议，Chrome 安全策略禁止从 chrome:// 协议帧加载 http:// 内容。系统默认浏览器也可能被端口阻断。**根本原因：独立 HTTP 服务器与主应用不在同一端口，同源策略不允许。**

---

## 修复方案

将仪表盘集成到主 Express 服务器——只需 2 个新路由，0 个新依赖。

**路由 1——`GET /cockpit`：** 调用 `collect_dashboard_data()` + `render_html()` → 返回完整 HTML 页面。主服务器 `express.static('app')` 已就绪，页面内 CSS/JS 走相对路径。

**路由 2——`GET /api/cockpit/data`：** 调用 `collect_dashboard_data()` → 返回 JSON。前端 JS 每 5 分钟 fetch 此端点 → 局部 DOM 更新——不跨域。

**数据流（同源）：**
```
浏览器 → GET /cockpit → server.ts → generate-dashboard.render_html() → HTML
浏览器 → GET /api/cockpit/data → server.ts → generate-dashboard.collect_dashboard_data() → JSON
         ↑ setInterval 300s ↑
```

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 仪表盘主服务器集成。将 D220 仪表盘从独立 Python 服务器挂载到 Express 主服务器——2 个新路由，1 个新文件。前端零改动。

### Q1：调研
- server.ts L274：`app/` 静态文件映射到 `/app`（`express.static`）
- generate-dashboard.py：`collect_dashboard_data()` 可被 import → 返回 dict。`render_html(data)` 可被 import → 返回 HTML 字符串
- 当前 D220 serve 模式 JS：fetch `/api/dashboard-data` → 需改为 fetch `/api/cockpit/data`
- 无需修改 Python 脚本——只需 Node.js 端 `execSync` 调用或直接在 TypeScript 中调用 Python

### Q2：范围
- 最小：(A) 创建 `src/routes/cockpit.ts` — `GET /cockpit` 返回 HTML + `GET /api/cockpit/data` 返回 JSON (B) 在 `server.ts` 注册路由 `app.use(cockpitRoutes)` (C) 修改 generate-dashboard.py 中 JS 的 fetch URL 从 `/api/dashboard-data` → `/api/cockpit/data`
- 不做：不删除 D220 Python serve 模式（保留独立运行能力）、不修改前端 JS 逻辑（仅改 fetch URL）

### Q3：验收
- 入口：`http://localhost:3000/cockpit` → 返回完整中文仪表盘 HTML
- 交互：5 分钟后 JS fetch `/api/cockpit/data` → 局部更新 5 区域 → 页面不闪烁
- 结果：Codex 内嵌浏览器可直接访问——与主应用同源

### Q4：契约与测试
- @input：`GET /cockpit` → 无参数
- @output：HTML 200 + Content-Type text/html
- @degraded：Python 脚本不可用 → 500 + degraded 消息
- 测试：GET /cockpit 返回 200 + HTML(2) + GET /api/cockpit/data 返回 JSON(1) + Python 不可用降级(1) = 4 tests

---

## 构建内容

### 1. 新建 src/routes/cockpit.ts（约 40 行）

```typescript
import { Router } from 'express';
import { execSync } from 'child_process';
import { join } from 'path';

const router = Router();

// 调用 Python 采集数据
function getDashboardData(): any {
  const script = join(process.cwd(), 'scripts/control-tower/generate-dashboard.py');
  const result = execSync(`python -c "
import sys; sys.path.insert(0, '.')
from scripts.control_tower.generate_dashboard import collect_dashboard_data, render_html
import json
data = collect_dashboard_data()
print(json.dumps(data, default=str))
"`, { encoding: 'utf-8', timeout: 30000, cwd: process.cwd() });
  return JSON.parse(result);
}

// GET /cockpit — HTML 页面
router.get('/cockpit', (_req, res) => {
  try {
    const data = getDashboardData();
    // Import render_html via execSync
    const script = join(process.cwd(), 'scripts/control-tower/generate-dashboard.py');
    const html = execSync(`python -c "
import sys; sys.path.insert(0, '.')
from scripts.control_tower.generate_dashboard import collect_dashboard_data, render_html
import json
data = collect_dashboard_data()
print(render_html(data))
"`, { encoding: 'utf-8', timeout: 30000, cwd: process.cwd() });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Dashboard unavailable', degraded: true });
  }
});

// GET /api/cockpit/data — JSON 数据（5 分钟轮询）
router.get('/api/cockpit/data', (_req, res) => {
  try {
    const data = getDashboardData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Data unavailable', degraded: true });
  }
});

export default router;
```

### 2. 修改 src/server.ts — 注册路由（1 行）

在 `app.use(homeRoutes)` 附近追加：

```typescript
import cockpitRoutes from './routes/cockpit';
app.use(cockpitRoutes);
```

### 3. 修改 generate-dashboard.py — fetch URL（1 处）

将服务模式 JS 中的：
```javascript
const r = await fetch('/api/dashboard-data');
```
改为：
```javascript
const r = await fetch('/api/cockpit/data');
```

---

## 不做什么

- 不删除 D220 `--serve` 独立模式（保留独立运行能力）
- 不修改前端 JS 逻辑（仅改 URL）
- 不修改 `render_html()` 或 `collect_dashboard_data()` 函数

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `GET /cockpit` → HTTP 200 + Content-Type text/html + body 含 "创始人驾驶舱"
- `GET /api/cockpit/data` → HTTP 200 + JSON 含 signals/gates/authDocs 字段
- Python 脚本不可用 → `GET /cockpit` 返回 500 + degraded:true
- 4 个测试

### L2a：接线测试
- server.ts 含 `cockpitRoutes` import（grep "cockpitRoutes" src/server.ts）
- generate-dashboard.py 的 fetch URL 指向 `/api/cockpit/data`

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| GET /cockpit | 浏览器 / Codex 内嵌浏览器 | curl localhost:3000/cockpit |
| GET /api/cockpit/data | 前端 JS setInterval 300s | curl localhost:3000/api/cockpit/data |

---

## 完成标准

```
[ ] src/routes/cockpit.ts: GET /cockpit + GET /api/cockpit/data
[ ] server.ts: import + app.use(cockpitRoutes)
[ ] generate-dashboard.py: fetch URL → /api/cockpit/data
[ ] localhost:3000/cockpit 返回完整中文仪表盘
[ ] localhost:3000/api/cockpit/data 返回有效 JSON
[ ] Codex 内嵌浏览器可正常访问（同源）
[ ] 5 分钟轮询正常（不再跨域）
[ ] Python 不可用 → 500 + degraded
[ ] ≥4 个测试
```
