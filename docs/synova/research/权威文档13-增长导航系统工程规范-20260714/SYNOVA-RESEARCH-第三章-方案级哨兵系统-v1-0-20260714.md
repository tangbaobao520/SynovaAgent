# 第三章 方案级哨兵系统

> 权威文档13 — 增长导航系统工程规范 | v1.0 | 2026-07-14
> 依赖：第一章 Goal工程规范（待编）、第二章 Proposal与三选一确认机制
> 下游：第四章 中层工作台数据模型

---

## 一、方案级哨兵 vs 全局哨兵

Synova 已有 50+ 全局哨兵，覆盖七大维度（财务健康、运营效率、组织可修复性等），但它们回答的是"企业整体是否健康"。方案级哨兵回答一个更具体的问题：

**"这个 Goal 正在按计划推进吗？"**

| | 全局哨兵 | 方案级哨兵 |
|---|---------|-----------|
| 粒度 | 企业/团队级 | 单个 Goal |
| 触发 | Cron 定时 | Goal 生命周期事件 + Cron |
| 基线 | ExternalBaseline + 历史数据 | Goal 注册后 2-4 周自建基线 |
| 告警对象 | GA | 中层负责人 + GA (升级后) |
| 生命周期 | 持续运行 | Goal 关闭后 90 天内归档销毁 |
| 数量上限 | 无限制 (按需注册) | 每团队最多 5 个活跃 |
| 命名空间 | `sentinel-{name}` | `goal-{goalId}-{name}` |

---

## 二、方案哨兵 Manifest 格式

方案哨兵使用与全局哨兵相同的 manifest.json 格式，增加 4 个方案专属字段。

### 2.1 TypeScript 接口

```typescript
/**
 * 方案级哨兵 Manifest
 *
 * 继承全局 SentinelConfig，增加 Goal 绑定和偏离检测模型配置。
 * 每个 Goal 最多注册 1 个方案哨兵。
 *
 * @entity GoalSentinelManifest
 * @layer L3 (洞察层) — SentinelRegistry 管理
 * @persistence extensions/sentinels/goal-sentinels/{goalId}/manifest.json
 */
export interface GoalSentinelManifest {
  /** 继承全局 SentinelConfig 的全部字段 */
  id: string;
  name: string;
  description: string;
  category: SentinelCategory;           // 固定为 'growth'
  priority: SentinelPriority;           // 取决于 Goal 优先级
  mode: SentinelMode;                    // 固定为 'cron'
  cron: string;                          // 默认 "0 6 * * *" (每日早6点)
  requiredDataSources: string[];
  confidenceModel: 'deterministic' | 'statistical' | 'llm';
  version: string;
  layer?: 'environment' | 'capital' | 'interface' | 'technology' | 'alignment' | 'internal';
  auxiliaryExperts?: string[];
  computeKind?: 'deterministic' | 'heuristic' | 'conditional' | 'inferred' | 'aggregate';

  // ===== 方案专属字段 =====

  /** 绑定的 Goal ID (必填) */
  goalId: string;

  /** Goal 完成后是否自动注销哨兵 */
  autoExpire: boolean;                   // 默认 true

  /** 偏离检测模型配置 */
  deviationModel: {
    /** 阈值因子: 实际值vs目标值的容许偏差比例 */
    threshold: {
      /** 容许偏差 (如 0.2 = 20%) */
      tolerance: number;
      /** 单位 (percentage / absolute) */
      unit: 'percentage' | 'absolute';
      /** 绝对偏差阈值 (unit=absolute时使用) */
      absoluteMax?: number;
    };
    /** 趋势因子: 实际斜率vs预期斜率的容许偏差 */
    trend: {
      /** 容许偏差 (如 0.3 = 30%) */
      tolerance: number;
      /** 斜率计算窗口 (数据点数) */
      windowSize: number;                // 默认 5
    };
    /** 基线因子: 实际值vs行业基准的容许偏差 */
    baseline: {
      /** 标准差倍数 (如 2.0 = 2sigma) */
      sigmaThreshold: number;           // 默认 2.0
    };
  };

  /** 基线建立期配置 */
  baselinePeriod: {
    /** 等待周数 (默认 3, GA可配置 2-4) */
    weeks: number;                       // 2-4
    /** 是否已建立基线 */
    established: boolean;                // 初始 false
    /** 基线建立完成时间 */
    establishedAt?: string;
    /** 移动平均窗口 (数据点数) */
    movingAverageWindow: number;         // 默认 4
  };
}
```

