> 权威文档14 第一章 | 2026-07-14 | v1.0
> 定位：施工文档——从空机器到完整运行的精确加载顺序，以及运行中的热重载协议

---

# 第一章：系统启动序列与热重载协议

## 零、本文档的读者与使用方式

本文档是**施工文档**，不是架构说明。每一个 Phase 都精确到具体的文件路径、函数名、SQL 建表语句、失败回滚命令。新工程师应能对着本文档实现在空机器上启动 Synova 的全部加载逻辑。

所有引用的源文件路径均基于仓库根目录。

---

## 一、启动序列总览（Phase 0 → Phase 5）

```
Phase 0  基础设施    < 2s     SQLite连接池 → Logger → ConfigLoader → EnvValidator
Phase 1  存储层      < 3s     GraphStore(建表+Schema迁移) → SOG-Core校验 → KnowledgeStore检查
Phase 1.5 数据预置   < 2s     行业基准数据检查 + 企业本体数据检查
Phase 2  核心引擎    < 8s     2a SentinelLoader → 2b SkillLoader → 2c PlaybookLoader → 2d CausalChainLoader
Phase 3  本体计算层  < 5s     42边transfer_function注册 → compute函数加载 → ToolRegistry → CausalChainRegistry索引
Phase 4  专家与安全  < 5s     ExpertPromptLoader → PolicyEngine(D38) → DataBoundary
Phase 5  交互层      < 3s     HTTP Server → MCP Server → Electron Desktop → CronScheduler
```

总启动时间目标：< 28s（空机器，无缓存）。每 Phase 有独立的 health check、回滚策略、失败信号。

当前代码实现的入口位于 `src/index.ts`——调用链为 `initEngineContext()` → `new SynovaAgent(db)` → `agent.start()`。本文档定义的 Phase 0-5 是对这一启动链的完整结构化表达，包含当前尚未显式分离的模块。

---

## 二、Phase 0：基础设施（目标 < 2s）

### 2.1 模块列表与加载函数

| 序号 | 模块 | 加载函数 / 文件 | 依赖 | 实际源码行为 |
|------|------|---------------|------|------------|
| 0.1 | SQLite 连接池 | `src/init/engine-context.ts:initEngineContext()` → `new Database(config.dbPath)` | 无 | `better-sqlite3` 打开文件。WAL 模式启用，NFS/SMB 不可用时降级 DELETE（函数 `enableWAL()`）。`pragma foreign_keys = ON`。 |
| 0.2 | Logger | `@synova/logger:createLogger()` | 0.1 | pino 实例。日志级别由 `LOG_LEVEL` 环境变量或 `synova.json` 控制。 |
| 0.3 | ConfigLoader | `src/config.ts:loadConfig()` | 无（仅需 fs） | 依次读取 `synova.json`（`loadFileConfig()`）→ 环境变量。损坏时从 `.bak` 恢复（`ConfigRecovery.verify()`）。 |
| 0.4 | EnvValidator | `src/config.ts:loadConfig()` 内联 | 0.3 | 非 DEV_MODE + 无 LLM_API_KEY + 无 GATEWAY_HOST → WARN 日志，`llmConfigured = false`。不阻断启动。 |

### 2.2 依赖关系图

```
SQLite连接池 ──┐
               ├──→ Logger
               │
ConfigLoader ──┘
       │
       └──→ EnvValidator
```

ConfigLoader 不依赖 SQLite。Logger 依赖 SQLite 仅因 `engine-context.ts` 的实现约定（先 `db = new Database()`，再 `createLogger()`），非逻辑必需。

### 2.3 耗时估计

| 模块 | 估计耗时 | 依据 |
|------|---------|------|
| SQLite 连接池 | ~200ms | better-sqlite3 本地文件打开 |
| Logger | ~10ms | pino 初始化 |
| ConfigLoader + EnvValidator | ~100ms | JSON 解析 + 环境变量读 |
| **Phase 0 合计** | **~310ms** | |

### 2.4 失败策略（可执行）

```
SQLite连接池失败：
  → 错误码 1，进程退出（当前 src/index.ts 的行为：try/catch → process.exit(1)）
  → 无回滚需要（无状态已写入）

ConfigLoader 失败（synova.json 不可解析 + .bak 也损坏）：
  → 降级到纯环境变量模式
  → log.warn("配置文件损坏且无法恢复 — 使用默认值")
  → 不阻断启动

EnvValidator 失败（无 API key 且非 DEV_MODE 且无 GATEWAY）：
  → log.warn("诊断功能将不可用")
  → llmConfigured = false
  → 不阻断启动（HTTP/MCP 服务仍启动，仅诊断 API 返回 503）
```

### 2.5 Health Check

```bash
# Phase 0 HC: 确认 SQLite 连接可用
node -e "const {initEngineContext,getDatabase} = require('./dist/init/engine-context'); initEngineContext(); getDatabase().pragma('journal_mode'); console.log('OK');"
```

检查项：`getDatabase()` 不抛异常 + journal_mode 返回 'wal' 或 'delete'。


---

## 三、Phase 1：存储层（目标 < 3s）

### 3.1 模块列表与加载函数

| 序号 | 模块 | 加载函数 / 文件 | 依赖 | 实际源码行为 |
|------|------|---------------|------|------------|
| 1.1 | GraphStore 建表 + Schema 迁移 | `packages/engine-core/src/pipeline/diagnosis/graph-store.ts:SQLiteGraphStore.initSchema()` | Phase 0.1 (db实例) | 三阶段执行：(1) `CREATE TABLE IF NOT EXISTS graph_nodes` + `graph_triples` + 6个索引；(2) `ALTER TABLE ADD COLUMN` 迁移 valid_to/updated_at/confidence/source；(3) 补建 valid_to 索引。所有 ALTER 用 try/catch 包裹——列已存在时静默忽略。 |
| 1.2 | engine-context 建表 | `src/init/engine-context.ts:initEngineContext()` 内 `db.exec()` | Phase 1.1 | 建 `collaboration_events`、`routing_events`、`agent_metrics`、`agent_contracts`、`team_changes` 五张表 + 对应索引。 |
| 1.3 | Schema 版本化迁移 | `src/init/engine-context.ts` → `require('../store/schema-migration').reconcileSchema(db)` | Phase 1.2 | `reconcileSchema()` 对比 `schema_version` 表与预期版本号，执行差异迁移。失败 → log.warn + degraded，不阻断。 |
| 1.4 | SOG-Core 枚举校验 | `@synova/sog-core:SOGNodeType` / `SOGEdgeType` 枚举导入 | Phase 1.1 | 导入时静态校验——无效枚举值 → TypeScript 编译失败。运行时校验在 `createNode`/`createEdge` 每次调用时执行。 |
| 1.5 | KnowledgeStore 检查 | 尚未独立模块化（当前为哨兵数据源检查逻辑） | Phase 1.4 | 检查 `data/seed/industry-baselines.json` 是否存在。 |

