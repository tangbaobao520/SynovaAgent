## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务在 L1(server.ts 交互层) + L4(deploy 部署基础设施)。
server.ts 当前 683 行全内联初始化，无 Phase 概念、无回滚。
src/deploy/ 已有 rollback.ts(快照回滚) + startup-check.ts(5项检查)。
### b) 文件审计
grep "Bootstrap" src/ → 仅 TUI tui-v2/lib/bootstrap.ts (不同体系，不冲突)
grep "loadSentinels|loadSkills|loadPlaybooks" src/ → sentinel/skill/playbook-loader 全部文件驱动已到位
grep "PhaseStateMachine" src/ → orchestrator/phase-state-machine.ts (诊断流水线 Phase，不冲突)
### c) 决策
无冲突 → 新建 src/deploy/bootstrap.ts。已有 rollback.ts 直接调用。Loader 零修改。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界: 系统启动序列 = Gradle Task DAG / Spring Boot ApplicationRunner / k8s init containers
   经典模式: infrastructure → storage → engine → presentation (与 doc §1.1 一致)
b) 简单 Pattern: Phase 数组 + 顺序执行 + 独立 try-catch
c) memory/ 教训: 
   - engine-core-split-fraud: 桥接文件伪装迁移 → bootstrap 不建桥接，真搬代码
   - plan-actual-closure: 声明完成须对比文档 → 对照 D83 spec 逐项验收

## Q2: 范围 — 正确的最简方案
做什么：
- 新建 src/deploy/bootstrap.ts: Bootstrap 类 + 6 Phase 定义 + 回滚协议 + 热重载预留接口
- 修改 src/server.ts: 接入 bootstrap.run()，保持 Express 路由设置不变
- 新建 tests/deploy/bootstrap.test.ts: ≥10 个测试
不做什么（含文件路径）：
- 不修改 src/sentinel/sentinel-loader.ts / src/skill/skill-loader.ts / src/playbook/playbook-loader.ts
- 不修改 src/routes/healthz.ts (D49)
- 不实现热重载 (D83 只留接口)
- 不实现 CausalChainLoader / ExpertPromptLoader 实际加载逻辑
- 不修改现有 route 文件 (~40 个路由文件)
- 不修改 src/deploy/rollback.ts (只调用)

## Q3: 验收 — 入口 → 交互 → 结果
入口: server.ts 入口 createServer() 调用 new Bootstrap().run()
处理: 6 Phase 顺序执行，fatal→exit, degraded→continue, Phase1→rollback, Phase2→DAG
结果: BootstrapResult 含 ok/degraded/services → server.ts 取服务做 Express 设置

## 架构层:
L1(server.ts) + L4(bootstrap.ts)

## Done 标准
[ ] bootstrap.ts: 6 Phase定义 + 子顺序依赖(2a→2b→2c) + 回滚协议 + 热重载预留
[ ] bootstrap.ts: Phase 0 fatal→exit, Phase 2-4 degraded→continue, Phase 1 rollback
[ ] bootstrap.ts: 每个 Phase 记录执行时间+结果到日志
[ ] server.ts: bootstrap.run() 在 app.listen() 前调用，失败时 app.listen 不执行
[ ] 不修改各 Loader 核心代码
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=10 测试: 全部通过/Phase0 fatal/Phase2 degraded/Phase顺序/Phase时间/错误传播/并行/降级追踪/reload
