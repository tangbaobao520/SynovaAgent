# 第五章：与现有体系对齐

> 权威文档02 — 方向有效性监测引擎 | v1.0 | 2026-07-22
> 本章回答：02引擎消费哪些现有系统的数据、新增哪些代码模块、MVS阶段简化到什么程度

---

## 一、消费文档01 — 42条因果边P0级边参数

### 1.1 消费清单

文档01（`权威文档01-本体层因果体系权威规范-20260714/`）是02引擎的数据地基。02消费文档01的以下内容：

| 消费项 | 文档01章节 | 02使用场景 | 数据路径 |
|--------|----------|----------|---------|
| P0级边参数时间序列 | 第二章 42条因果边定义 | 趋势偏离检测：维护12个月移动平均基线 | `EdgeRegistry.get('E-23').paramHistory` |
| E-03 EXTERNAL_ECHO | 第二章 E-03 | 相对偏离检测的行业基准、否认检测的行业数据验证 | `E-03.market_growth_j`, `E-03.baseline_growth_j` |
| E-01~E-04感知边参数 | 第二章 E-01~E-04 | 休眠信号激活条件：2sigma跳变检测 | `E-01.scan_frequency`, `E-02.signal_pool`, `E-03.env_rent`, `E-04.perception_accuracy` |
| E-05 CAPITAL_ACQUISITION | 第二章 E-05 | 背水一战场景判断：现金跑道 < 12个月 | `E-05.cash_runway_months` |
| E-23 EFFICIENCY_RATE | 第二章 E-23 | NCI成本断裂度的企业内部效率基准 | `E-23.efficiency_rate` |
| E-28 DEPLOYS | 第二章 E-28 | ODC执行动量计算 | `E-28.deployment_period` |
| E-34 COST_STRUCTURE | 第二章 E-34 | NCI成本断裂度的行业成本基准 | `E-34.fixed_cost_ratio`, `E-34.variable_cost_ratio` |
| E-37 PROFIT_REINVEST | 第二章 E-37 | 长期验证归因分解的ROI变化 | `E-37.retention_ratio` x 利润 |
| E-38 ASSET_LOCKS | 第二章 E-38 | NCI价值网络错配度、ODC结构冗余度 | `E-38.asset_second_life_ratio` |
| Person/DATA节点池 | 第三章 15节点池 | ODC人才密度+数据就绪度 | `Person.competency_vector`, `DATA.completeness` |

### 1.2 接口契约

02不直接查询GraphStore。通过EdgeRegistry的getter方法消费边参数：

```typescript
// 02消费文档01的同步约定
interface EdgeParamConsumer {
  /** 从EdgeRegistry获取P0边的最新参数 */
  getEdgeParam(edgeId: string): Promise<EdgeParamSnapshot>;

  /** 获取P0边的12个月参数历史（用于基线计算） */
  getEdgeParamHistory(
    edgeId: string,
    months: number  // 默认 12
  ): Promise<EdgeParamSnapshot[]>;

  /** 订阅P0边参数变更（用于实时趋势检测） */
  subscribeToEdgeParam(
    edgeId: string,
    callback: (snapshot: EdgeParamSnapshot) => void
  ): Subscription;
}
```

---

## 二、消费文档03 — 哨兵Finding + 诊断周期定义 + 诊断历史

### 2.1 消费清单

文档03（哨兵+诊断系统）是02引擎的信号来源和诊断触发目标。

| 消费项 | 文档03章节/路径 | 02使用场景 | 数据路径 |
|--------|--------------|----------|---------|
| 哨兵Finding信号池 | SentinelRunner | 沉默检测：扫描Finding主题，查找90天内是否有讨论匹配 | `SentinelRegistry.getFindings({ timeRange: [90天前, 现在] })` |
| Findings的topic标签 | SentinelFinding.topic | 沉默检测的语义匹配基础 | `finding.topic` |
| 诊断周期定义 | CronScheduler + DiagnosisOrchestrator | 方向失效评估：偏离持续超过2个诊断周期→方向失效 | `DiagnosisOrchestrator.getDiagnosisCycleId()` |
| 诊断历史 | DiagnosisReport归档 | 验证断裂检测：查询同周期内完成的Goal追溯回诊断报告 | `DiagnosisStore.getReportsInCycle(cycleId)` |
| 诊断报告的actionRecommendations | StandardExpertReport | 知行差距检测：追溯Goal来源诊断报告的原始建议指标 | `report.actionRecommendations[].expectedImpact` |

