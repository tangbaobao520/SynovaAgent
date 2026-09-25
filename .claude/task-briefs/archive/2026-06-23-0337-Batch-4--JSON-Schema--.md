# Task Brief: Batch 4: 本体节点/边 JSON Schema + 行业模板 + 业务模型 + LLM 提供商文件化

> 生成: 2026-06-23 03:37:28 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

流程约束: V3.8 — task brief 6 字段强制 + plan.json 分阶段 + pre-commit 8 组物理阻断。

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
基础设施层 — 4 维度全部是"将硬编码改为文件驱动"的扩展任务。
触及: L4 本体 (ontology/industry 类型定义)、L3 洞察 (LLM 提供商)、L4 知识 (业务模型 PKB)。
各维度现状:
- 本体: SOGNodeType enum 17 值 + SOGEdgeType enum 14 值 (sog-core-schema.ts)。66 文件引用 SOGNodeType, 48 引用 SOGEdgeType。GraphStore 无 queryByTags 接口。已有外部分支 l3/key-person-risk.ts 通过 filters 参数等效实现。
- 行业: 4 个硬编码 .ts 模板 (ontology-templates/general-enterprise 等)。在 engine-core 内。
- 业务模型: BusinessModelProps.canvasType 7 值硬编码 union。PKB 无对应条目。
- LLM: ProviderType union 10 值 + switch/case 工厂。11 个 provider 文件。熔断/重试在 ProviderChain 层已解耦。已有扩展 registry 的通用 ProviderChain，适配器只需返回 LLMProvider 接口。
全部是替换——用文件驱动 JSON/manifest 替代硬编码 enum/union。不新增能力，只改存储格式和加载方式。
注意: 不碰 engine-core 源文件 (铁律 46)。从 engine-core 读结构 → 在 extensions/ 下重写 → loader 替代 import。

### b) 文件审计
grep SOGNodeType: 66 文件 (src/l4/, src/tools/, src/connectors/, src/agent/, src/evolution/ 等)
grep SOGEdgeType: 48 文件
grep ProviderType: 4 文件 (src/providers/)
grep BusinessModelProps: 1 文件 (sog-core-schema.ts)
grep ontology-templates: engine-core/ 内 4 模板 + index.ts
已有文件驱动模块 (extensions/): sentinels/4、frameworks/85、locales/2、reports/2、notifications/2、rules/25
新建: extensions/ontology/ (不存在)、extensions/industries/ (不存在)、extensions/business-models/ (不存在)、extensions/llm-providers/ (不存在)
关系: 全部是新建——无一已有覆盖。
check-file-driven.sh 已预置 ontology/ 和 industries/ 的校验模式 (tags 引用、目录结构、pizza-chain 硬阻断)。
llm-providers/ 和 business-models/ 不在 check-file-driven.sh 校验范围，需新增校验或接受手动验证。
GraphStore.queryByTags 不存在——需实现。KeyPersonRisk 哨兵通过 filters 参数等效验证可行。

### c) 决策
全部四维度: 无已有文件驱动覆盖 → 新建走文件驱动，不准硬编码在 TS 里。
本体类型: 新建 extensions/ontology/node-types/*.json + edge-types/*.json。保留 sog-core-schema.ts 枚举作为 source of truth（不删），loader 从 JSON 加载构建运行时校验器。GraphStore 加 queryByTags + 标记 queryNodes(type) @deprecated。
行业模板: 新建 extensions/industries/*/。从 engine-core 模板读结构，重写 JSON + manifest。extends 继承机制。不 import engine-core。
业务模型: 新建 extensions/business-models/*.json。FileScanner 加载 → 注入 PKB。BusinessModelProps 枚举保留但标记 deprecated。
LLM 提供商: 新建 extensions/llm-providers/*/manifest.json + adapter.ts。ProviderType union 保留为 fallback。ProviderChain 层加载 manifest 扫描结果。熔断/重试在 ProviderChain 统一处理（已解耦）。
queryByTags: 在 GraphStore 接口新增，渐进式迁移。旧 queryNodes 保留并标记 @deprecated。
pizza-chain: 一旦 ontology/ 有内容即硬要求。本 Batch 需创建 tests/acceptance/zero-code-industry.test.ts。

