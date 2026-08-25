# Task Brief: engine-core 完全拆分 + 删除

> **执行者**: Codex (DeepSeek V4)
> **审核者**: Claude Code (DeepSeek V4 — 负责 src/ 前端+稳定性)
> **日期**: 2026-06-20
> **优先级**: P0 — 一次性解决，不留尾巴
> **预计耗时**: 6-8 小时
> **Loop Engineering**: 严格遵照 v3.2 流程执行

---

## 〇、背景：为什么现在必须做

`packages/engine-core/` 是 355 个文件、11 个子包的大杂烩。里面混了三类东西：

| 类别 | 文件 | 状态 |
|------|------|------|
| 🔴 废弃 | module-registry.ts, DiagnosticModule, 8个空壳 compute() | 已标记 @deprecated，必须删除 |
| 🟢 活跃 | measurement-pipeline, expert-pipeline, report-builder, doc-extractor, graph-store, 7个compute函数 | **演示路径直接依赖**——不是旧代码 |
| 🟡 无关 | sog-core, connector-registry, evolution-engine | 独立包，不动 |

**历史错误**：之前跟你说"拆完了"，其实只标记了 @deprecated，没真正删除。这次一次性删干净。

---

## 一、目标

```
完成后:
  ✅ packages/engine-core/ 目录完全删除
  ✅ 活跃模块迁移到 src/pipeline/ 和 src/sentinel/compute/
  ✅ 废弃模块物理删除
  ✅ 所有 import 路径更新
  ✅ tsc --noEmit 零错误
  ✅ 演示路径 (diagnosis-upload-v2.ts) 正常工作
  ✅ Loop Engineering v3.2 pre-commit 8 项全部通过
  ✅ 每个切片一个 commit
```

---

## 二、切片执行计划（11 个切片，逐一 commit）

### 原则

```
1. 一个切片 = 一个模块 = 一个 commit
2. 每切一片 → npx tsc --noEmit → 通过才 commit
3. 不批量改。不跳步。
4. 禁止触碰: src/routes/ src/sentinel/adapters/ src/agent/conversation-engine.ts
```

---

### Slice 1: 类型定义迁移

**做什么**: 把 `packages/engine-core/src/pipeline/diagnosis/types.ts` 中 `src/` 引用的类型，复制到 `src/types/engine-core-types.ts`。

**具体**:
- 检查 `src/` 下所有 `import ... from '../../../packages/engine-core/...'` 的类型引用
- 提取被引用的 interface/type 定义
- 创建 `src/types/engine-core-types.ts`
- 更新 `src/` 中的 type import 指向新文件

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice1): 迁移 engine-core 类型定义到 src/types/`

---

### Slice 2: GraphStore 迁移

**做什么**: 把 `graph-store.ts` + `graph-query.ts` 移到 `src/l4/`（注意：src/l4/ 下已有同名文件，需要合并或重命名）。

**具体**:
- 检查 `src/l4/graph-bridge.ts` 和 `packages/engine-core/.../graph-store.ts` 的关系
- graph-store.ts 是底层 SQLite 实现，graph-bridge.ts 是业务包装
- 将 graph-store.ts 移到 `src/l4/graph-store.ts`
- 将 diagnosis-graph-query.ts 合并到 `src/l4/diagnosis-graph-query.ts`
- 更新所有 import

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice2): 迁移 graph-store + graph-query 到 src/l4/`

---

### Slice 3: DocExtractor 迁移

**做什么**: 把 `doc-extractor.ts` 移到 `src/pipeline/doc-extractor.ts`。

**依赖方**: `src/routes/diagnosis-upload-v2.ts` (Line 226)