### 2.2 诊断周期引用

方向失效评估的核心条件"偏离持续超过2个诊断周期"——此处的"诊断周期"直接引用文档03的默认值14天（文档07 §B1.2 设计决策：诊断循环默认14天）。

```typescript
// 02引擎引用文档03的诊断周期
const DIAGNOSIS_CYCLE_DAYS = 14;  // 来源：权威文档07 §B1.2 + 权威文档03 CronScheduler
const DIRECTION_FAILURE_CONSECUTIVE_CYCLES = 2;  // 偏离持续2个周期→方向失效
```

### 2.3 触发03诊断时的回传信息

当02确认方向失效并触发03诊断时，通过`DirectionFailureTriggerEvent.constraint`（定义于第四章 §1.1）传递以下信息回03：
- 已偏离的因果边ID列表（`deviatedEdges`）
- 已偏离的子循环ID列表（`deviatedSubCycles`）
- 各偏离边的当前sigma值
- 断裂点触发类型 + 映射的失效模式
- NCI评分（如果已计算）

---

## 三、消费文档07 — 中层行为数据 + 循环时间尺度

### 3.1 消费清单

文档07（`权威文档07-Agent工程能力对标-20260710/`）提供中层行为数据和循环时间尺度。

| 消费项 | 文档07章节 | 02使用场景 | 数据路径 |
|--------|----------|----------|---------|
| 部门工作台讨论行为 | B1.3 部门导航循环 | 沉默检测：扫描Goal讨论记录、Proposal讨论、告警响应记录 | `DepartmentWorkspace.activeGoals[].deviationStatus`, `Proposal.auditLog`, `WorkspaceAlert.responseHistory` |
| 方案评估闭环 | B1.3 方案评估闭环 | 否认检测：中层对异常信号的归因方向（内部/外部/mixed） | 方案评估报告的风险分析段落 |
| 日常咨询闭环 | B1.3 日常咨询闭环 | 沉默检测和否认检测：自然语言提问中是否提及异常信号的话题 | 咨询问答记录的主题标签 |
| 告警响应闭环 | B1.3 告警响应闭环 | 沉默检测：中层对告警的处置记录（确认/误报/升级） | `WorkspaceAlert.resolution`, `WorkspaceAlert.resolvedBy` |
| 诊断循环默认14天 | B1.2 设计决策 | 方向失效评估的诊断周期基准 | `CronScheduler.defaultInterval = 14天` |
| 哨兵升级触发诊断 | B1.2 触发条件 | 方向监测独立于诊断循环运行，哨兵升级属于03的触发条件，02不消费 | — |
| 五循环架构 | B1 出厂内置Loop Engineering | NCI循环作为第八个循环加入调度 | NCI优先级：溢出监控 > NCI > 知识积累 |

### 3.2 循环时间尺度引用

02引擎的各功能循环按以下时间尺度运行，所有基准值引用文档07和文档03的定义：

| 02循环 | 运行频率 | 基准来源 |
|--------|---------|---------|
| 方向锚定更新 | 每日 | 消费文档13 Goal.timeline + Goal.lifecycle变更事件 |
| 趋势偏离检测 | 每月（与月度数据对齐） | 消费文档01的P0边参数月度快照 |
| 方向失效评估 | 每诊断周期（14天） | 引用文档03的诊断周期定义 |
| 感知断裂点检测 | 每诊断周期（14天） | 沉默/否认/知行差距/验证断裂 |
| NCI循环 | 按需（方向失效+企业确认） | 不设定时触发 |
| 方向切换过渡期监测 | 每日（过渡期90天） | 放宽阈值2.5sigma |

### 3.3 与文档07 AGENTS.md铁律清单的对齐

文档07 §AGENTS.md包含25项已知错误清单。02引擎在设计时已规避以下相关项：

| 铁律编号 | 内容 | 02的对齐措施 |
|---------|------|-------------|
| 铁律47 契约优先 | 新增compute函数必须先定义输入/输出/降级契约 | 第四章全部接口使用JSDoc注释 `@contract 铁律47` |
| 铁律48 测试不可为空壳 | 测试文件必须有expect()断言 | 二-四章每章§测试规范标注L1/L2a/L2c + fixture类型 |
| 铁律4 接线审计 | 新export必须在生产入口有引用 | 二-四章每章§接线要求列出每个新export的调用方文件路径+函数名 |
| 铁律11 静默降级禁止 | catch必须log.warn/error + 返回degraded:true | 所有接口返回类型含 `degraded: boolean` |
| 铁律38 as any零容忍 | as any=0 | 所有TypeScript接口使用具体类型 |
| 铁律39 五层架构边界 | 每层只与相邻层通信 | 02接口层级标注 @layer L1/L2/L3 |