### 3.2 依赖关系图

```
Phase 0 db 实例
    │
    ├──→ 1.1 GraphStore.initSchema()  [graph_nodes + graph_triples 建表]
    │         │
    │         └──→ 1.4 SOG-Core 枚举校验
    │
    ├──→ 1.2 engine-context 建表  [collaboration_events 等 5 表]
    │         │
    │         └──→ 1.3 Schema 版本化迁移 (reconcileSchema)
    │
    └──→ 1.5 KnowledgeStore 检查
```

1.1 和 1.2 可并行（操作不同表集），当前实现因 `SQLiteGraphStore` 构造在 `engine-context` 之后而串行。

### 3.3 耗时估计

| 模块 | 估计耗时 | 依据 |
|------|---------|------|
| GraphStore 建表 | ~300ms | 2 表 + 9 索引 + 5 ALTER（try/catch 快速路径） |
| engine-context 建表 | ~100ms | 5 表 + 5 索引 |
| Schema 迁移 | ~100ms | reconcileSchema 对比版本号，多数情况零迁移 |
| SOG-Core 校验 | ~5ms | 静态导入，无运行时成本 |
| KnowledgeStore 检查 | ~50ms | JSON 文件存在性检查 |
| **Phase 1 合计** | **~555ms** | |

### 3.4 失败策略（可执行）

```
GraphStore 建表失败（SQLITE_CORRUPT / SQLITE_READONLY）：
  → log.error({ err }, 'graph_nodes 建表失败')
  → 回滚：删除 .db 文件（如果是首次创建）或保留旧文件（如果是迁移）
  → 终止启动，错误码 2

ALTER TABLE 失败（列已存在）：
  → catch 块静默忽略（当前实现：try { ALTER } catch { /* 列已存在 */ }）
  → 不阻断，继续

reconcileSchema 失败：
  → log.warn({ err: msg }, 'Schema 迁移失败 — degraded')
  → 不阻断，继续启动
  → GA 面板显示 "Schema 迁移待处理" 警告

SOG-Core 导入失败：
  → TypeScript 编译阶段已阻断（铁律 36：vitest 零失败）
  → 运行时不会发生
```

### 3.5 Health Check

```bash
# Phase 1 HC: 确认核心表存在且可读写
node -e "
const {initEngineContext,getDatabase} = require('./dist/init/engine-context');
initEngineContext();
const db = getDatabase();
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
const required = ['graph_nodes','graph_triples','collaboration_events','routing_events','agent_metrics'];
const missing = required.filter(t => !tables.find(r => r.name === t));
if (missing.length) throw new Error('Missing tables: ' + missing.join(','));
console.log('OK: ' + tables.length + ' tables');
"
```

检查项：5 张核心表全部存在（graph_nodes, graph_triples, collaboration_events, routing_events, agent_metrics）。

---

## 四、Phase 1.5：数据预置（目标 < 2s）

Phase 1.5 介于存储层就绪和引擎加载之间。目的是确保哨兵基线对比所需的基础数据存在——没有基准数据的哨兵无法产生有意义的 Finding。

### 4.1 模块列表与加载函数

| 序号 | 模块 | 加载函数 / 文件 | 依赖 | 实际行为 |
|------|------|---------------|------|---------|
| 1.5.1 | 行业基准数据检查 | `data/seed/industry-baselines.json` 存在性检查 | Phase 1.1 | 文件存在 → 解析 JSON → 校验 `industries` 数组非空 → 写入 KnowledgeStore（`INSERT OR IGNORE INTO knowledge_baseline`）。文件不存在 → 跳过，标记 `baselineMissing: true`。 |
| 1.5.2 | 企业本体数据检查 | GraphStore 查询 `queryNodes('Enterprise', {}, orgId)` | Phase 1.1 | `SELECT COUNT(*) FROM graph_nodes WHERE type='Enterprise' AND valid_to IS NULL AND graph=?`。Count = 0 → 系统进入"待配置"状态。Count > 0 → 正常。 |

### 4.2 "待配置"状态协议

当 1.5.2 发现零企业数据时的系统行为：

```
状态码：SYSTEM_STATUS = 'pending_configuration'
HTTP 服务：正常启动（监听端口 3000）
健康端点 GET /health：200 { status: 'pending_configuration', message: '企业数据未配置' }
诊断端点 POST /api/diagnosis/start：503 { error: 'ENTERPRISE_NOT_CONFIGURED', message: '请先配置企业本体数据' }
哨兵扫描：跳过（所有哨兵返回 degraded，不产生 Finding）
GA 面板：显示"待配置"引导流程——上传 synova.json 或通过 API 创建 Enterprise 节点
```

### 4.3 失败策略（可执行）

```
行业基准文件不存在：
  → log.info('industry-baselines.json 不存在 — 哨兵将在无基线模式下运行')
  → baselineMissing = true
  → 不阻断启动
  → 首次哨兵扫描时自动创建基线（BaselineStore 冷启动模式）

行业基准文件存在但 JSON 解析失败：
  → log.warn({ err }, 'industry-baselines.json 解析失败 — 使用空基线')
  → baselineMissing = true
  → 不阻断启动

企业数据为零：
  → 状态切换为 'pending_configuration'（见 §4.2）
  → 不阻断启动（HTTP 正常，诊断 503）
```

---

