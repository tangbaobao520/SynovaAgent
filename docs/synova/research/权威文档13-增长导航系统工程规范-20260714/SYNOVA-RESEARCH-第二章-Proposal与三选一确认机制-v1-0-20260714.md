# 第二章 Proposal与三选一确认机制

> 权威文档13 — 增长导航系统工程规范 | v1.0 | 2026-07-14
> 依赖：第一章 Goal工程规范（待编）；下游：第三章 方案级哨兵系统

---

## 一、Proposal 的存在理由

诊断报告输出根因分析 + 行动建议，但一条根因往往对应多条解决路径。中层负责人面对的不是"要不要做"的二元问题，而是"选哪条路"的多路径决策。

Proposal 是诊断建议到执行 Goal 之间的**转换层**。它做三件事：

1. **将诊断建议展开为 3 条可选路径** — 每条路径标注风险等级、预期影响、代价权衡、推荐理由
2. **强制中层确认** — 中层必须选择一条路径（或超时后系统自动选择默认路径），才能生成可执行的 Goal
3. **记录决策过程** — 为什么选这条路、什么时间选的、谁选的，形成可审计的决策链

没有 Proposal 层，诊断→执行的转换就是黑盒。两个月后复盘"当初为什么选这个方案"，无人能回答。

---

## 二、Proposal TypeScript 接口

```typescript
/**
 * Proposal — 诊断建议→可执行Goal的转换层
 *
 * 每条诊断建议展开为3条可选路径，中层选择一条后生成Goal。
 * 11态状态机管理从草稿到完成的全生命周期。
 *
 * @entity Proposal
 * @layer L2 (编排层) — ConversationEngine 创建, ExpertDispatcher 填充路径
 * @persistence store/proposal-store.ts (SQLite)
 */
export interface Proposal {
  /** 唯一标识 (UUID v4) */
  id: string;

  /** 关联的诊断报告 ID */
  diagnosisReportId: string;

  /** 提案标题 (一句话概括) */
  title: string;

  /** 目标部门 */
  department: string;

  /** 三条可选路径 */
  paths: [
    ProposalPath,
    ProposalPath,
    ProposalPath
  ];

  /** 当前选中的路径索引 (0-2, -1 表示未选择) */
  selectedPathIndex: number;

  /** 是否经 GA (总经理) 确认 */
  confirmedByGa: boolean;

  /** 诊断上下文 */
  context: ProposalContext;

  /** 当前状态 */
  status: ProposalStatus;

  /** 时间线 */
  timeline: ProposalTimeline;

  /** 争议记录 (中层拒绝或异议时填充) */
  dispute?: ProposalDispute;

  /** 审计日志 (所有状态变更) */
  auditLog: AuditEntry[];
}

/** 单条路径 */
export interface ProposalPath {
  /** 路径索引 (0-2) */
  index: number;

  /** 路径标签 (人话, 如 "激进扩张"、"稳健优化"、"最小改动") */
  label: string;

  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high';

  /** 预期影响 (人话描述, 如 "预计3个月内毛利率提升3-5个百分点") */
  expectedImpact: string;

  /** 权衡说明 (选择此路径的代价/副作用) */
  tradeoffs: string;

  /** 推荐理由 (为什么系统推荐/不推荐此路径) */
  recommendationReason: string;

  /** 是否为默认路径 (超时时自动选择) */
  isDefault: boolean;

  /** 该路径对应的 Goal 模板 (选中后自动填充) */
  goals: GoalTemplate[];

  /** 假设压力测试结果 */
  pressureTestResults: PressureTestResult[];
}

/** 诊断上下文 */
export interface ProposalContext {
  /** 根因摘要 (来自诊断报告) */
  rootCauseSummary: string;

  /** 关键证据引用 (诊断报告的 evidence refs) */
  keyEvidenceRefs: string[];

  /** 数据冲突说明 (诊断过程中发现的数据矛盾) */
  dataConflicts: string[];

  /** 置信度 (0-1, 诊断报告的综合置信度) */
  confidence: number;
}

/** 时间线 */
export interface ProposalTimeline {
  /** 提案生成时间 */
  proposedAt: string;

  /** 路径选择时间 (中层选择或系统自动) */
  selectedAt?: string;

  /** GA确认时间 */
  confirmedAt?: string;

  /** 超时过期时间 (proposedAt + 5工作日) */
  expiresAt: string;

  /** 最后提醒时间 */
  lastRemindedAt?: string;
}

/** 争议记录 */
export interface ProposalDispute {
  /** 是否存在争议 */
  disputed: boolean;

  /** 争议原因 (>=10字) */
  reason: string;

  /** 争议提出时间 */
  disputedAt: string;

  /** 关联的轻量级再诊断 ID */
  reDiagnosisRef?: string;

  /** 再诊断结果 */
  reDiagnosisResult?: string;

  /** 争议解决时间 */
  resolvedAt?: string;
}

/** 假设压力测试结果 */
export interface PressureTestResult {
  /** 测试类型 */
  type: 'data_audit' | 'risk_scan' | 'opportunity_scan' | 'assumption_stress';

  /** 通过/警告/失败 */
  result: 'pass' | 'warn' | 'fail';

  /** 评分 (0-100) */
  score: number;

  /** 详细发现 */
  details: string;

  /** 使用的 Tool ID */
  toolId: string;

  /** 执行时间 */
  executedAt: string;
}

/** Goal 模板 (路径→Goal 的字段映射) */
export interface GoalTemplate {
  goalTitle: string;
  successCriteria: string;
  metrics: GoalMetricTemplate[];
  estimatedDurationDays: number;
}

export interface GoalMetricTemplate {
  name: string;
  target: number;
  unit: string;
  /** 绑定到 哨兵 ID (如 sentinel-unit-economics) */
  sentinelId?: string;
  /** 绑定到 compute contract ID */
  computeId?: string;
  /** 绑定到 42边 edge ID */
  edgeId?: string;
}

/** 审计日志条目 */
export interface AuditEntry {
  timestamp: string;
  from: ProposalStatus;
  to: ProposalStatus;
  triggeredBy: 'system' | 'department_head' | 'ga' | 'expert';
  reason: string;
}

/** 提案状态 */
export type ProposalStatus =
  | 'draft'
  | 'pending_selection'
  | 'selected'
  | 'pending_ga_confirmation'
  | 'confirmed'
  | 'executing'
  | 'completed'
  | 'expired'
  | 'disputed'
  | 'regenerating'
  | 'ga_rejected';
```

