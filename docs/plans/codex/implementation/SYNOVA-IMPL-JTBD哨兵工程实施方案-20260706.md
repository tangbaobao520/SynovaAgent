---
title: "SYNOVA-IMPL-JTBD哨兵工程实施方案"
version: "v2.0 — 基于真实代码审计重写"
date: "2026-07-06"
status: "工程实施方案 — 待实施"
input: "JTBD研究综合报告 v1.0 + 本体层最终规范 v2.4 + 真实代码审计(extensions/sentinels/62哨兵)"
scope: "22个新增compute函数(shared/computes/) + 10个新增哨兵(manifest.json驱动)"
constraint: "不新增实体/边，遵循现有文件驱动加载机制"
---

# SYNOVA-IMPL — JTBD哨兵工程实施方案 v2

**v2.0 说明：** v1.0与真实代码存在6处脱节，已废弃。v2.0基于 `extensions/sentinels/` 62个现有哨兵的真实结构重写。

---

## 0. 真实代码参考（实施前必读）

| 参考项 | 路径 | 说明 |
|--------|------|------|
| 现有哨兵样例 | `extensions/sentinels/adaptation-velocity/` | manifest.json + aggregate.ts + computes/ 结构 |
| manifest.json Schema | 同上 | 所有字段定义 |
| aggregate.ts 真实签名 | `check(store: GraphStoreReader, teamId: string, traversal?) -> SentinelFinding[]` | 三个独立参数 |
| 哨兵加载器 | `src/sentinel/sentinel-loader.ts` | 扫描 extensions/sentinels/ 自动发现 |
| SentinelFinding | `src/sentinel/types.ts` | {id, severity, title, description, evidence, suggestion, detectedAt} |
| L4 GraphStore | `src/l4/graph-bridge.ts` | queryNodes/queryEdges/traverse/findPaths |

---

## 1. 代码结构：新增文件清单

```
extensions/sentinels/
├── shared/
│   └── computes/                              # [新增] 共享compute函数
│       ├── index.ts                           # 统一导出全部22个函数
│       ├── types.ts                           # ComputeInput/ComputeOutput/GraphStoreReader
│       ├── l1-production/                     # L1 产出与效率 (8个)
│       │   ├── compute-production-output.ts
│       │   ├── compute-capacity-utilization.ts
│       │   ├── compute-quality-traceability.ts
│       │   ├── compute-full-cost-allocation.ts
│       │   ├── compute-material-availability.ts
│       │   ├── compute-operation-performance.ts
│       │   ├── compute-production-difficulty.ts
│       │   └── compute-schedule-impact-simulation.ts
│       ├── l2-value/                          # L2 价值流转 (7个)
│       │   ├── compute-customer-profitability.ts
│       │   ├── compute-customer-value-score.ts
│       │   ├── compute-churn-decomposition.ts
│       │   ├── compute-account-receivable-risk.ts
│       │   ├── compute-customer-migration.ts
│       │   ├── compute-channel-roi.ts
│       │   └── compute-cash-flow-projection.ts
│       ├── l3-causal/                         # L3 因果推断 (4个)
│       │   ├── compute-shapley-attribution.ts
│       │   ├── compute-causal-sequence.ts
│       │   ├── compute-scenario-simulation.ts
│       │   └── compute-intervention-effect.ts
│       └── l4-competition/                    # L4 竞争参照 (3个)
│           ├── compute-competitor-pricing-landscape.ts
│           ├── compute-competitor-feature-threat.ts
│           └── compute-substitution-risk.ts
│
├── customer-profitability/                    # O10 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
├── capacity-scheduling/                       # O11 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
├── supplier-performance/                      # O12 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
├── churn-attribution/                         # O13 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
├── scheduling-simulation/                     # O14 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
├── pricing-strategy/                          # O15 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
├── customer-demand-structure/                 # E6 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
├── quote-collaboration/                       # F5 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
├── multi-channel-roi/                         # C1 [新增]
│   ├── manifest.json
│   ├── aggregate.ts
│   └── __tests__/aggregate.test.ts
└── customer-tiering-conflict/                 # C2 [新增]
    ├── manifest.json
    ├── aggregate.ts
    └── __tests__/aggregate.test.ts
```

**需要修改的现有文件：无。** `sentinel-loader.ts` 扫描 `extensions/sentinels/` 自动发现新目录。`graph-bridge.ts` 无需修改。

---

## 2. 接口契约

### 2.1 types.ts（必须第一个实现）

```typescript
// extensions/sentinels/shared/computes/types.ts [新增]

export interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string,unknown>;
  }>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{
    id: string; type: string; from: string; to: string; weight: number; props: Record<string,unknown>;
  }>;
  traverse(startNodeId: string, edgeType?: string, maxDepth?: number, graph?: string): unknown;
  findPaths(from: string, to: string, edgeType?: string, maxDepth?: number, graph?: string): unknown[];
}

export interface ComputeInput {
  entityId: string;
  window: "7d" | "30d" | "90d" | "180d" | "365d";
  aggregation: "sum" | "avg" | "median" | "trend" | "distribution";
  groupBy?: string;
  filters?: Record<string, unknown>;
}

export interface ComputeOutput<T = number> {
  value: T;
  unit: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  degraded: boolean;          // 铁律24
  warnings: string[];         // 铁律31: 非空即异常
  computedAt: string;         // ISO-8601
}
```