## 五、Phase 2：核心引擎（目标 < 8s）

Phase 2 是本系统最关键的子顺序依赖链。四个 Loader 的加载顺序**不可调换**，原因见 §5.5。

### 5.1 Phase 2a：SentinelLoader（目标 < 3s）

**文件**：`src/sentinel/sentinel-loader.ts`

**加载函数**：`loadSentinels()` → `registerLoadedSentinels()`

**执行步骤**：

```
Step 1: loadSentinels()
  → 扫描 extensions/sentinels/ 目录（排除 shared/ 和 _ 前缀目录）
  → 逐个读取 {name}/manifest.json
  → 解析为 SentinelManifest 接口
  → 缓存到内存 cache: LoadedSentinel[]
  → 返回 { sentinels, degraded, errors }

Step 2: registerLoadedSentinels()
  → 遍历 loadSentinels() 返回的 sentinels 数组
  → 对每个哨兵：
    a. 动态 import 其 entryPoint（如 ./aggregate.ts）
    b. 提取 exportKey 指定的导出函数（需有 check() 方法）
    c. 校验 dependsOn.nodeTypes 和 requiredFields 是否在本体中存在
    d. 调用 getSentinelRegistry().register() 包装为 Sentinel 接口
  → 返回 { registered, errors }

当前注册 50 个哨兵（extensions/sentinels/manifest.json 的 sentinels 字段）：
  finance: 8 | org: 15 | tech: 8 | marketing: 1 | strategy: 7 | business_model: 3
  另有扩展哨兵（如增长导航方案级哨兵）在 Phase 5 CronScheduler 注册
```

**manifest.json 结构**（`extensions/sentinels/manifest.json`）：

```json
{
  "name": "sentinels",
  "version": "1.0.0",
  "type": "sentinel",
  "sentinels": {
    "finance": ["capital-health", "margin-health", "revenue-health", "cash-runway", ...],
    "org": ["key-person-risk", "internal-transaction-cost", ...],
    ...
  }
}
```

注意：此 manifest.json 是顶级索引，不是单哨兵定义。单哨兵的 manifest.json 位于 `extensions/sentinels/{name}/manifest.json`，`loadSentinels()` 实际读取后者。

**当前实现的关键行为**：

- `registerLoadedSentinels()` 中已实现 `dependsOn` 数据依赖校验——检查哨兵依赖的 `nodeTypes` 是否在 `ontology.nodeTypes` 中存在，`requiredFields` 是否在节点类型的 `requiredProps` 或 `optionalProps` 中。依赖不满足 → `log.warn` + 哨兵仍注册但标记 degraded。
- 注册时包装 `sentinelObj.check(store, teamId, traversal)` → 自动注入 GraphTraversal 实例（V4.3.0）。

### 5.2 Phase 2b：SkillLoader（目标 < 2s）

**设计来源**：权威文档12 §三 — `src/skill/skill-loader.ts`

**加载函数**：`loadSkills()`

**扫描路径优先级**（低 → 高，高优先级覆盖低优先级）：

```
1. skills/builtin/     — 出厂内置（最低优先级）
2. skills/industry/    — 行业专家贡献
3. skills/custom/      — 企业 GA 定制（最高优先级）
```

**执行步骤**：

```
Step 1: 遍历三个根目录，读取每个子目录的 manifest.json + SKILL.md
Step 2: 跳过 lifecycle === 'archived' 的 Skill
Step 3: 同名 Skill 以最高优先级路径覆盖
Step 4: 依赖校验——对每个 Skill 执行 validateDependencies()
  → 检查 dependencies.skills: 每个依赖 Skill 是否存在 + 版本匹配（SemVer range）
  → 检查 dependencies.tools: 每个依赖 Tool 是否在 ToolRegistry 中注册 + 版本匹配
  → 检查 dependencies.sentinels: 每个哨兵 ID 是否在 SentinelRegistry 中已注册
  → 检查 dependencies.edges: 每个边 ID 是否在 42 边清单中存在
  → 检查 dependencies.computes: 每个 compute contractId 是否在 compute 注册表中存在
Step 5: 依赖缺失/版本不兼容 → 标记 lifecycle='degraded' + 写入 errors[]
Step 6: 不阻塞启动——errors 仅在返回值的 degraded 字段中体现
```

**子顺序依赖（§5.5 详述）**：

- `dependencies.sentinels` 字段要求 SentinelLoader（Phase 2a）已注册完所有哨兵 → **必须先于 SkillLoader**

**manifest.json Schema 关键字段**（参见权威文档12 §二）：

```typescript
interface SkillManifest {
  name: string;               // kebab-case
  version: string;            // SemVer 2.0
  lifecycle: "active" | "deprecated" | "archived";
  dependencies: {
    skills?: Record<string, string>;   // { "acquire-cashflow-data": ">=1.0.0 <2.0.0" }
    tools?: Record<string, string>;
    sentinels: string[];               // ← 这是顺序依赖的关键字段
    edges: string[];
    computes: string[];
  };
  loading: "always" | "on-demand";
  entryPoint: string;          // "./SKILL.md"
}
```

### 5.3 Phase 2c：PlaybookLoader（目标 < 2s）

**设计来源**：权威文档12 §四 — Playbook YAML Schema

**加载函数**：`loadPlaybooks()`

**扫描路径**：`playbooks/*.yaml`（或 `playbooks/*/playbook.yaml`）

**执行步骤**：

```
Step 1: 扫描 playbooks/ 目录，解析 YAML
Step 2: 校验 playbook 结构——id/name/version/steps 必填
Step 3: 校验 trigger 条件——trigger.sentinel 是否在 SentinelRegistry 中存在
Step 4: 校验 contextRequirements——edges/computes/sentinels 引用是否存在
Step 5: 校验 steps[].tool 字段——每个 step 的 tool 是否在 SkillRegistry/ToolRegistry 中已注册
  → 这是 Phase 2c 必须在 SkillLoader 之后的原因（§5.5）
Step 6: 优先级覆盖——custom/ > industry/ > builtin/（与 SkillLoader 相同模式）
Step 7: 依赖校验失败 → 标记 degraded，不阻塞启动
```

