<!--
  SYNOVA-IMPL-D284: 跨部门信号 — department-memory-store.ts
  状态: dev doc | 2026-07-30
  权威文档: 开发者任务地图 v2.0 N11 + 预期状态模型 v3.1 §六
  依赖: agent-memory-store.ts (存储层已就位)
  并行: D285 — 零共享文件
-->

# D284: 跨部门信号 — department-memory-store.ts

## 1. 权威文档引用

**来源**: [开发者任务地图 v2.0](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-开发者任务地图-v2-0-20260730.md) N11

> N11: 跨部门信号 — 文件: src/l4/department-memory-store.ts (新建)
> 当前状态: 部门记忆不存在
> 目标状态: AI检测跨部门关键词→匿名摘要→推送到关联部门
> 验收: 销售部记录"客户投诉产品缺陷"→研发部manager收到匿名摘要通知

**来源**: 预期状态模型 v3.1 §六

> 跨部门信号: ❌ 销售部发现客户投诉产品缺陷——研发部完全不知道
> 部门记忆: ❌ 同一个部门的人看不到"我们部门现在在关注什么"

## 2. 代码审计——现状

### 2.1 存储层已就位

`src/l4/agent-memory-store.ts` 已支持部门级存储:
- `remember()` — 存储 facts 含 orgId + tags（部门名通过 tags 传递，如 `tags: ['dept:sales']`）
- `query()` — 按 orgId / type / tags 查询（部门过滤通过 tags 匹配实现）
- Memory 类型: `fact` / `event` / `decision` — `fact` 类型适合作跨部门信号载体

### 2.2 Sentinel 部门数据

`SentinelFinding` 接口 (types.ts L41-45) 不含 `deptId` 字段。但 Sentinel 运行时通过 `SentinelContext` 传递企业上下文。部门信息通过 `MemoryEntry.tags` 传递（如 `tags: ['dept:engineering']`）——上游调用方可注入部门信息。

### 2.3 缺失: 检测引擎

当前没有代码扫描 agent_memory 中的 fact 条目并检测跨部门关联。`department-memory-store.ts` 需填补这个检测层:
- 无关键词匹配逻辑
- 无匿名摘要在生成
- 无推送通知机制

### 2.4 部门名映射

rbac.ts 已定义 5 个角色 (admin/manager/liaison/staff/ga) — 但部门名不在 rbac.ts 中，在企业注册时由管理员自定义 (enterprise.ts 注册表单)。

## 3. 实现方案

### 3.1 写集 (1 新文件)

```
src/l4/department-memory-store.ts — 新建 ~120 行 TypeScript
```

### 3.2 核心功能: 跨部门关键词检测

```
scanCrossDeptSignals(store, enterpriseId, windowDays?)
  → agent_memory 中扫描最近 N 天内的事实条目
  → 检测跨部门关键词 (客户投诉/产品缺陷/流程阻塞/资源冲突)
  → 匹配不同部门的 fact，找潜在关联
  → 生成匿名摘要 (不暴露来源部门名称)
  → 返回 CrossDeptSignal[]
```

**关键词表** (内置,可扩展):
```
客户投诉类: '投诉', '不满', '退款', '差评'
产品缺陷类: 'bug', '缺陷', '故障', '崩溃'
流程阻塞类: '审批慢', '卡住', '等待', '阻塞'
资源冲突类: '预算不足', '人手不够', '资源紧张'
```

**匿名化规则**: 摘要不包含来源部门名，用 "一个部门" / "某团队" 替代

### 3.3 接口设计

```typescript
export interface CrossDeptSignal {
  id: string;
  detectedAt: string;
  enterpriseId: string;
  category: 'customer_complaint' | 'product_defect' | 'process_block' | 'resource_conflict';
  anonymizedSummary: string;          // 匿名摘要
  matchedDeptCount: number;           // 涉及部门数
  confidence: number;                 // 0-1
  sourceMemoryKeys: string[];         // 回溯 agent_memory 条目
}

export function scanCrossDeptSignals(
  store: AgentMemoryStore,
  enterpriseId: string,
  windowDays?: number                  // 默认 30 天
): CrossDeptSignal[]
```

### 3.4 数据流

```
Sentinel → agent_memory (fact, deptId) → agent_memory_store.ts
  → department-memory-store.ts scanCrossDeptSignals()
    → 关键词匹配 + 多部门 crossover
      → CrossDeptSignal[] → emitSignal('cross-dept', status, summary)
        → .codex/signals/cross-dept.json → cockpit 展示
```

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | 3 | 1) 关键词匹配正确 2) 跨部门 crossover 检测 3) 匿名化规则 |
| L2b | vitest 集成 | 1 | agent_memory 写入→scanCrossDeptSignals→返回 CrossDeptSignal |

测试文件: `tests/l4/department-memory.test.ts`

## 5. 接线要求

| 新 export | 调用方 | 确认方式 |
|-----------|--------|---------|
| `scanCrossDeptSignals()` | loop-4 (system self-check) 或独立 cron | grep scanCrossDeptSignals in loop-scheduler.ts |
| `emitSignal('cross-dept', ...)` | .codex/signals/cross-dept.json → cockpit | Test-Path |

## 6. 完成标准

1. department-memory-store.ts 含 scanCrossDeptSignals 函数
2. 4 类关键词检测正确
3. 跨部门 crossover (≥2 部门) 触发信号
4. 匿名摘要不含部门名
5. windowDays 可配置
6. tsc 零新增错误 | vitest 零新增失败

## 7. 自检清单

- [x] 已读预期状态模型 §二 (部门记忆) + §六 (跨部门信号)
- [x] 已读 agent-memory-store.ts (存储层就位)
- [x] 已读 SentinelFinding 接口 (types.ts L41-45)
- [x] 已读 rbac.ts role 系统 (5种角色)
- [x] 不是凭记忆
- [x] 不用 --no-verify
