# SynovaAgent -- D8g 推理成本预算 (Reasoning Cost Budget) 实施方案 v1.0

> 2026-07-23 | 权威文档 #4 Agent 工程能力对标 — §2.8 推理成本控制
> **Agent L2 升级 — 最后一块（6/7 已完成）。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/agent/main-agent.ts` 存在（D8a，`executeLoop()` 方法 L~90-180），`src/agent/convergence-engine.ts` 存在（D8f v2 已集成），D8a-D8f 全部通过 CI
- [x] Get-Content 读取：权威文档 #4 §2.8 — 推理成本控制：token 预算上限（maxTokens per loop）、成本累计追踪（cumulativeCost）、预算告警（warnAt 80%/blockAt 100%）、执行记录持久化（LoopExecutionRecord.tokenUsage/costEstimate）
- [x] Select-String 验证：D80 PlaybookExecutionRecord 已有 `tokenUsage` + `costEstimate` 字段（Playbook 执行层）；MainAgent 当前不追踪循环级别的 token 消耗
- [x] 引用 — 权威文档 #4："每次 loop 执行前检查累计成本是否超出预算，超出时降级为轻量模式或拦截"

---

## 问题根因

D8a-D8f 构建了完整的 Agent L2 循环执行引擎（MainAgent → TaskDecomposer → ExpertRouter → CrossValidator → ConflictArbitrator → ConvergenceEngine），但没有任何 token 预算控制。Agent 可以无限制地消耗 token 而不触发告警或降级。D80 Playbook 层已有 tokenUsage/costEstimate 字段，但循环层缺失。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent L2 升级 — 推理成本预算。创建 `BudgetTracker` 类：追踪每次循环执行的 token 消耗 + 成本估算 + 预算告警 + 超预算拦截。集成到 MainAgent.executeLoop() 的执行前/后钩子。

### Q1：调研
- MainAgent.executeLoop()：D8a 创建，接受 `loopId` + `scale` 参数；D8f 集成了 ConvergenceEngine
- D80 PlaybookExecutionRecord：已有 `tokenUsage: number` + `costEstimate: number` 字段（可复用模式）
- 权威文档 #4 §2.8：预算模型 — 每循环 maxTokens 默认 50K（fast）/ 200K（medium）/ 500K（slow）；累计预算 warnAt 80% / blockAt 100%
- D8f ConvergenceEngine.synthesize()：返回 `ConvergedSynthesis`，可作为成本追踪的输入

### Q2：范围
- 最小：`src/agent/cost-budget.ts`（BudgetTracker 类：trackExecution/checkBudget/getCumulativeCost/getHistory）+ 集成到 MainAgent.executeLoop() 的前后钩子
- 不做：不修改 MainAgent 现有循环逻辑、不修改 D80 Playbook 层

### Q3：验收
- 入口：MainAgent.executeLoop('loop-1') → BudgetTracker.checkBudget() → 预算内 → 执行 → BudgetTracker.trackExecution(result)
- 交互：累计成本达 warnAt 80% → log.warn + 降级为轻量模式（跳过 LLM 合成步骤）
- 结果：累计成本达 blockAt 100% → 拒绝执行 + 返回 `{ blocked: true, reason: 'budget_exceeded' }`

### Q4：契约与测试
- @input：loopId + estimatedTokens（执行前），actualTokens + costEstimate（执行后）
- @output：BudgetStatus { allowed, warnLevel, cumulativeCost, remainingBudget }
- @degraded：追踪器未初始化 → 允许执行 + degraded
- 测试：预算内执行(1) + warnAt 告警(1) + blockAt 拦截(1) + 累计追踪(1) + 降级(1) = 5 tests

---

## 构建内容

### 1. src/agent/cost-budget.ts（新建，约 120 行）

```typescript
export interface BudgetConfig {
  maxTokens: number;        // 每循环最大 token 预算
  cumulativeBudget: number; // 累计预算上限（跨多次执行）
  warnAt: number;           // 告警阈值 (0-1, 默认 0.8)
  blockAt: number;          // 拦截阈值 (0-1, 默认 1.0)
}