**YAML 关键结构**（参见权威文档12 §四）：

```yaml
playbook:
  id: "finance-profitability-root-cause"
  name: "利润率下降根因分析"
  version: "1.2.0"
  steps:
    - step: 1
      tool: "tool_cross_validate"     # ← 引用 Skill/Tool ID，必须已在 Phase 2b 注册
      onFailure: "halt"
    - step: 2
      tool: "computeDOL"              # ← 引用 compute function
      onFailure: "degrade"
```

### 5.4 Phase 2d：CausalChainLoader（目标 < 1s）

**扫描路径**：`causal-chains/*.yaml`

**加载函数**：`loadCausalChains()`

**执行步骤**：

```
Step 1: 扫描 causal-chains/ 目录，解析 YAML
Step 2: 校验因果链结构——id/name/edges 数组必填
Step 3: edges 中的每个 edgeId 校验是否在 42 边清单中存在
  → 不存在 → 标记 degraded + WARN 日志
Step 4: 注册到 CausalChainRegistry（内存索引：edgeId → causalChain[]）
Step 5: 不阻塞启动——缺失边不阻断，仅该因果链不可用
```

**与 SentinelLoader 的关系**：独立，无相互依赖。两者的唯一交集在运行时——哨兵检测到异常后可能触发因果链追溯。

### 5.5 子顺序依赖逻辑（关键）

Phase 2a → 2b → 2c 的加载顺序**不可调换**。Phase 2d 与 2a 独立。

```
2a SentinelLoader
    │
    │ dependencies.sentinels 字段引用已注册的哨兵 ID
    ▼
2b SkillLoader
    │
    │ steps[].tool 字段引用已注册的 Tool/Skill ID
    ▼
2c PlaybookLoader

2d CausalChainLoader（独立——与 2a 可并行）
```

**为什么是这个顺序**：

1. **SkillLoader 依赖 SentinelLoader**：Skill 的 `manifest.json` 中的 `dependencies.sentinels` 字段是一个字符串数组，包含该 Skill 需要的哨兵 ID（如 `["cash-runway", "profit-health"]`）。`loadSkills()` 在依赖校验阶段通过 `validateDependencies()` 检查这些哨兵 ID 是否在 SentinelRegistry 中存在。**如果在 SentinelLoader 还未完成注册时执行此检查，将产生假阳性失败**——所有依赖哨兵的 Skill 都被标记为 degraded。

2. **PlaybookLoader 依赖 SkillLoader**：Playbook 的 `steps[].tool` 字段引用 Tool ID，这些 Tool 在 Skill 注册时才被加载到 ToolRegistry。例如 `computeDOL` 这个 Tool 是在 Skill 的 `dependencies.tools` 中声明、在 Skill 加载时注册的。**如果在 SkillLoader 之前加载 Playbook，`steps[].tool` 的校验将全部失败**——即使 Tool 本身有效。

3. **SentinelLoader 和 CausalChainLoader 相互独立**：哨兵不引用因果链（哨兵的 `computes` 数组引用 compute 函数，不引用因果链 YAML），因果链不引用哨兵（因果链引用的是 42 边，不引用 SentinelRegistry）。两者的唯一交集在运行时——哨兵检测到异常后触发因果链追溯，但这是编排逻辑，不影响加载顺序。

4. **CausalChainLoader 的位置**：可以与 SentinelLoader 并行加载（Phase 2a 和 2d 同时执行），但当前文档推荐放在 Phase 2c 之后——因为它依赖 42 边清单（与 Phase 3 共享同一份边清单），放在最后可以复用 Phase 2 的全局错误处理。

### 5.6 Phase 2 统一失败策略（可执行）

```
任何 Loader 的 manifest.json 解析失败：
  → 该条目跳过，记入 errors[]
  → 不阻断该 Loader 的其他条目加载
  → 不阻断其他 Loader
  → 返回 degraded: true

依赖校验失败（哨兵/Skill/Tool/Compute 引用不存在）：
  → 标记该条目 lifecycle = 'degraded'
  → log.warn({ name, dependency, missingId }, '依赖缺失 — degraded')
  → 写入 L4 事件流（EventStore.append()）供 GA 面板展示
  → 不阻断启动

整个 Loader 崩溃（未捕获异常）：
  → 回滚该 Loader 的缓存（如 clearSentinelCache()）
  → log.error({ err }, 'Loader 崩溃 — 回滚')
  → 不阻断其他 Loader
  → 不阻断 Phase 1（GraphStore 仍完好）
  → GA 面板显示 "核心引擎部分降级"

Health check 超时 30s（整个 Phase 2 超过 30s 未完成）：
  → 中断当前 Loader，保留已加载的条目
  → log.error('Phase 2 health check 超时 30s')
  → 以 degraded 状态继续 Phase 3
```

### 5.7 Phase 2 Health Check

```bash
# Phase 2 HC: 确认关键 Loader 已注册条目
node -e "
const { loadSentinels } = require('./dist/sentinel/sentinel-loader');
const { sentinels, errors } = loadSentinels();
console.log('Sentinels: ' + sentinels.length + ', errors: ' + errors.length);
if (sentinels.length === 0 && errors.length > 0) throw new Error('所有哨兵加载失败');
"
```

检查项：至少有一个哨兵注册成功（`sentinels.length > 0`）或 errors 不包含致命错误。


---

## 六、Phase 3：本体计算层（目标 < 5s）

### 6.1 模块列表与加载函数

