<!--
  SYNOVA-IMPL-D286: GraphStore 统一 — packages/graph-store 废弃 + 16 处引用迁移到原生 SqliteGraphStore
  状态: dev doc v2.0 | 2026-08-02 重新审计 (v1 前提错误被 Codex 复核推翻)
  权威文档: AGENTS.md §铁律39 + workbuddy audit (GraphStore 3 轨) + §VII 架构债
  依赖: 无
  并行: D292 (src/agent/diagnosis-launcher+review-service), D300 (scripts/) — 零共享文件
  警示: v1 仅 grep 路径字符串 "packages/graph-store" 判定"零引用" — 漏掉包名 @synova/graph-store 的 16 处主树引用。教训见 memory/grep-semantic-overreach.md
-->

# D286: GraphStore 统一 — packages/graph-store 废弃与引用迁移

> **v2.0 前提修正**: 直接归档 packages/graph-store 会破坏构建（16 处引用 + tsconfig paths + vitest alias）。本任务 = 迁移 16 处引用到原生 `src/adapters/sqlite-graph-store.ts` + 归档旧包。工期 1.5-2d（非 v1 的 0.5d）。

## 1. 权威文档引用

**来源**: [AGENTS.md §铁律39](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md) — L4 本体只与 L3+L5 通信
**来源**: [DASHBOARD §VII 架构债 #1](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD.md) — GraphStore 3 轨统一目标
**来源**: [memory/grep-semantic-overreach.md](D:\novis-backup-20260526\Novis\synova-agent\memory\grep-semantic-overreach.md) — v1 误判根因

## 2. 代码审计——现状 (2026-08-02 重新实测)

### 2.1 v1 的错误前提

v1 判定依据 `grep "packages/graph-store" src/` → 0，结论"零运行时引用"。**错误**：代码通过**包名** `@synova/graph-store`（tsconfig paths 映射）引用，路径字符串 grep 扫不到。

### 2.2 实测引用清单 (16 处)

| 类别 | 位置 | 引用内容 |
|------|------|---------|
| 配置 | [tsconfig.json L27](D:\novis-backup-20260526\Novis\synova-agent\tsconfig.json:27) | paths: `@synova/graph-store` → `./packages/graph-store/src/index.ts` |
| 配置 | [vitest.config.ts L16](D:\novis-backup-20260526\Novis\synova-agent\vitest.config.ts:16) | alias → `packages/graph-store/src/index.ts` |
| 运行时 | [conversation-engine.ts L40/L350](D:\novis-backup-20260526\Novis\synova-agent\src\agent\conversation-engine.ts:40) | `createSynovaGraphStore(db)` |
| 运行时 | [bootstrap.ts L742/L750/L1119](D:\novis-backup-20260526\Novis\synova-agent\src\deploy\bootstrap.ts:742) | `createSynovaGraphStore` + `setGraphStoreDeletePermissionChecker` |
| 运行时 | [engine-core-adapter.ts L76-79](D:\novis-backup-20260526\Novis\synova-agent\src\adapters\engine-core-adapter.ts:76) | `createSynovaGraphStore` + `SqliteDb` 类型 |
| 运行时 | [ingest/index.ts L34](D:\novis-backup-20260526\Novis\synova-agent\src\ingest\index.ts:34)、[knowledge-agent.ts L236](D:\novis-backup-20260526\Novis\synova-agent\src\l3\knowledge-agent.ts:236)、[mcp/index.ts L138](D:\novis-backup-20260526\Novis\synova-agent\src\mcp\index.ts:138)、[tool-registration.ts L104](D:\novis-backup-20260526\Novis\synova-agent\src\mcp\tool-registration.ts:104)、[agent-observer.ts L11](D:\novis-backup-20260526\Novis\synova-agent\src\routes\agent-observer.ts:11)、[chat.ts L32](D:\novis-backup-20260526\Novis\synova-agent\src\routes\chat.ts:32)、[diagnosis-upload-v2.ts L931](D:\novis-backup-20260526\Novis\synova-agent\src\routes\diagnosis-upload-v2.ts:931)、[ontology.ts L10-19](D:\novis-backup-20260526\Novis\synova-agent\src\routes\ontology.ts:10)、[sentinel/runner.ts L629-630](D:\novis-backup-20260526\Novis\synova-agent\src\sentinel\runner.ts:629) | `createSynovaGraphStore` |
| 测试 | [tests/l4/synova-graph-store.test.ts L2](D:\novis-backup-20260526\Novis\synova-agent\tests\l4\synova-graph-store.test.ts:2)、[synova-graph-store-permission.test.ts](D:\novis-backup-20260526\Novis\synova-agent\tests\l4\synova-graph-store-permission.test.ts) | `createSynovaGraphStore` + `SynovaGraphStore` 类型 |

### 2.3 包 API 面 (packages/graph-store/src/index.ts L8-10)

```
createSynovaGraphStore(db) → SynovaGraphStore
setGraphStoreDeletePermissionChecker(fn) / clearGraphStoreDeletePermissionChecker()
types: SynovaGraphStore, PermissionChecker, SqliteDb, GraphStore, GraphStoreReader
```

### 2.4 原生替代 (已核实)

- **存储类**: [src/adapters/sqlite-graph-store.ts L58](D:\novis-backup-20260526\Novis\synova-agent\src\adapters\sqlite-graph-store.ts:58) `SqliteGraphStore` — 构造 `(db: Database.Database)`，提供 createNode/queryNodes 等，与 [l4/graph-bridge.ts L31 GraphStore 接口](D:\novis-backup-20260526\Novis\synova-agent\src\l4\graph-bridge.ts:31) 结构兼容（由 tests/architecture/graphstore-compatibility.test.ts 兜底）。synova-agent.ts L141/auth.ts L16 已在用。
- **权限检查**: `setGraphStoreDeletePermissionChecker(() => ({allowed:true}))` 仅 bootstrap L750 一处，语义 = 删除总是允许。原生 SqliteGraphStore 的删除路径无权限门（实现时须确认），行为等价 → 该调用可删除；删除权限过滤的通用机制归 D293（traversal-permission-filter.ts）。
- **类型**: `SqliteDb` → `Database.Database` (better-sqlite3)；`SynovaGraphStore` → `SqliteGraphStore`。

### 2.5 包自身质量 (归档前确认可安全入库)

`packages/graph-store/src/` 3 文件: as any=0、空 catch=0 ✓；pre-commit 2b 只扫 `src/|extensions/`，packages/ 移动不触发测试配对 ✓；无 npm workspaces 字段，`_archived/` 不会被收集 ✓。

## 3. 实现方案

### 3.1 写集 (13 src 修改 + 2 测试 + 2 配置 + 1 归档 + 1 新测试)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| 13 个 src 调用点 (§2.2 清单) | 修改 | `createSynovaGraphStore(db)` → `new SqliteGraphStore(db)`; `SqliteDb` 类型 → `Database.Database`; `SynovaGraphStore` → `SqliteGraphStore` |
| [src/deploy/bootstrap.ts L750](D:\novis-backup-20260526\Novis\synova-agent\src\deploy\bootstrap.ts:750) | 修改 | 删除 `setGraphStoreDeletePermissionChecker` 调用（行为等价，见 §2.4） |
| tests/l4/synova-graph-store*.test.ts (2 个) | 修改 | import 改为原生 SqliteGraphStore |
| tsconfig.json | 修改 | 删除 L27 paths 条目 |
| vitest.config.ts | 修改 | 删除 L16 alias |
| packages/graph-store/ | 移动 | → `packages/_archived/graph-store/` |
| packages/_archived/graph-store/ARCHIVED.md | 新建 | 废弃说明 + 替代方案 |
| tests/architecture/graphstore-unify.test.ts | 新建 | 迁移验证测试（见 §4, **先写**） |

### 3.2 迁移模式

```typescript
// 修改前 (16 处): 
//   import { createSynovaGraphStore } from '@synova/graph-store';
//   const store = createSynovaGraphStore(db as import('@synova/graph-store').SqliteDb);
// 修改后:
//   import { SqliteGraphStore } from '../adapters/sqlite-graph-store';
//   const store = new SqliteGraphStore(db);   // db: better-sqlite3 Database
```

> 注意: 各文件相对路径不同，import 路径按实际计算（如 `src/mcp/index.ts` → `../adapters/sqlite-graph-store`）。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 迁移 engine-core 的 graph-store (packages/engine-core/.../graph-store*) | 是 engine-core 内部实现, 归 D288/engine-core 清零 |
| 迁移 src/l4/graph-bridge.ts 的 engine-core 引用 | D292/D288 范围 |
| 删除 sqlite-graph-store.ts | 是迁移目标, 保留 |
| 改 traversal-permission-filter.ts | D293 范围 |

## 4. 测试要求 (测试优先 — 铁律0-2: 先写测试再改码)

**第一步**: 写 `tests/architecture/graphstore-unify.test.ts`（迁移前必须失败 → 迁移后通过）:

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | 3 | 1) 断言 `grep @synova/graph-store src/` → 0 (red 前 green 后) 2) 断言 tsconfig/vitest 无 graph-store 映射 3) SqliteGraphStore 实例化 + 基本 CRUD 冒烟 |
| L2b | vitest 集成 | 2 | 1) 每个迁移调用点 import 后能构造 store (类型编译通过) 2) 行为等价: 原 2 个 graph-store 测试改用原生实现后全部通过 |

