# Task Brief: RUNTIME Phase 3 — 速率限制 + Schema迁移 + 上下文压缩增强

> 生成: 2026-07-03 | 对标: RUNTIME-EXCELLENCE-IMPL-v1.md §Phase 3
> 交付链路: task brief → test → impl → wire → tsc → vitest → pre-commit → push → CI ✅

## Q0: 定位

### a) 项目拼图
本任务属于**纵向（基础设施）**。

- **Phase 3.1（三层速率限制）** → L1 交互层（src/middleware/rate-limit.ts 中间件）
- **Phase 3.2（Schema迁移）** → L5 存储层（src/store/schema-migration.ts）
- **Phase 3.3（上下文压缩增强）** → L2 编排层（src/orchestrator/context-compressor.ts）

现有模块：
- `src/server.ts` lines 371-396 — inline 简易速率限制（Map + 100 req/min/IP），30s 清理
- `src/init/engine-context.ts` — SQLite 初始化，当前直接建表无版本管理
- `packages/graph-store/src/graph-store.ts` — graph-store 无版本化 Schema
- `src/store/session-store.ts` — session-store 内联建表
- `src/orchestrator/context-compressor.ts` — 已有 3 种策略（sliding-window/summary/selective），但无副模型摘要

### b) 文件审计
grep `rateLimit\|rate.limit\|schema.*migration\|migrateV` → 现有简易 rateLimitMap，无 schema migration。
grep `child_session\|subModel\|cooldown` → 零结果。

### c) 决策
新建 2 个文件 + 修改 4 个文件。无冲突。

## Q1: 调研

决策链: SPEC → 测试 → 实现 → 接线 → 验证
引用: 铁律 0-2, 7, 24, 31, 38

执行约束:
- rule: "rate-limit 三种 limiter 均需可测试"
  verify: "grep -n 'createFixedWindowLimiter\|createAuthRateLimiter\|createLLMRateLimiter' src/middleware/rate-limit.ts"
- rule: "reconcileSchema 必须读取当前版本号并顺序执行迁移"
  verify: "grep -n 'schema_version\|SCHEMA_VERSION\|migrateV' src/store/schema-migration.ts"
- rule: "context-compressor 压缩失败必须冷却 600 秒"
  verify: "grep -n 'cooldown\|600000\|lastCompressAt' src/orchestrator/context-compressor.ts"

## Q2: 范围

Phase 3.1 — 三层速率限制（新建 `src/middleware/rate-limit.ts`）：
1. L1 FixedWindowLimiter: 纯内存，100 请求/分钟/IP，429 + Retry-After
2. L2 AuthRateLimiter: 滑动窗口 per {scope, clientIp}，300秒锁定，127.0.0.1 豁免
3. L3 LLMRateLimiter: 20次/分钟/orgId，超限排队（Promise 队列）
4. `src/server.ts`: 替换现有 inline rateLimitMap 为 middleware

Phase 3.2 — Schema迁移（新建 `src/store/schema-migration.ts`）：
1. `reconcileSchema(db)`: 读 schema_version → 按版本顺序执行迁移
2. 迁移目录 `src/store/migrations/` + 命名规范 `001_*.ts`
3. `src/init/engine-context.ts`: 建表后调用 reconcileSchema
4. `packages/graph-store/src/graph-store.ts`: 建表后调用

Phase 3.3 — 上下文压缩增强（修改 `src/orchestrator/context-compressor.ts`）：
1. 副模型摘要 API（subModelSummary 方法，接受 provider 参数）
2. 压缩失败冷却 600 秒（cooldownUntil timestamp）
3. 工具输出裁剪（保护 tool-use/tool-result 成对边界，裁剪 tool-result 内容）
4. 压缩统计（lastCompressAt, compressCount）

不做什么：
- ❌ 不迁移 session-store 的建表逻辑 — src/store/session-store.ts 已有手动 ALTER TABLE 模式
- ❌ 不涉及 packages/engine-core 引用（铁律 46）
- ❌ 不实现真正的 LLM 副模型调用 — src/orchestrator/context-compressor.ts 只定义接口和桩
- ❌ 不使用 as any — 铁律 38，pre-commit 硬阻断

## Q3: 验收

Phase 3.1 — 速率限制：
入口: HTTP 请求到达 server.ts
处理: rateLimitMiddleware 拦截 → FixedWindow/Auth/LLM 三层过滤
结果: 超限返回 429 + Retry-After 头，L2 豁免 127.0.0.1

Phase 3.2 — Schema迁移：
入口: 数据库初始化时调用 reconcileSchema
处理: 检查版本 → 执行缺少的迁移 → 更新 schema_version
结果: schema_version 表存在且版本号正确

Phase 3.3 — 上下文压缩：
入口: 对话超过 30 轮时调用 compress
处理: sliding-window/summary → 裁剪 tool-result → 记录冷却
结果: 压缩后消息数减少，cooldownUntil 时间戳更新

## 本任务在哪一层
L1（src/middleware/rate-limit.ts）+ L5（src/store/schema-migration.ts）+ L2（src/orchestrator/context-compressor.ts）

## Done 标准
- [ ] 入口可触达: rateLimitMiddleware 在 server.ts 注册
- [ ] 链路走通: 101st 请求 → 429 + Retry-After
- [ ] 结果可见: schema_version 表存在，版本号写入
- [ ] tsc --noEmit 零错误
- [ ] vitest run 零失败
- [ ] pre-commit 8 组通过
- [ ] CI success
