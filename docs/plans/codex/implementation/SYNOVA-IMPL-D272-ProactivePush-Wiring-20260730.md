<!--
  SYNOVA-IMPL-D272: ProactivePush Channel Wiring — 空channels→实际通道
  状态: dev doc | 2026-07-30
  权威文档: 权威05 M1 + Expected State Model v3.1 G4/G5/G6
  依赖: proactive-push.ts (完整) synova-agent.ts:90 (空实例化)
  并行: D271, D273 — 零共享文件
-->

# D272: ProactivePush Channel Wiring — 打通主动推送链路

> Fix the empty channels array. Wire ProactivePush to actual notification outputs.

---

## 1. 权威文档引用

**来源**: [预期状态模型 v3.1](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-预期状态模型-v3-1-20260729.md)

> 五、系统会主动找你吗？
> 主动推送告警: ⚠️ ProactivePush([]) 通道仍为空——但可通过 emitSignal→cockpit→Electron 绕道推送
> 推送去重: ❌ 同一个告警会被多次推送
> 按角色推送: ❌ 创始人,中层,GA 看到的是同一份推送

**来源**: [权威05 Module 1](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档05-Agent主动交互系统蓝图-20260710)

> Module 1: 主动触达引擎 — 系统不等待用户来问,主动推送。按角色分类(创始人/中层/GA)。去重+免打扰。

## 2. 代码审计——现状

### 2.1 推送引擎已完整实现

文件: `src/agent/proactive-push.ts` (约 250 行)

**已实现的功能**:
- ✅ `ProactivePush` 类: channels 数组 + `pushToChannel()` 方法 (L100-L250)
- ✅ `PushChannel` 接口: id/name/enabled (L83-L94)
- ✅ P0 信号→Action 转化: `onP0Finding()` 方法 (L148-L178)
- ✅ DND 免打扰: `proactive-push.ts:159-168` — onP0Finding() 内嵌 shouldPush() 窗口检测 + critical 级别穿透
- ✅ Electron 通知: `electron-main.ts` 有 Notification API

**未接线的问题**:
- ❌ **实例化传了空数组**: `src/agent/synova-agent.ts:90` — `new ProactivePush([])`
- ❌ 无内置 Channel 定义: 没有预定义的 Electron 通知通道或信号文件通道
- ❌ 去重未实现: `pushToChannel()` 被调用后不检查是否重复推送
- ❌ 角色分类未实现: 推送不区分 founder/manager/GA

### 2.2 根因

```typescript
// src/agent/synova-agent.ts:90 — 当前
const proactivePush = new ProactivePush([]);  // 空通道 — 推送后续接线
```

`this.channels = channels.filter(c => c.enabled)` → 空数组过滤后仍为空 → `pushAll()` 中 `for (const channel of this.channels)` → 循环零次 → 永不推送。

## 3. 实现方案

### 3.1 写集

```
src/agent/synova-agent.ts — 修改 (+15行) — 替换空数组为内置 Channel 列表
```

**无需新建文件**。仅需修改一个构造函数调用参数。

### 3.2 新增内置 Channel 定义 (2个通道)

在 `synova-agent.ts` 中定义两个 PushChannel:

| Channel ID | 类型 | 触发方式 | 说明 |
|------------|------|---------|------|
| `signal-file` | FileChannel | 写 `.codex/signals/proactive-push.json` | 新 P0 finding → 信号 JSON → cockpit/Electron 轮询 |
| `electron-notify` | ElectronChannel | `new Notification()` | critical 级别 → 系统托盘通知 |

**Channel 实现要点**:
- `signal-file`: 调用 `emitSignal('proactive-push', 'red', message)` — 复用已存在的 emit-signal.py 路径
- `electron-notify`: 复用 `electron-main.ts` 已有 Notification API — 仅 main process 可触发，agent 主进程通过信号文件间接触发

> **注意**: `electron-notify` 通道是 Electron main process 独占的——只能通过信号文件+轮询机制间接触发。Agent 主进程直接注入 Notification 不可行（渲染进程隔离）。D272 负责定义 Channel 并注册，Electron 端的消费已在 D233/D255 中实现。

### 3.3 构造函数调用变更

```typescript
// 修改前
const proactivePush = new ProactivePush([]);

// 修改后
const proactivePush = new ProactivePush([
  { id: 'signal-file', name: 'Signal File', enabled: true, 
    push: async (finding, message) => { /* emitSignal wrapper */ } },
  { id: 'electron-notify', name: 'Electron Notification', enabled: true,
    push: async (finding, message) => { /* signal file → Electron轮询 */ } },
]);
```

### 3.4 相关思考

| 维度 | 本期 | 后续 |
|------|:---:|------|
| 通道 | 2 个内置通道 | 可扩展 Email/飞书/钉钉 |
| 去重 | 本次加 `dedupKey` 参数到 pushToChannel，同 key 5分钟内不重复 | 完善去重缓存 |
| 角色分类 | 本次不加——channels 本身可配置角色过滤，但 synova-agent.ts 尚未拉取用户角色上下文 | D272 后续 |

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | 2 | 1) ProactivePush 非空 channels → pushAll 遍历 2) DND 静默窗口 → 不推送 |
| L2b | vitest 集成 | 1 | synova-agent 初始化后 proactivePush.channels.length > 0 |

测试文件: `tests/agent/proactive-push-wiring.test.ts`

## 5. 接线要求

| 新export | 调用方 | 确认方式 |
|----------|--------|---------|
| 内置 Channel 对象 | `synova-agent.ts` 自身的ProactivePush实例 | channels.length > 0 |
| emitSignal 写入 | `.codex/signals/proactive-push.json` → Electron轮询 | Test-Path 文件存在 |
| Electron消费 | `electron-main.ts` 已有 checkP0Alerts() 轮询逻辑 (D249) | 信号文件存在→Electron读取 |

## 6. 完成标准

| # | 标准 | 验证 |
|---|------|------|
| 1 | synova-agent.ts 中 proactivePush.channels.length >= 2 | grep + 运行 |
| 2 | P0 finding 触发后 `.codex/signals/proactive-push.json` 生成 | Test-Path |
| 3 | DND 窗口内 critical finding 仍穿透 | 单元测试验证 |
| 4 | 现有哨兵 P0 信号不丢失（emitSignal 路径保留） | 集成测试 |
| 5 | tsc --noEmit 零新增错误 | CI |
| 6 | vitest 零新增失败 | CI |

## 7. 自检清单（铁律 0-5）

- [x] 已读权威文档原文（预期状态模型 §五 40+ 行 + proactive-push.ts 250行全量）
- [x] 已引用测试权威规范（L1 单元 + L2b 集成）
- [x] 已写接线要求（emitSignal → signal file → Electron 轮询）
- [x] 已验证 synova-agent.ts:90 构造函数调用存在
- [x] 已验证 pushToChannel() 方法签名 (L210)
- [x] 不是凭记忆
- [x] 不用 --no-verify
