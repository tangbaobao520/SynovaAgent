<!-- SYNOVA-IMPL-D262 v1.0 | 2026-07-29 | 权威17 Phase 0 -->
# SynovaAgent -- D262 GA反馈接线 v1.0
> 权威17 工程规格 §1: middle-evolution-engine.ts 仅 import type 了 feedbackCollector——未实例化, GA反馈链路断裂

## 代码验证
- src/loops/middle-evolution-engine.ts: `import type { FeedbackCollector }` → 仅类型导入 ❌
- src/growth/feedback-collector.ts: `FeedbackCollector` 单例存在 ✅
- 修复: 删除 `import type`, 改为普通 `import` + 调用 `getFeedbackCollector()`

## 改动 (middle-evolution-engine.ts + feedback-collector.ts, ~20行)

### 1. src/loops/middle-evolution-engine.ts
- L15: `import type { FeedbackCollector }` → `import { getFeedbackCollector, type FeedbackCollector }`
- 在 `processSignal()` 函数内, AggregatedSignal 处理后追加: `const fb = getFeedbackCollector(); fb.record(...)`

### 2. src/growth/feedback-collector.ts
- 新增 `export function getFeedbackCollector(): FeedbackCollector` 单例工厂

## 测试 (L1×2)
| # | 测试 |
|---|------|
| 1 | getFeedbackCollector() 返回同一实例 |
| 2 | processSignal → fb.record 被调用 |

## 完成标准
middle-evolution-engine 实际调用 feedbackCollector。tsc零新增, as any=0。