export class BudgetTracker {
  private cumulativeCost = 0;
  private history: Array<{ loopId: string; tokens: number; cost: number; timestamp: string }> = [];

  checkBudget(loopId: string, estimatedTokens: number): BudgetStatus;
  trackExecution(loopId: string, actualTokens: number, costEstimate: number): void;
  getCumulativeCost(): number;
  getHistory(limit?: number): ExecutionCostRecord[];
  reset(): void;
}
```

**预算等级（按 scale 自动选择）：**
| Scale | maxTokens | 说明 |
|-------|-----------|------|
| fast | 50,000 | 哨兵触发、快速诊断 |
| medium | 200,000 | 部门导航、GA 进化 |
| slow | 500,000 | 企业诊断、知识积累 |

### 2. 集成到 MainAgent（修改 src/agent/main-agent.ts，约 10 行）

```typescript
// D8g: 推理成本预算
import { BudgetTracker } from './cost-budget';
const budget = new BudgetTracker({ maxTokens: 50000, cumulativeBudget: 500000, warnAt: 0.8 });

async executeLoop(loopId: string, scale: Scale): Promise<LoopExecutionRecord> {
  const status = budget.checkBudget(loopId, scale === 'fast' ? 50000 : scale === 'medium' ? 200000 : 500000);
  if (status.blocked) return { blocked: true, reason: 'budget_exceeded' };
  if (status.warnLevel) { /* 降级为轻量模式 */ }
  const result = await this._executeLoopInternal(loopId);
  budget.trackExecution(loopId, result.tokenUsage, result.costEstimate);
  return result;
}
```

---

## 不做什么

- 不修改 MainAgent 核心执行逻辑（仅加钩子）
- 不修改 D80 PlaybookExecutionRecord（模式复用，不改字段）
- 不实现 LLM provider 级别的 token 计数（使用估算值）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- checkBudget() 预算内 → `{ allowed: true, warnLevel: false }`
- checkBudget() warnAt 触发 → `{ allowed: true, warnLevel: true }`
- checkBudget() blockAt 触发 → `{ allowed: false, blocked: true }`
- trackExecution() → 累计成本累加 + 历史记录追加
- BudgetTracker 未初始化 → 允许执行 + degraded
- 5 个测试，每测试 ≥3 expect()

### L2a：接线测试
- MainAgent 包含 `BudgetTracker` import（grep "BudgetTracker" src/agent/main-agent.ts）
- MainAgent.executeLoop() 包含 `checkBudget` 调用（grep "checkBudget" src/agent/main-agent.ts）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| BudgetTracker.checkBudget | MainAgent.executeLoop() | grep "checkBudget" src/agent/main-agent.ts |
| BudgetTracker.trackExecution | MainAgent.executeLoop() | grep "trackExecution" src/agent/main-agent.ts |
| BudgetStatus type | MainAgent + cost-budget.ts | grep "BudgetStatus" src/agent/ |

---

## 完成标准

```
[ ] cost-budget.ts: BudgetTracker 类 — checkBudget/trackExecution/getCumulativeCost/getHistory/reset
[ ] 3 级预算: fast=50K / medium=200K / slow=500K
[ ] warnAt 80% → log.warn + 降级轻量模式
[ ] blockAt 100% → 拒绝执行 + blocked=true
[ ] 集成: MainAgent.executeLoop() 前后钩子
[ ] 降级: 追踪器未初始化 → 允许执行 + degraded
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] ≥5 个测试
```

---

## 权威文档引用

- 权威文档 #4：Agent 工程能力对标 — §2.8 推理成本控制
- D8a MainAgent（executeLoop 集成点）
- D8f ConvergenceEngine（synthesize 作为成本输入）
- D80 PlaybookExecutionRecord（tokenUsage/costEstimate 模式参考）
