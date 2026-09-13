# Task Brief: D717 coding-product-debt-batch

> 生成: 2026-09-13 | 任务: D717 | 认领: 🛠 Mac 编码（synova-dsh）
> 参考: 派单文档 docs/synova/coordination/派单-下一批四线并行-20260913.md §D717

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
产品代码真债两项（L2 编排 + L4 本体/证据）。两项都属「已登记但未修」的真缺陷，非新功能：
① 前端 `use-streaming-conversation` 未声明依赖 → **干净安装下必失败**（此前 21/21 绿是污染安装态的假绿）
② `evidence expireOld()` 存在但**全仓零生产调用方**（M3「机制建成未接线」家族）
### b) 文件审计
- 前批实证：`PLAN-react-markdown-dep` 记录 `use-streaming-conversation` 引用了未在 `package.json` 声明的依赖
- 前批实证：`grep -rn "expireOld" src/` 仅命中定义处，无生产调用方（`PLAN-expireold-wiring`）
- 数据保留分级策略见 `board-backlog.json`（`PLAN-evidence-invalidation-granularity` 同族）→ 接线点须与该策略一致
### c) 决策
复用现有函数（`expireOld` 已存在），补声明 + 补接线；不新建机制。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 5：后端能力 ≠ 用户可用功能——追踪调用链（谁调用？结果在哪呈现？）
- 铁律 4/0-2：接线是硬门禁，`grep` 零结果 = 未完成（WIRE CHECK）
- 历史教训：4 次接线失败（组件单测通过但从未被生产调用）；`--no-verify` 泛滥源于假绿
- 干净安装复现是唯一可信证据：污染 `node_modules` 会让缺失依赖「看起来能用」
### 参考：铁律 0-2/4/5 + WIRE CHECK 历史 → 以干净安装 + grep 调用方为验收

### Q1c 决策参考系（D333 四步，接线点选择）
- ① 第一性原理：债 = 机制零调用。最小修复 = 在真实生产生命周期路径上给一个策略驱动的调用点；
  **删除默认值不能由 agent 发明**（创始人 2026-09-10 已定「按时间清理是错误模型」）→ 默认 permanent（不删）。
- ② Anthropic 工程基线：隔离（策略集中在 L3 服务）/ fail-safe（配置非法=不删+降级，绝不按未定义窗口删证据）/
  机器可验（行为测试 + 接线断言 + 降级回调断言）。
- ③ 开源实证（仓库内先例，非凭记忆）：`src/l3/pkb-lifecycle.ts`（L3 生命周期服务封装 store 维护函数）
  + `src/deploy/bootstrap.ts` Phase 5c `scheduler.schedule('db-backup','0 3 * * *')`（每日内务作业 + degraded 记账）。
- ④ 收敛检查：两参考系同指「L3 服务 + 装配根定时/启动接线 + 显式分级 + degraded 传播」→ 无分歧，直接执行。

## Q2: 范围 — 正确的最简方案
做什么：
- package.json — 声明 root 测试实际引用但未声明的 react-markdown（修 `PLAN-react-markdown-dep`）
- package-lock.json — 随该声明新增 react-markdown 子树（实测 +77 全 dev / 0 删除 / 0 改动）
- src/l3/evidence-retention.ts — 新建：保留分级解析 + `expireOld` 唯一生产调用方 + cron 作业工厂
- src/deploy/bootstrap.ts — Phase 5c 装配：启动即跑一次 + 注册每日 cron（降级记 degradedModules）
- tests/l3/evidence-retention.test.ts — 新建：策略/清理/边界/降级 + 接线断言
- task-state/D717.json — 本单登记（impl 段 + status）
- .claude/task-briefs/2026-09-13-D717-coding-product-debt-batch.md — 本单 brief 自身（Gate 0 交付物；D708 写集对账需显式声明）
不做什么：
- 不改 `scripts/`（控制塔 = CTO 域）
- 不改 `src/sentinel/`、`src/cron/`、`src/mcp/`（哨兵切片属他人域，避免撞车）
- 不改 `src/server.ts`（Claude 专属，DSH 不碰）
- 不引入 react-markdown 以外的新依赖（锁文件仅随之新增该子树）
- 不改 `electron-renderer/`（renderer 自有 package.json 已声明该项，本单只补 root 声明）

## Q3: 验收 — 入口 → 交互 → 结果
入口：开发者 `npm ci` 干净安装 → 运行相关测试
处理：补依赖声明 + 接线 `expireOld` 到真实调用点
结果：干净安装下相关测试全绿 + `grep -rn "expireOld" src/` ≥1 生产调用方

## 架构层: L2（编排）+ L4（证据/本体）
依赖声明属工程配置；`expireOld` 接线落在证据生命周期调用点（L4/存储清理侧）

## Done 标准:
- [ ] 干净安装下相关套件绿（**必须贴 `rm -rf node_modules && npm ci` 的原始输出**，不接受污染态结果）：`npm ci && npx vitest run tests/electron/use-streaming-conversation.test.ts` → 0 failed
      verify: `npx vitest run tests/electron/use-streaming-conversation.test.ts`（renderer node_modules 已移开 = CI 等价条件）
- [ ] `expireOld` 有生产调用方：`grep -rn "expireOld" src/ --include="*.ts" | grep -v "\.test\." | wc -l` → ≥1
      verify: `grep -rn "expireOld" src/ --include="*.ts" | grep -v "\.test\."`
- [ ] 两项各有测试断言（非空壳，铁律 48）：`grep -c "expect(" tests/**/相关测试` → ≥1
      verify: `npx vitest run tests/l3/evidence-retention.test.ts`
- [ ] 降级诚实（铁律 24/31/32）：清理失败 → log.warn + degraded 标记 + 分类错误码，进程不退出
      verify: `npx vitest run tests/l3/evidence-retention.test.ts -t 降级`
- [ ] 无静默降级/无 as any：`npm run lint` 0 error
      verify: `npm run lint`