---

## 三、Proposal 状态机 (11 态)

```
                    +---------+
                    |  draft  |  <-- 诊断报告生成后, ExpertDispatcher 填充3条路径
                    +----+----+
                         | 路径填充完成 + 压力测试通过
                         v
               +------------------+
               | pending_selection|  <-- 等待中层选择
               +----+----+--------+
                    |    |
         中层选择路径|    | 超时 (5工作日)
                    |    | 系统自动选 isDefault=true 路径
                    |    v
                    |  +---------+
                    |  | expired |  <-- 终态, 不生成Goal, 记录审计
                    |  +---------+
                    v
               +----------+
               | selected |  <-- 中层已选择路径
               +----+-----+
                    | GA确认流程触发
                    v
          +----------------------+
          |pending_ga_confirmation| <-- 等待GA确认
          +--+--------+----------+
             |        |
       GA确认|        | GA拒绝
             |        v
             |  +-------------+
             |  | ga_rejected | <-- GA驳回, 附原因 -> 返回 pending_selection 或触发再诊断
             |  +-------------+
             v
        +-----------+
        | confirmed | <-- GA确认, 生成Goal
        +-----+-----+
              | Goal 创建成功, 哨兵注册
              v
        +-----------+
        | executing | <-- Goal 执行中
        +--+---+----+
           |   |
   Goal完成|   | 中层发起变更/异议
           |   v
           | +----------+
           | | disputed | <-- 中层不满意当前路径
           | +----+-----+
           |      | 触发轻量级再诊断
           |      v
           | +---------------+
           | | regenerating  | <-- 重新生成路径 (<=2次变更)
           | +-------+-------+
           |         | 新路径生成
           |         | 回到 pending_selection
           |         +--------------+
           v                        |
        +-----------+               |
        | completed | <-- 终态      |
        +-----------+               |
                                    v
                          +------------------+
                          | pending_selection| (重新选择)
                          +------------------+
```

