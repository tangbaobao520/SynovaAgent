# SynovaAgent — D90 溢出仪表盘+投入建议引擎 实施方案 v1.0

> 2026-07-15 | 第15份权威文档（企业循环溢出导航系统）第二章+第三章
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
- D89: 溢出计算+OverflowGraphBridge ✅ (同步开发中)
- D05: 主动触达引擎 ✅ — 复用推送管道
- 溢出仪表盘: **零存在** — 全部新建
- 投入建议引擎: **零存在** — 全部新建
- 权威文档第二章: 动态仪表盘 — f(loadedCycles, computeOutputs, dataMaturity)
- 权威文档第三章: 承诺清单 — 传导方向模拟（非精确预测）

---

## 做了什么

### 1. src/cycles/overflow-dashboard.ts — 溢出仪表盘（新建）

**generateOverflowDashboard(enterpriseId, cycleRegistry, graphBridge): OverflowDashboard**
动态生成基于循环配置的仪表盘视图:
- 每个注册子循环自动生成一行
- 热力图: 子循环×时间轴矩阵(月度粒度)
- 数据成熟度三级标注(学习期/活跃期/成熟期)
- 传导时间线: 跨循环传递延迟显式标注

### 2. src/cycles/investment-advisor.ts — 投入建议引擎（新建）

**simulateInvestment(cycleId, amount, direction, graphBridge): InvestmentSimulationResult**
- 传导方向模拟（非精确预测）
- 承诺清单显式标注"能做什么/不能做什么"
- 执行约束因子检测(人才市场供给/团队容量)
- 相对效果排序: N个子循环投入边际溢出排序

### 3. src/routes/overflow.ts — 溢出API端点（新建）

```
GET  /api/overflow/dashboard/:enterpriseId     — 溢出仪表盘
POST /api/overflow/simulate                     — 投入建议模拟
GET  /api/overflow/snapshots/:cycleId            — 子循环历史快照
```

---

## 不做什么

- 不实现前端UI渲染（只做后端API+数据聚合）
- 不实现精确财务预测（承诺清单明确禁止）
- 不修改D05主动触达引擎（只复用其推送管道）

---

## 架构层

L3（洞察层: `overflow-dashboard.ts` + `investment-advisor.ts`）+ L1（交互层: `routes/overflow.ts`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | overflow-dashboard.ts | 2h | 动态仪表盘生成 |
| 2 | investment-advisor.ts | 1.5h | 投入建议+承诺清单 |
| 3 | routes/overflow.ts | 0.5h | 3个API端点 |
| 4 | server.ts挂载 | 0.5h | overflow路由 |
| 5 | 测试文件 | 1.5h | tests/cycles/overflow-dashboard.test.ts |

**总工时: 6h（约1天）**

---

## 完成标准

```
[ ] generateOverflowDashboard: 动态生成，子循环增减→仪表盘自适应
[ ] 热力图: 子循环×时间轴矩阵(月度粒度，最多12列)
[ ] 数据成熟度标注: 学习期/活跃期/成熟期 三级+显示粒度区分
[ ] 传导时间线: 每个传导步骤标注estimatedLag
[ ] simulateInvestment: 传导方向模拟（非精确预测）
[ ] 承诺清单: 每次输出含"能做什么/不能做什么"
[ ] 执行约束因子检测: 人才市场/团队容量/资金可用性
[ ] routes/overflow.ts: 3个API端点
[ ] server.ts: 挂载overflow路由
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=10测试: dashboard 5(全量/空循环/单循环/学习期标注/降级) + advisor 5(正常模拟/方向错误/约束未满足/承诺清单/排序)
```

---

## 权威文档引用

- 第15份权威文档: 企业循环溢出导航系统
  - 第二章: 溢出仪表盘动态生成 — f(loadedCycles, computeOutputs, dataMaturity)
  - 第三章: 投入建议引擎 — 承诺清单 + 传导方向模拟
  - 第三章 §5: 执行约束因子 — talent_market/team_capacity/funding_availability
  - 第六章 §6.3: 复用D05主动触达引擎推送管道