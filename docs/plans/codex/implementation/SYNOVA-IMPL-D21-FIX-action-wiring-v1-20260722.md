# SynovaAgent -- D21-FIX Action 闭环接线修复 实施方案 v1.1

> 2026-07-22 | v1.1 修正：注入位置从 bootstrap.ts → synova-agent.ts（Line 83-85）+ pushChannel 不存在改用 `[]`
> 审计发现：P0 接线断裂 — setActionStore 零调用方 + ProactivePush 无生产实例
> **审计报告：SYNOVA-AUDIT-REPORT-20260722.md — P0 第1项、第2项**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/agent/synova-agent.ts`、`src/sentinel/runner.ts`、`src/agent/proactive-push.ts`、`src/growth/action-store.ts` 全部存在
- [x] Get-Content 读取：synova-agent.ts Line 83-85 — `new SentinelRunner(this.scheduler, this.db)` + `setGlobalSentinelRunner(...)` + `this.sentinelRunner.start()` — ProactivePush 注入点
- [x] Select-String 验证：`new ProactivePush` 在 `src/` 中 0 结果（仅在测试文件中）；`setActionStore` 在 `src/` 中仅定义行 1 处（proactive-push.ts:120）；`pushChannel` 在 `src/` 中 0 结果
- [x] v1.1 修正验证：bootstrap.ts 中无 SentinelRunner 实例化（已通过 rg 确认），正确注入位置在 synova-agent.ts:83
- [x] 引用 — Iron Law 4（接线交付不完整）、Iron Law 0-5 错误 #12（接线断链没发现）

---

## v1.1 变更说明

| 项目 | v1.0 (错误) | v1.1 (修正) |
|------|------------|------------|
| 注入文件 | bootstrap.ts Phase 2d | **synova-agent.ts Line 83-85** |
| 引用变量 | pushChannel (不存在) | **[] (空 push 通道，推送待后续接线)** |
| 注入目标 | `sentinelRunner.registerAndStart()` | **`this.sentinelRunner = new SentinelRunner(...)` 之后** |

修正依据：rg 搜索确认 — `pushChannel` 在 `src/` 中 0 结果；`new SentinelRunner` 仅在 `src/agent/synova-agent.ts:83` 一处生产实例化。

---

## 问题根因

D21 审计发现两个层层叠加的接线断裂：

1. **ProactivePush 本身未在生产代码中实例化** — `new ProactivePush` 全在测试文件中，`src/` 中零实例化。
2. **setActionStore 无调用方** — 即使 ProactivePush 被实例化，`setActionStore()` 也无人调用，Action 创建路径永不执行。

两个问题一修复，Action 闭环从"完全休眠"变为"内存模式运行"。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 接线修复。修复 D21 Action 闭环的 P0 接线断裂——在 synova-agent.ts 的 SentinelRunner 创建后立即创建 ProactivePush 实例并注入 ActionStore。最小改动、仅接线、不改逻辑。

### Q1：调研
- synova-agent.ts Line 83-85：`SentinelRunner` 唯一生产实例化点，紧接着 `setGlobalSentinelRunner` + `start()`
- runner.ts：`setProactivePush()` 方法存在（Line 141）但无生产调用方
- proactive-push.ts：`setActionStore()` 方法存在（Line 120）但无调用方
- action-store.ts：`ActionStore` 类完整，支持无 GraphStore 的降级模式（内存存储）
- pushChannel：在 `src/` 中零存在 — 推送通道接线为后续任务，本轮仅接 Action

### Q2：范围
- 最小：在 synova-agent.ts Line 85（`this.sentinelRunner.start()` 后）添加 5 行注入代码
- 不做：不修改 ProactivePush 或 ActionStore 内部逻辑、不添加 GraphStore 持久化（后续任务）、不接推送通道（`new ProactivePush([])` — 空通道）

### Q3：验收
- 入口：synova-agent.ts Line ~86 → 创建 ProactivePush → 注入 ActionStore → `sentinelRunner.setProactivePush(proactivePush)`
- 交互：哨兵 P0 信号 → runner.ts L301 `proactivePush.onP0Finding(finding)` → `actionStore.createAction(finding)`
- 结果：Action 在内存中创建（内存模式），日志输出 "D21 Action 已从 P0 信号创建"

### Q4：契约与测试
- @input：synova-agent.ts 启动上下文（this.sentinelRunner + this.scheduler）
- @output：ProactivePush 实例已配置 + ActionStore 已注入 + sentinelRunner 已接线
- @degraded：ActionStore 内存模式（无 GraphStore）→ log.warn + Action 仍创建；空 push 通道 → 推送跳过
- 测试：验证 SentinelRunner.setProactivePush 被调用（通过日志输出验证）+ Action 创建日志可输出

---

## 修复内容

### 1. 修改 src/agent/synova-agent.ts — Line 85 后追加（5 行）

**当前代码（Line 82-85）：**
```typescript
    // SentinelRunner — 启动所有 cron 哨兵 (P1-4)
    this.sentinelRunner = new SentinelRunner(this.scheduler, this.db);
    setGlobalSentinelRunner(this.sentinelRunner);
    this.sentinelRunner.start();