---

## 四、消费文档13 — Goal追踪 + 闭环验证 + 资源分配

### 4.1 消费清单

文档13（`权威文档13-增长导航系统工程规范-20260714/`）是02方向锚定的核心数据源。

| 消费项 | 文档13章节 | 02使用场景 | 数据路径 |
|--------|----------|----------|---------|
| Goal完整28字段接口 | 第一章 Goal TypeScript接口 | 方向锚定：活跃Goal集合 + 资源分配分布 | `Goal.id`, `Goal.type`, `Goal.department`, `Goal.priority`, `Goal.timeline.proposedAt` |
| Goal资源分配 | 第一章 metrics字段 | 方向锚定：每个Goal的资源分配（预算占比+工时分配） | `Goal.metrics[].measurement.sourceId` |
| Goal生命周期 | 第一章 lifecycle字段 | 知行差距检测：Goal停顿/完成/暂停 | `Goal.lifecycle` 状态机 |
| Goal闭环验证 | 第一章 successCriteria + source | 知行差距子模式B：Goal完成但无效检测 | `Goal.successCriteria.metric.comparator`, `Goal.source.diagnosisReportId` |
| Proposal三选一 | 第二章 Proposal TypeScript接口 | NCI候选方向→Proposal转换 | `Proposal.paths[3]`, `Proposal.confirmedByGa`, `Proposal.status` |
| Proposal→Goal映射 | 第二章 2.2节映射表 | NCI Proposal确认→Goal创建 | `Proposal.options[selected] → Goal` |
| 方案级哨兵 | 第三章 GoalSentinelManifest | 知行差距子模式A：Goal停顿检测 | `GoalSentinelManifest.deviationModel`, `GoalSentinelManifest.goalId` |
| 方案级哨兵偏离检测 | 第三章 deviationModel | Goal停顿检测的零进展判断 | `deviationModel.threshold.tolerance`, `deviationModel.trend.windowSize` |
| 中层工作台数据模型 | 第四章 DepartmentWorkspace | 方向锚定的资源分配分布可视化 | `DepartmentWorkspace.activeGoals[].ResourceAllocation` |
| 导航循环在五循环中的位置 | 第五章 1.2节 | 02→03→13的增长导航闭环 | 诊断→Proposal→Goal→追踪→偏离→调整 |

### 4.2 方向锚定的数据需求清单

以下数据需求清单由02定义，由文档13实现：

```typescript
/**
 * 方向锚定数据需求清单 — 02定义，文档13提供
 *
 * @contract 铁律47: 每个字段标注来源文档+章节+数据路径
 */
interface DirectionAnchorDataRequest {
  /** 当前活跃Goal列表 */
  activeGoals: {
    goalId: string;        // Goal.id (文档13 §1)
    type: GoalType;        // Goal.type (文档13 §1)
    department: string;    // Goal.department (文档13 §1)
    priority: string;      // Goal.priority (文档13 §1)
    createdAt: string;     // Goal.timeline.proposedAt (文档13 §1)
    /** 资源分配 */
    resourceAllocation: {
      budgetRatio: number;  // 该Goal预算占总预算比例
      laborHours: number;   // 该Goal分配的工时
    };
  }[];

  /** 资源配置快照（定期保存，用于对比变化） */
  resourceSnapshots: {
    capturedAt: string;
    allocationMap: Record<string, {   // key=department
      goals: { [goalId: string]: number };  // goalId -> budgetRatio
    }>;
  }[];

  /** 方向变更历史 */
  directionChangeHistory: {
    changedAt: string;
    previousGoalIds: string[];
    newGoalIds: string[];
    changeReason: string;  // 诊断结论摘要
  }[];
}
```

---

## 五、消费文档15 — 溢出趋势数据 + 跨时间尺度交叉验证

### 5.1 消费清单

文档15（`权威文档15-企业循环溢出导航系统-20260714/`）提供子循环溢出数据用于交叉验证。

