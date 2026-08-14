# SynovaAgent — D77 增长导航系统集成 实施方案 v1.0

> 2026-07-15 | 第13份权威文档（增长导航系统工程规范）第五章 §1-§10 + 第九章代码改动清单
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（铁律 48）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-15 审计确认）

- D71-D76: 增长导航6个核心模块全部完成
- 权威文档 §9.1 7项修改清单进度:
  - #1 types.ts ActionRecommendation — **零存在**，待D77
  - #2 sentinel-service.ts workspace — D74已覆盖(routes/workspace-data.ts)，跳过
  - #3 sentinel/types.ts growth+computeKind — **已存在**(D73)
  - #4 sentinel-runner.ts Goal命名空间 — **已存在**(D73 goal-{goalId}-)
  - #5 policy-engine.ts GOAL SOI — **零存在**，待D77
  - #6 routes/sentinel.ts workspace — D74已覆盖，跳过
  - #7 expert-prompts.ts lightweight template — D75已做，跳过
- D77真实工作量: **2项修改 (#1+#5) + 1个集成测试**

---

## 做了什么

### 1. packages/engine-core/src/pipeline/diagnosis/types.ts — ActionRecommendation接口（修改）

新增结构化接口，替换当前 `string[]`:
```typescript
export interface ActionRecommendation {
  description: string;
  priority: 'highest' | 'high' | 'medium' | 'low';
  estimatedCost?: { timeline: string; budget?: string };
  riskLevel: 'high' | 'medium' | 'low';
  expectedImpact: string;
  responsibleDepartment?: string;
}
```
在 `StandardExpertReport` 中新增 `actionRecommendations: ActionRecommendation[]`。

### 2. src/security/policy-engine.ts — Goal操作SOI + 策略规则（修改）

新增SOI常量:
```typescript
GOAL_ADJUST: 'goal.adjust',
GOAL_ABANDON: 'goal.abandon',
```

新增策略规则:
- middle_manager 可读取本部门Goal (SOI GOAL_READ + dataLevel S2)
- GA 可废弃Goal (SOI GOAL_ABANDON + dataLevel S3)
- middle_manager 可调整本部门Goal目标值 (SOI GOAL_ADJUST + dataLevel S2)

### 3. 集成测试 — D71-D76全链路e2e

```typescript
tests/growth/e2e-navigation-loop.integration.test.ts
// 端到端: 诊断→Proposal→Goal→方案哨兵→偏离→轻量级再诊断→知识回流
```

### 4. 旧代码标记@deprecated（双轨清理）

D74审计发现的双轨代码:
- `src/agent/workspace-service.ts` — 文件头部追加 `@deprecated — D74工作台数据聚合已替代。D77/D77b时移除。`
- `src/routes/department-workspace.ts` — 同上
- `src/agent/workspace-context-bridge.ts` — 同上

不删除——只标记@deprecated。删除由D77b处理。

---

## 不做什么

- 不修改 sentinel-service.ts（D74已覆盖）
- 不修改 sentinel/types.ts（D73已存在）
- 不修改 sentinel-runner.ts（D73已存在）
- 不修改 routes/sentinel.ts（D74已覆盖）
- 不修改 expert-prompts.ts（D75已做）
- 不重写D71-D76已有模块

---

## 架构层

L2（编排层: PolicyEngine增强 + types.ts补全）+ L1（集成测试e2e）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | types.ts ActionRecommendation | 1h | packages/engine-core/src/pipeline/diagnosis/types.ts |
| 2 | policy-engine.ts SOI+规则 | 1h | src/security/policy-engine.ts |
| 3 | 旧代码@deprecated标记 | 0.5h | 3个文件 |
| 4 | e2e集成测试 | 2h | tests/growth/e2e-navigation-loop.integration.test.ts |

**总工时: 4.5h（半天）**

---

## 完成标准

```
[ ] types.ts: ActionRecommendation 6字段接口 + StandardExpertReport.actionRecommendations
[ ] policy-engine.ts: GOAL_ADJUST + GOAL_ABANDON SOI常量
[ ] policy-engine.ts: 新增Goal操作策略规则(≥3条)
[ ] 旧workspace 3文件标记@deprecated
[ ] e2e-navigation-loop: 完整端到端测试(诊断→Proposal→Goal→偏离→再诊断→知识回流)
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=5测试: e2e 3(完整链路/无数据降级/单阶段失败) + policy 2(GA允许/中层拒绝)
```

---

## 权威文档引用

- 第13份权威文档: 增长导航系统工程规范
  - 第五章 §1: 导航循环在主Agent中的5循环架构位置
  - 第五章 §8: PolicyEngine集成 — Goal操作权限矩阵
  - 第九章 §9.1: 代码改动清单7项修改
  - 第九章 §10.1: 新增L1 API路由