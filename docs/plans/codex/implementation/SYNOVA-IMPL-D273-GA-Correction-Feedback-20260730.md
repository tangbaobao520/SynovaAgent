<!--
  SYNOVA-IMPL-D273: GA Correction → Diagnostic Rules Feedback Loop
  状态: dev doc | 2026-07-30
  权威文档: 权威05 M3 + Expected State Model v3.1 G20
  依赖: D262 (feedback-collector wiring) D264 (diagnosisQualityScore)
  并行: D271, D272 — 零共享文件
-->

# D273: GA Correction → Diagnostic Rules Feedback Loop

> Close the loop: GA marks diagnosis as wrong 3+ times → auto-adjust expert thresholds.

---

## 1. 权威文档引用

**来源**: [预期状态模型 v3.1](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-预期状态模型-v3-1-20260729.md)

> 七、系统会自己学习和进化吗？
> GA 纠错驱动进化: ⚠️ GA feedback_collector 已接线(D262)。但"纠错→自动回流到诊断规则"的闭环仍缺失

**来源**: [权威05 Module 3](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档05-Agent主动交互系统蓝图-20260710)

> Module 3: GA 人机协同与反馈闭环 — GA 纠正专家结论→反馈回系统。纠正类型分类。GA 独立接口。

## 2. 代码审计——现状

### 2.1 已实现的组件（数据流的前半段）

| 组件 | 文件 | 关键函数 | 状态 |
|------|------|---------|:---:|
| GA 反馈收集 | `src/growth/feedback-collector.ts:153` | `collectFeedback(input: MiddleFeedbackInput)` → FeedbackRecord | ✅ |
| 反馈信号处理 | `src/loops/middle-evolution-engine.ts:61` | `processFeedbackSignals(signals)` → EvolutionAction[] | ✅ |
| 阈值调整动作 | `middle-evolution-engine.ts:75` | `type: 'threshold_adjust'` + `adjustPercent: 5` | ✅ |
| GA 缺席保护 | `middle-evolution-engine.ts:287` | `computeGAProtection()` → autoUpgradeThreshold | ✅ |
| GA 单例注入 | `middle-evolution-engine.ts:133` | `getFeedbackCollector().collectFeedback(...)` | ✅ D262 |

### 2.2 缺失的组件（数据流的后半段）

```
processFeedbackSignals() → EvolutionAction[]
                              ↓
                         ❌ 断链：EvolutionAction 生成后不写入任何地方
                              ↓
                         专家 RULES.md / manifest.json 永远不更新
```

**具体缺失**: `processFeedbackSignals()` (L61-L150) 生成 EvolutionAction 数组后仅调用 `fb.collectFeedback()` 记录到 SQLite，但 **不执行 action 本身**——`threshold_adjust` 类型的 action 没有回写到专家配置。

### 2.3 需要回写的目标

| 专家 | 可调整参数 | 存储位置 |
|------|-----------|---------|
| strategy/org/finance/marketing/action/tech | 阈值（如现金流健康 >15%→healthy） | `expert/{type}/RULES.md` 或 `expert/{type}/manifest.json` |
| business_model/knowledge | 评分阈值 | 同上 |
| capital-cycle 等 5 位 | 诊断规则阈值 | `expert/{type}/RULES.md` |
| host | 升级规则（如追问3次→深度分析） | `expert/host/RULES.md` |

## 3. 实现方案

### 3.1 写集（2个文件）

```
src/loops/middle-evolution-engine.ts — 修改 (+60行) — 新增 applyEvolutionAction() 函数
tests/loops/ga-correction-feedback.test.ts — 新建 (维测覆盖)
```

### 3.2 新增函数: applyEvolutionAction()

在 `processFeedbackSignals()` 末尾调用，对每个 EvolutionAction 执行实际回写：

**函数签名**:
```typescript
function applyEvolutionAction(action: EvolutionAction, expertDir: string): { success: boolean; reason?: string }
```

**执行逻辑**（按 action.type 分支）:
- `threshold_adjust`: 读取 expert manifest.json → 修改阈值字段 → 回写保存
- `weight_adjust`: 修改权重字段
- `rank_adjust`: 修改排序字段
- `confidence_adjust`: 修改置信度字段

**安全约束**（防破坏）:
- 调整幅度上限 ±30%——单次不超过
- 累计调整次数记录到 manifest.json 的 `_gaCorrections` 数组
- 同 key 同方向 ≥3 次才执行——避免偶发误纠
- 写前备份原始值到 `_previousValue` 字段

**降级**: manifest.json 不存在或格式错误 → log.warn + 跳过（不阻断其他 action）

### 3.3 接线流程

```
GA 在 ga.html 提交纠错
  → POST /api/feedback (feedback-collector.ts)
    → feedback_log 表写入
      → 下次 loop-3 (GA 进化, 每季度) 触发
        → processFeedbackSignals() 聚合信号
          → 生成 EvolutionAction[]
            → 🔥 D273: applyEvolutionAction() ← 新增
              → 读取 expert manifest.json
                → 检查同 key ≥3 次
                  → 调整阈值 ±5%
                    → 回写 manifest.json + 备份旧值
```

### 3.4 阈值调整公式

```
新阈值 = 旧阈值 × (1 + direction × adjustPercent/100 × min(count, 3)/3)

其中:
  direction: 'up'=+1, 'down'=-1
  adjustPercent: 默认 5 (从 EvolutionAction.parameter 读取)
  count: 同 key 纠错次数 (从 feedback_log 查询)
  min(count, 3)/3: 最多 3 次饱和
```

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | 3 | 1) threshold_adjust 公式正确 2) <3次不触发 3) >=3次触发+回写 |
| L2b | vitest 集成 | 1 | processFeedbackSignals → applyEvolutionAction → manifest 值变更 |

测试文件: `tests/loops/ga-correction-feedback.test.ts`

## 5. 接线要求

| 新 export | 调用方 | 确认方式 |
|-----------|--------|---------|
| `applyEvolutionAction()` | `processFeedbackSignals()` (末尾) | grep L150-152 确认调用 |
| manifest.json 写入 | expert RULES.md 读取 | grep manifest.json 引用 |

**已有接线不破坏**:
- `getFeedbackCollector()` → 保留
- `computeGAProtection()` → 保留
- `detectContradictions()` → 保留

## 6. 完成标准

| # | 标准 | 验证 |
|---|------|------|
| 1 | applyEvolutionAction() 实现4种 action 类型处理 | 代码审查 |
| 2 | 同 key ≥3 次才触发阈值调整 | 单元测试 |
| 3 | 调整幅度上限 ±30% | 单元测试 |
| 4 | manifest.json 缺失→降级不崩溃 | 集成测试 |
| 5 | 原有 EvolutionAction 记录到 feedback_log 保留 | 回归测试 |
| 6 | tsc --noEmit 零新增错误 | CI |
| 7 | vitest 零新增失败 | CI |

## 7. 自检清单（铁律 0-5）

- [x] 已读权威文档原文（预期状态模型 §七 + middle-evolution-engine.ts 全量 300行）
- [x] 已引用测试权威规范（L1 单元 + L2b 集成）
- [x] 已写接线要求（applyEvolutionAction → processFeedbackSignals 末尾）
- [x] 已验证 EvolutionAction 类型定义 (L26-L39)
- [x] 已验证 feedback-collector.ts collectFeedback/queryFeedback 方法存在
- [x] 已验证 expert manifest.json 存在 (14/15 个专家有 manifest.json)
- [x] 不是凭记忆
- [x] 不用 --no-verify