### 2.2 完整 JSON 示例

```json
{
  "$schema": "https://synova.dev/schemas/goal-sentinel-manifest-v1.json",
  "id": "goal-a1b2c3d4-unit-economics",
  "name": "goal-a1b2c3d4-unit-economics",
  "displayName": "方案哨兵: 降低固定成本占比至35%",
  "description": "追踪Goal a1b2c3d4的执行进度。偏离检测三因子: 阈值(固定成本占比vs目标35%) + 趋势(月度降幅vs预期3%) + 基线(vs行业基准42%)。any_two触发告警。",
  "type": "goal-sentinel",
  "category": "growth",
  "priority": "P1",
  "mode": "cron",
  "cron": "0 6 * * *",
  "requiredDataSources": ["sog_graph", "financial_connector"],
  "confidenceModel": "statistical",
  "version": "1.0.0",
  "layer": "interface",
  "computeKind": "aggregate",
  "computes": [
    "fixed-cost-ratio",
    "trend-slope"
  ],
  "aggregation": "any_two",
  "thresholds": {
    "fixed_cost_ratio": {
      "target": 0.35,
      "warning": 0.40,
      "critical": 0.48
    }
  },
  "goalId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "autoExpire": true,
  "deviationModel": {
    "threshold": {
      "tolerance": 0.15,
      "unit": "percentage"
    },
    "trend": {
      "tolerance": 0.30,
      "windowSize": 5
    },
    "baseline": {
      "sigmaThreshold": 2.0
    }
  },
  "baselinePeriod": {
    "weeks": 3,
    "established": false,
    "movingAverageWindow": 4
  },
  "context": {
    "requiredDataSources": ["sog_graph", "financial_connector"],
    "dataAccess": {
      "allowedDimensions": ["financial"],
      "sensitiveAccess": "read"
    }
  },
  "entryPoint": "./aggregate.ts",
  "exportKey": "goalA1b2c3d4UnitEconomicsSentinel"
}
```

---

## 三、三因子偏离检测模型

### 3.1 三因子定义

```
因子1: threshold  — "今天离目标还有多远？"
因子2: trend      — "按当前速度，能按时到达吗？"
因子3: baseline   — "这个偏差在行业内正常吗？"
```

| 因子 | 计算方式 | 输入 | 输出 |
|------|---------|------|------|
| threshold | `abs(actualValue - targetValue) / targetValue > tolerance` | Goal metric 当前值 + 目标值 | boolean: 是否偏离 |
| trend | `abs(actualSlope - expectedSlope) / expectedSlope > tolerance` | 最近 windowSize 个数据点的线性回归斜率 vs Goal 的预期斜率 | boolean: 是否偏离 |
| baseline | `abs(actualValue - baselineMean) / baselineStdDev > sigmaThreshold` | 行业 ExternalBaseline 数据库 | boolean: 是否偏离 |

### 3.2 告警触发规则: any_two

```
单因子触发 -> 仅记录日志，不告警
双因子触发 -> 告警 (P0/P1/P2 取决于 Goal 优先级)
三因子触发 -> 告警 + 自动升级优先级 (P1->P0, P2->P1)
```

**Why any_two？** 单因子误报率太高。阈值偏离可能是数据波动，趋势偏离可能是临时事件，基线偏离可能只是行业特殊性。但两两组合大幅降低噪音——如果同时偏离目标又偏离行业基准，几乎不可能是巧合。

### 3.3 因子计算伪代码