### 2.2 compute函数签名

所有22个函数遵循同一签名，每个必须标注JSDoc含图遍历路径：

```typescript
/**
 * 客户盈利能力计算
 * 图遍历: Customer(id) ->[BUYS_FROM]-> Orders ->[PRODUCES]-> Revenue ->[CONSUMES]-> Costs ->[FLOWS_TO]-> Profit
 * 消费边: BUYS_FROM, PRODUCES, CONSUMES, FLOWS_TO
 * 遍历深度: 3层
 * 降级: 无Cost节点 -> degraded=true, confidence="low", 返回revenue-only估算并标注warnings
 */
export async function computeCustomerProfitability(
  input: ComputeInput,
  store: GraphStoreReader
): Promise<ComputeOutput> {
  // 实现
}
```

### 2.3 降级策略

| 级别 | 条件 | 行为 |
|------|------|------|
| L1 全量 | 数据就绪 | confidence:"high", degraded:false |
| L2 部分 | 次要缺失 | confidence:"medium", degraded:true, warnings有内容, log.warn() |
| L3 关键 | 核心缺失 | confidence:"low", degraded:true, value=行业默认, log.error() |

**pre-commit硬阻断：** catch块为空、degraded:true但warnings为空、静默返回假值。

### 2.4 index.ts

```typescript
// extensions/sentinels/shared/computes/index.ts [新增]
export { computeProductionOutput } from "./l1-production/compute-production-output";
// ... 全部22个export
```

---

## 3. 哨兵规范

### 3.1 manifest.json 模板

```json
{
  "name": "customer-profitability",
  "version": "1.0.0",
  "type": "sentinel",
  "displayName": "O10 客户盈利能力哨兵",
  "description": "检测客户级利润贡献异常，触发资源重分配建议。消费compute-customer-profitability、compute-customer-value-score。",
  "schedule": "0 6 * * 1",
  "expert": "finance",
  "priority": "P0",
  "layer": "capital",
  "computeKind": "deterministic",
  "computes": ["compute-customer-profitability","compute-customer-value-score","compute-account-receivable-risk"],
  "thresholds": {
    "profitMargin": {"warning": 0.10, "critical": 0.0},
    "customerConcentration": {"warning": 0.50, "critical": 0.70}
  },
  "aggregation": "worst_first",
  "context": {
    "requiredDataSources": ["sog_graph","erp_data"],
    "dataAccess": {"allowedDimensions": ["financial","customer"], "sensitiveAccess": "read"}
  },
  "entryPoint": "./aggregate.ts",
  "exportKey": "customerProfitabilitySentinel",
  "auxiliaryExperts": ["strategy"]
}
```

### 3.2 aggregate.ts 模板

```typescript
// extensions/sentinels/customer-profitability/aggregate.ts [新增]
import type { SentinelFinding } from "../../../src/sentinel/types";
import type { GraphStoreReader, ComputeInput } from "../shared/computes/types";
import { computeCustomerProfitability } from "../shared/computes/l2-value/compute-customer-profitability";
import { computeCustomerValueScore } from "../shared/computes/l2-value/compute-customer-value-score";
import { createLogger } from "@synova/logger";

const log = createLogger("sentinel/customer-profitability");

export const customerProfitabilitySentinel = {
  async check(
    store: GraphStoreReader,
    teamId: string,
    _traversal?: unknown
  ): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      const customers = store.queryNodes("Customer", {}, "default");
      for (const c of customers) {
        const input: ComputeInput = { entityId: c.id, window: "90d", aggregation: "avg" };
        const profitResult = await computeCustomerProfitability(input, store);
        const scoreResult = await computeCustomerValueScore(input, store);
        // 异常判定：利润率为负 -> critical; 利润率<10% -> warning
        if (profitResult.degraded) {
          log.warn({ customerId: c.id, warnings: profitResult.warnings }, "客户盈利能力计算降级");
        }
        if (profitResult.value < 0) {
          findings.push({
            id: `cp-${c.id}-${Date.now()}`,
            severity: "critical",
            title: `客户 ${c.id} 利润贡献为负`,
            description: `过去90天累计利润率为 ${(profitResult.value*100).toFixed(1)}%`,
            evidence: profitResult.evidence,
            suggestion: "建议审查该客户的定价策略或服务成本，评估是否需调整资源分配",
            detectedAt: new Date().toISOString(),
            relatedNodeId: c.id,
          });
        }
      }
    } catch (err) {
      log.error({ err, teamId }, "哨兵执行异常");
    }
    return findings;
  },
};
```

### 3.3 10个哨兵配置表

