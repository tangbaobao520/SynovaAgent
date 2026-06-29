# SynovaAgent L0 自我进化引擎 — 综合设计 v2.0 (终版)

> 融合 ARCH-13 (2026-05-30) + 当前代码审计 + 增长诊断体系
> 2026-07-01 | 五层架构之外的 L0 横向进化层

---

## 零、设计融合说明

本文档融合两份设计：

| 来源 | 核心贡献 | 保留/调整 |
|------|---------|----------|
| ARCH-13 (2026-05-30) | 三层进化框架(会话内→组织自适应→全局进化)、进化对象五维度、人工审核门禁、灰度发布、规则版本管理、专家子Agent专项进化 | **全部保留**，作为框架主干 |
| 当前审计+增长诊断 | 个体免疫(纠错→事实→阈值)、群体进化(行业聚合→行业知识)、AgentMemoryStore复用、L0横切架构 | **合并入三层框架**，作为具体实现路径 |

**调整点**：
- ARCH-13 将进化模块放在 `engine-core/src/evolution/` → 改为 L0 独立包 `packages/evolution/`
- ARCH-13 使用独立的 `EvolutionDB` → 改为复用 `AgentMemoryStore` (已有持久化+FTS5+TTL+租户隔离)
- ARCH-13 的"组织自适应"增加哨兵阈值自适应、本体事实沉淀(来自当前审计发现)
- ARCH-13 的"全局进化"增加行业哨兵阈值聚合、行业知识文件驱动(来自群体进化设计)

---

## 一、L0 在架构中的位置

L0 不是第六层。它是横向切面，与五层数据流正交：

```
                    ┌──────────────────────────────────────────────┐
                    │              L0 自我进化引擎                    │
                    │     观察 L1-L5 产出 → 优化 L1-L5 参数            │
                    │     三层结构: 会话内 → 组织自适应 → 全局进化       │
                    └──────────────────────────────────────────────┘
                           │ 读                     │ 写
              ┌────────────┼───────────────────────┼────────────┐
              ▼            ▼                       ▼            ▼
┌──────┐  ┌──────┐  ┌──────────┐  ┌──────────┐  ┌──────┐
│  L1  │→│  L2  │→│    L3     │→│    L4    │→│  L5  │
│ 交互  │  │ 编排  │  │ 洞察(哨兵)│  │ 本体(知识)│  │ 存储  │
└──────┘  └──────┘  └──────────┘  └──────────┘  └──────┘
```

L0 读：从 L1 读用户反馈 → 从 L3 读哨兵结果/专家报告 → 从 L4 读本体数据/历史记忆
L0 写：更新 L3 阈值/规则权重 → 更新 L4 事实/基线/知识 → 更新扩展文件(行业模板/专家配置)

---

## 二、进化目标：五个维度

ARCH-13 定义的五个进化维度全部保留，增加增长诊断体系的哨兵维度：

| 进化维度 | ARCH-13 定义 | 增长诊断体系补充 | 示例 |
|---------|-------------|---------------|------|
| ① 诊断规则与权重 | 模块内部判断阈值、因果链强度系数、归因权重 | **哨兵阈值** (如KZ指数critical从2.0→行业特定1.2) | KZ融资约束critical阈值从2.0→1.6 (组织持续纠错后自适应下调) |
| ② 对话策略与脚本 | 追问模板、共情回应、阶段引导语 | 报告颗粒度偏好(depth/language) | 发现某类客户对"信任"话题敏感→调整追问措辞 |
| ③ 知识库内容 | AI产品库、行业基准、术语表、常见组织模式 | **行业哨兵知识** (行业常见根因/案例) | 新增AI产品；更新某行业平均信息流得分 |
| ④ 专家Agent提示词 | 各专家方法论描述、分析示例 | **46哨兵解读规则** (如"KZ>2.0且ROIC/WACC<1.0→融资约束扼杀价值创造") | 财务分析师增加"毛利率下降与组织摩擦的关联模式" |
| ⑤ 报告叙事风格 | SCQA摘要语言风格、金字塔报告详略 | **飞轮仪表盘呈现** (valueCreation/valueCapture/valueRegeneration) | 调整CEO摘要长度和技术深度 |
| ⑥ 本体事实(新增) | — | **企业事实沉淀** (用户纠错→真实财务数据→写入GraphStore) | 用户纠错"现金流实际500万"→写入Financial.cash |