| 序号 | 模块 | 加载函数 / 文件 | 依赖 | 实际源码行为 |
|------|------|---------------|------|------------|
| 3.1 | 42 边 transfer_function 注册 | `packages/engine-core/src/pipeline/diagnosis/` 下的 transfer-function 定义文件 | Phase 2d（边清单） | 每条边定义为纯函数：`(params: EdgeParams) => EdgeResult`。注册到边注册表（内存 Map<edgeId, TransferFunction>）。 |
| 3.2 | compute 函数加载 | `extensions/sentinels/shared/computes/` 目录 + `src/orchestrator/module-runner.ts:ModuleRunner.runAll()` | Phase 3.1 | ModuleRunner 以 maxParallel=10 并行执行 compute 模块。每个模块独立超时（默认 30s），失败 → degradedModules[]。 |
| 3.3 | ToolRegistry | `src/tools/tool-registry.ts:ToolRegistry` | Phase 2b（Skill 注册的 Tool） + Phase 3.2 | `register()` 注册 ToolDef。`validateAtomicity()` 检查 contractId + hasTests + skills 复用度。PolicyEngine 门禁在 `invoke()` 时执行。 |
| 3.4 | CausalChainRegistry 索引构建 | 因果链注册表（内存 Map） | Phase 2d（因果链已加载） | 构建反向索引：edgeId → causalChain[]。支持"某条边被哪些因果链引用"的快速查询。 |

### 6.2 依赖关系图

```
Phase 2d 因果链 → 3.1 42边注册 → 3.2 compute加载 ──┐
                                                     ├──→ 3.3 ToolRegistry
Phase 2b SkillLoader（Tool定义） ────────────────────┘

Phase 2d 因果链 → 3.4 CausalChainRegistry 索引
```

### 6.3 耗时估计

| 模块 | 估计耗时 | 依据 |
|------|---------|------|
| 42 边注册 | ~500ms | 42 个纯函数对象初始化 |
| compute 加载 | ~2s | 29 模块并行（ModuleRunner maxParallel=10），每模块 < 200ms |
| ToolRegistry | ~200ms | 注册 + 原子性验证 |
| CausalChainRegistry 索引 | ~100ms | 反向索引构建 |
| **Phase 3 合计** | **~2.8s** | |

### 6.4 失败策略（可执行）

```
compute 函数加载失败：
  → ModuleRunner 将其记入 degradedModules[]
  → 该 compute 标记为不可用（ToolRegistry 中标记 degraded: true）
  → 引用该 compute 的哨兵在 check() 时自动跳过
  → 不阻断其他 compute 加载

ToolRegistry 注册失败（contractId 重复）：
  → log.error({ name, contractId }, 'Tool 注册失败 — contractId 冲突')
  → 拒绝注册该 Tool
  → 引用该 Tool 的 Skill 标记为 degraded
  → 不阻断启动

CausalChainRegistry 索引构建失败：
  → log.warn({ err }, '因果链索引构建失败 — degraded')
  → 因果链追溯功能不可用（哨兵直接输出 Finding 不追溯因果链）
  → 不阻断启动
```

### 6.5 Health Check

```bash
# Phase 3 HC: 确认 compute 和 Tool 已注册
node -e "
const { ToolRegistry } = require('./dist/tools/tool-registry');
const registry = new ToolRegistry();
const tools = registry.list();
console.log('Tools registered: ' + tools.length);
if (tools.length === 0) console.warn('WARNING: 零 Tool 注册');
"
```

---

## 七、Phase 4：专家与安全（目标 < 5s）

### 7.1 模块列表与加载函数

| 序号 | 模块 | 加载函数 / 文件 | 依赖 | 实际源码行为 |
|------|------|---------------|------|------------|
| 4.1 | ExpertPromptLoader | `packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts:buildExpertPrompt()` | Phase 3.2（compute 就绪） | 6 位专家（strategic_analyst / org_diagnostician / financial_analyst / tech_architect / action_advisor / marketing_analyst）。每位专家定义含：name/description/tone/boundaries/frameworks/outputFormat。buildExpertPrompt() 三层构建：共享基座 → 专家差异 → 输出格式约束。当前为纯函数——不扫描文件系统，专家定义硬编码在 DEFINITIONS 对象中。 |
| 4.2 | PolicyEngine(D38) | `src/security/policy-engine.ts:PolicyEngine` | Phase 0.3（ConfigLoader） | ABAC 属性驱动权限引擎。基于 (role, dataLevel, SOI) 三元组裁决。10 条标准操作指令（SOI 常量）：GRAPH_TRAVERSE / SENTINEL_COMPUTE / AGENT_PROACTIVE_ALERT / ONTOLOGY_WRITE / DIAGNOSIS_REPORT / DATA_EXPORT / DATA_DELETE / KNOWLEDGE_UPLOAD / GA_CALIBRATE / ADMIN_CONFIGURE。规则优先级——数值越小越优先。异常返回默认 Deny。 |
| 4.3 | DataBoundary | `src/security/pii-scrubber.ts:PIIScrubber` + DataBoundary 接口 | Phase 4.2 | 数据等级 S0-S4 的访问边界校验。PII 清洗器（`PIIScrubber`）在传入数据进入 LLM 前执行。 |

### 7.2 ExpertPromptLoader 与当前代码的对照

当前 `expert-prompts.ts` 中专家提示词不是从文件系统加载的——`DEFINITIONS` 对象在模块顶层直接定义。如果未来升级为文件驱动（从 `experts/{name}/manifest.json` + `IDENTITY.md` 加载），触发机制为：

```
专家 manifest.json 缺失 → 跳过该专家 + log.error → 主 Agent 路由时自动排除
专家 IDENTITY.md 缺失 → 仍可加载（manifest.json 中的 description/lens 降级使用）
专家版本不兼容 → 拒绝替换 + 保留旧提示词模板 + WARN
```

当前 6 位专家全部硬编码在 `DEFINITIONS` 和 `listExpertTypes()` 中。第 7-8 位（business_model / knowledge）如后续加入，应在 `ExpertType` union 类型和 `DEFINITIONS` 对象中添加。

### 7.3 依赖关系图

```
Phase 3 compute 就绪 → 4.1 ExpertPromptLoader
Phase 0 ConfigLoader  → 4.2 PolicyEngine(D38)
Phase 4.2              → 4.3 DataBoundary
```

### 7.4 失败策略（可执行）

```
ExpertPromptLoader 某专家定义缺失：
  → 跳过该专家，从 listExpertTypes() 中移除
  → log.error({ expertType }, '专家定义缺失 — 跳过')
  → 主 Agent 路由时自动排除该专家
  → 不阻断其他专家加载

PolicyEngine 初始化失败：
  → 所有访问请求默认 Deny（安全优先）
  → log.error({ err }, 'PolicyEngine 初始化失败 — 默认 Deny')
  → 不阻断启动——但所有需要权限的操作将被拒绝

DataBoundary 校验失败：
  → log.warn({ err }, 'DataBoundary 校验失败 — degraded')
  → PII 清洗器跳过（数据不进入 LLM 前清洗 → 安全风险）
  → 不阻断启动
```

