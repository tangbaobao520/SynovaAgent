<!--
  SYNOVA-CROSS-AUDIT-阶段性报告-v2-20260727
  状态: 进行中 (6/9 轮完成 + 2 专项, 3 轮进行中)
  发现: 6 P0 / 20 P1 / 3 P2
  修复: 3 P0 已在审计过程中修复
-->

# Synova 权威文档跨文档一致性审计 — 阶段性报告 v2

> 2026-07-27 | 21 文档组, ~120 文件 | 6 P0 / 20 P1 / 3 P2

---

## 一、P0 级发现 (6 项 — 3 已修复, 2 待编码, 1 延期)

### P0-1: AGENTS.md V4.5.0 架构定义与实际代码严重脱节 [延期]

35 个目录不在架构定义中，20 哨兵适配器声称仅 4 个存在。
**决策**: 延期至产品稳定后更新，非客户阻塞项。

### P0-2: 8 位专家声称, 代码仅 6 位 [待 Claude Code]

business_model 和 knowledge 专家从设计到代码全链路缺失。
**决策**: 需要 Claude Code 在 expert-prompts.ts 中补上两位专家提示词模板。

### P0-3: 13 专家 ID 与 03/10 完全不兼容 [✅ 已修复]

13 §4.3 的 5 个长 ID (strategic_analyst 等) 改为短 ID (strategy 等)。

### P0-4: CT 附录 A 引用不存在的 triggerFullDiagnosis [✅ 已修复]

附录 A Gate 5 条件 3 改为引用实际存在的 DiagnosisLauncher.startDiagnosis()。

### P0-5: CT 附录 A 声称 bcrypt.hash 在 enterprise.ts 中被调用 [✅ 已修复]

附录 A Gate 1 条件 2 改为引用 UserStore.createUser() 间接哈希。

### P0-6: 13 遗漏 3/8 专家 [待合并至 P0-2]

business_model、action、knowledge 在 13 中无结构化引用。与 P0-2 合并处理。

---

## 二、P1 级发现 (20 项)

### 2.1 数据契约 (Round 2)

| # | 发现 | 严重度 |
|---|------|--------|
| P1-1 | E-05 因果链 ID: 01 标注 CC-CAPITAL-01, 02 标注 CC-FINANCE-01 | P1 |
| P1-2 | 13§一 用 `edge_param`, 15§一 用 `42edge` — 同一概念枚举值不同 | P1 |
| P1-3 | 02§一 DirectionFailureTrigger 缺少 deviatedEdgeParams 和 edgeDeviations 字段 | P1 |

### 2.2 时间尺度 (Round 4)

| # | 发现 | 严重度 |
|---|------|--------|
| P1-4 | 三个文档均未定义统一的 "快/中/慢" 时间尺度分类体系 | P1 |
| P1-5 | 02 声称 "07 文件夹为空" — 07 实际有 5 个文件 123KB, 事实错误 | P1 |
| P1-6 | 15 的 computeInterval (4 档) 与 07 的触发机制 (Cron+事件+按需) 不在同一抽象层级 | P2 |

### 2.3 术语混用 (Round 1 — Harvey 已完成)

Harvey 对 4 组关键术语完成全量审计:

- **GraphBridge/GraphStore**: 研究文档中 GraphStore 是主导术语(~140行)，GraphBridge 出现约 1/10 频率(~15行)。GraphStoreLike/GraphBridgeLike 接口名在研究文档中零出现，仅在源码 .ts 文件中。
- **8 位专家**: 短 ID 体系已统一。business_model 和 knowledge 代码缺失（已在 P0-2 标注）。
- **哨兵/Sentinel**: 三种形式语义分化清晰——中文描述、大写 Sentinel 是类型、小写 sentinel 是代码标识。无冲突。
- **MVS/最小可用系统**: 缩写统一使用 MVS。但不同文档(14/01/研究方案 v3)对 MVS 范围定义存在差异——P1。

初步发现:

| # | 发现 | 严重度 |
|---|------|--------|
| P1-7 | GraphBridge/GraphStore/GraphBridgeLike/GraphStoreLike 在 19 个文件中混用 | P1 |
| P1-8 | 专家 ID: 03/10 短 ID vs 13 长 ID (已修复) | P1 |

### 2.4 CT 附录 A 组件引用不精确 (Special B)

| # | 引用 | 实际 | 位置 |
|---|------|------|------|
| P1-9 | enterprise.ts:116 | 第 136 行 | Gate 2 |
| P1-10 | AutonomyResult.hypothesis:46 | 第 45 行 | Gate 5 |
| P1-11 | direction_status 字段 | status: DirectionStatus | Gate 7 |
| P1-12 | CronScheduler class in loop-scheduler.ts | CronSchedulerLike 接口 | Gate 12 |
| P1-13 | createGoal(): Promise\<string\> | 返回 string | Gate 8 |
| P1-14 | scripts/synova-commit | scripts/control-tower/synova-commit | Gate 16 |

### 2.5 数字不一致 (Round 5)

| # | 发现 | 严重度 |
|---|------|--------|
| P1-15 | 感知断裂点: 01 定义 5 个, 审计计划使用 4 个 | P1 |
| P1-16 | 架构层数: AGENTS.md 五层 vs 权威14 可能四层 | P1 |
| P1-17 | 哨兵数量: AGENTS.md 声称 20, 实际 adapters/ 仅 4 个 | P1 |

### 2.6 专家体系 (Round 6 + P0-3 修复后)

| # | 发现 | 严重度 |
|---|------|--------|
| P1-18 | 10 第六章自审发现代码仅 6 位专家 (文档定义 8 位) | P1 |
| P1-19 | 13 全文中 business_model/knowledge 零出现 | P1 |
| P1-20 | action 仅在 Proposal 散文描述中模糊提及 | P1 |

---

## 三、P2 级发现 (3 项)

| # | 发现 |
|---|------|
| P2-1 | 15 computeInterval 与 07 触发机制不在同一抽象层级 — 设计如此, 暂不修改 |
| P2-2 | 07 与 15 循环体系正交 (系统运行层 vs 企业业务模型层) — 设计如此 |
| P2-3 | 02 引用 03 的诊断周期为月度 — 此引用的目标文档 (03 HTML) 尚无明确 "诊断周期" 定义章节 |

---

## 四、已确认一致的项目

| 检查项 | 状态 |
|--------|:---:|
| 42 条因果边定义完整 | ✅ |
| 6 个控制塔组件 | ✅ |
| 6 个业务循环 | ✅ |
| 55 个 edge-type JSON (≥42) | ✅ |
| 45 个 transfer_function | ✅ |
| CT 附录 A 35 个组件引用中 27 个通过 | ✅ |
| 15§一 节点类型全部可映射至 01§三 节点池 | ✅ |
| 02§四 → 03 诊断流程接口契约定义完整 | ✅ |
| 13§五 诊断→proposal 14 条字段映射完整 | ✅ |
| 42 边下游消费矩阵 — 所有边均在至少一个下游文档中被引用 | ✅ |

---

## 五、修复状态

| ID | 状态 | 负责人 | 预计 |
|----|------|--------|------|
| P0-3 | ✅ 已修复 | 研究 Agent | 2026-07-27 |
| P0-4 | ✅ 已修复 | 研究 Agent | 2026-07-27 |
| P0-5 | ✅ 已修复 | 研究 Agent | 2026-07-27 |
| P0-2/P0-6 | 待编码 | Claude Code | TBD |
| P0-1 | 延期 | — | 产品稳定后 |
| P1-1~P1-20 | 记录 | — | 下次文档更新 |