### 3.1 状态转换表

| 来源 | 目标 | 触发事件 | 验证条件 | 异常处理 |
|------|------|---------|---------|---------|
| draft | pending_selection | 3条路径填充完成 + 4项压力测试全部执行 | paths.length = 3, 每条path.pressureTestResults.length = 4, 1条isDefault=true | 路径不足3条->不转换, 记录log.error; 压力测试未完成->标注warn, 仍可转换 |
| pending_selection | selected | 中层显式选择路径 (selectedPathIndex 0-2) | selectedPathIndex in {0,1,2} | 无效索引->拒绝, 返回400 |
| pending_selection | expired | 当前时间 > timeline.expiresAt | proposedAt + 5工作日 < now | 自动选isDefault=true路径, auditLog记录"默认选型" |
| selected | pending_ga_confirmation | 系统自动触发GA确认流程 | confirmedByGa = false | GA不可用->降级: 48小时后重试, 3次失败->自动通过(标注"GA不可用") |
| pending_ga_confirmation | confirmed | GA确认 (confirmedByGa=true) | GA身份验证通过 | GA未响应72h->自动通过 (同上降级逻辑) |
| pending_ga_confirmation | ga_rejected | GA主动拒绝 + 附原因 | reason字段非空 + >=10字 | 原因<10字->拒绝无效, 要求补充 |
| confirmed | executing | Goal创建成功 + 方案哨兵注册成功 | Goal.id 存在 + sentinel registry 中 goal-{goalId}- 前缀哨兵存在 | Goal创建失败->回滚至confirmed, 重试(最多3次); 哨兵注册失败->Goal仍创建, 标记degraded |
| executing | completed | 所有关联Goal状态=completed | 所有Goal的status均为completed | 部分Goal未完成->不转换; 挂起Goal超过预期时长200%->触发GA审查 |
| executing | disputed | 中层提出异议 + reason >=10字 | dispute.disputed = true, reason非空 | 变更次数>=3->拒绝disputed, 强制GA介入 |
| disputed | regenerating | 轻量级再诊断触发 | reDiagnosisRef非空 | 再诊断超时(5分钟)->使用缓存结果, 标记degraded |
| regenerating | pending_selection | 新路径生成 + 压力测试重新执行 | 新paths填充完成 | 新路径与旧路径完全相同->记录warn, 继续 |
| executing | regenerating | 中层发起变更(<=2次) | selectedPathIndex != 当前, 变更次数<=2 | 变更次数=3->不进入regenerating, 强制GA最终裁决 |
| ga_rejected | pending_selection | GA拒绝后系统重新生成路径 | GA拒绝原因作为输入参数传给路径生成 | -- |

### 3.2 终态规则

- **expired**: 不可逆。不生成 Goal。系统记录审计日志"超时未选择，提案已过期"。
- **completed**: 不可逆。关联 Goal 全部完成。Proposal 归档。
- **ga_rejected**: 非终态，可转回 pending_selection。

---

## 四、非理想路径

### 4.1 超时处理 (中层不选择)

```
Proposal 进入 pending_selection
|-- T+0: 推送通知给中层 (P1 级别)
|-- T+2工作日: 提醒 (P1)
|-- T+4工作日: 最后提醒 (P0)
+-- T+5工作日: 超时 -> expired
    |-- 系统自动选择 isDefault=true 的路径 (即 riskLevel 最低的路径)
    |-- auditLog 记录: { triggeredBy: "system", reason: "默认选型 -- 中层5工作日未响应" }
    |-- 状态 -> expired (而非 selected)
    +-- 通知 GA: "Proposal {id} 已超时自动选型，请关注"
```

**为何 expired 而不是 selected？** 因为这不是中层的主动选择。expired 标记区分"中层选择了最低风险路径"和"中层没选，系统替你选了"。前者的 Goal 实施过程中中层有心理所有权，后者没有。这个标记影响后续 Goal 执行时的责任归属和哨兵告警的升级对象。

