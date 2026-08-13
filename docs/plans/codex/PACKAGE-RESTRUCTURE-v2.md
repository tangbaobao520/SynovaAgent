<!--
  SynovaAgent 包结构重构 — 技术方案 v2.0
  2026-06-29
  审查范围: src/ 41个目录 + packages/ 11个包 + extensions/ 50个哨兵
  目标: 消灭三套并行体系, 消灭相对路径跨层引用, 消灭占位空壳包
-->

# SynovaAgent 包结构重构 — 技术方案 v2.0

> 给执行者(Claude Code)的指令:
> 每个 Phase 是自包含的独立任务。执行顺序不可调换。
> 每个 Phase 末尾有验收门禁 — 必须全部通过才能进入下一 Phase。
> 任何一步失败, 停下来报告, 不要继续。
> 禁止批量 commit。每个 Phase 独立 commit。
> 禁止 rm -rf 任何目录。删除前必须 grep 全仓库确认零引用。
> 禁止 sed 批量替换 import 路径。逐文件 apply_patch 编辑, 每次改完跑 tsc --noEmit。

---

## 零、审计发现: 三套体系并行

当前不是简单的"新旧并行", 而是三套体系同时存在:

### 体系 A: 旧 engine-core (退场中, 残留引用未清理)

`packages/engine-core/src/` 283 文件。被 9 个 src/ 文件通过 `@synova/diagnosis-engine` 转发包间接引用:
- `src/adapters/engine-core-adapter.ts` — DiagnosisOrchestrator + createGraphStore
- `src/ingest/index.ts` — ingestDocument
- `src/init/engine-context.ts` — setEngineContext
- `src/mcp/tool-registration.ts` — createGraphStore + 三个不存在的函数 (运行时 bug, 见下文)
- `src/routes/agent-observer.ts` — createGraphStore
- `src/routes/chat.ts` — createGraphStore
- `src/routes/diagnosis-upload-v2.ts` — createGraphStore
- `src/routes/ontology.ts` — createGraphStore + ingestDocument
- `src/tui-v2/chat.tsx` — createGraphStore

**隐藏 bug**: `src/mcp/tool-registration.ts:113-137` 动态 import 了 `findDiagnosticPaths`、`summarizeSubgraph`、`findCrossDimensionalBrokers`。这三者既不在 `@synova/diagnosis-engine` 导出列表中, 也不在 engine-core 任何文件中。运行时必定失败。Phase 3 修复。

### 体系 B: Synova 自研诊断引擎

`src/l3/synova-diagnosis-engine.ts` (343行) + `src/l3/synova-diagnosis-engine-impl.ts` (481行)。零 engine-core 依赖。默认使用。

### 体系 C: 哨兵引擎

`src/sentinel/` (15文件) + `extensions/sentinels/` (50哨兵)。compute 函数零外部依赖。

### 并行问题清单

| 模块 | 旧实现 | 新实现 | 冲突 |
|------|--------|--------|------|
| Logger | `packages/logger/src/index.ts` (0引用, 无脱敏) | `src/logger.ts` (179处引用, 含P0-5.2脱敏) | 旧是空壳 |
| Error types | `packages/error-types/` (107行) | `src/sentinel/types.ts` 自己定义了 DiagnosisErrorCode | 未统一 |
| GraphStore | `engine-core/.../graph-store.ts` (被9文件间接引用) | `src/l4/synova-graph-store.ts` (358行, server.ts直接使用) | 两个实例并存 |
| 专家子代理 | `engine-core/.../expert-subagent-executor.ts` (0引用, 已死) | `src/l3/expert-dispatcher.ts` (541行) | 旧已死 |
| 诊断管线 | `engine-core/.../DiagnosisOrchestrator` | `src/l3/synova-diagnosis-engine-impl.ts` | 旧可关 |

### 最危险的并行: GraphStore

`conversation-engine.ts:334`:
```typescript
createGraphStore: (db) => EngineCoreVendorAdapter.createGraphStore(db),
```
→ 调用 `@synova/diagnosis-engine` → `engine-core/.../graph-store.ts`。

`server.ts:233`:
```typescript
const { createSynovaGraphStore } = await import('./l4/synova-graph-store');
const store = createSynovaGraphStore(db);
```
→ 调用 `src/l4/synova-graph-store.ts`。

**两个 GraphStore 实例并存。** `server.ts` 用的是 SynovaGraphStore, `conversation-engine` 用的是 engine-core GraphStore。不同实例, 互不可见。


---

## 一、目标架构

