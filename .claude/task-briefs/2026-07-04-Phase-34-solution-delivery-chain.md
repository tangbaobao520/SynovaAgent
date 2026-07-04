# Task Brief: Phase 3.4 方案生成完整链路（推送对接人 + 执行跟踪）

> 生成: 2026-07-04 15:30 | 分支: feat/prompt-architecture | as any: 0
> 文档: SYNOVA-IMPL-桌面应用-v1 (Desktop 实现计划)

## Q0: 定位

### a) 项目拼图
- [x] 纵向（L1 路由 + L2 服务 + L1 前端组件 + L5 服务器入口）

Phase 3.4: 方案生成完整交付链路。
前置依赖：Phase 3.2（pattern-matcher + 落地模式 JSON）、Phase 3.3（纠错叠加层）、Phase 4.1（Electron 通知）、Phase 4.2（邮件服务）。

现有模块：
- `src/services/pattern-matcher.ts` — 已加载落地模式 JSON，按 sentinelId 匹配
- `extensions/implementation-patterns/info-distortion.json` — 1 个示范模式
- `src/routes/actions-api.ts` — 行动项 CRUD（内存 + AgentMemoryStore）
- `src/notifications/` — 通知渠道框架（registry + electron-adapter）
- `src/services/email-service.ts` — 邮件发送服务（nodemailer）
- `electron-renderer/src/components/RightPanel.tsx` — 已有 mock 方案预览 UI

### b) 文件审计
```
src/services/pattern-matcher.ts          — ✅ 已有（Phase 3.2）
extensions/implementation-patterns/       — ✅ 已有 1 个 JSON（Phase 3.2）
src/routes/actions-api.ts                 — ✅ 已有（PRD §7）
src/services/solution-generator.ts        — ❌ 新建
src/routes/solutions.ts                   — ❌ 新建
src/notifications/registry.ts             — ✅ 已有
src/services/email-service.ts             — ✅ 已有（Phase 4.2）
electron-renderer/RightPanel.tsx          — ⚠️ mock 数据 → 真实 API
```

### c) 决策
- 新建 `solution-generator.ts` — 方案生成引擎
- 新建 `routes/solutions.ts` — 方案管理 API
- 修改 `RightPanel.tsx` — mock 数据替换为真实 API 调用
- 注册到 `server.ts`
- 复用 `pattern-matcher.ts` / `AgentMemoryStore` / `notification registry` / `email-service`

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC → ② 实现(生成器→路由→前端→接线) → ③ 验证(集成测试→pre-commit)

引用: 铁律 0-2, 铁律 24 (catch + log + degraded), 铁律 31 (降级传播), 铁律 38 (as any 零容忍)

### b) 执行约束
- rule: "POST /api/solutions/generate 从诊断报告生成方案包"
  verify: grep -rn "solutions/generate" src/routes/solutions.ts
- rule: "方案写入 AgentMemoryStore type=implementation_plan"
  verify: grep -rn "implementation_plan" src/services/solution-generator.ts
- rule: "方案推送通知走 dispatchNotification"
  verify: grep -rn "dispatchNotification" src/routes/solutions.ts
- rule: "前端方案 UI 调用真实 API 而非 mock"
  verify: grep -rn "fetch.*solutions\|api/solutions" electron-renderer/src/components/RightPanel.tsx

## Q2: 范围

**做什么：**
1. `src/services/solution-generator.ts` — 方案生成引擎
   - generateSolutions(reportId, recommendations[], sentinelIds[]): 匹配模式 → 组装方案包 → 写入 AgentMemoryStore (type=implementation_plan)
   - pushToLiaison(solutionId, channels[]): 分发通知 + 可选邮件
   - 铁律 24+31: 每步独立 try/catch, degraded 传播
2. `src/routes/solutions.ts` — 方案管理 API
   - `POST /api/solutions/generate` — 从报告生成方案
   - `GET /api/solutions?reportId=X` — 查询方案列表
   - `PUT /api/solutions/:id/status` — 状态流转 (confirmed/executing/completed/rejected)
   - `POST /api/solutions/:id/push` — 推送方案给对接人
3. `electron-renderer/src/components/RightPanel.tsx` — 真实 API 替换
   - Pattern tab: 从 GET /api/solutions?reportId= 加载真实数据
   - "生成落地"按钮: 调用 POST /api/solutions/generate
   - "确认推送"按钮: 调用 POST /api/solutions/:id/push
   - 行动跟踪 tab: 从 GET /api/solutions?reportId= 显示状态
4. `src/server.ts` — 注册 solutions routes
5. `tests/routes/solutions.integration.test.ts` — 集成测试

**不做什么：**
- ❌ 修改 expert-dispatcher.ts（Phase 3.3 已完成）
- ❌ 不使用 as any
- ❌ 不修改 existing notification types
- ❌ 不修改 pattern-matcher.ts 接口
- ❌ 不添加新落地模式 JSON（仅使用已有 info-distortion.json）

## Q3: 验收

入口: GA 诊断完成 → 右栏"落地模式"标签显示匹配结果
交互: [生成落地方案] → 方案预览 → [确认推送] → 通知弹出 + 状态更新
结果: 方案写入 AgentMemoryStore + 状态跟踪 + 推送通知

## 架构层级

L1（routes/solutions.ts + electron-renderer/RightPanel.tsx）+ L2（services/solution-generator.ts）+ L4（AgentMemoryStore 写入）

## Done 标准
- [ ] POST /api/solutions/generate 生成方案并写入 AgentMemoryStore
- [ ] GET /api/solutions/{id} 返回方案详情
- [ ] POST /api/solutions/{id}/push 通过 Electron 通知 + 邮件推送方案
- [ ] RightPanel 方案 UI 使用真实 API（无 mock 数据）
- [ ] 执行状态可跟踪（confirmed → executing → completed → rejected）
- [ ] Vite build + tsc 零错误 + CI success