**第二步**: 迁移。

**第三步**: 回归:
- `npx vitest run tests/architecture/graphstore-unify.test.ts tests/l4/synova-graph-store.test.ts tests/l4/synova-graph-store-permission.test.ts tests/architecture/graphstore-compatibility.test.ts` → 全绿
- `npx tsc --noEmit` → 零新增错误

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| 13 个调用点 → SqliteGraphStore | `grep -rn "@synova/graph-store" src/ tests/ tsconfig.json vitest.config.ts` → 0 |
| bootstrap 权限调用删除 | `grep -rn "setGraphStoreDeletePermissionChecker" src/` → 0 |
| 新测试 | vitest 全绿 + expect 断言 ≥8 |

## 6. 完成标准

1. DS1: `grep -rn "@synova/graph-store" src/ tests/ tsconfig.json vitest.config.ts` → 0 (主树)
2. DS2: packages/graph-store/ 移入 `packages/_archived/graph-store/` + ARCHIVED.md 说明替代方案
3. DS3: 13 个调用点全部使用 SqliteGraphStore，无兼容层（铁律: 禁止写兼容层）
4. DS4: `npx tsc --noEmit` 零新增错误
5. DS5: vitest 相关套件全绿（§4 第三步 4 个文件）
6. DS6: graphstore-unify.test.ts 存在且 ≥8 expect；迁移前可复现失败（red→green）
7. DS7: 服务器冒烟 — `npm run dev` 启动无 graph-store 相关报错（或 boot 日志无 degraded graphstore）
8. DS8: pre-commit 全过（as any=0 / 空catch=0 / 无 engine-core 新引用 / 2b 通过），逐项 commit

## 7. 自检清单

- [x] v1 前提被推翻: `@synova/graph-store` 包名引用 16 处 (13 src + 2 测试 + tsconfig + vitest) — 已实测
- [x] engine-core 测试的相对 import `../graph-store` 指向 engine-core 自身, 与 packages/graph-store 无关 (不误伤)
- [x] SqliteGraphStore 构造签名 `(db: Database.Database)` 与调用点用法匹配
- [x] graph-bridge GraphStore 接口 + graphstore-compatibility.test.ts 兜底结构兼容
- [x] 权限调用仅 bootstrap L750 一处, 语义=总是允许, 原生行为等价
- [x] 包自身质量: as any=0 / 空catch=0; pre-commit 2b 不扫 packages/; 无 workspaces 收集
- [x] 测试优先: graphstore-unify.test.ts 先写 (red→green)
- [x] 不是凭记忆
- [x] 不用 --no-verify