---

## 三、三层进化结构

```
┌──────────────────────────────────────────────────────────────┐
│ 第三层：全局进化 (Global Evolution)                            │
│ - 跨组织聚合学习                                               │
│ - 更新：行业基准、诊断规则、对话策略、AI产品库、专家提示词         │
│ - 频率：每月批量更新，人工审核 + 灰度发布 + 可回滚               │
│ - 影响范围：所有组织的诊断 Agent                                │
├──────────────────────────────────────────────────────────────┤
│ 第二层：组织自适应 (Org Adaptation)                             │
│ - 单组织持续学习                                               │
│ - 更新：组织基线、哨兵阈值、术语表、工作流模式、角色画像、企业事实   │
│ - 频率：每次诊断后自动更新，无需审核                             │
│ - 影响范围：仅该组织的诊断 Agent                                │
├──────────────────────────────────────────────────────────────┤
│ 第一层：会话内学习 (In-Session Learning)                       │
│ - 当前诊断会话中的即时调整                                       │
│ - 更新：假设权重、追问方向、证据筛选                              │
│ - 频率：实时，在诊断过程中发生                                    │
│ - 影响范围：仅当前会话，会话结束即丢弃                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 四、第一层：会话内学习

**不持久化。仅当前会话。** ARCH-13 已有完整定义，保持不变。

| 触发事件 | 学习行为 |
|---------|---------|
| 用户在 Phase 2 否定假设 A | 引擎降低该假设置信度，增加与否定理由相关的追问 |
| 用户在 Phase 3 根因树中添加节点 X | 引擎将 X 作为新候选根因，在后续证据筛选中给予关注 |
| 用户对某一维度表现出强烈情绪（反复追问、表达不满） | Agent 调整报告详略，对该维度增加解释性内容 |

**实现**：`session-learner.ts` — 会话状态机中维护动态权重表，不持久化。
**与现有代码的关系**：当前 `src/l3/synova-diagnosis-engine-impl.ts` 六阶段管线中 Phase 2 已有假设确认交互，session-learner 在此处接入。

---

## 五、第二层：组织自适应

**每次诊断后自动更新，仅该组织生效。**

### 5.1 更新项目

| 更新项 | 触发条件 | 更新逻辑 | 存储 |
|--------|---------|---------|------|
| 组织基线 | 连续3次诊断健康分稳定在新区间 | 将该区间设为该组织"正常基线"，偏离基线的敏感度调高 | AgentMemoryStore (type:`enterprise_fact`) |
| 哨兵阈值 | 某哨兵被用户纠错 ≥3 次 | 阈值自适应上调 20% (如 KZ critical 从 2.0→1.6) | AgentMemoryStore (type:`threshold_adjustment`) |
| 企业事实 | 用户每次纠错包含具体数值 | 解析事实 → 写入 GraphStore → 下次哨兵用真实数据计算 | GraphStore + AgentMemoryStore (type:`enterprise_fact`, 含版本链) |
| 术语与缩略表 | 文档信号提取识别到新高频术语 | 经用户确认后加入组织知识库术语表 | extensions/industries/{name}/knowledge/glossary.json |
| 角色画像 | 部门结构变化或关键角色变动 | 提示用户更新组织画像 | AgentMemoryStore (type:`entity`) |
| 工作流模式 | knowledge-accessibility 哨兵连续2次显示知识可调用性提升 | 记录新知识共享模式为"已固化"，未来诊断中降低该维度权重 | AgentMemoryStore (type:`pattern`) |
| 个性化对话偏好 | 用户连续3次跳过某类追问，或偏好"快速诊断" | 调整默认诊断模式，减少对该用户的追问频率 | AgentMemoryStore (type:`preference`) |
| 免疫记忆 | 用户每次纠错 | 记录 {sentinelId, correctedClaims, facts, timestamp} → 下次同哨兵运行前自动检查 | AgentMemoryStore (type:`user_correction`) |
| 自动关闭 ticket | 事实更新后哨兵不再告警 | 调用 L3 SentinelRunner.closeTicket() | L3 sentinel_tickets 表 |

### 5.2 实现

`packages/evolution/src/org-adapter.ts`:

```typescript
export class OrgAdapter {
  constructor(
    private l3API: L3WriteAPI,      // L3 暴露: closeTicket(), getThreshold()
    private graphStore: GraphStore, // L4
    private memoryStore: AgentMemoryStore, // L4
  ) {}

