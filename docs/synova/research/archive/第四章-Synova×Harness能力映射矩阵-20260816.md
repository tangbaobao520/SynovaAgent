# 第四章 Synova × Harness 能力映射矩阵

> 2026-08-16 | 方法：Synova 引擎逐模块 ↔ Harness 包族，四分类打标
> 四分类：【独有】Synova 有 Harness 无；【可替代】Harness 成熟可替换 Synova 自研；【可借鉴】Harness 范式更优，值得吸收；【双缺】双方都缺

---

## 4.1 映射总表

| Synova 模块（AGENTS.md 五层架构） | Harness 对应包 | 分类 | 判断依据 |
|----------------------------------|---------------|:---:|---------|
| L1 routes/TUI/MCP | apps/cli + apps/web + mcp-client | 可借鉴 | Harness 的 UI 组件化 + MCP client seam 更成熟 |
| L2 ConversationEngine | core/agent-loop + core/agent | 可替代 | agent-loop 是唯一 loop 逻辑，可换；Synova 的 ConversationEngine 是特权核心 |
| L2 diagnosis-launcher / sentinel-service | workflow + schedule + jobs | 可借鉴 | Harness 用 workflow（脚本编排）+ schedule（冷恢复）+ jobs（后台） |
| L2 SubAgentCoordinator | subagent（10 包多后端） | 可替代 | Harness 的 subagent seam（acp/claude-code/codex/fork/spawn）远超 Synova |
| L2 ModuleRunner | core/scope + workflow | 可借鉴 | scope 按 agent 隔离注册；workflow fan-out |
| L3 ExpertDispatcher/ExpertAutonomy/QualityFirewall | （无对应——领域知识） | 独有 | Harness 无专家/诊断/质量门禁概念 |
| L3 sentinel Runner/SignalAggregator/Registry/20哨兵 | schedule + guard | 可借鉴 | Harness 的 schedule（冷恢复）+ guard（循环卫生）更通用 |
| L3 expert-platform ExpertStore/Validator | （无对应） | 独有 | 领域知识 |
| L4 GraphBridge/EntityResolver/CommunityReports | （无对应——因果本体） | 独有 | Harness 无本体/因果图 |
| L4 evidence Collector/Corroboration/EvidenceStore | session（事件溯源） | 可借鉴 | 证据链可落到事件流 + model-visible⟺logged |
| L5 SessionStore/SQLite | session-persistence-sqlite/jsonl | 可替代 | Harness 的事件溯源持久化是超集 |
| L5 cron/CronScheduler | schedule | 可借鉴 | Harness schedule 有"冷 session 恢复" |
| packages/engine-core 25测量器+本体 | （无对应） | 独有 | 领域计算 |
| expert/ 7位专家 | （无对应） | 独有 | 领域知识 |
| security PIIScrubber/DataBoundary | sandbox + credentials + interaction/approval | 可借鉴 | Harness 的 sandbox（landlock）+ 审批 seam 更体系化 |
| providers DeepSeek/OpenAI/Gateway | llm/llm-deepseek/pi-ai + llm/llm seam | 可替代 | Harness 的 llm seam（adapter 可换 + 重试 + token meter） |
| 控制塔（自诊断） | self-modification + runtime-diagnostics/invariants + hooks | 可借鉴 | Harness 的 invariants（运行时不变量断言）+ 自指插件 |
| Loop Engineering（6循环×3尺度） | goal + schedule + feedback | 可借鉴 | Harness 有 goal/schedule/feedback 但无"循环"领域概念 |

---

## 4.2 四分类汇总

> 分类口径：【可替代】= 迁移底座时可直接换用 Harness 实现；【可借鉴】= 保留 Synova 自研、吸收 Harness 范式。二者**不互斥**——事件溯源、subagent 既可在迁移时替代（路径 A）、也可在渐进时借鉴（路径 B）。

### 【独有】Synova 有、Harness 无（护城河所在）

