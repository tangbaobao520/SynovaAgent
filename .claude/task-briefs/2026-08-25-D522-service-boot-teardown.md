# Task Brief — D522 L1-B 服务自启开窗即用（teardown 增强）

> 权威 spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D522-service-boot-20260825.md（本 brief 为其门禁摘要，冲突以 spec 为准）

## Q0: 定位 — 项目拼图 + 文件审计
Synova = AI 诊断 Agent。本任务在 L1 交互层（Electron 桌面端服务自启基建）。
已有: electron/backend-spawn.cjs（五段链路，D504 交付）+ electron/main.cjs（接线就绪）。
本任务 = 补齐 backend-spawn.cjs 的 teardown 段（进程组/taskkill/SIGKILL 升级/幂等）+ teardown 测试。
文件审计: backend-spawn.cjs 唯一实现，无重复覆盖 → 扩展（不改探活 probeOnce/probeUntil）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
跨平台子进程回收标准范式: POSIX 进程组 kill(-pgid)、Win `taskkill /T /F`、SIGTERM→SIGKILL 优雅升级。
Anthropic 基线 = 机器可验契约（pid 已死是 kill(pid,0) 抛 ESRCH 的物理断言）+ fail-closed（teardown 幂等）。
memory: D510 F1（禁 grep 冒充实测）+ D504 F2（退出回收未闭环）。
### Q1c 决策参考系
参考：Anthropic/DeepSeek/第一性原理 + 结论: signalTree/taskkill/SIGKILL 升级三范式补齐，teardown 集成测试断言 pid 已死。

## Q2: 范围 — 正确的最简方案
做什么：
- electron/backend-spawn.cjs: spawn 加 detached（POSIX）+ signalTree/taskkillProcessTree + makeStop（SIGTERM→SIGKILL，graceMs 可注入）+ stop/degraded 清理统一走 makeStop + 幂等 + 导出新辅助函数
- tests/electron/backend-spawn.test.ts: 补 teardown 三路径 + 五段链路 stop 回收断言
不做什么（含文件路径）：
- 不改 src/ 任何文件（首诊后端生产可用）
- 不改 electron/main.cjs（接线已就绪）
- 不改探活逻辑（probeOnce/probeUntil）
- 不改 build-synova.cjs（D517 领地）
- 不引入 @deepseek-ai/dsh 依赖（R1 红线，借鉴范式自研）

## Q3: 验收 — 入口 → 交互 → 结果
入口（从哪触发）: 双击应用 → main.cjs whenReady → ensureBackend；before-quit → stop()
处理（中间步骤）: 五段链路（探活失败→spawn→轮询→健康）+ stop() = signalTree(SIGTERM)→graceMs→SIGKILL
结果（最终展示）: `npx vitest run tests/electron/backend-spawn.test.ts` 全绿；stop() 后 kill(pid,0) 抛 ESRCH（物理断言）；孙进程也死。

## 架构层: L1
backend-spawn.cjs 纯 Node 模块，零跨层 import。

## Done 标准
1. vitest run tests/electron/backend-spawn.test.ts 全绿（含 teardown 断言）
2. stop() 后子进程 pid 已死（ESRCH 物理断言）
3. POSIX 进程组: 孙进程 pid 也死
4. SIGTERM→SIGKILL 升级: 忽略 SIGTERM 的子进程在 graceMs 后死
5. WIRE CHECK: main.cjs L19/L126/L186-192 接线（已存在，验证不改）
6. 写集外零改动（git diff --name-only 对账）
7. task-state/D522.json 回填 impl + evidence