```

**修复后：**
```typescript
    // SentinelRunner — 启动所有 cron 哨兵 (P1-4)
    this.sentinelRunner = new SentinelRunner(this.scheduler, this.db);
    setGlobalSentinelRunner(this.sentinelRunner);
    this.sentinelRunner.start();

    // D21-FIX: 创建 ProactivePush 实例 + 注入 ActionStore + 接线到 SentinelRunner
    const proactivePush = new ProactivePush([]);  // 空通道 — 推送后续接线
    proactivePush.setActionStore(new ActionStore());
    this.sentinelRunner.setProactivePush(proactivePush);
```

需要在文件顶部添加 import：
```typescript
import { ProactivePush } from './proactive-push';
import { ActionStore } from '../growth/action-store';
```

### 2. 验证 src/sentinel/runner.ts — 无需修改

已有代码已正确调用（Line 286-302）：

```typescript
const proactivePush = this.proactivePush;
if (proactivePush) {
  // ...
  proactivePush.onP0Finding(finding).catch((err: Error) => {
    log.warn({ err, signalId: finding.id }, 'P0 主动推送失败');
  });
}
```

修复后 `this.proactivePush` 非 null，`onP0Finding` 将执行，进而触发 `this.actionStore.createAction(finding)`。

---

## 不做什么

- 不修改 ProactivePush 的推送逻辑
- 不修改 ActionStore 的状态机逻辑
- 不添加 GraphStore 持久化（Action 当前为内存模式，持久化后续任务）
- 不修改 runner.ts 的 onP0Finding 调用逻辑
- 不接推送通道（ProactivePush 用空数组 `[]` 初始化，推送后续任务）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- SynovaAgent 启动后 sentinelRunner 的 ProactivePush 已注入（通过 `runner.proactivePush.onP0Finding(finding)` 调用日志验证）
- ActionStore 内存模式：Action 创建日志 "D21 Action 已从 P0 信号创建" 可输出
- 4 组 fixture：normal(正常注入) / boundary(空 push 通道) / error(注入失败不阻断启动) / temporal(重复注入不报错)

### L2a：接线测试
- synova-agent.ts 包含 `new ProactivePush` 调用（grep "ProactivePush" src/agent/synova-agent.ts）
- synova-agent.ts 包含 `setActionStore` 调用（grep "setActionStore" src/agent/synova-agent.ts）
- synova-agent.ts 包含 `setProactivePush` 调用（grep "setProactivePush" src/agent/synova-agent.ts）
- synova-agent.ts 包含 `import { ActionStore }` 导入（grep "ActionStore" src/agent/synova-agent.ts）

### L2c：循环基础设施测试
- 集成测试：启动 SynovaAgent → 模拟哨兵 P0 信号 → 验证 Action 创建日志

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| ProactivePush(setActionStore) | synova-agent.ts Line ~88 | grep "setActionStore" src/agent/synova-agent.ts |
| SentinelRunner.setProactivePush | synova-agent.ts Line ~89 | grep "setProactivePush" src/agent/synova-agent.ts |
| ActionStore | synova-agent.ts Line ~88 | grep "ActionStore" src/agent/synova-agent.ts |

---

## 完成标准

```
[ ] synova-agent.ts: import { ProactivePush } from './proactive-push'
[ ] synova-agent.ts: import { ActionStore } from '../growth/action-store'
[ ] synova-agent.ts Line ~87: const proactivePush = new ProactivePush([])
[ ] synova-agent.ts Line ~88: proactivePush.setActionStore(new ActionStore())
[ ] synova-agent.ts Line ~89: this.sentinelRunner.setProactivePush(proactivePush)
[ ] runner.ts: this.proactivePush 非 null（启动后立即验证，通过日志输出）
[ ] Action 创建日志: "D21 Action 已从 P0 信号创建" 可输出
[ ] 降级: ActionStore 内存模式 → log.warn + Action 仍创建
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] vitest run --changed 零新增失败
[ ] >=6 个测试：注入验证(2) + 接线验证(2) + 集成(2)
```

---

## 权威文档引用

- AGENTS.md Iron Law 4：交付不完整 — 写了代码没接线
- AGENTS.md Iron Law 0-5 错误 #12：接线断链没发现
- SYNOVA-AUDIT-REPORT-20260722.md — P0 第1项、第2项
- D21 dev doc：[SYNOVA-IMPL-D21-action-closed-loop-v1-20260722.md](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D21-action-closed-loop-v1-20260722.md)
