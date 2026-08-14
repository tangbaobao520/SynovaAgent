<!--
  SYNOVA-IMPL-D292: Fix L2→L4 Cross-Layer Imports
  状态: dev doc v1.2 | 2026-08-01 校准 (D290 落地后重跑)
  权威文档: AGENTS.md §铁律39 + audit session findings §VIII Task 2
  依赖: D290 (audit-check.py修复) — ✅ 已提交 6aff260; **等 D291 提交后开工** (共享 src/agent/diagnosis-launcher.ts, 需校准行号)
  并行: D286 (v2.0 起改 15 个 src/ 文件 — 仅文件级无重叠, 但共享工作区有中间态风险, 须在 D286 提交后执行) — 2026-08-02 修正
  后续: D287/D288 (connector/evidence 统一) 在本任务后执行; conversation-engine 等其余 L2 违规见 §2.3 后续任务
-->

# D292: Fix L2→L4 Cross-Layer Imports

## 1. 权威文档引用

**来源**: [AGENTS.md §铁律39](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律 39. 五层架构边界。每层只与相邻层通信。
> L2 编排 → L1 + L3。L2 禁触 L4/L5。

**来源**: [audit session §VIII Task 2](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD.md)

> Task 2: L2→L4 跨层导入 🔴。diagnosis-launcher.ts L18 导入 createGraphTraversal from l4/graph-traversal，
> review-service.ts L8 导入 getReviewStore from l4/review-store。需通过 L3 适配层。

## 2. 代码审计——现状

### 2.1 违规确认 (audit-check.py [7] ARCH — 2026-08-01, D290 6aff260 修复后重跑)

`python scripts/audit/audit-check.py --target "src/agent/diagnosis-launcher.ts,src/agent/review-service.ts"` (逗号分隔) 实测输出:

```
src/agent/diagnosis-launcher.ts:18: L2->L4 VIOLATION (imports src/l4/graph-traversal)
src/agent/diagnosis-launcher.ts:230: L2->L4 VIOLATION (imports src/l4/community-reports)
src/agent/diagnosis-launcher.ts:242: L2->L4 VIOLATION (imports src/l4/entity-resolver)
src/agent/review-service.ts:8: L2->L4 VIOLATION (imports src/l4/review-store)
  4 architecture violations
```

**D290 已修复工具盲区**: 6aff260 起 [7] 正则支持动态 `import('...')` — L230/L242 由工具直接捕获, 不再需要手动 grep 兜底。

### 2.2 问题代码

**diagnosis-launcher.ts L18**:
```typescript
import { createGraphTraversal } from '../l4/graph-traversal';  // L2→L4 VIOLATION
```

**diagnosis-launcher.ts L230/L242** — 动态 import，同样违规:
```typescript
const { generateCommunityReports: genCR } = await import('../l4/community-reports');
const { resolveEntitiesL3: resolveL3 } = await import('../l4/entity-resolver');
```

**review-service.ts L8**:
```typescript
import { getReviewStore, type ReviewItem } from '../l4/review-store';  // L2→L4 VIOLATION
```

### 2.3 全量违规 (60 处, 2026-08-01 D290 修复后实测)

audit-check.py [7] ARCH 实测 **60 处** (含动态 import; graph-bridge whitelist 误报 0)。**D292 只处理 Task 2 指定的 2 文件 4 处**; 其余 56 处分布 (同属铁律39, 分批处理):

| 文件 | 违规数 | 处理归属 |
|------|:---:|------|
| src/agent/conversation-engine.ts | 8 (evidence/index, report-graph-adapter, decision-capture, triple-reflection, entity-resolver, community-reports, agent-memory-store×2) | **D306 优先** (graph-bridge×2 已 whitelist) |
| src/agent/synova-agent.ts | 8 (cron/session-store L5×4, delivery-queue/agent-memory/knowledge-store L4×3, +1) | D306 |
| src/agent/post-diagnosis-processor.ts | 3 (community-reports/entity-resolver/agent-memory 动态) | D306 |
| src/agent/builtin-tools.ts | 3 (session-store/cron L5×3) | D306 |
| src/agent/diagnosis-launcher.ts + review-service.ts | 4 | **D292** |
| 其余 L2 (engine-context/knowledge-bridge/workspace-context/session-service/subagent-coordinator) | 6 | D306 |
| L1 违规 (mcp×7, routes×14, im-inbound×1) | 25 | D306 |
| L3→L5 (sentinel/runner, data-lifecycle, knowledge-agent) | 3 | D306 |

> 注: v1.1 的 "28 处" 为旧工具数字 — D290 修复动态 import 检测后 +32, 新基线 60 处 (基线存档: docs/synova/audit/SYNOVA-AUDIT-BASELINE-20260801-postD290.txt)。

## 3. 实现方案

### 3.1 写集 (2 修改 + 4 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/agent/diagnosis-launcher.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\diagnosis-launcher.ts) | 修改 | L18 + L230 + L242 — 替换为 L3 适配调用 (**行号以 D291 提交后实际为准, 按 import 内容定位**) |
| [src/agent/review-service.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\review-service.ts) | 修改 | L8 — 替换为 L3 适配调用 |
| [src/l3/graph-traversal-adapter.ts](D:\novis-backup-20260526\Novis\synova-agent\src\l3\graph-traversal-adapter.ts) | 新建 | L3 封装 createGraphTraversal() |
| [src/l3/review-store-adapter.ts](D:\novis-backup-20260526\Novis\synova-agent\src\l3\review-store-adapter.ts) | 新建 | L3 封装 getReviewStore() |
| [src/l3/community-reports-adapter.ts](D:\novis-backup-20260526\Novis\synova-agent\src\l3\community-reports-adapter.ts) | 新建 | L3 封装 generateCommunityReports() (动态 import L230 对应) |
| [src/l3/entity-resolver-adapter.ts](D:\novis-backup-20260526\Novis\synova-agent\src\l3\entity-resolver-adapter.ts) | 新建 | L3 封装 resolveEntitiesL3() (动态 import L242 对应) |

> 开工前必须: `grep -n "from '../l4/\|import('../l4/" src/agent/diagnosis-launcher.ts` 重新定位行号 (D291 插入 log 行会导致漂移)。

### 3.2 适配层模式

```
修复前: L2(agent) → L4(l4/graph-traversal)     // 违规
修复后: L2(agent) → L3(l3/graph-traversal-adapter) → L4(l4/graph-traversal)  // 合规

修复前: L2(agent) → L4(l4/review-store)         // 违规
修复后: L2(agent) → L3(l3/review-store-adapter) → L4(l4/review-store)        // 合规
```

### 3.3 L3 适配器接口

**graph-traversal-adapter.ts**: 简单代理——转发到 L4，不修改逻辑。
```typescript
// src/l3/graph-traversal-adapter.ts
export { createGraphTraversal } from '../l4/graph-traversal';
```

**review-store-adapter.ts**: 同理。
```typescript
// src/l3/review-store-adapter.ts
export { getReviewStore, type ReviewItem } from '../l4/review-store';
```

### 3.4 调用方修改

diagnosis-launcher.ts:
```typescript
// 修改前: import { createGraphTraversal } from '../l4/graph-traversal';
//          const { generateCommunityReports } = await import('../l4/community-reports');
//          const { resolveEntitiesL3 } = await import('../l4/entity-resolver');
// 修改后:
import { createGraphTraversal } from '../l3/graph-traversal-adapter';
const { generateCommunityReports } = await import('../l3/community-reports-adapter');
const { resolveEntitiesL3 } = await import('../l3/entity-resolver-adapter');
```

review-service.ts:
```typescript
// 修改前: import { getReviewStore, type ReviewItem } from '../l4/review-store';
// 修改后:
import { getReviewStore, type ReviewItem } from '../l3/review-store-adapter';
```

其余 4 个 L3 适配器同为纯代理 (`export { X } from '../l4/...'`), 不修改逻辑。

## 4. 测试要求 (测试优先 — 铁律0-2: 先写测试再改码)

**第一步**: 写 `tests/agent/l3-adapters.test.ts`（迁移前对新适配器 import 会失败 → red）; **第二步**: 创建 4 个适配器 + 改 import（green）; **第三步**: 回归。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | 回归 | 1 | audit-check.py [7] ARCH (逗号分隔) → 两文件 L2→L4 静态违规 = 0 |
| L1 | 手动 grep | 1 | `grep -rn "import('../l4/" src/agent/` → 0 (动态 import 盲区兜底) |
| L1 | vitest 单元 | 1 | 新适配器测试 `tests/agent/l3-adapters.test.ts` (≥3 expect, 见下) |

**测试说明**: 4 个新 src/l3/*.ts 文件触发 pre-commit 2b "新文件配对测试" (MISSING_TEST) — 必须提供 `tests/agent/l3-adapters.test.ts`:
- 正常路径: 每个适配器导出的函数与 L4 原模块函数引用一致 (`expect(typeof createGraphTraversal).toBe('function')` 等)
- 降级路径: 适配器可独立导入不抛错
- 边界: review-store 的 `ReviewItem` 类型再导出可被消费方引用

> 备选: 若走 plan.json `test_pairing: deferred` (D284 先例), 须在实现阶段声明, 不能默认跳过。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| diagnosis-launcher.ts import 路径 | tsc 零新增错误; 4 处 import 全部指向 src/l3/ |
| review-service.ts import 路径 | tsc 零新增错误 |
| L3 适配器新建 (4 个) | grep 每个适配器名均有调用方 (diagnosis-launcher/review-service) |

## 6. 完成标准

1. diagnosis-launcher.ts 零 L2→L4 import
2. review-service.ts 零 L2→L4 import
3. `audit-check.py [7] ARCH` 对这两个文件输出 0 L2→L4 VIOLATION (逗号分隔)
4. `grep -rn "import('../l4/" src/agent/` → 0 (动态 import 盲区兜底)
5. tests/agent/l3-adapters.test.ts 存在且 ≥3 expect
6. tsc 零新增错误 | vitest 零新增失败 | pre-commit 2b 通过
7. DS7 范围检查: `git diff --name-only` 仅含 6 个文件 (2 修改 + 4 适配器 + 1 测试)，无越界
8. DS8 接口真实性: 5 个导出名已 grep 核实 (createGraphTraversal L48 / generateCommunityReports L96 / resolveEntitiesL3 L46 / ReviewItem L23 / getReviewStore L52)

## 6.5 跨任务排期 (通盘)

| 任务 | 与本任务关系 | 要求 |
|------|------------|------|
| D291 (空catch) | **禁止并行** — 共享 diagnosis-launcher.ts | 等 D291 提交后开工, 按 import 内容重新定位行号 |
| D286 (GraphStore 统一) | 谨慎并行 | v2.0 实际改 15 个 src/ 文件 (mcp/routes/adapters/conversation-engine) — 文件级无重叠, 但共享工作区中间态会污染 pre-push vitest --changed; 建议 D286 提交后再执行本任务 (M1 上线后放宽) |
| D287/D288 (connector/evidence 统一) | 串行在后 | D292 后执行; D288 涉 conversation-engine.ts 的 evidence import, 与后续 L2 清理任务合并考虑 |
| D293/D294/D295 | 串行在后 | 若触及 agent/ 文件须遵循本任务的 L3 适配模式, 禁止新增 L2→L4 |
| D296 (控制塔) | 可并行 | 只动 scripts/ + .codex/, 零共享 |
| D297/D298/D299 | 串行在后 | 均含 D291 修改过的文件 (main-agent/middle-evolution), 等 D291 提交 |

## 7. 自检清单

- [x] audit-check.py [7] 实测确认静态违规 2 处 (L18/L8); 动态 import 2 处 (L230/L242) 手动确认
- [x] v1.2: D290 修复后工具直接捕获 4 处 (L18/L230/L242/L8) — 2026-08-02 实测
- [x] 接口真实性: 5 个 L4 导出名 grep 确认存在
- [x] 已读 diagnosis-launcher.ts L17-18 + L230 + L242
- [x] 已读 review-service.ts L8
- [x] L3 适配层是纯代理——不修改逻辑，只修复 import 路径
- [x] 不是凭记忆
- [x] 不用 --no-verify

### v1.1 校准记录 (2026-08-01)

- [x] 重跑 audit-check.py [7]: 静态违规实为 **2 处** (L18/L8); L230/L242 动态 import 不被当前工具正则检测 — 已手动 grep 确认仍存在, 以手动兜底
- [x] 全量 28 处违规明细已列出; conversation-engine 8 处 L2→L4 列为后续任务 D306 (文档原"4 处核心"说法修正)
- [x] 并行声明修正: D291 共享 diagnosis-launcher.ts → 禁止并行, 等提交后按 import 内容定位
- [x] 新增 2 个适配器 (community-reports/entity-resolver) + 适配器测试 (pre-commit 2b 要求)

### v1.2 校准记录 (D290 6aff260 落地后, 2026-08-01)

- [x] 重跑 [7]: 4 处违规 (L18/L230/L242/L8) 全部由工具直接检测 — 动态 import 盲区已修复, 删除手动 grep 兜底
- [x] 全仓违规数 28 → **60** (动态 import 新检出 +32, whitelist 误报 -3); conversation-engine 8 处 (graph-bridge×2 已豁免)
- [x] D306 范围更新: 剩余 56 处 (D292 4 处外), conversation-engine 8 处优先
