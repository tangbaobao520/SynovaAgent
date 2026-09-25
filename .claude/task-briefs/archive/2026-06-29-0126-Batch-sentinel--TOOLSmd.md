# Task Brief: Batch: sentinel测试 + TOOLS.md通用工具 + 预存文件修复

> 生成: 2026-06-29 01:27:01 | 分支: feat/prompt-architecture | as any: 0

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

流程约束: V4.2.8 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

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
- [x] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [x] 扩展（文件驱动，不改 TypeScript）

本任务混合类型：
  1. 哨兵测试（L3）— 新增 tests/sentinel/ 下 compute 测试文件
  2. 专家 TOOLS.md（扩展层）— 8 位专家加 get_sentinel/get_ontology 工具
  3. 预存文件修复（L3-L5）— industry-loader.ts, llm-provider-loader.ts, tool-registration.ts, sentinel-service.ts

### b) 文件审计
- extensions/sentinels/*/computes/ — 50个哨兵 compute，零测试覆盖
- expert/{strategy,org,finance,tech,marketing,action,business_model,knowledge}/TOOLS.md — 8个文件，缺通用工具
- src/l4/industry-loader.ts — 预存 BOM 字符错误
- src/providers/llm-provider-loader.ts — 预存语法错误
- src/mcp/tool-registration.ts — JSON 解析错误
- src/agent/sentinel-service.ts — 声明/表达式错误
关系：测试→新建，TOOLS.md→扩展，预存→修复

### c) 决策
- 测试：每个 sentinel 至少一个 compute 函数的单元测试
- TOOLS.md：追加通用工具段落在现有工具列表后
- 预存文件：修复语法错误，不重构逻辑

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① 测试优先 — 先写测试再修代码
② TOOLS.md — 用 sed 批量追加
③ 预存修复 — 逐个文件诊断并修复
④ 验证 — vitest pass + tsc 零新错

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 33: *.test.ts (单元) / *.integration.test.ts (集成)
  - memory/stub-implementation-pattern.md: 真实测试 ≠ 空壳

### b) 本任务执行约束
  - rule: "每个 compute 测试必须有 expect() 断言"
    verify: "grep -rn 'expect(' extensions/sentinels/*/computes/*.test.ts"
  - rule: "TOOLS.md 追加后 get_sentinel 和 get_ontology 两个工具名必须存在"
    verify: "grep -c 'get_sentinel' expert/*/TOOLS.md | grep -v ':0' | wc -l"
  - rule: "预存文件修复后 tsc --noEmit 必须 zero new errors"
    verify: "npx tsc --noEmit 2>&1 | grep -vE 'sentinel-service|industry-loader|tool-registration|llm-provider-loader'"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
  1. 哨兵测试 — 为 6 个代表性 compute 写单元测试（覆盖环境/资本/界面/技术/匹配/内部各层）
  2. 8 位专家 TOOLS.md 追加 get_sentinel(sentinelId) 和 get_ontology(nodeType) 通用工具
  3. 修复 4 个预存语法错误文件

不做什么：
  - 不改 aggregate.ts, compute-*.ts (哨兵逻辑，仅加测试文件)
  - 不改 RULES.md, KNOWLEDGE.md (专家文件，另一个Claude职责)
  - 不改 runner.ts, types.ts (src/sentinel/路由)

## Q3: 验收 — 入口 → 交互 → 结果

入口：vitest run 触发 compute 测试 / tsc --noEmit 触发编译检查
处理：测试执行算逻辑 + 断言结果
结果：终端输出 PASS/FAIL

## 本任务在哪一层
L3 + 扩展层

## Done 标准
- [ ] 测试: vitest run --reporter=verbose — 至少 6 个哨兵 compute 测试通过，每个有 expect()
- [ ] TOOLS.md: grep "get_sentinel" expert/*/TOOLS.md — 8/8 文件有该工具
- [ ] TOOLS.md: grep "get_ontology" expert/*/TOOLS.md — 8/8 文件有该工具
- [ ] 预存修复: npx tsc --noEmit 2>&1 | grep -c "error" — 总数不高于修复前（4 系统文件错误不变）
- [ ] 预存修复: npx tsc --noEmit 2>&1 | grep -vE "sentinel-service|industry-loader|tool-registration|llm-provider-loader" — 空

## Done 标准
- [ ] 入口可触达:
- [ ] 链路走通:
- [ ] 结果可见:
