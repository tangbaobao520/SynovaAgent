---
north-star:
  服务用户: FDE（前线部署工程师）+ 企业主——痛点：哨兵体系是 7×24 自动巡检的核心，但哨兵自己挂了（loader 失败/适配器崩溃/scheduler 停摆）**无人知晓**，企业主看到的"一切正常"可能是"哨兵全死后的假象"（S3-5 自诊断可信度断裂）
  服务场景: 哨兵体系持续运行中，某适配器连续崩溃 / 某哨兵注册失败 / 调度空转——系统必须**自己发现并显式告警**（degraded 信号 → 工单/通知），而不是静默吞掉后继续假装健康
  模块终态: 哨兵体系自诊断——`sentinel-self-check` 每小时评估 loader/适配器/调度三维健康度，故障注入可测（loader 挂 → 显式 degraded finding；适配器连续失败 → 工单；空转 → 告警），健康时零噪音；S3-5（自诊断可信度）在哨兵体系侧闭环，GS-07 不回归
  对齐北星: PRODUCT-BRIEF.md §三.2「哨兵定时巡检：25 个哨兵 7×24 自动跑」+ §六 P0「哨兵真实数据流」——哨兵是产品核心，其自身可信度是"诊断可信"的前提；对应 product-lines.yaml 线 22（自诊断与稳定性，L22-5 自我健康报告真实，S3-5）
  完成标准: 注入故障（loader 失败/适配器崩溃/调度空转）→ 显式 degraded 信号（finding/工单）可断言；健康时零噪音（宁缺毋滥）；GS-07 场景 exit 0 不回归
  当前进度: 哨兵体系 45+ 文件已工作（GS-03/05/07 绿），D394 事件溯源已交付（sentinel_events + I1/I2/I3）；但 self-check 实现 0 处——scheduler failures 递增无人消费（scheduler.ts L383-391）、runner.start() 空 registry 静默 return（runner.ts L185-188）、aggregateAndDispatch 空 results 静默 return（runner.ts L262）、getStats().lastRunAt 陈旧无人检查（runner.ts L234-248）
---

<!--
  SYNOVA-IMPL-DSH-D505: 哨兵自诊断可信度（S3-5，L22 自诊断与稳定性）
  状态: dev doc | 2026-08-23 | 优先级 P0（26 线 L22 自诊断，S3-5 断裂）
  权威文档: 派单-devdoc-20260823-D504-D505.md（Spec 2，CTO 决策）+ product-lines.yaml 线 22 + C线标准 S3-5 + AGENTS.md 铁律 0-2/24/31/32/39/47/48 + D394 事件溯源交付
  依赖: D394（sentinel_events 已交付，本任务复用事件流 + 工单管线）
  并行: 与 D504 零写集重叠（D505 在 src/sentinel/ + src/cron/；D504 在 electron/* + renderer + GS-01）
-->

# SYNOVA-IMPL-DSH-D505: 哨兵自诊断可信度

> 一句话问题: 哨兵体系 45+ 文件已工作（GS-03/05/07 绿），但**哨兵自己挂了无人知晓**——[scheduler.ts](src/cron/scheduler.ts:383) 失败只 `failures++` 无人消费、[runner.ts](src/sentinel/runner.ts:185) 空 registry 静默跳过启动、[runner.ts](src/sentinel/runner.ts:262) 空 results 静默跳过聚合、`getStats().lastRunAt` 陈旧无人检查——self-check 实现 0 处，S3-5（自诊断可信度）断裂：**哨兵体系不能真实报告自身健康，故障注入无显式 degraded 信号**。

## 1. Authority Doc Verification

**来源**: [派单-devdoc-20260823-D504-D505.md](docs/synova/coordination/派单-devdoc-20260823-D504-D505.md)（Spec 2，CTO 已做决策）

> 落地对象: `src/sentinel/sentinel-service.ts` + `src/cron/CronScheduler` + `src/agent/sentinel-service.ts`（哨兵调度核心）。现状: 哨兵体系 45 文件已工作（GS-03/05 绿、GS-07 绿），但 **self-check 实现 0 处**——哨兵自身挂了（loader 失败/适配器崩溃/scheduler 停摆）无人知晓 = S3-5 自诊断可信度断裂。补缺口: S3-5（自诊断可信度）+ T-22-02（GS-07 已绿但自诊断本身是独立缺口）。验收: 哨兵自检：loader 失败/适配器异常/调度空转 → 显式 degraded 信号 + 日志/工单；GS-07 不回归。⚠️ 归属: src/sentinel/ + src/cron/ + src/agent/sentinel-service 归 Mac DSH ✅ 纯领地。

> dev-doc 必须回答: ①自检面（健康指标清单 + 阈值）②信号形态（degraded 传播到哪一级）③与 watchdog 的关系（进程内 vs 进程外）④误报控制（偶发 vs 停摆判据）⑤验收可测性（注入故障 → 断言 degraded 信号）。

**来源**: [product-lines.yaml 线 22](docs/synova/product-lines/product-lines.yaml)（L922-961）

> 22-5 自我健康报告真实（完成度误判修复，D-G2）→ evidence: k3:AUTHORITY-DEVIATION-REGISTRY-v2，note: "S3-5/D-G2：引擎已修复，数据链路未担保"。22-2 重启自愈 → scenario:GS-07，note: "S3-4：稳定性达标（C线），但未演练"。

**来源**: [C线标准 S3-5](docs/synova/research/C线-世界级基准-20260802/第二章-标准维度框架-20260802.md)（L173）

> S3-5 自诊断可信度 | 系统能否真实报告自身健康（不欺骗）| 自诊断结果与实际状态一致率；信号文件完整性 |【证】可观测性行业"监控的监控"实践（行业通识）；【推导】自诊断必须可被外部审计，失真即 P0。

**来源**: [AGENTS.md](AGENTS.md)（铁律 0-2/24/31/32/39/47/48）+ [D394 交付](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D394-sentinel-events-20260816.md)

> 铁律 31: 降级信号传播——每个可独立失败的模块必须返回 degraded 标记，调用方检查，前端展示。铁律 24: 不能空吞异常。铁律 11: 静默降级禁止。D394 已交付 I2 单源（sentinel_events 唯一写入口）——self-check 的 finding 必须走 `appendSentinelEvent`（I2），不双写。

## 2. Problem Statement

哨兵体系是 Synova 的 7×24 自动巡检核心（PRODUCT-BRIEF §三.2）。但哨兵体系**自身**的健康不可见：loader 注册失败、适配器连续崩溃、scheduler 停摆——三类故障当前都不会产生任何显式信号（只有 log + 无人消费的计数）。企业主/FDE 看到"哨兵一切正常"时，可能是"哨兵全死后 dashboard 上的僵尸数据"（S3-5 自诊断可信度断裂，C线标准 L173："自诊断结果与实际状态一致率"无法保证）。

四个具体断点（实测，2026-08-23）：
1. **断点 1（loader 失败运行期无人知晓）**: 启动期有 degraded 记录（[bootstrap.ts Phase 2a L371-382](src/deploy/bootstrap.ts:371) `ctx.addDegraded`、[startup-check.ts L276-282](src/deploy/startup-check.ts:276)）、[file-driven-loaders.ts L74](src/init/file-driven-loaders.ts:74) log.warn），但**运行期**无人对比"注册数 vs 预期数"——46 个 manifest 只有 10 个注册成功 = 无人告警（[registry.count()](src/sentinel/registry.ts:52) 存在但无消费方检查）。
2. **断点 2（适配器崩溃无累计告警）**: [executeSentinel L969-990](src/sentinel/runner.ts:969) 单次失败有 `degraded: true` + log.error；[scheduler.ts runJob L383-391](src/cron/scheduler.ts:383) 失败 `job.failures++` + 60s 重试——但 **failures 递增后没有任何阈值判定/告警**（字段存在，零消费者）。
3. **断点 3（调度空转静默）**: [runner.start() L185-188](src/sentinel/runner.ts:185) `if (cronSentinels.length === 0) { log.info('无 cron-mode 哨兵 — 跳过启动'); return; }` 静默跳过；[aggregateAndDispatch L262](src/sentinel/runner.ts:262) `if (results.length === 0) return;` 静默返回——registry 空/records 空都无 degraded 信号。
4. **断点 4（陈旧度无人检查）**: [getStats() L234-248](src/sentinel/runner.ts:234) 返回 `lastRunAt`，但无人检查"多久没跑了"——哨兵全部停摆后 `lastRunAt` 停留在过去，无告警。

## 3. Q0-Q4

### 3.1 Q0 定位 — 项目拼图 + 文件审计

**a) 项目拼图**: L3 洞察层哨兵体系（runner 调度 + registry 注册 + loader 加载 + cron 执行）。本任务在哨兵体系上加"自诊断"能力——不改变哨兵的业务逻辑，只让体系能报告自身健康。

**b) 文件审计**（grep 实测，2026-08-23）:
| 文件 | 现状 | 复用/扩展/新建 |
|------|------|------|
| src/sentinel/runner.ts | 1044 行，start/executeSentinel/aggregateAndDispatch/getStats/事件溯源 | 扩展（runSelfCheck + cron 注册） |
| src/cron/scheduler.ts | 426 行，CronJob.failures/runs/lastRunAt + listJobs() L237 | 只读复用（listJobs 已暴露 failures——不需改） |
| src/sentinel/sentinel-loader.ts | 230 行，loadSentinels 返回 { sentinels, degraded, errors } + clearSentinelCache | 只读复用（self-check 运行期重扫需 clearSentinelCache） |
| src/sentinel/registry.ts | 119 行，count()/listCronSentinels() | 只读复用 |
| src/sentinel/sentinel-events.ts | 207 行，appendSentinelEvent/replaySentinelEvents（D394） | 只读复用（I2 单源写入） |
| src/agent/sentinel-service.ts | 270 行，L1 API 查询层 | 不改（self-check 走 records/events/工单管线，不需要 L2 服务方法——descope，见 §6） |
| src/monitoring/system-health.ts | L230/L301 消费 loadSentinels | **不改**（src/monitoring 冻结，D475 明确不碰） |
| src/deploy/bootstrap.ts | Phase 2a 启动期 degraded | 只读（不重复——运行期自检是新增能力） |
| tests/sentinel/ | 20 个测试文件 | 新建 self-check.test.ts |

**c) 决策**: 纯 Mac DSH 领地（src/sentinel/ + src/cron/），无 Win 冲突。src/monitoring 冻结红线遵守。

### 3.2 Q1 调研 — 业界最佳实践 / Anthropic 决策链 / memory 教训

**业界最佳实践**:
- **可观测性"监控的监控"**（C线 S3-5 依据）: 监控系统必须能监控自身（metrics 的 metrics）。健康检查不是"有没有日志"，是"能否从外部/独立视角验证系统在正常工作"。
- **心跳陈旧度检测**: OpenClaw heartbeat（30 分钟心跳，C线附录 E-D6）——"最后心跳距今太久 = 停摆"是业界通用判据（HAProxy/Consul 健康检查同款：`last_success` 陈旧度阈值）。
- **连续失败 vs 瞬时失败**: Kubernetes liveness probe 的 `failureThreshold`（连续 N 次失败才 kill/告警）——偶发失败给重试机会，连续失败才算故障（k8s 官方文档）。对应 scheduler 已有 60s 重试 + failures 计数。
- **Anthropic 基线**: 铁律 31 降级传播（degraded 必须到调用方）+ D394 I2 单源（信号必须走事件流）+ fail-closed（检查没跑 ≠ 检查通过）。

**memory/ 教训**:
- D394（事件溯源交付）: I2 单源——self-check 的 finding 必须经 `appendSentinelEvent`，不能绕过事件流直接写内存/表（防"双写漂移"）。
- D463（告警闭环）: critical/emergency → `createAutoTicket` 自动建工单（不依赖专家）——self-check 的 critical 复用此通道（runner 内部方法）。
- D475（guard-loop-hygiene）: `src/monitoring/` 冻结——self-check 用 sentinel 体系内联实现，不碰 system-health 模块。
- 阈值噪音化教训（派单已知风险）: "自检阈值若太敏感会噪音化（违反控制塔减负精神）——宁缺毋滥"——阈值偏保守，健康时零 finding。

**收敛**: 自检 = 进程内 cron（与哨兵同生命周期）+ 纯函数评估（可测）+ 复用现有工单/通知管线（最小机制）。**参考：Anthropic（降级传播 + I2 单源）+ DeepSeek（最少机制）+ 第一性原理（哨兵体系自诊 = 体系内一个特殊哨兵）**。

### 3.3 Q2 范围 — 正确的最简方案

**做什么**（对应写集 §5.1）:
1. 新建 `src/sentinel/self-check.ts`——`evaluateSentinelHealth()` 纯函数（输入健康指标 → 输出 findings），三指标 H1/H2/H3 + 阈值常量
2. `src/sentinel/runner.ts` 扩展——`runSelfCheck()` 方法（收集指标 → 评估 → 走事件流/工单/通知）+ `start()` 注册每小时 cron
3. `tests/sentinel/self-check.test.ts`——注入故障三路径断言
4. spec 本体

**不做什么**（详见 §6）: 不改 cron/scheduler.ts（listJobs 已够）；不改 src/agent/sentinel-service.ts；不改 src/monitoring（冻结）；不加新 routes/API 端点（Win 领地）；不做进程外 watchdog（已有 scripts/watchdog.js 管进程级）；不重跑企业专家 LLM（self-check 告警不路由专家）。

### 3.4 Q3 验收 — 入口 → 交互 → 结果

- **入口**: `npx vitest run tests/sentinel/self-check.test.ts`（注入故障断言）+ `bash scripts/golden-scenarios/GS-07-data-security/run.sh`（不回归）
- **交互**: 注入三类故障（loader 挂/适配器崩溃/空转）→ `runSelfCheck()` → 断言 degraded finding + 工单行
- **结果**: 显式 degraded 信号（records 里 `sentinel-self-check` finding + `sentinel_tickets` 表 auto 工单行）+ 健康时零 finding（噪音控制）+ GS-07 exit 0

### 3.5 Q4 契约与测试（铁律 47/48 — 写代码前定义）

**evaluateSentinelHealth 契约（src/sentinel/self-check.ts）**:
```
@input  state: {
          registryCount: number;          // registry.count() — 已注册哨兵数
          expectedCount: number;          // loadSentinels().sentinels.length — manifest 数
          cronJobs: Array<{ id: string; failures: number; lastRunAt: string | null; lastError: string | null }>;
                                          // scheduler.listJobs() 子集
          lastRunAt: string | null;       // runner.getStats().lastRunAt — 最近一次哨兵 run
          maxScheduleMs: number;          // 最稀 cron 间隔（分钟→ms）——陈旧度基准
          uptimeMs: number;               // 进程存活时长（从未跑过时判空转用）
        }
@output { healthy: boolean; findings: SentinelFinding[] }
   - healthy=true  → findings 为空（健康零噪音，宁缺毋滥）
   - healthy=false → findings 1~3 条（severity: warning/critical，见 §5.2 阈值）
@degraded — 输入数据缺失（registry 不可达等）→ log.warn + 保守判 degraded（fail-closed：检查没跑 ≠ 检查通过）
@error    — 无（纯函数，不抛）
```

**阈值常量（§5.2 定义，防噪音化的核心）**: H1 注册率 < 0.8 → warning；= 0 → critical。H2 连续 failures ≥ 3 → warning；≥ 5 → critical。H3 从未跑 + uptime > 1h → critical；lastRunAt 陈旧 > maxScheduleMs × 3 → warning。

## 4. Current State — 代码审计（2026-08-23 grep/read 实测）

### 4.1 缺陷 A（P0）: failures 计数存在但零消费者——适配器连续崩溃无告警

[scheduler.ts L370-392](src/cron/scheduler.ts:370) `runJob()` 失败路径: `job.lastError = msg; job.failures++; job.nextRun = Date.now() + 60000; log.error(...)`——failures 递增 + 60s 重试（瞬时故障有恢复机会），但**全仓库无任何代码读取 failures 做阈值判定**（grep 实测：`failures` 仅 scheduler.ts 内部自增/自清，L378 成功时归零）。同文件 [listJobs() L237-248](src/cron/scheduler.ts:237) 已暴露 `failures/lastRunAt/lastError`——数据在，消费者无。

### 4.2 缺陷 B（P0）: 调度空转静默——registry 空/records 空无 degraded

- [runner.start() L185-188](src/sentinel/runner.ts:185): `if (cronSentinels.length === 0) { log.info('[runner] 无 cron-mode 哨兵 — 跳过启动'); return; }`——loader 全挂 → registry 空 → **info 级日志后静默跳过**，无 degraded。
- [aggregateAndDispatch L262](src/sentinel/runner.ts:262): `if (results.length === 0) return;`——哨兵全没跑 → records 空 → **聚合静默返回**，无信号无工单。

### 4.3 缺陷 C（P1）: 陈旧度无人检查——lastRunAt 停在过去无告警

[getStats() L234-248](src/sentinel/runner.ts:234) 返回 `lastRunAt: lastRecord?.result.checkedAt ?? null`，但无任何调用方检查其陈旧度（grep 实测 `getStats` 调用方：仅测试 + [sentinel-service.ts L79](src/agent/sentinel-service.ts:79) 附近无陈旧检查）。

### 4.4 缺陷 D（P1）: 运行期 loader 健康无对比检查

启动期有 degraded（[bootstrap.ts L371-382](src/deploy/bootstrap.ts:371)、[startup-check.ts L276-290](src/deploy/startup-check.ts:276) `sentinels.length < 10` 硬编码下限、[file-driven-loaders.ts L74](src/init/file-driven-loaders.ts:74)），但**运行期**无人对比 `registry.count() vs loadSentinels().sentinels.length`——部分注册失败（如 46 个 manifest 只注册 30 个）静默通过。

### 4.5 接线现状（真实调用方，grep 实测）

| 符号 | 位置 | 说明 |
|------|------|------|
| `scheduler.listJobs()` | src/cron/scheduler.ts:237 | 已暴露 failures/lastRunAt/lastError——self-check 直接消费，不需改 scheduler |
| `registry.count()` / `listCronSentinels()` | src/sentinel/registry.ts:52/57 | self-check 指标源 |
| `loadSentinels()` + `clearSentinelCache()` | src/sentinel/sentinel-loader.ts:56/111 | 运行期重扫（cache 需清） |
| `getStats().lastRunAt` | src/sentinel/runner.ts:234 | 陈旧度指标源 |
| `createAutoTicket`（D463） | src/sentinel/runner.ts:491 | critical → 工单（runner 内部方法，self-check 复用） |
| `appendSentinelEvent`（D394 I2） | src/sentinel/sentinel-events.ts:119 | self-check finding 唯一写入口 |
| `dispatchNotification`（D6） | src/sentinel/runner.ts:302 | warning/critical → 桌面通知（Electron adapter 已注册 L195-197） |
| `dispatchSignalsToExperts` | src/sentinel/runner.ts:372 | self-check **不**进此路径（避免企业专家 LLM 诊断自身健康） |
| GET /api/sentinel/findings + tickets | src/routes（Win 领地） | 已存在，self-check 数据流入即可见——**零 routes 改动** |

## 5. What We Build

### 5.1 写集 (1 修改 + 3 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/sentinel/self-check.ts](src/sentinel/self-check.ts) | 新建 | `evaluateSentinelHealth()` 纯函数 + 阈值常量（H1/H2/H3）+ finding 构造（契约 §3.5） |
| [src/sentinel/runner.ts](src/sentinel/runner.ts) | 修改 | ①`runSelfCheck()` 方法：收集指标 → evaluateSentinelHealth → findings 走 `persistRunEvents`（I2 单源）→ critical 调 `createAutoTicket` → warning/critical 调 `dispatchNotification`；②`start()` 注册 `scheduler.schedule('SentinelSelfCheck', '0 * * * *', ...)`（每小时） |
| [tests/sentinel/self-check.test.ts](tests/sentinel/self-check.test.ts) | 新建 | 纯函数三路径 + 集成注入故障断言（≥10 用例，见 §7） |
| [docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D505-sentinel-self-diagnosis-20260823.md](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D505-sentinel-self-diagnosis-20260823.md) | 新建 | 本 dev doc |

> 版本信号（runtime）：无 VERSION.md 变更（非控制塔）；commit message 含 D505。

### 5.2 修复模式（编码 session 实现蓝图）

**健康指标清单 + 阈值（防噪音化，宁缺毋滥——派单已知风险）**:

| 指标 | 数据源 | 判据（偶发 vs 停摆） | severity |
|------|--------|------|------|
| H1 loader 健康 | `registry.count()` vs `loadSentinels().sentinels.length`（运行期重扫前 `clearSentinelCache()`） | 注册率 = 0（全挂）→ critical；< 0.8 → warning（部分注册失败）；≥ 0.8 → 健康 | critical / warning |
| H2 适配器健康 | `scheduler.listJobs()` 的 `failures` | 任一哨兵连续 failures ≥ 5 → critical；≥ 3 → warning（< 3 = 偶发，给 60s 重试机会，不算——k8s failureThreshold 同款） | critical / warning |
| H3 调度健康 | `getStats().lastRunAt` + maxScheduleMs（registry 各哨兵 cron 最稀间隔 × 3） | 从未跑（null）+ uptime > 1h → critical（空转）；lastRunAt 距今 > maxScheduleMs × 3 → warning（陈旧） | critical / warning |

> 恢复路径（自动清噪）: scheduler 成功 run 时 `failures = 0`（[scheduler.ts L378](src/cron/scheduler.ts:378) 已有）→ 下轮 self-check 自动转健康；哨兵恢复运行 → lastRunAt 刷新 → H3 自动恢复。self-check 健康时 findings 为空（零噪音）。

**信号传播路径（复用现有管线，零新通道）**:

```
runSelfCheck()（每小时 cron）
  → evaluateSentinelHealth(state) → findings（H1/H2/H3）
  → persistRunEvents(record)        # I2 单源: sentinel_events 表（D394）——可见性
  → projectRunRecord(records)       # GET /api/sentinel/findings 可见（sentinelId='sentinel-self-check'）
  → critical → createAutoTicket()   # D463: sentinel_tickets 表 auto 行 —— FDE 工单
  → warning/critical → dispatchNotification()  # D6: Electron 桌面通知（adapter 已注册）
  ✗ 不进 dispatchSignalsToExperts()  # 避免企业专家 LLM 诊断自身健康（噪音 + 语义错位）
```

**runSelfCheck 实现要点（runner.ts）**:

```ts
// start() 内注册（L204 附近，SignalAggregator 之后）:
this.scheduler.schedule('SentinelSelfCheck', '0 * * * *', async () => {
  await this.runSelfCheck();
});

// 新方法:
async runSelfCheck(): Promise<void> {
  const { evaluateSentinelHealth, HEALTH_CRITICAL, HEALTH_WARNING } = await import('./self-check');
  // 收集指标: registry.count() / loadSentinels（clearSentinelCache 后重扫）/ listJobs() / getStats()
  const state = { registryCount, expectedCount, cronJobs, lastRunAt, maxScheduleMs, uptimeMs };
  const { healthy, findings } = evaluateSentinelHealth(state);
  if (healthy) return;  // 健康零噪音（宁缺毋滥）
  // 走 I2 单源: persistRunEvents（record.sentinelId = 'sentinel-self-check'）
  // critical → createAutoTicket（复用 D463）; warning/critical → dispatchNotification（复用 D6）
  // 铁律 24/31: 每步独立 try/catch + log.warn（不静默）
}
```

**evaluateSentinelHealth 纯函数（self-check.ts）**:

```ts
export function evaluateSentinelHealth(state: SentinelHealthState): { healthy: boolean; findings: SentinelFinding[] } {
  const findings: SentinelFinding[] = [];
  const now = Date.now();
  // H1 loader: 注册率
  if (state.expectedCount > 0) {
    const ratio = state.registryCount / state.expectedCount;
    if (ratio === 0) findings.push(makeFinding('H1', 'critical', `哨兵全未注册（0/${state.expectedCount}）— loader 全挂`));
    else if (ratio < 0.8) findings.push(makeFinding('H1', 'warning', `部分哨兵注册失败（${state.registryCount}/${state.expectedCount}）`));
  }
  // H2 适配器: 连续失败（failures 已有 60s 重试恢复机会，≥3 才算）
  for (const job of state.cronJobs) {
    if (job.failures >= 5) findings.push(makeFinding('H2', 'critical', `哨兵 cron '${job.id}' 连续失败 ${job.failures} 次`));
    else if (job.failures >= 3) findings.push(makeFinding('H2', 'warning', `哨兵 cron '${job.id}' 连续失败 ${job.failures} 次`));
  }
  // H3 调度: 从未跑（空转）/ 陈旧
  if (!state.lastRunAt) {
    if (state.uptimeMs > 3600000) findings.push(makeFinding('H3', 'critical', '哨兵从未运行（空转）— 调度停摆'));
  } else if (now - new Date(state.lastRunAt).getTime() > state.maxScheduleMs * 3) {
    findings.push(makeFinding('H3', 'warning', `哨兵最近运行 ${Math.floor((now - new Date(state.lastRunAt).getTime()) / 60000)} 分钟前 — 超过调度间隔 ×3`));
  }
  return { healthy: findings.length === 0, findings };
}
// makeFinding: id=`self-check-${H#}-${seq}`（D354 稳定 id 规范）、severity、title、description、evidence:[]、suggestion、detectedAt=now、status:'open'
```

### 5.3 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| 自检位置 | A 进程内 cron（哨兵体系内）/ B 进程外独立 watchdog cron | 第一性原理（哨兵体系自诊 = 体系内能力）+ DeepSeek（最少机制） | **A**——self-check 与哨兵同生命周期（进程死了它死，正是 watchdog 的职责：scripts/watchdog.js 管进程级，两层互补）；B 引入独立进程/调度面，且进程级已有 watchdog 覆盖 |
| 信号形态 | A 特殊哨兵走 records/events/工单管线 / B 新 API 端点 / C 只 log | 铁律 31（degraded 必须到调用方/前端）+ D394 I2 单源 + 红线（routes 归 Win） | **A**——`sentinel-self-check` finding 流入现有 records → GET /api/sentinel/findings 可见；critical → 复用 D463 工单 + D6 桌面通知；**零 routes 改动**（Win 领地） |
| 告警路由 | A self-check 也进 dispatchSignalsToExperts / B 不路由专家 | 语义（企业专家诊断的是企业，不是哨兵体系自身）+ 噪音控制 | **B**——self-check 告警直接工单+通知，不花 LLM 成本让企业专家"诊断自己" |
| 误报阈值 | A 敏感（1 次失败即告警）/ B 保守（连续 N 次 + 陈旧度） | 派单已知风险（"阈值太敏感会噪音化——宁缺毋滥"）+ k8s failureThreshold 实践 | **B**——H2 连续 ≥3/≥5 分级；H3 间隔 ×3；健康零 finding；scheduler 60s 重试已滤瞬时故障 |

> 收敛检查：四决策点双参考系指向一致，无分歧。**参考：Anthropic + DeepSeek + 第一性原理（D333 决策模式）**。

### 5.4 编码 session 实现时需再确认的项（dev-doc 未知留接口）

1. **maxScheduleMs 计算**: registry 各哨兵 cron 表达式解析最稀间隔（`nextCronTime` 在 scheduler.ts:52 已有——编码 session 决定直接 import 复用还是自解析），默认兜底 24h × 3 = 72h。
2. **runSelfCheck 与 aggregateAndDispatch 的时序**: self-check 每小时整点跑；aggregate 每小时整点过 5 分跑——self-check 的 findings 会被下一轮 aggregate 聚合（含 self-check 自身）。若发现 self-check finding 干扰企业信号聚合（进入 `signals`），编码 session 可在 aggregateAndDispatch 的 results 收集处过滤 `sentinelId === 'sentinel-self-check'`（一行过滤，保持企业信号纯净）；本 dev doc 倾向过滤（防语义污染）。
3. **H1 expectedCount 语义**: `loadSentinels()` 有 cache（L51），运行期重扫需先 `clearSentinelCache()`——但 cache 可能含启动期错误；编码 session 决定重扫策略（每次 self-check 重扫 vs 仅首次）。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 不改 src/cron/scheduler.ts | listJobs() 已暴露 failures/lastRunAt/lastError（L237）——self-check 直接消费，改 scheduler 是多余写集 |
| 不改 src/agent/sentinel-service.ts | self-check 走 records/events/工单管线（L3 runner 层），L2 服务层无需新增方法（派单"如涉及调度健康"= 不涉及） |
| 不改 src/monitoring/system-health.ts | src/monitoring 冻结（D475 明确：self-check 用 engine-context 内联实现，不碰 system-health 模块） |
| 不加新 routes/API 端点（src/routes/ 不动） | routes 归 Win（TASK-ROUTING §一）；self-check 数据流入现有 GET /api/sentinel/findings + tickets 即可见 |
| 不做进程外 watchdog / 不改 scripts/watchdog.js | watchdog 管服务器进程级存活（healthz 检查 6 项含"看门狗存活"）；self-check 管哨兵体系级——两层互补，职责不重叠 |
| self-check 告警不路由企业专家 LLM（不进 dispatchSignalsToExperts） | 语义错位（企业专家诊断企业，不诊断哨兵自身）+ 噪音 + LLM 成本（§5.3 决策） |
| 不动 extensions/sentinels/ 任何 manifest / aggregate.ts | 哨兵业务逻辑不在本任务范围（只加体系自诊） |
| 不重跑/重设计 GS-07 | GS-07 已绿（派单：稳定性达标），本任务只回归确认不回归 |

## 7. Test Requirements

### 7.1 L1 单元契约（tests/sentinel/self-check.test.ts，新建）

red→green 对照表（铁律 0-2：测试先行，修复前必须失败——模块不存在即 red）：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| H1: registryCount=0, expectedCount=46 → critical finding（loader 全挂） | 模块不存在 → 编译失败 | evaluateSentinelHealth 输出 H1 critical |
| H1: registryCount=30, expectedCount=46（<0.8）→ warning finding | 同上 | 部分注册失败显式 |
| H1: registryCount=40, expectedCount=46（≥0.8）→ 无 H1 finding | 同上 | 健康零噪音 |
| H2: 某 job failures=5 → critical；=3 → warning；=2 → 无 finding（偶发不算） | 同上 | 连续失败分级阈值 |
| H2: failures=0 全部 → 无 H2 finding | 同上 | 健康零噪音 |
| H3: lastRunAt=null + uptimeMs>1h → critical（空转） | 同上 | 调度停摆显式 |
| H3: lastRunAt 距今 > maxScheduleMs×3 → warning（陈旧） | 同上 | 陈旧度判据 |
| H3: lastRunAt 距今 < maxScheduleMs×3 → 无 H3 finding | 同上 | 正常不误报 |
| 全部健康 → `{ healthy: true, findings: [] }`（宁缺毋滥） | 同上 | 健康零噪音 |
| finding 字段契约（id 稳定 `self-check-H1-1`、severity、detectedAt、status='open'） | 同上 | 契约可断言 |

### 7.2 L2a 接线（runner.ts 集成）

- `start()` 注册 `SentinelSelfCheck` cron（grep 断言 `scheduler.schedule('SentinelSelfCheck'` 存在——铁律 0-2 WIRE CHECK）
- `runSelfCheck()` 调 `evaluateSentinelHealth`（grep 断言 import 存在）
- critical finding → `createAutoTicket` 被调（集成测试断言 sentinel_tickets 表出现 auto 行，sentinelId 含 self-check）

### 7.3 L2b 降级（注入故障 → 显式 degraded 信号——本任务验收核心）

| 注入故障 | 断言 |
|------|------|
| loader 全挂（registry 空 + expectedCount>0） | runSelfCheck → records 出现 `sentinel-self-check` H1 critical finding |
| 适配器崩溃（注册抛错哨兵 → 3 次 runOnce 失败 → failures=3） | runSelfCheck → H2 warning finding + （critical 时）工单行 |
| 调度空转（records 空 + lastRunAt=null + uptime>1h） | runSelfCheck → H3 critical finding |
| 健康状态（registry 满 + failures=0 + lastRunAt 新） | runSelfCheck → 无 finding（零噪音） |
| 指标收集异常（scheduler.listJobs 抛错） | log.warn + 保守 degraded（fail-closed，铁律 24/31） |

### 7.4 L2c 边界

- 连续失败阈值边界（failures=2 → 无；=3 → warning；=5 → critical）
- 陈旧度边界（lastRunAt 恰好 = maxScheduleMs×3 → warning；刚过 → warning；未到 → 无）
- 恢复路径（failures 归零后 self-check 转健康——scheduler L378 已有归零逻辑，回归确认）
- self-check finding 不进 dispatchSignalsToExperts（§5.4 项 2 过滤——集成测试断言专家 dispatcher 未收到 self-check 信号）

### 7.5 场景级（GS-07 不回归）

`bash scripts/golden-scenarios/GS-07-data-security/run.sh` → exit 0（哨兵稳定性基线不回归，派单验收项）。

## 8. Wiring Verification

| 新 export / 变更 | 生产调用点（真实传递，测试调用不计） | grep 验证 |
|------|------|------|
| `evaluateSentinelHealth`（src/sentinel/self-check.ts） | [runner.ts](src/sentinel/runner.ts) `runSelfCheck()`（新方法，start() 内 cron 触发） | `grep -n "evaluateSentinelHealth" src/sentinel/runner.ts` 非零 |
| `runSelfCheck`（runner.ts 新方法） | [runner.ts](src/sentinel/runner.ts) `start()` 内 `scheduler.schedule('SentinelSelfCheck', ...)` | `grep -n "SentinelSelfCheck" src/sentinel/runner.ts` 非零 |
| self-check findings 流向 | `persistRunEvents`（I2 事件流）→ `records` → 现有 `GET /api/sentinel/findings`（routes 只读消费，零改动） | 集成测试断言 records 含 sentinel-self-check |
| critical → 工单 | `createAutoTicket`（runner.ts L491 已有方法，self-check 复用） | 集成测试断言 sentinel_tickets 表 auto 行 |
| warning/critical → 桌面通知 | `dispatchNotification`（runner.ts L302 已有，D6 adapter 已注册 L195-197） | 集成测试断言通知被派发 |

> ⚠️ 铁律 0-2 WIRE CHECK 是硬门禁：`grep -rn "evaluateSentinelHealth" src/sentinel/` — 零结果 = 未完成。测试调用不计（D331 WIRE CHECK 升级原文）。

## 9. Architecture Layer

**L3 洞察层**（哨兵体系）。理由：
- self-check.ts 在 `src/sentinel/`（L3）——与 runner/registry/loader 同层，纯函数无跨层依赖。
- runner（L3）调 `scheduler.listJobs()`（src/cron/，L2/L3 交界——runner 已持有 scheduler 实例，L2→L3 方向符合铁律 39"L3 洞察 → L2+L4"：runner 已是 L3，scheduler 是 runner 的调度依赖，既有接线不变）。
- 工单写 `sentinel_tickets` 表 + 事件写 `sentinel_events` 表（L5 存储）——runner.ts 已有同款（L153-166 建表 + D394 事件写入），不新增跨层违规。
- 不碰 src/monitoring（冻结）、不碰 src/routes（Win 领地）、不碰 src/agent/sentinel-service（L2 无需变更）。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. **DS1**: `src/sentinel/self-check.ts` 交付——`evaluateSentinelHealth` 纯函数 + H1/H2/H3 阈值常量 + finding 构造（契约 §3.5 全字段）
2. **DS2**: `tests/sentinel/self-check.test.ts` 全过（≥10 用例，§7.1 表，red 已证）
3. **DS3**: runner.ts 集成——`start()` 注册 `SentinelSelfCheck` cron（每小时）+ `runSelfCheck()` 方法（grep 断言，§8）
4. **DS4**: 注入故障 → 显式 degraded——loader 全挂 → H1 critical finding；适配器连续失败 → H2 finding；空转 → H3 critical finding（集成测试断言，§7.3）
5. **DS5**: critical → 工单——sentinel_tickets 表出现 auto 行（复用 D463 createAutoTicket）
6. **DS6**: 通知——warning/critical → dispatchNotification（D6 桌面通知通道）
7. **DS7**: 健康零噪音——健康状态 `{ healthy: true, findings: [] }`（宁缺毋滥，派单已知风险控制）
8. **DS8**: 不进 dispatchSignalsToExperts——self-check 告警不路由企业专家 LLM（§5.4 项 2 过滤，集成测试断言）
9. **DS9**: I2 单源——self-check finding 经 `persistRunEvents`（sentinel_events 表），无双写（D394 invariant 回归）
10. **DS10**: 零越界——src/monitoring、src/routes、src/agent/sentinel-service、src/cron/scheduler.ts 均未修改（git diff 断言）
11. **DS11**: GS-07 不回归——`bash scripts/golden-scenarios/GS-07-data-security/run.sh` exit 0
12. **DS12**: 全量 vitest 通过 + `as any`=0 + 12 组 pre-commit 全过 + 无 --no-verify + `git diff --name-only` 与写集一致
13. **DS13**: 完成报告含**决策记录**（§5.3 四决策点参考系与结论，S-12）——K3 可核
14. **DS14**: 推送 + CI 绿 + `git log origin/main..HEAD` 为空

> 交付声明必须覆盖以上 DS1-DS14 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项（S-10，D331 审计教训）。
> 显式 descope：22-3（断网降级，需产品设计，非本任务）、22-4（备份恢复演练，founder-demo 类）、22-6（K3 复核）——本任务只闭环 22-5（自我健康报告真实）在哨兵体系侧的数据链路（S3-5）。

## 11. Auth Doc References

| 引用 | 路径 |
|------|------|
| 派单（CTO 决策 + 5 问 + 已知风险） | docs/synova/coordination/派单-devdoc-20260823-D504-D505.md |
| 产品完成度 26 线（线 22 自诊断验收点） | docs/synova/product-lines/product-lines.yaml（L922-961） |
| C线标准 S3-5（自诊断可信度） | docs/synova/research/C线-世界级基准-20260802/第二章-标准维度框架-20260802.md（L173） |
| C线附录（OpenClaw heartbeat，S3-4/T-2 机制） | docs/synova/research/C线-世界级基准-20260802/附录-证据清单-20260802.md（E-D6） |
| 任务路由（src/sentinel/ + src/cron/ 归 Mac DSH） | docs/synova/coordination/TASK-ROUTING.md（§一） |
| 铁律（0-2/11/24/31/32/39/47/48） | AGENTS.md |
| D394 事件溯源交付（I1/I2/I3 invariant） | docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D394-sentinel-events-20260816.md |
| D463 告警闭环（createAutoTicket） | src/sentinel/runner.ts（L491） |
| D475 guard 冻结（src/monitoring 不碰） | docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D475-loop-handlers-realization-20260822.md |

## 12. 自检清单

- [x] 派单 5 问全部回答（§5.2 指标清单 + 阈值 / §5.3 信号形态 / §5.3 watchdog 关系 / §5.2 误报判据 / §7 注入故障验收）
- [x] 现状全部 grep/read 实测（scheduler L383 failures 零消费者 / runner L185 空 registry 静默 / runner L262 空 results 静默 / getStats L234 / listJobs L237 / bootstrap Phase 2a）
- [x] 断点四连（loader/适配器/空转/陈旧度）与派单描述一致
- [x] 写集与派单建议一致 + 与 D504 零交集（verify-parallel 可查）
- [x] 决策参考已记录（§5.3，S-12）：四决策点均走双参考系且收敛
- [x] DS 与 dev doc 一一对应（DS1-14，S-10）；无 phantom 声称（S-11）
- [x] 阈值宁缺毋滥（派单已知风险）：H2 ≥3/≥5 分级、H3 间隔×3、健康零 finding
- [x] 红线：src/monitoring 冻结 + src/routes 归 Win（零改动）+ src/cron/scheduler.ts 零改动
- [x] 编码 session 待确认项显式列出（§5.4）
- [x] 不是凭记忆