| 消费项 | 文档15章节 | 02使用场景 | 数据路径 |
|--------|----------|----------|---------|
| 子循环溢出趋势 | 第二章 溢出仪表盘动态生成 | 验证断裂检测Step 3：溢出趋势交叉验证 | `OverflowEngine.getDirectionTrend(directionId, window='6_months')` |
| 跨时间尺度交叉验证 | 第四章 溢出驱动的顶层Loop Engineering | 验证断裂检测：溢出持续为负 + Goal多次无效 → 方向失效置信度+0.05 | `OverflowEngine.crossTimescaleValidation(subCycleId)` |
| 子循环动态注册框架 | 第一章 循环配置JSON Schema | 方向锚定的子循环识别：企业当前活跃的子循环列表 | `CycleRegistry.getActiveCycles(enterpriseId)` |
| 循环配置的edges映射 | 第一章 循环配置JSON edges字段 | 方向失效评估：偏离的因果边→对应的子循环 | `cycleConfig.edges[valveType]` 映射到42边ID |
| 溢出公式参数溯源 | 第一章 overflowParams | 趋势偏离检测：子循环溢出的组成参数 | `cycleConfig.overflowParams[].sourceId` |
| 跨循环传导 | 第一章 crossCyclePropagation | 方向失效评估：一个子循环溢出为负时，检查传导的目标子循环 | `cycleConfig.crossCyclePropagation.estimatedLag` |
| 数据成熟度 | 第一章 dataMaturity | 方向锚定的基线初始化：数据成熟度阶段决定基线窗口 | `cycleConfig.dataMaturity.maturityStages` |

### 5.2 NCI循环与溢出监控循环的唯一耦合点

```typescript
/**
 * NCI循环与溢出监控循环的唯一耦合点
 *
 * 来源：研究方案 v3.0 第四节
 * 实现位置：src/cron/nci-scheduler.ts
 */
interface NCICycleCouplingWithOverflow {
  /** 触发条件 */
  trigger: {
    /** 溢出监控检测到子循环溢出持续为负 */
    negativeOverflowDetected: boolean;
    /** 持续的周期数 */
    consecutiveNegativeCycles: number;  // >= 2
    /** 触发的子循环ID */
    subCycleId: string;
  };

  /** 动作 */
  action: {
    /** 自动触发NCI评估 */
    triggerNCI: boolean;
    /** NCI评估的范围 */
    nciScope: 'single_cycle';          // 该子循环是否应被放弃
    /** 携带的上下文 */
    context: {
      subCycleId: string;
      overflowScoreHistory: number[];  // 最近N个周期的溢出值
      subCycleConfig: CycleConfig;     // 文档15的循环配置
    };
  };
}
```

---

## 六、NCI已有代码和文档的迁移路径

### 6.1 NCI已有研究文档映射

以下NCI研究文档已存在。本章第三章（NCI子模块）是对这些研究的工程化整合。迁移路径是"研究 → 02引擎子模块集成"，不涉及文档修改。

| NCI已有文档 | 文件路径 | 迁移到02引擎的位置 | 迁移方式 |
|------------|---------|-------------------|---------|
| NCI非共识检测白皮书 | `docs/synova/research/nci/SYNOVA-WHITEPAPER-NCI非共识检测白皮书-20260705.html` | 第三章 §1 NCI三层公式 + §1.6两种非共识类型 | 公式直接引用，不重新推导 |
| 五路研究汇合报告 | `docs/synova/research/nci/SYNOVA-RESEARCH-NCI五路研究汇合报告-20260705.html` | 第三章 §0.1 NCI已有研究路径 + 各节能力边界声明 | 研究方法论引用，对抗性边界条件引用 |
| STM时机成熟度指数 | `docs/synova/research/nci/STM_INDEX_时机成熟度指数-20260704.html` | 第三章 §2 STM_Index公式 + 10项基础设施权重矩阵 | 公式+权重矩阵直接引用，AUC=0.87验证引用 |
| ODC消化能力研究 | `docs/synova/research/nci/RESEARCH-ODC-LastStand-20260704.html` | 第三章 §6 ODC资源约束过滤器 + 背水一战场景 | ODC四维公式直接引用 |
| 对抗性验证报告 | `docs/synova/research/nci/NCI-对抗性验证报告-Epsilon-20260704.html` | 第三章各节的对抗性边界条件 | 边界案例引用，消融验证引用 |
| 沉默动力学研究 | `docs/synova/research/nci/RESEARCH-Silence-Alpha-20260704.html` | 第二章 §二 沉默检测（前置过滤） | 沉默五因分类器嵌入第二章的沉默检测逻辑 |

