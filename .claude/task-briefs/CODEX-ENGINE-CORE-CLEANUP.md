# Task Brief: engine-core 废弃模块物理删除

> **执行者**: Codex
> **前置**: CODEX-ENGINE-CORE-SPLIT.md 已完成（桥接层就绪）
> **目标**: 物理删除 7 个废弃模块，engine-core 内部零废弃引用
> **Loop Engineering**: 严格遵照 v3.2

---

## 当前状态

桥接层已就绪。`src/` 不再直接 import engine-core。但以下 7 个废弃模块无法物理删除，因为 **engine-core 自己内部的文件还在引用它们**：

| 废弃模块 | 被谁引用 |
|---------|---------|
| `module-registry.ts` | `types.ts` (类型导出), `diagnosis-orchestrator.ts` (runModules), `fde-toolset.ts` |
| `capability-gap.ts` | `diagnosis-orchestrator.ts` |
| `goal-alignment.ts` | `types.ts` |
| `risk-aggregator.ts` | `types.ts` |
| `category-clarity.ts` | `fde-toolset.ts` |
| `positioning-consistency.ts` | `fde-toolset.ts` |
| `differentiation-validation.ts` | `fde-toolset.ts` |

---

## 任务: 解除引用 + 物理删除

### Step 1: 解除 types.ts 的废弃引用

```
文件: packages/engine-core/src/pipeline/diagnosis/types.ts
操作: 
  - 找到 `import ... from './module-registry'` → 删除
  - 找到 `import ... from './goal-alignment'` → 删除  
  - 找到 `import ... from './risk-aggregator'` → 删除
  - 如果 types.ts 中有 re-export 这些类型 → 内联类型定义或删除 re-export
验证: npx tsc --noEmit
```

### Step 2: 解除 diagnosis-orchestrator.ts 的废弃引用

```
文件: packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator.ts
操作:
  - 删除 `import { runModules, listModules, ensureModulesRegistered } from './module-registry'`
  - 删除 `ensureModulesRegistered()` 调用 (已是空函数)
  - 删除 `import ... from './capability-gap'`
  - 如果有 runModules() 调用 → 替换为直接调用 compute 函数或删除
验证: npx tsc --noEmit
```

### Step 3: 解除 fde-toolset.ts 的废弃引用

```
文件: packages/engine-core/src/pipeline/diagnosis/fde-toolset.ts
操作:
  - 删除对 category-clarity, positioning-consistency, differentiation-validation 的 import
  - 这些是营销诊断模块 → 如果 fde-toolset 在调用它们 → 删除调用
验证: npx tsc --noEmit
```

### Step 4: 物理删除 7 个废弃文件

```bash
git rm packages/engine-core/src/pipeline/diagnosis/module-registry.ts
git rm packages/engine-core/src/pipeline/diagnosis/capability-gap.ts
git rm packages/engine-core/src/pipeline/diagnosis/goal-alignment.ts
git rm packages/engine-core/src/pipeline/diagnosis/risk-aggregator.ts
git rm packages/engine-core/src/pipeline/diagnosis/category-clarity.ts
git rm packages/engine-core/src/pipeline/diagnosis/positioning-consistency.ts
git rm packages/engine-core/src/pipeline/diagnosis/differentiation-validation.ts

# 以及对应的测试文件
git rm packages/engine-core/src/pipeline/diagnosis/__tests__/capability-gap.test.ts
git rm packages/engine-core/src/pipeline/diagnosis/__tests__/goal-alignment.test.ts
# ... (其他有测试的)
```

### Step 5: 最终验证

```bash
npx tsc --noEmit                    # 零错误
grep -r "module-registry" packages/ # 零结果（或仅剩注释）
ls packages/engine-core/src/pipeline/diagnosis/ | wc -l  # 确认减少了7个文件
```

---

## 约束

```
每步一个 commit。不批量。
禁止触碰:
  ❌ src/pipeline/ (桥接文件)
  ❌ src/sentinel/compute/ (桥接文件)
  ❌ src/routes/ (演示路径)
  ❌ src/agent/conversation-engine.ts
```

## 验收

```
✅ 7 个废弃文件物理删除
✅ engine-core 内部零废弃引用
✅ npx tsc --noEmit 零错误
✅ pre-commit 8 项全过
```