| 能力 | 为什么 Harness 没有/不做 |
|------|------------------------|
| 42 边因果本体（池-阀-流-溢出） | 组织诊断的领域真理，非通用底座 |
| 7 位专家体系（host/capital-cycle/customer-cycle/talent-cycle/tech/finance-structure/competitive-strategy） | 领域知识注入 |
| 25 测量器 + 20 哨兵 | 组织指标的领域计算 |
| 诊断方法论（6 阶段 FDE 管道） | 领域流程 |
| GA 人机协同闭环 | 企业场景的"人验证 AI"——Harness 是通用 agent，无 GA 概念 |
| 行业模板 | 领域沉淀 |
| 增长导航（Goal-Proposal-中层工作台） | 领域闭环 |
| 无数据诊断（问卷+导入+连接器三路径） | SMB 场景的领域能力 |

### 【可替代】Harness 成熟、可替换 Synova 自研

| Synova 自研 | Harness 成熟实现 | 替代收益 |
|------------|-----------------|---------|
| SessionStore（普通存储） | 事件溯源 session log + jsonl/sqlite 多后端 | 可复现/可审计/可 fork/resume |
| ConversationEngine（特权核心 loop） | core/agent-loop（唯一 loop 逻辑，可换） | 无特权核心，扩展靠插件 |
| SubAgentCoordinator | subagent seam（acp/claude-code/codex/fork/spawn） | 子 agent 多后端 + 完整生命周期 |
| providers/（LLM 三层） | llm seam（adapter 可换 + 重试 + token meter） | 模型与运行环境分离 |

### 【可借鉴】Harness 范式更优、值得吸收

| Harness 范式 | 借鉴价值 | 对应 Synova 缺口 |
|-------------|---------|----------------|
| 事件溯源 session log + model-visible⟺logged | 唯一事实源，可回放审计 | C 线 S3-5 自诊断可信度、S0 信任建立 |
| capability seam 三角色 | 能力可换、消费方不变 | 五层架构的静态分层 → 动态接缝 |
| Agent Notes 四态记忆 | 知识沉淀结构化 | Synova memory/ + 铁律的非结构化 |
| snapshot 测试 | 模型/UI 输出可复现 | 黄金数据集门禁未接入（P1-2） |
| sandbox（landlock/windows-acl） | 进程级安全 | security/DataBoundary 的应用层 |
| guard（循环卫生 + 超时） | 防跑偏 | 控制塔的通用化 |
| spill（超大输出持久化） | 上下文管理 | 无对应 |
| subagent seam 多后端（acp/claude-code/codex/fork/spawn） | 子 agent 多后端 + 完整生命周期 | 远超 Synova 的 SubAgentCoordinator |

### 【双缺】双方都缺（Synova 的机会）

| 能力 | 说明 |
|------|------|
| 企业多用户部署（Harness 是单 agent，Synova 有设计未全量验证） | SMB 市场独有需求 |
| 组织诊断的因果深度 | 只有 Synova 在做 |
| 可信的企业级插件治理 | Harness 生态治理软肋，Synova 可差异化 |

---

## 4.3 第四章结论

1. **Synova 的护城河清单清晰了**：8 项【独有】能力全部是"组织诊断领域深度"，Harness 一个都不提供。
2. **Synova 可白嫖的底座清晰了**：4 项【可替代】是 Synova 自研但 Harness 更成熟的通用工程——这些继续自研是重复造轮子。
3. **Synova 可借鉴的范式清晰了**：8 项【可借鉴】对应 C 线的多个 P0/P1 缺口（S3-5/S0/S5-1），借鉴 Harness 等于"借力补缺口"。
4. **双缺的重点是企业多用户 + 组织诊断因果深度**——企业多用户是 Synova 相对 Harness 的独特机会（Harness 定位单 agent）；组织诊断因果深度是双方都缺、但只有 Synova 在做的领域。

> 本章状态：✅ 完成（2026-08-16）。为第五章路径评估、第六章借鉴/特色清单的直接输入。