### 6.2 已有NCI代码迁移（如存在）

如果在 `src/l3/nci/` 或 `packages/engine-core/` 中已有部分NCI代码实现，迁移策略如下：

```typescript
/**
 * NCI代码迁移检查清单
 *
 * 以下文件路径如果存在，需逐一检查是否需要迁移/重构/删除。
 * greps: grep -rn "nci\|NCI\|nonConsensus\|NonConsensus" src/ packages/engine-core/src/
 */
interface NCICodeMigrationPlan {
  /** 如果存在已有NCI实现，迁移到新接口 */
  existingToRefactor: {
    /** 旧NCI计算逻辑 */
    nciComputeOld?: string;       // 路径待确认
    /** 新接口 */
    nciComputeNew: 'src/l3/nci/nci-engine.ts';  // 第三章 §1
  };

  /** 如果存在已有STM计算 */
  stmExisting?: string;
  stmNew: 'src/l3/nci/stm-index.ts';  // 第三章 §2

  /** 如果存在已有ODC计算 */
  odcExisting?: string;
  odcNew: 'src/l3/nci/odc-filter.ts';  // 第三章 §6

  /** 向后兼容：旧接口保留到02引擎V2，标注deprecated */
  backwardCompatibility: {
    deprecatedInterfaces: string[];
    sunsetTimeline: '02引擎V2发布后移除';
    migrationGuide: 'docs/synova/research/权威文档02-方向有效性监测引擎-20260722/ 第三章';
  };
}
```

---

## 七、MVS简化范围标注

### 7.1 MVS包含的02功能

| 功能 | 是否纳入MVS | MVS简化策略 |
|------|-----------|-----------|
| **方向锚定** | 是 | 简化为"Goal集合 + 关键42边参数基线"。使用3个月初始化基线。 |
| **趋势偏离检测（绝对偏离）** | 是 | 仅P0级边（约10-15条），1.5sigma阈值，使用3个月移动平均基线 |
| **方向失效评估** | 是 | 简化为"偏离持续>=2个诊断周期→方向失效"。不使用四断裂点。 |
| 相对偏离检测（行业基准） | 否 | 需要ExternalBaseline数据积累，MVS阶段不启用 |
| 沉默检测 | 否 | 需要中层行为数据积累（>=90天的讨论记录），MVS阶段不启用 |
| 否认检测 | 否 | 需要行业基准数据+中层行为数据，MVS阶段不启用 |
| 知行差距检测 | 否 | 需要Goal方案哨兵数据积累（>=2-4周基线），MVS阶段降级为Goal超时提醒 |
| 验证断裂检测 | 否 | 需要>=3个已完成Goal的闭环验证数据，MVS阶段不启用 |
| **NCI子模块** | **否** | **MVS后第一个扩展目标**。三层公式+ODC+STM全面保留但只在方向失效确认后按需运行 |

### 7.2 MVS阶段的数据初始化路径

```typescript
/**
 * MVS阶段数据初始化路径
 *
 * 方向锚定+趋势偏离+方向失效评估的MVS最小集，
 * 使用3个月的初始化窗口建立基线。
 */
interface MVSInitialization {
  /** Phase 1: 数据积累（前3个月） */
  phase1: {
    duration: '3个月';
    actions: [
      '注册所有P0级边（文档01 E-05~E-09, E-13, E-23, E-30, E-37, E-38）',
      '注册当前活跃Goal（来自文档13，手动输入或从现有GoalStore读取）',
      '启动每日P0边参数快照采集',
      '启动每诊断周期（14天）的方向有效性评估（使用渐进基线）'
    ];
    /** 渐进基线：第一周期使用3周数据，每个周期增加，直到满12个月 */
    progressiveBaseline: {
      cycle1_to_4: 'min(当前积累月数, 3) 个月移动平均',
      cycle5_plus: '12个月移动平均',
    };
  };

  /** Phase 2: MVS运行（第4个月起） */
  phase2: {
    duration: '持续运行';
    capabilities: [
      '方向锚定：活跃Goal集合 + P0边参数',
      '趋势偏离检测：仅P0边（10-15条），1.5sigma',
      '方向失效评估：仅偏离持续>=2周期→方向失效'
    ];
    outputs: [
      '每诊断周期输出DirectionValidityResult',
      '方向失效→触发03缩量诊断（携带偏离边列表）'
    ];
  };
}
```