### 7.5 Health Check

```bash
# Phase 4 HC: 确认专家提示词可构建
node -e "
const { buildExpertPrompt, listExpertTypes } = require('./dist/pipeline/diagnosis/expert-prompts');
const types = listExpertTypes();
console.log('Experts: ' + types.join(', '));
if (types.length < 6) throw new Error('专家数量不足');
for (const t of types) {
  const prompt = buildExpertPrompt(t, { teamId: 'test', phase: 0 });
  if (!prompt.systemPrompt) throw new Error(t + ' systemPrompt 为空');
}
console.log('OK: all ' + types.length + ' experts ready');
"
```

---

## 八、Phase 5：交互层（目标 < 3s）

### 8.1 模块列表与加载函数

| 序号 | 模块 | 加载函数 / 文件 | 依赖 | 实际源码行为 |
|------|------|---------------|------|------------|
| 5.1 | HTTP Server | `src/server.ts:createServer()` | Phase 4（全部就绪） | Express/Fastify HTTP 服务。监听端口由 `synova.json` 或 `PORT` 环境变量决定（默认 3000）。在 `synova-agent.ts:start()` 中通过 `await createServer()` 启动。 |
| 5.2 | MCP Server | `src/mcp/index.ts` | Phase 5.1（共享端口或独立端口） | MCP 协议桥接。提供 `bridge.ts`（协议转换）、`skill-installer.ts`（Skill 安装）、`tool-registration.ts`（工具注册到 MCP）。 |
| 5.3 | Electron Desktop | `src/electron/main.ts` | Phase 5.1（通过 HTTP API 通信） | Electron 桌面应用。企业用户的图形化界面——GA面板、中层工作台、CEO诊断报告。通过 IPC 与本地 HTTP Server 通信。打包为 Windows/macOS 独立应用。 |
| 5.4 | CronScheduler | `src/cron/scheduler.ts:CronScheduler` → `src/agent/synova-agent.ts:start()` | Phase 2a（哨兵已注册） | `getGlobalScheduler(db)` 获取全局单例。注册定时任务：ontology-monitor（每5分钟）、stuck-session-detector（每分钟）、SentinelRunner 启动所有 cron 哨兵。 |

### 8.2 当前代码中的启动流程（`synova-agent.ts:start()`）

```
1. await createServer()                         // HTTP 服务
2. scheduler = getGlobalScheduler(this.db)      // Cron 调度器
3. scheduler.schedule('ontology-monitor', ...)  // 本体监控任务
4. baselineStore.setDatabase(this.db)           // 基线存储 SQLite 持久化
5. await registerBuiltinSentinels()             // 注册内置哨兵
6. recoverInterruptedSessions()                 // 启动恢复
7. sentinelRunner.start()                       // 哨兵扫描开始
8. queue.drain()                                // 投递队列排干
9. scheduler.schedule('stuck-session-detector', ...) // 卡住会话检测
10. CommandLanes 初始化                          // 工具执行路径隔离
```

注意：当前实现中 Phase 0-4 的大部分逻辑集中在 `initEngineContext()` 和 `synova-agent.ts:start()` 中，没有显式的 Phase 边界。本文档的结构化定义是目标架构——当前代码应逐步向此结构迁移。

### 8.3 失败策略（可执行）

```
HTTP Server 启动失败（端口被占用）：
  → log.error({ err, port }, 'HTTP 服务启动失败')
  → 终止启动，错误码 3
  → 回滚：关闭已启动的 MCP/TUI/Cron

MCP Server 启动失败：
  → log.error({ err }, 'MCP 服务启动失败')
  → MCP 相关 API 不可用
  → HTTP 服务继续运行（独立端口/路径）
  → 不终止启动

Electron Desktop 启动失败：
  → log.warn({ err }, 'Electron Desktop 启动失败 — degraded')
  → 不影响 HTTP/MCP（Electron Desktop 作为独立进程启动，失败时用户可通过浏览器访问 Web 界面降级使用）
  → 不终止启动

CronScheduler 单个任务注册失败：
  → log.warn({ name, err }, '定时任务注册失败 — 跳过')
  → 该任务不执行，不影响其他任务
  → 不终止启动
```

### 8.4 Health Check

```bash
# Phase 5 HC: 确认 HTTP 服务响应
curl -s http://localhost:3000/health | jq '.status'
# 期望: "ok" 或 "pending_configuration"

# 确认全部 Phase 完成
curl -s http://localhost:3000/health | jq '.phases'
# 期望: { "phase0": "ok", "phase1": "ok", "phase2": "ok", "phase3": "ok", "phase4": "ok", "phase5": "ok" }
```

---

## 九、失败回滚协议（每 Phase 独立）

### 9.1 回滚触发条件

| 条件 | 判定标准 | 适用 Phase |
|------|---------|-----------|
| 未捕获异常 | 模块初始化函数抛出未被 catch 的 Error | 全部 Phase |
| Health check 超时 | Phase 的 health check 命令超过 30s 无响应 | 全部 Phase |
| 依赖校验 error 级 | 集成契约检查发现 error 级告警（第三章详述） | Phase 2, 3, 4 |

### 9.2 每 Phase 独立回滚策略

