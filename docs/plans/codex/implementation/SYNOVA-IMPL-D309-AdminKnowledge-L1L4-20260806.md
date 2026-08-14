<!--
  SYNOVA-IMPL-D309: admin-knowledge.ts L1→L4 修复 — 最小接口隔离
  状态: dev doc | 2026-08-06 | 优先级 P0 (CI Architecture job 连续 4 任务必报的预存失败)
  权威文档: AGENTS.md §铁律39 + DASHBOARD §VIII Task2 + 审计基线 56 违规
  依赖: 无
  并行: D316 (控制塔修复) — 零共享文件
-->

# D309: admin-knowledge.ts L1→L4 修复 — 最小接口隔离

> 一句话问题: `src/routes/admin-knowledge.ts:17` 直接 import `../l4/knowledge-store`，违反铁律 39（L1 只能碰 L2）。这是 CI Architecture job 连续 4 任务必报的预存失败（D291/D296/D300/D311 报告均提及）。

## 1. 权威文档引用

**来源**: [AGENTS.md §铁律39](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律 39. 五层架构边界。L1 交互 → L2。L1 禁触 L3/L4/L5。

**来源**: [DASHBOARD §VIII Task 2 实测明细](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD.md)

> 基线 56 处架构违规；routes/admin-knowledge.ts L17 L1→L4 为最常触发的预存失败。

## 2. 代码审计——现状 (2026-08-06 实测)

### 2.1 违规确认

[admin-knowledge.ts L17](D:\novis-backup-20260526\Novis\synova-agent\src\routes\admin-knowledge.ts:17):

```typescript
import { KnowledgeStore } from '../l4/knowledge-store';   // L1→L4 VIOLATION
```

`audit-check.py --full` 实测: `src/routes/admin-knowledge.ts:17: L1->L4 VIOLATION (imports src/l4/knowledge-store)`。

### 2.2 实际用到的方法（最小接口依据）

`knowledgeStore.` 仅 3 处调用（已 grep 确认）:

| 位置 | 调用 | 对应 L4 签名 |
|------|------|-------------|
| L45 | `knowledgeStore.listPendingPkb()` | [knowledge-store.ts L726](D:\novis-backup-20260526\Novis\synova-agent\src\l4\knowledge-store.ts:726) `listPendingPkb(orgId?, limit=50, offset=0): KnowledgeChunk[]` |
| L64 | `knowledgeStore.approvePkb(id, userId)` | [L694](D:\novis-backup-20260526\Novis\synova-agent\src\l4\knowledge-store.ts:694) `approvePkb(id, approverId): void` |
| L84 | `knowledgeStore.rejectPkb(id, userId, reason)` | [L710](D:\novis-backup-20260526\Novis\synova-agent\src\l4\knowledge-store.ts:710) `rejectPkb(id, approverId, reason): void` |

### 2.3 附带发现（非本任务范围，记录）

`setKnowledgeStore`/`setFederatedPipeline`（L27/L31）**无外部调用方**（全仓 grep 仅定义处）→ 路由始终走守卫降级（L41/L60/L79/L103 的 `if (!store)` 分支）。D241 知识审批管线的接线缺口——与本任务无关，记录待排期。

### 2.4 方案选择：最小接口隔离（非兼容层）

与 D286 的 "collector 类型收窄为最小接口" 同模式：路由定义本地 `KnowledgeAdminStore` 接口（仅 3 方法），setter 参数改为该接口 → 移除 L4 import，零兼容层。

## 3. 实现方案

### 3.1 写集 (1 修改 + 1 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/routes/admin-knowledge.ts](D:\novis-backup-20260526\Novis\synova-agent\src\routes\admin-knowledge.ts) | 修改 | 移除 L17 L4 import；定义本地 `KnowledgeAdminStore` 最小接口；`setKnowledgeStore(store: KnowledgeAdminStore)` |
| tests/routes/admin-knowledge.test.ts | 新建 | 接口注入 + 路由行为测试（见 §4） |

### 3.2 修改模式

```typescript
// 修改前:
//   import { KnowledgeStore } from '../l4/knowledge-store';
//   let knowledgeStore: KnowledgeStore | null = null;
//   export function setKnowledgeStore(store: KnowledgeStore): void { ... }
// 修改后:
interface KnowledgeAdminStore {
  listPendingPkb(orgId?: string, limit?: number, offset?: number): Array<{ id: string }>;
  approvePkb(id: string, approverId: string): void;
  rejectPkb(id: string, approverId: string, reason: string): void;
}
let knowledgeStore: KnowledgeAdminStore | null = null;
export function setKnowledgeStore(store: KnowledgeAdminStore): void { ... }
```

> 返回类型用最小形状 `Array<{ id: string }>`——路由实际只读 `id`（L45-55 已核实）；若读取更多字段以实际使用为准。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 接线 setKnowledgeStore（创建调用方） | D241 管线接线是独立任务，本任务只消除 CI 架构噪音 |
| 改 federated-pipeline import | `src/services/` 为 layer 0，非违规（audit-check 不标） |
| 迁移 knowledge-store 到别处 | D306 架构清理范围 |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步**: 写 `tests/routes/admin-knowledge.test.ts`（迁移前对 L4 import 的断言会 red，因为修复后 import 消失）。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | 3 | 1) **正常**: setKnowledgeStore(mock) 后 GET /pending → 200 + mock 数据 2) **降级**: 未 set → 守卫错误响应 3) **边界**: approvePkb 传 id → mock.approvePkb 被调用 |
| L1 | 接线断言 | 1 | `grep "l4/knowledge-store" src/routes/admin-knowledge.ts` → 0；`grep "KnowledgeAdminStore"` → ≥1 |

测试文件: `tests/routes/admin-knowledge.test.ts`（≥4 expect，覆盖正常/降级/边界）。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| `setKnowledgeStore(store: KnowledgeAdminStore)` | 无现有调用方（已 grep 确认），签名变更不破坏接线；`grep "setKnowledgeStore" src/` → 仅定义处 + 测试 |
| 移除 L4 import | `grep "l4/knowledge-store" src/routes/admin-knowledge.ts` → 0 |

## 6. 完成标准

1. DS1: `grep "l4/knowledge-store" src/routes/admin-knowledge.ts` → 0
2. DS2: `audit-check.py --target "src/routes/admin-knowledge.ts"` → [7] 0 L1→L4 VIOLATION
3. DS3: `tests/routes/admin-knowledge.test.ts` 存在且 ≥4 expect；vitest 该文件全绿
4. DS4: 路由行为不变——未 set 时仍守卫降级（测试覆盖）
5. DS5: `npx tsc --noEmit` 零新增错误（29 存量错误不变）
6. DS6: `audit-check.py --full` 违规数 56 → 55（零回归，仅 admin-knowledge 消除）
7. DS7: 12 组 pre-commit 全过；无 --no-verify

## 7. 自检清单

- [x] audit-check 实测确认 L17 L1→L4 违规
- [x] grep 确认 knowledgeStore 仅 3 方法调用（L45/L64/L84）
- [x] grep 确认 setKnowledgeStore/setFederatedPipeline 无外部调用方（守卫降级现状）
- [x] 确认 federated-pipeline 在 src/services（layer 0，非违规）
- [x] 最小接口与 L4 方法签名逐一对齐（L694/L710/L726）
- [x] 不是凭记忆
- [x] 不用 --no-verify
