# Task Brief: Runtime P0 — BehaviorMonitor 显式接线

> 生成: 2026-07-02 | 分支: feat/prompt-architecture | 基于 Codex 审查和 Anthropic 设计原则

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向（改 server.ts 启动流程）— `src/server.ts`

BehaviorMonitor（GA 行为监控，4 条规则）已实现且通过 `audit-service.ts` 间接调用，但启动流程中不可见。新工程师读 `server.ts` 不知道系统有行为监控能力。

- 性质：接线（已有代码 + 显式声明 = 可发现、可观测）
- 问题：隐式依赖 → 不可发现 → 不可运维

### b) 文件审计
- `src/server.ts` — 唯一修改文件（加 2 行：import + log）
- `src/services/behavior-monitor.ts` — 已有静态类，不改
- `src/services/audit-service.ts` — 已有调用链，不改

关系：接线（不改逻辑，只加可观测性）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题**：BehaviorMonitor 通过 `audit-service.ts:54` 的 `.catch()` 隐式激活。无法从启动流程中发现系统有行为监控能力。
2. **为什么不重构**：静态类 + 事件驱动 = 不需要 start()。只需要显式 import 告知系统"这个模块已加载"。
3. **最小方案**：`server.ts` 中 `await import('./services/behavior-monitor')` + `logger.info(...)`。2 行代码。
4. **为什么不是启动一个服务**：BehaviorMonitor 是纯静态 evaluate()，没有定时器、没有状态、没有要 start 的东西。强行加 start() 是过度工程。

引用依据：
- 铁律 7: 入口可触达（启动时可见模块存在）
- 铁律 31: 降级信号（import 失败时 log.error，不影响服务器启动）

### b) 本任务执行约束
- rule: "必须使用动态 import（不产生静态依赖）"
  verify: "grep -q 'await import.*behavior-monitor' src/server.ts"
- rule: "必须输出启动日志"
  verify: "grep -q 'logger.info\|log.info.*BehaviorMonitor\|behavior.*active' src/server.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. `src/server.ts` 的启动流程中加 2 行：
   - 动态 import BehaviorMonitor
   - logger.info 输出"行为监控已加载，4 条规则活跃"

不做什么：
- 不改 behavior-monitor.ts
- 不改 audit-service.ts
- 不添加 start() 或 init() 方法
- 不改变 evaluate() 的调用方式

## Q3: 验收 — 入口 → 交互 → 结果

入口：server.ts 启动
处理：动态 import + log
结果：启动日志中出现 "BehaviorMonitor loaded — 4 rules active"

## 本任务在哪一层
L1（src/server.ts）

## Done 标准
- [x] verify: grep -q 'await import.*behavior-monitor' src/server.ts
- [x] verify: grep -q 'BehaviorMonitor' src/server.ts