### 7.3 MVS到完整版的功能梯度

| 功能 | MVS | +2个月 | +4个月 | 完整版 |
|------|-----|--------|--------|--------|
| 方向锚定 | Goal集合+P0边 | +资源分配分布 | +创始人关注信号 | +方向变更历史 |
| 趋势偏离 | P0边绝对偏离 | +P1边绝对偏离 | +行业相对偏离 | 全42边 + 行业基准 |
| 方向失效评估 | 偏离>=2周期 | +沉默检测 | +知行差距检测 | +否认+验证断裂 |
| 感知断裂点 | — | 沉默检测 | 知行差距检测 | 全部四断裂点 |
| NCI | — | — | 数据真空模式 | 完整NCI三层+ODC+STM |

---

## 八、代码改动清单

### 8.1 新增源代码文件

以下为02引擎需要新增的源代码文件。每个文件对应第二章至第四章定义的功能模块。

```typescript
/**
 * 02引擎代码改动清单
 *
 * 格式: 文件路径 | 功能 | 来源章节 | 优先级
 */

// ═══ L3 洞察层 — 方向监测核心 ═══

/**
 * src/l3/direction-monitor/
 */
const l3Files = [
  {
    path: 'src/l3/direction-monitor/monitor.ts',
    module: 'DirectionMonitor — 方向有效性评估主引擎',
    source: '第一章 方向有效性监测引擎',
    exports: ['evaluateDirectionValidity()', 'DirectionValidityResult'],
    priority: 'P0',
  },
  {
    path: 'src/l3/direction-monitor/baseline.ts',
    module: 'BaselineManager — 12个月移动平均基线维护',
    source: '第一章 趋势偏离检测',
    exports: ['computeBaseline()', 'checkDeviation()', 'establishNewBaseline()'],
    priority: 'P0',
  },
  {
    path: 'src/l3/direction-monitor/fracture-detector.ts',
    module: 'FractureDetector — 四断裂点检测引擎',
    source: '第二章 四个感知断裂点检测',
    exports: [
      'detectSilence()', 'detectDenial()',
      'detectKnowingDoingGap()', 'detectValidationFracture()',
      'resolveFractureConflicts()', 'runAllFractureDetections()'
    ],
    priority: 'P1',
  },
  {
    path: 'src/l3/direction-monitor/transition-manager.ts',
    module: 'TransitionManager — 方向切换过渡期管理',
    source: '第四章 §五 方向切换过渡期',
    exports: ['manageDirectionTransition()', 'evaluateInTransition()'],
    priority: 'P1',
  },
  {
    path: 'src/l3/direction-monitor/types.ts',
    module: 'DirectionMonitor类型定义',
    source: '全部章节的类型接口',
    exports: [
      'DirectionValidityResult', 'FracturePointState',
      'DirectionFailureTriggerEvent', 'DiagnosisConstraint',
      'TransitionPeriod', 'DirectionAnchorDataRequest'
    ],
    priority: 'P0',
  },
];

// ═══ L3 洞察层 — NCI子模块 ═══

/**
 * src/l3/nci/
 */
const nciFiles = [
  {
    path: 'src/l3/nci/nci-engine.ts',
    module: 'NCIEngine — NCI三层计算引擎',
    source: '第三章 §1 NCI三层公式',
    exports: ['computeNCI()', 'computeNCIVacuum()', 'runNCI()'],
    priority: 'P2',   // NCI不纳入MVS
    migrationFrom: '如 src/l3/nci/ 下已有实现，重构至此',
  },
  {
    path: 'src/l3/nci/stm-index.ts',
    module: 'STMIndex — 时机成熟度指数',
    source: '第三章 §2 STM_Index',
    exports: ['computeSTMIndex()', 'computeUrgencyFactor()'],
    priority: 'P2',
    migrationFrom: '如已有STM实现，重构至此',
  },
  {
    path: 'src/l3/nci/dormant-signal.ts',
    module: 'DormantSignal — 休眠信号激活检测',
    source: '第三章 §4 休眠信号激活条件',
    exports: ['checkDormantSignalActivation()'],
    priority: 'P2',
  },
  {
    path: 'src/l3/nci/odc-filter.ts',
    module: 'ODCFilter — 组织消化能力过滤器',
    source: '第三章 §6 ODC资源约束过滤器',
    exports: ['computeODC()', 'applyODCFilter()', 'checkLastStandMode()'],
    priority: 'P2',
    migrationFrom: '如已有ODC实现，重构至此',
  },
  {
    path: 'src/l3/nci/attribution.ts',
    module: 'AttributionDecomposer — 长期验证归因分解',
    source: '第三章 §7 长期验证归因分解',
    exports: ['decomposeROIAttribution()'],
    priority: 'P2',
  },
];

// ═══ L2 编排层 — 接口适配 ═══

/**
 * src/agent/
 */
const l2Files = [
  {
    path: 'src/agent/direction-adapter.ts',
    module: 'DirectionAdapter — 02→03事件总线适配器',
    source: '第四章 §一 方向失效→触发03诊断',
    exports: ['emitDirectionFailure()', 'receiveDiagnosisAck()'],
    priority: 'P0',
  },
  {
    path: 'src/agent/nci-to-proposal-adapter.ts',
    module: 'NCIProposalAdapter — NCI候选→Proposal转换器',
    source: '第四章 §四 NCI候选方向→Proposal→Goal',
    exports: ['convertNCICandidatesToProposals()', 'createGoalFromNCIProposal()'],
    priority: 'P2',
  },
];

// ═══ L2 编排层 — 诊断编排器修改 ═══

/**
 * packages/engine-core/src/pipeline/diagnosis/
 */
const diagnosisModifications = [
  {
    path: 'packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator.ts',
    module: 'DiagnosisOrchestrator — 新增缩量诊断入口',
    source: '第四章 §二 03诊断编排器的接收接口',
    additions: ['receiveDirectionFailureTrigger()', 'runScopedDiagnosis()'],
    priority: 'P0',
  },
];

// ═══ Cron调度 ═══

/**
 * src/cron/
 */
const cronFiles = [
  {
    path: 'src/cron/nci-scheduler.ts',
    module: 'NCIScheduler — NCI循环调度',
    source: '第三章 §8 NCI循环调度优先级',
    exports: ['scheduleNCICycle()', 'NCICronJob'],
    priority: 'P2',
  },
];

// ═══ HTTP路由 ═══

/**
 * src/routes/
 */
const routeFiles = [
  {
    path: 'src/routes/direction.ts',
    module: 'DirectionRoutes — 02引擎对外HTTP端点',
    source: '第四章 §六 02引擎与主Agent的通信接口',
    exports: ['GET /api/direction/status', 'POST /api/direction/trigger', 'POST /api/direction/new-direction'],
    priority: 'P0',
  },
];

// ═══ 测试文件（与源代码并行创建） ═══

const testFiles = [
  {
    path: 'src/l3/direction-monitor/__tests__/monitor.test.ts',
    context: 'DirectionMonitor L1单元测试',
    tests: 8,
  },
  {
    path: 'src/l3/direction-monitor/__tests__/baseline.test.ts',
    context: 'BaselineManager L1单元测试',
    tests: 6,
  },
  {
    path: 'src/l3/direction-monitor/__tests__/fracture-detector.test.ts',
    context: 'FractureDetector L1单元测试',
    tests: 12,
  },
  {
    path: 'src/l3/direction-monitor/__tests__/fracture-detector.integration.test.ts',
    context: 'FractureDetector L2a集成测试',
    tests: 4,
  },
  {
    path: 'src/l3/nci/__tests__/nci-engine.test.ts',
    context: 'NCIEngine L1单元测试',
    tests: 10,
  },
  {
    path: 'src/l3/nci/__tests__/stm-index.test.ts',
    context: 'STMIndex L1单元测试',
    tests: 5,
  },
  {
    path: 'src/l3/nci/__tests__/odc-filter.test.ts',
    context: 'ODCFilter L1单元测试',
    tests: 6,
  },
  {
    path: 'src/agent/__tests__/direction-adapter.test.ts',
    context: 'DirectionAdapter L2a集成测试',
    tests: 3,
  },
];
```

