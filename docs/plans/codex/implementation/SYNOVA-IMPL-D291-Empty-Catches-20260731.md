<!--
  SYNOVA-IMPL-D291: Fix 23 Empty Catches
  状态: dev doc | 2026-07-31
  权威文档: AGENTS.md §铁律24+31 + audit session findings §VIII Task 1
  依赖: D290 (audit-check.py修复) — 已完成
  并行: D292, D286 — 零共享文件
-->

# D291: Fix 23 Empty Catches — 添加 log.warn/log.error

## 1. 权威文档引用

**来源**: [AGENTS.md §铁律24](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律 24. 异常处理审计——写 catch 时必须确认:
> - 有 log.error/warn（不能空吞）
> - 返回 degraded: true（后端）或显示错误 UI（前端）

**来源**: [audit session §VIII Task 1](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD.md)

> Task 1: 23个空catch完全吞异常 🔴。每个catch块必须添加 log.warn 或 log.error。
> 优先: conversation-engine.ts L234/L477/L715、diagnosis.ts L251、expert-dispatcher.ts L515 — 诊断热路径

## 2. 代码审计——现状

### 2.1 audit-check.py [3] ERRORS 实测

| 文件 | 空 catch |
|------|:---:|
| [src/agent/proactive-push.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\proactive-push.ts) L285 | 1 |
| [src/agent/conversation-engine.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\conversation-engine.ts) L477/L579 | 2 |

workbuddy 审计报告 16 文件 23 处——当前 audit-check.py 增量模式只扫描传入文件。全量 `--full` 模式确认全部 23 处存在。

### 2.2 严重度分级

| 优先级 | 文件 | 原因 |
|:---:|------|------|
| 🔴 | [conversation-engine.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\conversation-engine.ts) L234/L477/L715 | 对话引擎——每用户调用 |
| 🔴 | [routes/diagnosis.ts](D:\novis-backup-20260526\Novis\synova-agent\src\routes\diagnosis.ts) L251 | 诊断 API 入口 |
| 🔴 | [l3/expert-dispatcher.ts](D:\novis-backup-20260526\Novis\synova-agent\src\l3\expert-dispatcher.ts) L515 | 专家调度——每次诊断触发 |
| 🟡 | 其余 13 文件 | 哨兵适配器、服务层、CLI 命令——非热路径 |

## 3. 实现方案

### 3.1 写集 (16 文件修改)

每处空 catch 追加 `log.warn({ err }, 'context description')` + `degraded: true` 返回（如适用）。

### 3.2 修复模式

```typescript
// 修复前
} catch (e) {
  // empty
}

// 修复后
} catch (e) {
  log.warn({ err: e instanceof Error ? e.message : String(e) }, 'operation failed — degraded');
  return { degraded: true };  // 如适用
}
```

### 3.3 全量文件清单 (workbuddy)

| 文件 | 行号 |
|------|:---:|
| [agent/atomic-write.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\atomic-write.ts) | L145, L160, L163 |
| [agent/conversation-engine.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\conversation-engine.ts) | L234, L477, L579, L715 |
| [agent/diagnosis-launcher.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\diagnosis-launcher.ts) | L259 |
| [cli/commands/config-cmd.ts](D:\novis-backup-20260526\Novis\synova-agent\src\cli\commands\config-cmd.ts) | L120 |
| [l1-interaction/web-adapter.ts](D:\novis-backup-20260526\Novis\synova-agent\src\l1-interaction\web-adapter.ts) | L67 |
| [l3/expert-dispatcher.ts](D:\novis-backup-20260526\Novis\synova-agent\src\l3\expert-dispatcher.ts) | L515 |
| [l3/synova-diagnosis-engine-impl.ts](D:\novis-backup-20260526\Novis\synova-agent\src\l3\synova-diagnosis-engine-impl.ts) | L176 |
| [loops/middle-evolution-engine.ts](D:\novis-backup-20260526\Novis\synova-agent\src\loops\middle-evolution-engine.ts) | L396 |
| [routes/actions-api.ts](D:\novis-backup-20260526\Novis\synova-agent\src\routes\actions-api.ts) | L41, L67, L70 |
| [routes/chat.ts](D:\novis-backup-20260526\Novis\synova-agent\src\routes\chat.ts) | L479 |
| [routes/diagnosis.ts](D:\novis-backup-20260526\Novis\synova-agent\src\routes\diagnosis.ts) | L251 |
| [sentinel/sentinel-loader.ts](D:\novis-backup-20260526\Novis\synova-agent\src\sentinel\sentinel-loader.ts) | L162 |
| [sentinel/adapters/goal-alignment-sentinel.ts](D:\novis-backup-20260526\Novis\synova-agent\src\sentinel\adapters\goal-alignment-sentinel.ts) | L39 |
| [services/config-recovery.ts](D:\novis-backup-20260526\Novis\synova-agent\src\services\config-recovery.ts) | L93 |
| [services/role-template-store.ts](D:\novis-backup-20260526\Novis\synova-agent\src\services\role-template-store.ts) | L20 |
| [services/solution-generator.ts](D:\novis-backup-20260526\Novis\synova-agent\src\services\solution-generator.ts) | L103, L105 |

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | 回归 | 1 | audit-check.py [3] ERRORS 全量扫描 → 期望 0 empty catches |

无新增测试文件——存量代码修改，audit-check.py 回归验证即可。

## 5. 接线要求

纯 catch 块补 log——不改变 export 列表。tsc 零新增错误。

## 6. 完成标准

1. 全部 23 处空 catch 有 log.warn/log.error
2. `python scripts/audit/audit-check.py --full` → [3] ERRORS: 0
3. tsc --noEmit 零新增错误 | vitest 零新增失败

## 7. 自检清单

- [x] audit-check.py [3] 实测确认 proactive-push.ts L285 + conversation-engine.ts L477/L579
- [x] workbuddy 审计报告 16 文件/23 行号已列表
- [x] 不是凭记忆——每处都 grep 确认过
- [x] 不用 --no-verify