```typescript
interface DeviationCheckResult {
  factor: 'threshold' | 'trend' | 'baseline';
  deviated: boolean;
  actualValue: number;
  expectedValue: number;
  deviationRatio: number;
  details: string;
}

function checkDeviations(
  metric: GoalMetric,
  current: MetricSnapshot,
  baselineDB: ExternalBaseline
): DeviationCheckResult[] {
  const results: DeviationCheckResult[] = [];

  // Factor 1: Threshold
  const thresholdRatio = Math.abs(current.value - metric.target) / metric.target;
  results.push({
    factor: 'threshold',
    deviated: thresholdRatio > metric.deviationModel.threshold.tolerance,
    actualValue: current.value,
    expectedValue: metric.target,
    deviationRatio: thresholdRatio,
    details: `实际值 ${current.value} vs 目标 ${metric.target}, 偏离 ${(thresholdRatio * 100).toFixed(1)}%`
  });

  // Factor 2: Trend
  const actualSlope = linearRegression(current.recentDataPoints);  // 最近 windowSize 个点
  const expectedSlope = (metric.target - metric.baselineValue) / metric.totalPeriods;
  const trendRatio = Math.abs(actualSlope - expectedSlope) / Math.abs(expectedSlope);
  results.push({
    factor: 'trend',
    deviated: trendRatio > metric.deviationModel.trend.tolerance,
    actualValue: actualSlope,
    expectedValue: expectedSlope,
    deviationRatio: trendRatio,
    details: `实际斜率 ${actualSlope.toFixed(3)} vs 预期 ${expectedSlope.toFixed(3)}, 偏离 ${(trendRatio * 100).toFixed(1)}%`
  });

  // Factor 3: Baseline
  const industryStats = baselineDB.query(metric.industryCode, metric.name);
  const sigmaDeviation = Math.abs(current.value - industryStats.mean) / industryStats.stdDev;
  results.push({
    factor: 'baseline',
    deviated: sigmaDeviation > metric.deviationModel.baseline.sigmaThreshold,
    actualValue: current.value,
    expectedValue: industryStats.mean,
    deviationRatio: sigmaDeviation,
    details: `实际值 ${current.value} vs 行业均值 ${industryStats.mean} (sigma={industryStats.stdDev}), ${sigmaDeviation.toFixed(1)}sigma偏离`
  });

  return results;
}

function evaluateAlarm(results: DeviationCheckResult[]): AlarmDecision {
  const deviatedCount = results.filter(r => r.deviated).length;

  if (deviatedCount >= 3) {
    return { alarm: true, severity: 'escalated', deviatedFactors: results };
  }
  if (deviatedCount >= 2) {
    return { alarm: true, severity: 'standard', deviatedFactors: results };
  }
  // deviatedCount <= 1: log only
  return { alarm: false, severity: 'none', deviatedFactors: results };
}
```

---

## 四、基线建立等待期

### 4.1 为什么需要等待期

Goal 注册后立即开始告警是没有意义的。初始值就是偏离状态——目标是把固定成本从 48% 降到 35%，但第一天数据还是 48%，当然偏离。等待期让系统先建立"正常的波动范围"，再判断偏离是否异常。

### 4.2 等待期规则

```
Goal 注册 (status=active)
    |
    v
方案哨兵注册 (goal-{goalId}-{name})
    |
    v
baselinePeriod.established = false
    |
    v
等待 baselinePeriod.weeks 周 (默认3周, GA可配置2-4周)
    |
    |-- 每日采集数据, 不告警
    |-- 建立移动平均 (窗口 baselinePeriod.movingAverageWindow = 4)
    |-- 计算 +/- 2sigma 正常波动带
    |
    v
baselinePeriod.established = true
baselinePeriod.establishedAt = now
    |
    v
启动三因子偏离检测
```

### 4.3 等待期内的行为

- **数据采集**: 每个 cron tick 正常执行数据拉取和聚合计算
- **告警抑制**: 所有因子计算结果仅写入日志 (log.info)，不触发告警
- **异常记录**: 如果采集到明显异常值（如单日偏离>50%），记录为数据质量警告但不告警
- **GA可干预**: GA可通过 API 提前结束等待期 (`POST /api/sentinels/:id/baseline/fast-forward`)

### 4.4 基线计算