```
packages/
├── error-types/           ① 地基 — 已实心(107行), 扩面使用
├── logger/                ② 地基 — 从空壳变实心, 迁入 src/logger.ts
├── sog-core/              ③ L4 本体类型 — 已落地(6文件, 20处引用)
├── sentinel-engine/       ④ L3 哨兵引擎 — 新建, 迁入 src/sentinel/
├── expert-platform/       ⑤ L3 专家平台 — 新建, 迁入 src/l3/expert-* + src/expert-platform/
├── graph-store/           ⑥ L4 图存储 — 新建, 迁入 src/l4/synova-graph-store.ts, 消灭并行
├── diagnosis-engine/      ⑦ L3 诊断引擎 — 重建, 迁入 src/l3/synova-diagnosis-engine*.ts
├── connector-registry/    ⑧ 横向 — 已落地(3文件)
└── extension-registry/    ⑨ 横向 — 已落地(3文件)

(删除: engine-core, engine-auth, agent-observer-mcp, knowledge-ingest)

extensions/
├── sentinels/             → 50哨兵, 消费 ④ 的类型
└── experts/               → 8专家配置, 消费 ⑤ 的类型

src/
├── routes/                L1 API
├── mcp/                   L1 MCP
├── tui-v2/                L1 TUI
├── agent/                 L2 ConversationEngine + DiagnosisLauncher
├── orchestrator/          L2 SubAgentCoordinator
├── adapters/              L2 适配器 (删除 engine-core-adapter.ts)
├── providers/             LLM providers
├── services/              横切服务
├── tools/                 专家工具
└── index.ts
```

### 依赖关系 (只允许向下)

```
                    ┌──────────────────┐
                    │   error-types ①   │◄─── 全体
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │    logger ②       │◄─── 全体
                    └────────┬─────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     │                       │                       │
┌────▼────┐          ┌───────▼───────┐       ┌───────▼───────┐
│sog-core │          │sentinel-engine│       │expert-platform│
│   ③     │          │      ④        │──►    │      ⑤        │
│  L4     │◄─────────│     L3        │       │     L3        │
└────┬────┘          └───────────────┘       └───────┬───────┘
     │                                                │
┌────▼────┐                                   ┌───────▼───────┐
│graph-   │◄──────────────────────────────────│  extensions/  │
│store ⑥ │                                    │  experts/     │
│  L4     │                                    └───────────────┘
└────┬────┘
     │
┌────▼────────────┐
│diagnosis-engine │
│      ⑦          │
│     L3          │
└────┬────────────┘
     │
┌────▼────┐
│  src/   │
│ L2 + L1 │
└─────────┘
```

**唯一允许的跨包依赖**:
- ④ → ③ (哨兵引擎引用本体类型)
- ⑤ → ④ (专家平台引用 SentinelFinding 类型)
- ⑦ → ⑤ + ⑥ (诊断引擎调用专家和存储)
- 所有包 → ① + ②

**禁止的依赖**:
- extensions/ 不 import 任何 src/ 下的文件
- src/ 不 import 任何 engine-core/ 下的文件
- L1 → L3/L4 直接引用 (铁律 39)

---

## 二、Phase 1: Logger 做实

风险: 最低。纯替换 import 路径, 无逻辑变更。
影响面: 179 个 src/ 文件 + 53 个 extensions/ 文件。

### Step 1.1: 将 src/logger.ts 内容迁入 packages/logger/src/index.ts

- 读取 `src/logger.ts` (103行, 含 P0-5.2 脱敏逻辑)
- 完整覆盖 `packages/logger/src/index.ts` (当前是旧副本, 无脱敏)
- 保留 `export const logger` + `export function createLogger(name: string)`

### Step 1.2: 替换 src/ 下所有 logger import

替换模式:
```
from '../logger'          → from '@synova/logger'
from '../../logger'       → from '@synova/logger'
from '../../../logger'    → from '@synova/logger'
```

逐文件编辑。每改完一个目录, 跑 `npx tsc --noEmit`。

### Step 1.3: 替换 extensions/sentinels/ 下所有 logger import

```
from '../../../src/logger' → from '@synova/logger'
```

### Step 1.4: 删除 src/logger.ts

tsconfig.json 中已有 `"@synova/logger": ["./packages/logger/src/index.ts"]`, 无需改动。

### 验收门禁

```bash
# 1. 零残留: src/logger.ts 不存在
test ! -f src/logger.ts

# 2. 零残留: 无任何文件再从相对路径 import logger
grep -rn "from '\.\.\/logger'" src/ extensions/ && echo "FAIL" || echo "PASS"
grep -rn "from '\.\.\/\.\.\/\.\.\/src\/logger'" extensions/ && echo "FAIL" || echo "PASS"

# 3. tsc 零错误
npx tsc --noEmit

# 4. vitest 全量通过
npx vitest run
```

