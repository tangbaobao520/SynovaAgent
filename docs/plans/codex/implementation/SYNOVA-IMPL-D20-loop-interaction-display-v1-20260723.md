# SynovaAgent -- D20 Loop 交互展示页 (Loop Interaction Display) 实施方案 v1.0

> 2026-07-23 | 权威文档 #4 Agent 工程能力对标 — Loop Interaction Display
> **控制塔 Phase 4 — D8a-D8f MainAgent 基础设施已完成。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/agent/main-agent.ts` 存在（D8a，提供 `listLoops()`/`getLoopStatus()`/`executeLoop()` API），`app/loops.html` 存在（D20 v1 骨架），`app/js/shell.js` 存在（D96 共享导航）
- [x] Get-Content 读取：main-agent.ts — `listLoops()` 返回 `RegisteredLoop[]`（6 循环：Enterprise Diagnosis/Department Navigation/GA Evolution/System Self-Check/Knowledge Accumulation/Overflow Monitor），`getLoopStatus(loopId)` 返回 pending/running/completed/failed
- [x] Select-String 验证：D8a MainAgent — `registerLoop`(L~60) / `executeLoop`(L~90) / `listLoops`(L~120) / `getLoopStatus`(L~140)；D8f ConvergenceEngine — `synthesize()` 返回 narrative
- [x] 引用 — 权威文档 #4：Loop interaction display — 展示 6 循环状态 + 执行历史时间线 + 触发信息 + 最近执行结果

---

## 问题根因

D8a-D8f 构建了完整的 MainAgent 基础设施（循环注册/执行/状态查询），但前端只有一个骨架页面 `loops.html`——显示 "Loading..." 后无实际数据渲染。D20 v1 从未完成。需要升级为完整交互页面：6 循环状态卡片 + 执行历史时间线 + 触发详情 + 手动执行按钮。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 前端 — Loop 交互展示页。升级 `app/loops.html` + `app/js/loops.js` + `app/css/loops.css`，展示 MainAgent 的 6 循环状态、最近执行历史、触发配置。复用 D96 shell + D97 卡片模式。

### Q1：调研
- MainAgent API（需新增 HTTP 端点或复用现有路由）：
  - `GET /api/loops/status` → `{ loops: RegisteredLoop[], lastUpdated }`（已有端点 D20 v1 创建）
  - `POST /api/loops/:id/execute` → 手动触发循环执行
  - `GET /api/loops/:id/history` → 最近 5 次执行记录
- D8f ConvergenceEngine 产出 `ConvergedSynthesis { narrative, convergentFindings }` — 可在执行历史中展示摘要
- 现有 `app/loops.html`：骨架页面，header#synova-shell + Loading placeholder

### Q2：范围
- 最小：升级 3 个前端文件（HTML/CSS/JS）+ 确保后端 API 端点可用。6 循环状态卡片 + 最近执行历史 + 30s 自动刷新
- 不做：不修改 MainAgent 核心逻辑、不新增后端路由（复用现有 `/api/loops/*`）

### Q3：验收
- 入口：`/app/loops.html` → 显示 6 张循环状态卡片 + 每张卡片可展开最近 5 次执行历史
- 交互：点击 "Execute" 按钮 → POST → 卡片状态切换为 "running" → 完成后更新
- 结果：每 30s 自动刷新，skeleton 加载态

### Q4：契约与测试
- @input：`GET /api/loops/status` 响应
- @output：渲染 6 循环卡片 + 执行历史时间线
- @degraded：API 不可用 → "Unavailable" + Retry 按钮
- 测试：渲染 6 卡片(1) + 展开历史(1) + API 降级(1) + 自动刷新(1) = 4 tests

---

## 构建内容

### 1. 升级 app/loops.html（修改，约 50 行）

保留 D96 shell 结构，替换 "Loading..." placeholder 为 JS 动态渲染区：

```html
<div class="page-content">
  <div class="loops-header">
    <h1>Loop Status</h1>
    <span id="loops-refresh" class="last-refresh"></span>
  </div>
  <section id="loops-grid" class="loops-grid">
    <!-- JS 渲染 6 张循环卡片 -->
  </section>
  <section id="loop-history" class="history-section">
    <h2>Recent Executions</h2>
    <div id="history-list"><!-- 最近 10 次执行记录 --></div>
  </section>
</div>
```

### 2. 升级 app/js/loops.js（重写，约 180 行）

```javascript
// 复用 api-client.js (D96) 的 api.get() / api.post()
async function loadLoopStatus() {
  const data = await api.get('/api/loops/status');
  renderLoopCards(data.loops);
  renderExecutionHistory(data.recentExecutions || []);
}
function renderLoopCards(loops) { /* 6 张卡片: loopId, status badge, lastRun, nextTrigger, [Execute] button */ }
function renderExecutionHistory(executions) { /* 时间线: loopId, startedAt, duration, status, summary */ }
function startAutoRefresh() { /* 30s setInterval */ }
```

### 3. 升级 app/css/loops.css（修改，约 100 行）

卡片网格（3×2）、状态色 badge（green=running/yellow=pending/red=failed/gray=idle）、执行历史时间线（左边框 + 时间戳）、响应式。

---

## 不做什么

- 不修改 MainAgent（`listLoops`/`getLoopStatus` 等 API 由 D8a 提供）
- 不新增后端路由（复用 D20 v1 创建的 `/api/loops/*`）
- 不修改 D8f ConvergenceEngine

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 6 张循环卡片正确渲染 → loopId/status/lastRun 显示正确
- "Execute" 按钮 → POST → status 变为 running → 完成后更新
- API 不可用 → "Unavailable" + Retry 按钮
- 30s 定时刷新 → 2 次 loadLoopStatus 调用
- 4 个测试

### L2a：接线测试
- loops.html 引用 `shell.js` + `auth.js` + `api-client.js`（与 D96 一致）
- loops.js 调用 `api.get('/api/loops/status')`（grep 验证）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| loops.html | 浏览器 `/app/loops.html` | curl / Test-Path |
| loops.js → api.get | api-client.js (D96) | grep "api.get" app/js/loops.js |
| GET /api/loops/status | MainAgent.listLoops() | 已有端点 |

---

## 完成标准

```
[ ] loops.html: 6 循环状态卡片 + 执行历史 section
[ ] loops.js: loadLoopStatus + renderLoopCards + renderExecutionHistory
[ ] loops.css: 卡片网格 + status badge + 时间线 + 响应式
[ ] D96 shell 复用: header#synova-shell + shell.js 导航
[ ] 降级: API 不可用 → "Unavailable" + Retry
[ ] ≥4 个测试
```

---

## 权威文档引用

- 权威文档 #4：Agent 工程能力对标 — Loop Interaction Display
- D8a MainAgent（listLoops/getLoopStatus/executeLoop）
- D8f ConvergenceEngine（ConvergedSynthesis narrative）
- D96 shell.js + D97 dashboard 模式（卡片/Skeleton 复用）