```typescript
function establishBaseline(dataPoints: number[]): BaselineStats {
  const n = dataPoints.length;
  const mean = dataPoints.reduce((a, b) => a + b, 0) / n;
  const variance = dataPoints.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    stdDev,
    upperBound: mean + 2 * stdDev,   // +2sigma
    lowerBound: mean - 2 * stdDev,   // -2sigma
    sampleSize: n,
    establishedAt: new Date().toISOString()
  };
}
```

---

## 五、生命周期管理

### 5.1 完整生命周期

```
Goal approved (Proposal -> Goal 转换完成)
    |
    v
[REGISTER] goal-{goalId}-{name} 哨兵注册
    |-- manifest.baselinePeriod.established = false
    |-- MAX_ACTIVE_PER_TEAM 检查 (<=5)
    |
    v
[BASELINE] 基线建立期 (2-4周)
    |-- 只采集数据，不告警
    |-- 每日更新移动平均
    |
    v
[ACTIVE] 活跃监控
    |-- 三因子偏离检测 + any_two 告警
    |-- 可被 Goal 暂停/恢复/变更 影响
    |
    v
Goal 状态 -> completed / cancelled
    |
    v
[GRACE] Goal关闭, 哨兵进入30天归档期
    |-- 停止数据采集
    |-- 保留历史数据 (冷存储, 仅可读)
    |-- 支持审计查询 (只读 API)
    |
    v
[ARCHIVE] 30天冷存储到期
    |
    v
[DELETE] 60天物理删除
    |-- 从 SentinelRegistry 注销
    |-- 删除 manifest.json
    |-- 删除历史数据点
    |-- 审计日志写入 PKB (匿名化后保留)
```

### 5.2 活跃数量硬限制

```
MAX_ACTIVE_PER_TEAM = 5

注册新哨兵前:
  activeCount = SentinelRegistry.listByCategory('growth')
    .filter(s => s.manifest.goalId && s.manifest.baselinePeriod.established === true)
    .length;

  if (activeCount >= MAX_ACTIVE_PER_TEAM):
    reject: "方案哨兵已达上限(5个)。请完成或取消现有Goal后重试。"
```

**Why 5？** 每条Goal 1 哨兵。5个活跃 Goal 同时运行已经是一个中型团队的执行上限。更多 Goal 意味着注意力稀释，中层会忽略所有告警。这个限制是注意力保护机制，不是技术限制。

### 5.3 生命周期状态机

```
  +----------+
  | REGISTER | -- Goal approved
  +----+-----+
       |
       v
  +----------+
  | BASELINE | -- 2-4周基线建立
  +----+-----+
       |
       v
  +--------+
  | ACTIVE | -- 活跃监控 (唯一产生告警的状态)
  +--+--+--+
     |  |
     |  +-- Goal 暂停 -> 哨兵暂停数据采集但不注销
     |
     v
  +-------+
  | GRACE | -- Goal 关闭, 30天归档
  +---+---+
      |
      v
  +---------+
  | ARCHIVE | -- 冷存储, 只读
  +----+----+
       |
       v
  +--------+
  | DELETE | -- 60天物理删除
  +--------+
```

---

## 六、离线适应策略

### 6.1 数据源健康检查

方案哨兵在每次检测前，先执行数据源健康检查，再执行偏离检测。

```typescript
interface DataSourceHealth {
  sourceId: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  lastSuccessfulFetch: string;
  consecutiveFailures: number;
  latencyMs: number;
}

async function preCheck(manifest: GoalSentinelManifest): Promise<DataSourceHealth[]> {
  const results: DataSourceHealth[] = [];
  for (const sourceId of manifest.requiredDataSources) {
    try {
      const start = Date.now();
      await fetchDataSource(sourceId);
      results.push({
        sourceId,
        status: 'healthy',
        lastSuccessfulFetch: new Date().toISOString(),
        consecutiveFailures: 0,
        latencyMs: Date.now() - start
      });
    } catch (err) {
      const prev = getPreviousHealth(sourceId);
      results.push({
        sourceId,
        status: 'degraded',
        lastSuccessfulFetch: prev?.lastSuccessfulFetch || 'never',
        consecutiveFailures: (prev?.consecutiveFailures || 0) + 1,
        latencyMs: -1
      });
    }
  }
  return results;
}
```