  /** 诊断完成后调用 */
  async afterDiagnosis(orgId: string, result: DiagnosisResult, feedback: SessionFeedback[]): Promise<void> {
    await this.updateBaseline(orgId, result);
    await this.processCorrections(orgId, feedback);  // 个体免疫
    await this.adjustThresholds(orgId, feedback);
    await this.updateWorkflowPatterns(orgId, result);
    await this.closeStaleTickets(orgId);
  }
}
```

### 5.3 与现有代码的关系

- `src/evolution/l0-adaptation.ts` (死代码) → 功能并入 `org-adapter.ts`
- `src/evolution/l1-session-learning.ts` (死代码) → 功能并入 `org-adapter.ts`
- `src/evolution/feedback-collector.ts` → 迁入 `packages/evolution/src/`，改造为持久化

---

## 六、第三层：全局进化

**每月触发。人工审核门禁。灰度发布。可回滚。**

### 6.1 更新流程 (ARCH-13 保留)

```
每月触发
  → 数据收集：聚合所有组织的匿名化诊断数据 + FDE 反馈 + 外部环境变化
  → 自动分析：识别全局模式（如某种干预建议效果衰减、新出现的组织问题类型）
  → 生成改进提案：具体到哪个模块的哪个参数、哪条规则的修改建议
  → 人工审核：Synova 产品团队或指定 FDE 审核，评估风险、测试效果
  → 灰度发布：先对 5% 的组织启用新规则，观察 2 周无退化后全量发布
  → 更新全局基线：将新规则合并到主分支，更新默认配置
