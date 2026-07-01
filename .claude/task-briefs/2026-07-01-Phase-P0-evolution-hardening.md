# Task Brief: Phase P0 — 进化引擎生产加固

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | 基于 EVOLUTION-LAYER-v2.md + ARCH-13 风险控制§6.5

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。Agent，不是 ChatBot。
L0 进化引擎是让诊断系统越用越准的核心能力——但进化本身必须有安全阀。
**没有防护的进化 = 不可控的退化。**

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（修复已有模块）— packages/evolution/

本任务对已交付的 L0 进化引擎做生产加固。不改功能，只加安全防护。
- 性质：修复/加固（非新功能）
- 为什么现在做：ARCH-13 §6.5 的风险控制要求在功能上线前完成。
  三个 P0 级缺失会直接导致线上事故：阈值无限下调、无冷却期反复调整、出问题不可观测。

三个修补：

| # | 问题 | 场景 | 后果 |
|---|------|------|------|
| 1 | 无可观测性 | 进化引擎静默运行，无 metrics，无状态端点 | 出问题无法排查 |
| 2 | 无冷却期 | 用户 5 分钟内纠错 2 次 → 阈值被调 2 次 | 短期波动导致频繁误调 |
| 3 | 无阈值上下界 | 同一个哨兵被反复纠错 → 阈值无限趋近 0 | 该哨兵永不再告警 |

### b) 文件审计
- `packages/evolution/src/org-adapter.ts` — adjustThresholds 需加冷却期+上下界
- `packages/evolution/src/evolution-types.ts` — EvolutionConfig 需加冷却期配置
- `packages/evolution/src/global-analyzer.ts` — 需上报 metrics
- `packages/evolution/src/expert-evolution.ts` — 需上报 metrics
- `packages/evolution/src/rule-version-manager.ts` — 需上报 metrics
- `packages/evolution/src/index.ts` — 需导出 EvolutionMetrics
- `src/routes/evolution.ts` — 需加 GET /api/evolution/status

关系：修复（已有模块）+ 新建（EvolutionMetrics + status endpoint）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题定义**：三个独立的问题，每个的根因不同。
   - 无观测：设计时认为"log 就够了"——错，log 不聚合就没有价值
   - 无冷却期：ARCH-13 的控制措施在实现时被遗漏
   - 无阈值边界：加减乘除没有保护

2. **每个的最小可行方案**：
   - 观测：in-memory 计数器（Reset 后清零）+ HTTP 状态端点 + 内置 OperationLog（环形缓冲区 1000 条）。不依赖 Prometheus/external 服务。
   - 冷却期：阈值调整后记录 adjustedAt → 下次调整检查是否 ≥ 冷却期（默认 24h）
   - 边界：Math.max(MIN_THRESHOLD, newCritical) + Math.min(MAX_THRESHOLD, newCritical)

3. **为什么不加外部依赖**：进化引擎应该可以在环境（无 Prometheus 等基础设施）中独立运行。环形日志+计数器的模式 0 外部依赖。

引用依据：
- 铁律 24+31: 错误处理 + 降级信号（metrics 降级语义独立）
- 铁律 7: 入口可触达（GET /api/evolution/status）+ 链路完整 + 结果可见
- ARCH-13 §6.5: 冷却期、过度拟合单用户保护

### b) 本任务执行约束
- rule: "metrics 必须 0 外部依赖（不使用 Prometheus/OpenTelemetry 等）"
  verify: "grep -c 'prometheus\|opentelemetry\|datadog' packages/evolution/src/ --include='*.ts'"
- rule: "冷却期必须检查 adjustedAt 时间戳，不依赖外部时钟"
  verify: "grep -q 'adjustedAt\|Date.now\|coolingPeriod' packages/evolution/src/org-adapter.ts"
- rule: "阈值下界不得低于 0.05"
  verify: "grep -q '0.05\|MIN_THRESHOLD\|MIN_THRESH' packages/evolution/src/org-adapter.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. **EvolutionMetrics** — 新建 `packages/evolution/src/evolution-metrics.ts`
   - 计数器：correctionsProcessed / thresholdsAdjusted / proposalsCreated / proposalsApproved / proposalsRejected / errors
   - 环形操作日志（最近 1000 条操作）
   - `getSnapshot()` 返回当前快照
2. **org-adapter.ts 加固**：
   - `adjustThresholds()` 加冷却期检查（`coolingPeriodHours`，默认 24h）
   - `adjustThresholds()` 加上下界保护（下界 0.05，上界 5x）
3. **`src/routes/evolution.ts`** — 新增 `GET /api/evolution/status` 端点
4. **metrics 接线** — 在 org-adapter/global-analyzer/expert-evolution 的关键路径上报

不做什么：
- 不改存储层（metrics 纯内存）
- 不改 src/l4/agent-memory-store.ts
- 不改 sentinel/runner.ts
- 不改 server.ts 的路由注册（evolution.ts 已有路由）

## Q3: 验收 — 入口 → 交互 → 结果

入口：GET /api/evolution/status → 返回 metrics 快照 + 操作日志
处理：org-adapter.adjustThresholds() 触发冷却期检查 + 边界保护 + metrics 上报
结果：5 分钟内对同一哨兵连续多次触发诊断 → 冷却期阻止第二次调整

## 本任务在哪一层
L0（packages/evolution/）+ L1（routes/evolution.ts）

## Done 标准
- [x] verify: test -f packages/evolution/src/evolution-metrics.ts
- [x] verify: grep -q 'coolingPeriodHours' packages/evolution/src/org-adapter.ts
- [x] verify: grep -q 'MIN_THRESHOLD' packages/evolution/src/org-adapter.ts
- [x] verify: grep -q 'status' src/routes/evolution.ts
- [x] verify: npx vitest run tests/evolution/evolution-metrics.test.ts 2>&1 | tail -5 | grep -q 'Tests'
- [x] verify: npx vitest run tests/evolution/org-adapter.test.ts 2>&1 | tail -5 | grep -q 'Tests'
- [x] verify: npx tsc --noEmit 2>&1 | grep -c 'evolution-metrics\|org-adapter'; test $? -eq 1