```
Phase 0 回滚：
  触发：SQLite 连接失败
  动作：进程退出（错误码 1），无状态需要清理
  影响范围：Phase 0 自身

Phase 1 回滚：
  触发：GraphStore 建表失败（SQLITE_CORRUPT）
  动作：删除 .db 文件（仅在首次创建时）或保留旧 .db 文件（迁移失败时）
        closeEngineContext() 关闭数据库连接
        进程退出（错误码 2）
  影响范围：Phase 1 自身
  不恢复：Phase 0（SQLite 连接池不受影响）

Phase 2 回滚：
  触发：任一 Loader 崩溃（未捕获异常）
  动作：clearSentinelCache() / clearSkillCache() / clearPlaybookCache()
        保留 Phase 1 的 GraphStore 数据
        保留未崩溃 Loader 的已注册条目
        以 degraded 状态继续 Phase 3
  影响范围：仅崩溃的 Loader
  不恢复：Phase 1（GraphStore + 表结构完整保留）

Phase 3 回滚：
  触发：42 边注册失败（核心边定义缺失）
  动作：清空边注册表 + 清空 CausalChainRegistry
        保留 Phase 2 的哨兵/Skill/Playbook 注册
        ToolRegistry 标记所有引用缺失边的 Tool 为 degraded
        以 degraded 状态继续 Phase 4
  影响范围：Phase 3 自身

Phase 4 回滚：
  触发：PolicyEngine 初始化失败
  动作：PolicyEngine 回退到默认 Deny 模式
        ExpertPromptLoader 保留已成功加载的专家
        以 degraded 状态继续 Phase 5
  影响范围：Phase 4 自身

Phase 5 回滚：
  触发：HTTP Server 启动失败
  动作：关闭已启动的 MCP/Electron Desktop/CronScheduler
        进程退出（错误码 3）
  影响范围：Phase 5 自身
  不恢复：Phase 0-4（所有数据和注册表完好）
```

### 9.3 跨 Phase 隔离原则

每个 Phase 的失败**只回滚本 Phase 的状态**，不回滚已成功完成的 Phase。具体来说：

- Phase 2 的 PlaybookLoader 崩溃 → Playbook 注册表清空，Skill 注册表和 Sentinel 注册表不变，GraphStore 不变
- Phase 3 的 compute 加载失败 → 该 compute 标记 degraded，边注册表和 CausalChainRegistry 不变，哨兵/Skill/Playbook 不变
- Phase 4 的 PolicyEngine 失败 → 默认 Deny 模式，ExpertPromptLoader 不受影响

这一原则的核心动机：**存储层（Phase 1）的状态是系统最昂贵的数据资产**——它包含企业本体数据和行业基准。任何上层模块的失败都不应危及存储层的数据完整性。

---

## 十、运行中热重载协议

### 10.1 通用热重载流程

```
1. 文件监控检测到变更（fs.watch / chokidar）
2. 定位变更影响的模块（manifest 路径 → Loader 类型）
3. 加载新版本到沙盒（不影响当前运行的注册表）
4. 执行新版本校验（manifest 完整性 + 依赖校验 + 版本号检查）
5. 校验通过 → 原子替换注册表条目
6. 校验失败 → 保留旧版本 + WARN 日志 + GA 通知
```

### 10.2 SentinelLoader 热重载

**监控路径**：`extensions/sentinels/{name}/manifest.json`

**触发条件**：manifest.json 文件变更（修改、新增目录、删除目录）

**具体行为**：

```
1. 检测到变更后，读取新 manifest.json
2. 校验 manifest 结构完整性（name/version/entryPoint/exportKey 必填）
3. 动态 import 新 entryPoint（如 ./aggregate.ts），提取 check() 方法
4. 校验 dependsOn.nodeTypes / requiredFields 在本体中存在
5. 全部通过 → 调用 getSentinelRegistry().register() 替换旧条目
   → log.info({ sentinel: name, version }, '哨兵热重载成功')
6. 任一失败 → 保留旧版本（不调用 register）
   → log.warn({ sentinel: name, err }, '哨兵热重载失败 — 保留旧版本')
   → push GA 通知：{ type: 'hot_reload_failed', module: 'sentinel', name, error }
```

**哨兵删除**：目录被删除 → 从 SentinelRegistry 移除该哨兵 → log.info + GA 通知。

### 10.3 SkillLoader 热重载

**监控路径**：`skills/{builtin|industry|custom}/{name}/manifest.json` + `SKILL.md`

**触发条件**：manifest.json 或 SKILL.md 变更

**具体行为**：

```
1. 检测到变更后，重新读取 manifest.json + SKILL.md
2. 校验 manifest 结构完整性 + lifecycle 是否 archived
3. 执行 validateDependencies() 校验所有依赖
4. 全部通过 → 替换 SkillRegistry 中的旧条目
   → log.info({ skill: name, version }, 'Skill 热重载成功')
5. 任一失败 → 保留旧版本
   → log.warn({ skill: name, err }, 'Skill 热重载失败 — 保留旧版本')
   → push GA 通知

6. 如果变更来自高优先级路径（custom/ > industry/ > builtin/）
   → 自动覆盖低优先级路径的同名 Skill
```

**新增 Skill**：新目录出现 → 加载 + 依赖校验 → 注册到 SkillRegistry。

**Skill 删除**：目录被删除 → 从 SkillRegistry 移除 → 连锁效应：
- 引用该 Skill 的其他 Skill 重新执行 validateDependencies() → 可能标记 degraded
- 引用该 Skill 的 Playbook 重新执行 steps 校验 → 可能标记 degraded

### 10.4 PlaybookLoader 热重载

**监控路径**：`playbooks/*.yaml`

**触发条件**：YAML 文件变更

**具体行为**：

```
1. 检测到变更后，重新解析 YAML
2. 校验 playbook 结构 + trigger 条件 + contextRequirements
3. 校验 steps[].tool 引用仍在 SkillRegistry/ToolRegistry 中存在
4. 全部通过 → 替换 PlaybookRegistry 中的旧条目
5. 任一失败 → 保留旧版本 + WARN + GA 通知
```

### 10.5 CausalChainLoader 热重载

**监控路径**：`causal-chains/*.yaml`

**触发条件**：YAML 文件变更

**版本号校验（关键差异）**：

CausalChainLoader 的热重载比其他 Loader 多一道版本号校验——因为因果链的修改直接影响诊断追溯结果。

```
1. 检测到变更后，解析 YAML，提取 version 字段
2. 版本号比对：
   → 新版本 > 旧版本（SemVer 递增）→ 允许更新
   → 新版本 == 旧版本 → 拒绝 + WARN（"版本号未递增——如果是有意修改，请更新版本号"）
   → 新版本 < 旧版本（回退）→ 拒绝 + WARN（"版本号回退——拒绝加载"）
3. 新增 YAML（之前不存在）→ 直接注册
4. 校验通过 → 替换 CausalChainRegistry 中的旧条目 + 重建反向索引
5. 校验失败 → 保留旧版本 + WARN + GA 通知
```