### 4.2 路径变更 (中层反悔)

```
中层发起变更请求
|-- 变更次数判断:
|   |-- 第1次: 直接进入 regenerating 状态
|   |   |-- 轻量级再诊断 (1专家 + 3-5边 + 5分钟超时)
|   |   |-- 生成新3条路径 (基于再诊断结果 + 原诊断上下文)
|   |   +-- 回 pending_selection -> 中层重新选择
|   |-- 第2次: 再次 regenerating, 但增加GA告知
|   |   +-- auditLog: "第2次路径变更, 已通知GA"
|   +-- 第3次: 拒绝变更
|       |-- 状态 -> 强制回归当前 executing 路径
|       |-- 触发GA最终裁决 (GA决定是否接受第3次变更)
|       +-- auditLog: "第3次变更被系统拒绝, 等待GA裁决"
```

**为何上限2次？** 无限变更 = 永远不执行。2次是"允许修正但防止无限循环"的平衡点。3次触发GA介入，因为此时已经不是路径选择问题，而是中层与诊断结论的根本性冲突。

### 4.3 遗忘检测 (中层不关注)

```
Proposal 进入 pending_selection / executing
|-- 7天无任何信号 (无选择、无查询、无Goal进度更新)
|   +-- 系统推送提醒: "Proposal {id} 已7天无活动，请确认是否继续"
|-- 再过7天 (累计14天)
|   +-- 通知GA: "Proposal {id} 已14天无活动，中层 {name} 未响应"
|   +-- GA可选操作:
|       |-- 推动中层行动
|       |-- 指定其他负责人
|       +-- 取消 Proposal (-> expired)
```

**实现**: `proposal-forgotten-check` 哨兵 (category=growth, priority=P2, cron="0 9 * * *"), 扫描所有 status in (pending_selection, executing) 且 lastRemindedAt 为空或距今>7天的Proposal。

### 4.4 中层拒绝 (异议路径)

```
中层认为所有3条路径都不合理
|-- 提出异议: proposal.dispute = { disputed: true, reason: "...", disputedAt: now }
|   验证: reason.length >= 10 (不足->拒绝, 要求补充)
|-- 状态 -> disputed
|-- 触发轻量级再诊断:
|   |-- 输入: dispute.reason + originalContext + 被拒绝的3条路径
|   |-- 范围: 1位专家 (action专家) + 3-5条因果边
|   |-- 超时: 5分钟
|   +-- 输出: GoalAdjustmentProposal (补充意见)
|-- 重新生成3条路径 (基于补充意见)
|-- 回 pending_selection -> 中层重新选择
|   |-- 中层接受 -> 正常流转
|   +-- 中层再次拒绝 -> 持续循环
|       |-- 第2次拒绝: 仍进入disputed, 再诊断范围扩展 (2位专家)
|       +-- 第3次拒绝: GA最终裁决
|           |-- GA选择"就按这条路执行" -> 强制 selected
|           +-- GA选择"取消此Proposal" -> expired
```

**关键约束**: 拒绝必须附理由 (`>=10字`)，防止"我就是不同意"式无意义的否决。reason 字段的值会作为轻量级再诊断的输入，让再诊断有针对性。

---

## 五、假设压力测试 (4项)

每条路径在从 draft -> pending_selection 转换之前，必须执行4项假设压力测试。每项测试对应一个独立的 Tool。

### 5.1 数据审计 (T-ACQUIRE-EDGE-DATA)

| 项目 | 内容 |
|------|------|
| Tool ID | `T-ACQUIRE-EDGE-DATA` |
| 检查内容 | 遍历路径中所有 goals -> metrics -> edgeId/computeId/sentinelId 引用，确认引用的 measurement.sourceId 在42边、compute 函数、或哨兵 adapter 中真实存在 |
| 通过条件 | 所有引用均可解析到真实数据源 |
| 失败处理 | score < 60 -> 路径不可进入 pending_selection，标注"数据源缺失" |
| 警告处理 | score 60-80 -> 标注 warn，路径可用但标注"部分数据源未验证" |
| 输出 | PressureTestResult { type: 'data_audit', result: 'pass'/'warn'/'fail', score: 0-100 } |

