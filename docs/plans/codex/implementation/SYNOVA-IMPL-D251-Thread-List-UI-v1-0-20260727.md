<!-- SYNOVA-IMPL-D251 v1.0 | 2026-07-27 | 三面板布局+线程列表前端 -->
# SynovaAgent -- D251 三面板布局 + 线程列表 v1.0
> 补充文档 §3.1: 左边栏线程列表+主对话区+右侧子Agent面板。当前 index.html 仅做重定向

## 代码验证
- app/index.html: 仅13行——auth.js 加载 + isAuthenticated() 判断 → 跳转 dashboard/login ❌
- 无线程列表页面 ❌ | 无线程命名 UI ❌ | 无三面板布局 ❌
- GET /api/sessions: 已有(返回 {sessions[], count}) ✅
- PATCH /api/sessions/:id/title: D250 新增 ✅ (依赖)

## Q0-Q4
Q0: 补充文档设计三面板布局。当前 app/index.html 只是重定向脚本——不是可用的前端界面。
Q2: 做——重写 index.html 为三面板布局(左240px线程列表+主flex对话区+右280px子Agent占位); 新增 threads.js 线程管理逻辑(加载列表+切换+新建+重命名); app.css 新增三面板样式。不做——右侧子Agent面板(空占位, 归后续D#); 流式消费(归后续D#); 搜索/归档(后续)。
Q3: 用户打开 index.html → 左栏显示线程列表(GET /api/sessions) → 点击线程→主区加载 → 右键/双击重命名(PATCH D250)。新建诊断→POST /api/sessions。
Q4: L1 手动验证×4

## 改动 (index.html 重写 + app.css + threads.js ~180行)

### 1. app/index.html — 重写为三面板布局 (~40行)
```html
<div id="app-layout" class="three-panel">
  <aside id="thread-sidebar"><div id="thread-list"><!-- JS 渲染 --></div>
    <button id="btn-new-thread">+ New Diagnosis</button></aside>
  <main id="main-content"><!-- 默认: 选择或创建线程 --></main>
  <aside id="expert-sidebar"><!-- Phase 2: 子Agent状态面板 --></aside>
</div>
```

### 2. app/js/threads.js — 新建 (~100行)
函数: loadThreads()→GET /api/sessions → 渲染列表; selectThread(id)→高亮+加载; createThread()→POST /api/sessions; renameThread(id,title)→PATCH /api/sessions/:id/title
自动命名: 未重命名时显示 session.createdAt 格式化为 "诊断 YYYY-MM-DD HH:mm"

### 3. app/css/app.css — 三面板布局样式 (~40行)
.three-panel {display:flex; height:100vh} / #thread-sidebar {width:240px; border-right; overflow-y:auto} / #main-content {flex:1} / #expert-sidebar {width:280px; border-left} / 线程列表项样式 + active状态

## 测试 (L1 手动×4)
| # | 测试 | 验证 |
|---|------|------|
| 1 | 页面加载 → 线程列表渲染 | 手动 |
| 2 | 新建线程 → 列表刷新 + 新线程可见 | 手动 |
| 3 | 重命名线程 → PATCH 调用 + 列表更新 | 手动 |
| 4 | 切换线程 → 列表高亮切换 | 手动 |

## 完成标准
三面板布局可见 + 线程列表 CRUD + 重命名 PATCH 可用。纯前端 tsc 不涉及。