---

## 三、Phase 2: Error types 扩面

风险: 低。`@synova/error-types` 已实心 (107行, `DiagnosticAgentError` + 9子类), 只是 src/ 未全面使用。

### Step 2.1: 删 src/sentinel/types.ts 中的 DiagnosisErrorCode

当前 `src/sentinel/types.ts:21-31` 定义了 `enum DiagnosisErrorCode`。
改为使用 `@synova/error-types` 的 `DiagnosticAgentError.code` 字段。
需要按错误码分支判断的地方, 改为 `instanceof` 检查或检查 `error.code` 字符串。

### Step 2.2: 删 src/l3/synova-diagnosis-engine-impl.ts 中的 DiagnosisError 类

第 55 行附近定义了本地 `DiagnosisError extends Error { code, phase, retryable }`。
改为 import `DiagnosticAgentError` from `@synova/error-types`。

### Step 2.3: 扩展 @synova/error-types 添加缺失的错误码

审查 `DiagnosisErrorCode` enum 中的值, 在 `@synova/error-types` 中未覆盖的, 创建对应子类或确认已有子类的 code 匹配。

### 验收门禁

```bash
# 1. src/ 中不再有自定义 DiagnosisError 类或 DiagnosisErrorCode enum
grep -rn "class DiagnosisError" src/ && echo "FAIL" || echo "PASS"
grep -rn "enum DiagnosisErrorCode" src/ && echo "FAIL" || echo "PASS"

# 2. tsc 零错误 + vitest 全量通过
npx tsc --noEmit && npx vitest run
```

---

## 四、Phase 3: Graph Store 独立 (消灭最关键并行)

风险: 中。影响 9 个文件的 import 路径 + conversation-engine 的 GraphStore 工厂函数。
目标: 切断 engine-core 的最大依赖链, 统一为单一 GraphStore 实例。

### Step 3.1: 创建 packages/graph-store/

```
packages/graph-store/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts          # 公开 API
    ├── graph-store.ts    # 从 src/l4/synova-graph-store.ts 迁入 (358行)
    └── types.ts          # GraphStore 接口类型 (从 src/l4/graph-bridge.ts 提取)
```

package.json 依赖: `@synova/sog-core`, `@synova/logger`, `@synova/error-types`, `better-sqlite3`。

index.ts 导出:
- `createSynovaGraphStore(db)` — 工厂函数
- `SynovaGraphStore` — 类
- `SqliteDb` — 数据库连接接口
- `GraphStore` — 抽象接口
- `GraphStoreReader` — 只读查询接口 (哨兵消费)

### Step 3.2: 迁移 src/l4/synova-graph-store.ts

完整复制到 `packages/graph-store/src/graph-store.ts`。
改 import: `from '../logger'` → `from '@synova/logger'`。
不改任何业务逻辑。

### Step 3.3: 迁移 GraphStore 接口类型

从 `src/l4/graph-bridge.ts:27-46` 提取 `GraphStore` 接口到 `packages/graph-store/src/types.ts`。
加入 `GraphStoreReader` (哨兵使用的只读子集):
```typescript
export interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string;type:string;props:Record<string,unknown>}>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{id:string;type:string;from:string;to:string;weight:number;props:Record<string,unknown>}>;
  getNode(id: string, graph: string): Record<string,unknown> | null;
}
```

### Step 3.4: 更新 conversation-engine.ts

`src/agent/conversation-engine.ts:334`:
```typescript
// 旧:
createGraphStore: (db) => EngineCoreVendorAdapter.createGraphStore(db),
// 新:
createGraphStore: (db) => import('@synova/graph-store').then(m => m.createSynovaGraphStore(db as any)),
```

同时删 `import { EngineCoreVendorAdapter } from '../adapters/engine-core-adapter'` (第 39 行)。

### Step 3.5: 替换 9 个文件中的 @synova/diagnosis-engine 引用

