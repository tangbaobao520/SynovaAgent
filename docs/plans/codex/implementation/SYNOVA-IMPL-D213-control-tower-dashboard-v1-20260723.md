# SynovaAgent -- D213 控制塔仪表盘 (Control Tower Dashboard) 实施方案 v1.0

> 2026-07-23 | 权威文档 #17 Chapter 1-6 全部引用
> **控制塔 Phase 2 — 信号汇聚层。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`app/dashboard.html` 存在（D97 参考模板），`app/js/shell.js` 存在（D96 共享导航），`app/css/app.css` 存在
- [x] Get-Content 读取：Ch2 §4.3 — 信号文件格式 `{COLOR}|{component}|{timestamp}|{reason}`，GREEN/YELLOW/RED 三色。Ch2 §4.2 — 健康检查缓存机制（30s 有效期）。Ch3 §2.1 — 仪表盘读取黄色/红色信号。Ch4 §3.2 — 锁超时告警推送到仪表盘。Ch5 §2.1 — 审计矛盾推送到仪表盘。
- [x] Select-String 验证：D96 shell.js 使用 `header#synova-shell` 渲染导航 + `getUser()` 获取角色
- [x] 引用 — Ch1 §10.4："创始人控制塔仪表盘（后续章节）：展示注射历史和成功率"

---

## 问题根因

控制塔 6 个组件全部向 "仪表盘" 推送信号——但仪表盘不存在。D200-D212 建了信号生产者，没有建信号接收器。创始人无法在一个页面看到整个控制塔的健康状态。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 创始人仪表盘。单 HTML 页面，复用 D96 共享 Shell + D97 卡片/Skeleton 模式。读取 `.codex/signals/` 目录下的组件信号文件（JSON + 管道格式），展示 6 组件健康总览 + 活跃阻断清单 + 24h 审计摘要。5 分钟自动刷新。

### Q1：调研
- Ch2 §4.3：gatekeeper 信号格式 = `{COLOR}|{component}|{timestamp}|{reason}` 单行文本
- Ch2 §4.2：健康缓存 `.codex/settings/gatekeeper/.health-check`（Unix timestamp）
- Ch3 §2.1 数据流图：黄色信号"契约待确认" / 红色信号"阻断 + 差异清单"
- Ch5 §2.1 数据流图：黄色"需人工审查" / 红色"严重矛盾"
- D96 shell.js：`<header id="synova-shell">` + `getUser()` + 导航链接
- D97 dashboard.html：`.health-grid` 卡片网格 + `.skeleton` 加载态 + Section A/B 布局
- D97 dashboard.js：`loadDashboard()` / `renderHealthCards()` / 5 分钟 `setInterval`

### Q2：范围
- 最小：3 个文件 — `control-tower.html`（页面结构）、`control-tower.css`（卡片/状态色）、`control-tower.js`（信号读取+渲染）。复用 D96 shell + D97 skeleton 模式。从 `.codex/` 目录读取各组件信号文件。
- 不做：不修改现有 dashboard.html（D97 业务仪表盘 vs D213 控制塔仪表盘，两个不同页面）、不建后端 API（纯前端读取本地文件路径，或通过静态 JSON 端点）

### Q3：验收
- 入口：`/app/control-tower.html` → 显示 6 个组件健康卡片（D200-D205 + D206）+ 导航栏
- 交互：页面加载 → 读取 `.codex/signals/` → 渲染卡片状态色（绿/黄/红/灰未知）
- 结果：5 分钟自动刷新，信号缺失显示灰色"Unknown"，信号过期（>10min）显示黄色警告

### Q4：契约与测试
- @input：`.codex/signals/{component}.json` 或 `.codex/settings/gatekeeper/.dashboard-signal`
- @output：HTML 页面（6 组件健康卡片 + 阻断清单）
- @degraded：信号文件不存在 → 灰色卡片 + "Unknown" + degraded 标记
- 测试：L1 渲染测试(4) + L2a 接线测试(2) = 6 tests

---

## 构建内容

### 1. app/control-tower.html（新建，约 80 行）

复用 D96 shell 模式：
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Synova — Control Tower</title>
  <link rel="stylesheet" href="/app/css/app.css">
  <link rel="stylesheet" href="/app/css/control-tower.css">
</head>
<body>
  <header id="synova-shell"></header>
  <div class="page-content">
    <h1>Control Tower</h1>
    <!-- 6 组件健康卡片网格 -->
    <section id="tower-health" class="tower-grid">
      <!-- JS 动态渲染 6 张卡片 -->
    </section>
    <!-- 活跃阻断清单 -->
    <section id="active-blocks" class="blocks-section">
      <h2>Active Blocks</h2>
      <div id="blocks-list"><!-- JS 渲染 --></div>
    </section>
  </div>
  <script src="/app/js/shell.js"></script>
  <script src="/app/js/auth.js"></script>
  <script src="/app/js/control-tower.js"></script>