### 6.2 中断处理

```
数据源中断时:
  1. 标记哨兵 degraded = true
  2. 本次检测跳过, 记录日志
  3. 不触发告警 (避免假阳性)

中断累积:
  totalDowntime / goalElapsedTime > 20%
    -> 哨兵置信度降级 (confidenceModel: 'statistical' -> 'degraded_statistical')
    -> 通知 GA: "Goal {id} 的数据监测已中断超过20%周期"

恢复后:
  1. 重新拉取中断期间的数据 (回填)
  2. 重新计算基线 (如果中断超过 baselinePeriod.movingAverageWindow)
  3. 标记 degraded = false
  4. 恢复告警能力
```

### 6.3 降级决策树

```
数据源状态检查
|-- 全部 healthy -> 正常执行
|-- 部分 degraded -> 可执行, 结果标记 degraded=true
|   |-- 中断时间 < Goal周期20% -> 正常置信度
|   +-- 中断时间 >= Goal周期20% -> 降置信度 + 通知GA
+-- 全部 unavailable -> 跳过本次检测
    |-- 连续3次 -> 通知GA: "方案哨兵 goal-{id} 连续3次无法获取数据"
    +-- 连续7次 -> 哨兵自动暂停, 等待GA手动恢复
```

---

## 七、告警升级链路

### 7.1 告警等级与推送频率

| 等级 | 条件 | 推送频率 | 推送渠道 | 是否触发再诊断 |
|------|------|---------|---------|--------------|
| P2 | 双因子偏离 + Goal优先级=P2 | 每周汇总 (周一早9点) | 工作台汇总卡片 | 否 |
| P1 | 双因子偏离 + Goal优先级=P1 | 每周推送1次 (发现时) | 推送通知 + 工作台 | 否 |
| P0 | 双因子偏离 + Goal优先级=P0 | 即时推送 | 推送 + 短信/邮件 + 工作台高亮 | **是** (轻量级再诊断) |
| P0+ | 三因子偏离 (任意优先级) | 即时推送 | 上述全部 + GA强制通知 | **是** + 自动升级为全量诊断(若30天内已有2次轻量级) |

### 7.2 告警数据结构

```typescript
interface GoalSentinelAlert {
  id: string;
  goalId: string;
  sentinelId: string;
  severity: 'P0' | 'P1' | 'P2';
  title: string;                         // "固定成本占比偏离目标 + 低于行业基准"
  deviatedFactors: DeviationCheckResult[]; // 偏离的因子列表
  suggestedAction: string;               // "建议召开部门复盘会议, 检查..."
  detectedAt: string;
  acknowledgedBy?: string;               // 中层确认接收
  acknowledgedAt?: string;
  escalationLevel: 0 | 1 | 2;           // 0=首次, 1=升级到GA, 2=触发全量诊断
}
```

### 7.3 升级协议

```
P0 告警触发
  |
  v
轻量级再诊断 (1专家 + 3-5边 + 5分钟超时)
  |-- 输出: GoalAdjustmentProposal
  |
  v
同Goal 30天内累计触发3次 P0
  |
  v
自动升级全量诊断 (8专家 + 42边, 覆盖原始诊断的全部范围)
  |-- 可推翻最初诊断结论
  |-- 可修改 Goal 目标值
  +-- 可关闭 Goal (如果全量诊断判定原始根因已不成立)
```

---

## 八、与全局哨兵的集成

### 8.1 命名空间隔离

```
全局哨兵:  sentinel-{name}            (如 sentinel-unit-economics)
方案哨兵:  goal-{goalId}-{name}       (如 goal-a1b2c3d4-unit-economics)
```

SentinelRegistry 通过前缀识别哨兵类型。方案哨兵在全局哨兵列表中不可见（除非显式查询 `category=growth` + `type=goal-sentinel`）。

### 8.2 消费全局 Finding 作为 Baseline