| 文件 | 旧 import | 新 import |
|------|----------|----------|
| `src/routes/agent-observer.ts` | `createGraphStore` from `@synova/diagnosis-engine` | `createSynovaGraphStore` from `@synova/graph-store` |
| `src/routes/chat.ts` | `createGraphStore` from `@synova/diagnosis-engine` | `createSynovaGraphStore` from `@synova/graph-store` |
| `src/routes/diagnosis-upload-v2.ts` | `createGraphStore` from `@synova/diagnosis-engine` | `createSynovaGraphStore` from `@synova/graph-store` |
| `src/routes/ontology.ts` | `createGraphStore`, `ingestDocument` from `@synova/diagnosis-engine` | `createSynovaGraphStore` from `@synova/graph-store`; `ingestDocument` 改为本地实现 |
| `src/tui-v2/chat.tsx` | `createGraphStore` from `@synova/diagnosis-engine` | `createSynovaGraphStore` from `@synova/graph-store` |
| `src/ingest/index.ts` | `ingestDocument` from `@synova/diagnosis-engine` | 改为用 `@synova/graph-store` + 自有逻辑 |
| `src/init/engine-context.ts` | `setEngineContext` from `@synova/diagnosis-engine` | 改为本地实现或删除 |
| `src/mcp/tool-registration.ts` | `createGraphStore` + 三个不存在的函数 | `createSynovaGraphStore`; 三函数改用 `SynovaGraphStore` 的 `queryNodes`/`findPaths`/`traverse` |
| `src/adapters/engine-core-adapter.ts` | 整个文件 | Phase 7 删除 |

### Step 3.6: 修复 mcp/tool-registration.ts 的运行时 bug

`findDiagnosticPaths`、`summarizeSubgraph`、`findCrossDimensionalBrokers` 三函数在任何地方都不存在。
改为使用 `SynovaGraphStore` 的 `queryNodes`/`queryEdges`/`findPaths`/`traverse` 方法实现同等功能。

### Step 3.7: 更新 tsconfig.json paths

```json
"@synova/graph-store": ["./packages/graph-store/src/index.ts"]
```

### 验收门禁

```bash
# 1. @synova/diagnosis-engine 零引用 (src/ 中)
grep -rn "@synova/diagnosis-engine" src/ && echo "FAIL" || echo "PASS"

# 2. engine-core 零引用 (src/ 中)
grep -rn "engine-core" src/ && echo "FAIL" || echo "PASS"

# 3. 独立编译 packages/graph-store
cd packages/graph-store && npx tsc --noEmit && cd ../..

# 4. 全量 tsc + vitest
npx tsc --noEmit && npx vitest run
```

---

## 五、Phase 4: Sentinel Engine 独立

风险: 中。50 个哨兵的 import 路径需要全量替换。
源文件: `src/sentinel/` 下 15 文件。

### Step 4.1: 创建 packages/sentinel-engine/

```
packages/sentinel-engine/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts              # 公开 API
    ├── types.ts              # SentinelConfig, SentinelFinding, SentinelContext, ...
    ├── registry.ts           # SentinelRegistryImpl
    ├── runner.ts             # SentinelRunner
    ├── signal-aggregator.ts  # aggregateSignals()
    ├── flywheel-aggregator.ts# computeFlywheelSpeeds()
    ├── sentinel-loader.ts    # loadSentinels(), registerLoadedSentinels()
    ├── sentinel-runner.ts
    ├── baseline-store.ts
    └── builtins.ts
```

### Step 4.2: 修改 types.ts — 修复已知类型裂痕

`SentinelFinding.severity` 当前是 `'critical' | 'warning' | 'info'`。
runner.ts 中 `severityRank` 硬编码了 `emergency: 3` 但类型中不存在。
加入 `'emerggency'`:
```typescript
export interface SentinelFinding {
  severity: 'critical' | 'warning' | 'info' | 'emergency';
  ...
}
```

### Step 4.3: 替换 50 个哨兵的 import

`extensions/sentinels/{sentinel-name}/aggregate.ts`:
```
from '../../../src/sentinel/types' → from '@synova/sentinel-engine'
```

`extensions/sentinels/{sentinel-name}/computes/*.ts`:
```
from '../../../../src/sentinel/types' → from '@synova/sentinel-engine'
```

共 50 个哨兵, 每个至少 1 个 aggregate.ts + 1 个 compute, 约 100 个文件。

### Step 4.4: 更新 tsconfig.json

```json
"@synova/sentinel-engine": ["./packages/sentinel-engine/src/index.ts"]
```

### 验收门禁

```bash
# 1. extensions/sentinels/ 中零残留旧路径
grep -rn "src/sentinel/types" extensions/ && echo "FAIL" || echo "PASS"

# 2. 独立编译 + 全量 tsc + vitest
cd packages/sentinel-engine && npx tsc --noEmit && cd ../..
npx tsc --noEmit && npx vitest run
```

---

## 六、Phase 5: Expert Platform 独立

