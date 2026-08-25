# Task Brief: Phase 1.2 Composer+ExpertAttribution+useStreaming SSE

> 生成: 2026-07-02 21:44:49 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.2.9 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向（改 L1 交互层 UI）

本任务属于 L1 交互层。Phase 1.1 已实现 WelcomeScreen + MessageItem 基础。
本切片新增：Composer（增强输入框）、ExpertAttribution（专家标识折叠）、useStreaming（SSE 流式）。

现有模块：conversation-store、CenterPanel（模拟回复）、MessageItem
本任务：替换 CenterPanel 中的模拟回复为真实 SSE 流式调用

### b) 文件审计
无文件驱动模块与此任务重叠。

### c) 决策
复用 Phase 1.1 的类型定义和 store 模式。useStreaming 参考 TUI use-streaming.ts 的 buffer+16ms flush 模式。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
  ① SPEC 已定义
  ② 测试: store + streaming hook 测试
  ③ 实现: ExpertAttribution → Composer → useStreaming → CenterPanel 接线 → CSS
  ④ 接线: CenterPanel.replaceAll 模拟代码为真实 SSE
  ⑤ 验证: Vite build + tsc + CI

引用：铁律 0-2 (spec→test→impl→wire)、铁律 38 (as any 零容忍)

### b) 执行约束
- rule: "useStreaming 使用 bufferRef + 16ms flush 模式 (复用 TUI 已验证模式)"
  verify: grep -rn "bufferRef\|flushBuffer\|scheduleFlush" electron-renderer/src/hooks/useStreaming.ts
- rule: "ExpertAttribution 默认折叠，可展开"
  verify: grep -rn "collapsed\|toggle" electron-renderer/src/components/ExpertAttribution.tsx

## Q2: 范围 — 正确的最简方案是什么？

**做什么：**
1. ExpertAttribution.tsx — 专家标识折叠组件
2. Composer.tsx — 增强输入框（多行、@提及、/命令、文件拖拽区域）
3. useStreaming.ts — SSE 流式 hook
4. conversation-store.ts — 扩展流式状态
5. MessageItem.tsx — 集成 ExpertAttribution
6. CenterPanel.tsx — 替换模拟为真实 SSE
7. CSS — Composer、ExpertAttribution、SSE 状态样式

**不做什么：**
- ❌ @提及实际搜索 API（显示静态列表）
- ❌ /命令实际执行（显示命令列表）
- ❌ 文件上传 API（显示拖拽区域 UI）
- ❌ SSE 自动重连（v2 功能）

## Q3: 验收 — 入口 → 交互 → 结果

入口：输入框输入 @ → 弹出专家列表 → 选择 → 发送
处理：SSE 连接 POST /api/diagnosis/consult → 流式解析 → store 更新
结果：消息逐条显示（phase→thinking→finding→complete）

## 本任务在哪一层
L1（electron-renderer/）

## Done 标准
- [ ] ExpertAttribution 显示专家名+置信度，默认折叠可展开
- [ ] Composer @触发弹出专家列表，/触发弹出命令列表
- [ ] Composer 文件拖拽区域视觉提示
- [ ] useStreaming 连接 SSE 并解析事件
- [ ] CenterPanel 使用真实 SSE 而非模拟
- [ ] Vite build + tsc 零错误 + CI success