### 5.2 风险扫描 (基于42边因果体系)

| 项目 | 内容 |
|------|------|
| Tool ID | `T-SCAN-CROSS-DIMENSION-RISK` |
| 检查内容 | 检视所选路径涉及的维度 (如 finance / marketing / org)，在42边因果图中检查：选中路径的执行是否会恶化其他维度的核心指标 |
| 通过条件 | 无跨维度 P0 级风险 |
| 失败处理 | 检测到跨维度 P0 风险 -> fail，路径标注"可能引发X维度恶化" |
| 输出 | PressureTestResult { type: 'risk_scan', result, score, details: "E-13->FC恶化可能波及E-23->运营效率" } |

### 5.3 机会扫描 (T-QUERY-KNOWLEDGE)

| 项目 | 内容 |
|------|------|
| Tool ID | `T-QUERY-KNOWLEDGE` |
| 检查内容 | 检索 PKB (行业知识基座) 中同行业、类似场景的执行方案。返回匹配的案例、成功率、常见陷阱 |
| 通过条件 | 至少有1个相似案例参考 (不计分数) |
| 失败处理 | 零案例 -> 不影响路径可用性，score 仍基于数据计算，但标注"缺乏行业参照" |
| 输出 | PressureTestResult { type: 'opportunity_scan', result: 'pass', score, details: "匹配3个案例, 平均成功率72%" } |

### 5.4 假设压力测试 (ExternalBaseline)

| 项目 | 内容 |
|------|------|
| Tool ID | `T-STRESS-TEST-ASSUMPTIONS` |
| 检查内容 | 提取路径中每个 Goal 的核心假设（如"客户转化率提升5%"），与 ExternalBaseline 数据库中的行业基准对比。偏差超过2sigma->标记 |
| 通过条件 | 核心假设在行业基准 +/- 2sigma 范围内 |
| 失败处理 | 任一核心假设超出 +/- 2sigma -> warn (不阻断, 但强标注) |
| 输出 | PressureTestResult { type: 'assumption_stress', result: 'warn', score: 55, details: "客户转化率假设(5%)超出行业基准(1.8%+/-1.2%), 2.3sigma偏离" } |

---

## 六、Proposal -> Goal 转换接口

```typescript
/**
 * Proposal -> Goal 转换器
 *
 * 当中层选择路径 + GA确认后，Proposal 自动转换为可执行的 Goal。
 * 映射规则: Proposal.selectedPath.goals[] -> Goal[]
 */
export interface ProposalToGoalConverter {
  /**
   * 从已确认的 Proposal 生成 Goal 列表
   *
   * @param proposal — 状态为 confirmed 的 Proposal
   * @returns 生成的 Goal 数组
   * @throws ProposalNotConfirmedError — proposal.status !== 'confirmed'
   */
  convert(proposal: Proposal): Goal[];

  /**
   * 字段级映射表 (ProposalPath.goalTemplate -> Goal 字段)
   *
   * Proposal字段          -> Goal字段              -> 备注
   * goalTitle             -> title                 直接映射
   * successCriteria       -> successCriteria       直接映射
   * metrics[].name        -> metrics[].name        直接映射
   * metrics[].target      -> metrics[].target      直接映射
   * metrics[].sentinelId  -> measurement.sourceId  绑定方案级哨兵
   * metrics[].computeId   -> measurement.sourceId  绑定 compute contract
   * metrics[].edgeId      -> measurement.sourceId  绑定42边参数
   * estimatedDurationDays -> timeline.deadline     计算: confirmedAt + days
   * (自动)                -> dependsOn[]           基于42边因果图自动推导
   * (自动)                -> conflictsWith[]       基于42边冲突检测自动填充
   */
  fieldMapping: Record<string, string>;
}
```

### 6.1 转换时机

```
Proposal.status = confirmed
    |
    v
ProposalToGoalConverter.convert(proposal)
    |
    v
对每个 Goal:
  1. 生成 UUID -> Goal.id
  2. 设置 Goal.department = proposal.department
  3. 设置 Goal.sourceProposalId = proposal.id
  4. 设置 Goal.sourceDiagnosisId = proposal.diagnosisReportId
  5. 基于42边因果图自动填充 dependsOn / conflictsWith
  6. 持久化到 store/goal-store.ts
    |
    v
所有 Goal 创建成功后
    |
    v
Proposal.status -> executing
    |
    v
注册方案级哨兵 (每 Goal 1 哨兵, 命名空间 "goal-{goalId}-")
```