### 8.2 改动汇总

| 类别 | 数量 | 说明 |
|------|------|------|
| 新增L3文件 | 10个源文件 + 7个测试文件 | 方向监测核心 + NCI子模块 |
| 新增L2文件 | 2个源文件 + 1个测试文件 | 接口适配层 |
| 修改L2文件 | 1个 | DiagnosisOrchestrator新增缩量诊断入口 |
| 新增Cron文件 | 1个源文件 | NCI循环调度 |
| 新增路由文件 | 1个源文件 | 02引擎HTTP端点 |
| 总计 | 15个源文件 + 8个测试文件 | — |

### 8.3 依赖关系图

```
新增文件依赖（箭头 = depends on）：
─────────────────────────────────────
src/l3/direction-monitor/types.ts          ← 被所有方向监测模块依赖
       ↓
src/l3/direction-monitor/baseline.ts       ← 被 monitor.ts 依赖
src/l3/direction-monitor/fracture-detector.ts ← 被 monitor.ts 依赖
       ↓
src/l3/direction-monitor/monitor.ts        ← 被 direction-adapter.ts 依赖
src/l3/direction-monitor/transition-manager.ts ← 被 monitor.ts 依赖
       ↓
src/agent/direction-adapter.ts             ← 被 diagnosis-orchestrator.ts 依赖

src/l3/nci/nci-engine.ts                   ← 独立模块（NCI不纳入MVS）
       ├── src/l3/nci/stm-index.ts
       ├── src/l3/nci/dormant-signal.ts
       ├── src/l3/nci/odc-filter.ts
       └── src/l3/nci/attribution.ts
              ↓
src/agent/nci-to-proposal-adapter.ts       ← 被 conversation-engine.ts 依赖

src/cron/nci-scheduler.ts                  ← 被 CronScheduler 依赖
src/routes/direction.ts                    ← 被 Express app 注册
```

