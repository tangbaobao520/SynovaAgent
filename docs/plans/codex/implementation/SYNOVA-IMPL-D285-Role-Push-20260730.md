<!--
  SYNOVA-IMPL-D285: 按角色推送 — proactive-push.ts role filter
  状态: dev doc | 2026-07-30
  权威文档: 开发者任务地图 v2.0 N14 + 预期状态模型 v3.1 §五
  依赖: D272 (去重已实现) D239 (rbac.ts role系统已就位)
  并行: D284 — 零共享文件
-->

# D285: 按角色推送 — proactive-push.ts role filter

## 1. 权威文档引用

**来源**: [开发者任务地图 v2.0](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-开发者任务地图-v2-0-20260730.md) N14

> N14: ProactivePush 去重+按角色推送 — 文件: src/agent/proactive-push.ts (修改)
> 目标状态: 同一告警去重(30分钟内不重复推送)。按角色过滤推送内容(创始人/中层/GA)
> 入边: N4——去重逻辑需要pushChannel非空才能验证

**来源**: 预期状态模型 v3.1 §五

> 按角色推送: ❌ 创始人,中层,GA 看到的是同一份推送

## 2. 代码审计——现状

### 2.1 已完成 (D272)

- `dedupCache` 上限保护 + sweep 清理 ✅
- 5 分钟去重窗口 ✅
- 2 个内置 Channel (signal-file + electron-notify) ✅

### 2.2 角色系统已就位 (D239/D242)

rbac.ts `WorkspaceRole`:
```typescript
'admin'   → 全局读写 + 审计 + 无限时间
'manager' → 本部门读写
'liaison' → 全局只读
'staff'   → 本部门只读
'ga'      → 受约束只读
```

### 2.3 缺失: 角色过滤

`onP0Finding()` 当前对所有人推送相同的消息。`SentinelFinding` 接口不含 `targetRole` 字段。角色过滤需要在推送生成阶段标记，在消费阶段过滤。

### 2.4 角色→严重度映射规则 (本任务定义)

| 角色 | 推送规则 | 说明 |
|------|---------|------|
| **admin (创始人)** | P0 + P1 | 所有 critical + warning 级别 |
| **manager (中层)** | P0 + P1 (本部门) | 仅本部门相关告警 |
| **liaison / staff** | P0 | 仅紧急级别 |
| **ga (顾问)** | P0 + P1 (受约束) | 合同有效期内,受 deptScope 约束 |

## 3. 实现方案

### 3.1 写集 (1 修改 + 1 新建)

```
src/agent/proactive-push.ts — 修改 (+40 行) — PushMessage 增加 targetRoles? 字段
tests/agent/role-push.test.ts  — 新建 — 4 tests (L1)
```

### 3.2 PushMessage 扩展

在 `src/agent/proactive-push.ts` 扩展 `PushMessage` 接口:

```typescript
export interface PushMessage {
  title: string;
  body: string;
  severity: string;
  timestamp: string;
  link?: string;
  /** D285: 目标角色过滤 (undefined=全体) */
  targetRoles?: WorkspaceRole[];
}
```

### 3.3 onP0Finding 角色标注

在 `onP0Finding()` 中根据 severity + dimension 决定 `targetRoles`:

```
severity = 'critical' (P0)
  → targetRoles = ['admin', 'manager', 'liaison', 'staff', 'ga']

severity = 'warning' (P1)
  → targetRoles = ['admin', 'manager', 'ga']

severity = 'info' (P2)
  → targetRoles = ['admin']
```

**部门隔离**: manager 角色只收到本部门告警——此过滤由消费端 (Electron / cockpit) 执行，不在推送生成端处理。

### 3.4 设计决策: 标签非过滤

D285 在推送生成阶段**标记 targetRoles**，不在此处过滤。原因:
1. `SentinelFinding` 不含用户上下文——推送发生在 server 端，没有当前用户的 role/dept 信息
2. 消费端 (Electron main.cjs / cockpit) 有完整的用户登录上下文
3. 标签模式支持多消费端——Electron 桌面通知和 cockpit web 仪表盘都能根据相同标签各自过滤

### 3.5 emitSignal 扩展

signal-file channel 写入的 JSON 增加 `targetRoles` 字段，Electron 轮询时据此过滤。

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | 4 | 1) P0→targetRoles含admin/manager/ga 2) P1→仅admin/manager/ga 3) P2→仅admin 4) targetRoles undefined→全体可见 |

测试文件: `tests/agent/role-push.test.ts`

## 5. 接线要求

| 变更 | 影响 | 确认 |
|------|------|------|
| `PushMessage.targetRoles?` | pushToChannel 签名不变 | tsc 零新增错误 |
| `onP0Finding()` 角色标注 | 已有 dedup 逻辑不破坏 | 回归测试 |
| signal-file JSON 含 targetRoles | Electron main.cjs 需消费 (后续) | Test-Path signal 文件 |

已有接线不破坏: dedup cache / sweep / DND 穿透 — 全部保留。

## 6. 完成标准

1. PushMessage 含 `targetRoles?` 字段
2. onP0Finding 根据 severity 正确标注 targetRoles
3. P0 critical → 5 种角色
4. P1 warning → admin/manager/ga
5. P2 info → admin only
6. targetRoles undefined → 向后兼容 (全体可见)
7. tsc 零新增错误 | vitest 零新增失败

## 7. 自检清单

- [x] 已读预期状态模型 §五 (按角色推送)
- [x] 已读 proactive-push.ts 全量 (D272 去重已实现)
- [x] 已读 rbac.ts WorkspaceRole 定义 (5种角色)
- [x] 已验证 SentinelFinding 无 role 字段 (消费端过滤设计正确)
- [x] 不是凭记忆
- [x] 不用 --no-verify