风险: 中。ExpertDispatcher 被哨兵引擎和诊断引擎双线调用。
源文件: `src/l3/expert-dispatcher.ts` (541行), `src/l3/expert-autonomy.ts`, `src/l3/expert-registry.ts`, `src/l3/expert-output-schema.ts`, `src/l3/quality-firewall.ts`, `src/expert-platform/` 下 5 文件。

### Step 5.1: 创建 packages/expert-platform/

```
packages/expert-platform/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── dispatcher.ts         # 从 src/l3/expert-dispatcher.ts 迁入
    ├── autonomy.ts           # 从 src/l3/expert-autonomy.ts 迁入
    ├── registry.ts           # 从 src/l3/expert-registry.ts 迁入
    ├── output-schema.ts      # 从 src/l3/expert-output-schema.ts 迁入
    ├── quality-firewall.ts   # 从 src/l3/quality-firewall.ts 迁入
    ├── store.ts              # 从 src/expert-platform/store.ts 迁入
    ├── validator.ts          # 从 src/expert-platform/validator.ts 迁入
    ├── types.ts              # 从 src/expert-platform/types.ts 迁入
    ├── extractor.ts          # 从 src/expert-platform/extractor.ts 迁入
    ├── outcome-tracker.ts    # 从 src/expert-platform/outcome-tracker.ts 迁入
    └── loader.ts             # 新建: 从 expert/ 目录加载专家配置
```

依赖: `@synova/sentinel-engine`, `@synova/logger`, `@synova/error-types`。

### Step 5.2: 替换引用

`src/l3/` 中其他文件 + `packages/sentinel-engine/src/runner.ts` 中的 `ExpertDispatcher` 引用。

### 验收门禁

```bash
# 独立编译 + 全量 tsc + vitest
```

---

## 七、Phase 6: Diagnosis Engine 重建

风险: 中高。

### Step 6.1: 重建 packages/diagnosis-engine/src/

不再转发 engine-core。改为包含 Synova 自有诊断引擎:

```
packages/diagnosis-engine/src/
├── index.ts                    # 公开 API
├── diagnosis-engine.ts         # 从 src/l3/synova-diagnosis-engine.ts 迁入
├── diagnosis-engine-impl.ts    # 从 src/l3/synova-diagnosis-engine-impl.ts 迁入
└── interfaces.ts               # 从 src/l2-interfaces/diagnosis-engine.ts 迁入
```

依赖: `@synova/graph-store`, `@synova/expert-platform`, `@synova/logger`, `@synova/error-types`。

### Step 6.2: 替换 src/ 中的引用

```
from '../l3/synova-diagnosis-engine'         → from '@synova/diagnosis-engine'
from '../l3/synova-diagnosis-engine-impl'    → from '@synova/diagnosis-engine'
from '../l2-interfaces/diagnosis-engine'     → from '@synova/diagnosis-engine'
```

### 验收门禁

```bash
# packages/diagnosis-engine 不再 import engine-core
grep -rn "engine-core" packages/diagnosis-engine/ && echo "FAIL" || echo "PASS"
```

---

## 八、Phase 7: 删除 Engine Core

前置: Phase 3-6 全部通过验收。

```bash
# 最终确认零引用
grep -rn "engine-core" src/ packages/ --exclude-dir=engine-core && echo "FAIL — 仍有引用" || echo "PASS"

# 删除
git rm -r packages/engine-core/
git rm src/adapters/engine-core-adapter.ts

# 清理 tsconfig paths
# 删除 "@synova/engine-core" 和 "@synova/engine-core/src/*"
```

---

## 九、Phase 8: 僵尸清理

| 包 | 引用数 | 动作 |
|----|--------|------|
| `packages/engine-auth/` | 0 | `git rm -r` |
| `packages/agent-observer-mcp/` | 0 | `git rm -r` |
| `packages/knowledge-ingest/` | 1 (src/ingest/index.ts) | 逻辑并入 `src/ingest/`, 然后 `git rm -r` |

清理 tsconfig paths 中对应条目。

---

## 十、迁移前后对比

### 迁移前

```
L1 chat.ts → @synova/diagnosis-engine → engine-core/graph-store.ts (旧)
L2 conversation-engine → EngineCoreVendorAdapter → engine-core/graph-store.ts (旧)
L4 server.ts → src/l4/synova-graph-store.ts (新)

问题: 两个 GraphStore 实例, 互不可见
```

### 迁移后

```
L1 chat.ts → @synova/graph-store → createSynovaGraphStore() (唯一实现)
L2 conversation-engine → @synova/graph-store → createSynovaGraphStore() (同一实例)
L4 server.ts → @synova/graph-store → createSynovaGraphStore() (同一实例)

结果: 单一 GraphStore 实例, 全应用共享