| 哨兵 | manifest.name | expert | priority | schedule |
|------|--------------|--------|----------|----------|
| O10 | customer-profitability | finance | P0 | 0 6 * * 1 (每周一早6点) |
| O11 | capacity-scheduling | operations | P0 | 0 */6 * * * (每6小时) |
| O12 | supplier-performance | operations | P1 | 0 0 1 * * (每月1号) |
| O13 | churn-attribution | strategy | P0 | 0 6 * * 1 (每周一) |
| O14 | scheduling-simulation | operations | P1 | 0 */12 * * * (每12小时) |
| O15 | pricing-strategy | finance | P1 | 0 6 * * 1 (每周一) |
| E6 | customer-demand-structure | strategy | P1 | 0 0 1 * * (每月1号) |
| F5 | quote-collaboration | finance | P1 | on-demand (事件驱动) |
| C1 | multi-channel-roi | finance | P1 | 0 6 * * 1 (每周一) |
| C2 | customer-tiering-conflict | strategy | P2 | 0 0 1 * * (每月1号) |

---

## 4. 分阶段实施 (8周)

### Phase 3a: Week 1-2 — L1产出层 + 3哨兵

**Week 1:**
- [ ] `shared/computes/types.ts` — 接口定义
- [ ] `shared/computes/index.ts` — 骨架
- [ ] L1 compute × 4: production-output, capacity-utilization, quality-traceability, full-cost-allocation
- [ ] 每个 ≥3 单元测试 (正常/边界/降级)
- [ ] 验收：`import { computeProductionOutput } from "...shared/computes"` 可执行

**Week 2:**
- [ ] L1 compute × 4: material-availability, operation-performance, production-difficulty, schedule-impact-simulation
- [ ] 哨兵 O10 (customer-profitability) 完整
- [ ] 哨兵 O11 (capacity-scheduling) 完整
- [ ] 哨兵 O12 (supplier-performance) 完整
- [ ] 集成测试：Mock GraphStoreReader -> sentinel.check() -> 验证SentinelFinding[]
- [ ] `vitest run` 零新增失败

### Phase 3b: Week 3-4 — L2价值层 + 3哨兵

- [ ] L2 compute × 7 全部
- [ ] 哨兵 O13 (churn-attribution), O15 (pricing-strategy), C1 (multi-channel-roi)
- [ ] index.ts 追加L2导出

### Phase 3c: Week 5-6 — L3因果层 + 3哨兵

- [ ] L3 compute × 4 全部（shapley-attribution含confidence_interval字段）
- [ ] 哨兵 O14 (scheduling-simulation), E6 (customer-demand-structure), F5 (quote-collaboration)
- [ ] index.ts 追加L3导出

### Phase 3d: Week 7-8 — L4竞争层 + 收尾

- [ ] L4 compute × 3 全部
- [ ] 哨兵 C2 (customer-tiering-conflict)
- [ ] index.ts 最终版 (22个export)
- [ ] 全量 vitest 零失败
- [ ] 全量 tsc 零错误
- [ ] 接线审计10项通过
- [ ] 性能基准：单哨兵 <30s
- [ ] 现有 ~90 函数复用验证（用真实数据跑，结果标注于 jtbd-function-map.json）

---

## 5. 接线审计清单（pre-commit阻断）

```
[ ] manifest.json 存在于 extensions/sentinels/{name}/
[ ] manifest.entryPoint 指向的 aggregate.ts 存在
[ ] manifest.exportKey 在 aggregate.ts 中真实导出
[ ] aggregate.ts check(store, teamId, traversal?) 签名正确
[ ] aggregate.ts 中 import 的 compute 函数路径可解析
[ ] manifest.computes 中的函数名与 index.ts 导出一致
[ ] 测试文件存在且含 >=1 个 expect() 断言
[ ] catch 块中有 log.warn/error
[ ] compute 函数 JSDoc 含图遍历路径标注
[ ] compute 函数输出含 degraded + warnings 字段
```

---

## 6. 明确不做的事项

| 不做 | 原因 |
|------|------|
| 修改 sentinel-loader.ts | 文件驱动自动发现 |
| 修改 registry.ts | registerLoadedSentinels() 已处理 |
| 创建 src/l4/compute/ | compute放在哨兵生态shared/computes/ |
| 修改 graph-bridge.ts | 哨兵通过 GraphStoreReader 消费现有接口 |
| 在 src/sentinel/adapters/ 新增 | 仅旧版哨兵，新增走manifest.json模式 |
| 修改 measurement-pipeline.ts | 不涉及诊断管道 |

---

## 7. Done标准

```
[ ] 22 compute函数 + 测试 >=3 cases each
[ ] 10 哨兵 (manifest + aggregate + test) 就位
[ ] shared/computes/index.ts 导出全部22函数
[ ] vitest run 零新增失败
[ ] tsc --noEmit 零错误
[ ] 接线审计10项全通过
[ ] 降级传播验证: compute.degraded -> 哨兵log.warn -> Finding标注
[ ] 单哨兵性能 <30s
[ ] pre-commit 5项硬阻断通过
```

---

> **文档位置**: docs/plans/codex/implementation/SYNOVA-IMPL-JTBD哨兵工程实施方案-20260706.md
> **版本**: v2.0 · 2026-07-06
> **关联**: JTBD研究综合报告 · 本体层最终规范v2.4 · extensions/sentinels/ 62哨兵参考实现
