# Task Brief: RUNTIME Phase 0 — 全局兜底 + WAL 降级

> 生成: 2026-07-01 23:50 | 分支: feat/prompt-architecture | as any: 0
> 对标: RUNTIME-EXCELLENCE-IMPL-v1.md §Phase 0
> 交付链路: task brief → test → impl → wire → tsc → vitest → pre-commit → push → CI ✅

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码。

流程约束: V4.2.9 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察 → L2 编排 → L1 交互
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore
  L5 存储: store/ cron/
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

本任务属于 **基础设施（运行时可靠性）**。横切多个层级：
- **Phase 0.1（全局错误兜底）** → L1 交互层（server.ts 进程级处理器）
- **Phase 0.2（WAL 降级）** → L4 存储层（graph-store）+ L2 初始化层（engine-context）

现有模块：
- `src/server.ts`（28961 字符）— createServer() 现有 SIGTERM/SIGINT 处理，但 **无** process.on('uncaughtException') 和 process.on('unhandledRejection')
- `packages/graph-store/src/graph-store.ts`（~460行）— SynovaGraphStoreImpl，**无** WAL pragma 调用（通过 SqliteDb 接口操作）
- `src/init/engine-context.ts`（135行）— `db.pragma('journal_mode = WAL')` 第37行，**无** 降级逻辑
- `src/errors/types.ts` — DiagnosticAgentError 已定义，ErrorCode.RATE_LIMITED 已存在
- `@synova/logger` — pino 实例，原生支持 `logger.fatal()`

本任务：**扩展/加固** 以上三个文件，新增全局错误兜底和 WAL 网络文件系统降级。

### b) 文件审计
grep `uncaughtException|unhandledRejection` 在 src/ 中 → 零结果（本任务首次引入）。
grep `WAL.*fallback\|journal_mode.*DELETE` 在 src/ packages/ 中 → 零结果（本任务首次引入）。
grep `enableWAL` → 零结果。
同类型文件：`@synova/graph-store` 包已有 Phase 0.2 权限检查器模式（`globalDeletePermissionChecker`），本任务 WAL 降级采用相同模式。

### c) 决策
无覆盖，新建。遵循现有模式（模块级配置 + 错误处理 + 降级日志）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — 本 brief 已定义
  ② 测试 — 先写测试：
     - Phase 0.1: 测试 uncaughtExceptionHandler / unhandledRejectionHandler 的函数行为
     - Phase 0.2: 测试 enableWAL 正常路径 / NFS 降级路径 / 错误传播
  ③ 实现 — 刚好满足以下全部条件：
     - Done 标准中列出的所有完成项
     - 测试全部通过
     - 接线完整（新 export 有引用，process.on 已注册）
     - 错误路径有 log + degraded（铁律 24+31）
     - tsc + vitest 零失败
  ④ 接线 — Phase 0.1 在 createServer() 中注册；Phase 0.2 在构造函数中调用 enableWAL
  ⑤ 验证 — 自检 6 问 + Phase 0 验收门禁

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 24: 异常处理 — catch 必须有 log.warn/error + 返回 degraded: true
  - 铁律 31: 降级信号传播 — 每个可独立失败的模块必须返回 degraded 标记
  - 铁律 32: 错误分类强制 — catch 包装为带 .code + .phase + .retryable 的 Error 子类
  - 铁律 38: as any 零容忍
  - 铁律 39: 五层架构 — 新增代码标注所属层，跨层引用通过合法接口
  - memory/ 历史教训: [[plan-actual-closure]] [[stub-implementation-pattern]] [[q0c-cancelled-without-followup]]

### b) 本任务执行约束
- rule: "process.on('uncaughtException') 和 process.on('unhandledRejection') 必须在 createServer() 中注册"
  verify: "grep -rn 'process.on.*uncaughtException\|process.on.*unhandledRejection' src/server.ts"
- rule: "unhandledRejection 处理器必须区分 RATE_LIMITED（warn+continue）和其他错误（fatal+exit）"
  verify: "grep -n 'RATE_LIMITED' src/server.ts | head -1"
- rule: "WAL 降级在 NFS/SMB 不可用时必须尝试 journal_mode=DELETE"
  verify: "grep -rn 'journal_mode.*DELETE\|enableWAL' packages/graph-store/src/graph-store.ts src/init/engine-context.ts"
- rule: "WAL 降级首次失败必须 log.warn，同一路径不再重复警告"
  verify: "grep -n 'warnedPaths\|warned' packages/graph-store/src/graph-store.ts src/init/engine-context.ts"