### 6.2 自动依赖推导

基于42边因果体系，系统自动推导 Goal 之间的依赖关系：

```
例: Proposal 生成3个Goal:
  Goal-A: 降低固定成本占比 (绑定 E-13 CAPITAL_ALLOCATION)
  Goal-B: 提高运营效率 (绑定 E-23 OPERATIONAL_EXECUTION)
  Goal-C: 增加客户留存 (绑定 E-31 CLIENT_RETENTION)

系统查询42边:
  E-13 -> E-23: 资本配置影响运营执行 (存在因果边)
  -> Goal-A.dependsOn = [] (无前置依赖)
  -> Goal-B.dependsOn = [Goal-A.id] (运营效率依赖资本配置优化)
  -> Goal-C.conflictsWith = [Goal-A.id] (短期内压固定成本可能影响客户留存投入)
```

---

## 七、Proposal API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/proposals` | 列出部门的所有 Proposal |
| GET | `/api/proposals/:id` | 获取 Proposal 详情 (含路径+压力测试) |
| POST | `/api/proposals/:id/select` | 中层选择路径 { pathIndex: 0/1/2 } |
| POST | `/api/proposals/:id/dispute` | 中层提出异议 { reason: ">=10字" } |
| POST | `/api/proposals/:id/change` | 中层发起路径变更 |
| POST | `/api/proposals/:id/ga-confirm` | GA确认 (需GA权限) |
| POST | `/api/proposals/:id/ga-reject` | GA拒绝 { reason: "..." } (需GA权限) |
| GET | `/api/proposals/:id/audit-log` | 获取审计日志 |

---

## 八、数据源映射汇总

| Proposal 字段 | 数据来源 | 查询方式 |
|--------------|---------|---------|
| diagnosisReportId | DiagnosisReport.id | store/diagnosis-store.ts |
| context.rootCauseSummary | DiagnosisReport.rootCauseAnalysis | 诊断报告 |
| context.keyEvidenceRefs | DiagnosisReport.evidence[] | 诊断报告 |
| context.confidence | DiagnosisReport.confidence | 诊断报告 |
| paths[].pressureTestResults | 4个Tool (数据审计/风险扫描/机会扫描/假设压力) | Tools 注册表 |
| paths[].goals[].sentinelId | SentinelRegistry.get(id) | 哨兵注册表 |
| paths[].goals[].computeId | ModuleRegistry.get(id) | Compute 注册表 |
| paths[].goals[].edgeId | GraphBridge.getEdge(id) | 42边因果图 |
| dependsOn/conflictsWith (Goal) | GraphBridge 因果关系推导 | 42边因果图遍历 |

---

## 九、与其他系统的集成点

| 集成系统 | 集成方式 | 数据方向 |
|---------|---------|---------|
| 诊断系统 (diagnosis-orchestrator) | DiagnosisReport -> Proposal 创建 | 入 |
| 哨兵系统 (SentinelRegistry) | Proposal 压力测试引用哨兵数据; Goal 执行时注册方案级哨兵 | 双向 |
| 42边因果图 (GraphBridge) | 风险扫描 + 自动依赖推导 | 读 |
| GA (SubAgentCoordinator) | 确认/拒绝/裁决 推送通知 | 出 |
| PKB (知识基座) | T-QUERY-KNOWLEDGE 检索 | 读 |
| ExternalBaseline (外部基准) | T-STRESS-TEST-ASSUMPTIONS 比对 | 读 |
| Goal 管理 (goal-store) | Proposal -> Goal 转换 | 出 |

---

*文档版本: v1.0 | 最后更新: 2026-07-14 | 作者: Synova 工程团队*
*下一章: [第三章 方案级哨兵系统](./SYNOVA-RESEARCH-第三章-方案级哨兵系统-v1-0-20260714.md)*