---

## 九、验收标准

### 9.1 对齐验收

| 验收项 | 检查方法 | 通过标准 |
|--------|---------|---------|
| 所有消费的文档01边参数可追溯 | grep文档01 + 本章§1对照 | 10条边参数全部标注消费路径 |
| 所有消费的文档03数据可追溯 | grep文档03 + 本章§2对照 | 5项消费路径全覆盖 |
| 所有消费的文档07数据可追溯 | grep文档07 + 本章§3对照 | 6项消费路径全覆盖 |
| 所有消费的文档13数据可追溯 | grep文档13 + 本章§4对照 | 9项消费路径全覆盖（含方向锚定数据需求清单5项） |
| 所有消费的文档15数据可追溯 | grep文档15 + 本章§5对照 | 7项消费路径全覆盖 |
| NCI已有研究全部引用 | grep nci/ 目录 + 本章§6对照 | 6份已有文档全部标注迁移路径 |
| MVS范围边界清晰 | 本章§7 MVS简化范围标注 | 4个纳入MVS + 6个不纳入（含NCI），全部标注简化策略 |

### 9.2 代码改动验收

| 验收项 | 检查方法 | 通过标准 |
|--------|---------|---------|
| 所有新export有接线 | grep -rn "新函数名" src/ | 零未接线export |
| 所有新文件有测试文件 | ls src/**/__tests__/ | 15个源文件全部有对应测试文件 |
| 测试文件有expect()断言 | grep "expect(" src/**/__tests__/*.test.ts | 无空壳测试 |
| 所有接口有JSDoc @contract标注 | grep "@contract" src/l3/direction-monitor/ src/l3/nci/ | 全部接口标注 |

---

## 十、交付物总览

```
权威文档02-方向有效性监测引擎-20260722/
├── SYNOVA-RESEARCH-研究方案-v3-0-20260722.md            (已有)
├── SYNOVA-RESEARCH-第一章-方向有效性监测引擎-v1-0-20260722.md  (待创建)
├── SYNOVA-RESEARCH-第二章-四个感知断裂点检测-v1-0-20260722.md  (本次创建)
├── SYNOVA-RESEARCH-第三章-NCI子模块-v1-0-20260722.md          (本次创建)
├── SYNOVA-RESEARCH-第四章-02与03的诊断流程接口-v1-0-20260722.md (本次创建)
└── SYNOVA-RESEARCH-第五章-与现有体系对齐-v1-0-20260722.md       (本次创建)
```

**本次完成**：第二章、第三章、第四章、第五章（共4份文件，约95KB）。

**待完成**：第一章 方向有效性监测引擎（方向锚定+趋势偏离检测+方向失效评估）为02引擎的核心入口章，依赖二至五章的数据消费定义，建议在二至五章完成后编写。
