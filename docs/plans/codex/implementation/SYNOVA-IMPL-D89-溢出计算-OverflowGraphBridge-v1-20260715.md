# SynovaAgent — D89 子循环溢出计算+OverflowGraphBridge 实施方案 v1.0

> 2026-07-15 | 第15份权威文档（企业循环溢出导航系统）第一章+第六章
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

- D88: CycleLoader ✅ (同步开发中)
- D79: ContextLoader ✅ — 企业参数合并器
- GraphStore: `createNode/updateNode/getNode` 接口可用
- 溢出计算代码: **零存在** — 全部新建
- OverflowGraphBridge: **零存在** — 全部新建
- 权威文档§6.6: OverflowGraphBridge完整接口 — getOverflowHeatmap/getCycleSnapshots/getLatestSnapshot/writeOverflowSnapshot

---

## 做了什么

### 1. src/cycles/overflow-compute.ts — 溢出计算引擎（新建）

**computeOverflow(cycle: CycleConfig, enterpriseId: string): OverflowSnapshot**
解析overflowFormula → 逐参数查sourceId → 按YoY/MoM/trendDirection计算同比环比趋势:
```typescript
interface OverflowSnapshot {
  cycleId: string; month: string; overflowValue: number; unit: string; trend: string; trendDelta: number;
  maturity: 'learning' | 'active' | 'mature'; isIndustryBaseline: boolean;
  momChange: number; momChangePercent: number;      // 环比
  yoyChange: number | null; yoyChangePercent: number | null;  // 同比(null=数据不足12月)
  trendDirection: 'rising' | 'stable' | 'declining'; consecutiveDirection: number;
  degraded: boolean;
}
```

### 2. src/cycles/overflow-graph-bridge.ts — OverflowGraphBridge（新建）

消费GraphStore.writeOverflowSnapshot — 将计算结果写入Enterprise节点:
```typescript
getOverflowHeatmap(enterpriseId, opts?): OverflowHeatmap
getCycleSnapshots(enterpriseId, cycleId, opts?): OverflowSnapshot[]
getLatestSnapshot(enterpriseId, cycleId): OverflowSnapshot | null
writeOverflowSnapshot(enterpriseId, cycleId, snapshot): void
```

---

## 不做什么

- 不修改 GraphStore 核心（只通过接口消费）
- 不实现溢出仪表盘UI（D90）

---

## 架构层

L4（本体层: `src/cycles/overflow-compute.ts` + `overflow-graph-bridge.ts`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | overflow-compute.ts | 2h | overflowFormula解析+数据源追踪 |
| 2 | overflow-graph-bridge.ts | 1h | GraphStore读写 |
| 3 | 测试文件 | 1.5h | tests/cycles/overflow-compute.test.ts |

**总工时: 4.5h（半天）**

---

## 完成标准

```
[ ] computeOverflow: overflowFormula解析+参数sourceId追踪
[ ] OverflowSnapshot: 含YoY/MoM/trendDirection/consecutiveDirection
[ ] 同比计算: 数据不足12个月→yoyChange=null+标注
[ ] 环比计算: 本期-上期/|上期|
[ ] OverflowGraphBridge: 4个读写方法
[ ] GraphStore写入降级→log.warn+不阻断
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=8测试: compute 5(正常/数据不足/全部缺失/公式异常/趋势) + bridge 3(写入/查询/空)
```

---

## 权威文档引用

- 第15份权威文档: 企业循环溢出导航系统
  - 第一章 §2.3: 溢出公式参数溯源(sourceId) + 数据成熟度
  - 第二章 §2.7: 同比环比趋势计算规范
  - 第六章 §6.6: OverflowGraphBridge接口定义(4方法)
  - 第六章 §2.2: 溯源验证 — validateOverflowSourceReferences