**具体**:
- 创建 `src/pipeline/` 目录
- 移动 `doc-extractor.ts` → `src/pipeline/doc-extractor.ts`
- 更新 `diagnosis-upload-v2.ts` 的 import 路径
- 同时移动 `doc-extractor` 依赖的 LLMClient 接口

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice3): 迁移 DocExtractor 到 src/pipeline/`

---

### Slice 4: MeasurementPipeline 迁移

**做什么**: 把 `measurement-pipeline.ts` + `real-measurers.js` 移到 `src/pipeline/`。

**依赖方**: `src/routes/diagnosis-upload-v2.ts` (Line 269-280)

**具体**:
- 移动 `measurement-pipeline.ts` → `src/pipeline/measurement-pipeline.ts`
- 移动 `real-measurers.js` → `src/pipeline/real-measurers.js`（标注为"FDE哨兵 on-demand"）
- 更新 `diagnosis-upload-v2.ts` 的 import

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice4): 迁移 MeasurementPipeline 到 src/pipeline/`

---

### Slice 5: ExpertPipeline 迁移

**做什么**: 把 `expert-pipeline.js` + `expert-pipeline.d.ts` 移到 `src/pipeline/`。

**依赖方**: `src/routes/diagnosis-upload-v2.ts` (Line 296-316)

**具体**:
- 移动 `expert-pipeline.js` → `src/pipeline/expert-pipeline.js`
- 移动 `expert-pipeline.d.ts` → `src/pipeline/expert-pipeline.d.ts`
- 更新 `diagnosis-upload-v2.ts` 的 import

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice5): 迁移 ExpertPipeline 到 src/pipeline/`

---

### Slice 6: ReportBuilder 迁移

**做什么**: 把 `report-builder.ts` 移到 `src/pipeline/`。

**依赖方**: `src/routes/diagnosis-upload-v2.ts` (Line 333-335)

**具体**:
- 移动 `report-builder.ts` → `src/pipeline/report-builder.ts`
- 更新 `diagnosis-upload-v2.ts` 的 import

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice6): 迁移 ReportBuilder 到 src/pipeline/`

---

### Slice 7: 哨兵 compute 函数迁移（财务类）

**做什么**: 把 `financial-snapshot.ts` + `token-economics.ts` 移到 `src/sentinel/compute/`。

**依赖方**:
- `src/sentinel/adapters/cash-flow-sentinel.ts` → `computeFinancialSnapshot`
- `src/sentinel/adapters/token-economics-sentinel.ts` → `computeTokenEconomics`

**具体**:
- 创建 `src/sentinel/compute/` 目录
- 移动 `financial-snapshot.ts` → `src/sentinel/compute/financial-snapshot.ts`
- 移动 `token-economics.ts` → `src/sentinel/compute/token-economics.ts`
- 更新 sentinel adapter 的 import（注意：这些是动态 import）

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice7): 迁移财务哨兵 compute 函数到 src/sentinel/compute/`

---

### Slice 8: 哨兵 compute 函数迁移（D3 人+Agent 类）

**做什么**: 把 `htm.ts`, `hacd.ts`, `hona.ts`, `eob.ts` 移到 `src/sentinel/compute/`。

**依赖方**:
- `src/sentinel/adapters/htm-sentinel.ts` → `computeHTM`
- `src/sentinel/adapters/hacd-sentinel.ts` → `computeHACD`
- `src/sentinel/adapters/hona-sentinel.ts` → `computeHONA`
- `src/sentinel/adapters/eob-sentinel.ts` → `computeEOB`

**具体**:
- 移动 4 个 compute 文件到 `src/sentinel/compute/`
- 更新 4 个 sentinel adapter 的 import

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice8): 迁移 D3 哨兵 compute 函数到 src/sentinel/compute/`

---

### Slice 9: 实体解析 + 社区报告迁移

**做什么**: 把 `entity-resolver*.ts` + `community-reports.ts` 移到 `src/l4/`。

**注意**: `src/l4/entity-resolver.ts` 和 `src/l4/community-reports.ts` 已存在——这些是 L2 动态 import 的目标。检查是否同一个文件。如果 engine-core 的版本更新，合并；如果 src/ 的版本更新，跳过。

**验收**: `npx tsc --noEmit` 零错误

