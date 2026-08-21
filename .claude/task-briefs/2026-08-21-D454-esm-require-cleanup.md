# Task Brief: D454 GSS 服务启动原生崩溃修复（env+ESM）— require 残留清零

> 生成: 2026-08-21 | 分支: fix/d454-esm-require-cleanup | 角色: DeepSeek Harness (Mac)
> 依据: CTO 派单（docs/synova/coordination/编码session派单-20260821.md）任务 1，P0 最高优先

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
D454 = GSS 服务启动原生崩溃修复。三个子问题：
1. Node v24.19.0 断言 `env!=nullptr`（哨兵动态 import 时触发）→ **已由 D462 修复**（better-sqlite3 v12.11.1 升级，WiseLibs/better-sqlite3#1376，commit 7fe92110 已在 main），实测服务启动 20s 无崩溃
2. `require is not defined`（ESM 迁移残留）→ **本次修复目标**：package.json 是 `"type": "module"`（纯 ESM），但 src/ 仍有 40 处 CJS `require()`。任何被调用的 require 在 ESM 下抛 ReferenceError。启动路径实测炸 1 处（`src/agent/synova-agent.ts:254` CommandLanes → degraded 日志）；其余分布在路由/懒加载路径，调用即炸
3. nodemailer 缺失 → 已补装（9.0.3）

### b) 文件审计（grep 实测）
40 处 require 残留，23 个文件（已排除注释行）：
- **启动路径必炸（1 文件 3 处）**: `src/agent/synova-agent.ts`（101/124 child_process+path 信号推送、254 command-lanes）
- **路由路径（请求时炸，6 文件 15 处）**: routes/notifications.ts（6）、routes/actions-api.ts（4）、routes/adapters.ts（2）、routes/workspaces-api.ts（1）、routes/healthz.ts（1）、middleware/auth.ts（1）
- **懒加载/功能路径（7 文件 11 处）**: agent/data-ingest-service.ts（3）、agent/proactive-push.ts（2）、agent/knowledge-injector.ts（1）、agent/skill-lazy-loader.ts（1）、agent/file-scanner.ts（1）、l4/department-memory-store.ts（2）、growth/knowledge-feedback.ts（1）
- **部署/配置/杂项（6 文件 9 处）**: config.ts（1）、connectors/csv-import.ts（1）、deploy/startup-check.ts（1）、deploy/backup-scheduler.ts（1）、deploy/backup-verify.ts（1）、env/env-snapshot-schema.ts（1）、loops/middle-evolution-engine.ts（1）
- 注释含"require"字样非真调用（不修）: l3/synova-diagnosis-engine.ts:9、deploy/bootstrap.ts:620

循环依赖审计：全部 require 目标均无反向 import（grep 逐一验证）→ 静态 import 替换安全。

### c) 决策（D333）
参考：第一性原理（ESM 下 require 是 ReferenceError，静态 import 即修复）+ Anthropic（最小机制：逐文件静态 import，保持 try/catch 降级语义）。结论：全部改静态 import，不引入 createRequire。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 铁律 0-2（测试先行）、24+31（降级标记）、33（测试命名）、34（feature branch）、36（vitest 全绿）、38（as any 零容忍）
- 铁律 46（禁止桥接文件）: 本次是 require→import 真搬，不是建代理
- 历史教训（memory/）: D317 engine-core 退役清理曾因 require 残留导致断裂测试；D454 旧 brief（2026-08-18）只修了 engine-context.ts 一处（3715cb0f），本次扩展到全仓
- 决策参考系: 参考：Anthropic/DeepSeek/第一性原理 + 结论=全仓 require 清零，静态 import

## Q2: 范围 — 正确的最简方案

做什么（require → 静态 import，保持现有 try/catch 降级语义）：
- scripts/golden-scenarios/GS-03-capital-cycle/run.sh
- src/services/memory-access-service.ts
- tests/services/memory-access-service.test.ts
- src/agent/synova-agent.ts
- src/routes/notifications.ts
- src/routes/actions-api.ts
- src/routes/adapters.ts
- src/routes/workspaces-api.ts
- src/routes/healthz.ts
- src/middleware/auth.ts
- src/agent/data-ingest-service.ts
- src/agent/proactive-push.ts
- src/agent/knowledge-injector.ts
- src/agent/skill-lazy-loader.ts
- src/agent/file-scanner.ts
- src/l4/department-memory-store.ts
- src/growth/knowledge-feedback.ts
- src/config.ts
- src/connectors/csv-import.ts
- src/deploy/startup-check.ts
- src/deploy/backup-scheduler.ts
- src/deploy/backup-verify.ts
- src/env/env-snapshot-schema.ts
- src/loops/middle-evolution-engine.ts

不做什么：
- 不改 src/init/engine-context.ts（3715cb0f 已修；src/init/ 归属 Win Claude，写集已核对无重叠）
- 不改 tests/sentinels/ 及 extensions/sentinels/（路径漂移基线红为另一任务，非 D454 范围）
- 不改 scripts/audit/（K3 红线）
- 不改 package.json / tsconfig.json / vitest 配置

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：`npx tsx src/index.ts`（Mac 等价 npm run dev；Windows 为 scripts/agent-start.bat）
处理（中间步骤）：全仓 grep `require(` 零残留（注释除外）→ tsc 通过 → vitest --changed 无新增失败
结果（最终展示）：
1. 服务启动日志无 `require is not defined`（CommandLanes 正常初始化）
2. `bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh` 仍 exit 0（3/3 断言）
3. `grep -rn "require(" src/ --include="*.ts" | grep -v "\.test\."` 零真调用

## 架构层: 基础设施

L0 基础设施层：ESM 迁移 + 启动链路修复（非 L1-L5 业务层变更）；新增 L2 服务封装（routes 依赖）

## Done 标准
- [ ] `grep -rn "require(" src/ --include="*.ts"` 排除测试/注释后零真调用
- [ ] `npx tsc --noEmit` 通过（无 require 相关新增错误）
- [ ] `bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh` exit 0
- [ ] 服务启动日志无 `require is not defined`

#CRITERIA: A