</body>
</html>
```

### 2. app/css/control-tower.css（新建，约 120 行）

- `.tower-grid`：6 列响应式网格（desktop 3×2, tablet 2×3, mobile 1×6）
- `.tower-card`：状态边框色（绿/黄/红/灰），skeleton 加载态
- `.tower-card .status-dot`：脉冲动画（绿灯常亮，红灯闪烁，黄灯慢闪）
- `.blocks-section`：阻断清单表格（P0/P1/P2 badge + 来源组件 + 描述 + 时间）
- 复用 `app.css` 的颜色变量和排版

### 3. app/js/control-tower.js（新建，约 200 行）

```javascript
// 信号读取器
async function loadComponentSignals() {
  // 读取 6 个组件的信号文件：
  //   D200: .codex/settings/injections/ (最近一次 injection 记录的 status)
  //   D201: .codex/settings/gatekeeper/.dashboard-signal (管道格式)
  //   D202: .codex/audit-reports/ (最近一次审计的 P0/P1/P2 计数)
  //   D205: .codex/env-snapshot.json (最近一次 validate 结果)
  //   D206: .codex/signals/dev-doc-gatekeeper.json (D212 写入)
  //   写入锁: .codex/signals/write-lock.json (D209 写入)
  // 信号缺失 → 返回 { status: 'unknown', degraded: true }
}

// 渲染函数
function renderTowerHealth(signals) { /* 6 张塔卡片 */ }
function renderActiveBlocks(signals) { /* P0/P1/P2 清单 */ }
function startAutoRefresh(intervalMs = 300000) { /* 5 分钟 */ }
```

**信号文件约定**（JSON 格式，写入 `.codex/signals/{component}.json`）：
```json
{
  "component": "contract-archiver",
  "status": "yellow",
  "timestamp": "2026-07-23T10:00:00Z",
  "reason": "contract_json_missing",
  "p0_count": 0,
  "p1_count": 1,
  "p2_count": 0
}
```

**Gatekeeper 信号兼容**（管道格式，读取 `.codex/settings/gatekeeper/.dashboard-signal`）：
```
GREEN|gatekeeper_healthy|2026-07-23T10:00:00Z|all_checks_pass
```

---

## 不做什么

- 不修改 D97 dashboard.html（业务仪表盘——两个不同页面）
- 不建后端 API（纯前端读取静态 JSON 文件——通过 server 的静态文件服务）
- 不实现 WebSocket 实时推送（MVP：轮询）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 6 个组件信号全部正常 → 6 张绿色卡片 + 0 阻断
- 2 个组件红色 + 1 个黄色 → 对应状态色 + 阻断计数正确
- 信号文件全部缺失 → 6 张灰色卡片 + degraded 标记
- 信号过期（>10min）→ 黄色警告标记
- 4 个测试，每测试 ≥3 expect()

### L2a：接线测试
- `control-tower.html` 引用 `shell.js` + `auth.js`（与 D96 一致）
- `control-tower.html` 引用 `app.css`（复用全局样式）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| control-tower.html | 浏览器直接访问 `/app/control-tower.html` | Test-Path + curl |
| shell.js | control-tower.html `<script src>` | grep "shell.js" app/control-tower.html |
| auth.js | control-tower.html `<script src>` | grep "auth.js" app/control-tower.html |

---

## 完成标准

```
[ ] control-tower.html: 6 组件卡片网格 + 阻断清单 section
[ ] control-tower.css: 4 状态色 + skeleton loading + 响应式
[ ] control-tower.js: loadComponentSignals + renderTowerHealth + renderActiveBlocks + autoRefresh
[ ] D96 shell 复用: header#synova-shell + shell.js 导航
[ ] gatekeeper 管道格式兼容: GREEN|component|timestamp|reason
[ ] 降级: 信号缺失 → 灰色 Unknown + degraded
[ ] 降级: 信号过期 → 黄色警告
[ ] ≥6 个测试: 渲染(4) + 接线(2)
```

---

## 权威文档引用

- Ch1 §10.4：创始人控制塔仪表盘 — 展示注射历史和成功率
- Ch2 §4.2-4.3：健康检查机制 + 仪表盘信号机制（`{COLOR}|{component}|{timestamp}|{reason}`）
- Ch3 §2.1 数据流图：黄色/红色信号推送
- Ch4 §3.2：锁超时告警推送仪表盘
- Ch5 §2.1：审计矛盾推送仪表盘
- AGENTS.md Iron Law 0-5 错误 #14（仪表盘滞后）