## Q1: 调研 — 这件事以前怎么做的？

### a) 业界最佳实践
JSON Schema → runtime validators: AJV (Fastify/OpenAPI 生态) 编译 JSON Schema 为高效校验函数。OpenAPI 用 JSON Schema 定义 API 契约。Pulumi/AWS CDK 用 JSON 描述基础设施。核心模式: 声明式定义→自动生成消费代码。
本体建模: Protégé/OWL/RDF 用 JSON-LD 序列化本体。GraphQL schema 定义类型→运行时校验。Palantir Foundry 的 Ontology SDK 用 YAML 定义对象类型→自动生成 SDK。

### b) Anthropic 团队怎么做
渐进迁移 + 向后兼容: 旧接口保留 @deprecated → 新接口并行 → feature flag 控制 → 灰度切 → 旧接口删除。
JSON Schema → runtime validators 自动生成: 不手写校验函数，从 Schema 编译。
结构化 manifest: 每个扩展目录有 manifest.json 自描述，启动时自动发现。

### c) 我们犯过的错
engine-core 拆分欺诈 (铁律 46/47): 声称完成 4 次，实际全是桥接文件。→ 这次不删旧文件，loader 并行运行。旧路径保留为 fallback。
Batch 1 pre-commit 6 次才通过: as any 注释误报、接线 grep 盲区、动态 import 检测不到。→ V3.7 已修复，Q0 先做文件审计避免重复。
枚举值变更影响范围不可见: 66 文件引用 SOGNodeType。→ 旧枚举不删，新 JSON Schema 作为加载源，渐进迁移引用。

## Q2: 范围 — 正确的最简方案是什么？

做:
- extensions/ontology/node-types/*.json (17) + edge-types/*.json (14) + tags.json
- extensions/industries/*/ 4 行业模板 + manifest extends 机制
- extensions/business-models/*.json (~7) → 注入 PKB
- extensions/llm-providers/*/ manifest.json + adapter.ts (10)
- GraphStore.queryByTags(tags[], matchMode) 新接口
- loader: ontology-loader.ts / industry-loader.ts / business-model-loader.ts / llm-provider-loader.ts
- 接线: initFileDrivenLoaders + server.ts 启动流程
- tests/acceptance/zero-code-industry.test.ts (pizza-chain)
- check-file-driven.sh: 加 business-models/ llm-providers/ 校验模式

不做:
- 不删 sog-core-schema.ts 枚举（保留 source of truth）
- 不删 ProviderType union（保留 fallback）
- 不碰 engine-core 任何文件（铁律 46）
- 不一次性迁移 66 处 SOGNodeType 引用（标记 @deprecated，渐进迁移）
- 不翻译已有业务逻辑到新接口（只搭桥）

## Q3: 验收 — 做完后用户能看到什么？

入口: extensions/ontology/node-types/person.json 存在 → loadOntology() 返回 17 节点类型
交互: GraphStore.queryByTags(['human']) 返回 Person 节点 → 无需知道 SOGNodeType 枚举
结果: 新增节点类型 = 加 person.json → reload → queryByTags 自动可查

## 本任务在哪一层

L4 (本体层) — ontology/industry/business-model 类型定义 + GraphStore 接口
L3 (洞察层) — LLM 提供商 loader
L2 (编排层) — initFileDrivenLoaders 接线
不跨层: 所有新增文件在 extensions/ 下，不改 L5 SQLite 直接查询模式

## Done 标准
- [x] 入口可触达: extensions/ontology/node-types/ 有 17 个 JSON，edge-types/ 有 14 个 JSON
- [x] 链路走通: loadOntology() → GraphStore.queryByTags(['human']) → 返回 Person 节点
- [x] 结果可见: pizza-chain CI 测试通过（零代码新增行业验收）
