# Task Brief: RUNTIME Phase 4 — 进程隔离（命令Lane）+ 配置恢复

> 生成: 2026-07-03 | 对标: RUNTIME-EXCELLENCE-IMPL-v1.md §Phase 4
> 交付链路: task brief → test → impl → wire → tsc → vitest → pre-commit → push → CI ✅

## Q0: 定位

### a) 项目拼图
本任务属于**纵向（基础设施）**。

- **Phase 4.1（命令Lane）** → 横切（src/infra/command-lanes.ts），L1-L3 均受益
- **Phase 4.2（配置恢复）** → L5 存储层（src/services/config-recovery.ts），src/config.ts 接线

现有模块：
- `src/agent/synova-agent.ts` — start() 中 cron 和 sentinel 共用主线程，无隔离
- `src/config.ts` — loadConfig() 调用 loadFileConfig()，无损坏检测/自动恢复
- `src/infra/trace-context.ts` — 已有 trace 基础设施

### b) 文件审计
grep `CommandLane\|commandLane\|config.*recover\|ConfigRecovery` → 零结果。全新。

### c) 决策
新建 2 个文件 + 修改 1 个文件。无冲突。

## Q1: 调研

决策链: SPEC → 测试 → 实现 → 接线 → 验证
引用: 铁律 0-2, 7, 24, 31, 38

执行约束:
- rule: "command-lanes 必须隔离 main/cron/expert 三条 lane"
  verify: "grep -n "'main'\|'cron'\|'expert'" src/infra/command-lanes.ts"
- rule: "config-recovery 必须检测 JSON 解析失败和大小下降>50%"
  verify: "grep -n 'JSON.parse\|size.*50\|下降' src/services/config-recovery.ts"
- rule: "ConfigRecovery 必须在 synova.json 损坏时自动从 .bak 恢复"
  verify: "grep -n '\.bak\|last-good' src/services/config-recovery.ts"

## Q2: 范围

Phase 4.1 — 命令Lane（新建 `src/infra/command-lanes.ts`）：
1. `LaneId` 类型: 'main' | 'cron' | 'expert'
2. `CommandLane` 类: 内部串行队列，lane 间自动隔离
3. `execute(laneId, task)` — 提交任务到指定 lane
4. 关闭期间拒绝新任务
5. 活跃任务超时清理（默认 30s）

Phase 4.2 — 配置恢复（新建 `src/services/config-recovery.ts`）：
1. `ConfigRecovery.verify(configPath)`: JSON 解析 + 字节数校验 + 密钥占位符检测
2. 损坏时自动从 synova.json.bak 恢复
3. 记录审计事件（通过日志）
4. 返回恢复结果（ok/restored/failed）

接线（修改 `src/config.ts`）：
1. `loadConfig()` 中加载成功后调用 ConfigRecovery.verify()
2. 如恢复成功，重新加载配置

不做什么：
- ❌ 不修改 synova-agent.ts 的 lane 使用（只实现 lane 基础设施，接线后续迭代）
- ❌ 不实现文件驱动配置（仅 JSON + .bak 恢复）
- ❌ 不涉及 packages/engine-core 引用
- ❌ 不使用 as any

## Q3: 验收

Phase 4.1 — 命令Lane：
入口: execute(laneId, task) 提交任务
处理: 任务排队 → 串行执行 → 超时清理
结果: main lane 卡住不影响 cron lane

Phase 4.2 — 配置恢复：
入口: loadConfig() 加载 synova.json
处理: ConfigRecovery.verify() → JSON 校验 → 损坏则 .bak 恢复
结果: 损坏的配置自动恢复，日志记录恢复事件

## 本任务在哪一层
L5（src/services/config-recovery.ts）+ 横切（src/infra/command-lanes.ts）

## Done 标准
- [ ] 入口可触达: execute('main', task) 可提交并执行
- [ ] 链路走通: main lane 阻塞 → cron lane 仍可执行
- [ ] 结果可见: 损坏 synova.json → 自动从 .bak 恢复
- [ ] tsc --noEmit 零错误
- [ ] vitest run 零失败
- [ ] pre-commit 8 组通过
- [ ] CI success