方案哨兵的 baseline 因子需要行业基准数据。这些数据来自全局哨兵的历史 Finding：

```typescript
async function fetchBaselineFromGlobalFindings(
  metricName: string,
  industryCode: string,
  store: SentinelFindingStore
): Promise<BaselineStats> {
  const findings = await store.query({
    category: 'growth',
    metricName,
    industryCode,
    since: '180d'  // 近半年
  });

  // 从全局哨兵的历史 Finding 中提取该指标的值
  const values = findings.map(f =>
    extractMetricValue(f, metricName)
  ).filter(v => v !== null);

  return establishBaseline(values);
}
```

### 8.3 集成架构

```
+---------------------------+
|    全局哨兵 (50+)          |
|  sentinel-{name}          |
|  Cron 定时 -> Findings     |
+------------+--------------+
             |
             | Findings 写入
             v
+---------------------------+
|    SentinelFindingStore   |
|    (共享存储)              |
+------------+--------------+
             |
             | 方案哨兵读取历史 Finding 作为 baseline
             v
+---------------------------+
|    方案哨兵 (每Goal 1个)    |
|  goal-{goalId}-{name}     |
|  Cron 定时 -> 三因子检测    |
+------------+--------------+
             |
             | 告警写入
             v
+---------------------------+
|    GoalAlertStore         |
|    (独立存储)              |
+------------+--------------+
             |
             v
+---------------------------+
|  中层工作台 + GA通知       |
+---------------------------+
```

---

## 九、API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/goal-sentinels` | 列出当前团队所有方案哨兵 |
| GET | `/api/goal-sentinels/:id` | 获取哨兵详情 + 最近检测结果 |
| GET | `/api/goal-sentinels/:id/alerts` | 获取哨兵告警历史 |
| POST | `/api/goal-sentinels/:id/baseline/fast-forward` | GA提前结束基线等待期 |
| POST | `/api/goal-sentinels/:id/pause` | 暂停哨兵 (Goal暂停时) |
| POST | `/api/goal-sentinels/:id/resume` | 恢复哨兵 |
| POST | `/api/goal-sentinels/:id/alerts/:alertId/acknowledge` | 中层确认告警 |
| GET | `/api/goal-sentinels/:id/data-source-health` | 获取数据源健康状态 |

---

## 十、数据存储

| 数据 | 存储位置 | 生命周期 |
|------|---------|---------|
| manifest.json | `extensions/sentinels/goal-sentinels/{goalId}/manifest.json` | Goal 关闭后 60 天删除 |
| 每日数据点 | `store/goal-metrics-store.ts` (SQLite 表 goal_metric_snapshots) | Goal 关闭后 60 天删除 |
| 告警历史 | `store/goal-alert-store.ts` (SQLite 表 goal_sentinel_alerts) | Goal 关闭后 60 天删除 |
| 审计日志 | `store/audit-log-store.ts` (SQLite 表 audit_logs) | 永久保留 (匿名化) |
| 基线统计 | `store/goal-baseline-store.ts` (SQLite 表 goal_baselines) | Goal 关闭后 60 天删除 |

---

## 十一、成本控制总结

| 控制措施 | 值 | 目的 |
|---------|---|------|
| 每 Goal 最多 1 哨兵 | 硬限制 | 避免一个 Goal 产生噪音洪流 |
| 每团队最多 5 活跃哨兵 | MAX_ACTIVE_PER_TEAM = 5 | 注意力保护 |
| 基线等待期 2-4 周 | 只采集不告警 | 减少初始误报 |
| any_two 告警规则 | 单因子不告警 | 过滤单一噪音 |
| P2 周汇总 / P1 周推1次 | 频率控制 | 防止告警疲劳 |
| 60 天物理删除 | 自动清理 | 防止存储膨胀 |

---

*文档版本: v1.0 | 最后更新: 2026-07-14 | 作者: Synova 工程团队*
*上一章: [第二章 Proposal与三选一确认机制](./SYNOVA-RESEARCH-第二章-Proposal与三选一确认机制-v1-0-20260714.md)*
*下一章: 第四章 中层工作台数据模型 (已存在)*