## Q2: 范围 — 正确的最简方案是什么？

**做什么：**

Phase 0.1 — 全局错误兜底（修改 `src/server.ts`）：
1. 在 createServer() 中注册 `process.on('uncaughtException')`：
   - logger.fatal 记录完整错误
   - server.close() 后 process.exit(1)
2. 注册 `process.on('unhandledRejection')`：
   - 非 Error 类型包装为 Error
   - RATE_LIMITED 错误 → logger.warn + return（非致命）
   - 其他错误 → logger.error + server.close() + process.exit(1)
3. 防止重复注册（幂等保护）

Phase 0.2 — WAL 降级：
1. `packages/graph-store/src/graph-store.ts`：
   - 在 `SqliteDb` 接口中新增 `pragma(sql: string): unknown` 方法
   - 新增 `enableWAL(db: SqliteDb)` 私有方法
   - 构造函数中 `initSchema()` 前调用 `enableWAL()`
   - WAL 不可用（NFS/SMB）→ 降级 journal_mode=DELETE + log.warn
   - warnedPaths 去重（每个路径仅首次警告）
2. `src/init/engine-context.ts`：
   - 替换 `db.pragma('journal_mode = WAL')` 为内联 enableWAL 降级逻辑
   - 同样去重警告

**不做什么：**
- ❌ 不改写全局 process.on 处理器的测试方式（不 mock process，只测试 handler 函数）
- ❌ 不改发动机-context 的其他初始化逻辑
- ❌ 不涉及 Phase 1+ 的内容（启动恢复/优雅关闭/投递队列）
- ❌ 不修改 package.json 或新增依赖
- ❌ 不使用 as any（铁律 38）
- ❌ 不引入 engine-core 引用（铁律 46）

## Q3: 验收 — 入口 → 交互 → 结果

Phase 0.1 — 全局兜底：

入口（用户从哪触发）：
  Node.js 进程遇到未捕获异常或未处理的 Promise rejection

处理（中间经过哪些步骤）：
  1. 任意同步/异步代码中抛出未捕获 Error
  2. process.on('uncaughtException') 触发 → logger.fatal → server.close → exit(1)
  3. Promise 链中未捕获 rejection → process.on('unhandledRejection') 触发
  4. RATE_LIMITED → logger.warn → 继续运行（非致命）
  5. 其他 → logger.error → server.close → exit(1)

结果：
  - 进程退出码 = 1（非 RATE_LIMITED 情况）
  - 日志中有完整错误信息和堆栈
  - Electron 自动重启进程

Phase 0.2 — WAL 降级：

入口（用户从哪触发）：
  应用启动，SQLite 数据库初始化

处理（中间经过哪些步骤）：
  1. 数据库连接成功
  2. enableWAL() 尝试 `PRAGMA journal_mode = WAL`
  3. SQLite 在 NFS/SMB 上抛 "locking protocol" 或 "not authorized" 错误
  4. catch 检测到特定错误 → log.warn("WAL不可用...降级DELETE")
  5. 尝试 `PRAGMA journal_mode = DELETE`
  6. 其他未知错误 → throw（不静默吞）

结果：
  - 正常环境：WAL 模式启用，应用正常运行
  - NFS/SMB：日志显示 "WAL不可用—降级DELETE模式"，应用正常启动
  - 日志可见（首次警告，后续静默）

## 本任务在哪一层
横切：Phase 0.1 在 L1（server.ts 进程级），Phase 0.2 在 L4（packages/graph-store）+ L2（engine-context 初始化）

## Done 标准
- [ ] 入口可触达: process.on('uncaughtException') 和 process.on('unhandledRejection') 在 createServer() 中注册
- [ ] 链路走通: unhandledRejection 对 RATE_LIMITED continue，其他 fatal
- [ ] 结果可见: WAL 在 NFS 环境下降级 DELETE + log.warn，非 NFS 正常 WAL
- [ ] 无 TODO/FIXME: `grep -rn "TODO\|FIXME" src/server.ts packages/graph-store/src/graph-store.ts src/init/engine-context.ts` → 零结果
- [ ] as any 零存在: `grep -rn "as any" src/server.ts packages/graph-store/src/graph-store.ts src/init/engine-context.ts` → 零结果
- [ ] tsc --noEmit 零错误
- [ ] vitest run 零失败
- [ ] pre-commit 8 组通过
- [ ] CI success