```

### 6.2 增长诊断体系的全局进化内容

| 更新项 | 来源数据 | 产出 | 存储位置 |
|--------|---------|------|---------|
| 行业哨兵阈值 | 同行业所有组织的哨兵得分分布 | `extensions/industries/{name}/thresholds.json` | 行业扩展文件 |
| 行业典型事实 | 同行业组织的财务/运营数据统计 | `extensions/industries/{name}/facts.json` | 行业扩展文件 |
| 行业常见问题模式 | ≥3个同行业组织对同一哨兵纠错 | `extensions/industries/{name}/knowledge/common-pitfalls.md` | 行业扩展文件 |
| 诊断规则权重 | 跨组织 hypothesis 验证数据 | `extensions/rules/diagnosis-rules.json` | 规则扩展文件 |
| 对话策略优化 | 追问模板的跳过率/采纳率统计 | `extensions/reports/templates/` | 报告模板文件 |
| AI产品库更新 | 新AI产品发布或停产 | `extensions/ontology/node-types/agent.json` 的 enum 值 | 本体扩展文件 |
| 专家提示词增强 | 专家结论的用户确认率统计 | `expert/{type}/THEORY.md` 和 `RULES.md` | 专家配置 |
| 报告叙事优化 | 用户对报告详略/风格的反馈 | `expert/{type}/STAGE_LOGIC.md` | 专家配置 |

### 6.3 全局进化与个体自适应的边界

| | 第二层：组织自适应 | 第三层：全局进化 |
|---|---|---|
| 作用域 | 单个 orgId | 所有组织 (或同 industry 的所有组织) |
| 审核 | 无需审核 | 人工审核门禁 |
| 频率 | 每次诊断后 | 每月 |
| 回滚 | 无版本管理 (覆盖式) | 规则版本管理 + 快照 + 一键回滚 |
| 隐私 | 使用原始数据 (不出组织) | 仅使用匿名化聚合统计量 |
| 例子 | 组织A的 cash 被纠正为 500万 | 跨境电商行业 KZ 中位数为 1.0，通用阈值 2.0 太高 |

### 6.4 实现

```
packages/evolution/src/
├── index.ts
├── session-learner.ts        # 第一层: 会话内学习 (不持久化)
├── org-adapter.ts            # 第二层: 组织自适应
├── global-analyzer.ts        # 第三层: 全局分析 (离线脚本, Cron 触发)
├── rule-version-manager.ts   # 规则版本管理: 快照/回滚/灰度发布
├── feedback-collector.ts     # 反馈采集: 显式反馈入口
└── evolution-types.ts        # 进化相关类型定义
```

### 6.5 风险控制 (ARCH-13 保留)

| 风险 | 控制措施 |
|------|---------|
| 模型退化 | 每次更新前在历史诊断数据上回测，确保核心指标（方向正确性、根因识别准确率）不下降 |
| 偏见放大 | 聚合分析时检查不同规模、行业组织的分布均衡性，对少数群体采用加权补偿 |
| 隐私泄露 | 全局学习仅使用聚合统计量，禁止上传原始对话或文档；组织自适应数据不出该组织存储边界 |
| 过度拟合单用户 | 组织自适应引入"冷却期"，同一规则更新至少间隔 2 次诊断，避免短期波动导致频繁调整 |
| 规则冲突 | 规则版本管理器在加载时检查冲突，若新规则与已有规则矛盾，标记为"待人工解决" |

---

## 七、L0 与五层的接口

```typescript
// L3 暴露给 L0 的写入接口
interface L3WriteAPI {
  closeTicket(orgId: string, sentinelId: string): Promise<void>;
  getThreshold(orgId: string, sentinelId: string): Promise<number>;
  updateThreshold(orgId: string, sentinelId: string, threshold: number): Promise<void>;
  getSentinelStats(industry: string): Promise<PerSentinelStats[]>;  // 全局进化用
}

