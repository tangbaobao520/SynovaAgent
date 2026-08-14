# SynovaAgent -- D214 共享信号发射器 (Shared Signal Emitter) 实施方案 v1.0

> 2026-07-23 | 权威文档 #17 Ch2 §4.3 + Ch3 §2.1 + Ch4 §3.2 + Ch5 §2.1
> **控制塔 Phase 3 — D213 仪表盘的数据源。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`app/js/control-tower.js` 存在（D213 仪表盘 JS），`src/control-tower/` 目录不存在（待建）
- [x] Get-Content 读取：D213 control-tower.js Line 14-19 — 6 组件 signalPath 配置：`context-injector` / `gatekeeper` / `external-auditor` / `contract-archiver` / `dev-doc-gatekeeper` / `write-lock`。其中 gatekeeper 读管道格式，其余 5 个读 JSON 格式。
- [x] Select-String 验证：D213 `parseSignal()` 支持 JSON 和管道两种格式（Line 72-112）；D201-Phase2 `write_dashboard_signal()` 写入管道格式（Line 106）
- [x] 引用 — Ch2 §4.3："网守进程维护一个信号文件 `.codex/settings/gatekeeper/.dashboard-signal`，格式: `{COLOR}|{component}|{timestamp}|{reason}`"

---

## 问题根因

D213 仪表盘已建好，但 `.codex/signals/` 目录下没有任何信号文件。6 个控制塔组件中只有 D201-Phase2 的 gatekeeper 写了管道格式的 `.dashboard-signal`。其余 5 个组件（D200/D202/D208/D209/D212）没有向仪表盘写入信号的机制。需要一个共享信号发射器让所有组件统一推送状态。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 共享信号发射器。TypeScript 模块 `src/control-tower/signal-emitter.ts`：提供 `emitSignal()` 函数，写 JSON 信号到 `.codex/signals/{component}.json`。D213 仪表盘通过静态文件服务读取这些文件。

### Q1：调研
- D213 仪表盘 JS 期望 6 个组件的信号路径（Line 14-19），其中 5 个读 `.codex/signals/{component}.json`
- Ch2 §4.3 定义了管道格式用于 gatekeeper，但 JSON 格式更适合其他组件（结构化、可扩展）
- D201-Phase2 已实现 `write_dashboard_signal()` 函数写入管道格式（保持向后兼容）
- D213 `parseSignal()` 同时支持 JSON (`JSON.parse`) 和管道（`|` 分隔）两种格式

### Q2：范围
- 最小：`src/control-tower/signal-emitter.ts` — 单一模块，导出 `emitSignal()` 函数
- 做法：各组件（D200/D202/D208/D209/D212/D211）调用 `emitSignal()` 写入自己的信号文件
- 不做：不修改 D201-Phase2 的管道格式信号（gatekeeper 已工作）

### Q3：验收
- 入口：任一组件调用 `emitSignal('write-lock', 'green', 'lock_healthy')`
- 交互：信号写入 `.codex/signals/write-lock.json` → D213 仪表盘 fetch → 解析 JSON → 渲染绿色卡片
- 结果：D213 仪表盘从全灰色变为显示实际组件状态

### Q4：契约与测试
- @input：component (string), status (green|yellow|red), reason (string), counts ({p0, p1, p2})
- @output：`.codex/signals/{component}.json`（JSON 格式）
- @degraded：目录不可写 → log.warn + 不阻断调用方
- 测试：emitSignal 写入(1) + D213 parseSignal 解析(1) + 降级目录不可写(1) + 管道兼容(1) = 4 tests

---

## 构建内容

### 1. src/control-tower/signal-emitter.ts（新建，约 100 行）

```typescript
export interface SignalPayload {
  component: string;
  status: 'green' | 'yellow' | 'red';
  timestamp: string;
  reason: string;
  p0_count?: number;
  p1_count?: number;
  p2_count?: number;
}

export function emitSignal(
  component: string,
  status: 'green' | 'yellow' | 'red',
  reason: string,
  counts?: { p0?: number; p1?: number; p2?: number }
): void {
  const signal: SignalPayload = {
    component,
    status,
    timestamp: new Date().toISOString(),
    reason,
    p0_count: counts?.p0 || 0,
    p1_count: counts?.p1 || 0,
    p2_count: counts?.p2 || 0,
  };
  const dir = join(process.cwd(), '.codex', 'signals');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${component}.json`), JSON.stringify(signal, null, 2), 'utf-8');
  } catch (err) {
    log.warn({ err, component }, '信号写入失败 — 降级');
  }
}
```

### 2. 各组件集成（6 处调用，每个组件在自己代码中调用一次）

D200 context-injector: `emitSignal('context-injector', status, reason)` — 在 inject-context.py 执行后
D201 gatekeeper: 已有 `write_dashboard_signal()` 管道格式 — 无需修改
D202 external-auditor: `emitSignal('external-auditor', status, reason, counts)` — 在 audit 完成后
D208 contract-archiver: `emitSignal('contract-archiver', status, reason)` — 在 extract/validate 后
D209 write-lock: `emitSignal('write-lock', status, reason)` — 在 acquire/release 异常时
D212 dev-doc-gatekeeper: `emitSignal('dev-doc-gatekeeper', status, reason)` — 在 C1-C5 检查后

> D214 的任务范围是建 signal-emitter.ts + 在至少 2 个组件中演示集成。
> 其余组件的集成由各自的后续 D#（D216-D218）在补全时完成。

---

## 不做什么

- 不修改 D201-Phase2 gatekeeper 信号（已有管道格式，D213 兼容）
- 不修改 D213 仪表盘（已支持 JSON 格式读取）
- 不在所有 6 个组件中强制集成（逐步接入）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `emitSignal('write-lock', 'green', 'all_healthy')` → `.codex/signals/write-lock.json` 存在且格式正确
- D213 `parseSignal(JSON.stringify(signal))` → 正确解析 status/reason/timestamp/p0/p1/p2
- 信号目录不可写 → 不抛异常 + log.warn（降级）
- 管道格式 `GREEN|gatekeeper|2026-07-23T10:00:00Z|all_checks_pass` → parseSignal 返回正确 status
- 4 个测试

### L2a：接线测试
- `signal-emitter.ts` 存在且导出 `emitSignal` 函数
- `.codex/signals/` 目录在首次写入时自动创建

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| emitSignal() | 各控制塔组件 | grep "emitSignal" src/ |
| SignalPayload type | signal-emitter.ts 内部 + D213 类型参考 | grep "SignalPayload" |

---

## 完成标准

```
[ ] src/control-tower/signal-emitter.ts: emitSignal() + SignalPayload type
[ ] JSON 格式: component/status/timestamp/reason/p0/p1/p2 7 字段
[ ] .codex/signals/ 目录自动创建（mkdir recursive）
[ ] 降级: 目录不可写 → log.warn + 不阻断调用方
[ ] 至少 2 个组件演示集成（推荐 D212 dev-doc-gatekeeper + D209 write-lock）
[ ] D213 parseSignal() 能正确解析 emitSignal() 输出的 JSON
[ ] ≥4 个测试
```

---

## 权威文档引用

- Ch2 §4.3：仪表盘信号机制 — 管道格式定义 `{COLOR}|{component}|{timestamp}|{reason}`
- Ch3 §2.1 数据流图：黄色/红色信号推送到仪表盘
- Ch4 §3.2：锁超时告警推送仪表盘
- Ch5 §2.1：审计矛盾推送仪表盘
- D213 dev doc + control-tower.js（6 组件 signalPath 配置）
