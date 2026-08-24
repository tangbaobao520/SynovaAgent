# Task Brief: Task 1.5: revenue-decomposition → F3 资本配置效率

> 生成: 2026-06-26 04:04:20 | 分支: feat/prompt-architecture | as any: 0

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

**横向解耦：20 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.2.6 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

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
本任务属于三层解耦的哪一层？
- [ ] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [x] 扩展（文件驱动，新建哨兵目录）

本任务为 Phase 1 最后一步。触及 L3（extensions/sentinels/）。
按技术方案重写 revenue-decomposition 为 F3 资本配置效率哨兵（capital层, deterministic）。

### b) 文件审计
旧文件（待删除）：
- src/sentinel/adapters/revenue-decomposition-sentinel.ts
新目录（待创建）：
- extensions/sentinels/capital-efficiency/
关系: 新建（旧适配器仅供参考，按技术方案重写）

### c) 决策
无覆盖冲突。技术方案要求重写为 F3 哨兵。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
5步序: SPEC/Done标准 → 先写测试 → 实现 → 接线 → 自检6问。
引用: 铁律0-2, 铁律7, 铁律24+31。

### b) 本任务执行约束
- rule: "新compute自包含目录内静态import"
  verify: "! grep -rn import.*\\.\\./ extensions/sentinels/capital-efficiency/computes/ --include='*.ts' | grep -v node_modules"
- rule: "旧适配器删除零残留"
  verify: "sh -c '! grep -rn revenue-decomposition src/ --include=\"*.ts\" | head -5'"

## Q2: 范围

做什么：
1. 创建 extensions/sentinels/capital-efficiency/ + manifest.json（layer:capital, computeKind:deterministic, expert:finance, auxiliaryExperts:[strategy]）
2. 创建 aggregate.ts + computes/（ROIC/WACC差 + 资本周转）
3. 删除 src/sentinel/adapters/revenue-decomposition-sentinel.ts
4. 更新 extensions/sentinels/manifest.json
5. 更新 types.ts

不做什么：
- 不改 sentinel-loader.ts / builtins.ts / registry.ts

## Q3: 验收

入口：Cron 触发哨兵巡检
处理：sentinel-loader.ts 扫描 capital-efficiency/ → 读 manifest → import → check()
结果：SentinelFinding[] 存入 Evidence 池

## 本任务在哪一层
L3（extensions/sentinels/capital-efficiency/）

## Done 标准
- [x] 入口可触达: verify: test -d extensions/sentinels/capital-efficiency/
- [x] 链路走通: verify: npx tsc --noEmit 2>&1 | head -5
- [x] 结果可见: verify: sh -c '! grep -rn "revenue-decomposition" src/ --include="*.ts" | head -5'