**commit**: `refactor(slice9): 迁移 entity-resolver + community-reports 到 src/l4/`

---

### Slice 10: 删除 engine-core 废弃模块

**做什么**: 物理删除以下文件/目录：

```
packages/engine-core/src/pipeline/diagnosis/
  ├── module-registry.ts          ← ⛔ 已废弃
  ├── capability-gap.ts           ← 空壳 compute()
  ├── category-clarity.ts         ← 空壳
  ├── positioning-consistency.ts  ← 空壳
  ├── differentiation-validation.ts ← 空壳
  ├── goal-alignment.ts           ← 空壳 (保留 compute 函数，已迁移)
  ├── risk-aggregator.ts          ← 空壳
  ├── auto-action.ts              ← 未接线
  ├── auto-interpreter.ts         ← 未接线
  └── __tests__/ (对应的测试文件)
```

**具体**:
- 逐个文件 `git rm`
- 删除后运行 `npx tsc --noEmit` 确认无 import 错误
- 如有引用报错，先解除引用再删文件

**验收**: `npx tsc --noEmit` 零错误，`grep -r "module-registry" src/` 零结果

**commit**: `refactor(slice10): 物理删除 engine-core 废弃模块 (module-registry + 空壳)`

---

### Slice 11: 最终清理

**做什么**:
- 检查 `src/` 中所有 `from '../../../packages/engine-core/...'` import——全部替换完毕
- 检查 `src/` 中所有 `from '../../packages/engine-core/...'` import——全部替换完毕
- 确认 pre-commit 第 6 项"禁止 DiagnosticModule"不再误报
- 确认 `npx tsc --noEmit` 零错误
- 确认演示路径 import 全部指向 `src/pipeline/` 和 `src/sentinel/compute/`

**验收**:
```
grep -r "packages/engine-core" src/ --include="*.ts" --include="*.js" | grep -v "node_modules" | grep -v "\.test\."
→ 零结果（或仅剩 migration-guide 注释）
```

**commit**: `refactor(slice11): 最终清理 — 零 engine-core import 残留`

---

## 三、禁止触碰清单 🚫

```
❌ src/routes/diagnosis-upload-v2.ts     — 演示上传路径
❌ src/routes/chat.ts                    — Web 对话界面
❌ src/routes/home.ts                    — 首页
❌ src/agent/conversation-engine.ts     — 对话引擎（刚修复风险5）
❌ src/agent/post-diagnosis-processor.ts — 诊断后处理
❌ src/sentinel/adapters/*.ts            — 25个哨兵适配器
❌ src/sentinel/builtins.ts             — 哨兵自动注册
❌ src/sentinel/runner.ts               — 哨兵调度
❌ src/sentinel/baseline-store.ts       — 基线存储
❌ src/server.ts                         — Express 路由
```

## 四、每个切片的 Loop Engineering v3.2 流程

```
1. bash scripts/workflow/task-start.sh "Slice N: 描述"
2. scope-check.sh 自动触发 → 阅读仪表盘
3. 填写 task brief Q1/Q2/Q3
4. 写代码
5. npx tsc --noEmit → 零错误
6. Agent 自检 6 问
7. git add + git commit
8. pre-commit 8 项全过
9. 下一个切片
```

## 五、最终验收标准

```
✅ packages/engine-core/src/pipeline/diagnosis/ 下只剩 0 个文件被 src/ 引用
✅ 所有活跃模块在 src/pipeline/ 或 src/sentinel/compute/ 下
✅ 废弃模块物理删除
✅ npx tsc --noEmit 零错误
✅ pre-commit 8 项全过
✅ grep -r "packages/engine-core" src/ 零结果
✅ 演示路径: upload → diagnosis → report 全链路通
```

---

> **给 Codex**: 这是最后一次碰 engine-core。做完这 11 个切片后，`packages/engine-core/` 不应该再出现在任何 import 语句中。如有不确定的地方，先停、先问，不要猜。