### 10.6 ExpertPromptLoader 热重载

**当前状态**：专家提示词硬编码在 `expert-prompts.ts` 中，无文件系统监控。热重载当前不可用。

**未来升级路径**（如果迁移到文件驱动，从 `experts/{name}/manifest.json` + `IDENTITY.md` 加载）：

```
1. 检测到 manifest.json 或 IDENTITY.md 变更
2. 校验新 manifest 结构
3. 构建新提示词模板（buildSystemPrompt + buildUserMessage）
4. 校验新模板不含未绑定占位符（如 {{unknown_field}}）
5. 通过 → 替换 DEFINITIONS 中的旧条目
6. 失败 → 保留旧版本 + WARN + GA 通知
```

### 10.7 热重载的全局保护机制

**并发控制**：同一模块在同一时间只能有一个热重载在执行。如果检测到已有热重载在进行中 → 新的变更事件排队等待（最多 1 个排队位置）。

**回滚保护**：热重载连续失败 3 次 → 停止该模块的自动热重载 → 转人工介入模式 → GA 面板显示"模块 X 热重载失败 3 次，已暂停自动重载"。

**原子性保证**：所有热重载使用"先校验后替换"模式——新版本在沙盒中校验通过后才替换注册表。不存在"半替换"状态（旧版本部分被覆盖、新版本部分生效）。


---

## 十一、附录：启动序列完整状态机

```
                    ┌─────────────────────────────┐
                    │   START: process start       │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  Phase 0: 基础设施           │
                    │  SQLite + Logger + Config    │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  Phase 1: 存储层             │
                    │  GraphStore + SOG + Knowledge│
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  Phase 1.5: 数据预置         │
                    │  行业基准 + 企业数据检查      │
                    └──┬──────────────────┬───────┘
                       │                  │
                  Enterprise数据存在   Enterprise数据=0
                       │                  │
                       │         ┌────────▼──────────┐
                       │         │ 'pending_config'    │
                       │         │ HTTP正常, 诊断503   │
                       │         └────────┬──────────┘
                       │                  │
                    ┌──▼──────────────────▼───────┐
                    │  Phase 2: 核心引擎           │
                    │  2a→2b→2c→2d                │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  Phase 3: 本体计算层         │
                    │  42边 + compute + Tool + CC   │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  Phase 4: 专家与安全         │
                    │  Expert + Policy + Boundary   │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  Phase 5: 交互层             │
                    │  HTTP + MCP + Electron Desktop + Cron     │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  RUNNING: system ready       │
                    │  /health returns 200         │
                    └─────────────────────────────┘
```

每个 Phase 的失败路径均回滚到上一个 Phase 的完成状态，不跨 Phase 传播。

---

## 十二、附录：源文件索引

本文档引用的所有源代码文件（按 Phase 分组）：

| Phase | 文件路径 | 关键函数/类 |
|-------|---------|-----------|
| 0 | `src/init/engine-context.ts` | `initEngineContext()`, `getDatabase()`, `enableWAL()` |
| 0 | `src/config.ts` | `loadConfig()`, `loadFileConfig()` |
| 1 | `packages/engine-core/src/pipeline/diagnosis/graph-store.ts` | `SQLiteGraphStore.initSchema()`, `createNode()`, `createEdge()` |
| 1 | `src/store/schema-migration.ts` | `reconcileSchema()` |
| 2a | `src/sentinel/sentinel-loader.ts` | `loadSentinels()`, `registerLoadedSentinels()`, `clearSentinelCache()` |
| 2a | `extensions/sentinels/manifest.json` | 50哨兵索引 |
| 2a | `src/sentinel/registry.ts` | `getSentinelRegistry()`, `SentinelRegistryImpl.register()` |
| 2b | `src/skill/skill-loader.ts` | `loadSkills()`（设计自权威文档12 §三） |
| 2c | `src/playbook/` | PlaybookLoader（设计自权威文档12 §四） |
| 3 | `src/orchestrator/module-runner.ts` | `ModuleRunner.runAll()` |
| 3 | `src/tools/tool-registry.ts` | `ToolRegistry.register()`, `validateAtomicity()` |
| 4 | `packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts` | `buildExpertPrompt()`, `listExpertTypes()`, `DEFINITIONS` |
| 4 | `src/security/policy-engine.ts` | `PolicyEngine.evaluate()`, `StandardOperations` |
| 4 | `src/security/pii-scrubber.ts` | `PIIScrubber` |
| 5 | `src/agent/synova-agent.ts` | `SynovaAgent.start()` |
| 5 | `src/cron/scheduler.ts` | `CronScheduler`, `getGlobalScheduler()` |
| 5 | `src/server.ts` | `createServer()` |
| 5 | `src/mcp/index.ts` | MCP Server |

---

## 十三、附录：与权威文档14其他章节的交叉引用

| 本章节 | 引用的其他章节 | 关系 |
|--------|-------------|------|
| §2.4 Phase 0 失败策略 | 第三章 §3.1 集成契约 | error 级告警触发回滚的条件需第三章定义 |
| §5.6 Phase 2 依赖校验失败 | 第三章 §3.2 告警级别 | 依赖缺失 → error 还是 warning → 需第三章定义 |
| §5.5 子顺序依赖 | 第二章 §2.1 能力矩阵 | SentinelRegistry/SkillRegistry/ToolRegistry 的能力依赖需第二章明确 |
| §8.2 Phase 5 启动流程 | 第五章 §5.2 术语字典 | CronScheduler 注册的哨兵循环名称需术语字典统一 |
| §9 回滚协议 | 第四章 §4.3 黄金数据集 | 系统升级后的回滚测试用黄金数据集验证 |
| §10 热重载协议 | 第三章 §3.3 L2 交叉引用检查 | 热重载前的依赖校验逻辑复用 L2 检查 |