// L4 暴露给 L0 的接口 (已存在，无需改动)
interface L4API {
  graphStore: SynovaGraphStore;
  memoryStore: AgentMemoryStore;
  industryLoader: IndustryLoader;
  ontologyLoader: OntologyLoader;
}
```

server.ts 组装：
```typescript
const evolution = new EvolutionEngine({
  l3: sentinelRunner.getL0API(),
  l4: { graphStore, memoryStore, industryLoader, ontologyLoader },
});
```

---

## 八、专家子 Agent 的专项进化 (ARCH-13 保留)

### 8.1 专家进化的实际范围

当前系统使用 8 位专家，与 ARCH-13 的 5 位旧专家是两套不同体系。46 哨兵体系引入后，专家的输入从"对话中的假设验证反馈"变为"哨兵 Finding + 本体层数据"。进化内容需要调整：

| 专家 | 主责哨兵层 | 学习来源 | 进化内容 | 频率 |
|------|----------|---------|---------|:---:|
| **strategy** | E1-E6(环境), I1-I4(界面) | 用户对战略维度哨兵告警的纠错、行业竞争格局变化 | 更新护城河评估权重、生态位宽度阈值、产业生命周期判定规则 | 每季度 |
| **finance** | F1-F5(资本), I6/I10(界面) | 用户对财务哨兵(KZ指数/ROIC/增长质量)的纠错、实际上传的财务数据 | 调整KZ指数阈值、资本结构健康度基线、增长质量判定权重 | 每季度 |
| **org** | S1-S3(匹配), O1-O10(内部) | 用户对组织维度哨兵的纠错、组织架构变化反馈 | 调整信息失真率阈值、探索-利用平衡区间、人才密度基线 | 每季度 |
| **tech** | T1-T9(技术) | 用户对技术栈评估的纠错、软件生态变化 | 更新AI部署成熟度评分权重、软件健康度阈值、连接器覆盖率要求 | 每半年 |
| **marketing** | E4(客户需求迁移) | 用户对客户/市场哨兵的纠错、客户行为数据 | 调整客户流失风险阈值、需求迁移检测灵敏度 | 每季度 |
| **business_model** | I7/I9/I12(商业模式) | 用户对商业模式一致性哨兵的纠错、行业商业模式创新案例 | 更新商业模式一致性评分规则、自制/外购决策权重 | 每半年 |
| **action** | 综合所有哨兵 | 用户对行动建议的采纳率、实际执行效果 | 调整行动优先级排序规则、建议颗粒度 | 每季度 |
| **knowledge** | E2/E6/O1/O4(辅助) | 新理论文献、行业报告、案例库 | 更新各哨兵的理论引用、行业对标数据、常见根因模式 | 持续 |

### 8.2 实现方式

专家配置目录 `expert/{type}/` 中的文件由 L0 全局进化流程定期更新（经人工审核）：

- **THEORY.md**: 补充新的理论来源和哨兵解读规则
- **RULES.md**: 增加哨兵阈值组合解读规则（如"当KZ>2.0且ROIC/WACC<1.0时为融资约束扼杀价值创造"）
- **TOOLS.md**: 新增 `get_sentinel(sentinelId)` 工具声明
- **KNOWLEDGE.md**: 更新依赖数据源为 46 哨兵映射

进化数据来源：L0 从 L3 读取专家报告的 `confidence` 字段，结合 L1 的 `user_correction` 记录，识别哪些哨兵阈值、哪些解读规则需要调整。

---

## 九、实施路线

| 优先级 | 模块 | 工时 | 所属层 |
|:---:|------|:---:|:---:|
| **P0** | `feedback-collector.ts` — 显式反馈采集 + 持久化 | 6h | 跨层基础设施 |
| P0 | `org-adapter.ts` — 组织自适应（企业事实沉淀 + 阈值自适应 + 纠错免疫） | 12h | 第二层 |
| P0 | `session-learner.ts` — 会话内动态权重调整 | 8h | 第一层 |
| **P1** | `rule-version-manager.ts` — 规则快照与回滚 | 8h | 第三层基础设施 |
| P1 | 哨兵阈值行业聚合 (collective-evolution) | 10h | 第三层 |
| P1 | L3 Write API 暴露 (closeTicket/getThreshold/updateThreshold) | 4h | 跨层接口 |
| **P2** | `global-analyzer.ts` — 跨组织模式发现与提案生成 | 16h | 第三层 |
| P2 | FDE 工作台进化提案审批页面 | 12h | 第三层 |
| P2 | 灰度发布控制 (feature-flag-service) | 8h | 第三层 |
| **P3** | 专家子 Agent 专项进化 (5位专家 × 各自的进化逻辑) | 20h | 第三层 |
| P3 | 报告叙事风格进化 | 8h | 第三层 |

---

## 十、删除清单

| 文件 | 原因 |
|------|------|
| `src/evolution/l0-adaptation.ts` | 功能并入 `org-adapter.ts` |
| `src/evolution/l1-session-learning.ts` | 功能并入 `session-learner.ts` + `org-adapter.ts` |
| `packages/engine-core/src/evolution/` | 随 engine-core 删除 |

保留 `src/evolution/feedback-collector.ts`，迁入 `packages/evolution/src/` 后删除原位置。

---

## 十一、与记忆系统的关系

L0 使用 `AgentMemoryStore` (L4) 作为持久化存储。新增 MemoryType:

| MemoryType | 存什么 | 作用域 | 所属进化层 |
|-----------|--------|--------|----------|
| `user_correction` | 用户纠错记录 | orgId | 第二层 |
| `threshold_adjustment` | 阈值调整历史 | orgId | 第二层 |
| `industry_baseline` | 行业聚合统计 | industry tag | 第三层 |
| `evolution_snapshot` | 规则快照 | global | 第三层 |

不改 AgentMemoryStore 代码，不改表结构。用已有字段区分。

会话内学习数据（第一层）仅内存，不持久化到 AgentMemoryStore。

---

## 十二、跨文档一致性审计 (2026-07-01)

### 12.1 已发现的问题

| # | 问题 | 影响 | 解决方案 |
|---|------|------|---------|
| 1 | PACKAGE-RESTRUCTURE-v2.md 未列出 `packages/evolution/` | 两个方案不同步 | 在 PACKAGE-RESTRUCTURE 中增加 evolution 作为第 10 个包 |
| 2 | FULL-CHAIN-v3.md 未提及 L0 进化 | 全链路文档不完整 | 在 FULL-CHAIN 的 Week 4 之后增加 "进化层接线" 阶段 |
| 3 | L3WriteAPI 的 4 个方法在 SentinelRunner 中均不存在 | L0 写 L3 的路径是断的 | 在 SentinelRunner 中实现 `getL0API()`: closeTicket()/getThreshold()/updateThreshold()/getSentinelStats() |
| 4 | AgentMemoryStore 无 `queryByIndustry()` 方法 | 群体进化无法跨组织查询 | 使用现有 `list({type, tags})` 替代。tags 字段用 `industry:{name}` 格式即可跨组织查询。无需新增方法 |
| 5 | feedback-collector 迁入 `packages/evolution/` 后 chat.ts 的 `require()` 路径需更新 | 编译失败 | 实施时同步更新 chat.ts 为 `require('@synova/evolution')` |
| 6 | conversation-engine 无 `endSession()` 方法 | org-adapter 触发点描述不准确 | 改为在 `post-diagnosis-processor.ts` 的 `runPostDiagnosisProcessing()` 完成时触发 org-adapter.afterDiagnosis() |

### 12.2 前置依赖表

L0 进化引擎需要以下模块先就位才能完整运行:

| 前置依赖 | 所在方案 | 当前状态 | 阻塞 L0 的哪个功能 |
|---------|---------|---------|-----------------|
| `packages/evolution/` 包创建 | 本方案 Phase 1 | 未创建 | 全部 |
| SentinelRunner.getL0API() | 本方案 P1 | 未实现 | 第二层(closeTicket/阈值读写)、第三层(getSentinelStats) |
| Financial 节点 17 字段 | FULL-CHAIN Week 1 | **已就绪** | 第二层(事实沉淀) |
| POST /api/data/upload | FULL-CHAIN Week 1 | **已就绪** | 第二层(用户上传纠错数据) |
| AgentMemoryStore | 现有 | **已就绪** | 第二层+第三层(持久化) |
| BaselineStore | 现有 | **已就绪** | 第二层(基线对比) |
| IndustryLoader | 现有 | **已就绪** | 第三层(行业扩展加载) |
| ContextCompressor + WorkspaceContextBridge | 现有 | **已就绪** | 第二层(事实注入对话上下文) |

### 12.3 三层进化的接线点详表

| 层 | 模块 | 接线位置 | 触发时机 | 当前代码状态 |
|----|------|---------|---------|------------|
| 第一层 | session-learner.ts | `src/l3/synova-diagnosis-engine-impl.ts` Phase 2-3 | 用户否定假设/修改根因树 | **未接线** (需在六阶段管线中增加调用) |
| 第二层 | org-adapter.ts | `src/agent/post-diagnosis-processor.ts` → `runPostDiagnosisProcessing()` 完成时 | 每次诊断完成后 | **未接线** (post-diagnosis-processor 未调用 evolution) |
| 第二层 | feedback-collector.ts | `src/routes/chat.ts:63` | 用户 confirm/reject/opinion | **已接线**(需迁路径) |
| 第三层 | global-analyzer.ts | Cron 定时任务 | 每月 | **未实现** |
| 第三层 | rule-version-manager.ts | global-analyzer 调用 | 灰度发布/回滚时 | **未实现** |



