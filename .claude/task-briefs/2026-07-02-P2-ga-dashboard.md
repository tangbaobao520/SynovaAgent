# Task Brief: Phase P2 — GA 增长顾问进化引擎管理面板

> 生成: 2026-07-02 | 分支: feat/prompt-architecture | 面向 GA（增长顾问）的进化引擎操作界面

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向（L1 交互层）— `src/routes/ga-evolution.ts` 新建

本任务为 GA（增长顾问）提供一个 Web 面板，用于可视化和管理 L0 进化引擎。

目前进化引擎 4 个 API 端点完整可用，但GA必须通过 curl 或 Postman 操作提案。
需要为 GA 提供一个内置的 Web 面板（vanilla HTML/CSS/JS，无外部依赖）。

- 性质：新建（前端面板）
- 用户：GA（增长顾问）— 前线部署工程师，非技术用户
- 前置条件：P2 的 4 个 API 端点已存在
- 复用模式：匹配现有 `GET /chat` 的内嵌 HTML 模式

### b) 文件审计
- `src/routes/ga-evolution.ts` — 新建（内嵌 HTML 页面路由）
- `src/routes/chat.ts` — 参考（现有内嵌 HTML 模式）
- `src/server.ts` — 需注册一行 `app.use(gaEvolutionRoutes)`

关系：新建（仅前端面板，不改 API 逻辑）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **用户画像**：GA 每天操作 SynovaAgent，主要语言为中文。非技术用户，需要可视化界面而不是 API。
2. **技术选型**：沿用 `GET /chat` 的 vanilla HTML/CSS/JS 模式——零外部依赖，内嵌在 Express 路由中，部署即用。不需要 React/Vue，不需要构建工具。SynovaAgent 是独立进程中内置 Web 界面，不是大型前端项目。
3. **布局**：
   - 顶部：标题 + 状态指示器 + 刷新按钮
   - 第一行：4 个指标卡片（纠错数/阈值调整/提案待审批/错误数）
   - 主体：待审批提案列表（卡片式，每个卡片有 approve/reject 按钮）
   - 右侧或底部：手动触发聚合区域
   - 底部：最近操作日志
4. **为什么不是 SPA**：SynovaAgent 的内置 Web 界面就是简单 HTML。复杂前端框架在这个场景下是过度工程。

引用依据：
- 铁律 7: 入口可触达（GET /ga/evolution）+ 链路完整（点击 approve→API→刷新列表）
- 铁律 40-44: TUI 铁律不适用（这是 Web UI，不是 ink TUI）
- 铁律 38: 前端 JS 零 `as any`

### b) 本任务执行约束
- rule: "前端必须零外部依赖（无 npm/CDN 加载的框架）"
  verify: "grep -c 'cdn\|unpkg\|googleapis\|react\|vue\|jquery' src/routes/ga-evolution.ts | grep 0"
- rule: "必须使用已有 API 端点（不改后端）"
  verify: "grep -q '/api/evolution/proposals\|/api/evolution/status\|/api/evolution/aggregate' src/routes/ga-evolution.ts"
- rule: "必须注册到 server.ts"
  verify: "grep -q 'ga-evolution\|gaEvolutionRoutes' src/server.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 新建 `src/routes/ga-evolution.ts`：
   - `GET /ga/evolution` → 返回 GA 面板 HTML
   - 面板包含：指标卡片 / 待审批提案 / 手动聚合 / 操作日志
   - 所有数据通过 fetch() 从已有 API 获取
   - 点击 approve/reject → POST → 刷新列表
2. `src/server.ts` — 注册 gaEvolutionRoutes

不做什么：
- 不改任何已有 API 端点（/api/evolution/* 全部不动）
- 不改 packages/evolution/ 中的任何逻辑
- 不改 chat.ts 或现有页面
- 不引入外部依赖

## Q3: 验收 — 入口 → 交互 → 结果

入口：浏览器访问 `GET /ga/evolution`
处理：页面加载 → fetch 提案/状态 → 渲染
结果：GA 可以看到待审批提案，点击 approve 后提案被批准，列表实时刷新

## 本任务在哪一层
L1（src/routes/ga-evolution.ts）

## Done 标准
- [x] verify: test -f src/routes/ga-evolution.ts
- [x] verify: grep -q 'approve' src/routes/ga-evolution.ts
- [x] verify: grep -q 'reject' src/routes/ga-evolution.ts
- [x] verify: grep -q 'evolution/status' src/routes/ga-evolution.ts
- [x] verify: grep -q 'ga-evolution' src/server.ts
- [x] verify: npx tsc --noEmit 2>&1 | grep 'routes/ga'; test $? -eq 1
