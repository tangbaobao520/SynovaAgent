# SynovaAgent — D82 7条缺失compute 实施方案 v1.0

> 2026-07-14 | 第1份权威文档（本体层因果体系）第六章 §6.7.3
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

## 当前状态（2026-07-14 审计确认）

- 现有 compute: 61个（42边中35条有独立compute，I2-3b/3c/3d已交付）
- 权威文档01 §6.7.3: 7条边尚无独立compute函数 — E-11/E-12/E-21/E-22/E-40/E-41/E-42
- 7条边全部在42边体系中定义了transfer_function参数——数据源已备，缺的是独立的compute封装
- 现有compute模板: `extensions/sentinels/shared/computes/` 下已有I2-3b/3c/3d的42个compute

**7条缺失边的compute需求（按优先级）:**

| 边ID | 边名称 | 硬度 | 优先级 | 核心参数 | 缺失影响 |
|------|--------|------|--------|---------|---------|
| E-12 | EFFICIENCY_FINANCING | soft | P2 | efficiency_signal, financing_efficiency, investment_signal | growth-quality哨兵无独立compute |
| E-40 | REPUTATION_FLYWHEEL | soft | P2 | flywheel_momentum, brand_search_volume | reputation-score哨兵无独立compute |
| E-11 | REPUTATION_ATTRACTION | soft | P3 | brand_awareness, referral_rate | reputation-score哨兵无独立compute |
| E-21 | ORG_TRUST | soft | P3 | trust_index, collaboration_score | 组织域哨兵无独立compute |
| E-22 | ROUTINE_RIGIDITY | soft | P3 | routine_age, process_efficiency | 转化域哨兵无独立compute |
| E-41 | TALENT_PROTECTION | soft | P3 | knowledge_retention, backup_ratio | key-person-risk哨兵无独立compute |
| E-42 | ASSUMPTION_LINKAGE | soft | P3 | assumption_validity, reallocation_trigger | growth-quality哨兵无独立compute |

---

## 做了什么

### 1. 7个新compute函数（新建）

按现有I2-3模板创建，每个compute含:
```typescript
/**
 * @contract COMPUTE-{NAME}-v1 {InputInterface} {OutputInterface} {DegradedStrategy}
 */
export function compute{Name}(input: {Name}Input): {Name}Output {
  // 正常路径
  // 降级路径: 参数不足 → degraded:true + default值
}
```

7个compute文件:
1. `extensions/sentinels/shared/computes/compute-efficiency-financing.ts` — E-12
2. `extensions/sentinels/shared/computes/compute-reputation-flywheel.ts` — E-40
3. `extensions/sentinels/shared/computes/compute-reputation-attraction.ts` — E-11
4. `extensions/sentinels/shared/computes/compute-org-trust.ts` — E-21
5. `extensions/sentinels/shared/computes/compute-routine-rigidity.ts` — E-22
6. `extensions/sentinels/shared/computes/compute-talent-protection.ts` — E-41
7. `extensions/sentinels/shared/computes/compute-assumption-linkage.ts` — E-42

**关键约束**: 与I2-3系列同目录（`extensions/sentinels/shared/computes/`），同格式（契约ID+JSDoc+纯函数+降级路径）。

### 2. 7个测试文件（新建）

每个测试文件≥3 it():
- 正常路径: 有效参数→预期输出
- 降级路径: 部分参数缺失→degraded:true
- 边界条件: 极端值/0值/null输入

### 3. E-12和E-40优先

在7个中优先实现E-12和E-40（P2优先级——被P0哨兵引用）。其余5条P3，可并行实现。

---

## 不做什么

- 不修改42边transfer_function定义（只封装compute调用）
- 不修改哨兵manifest.json（compute契约ID引用不变）
- 不修改I2-3现有compute函数

---

## 架构层

L3（洞察层: compute函数）+ L4（本体层: compute消费42边transfer_function输出）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | E-12 + E-40 compute (P2优先) | 1h | 2个compute + 2个test |
| 2 | E-11/E-21/E-22/E-41/E-42 (P3) | 2h | 5个compute + 5个test |

**总工时: 3h（半天）**

---

## 完成标准

```
[ ] 7个compute全部创建: @contract JSDoc + 契约ID COMPUTE-{NAME}-v1
[ ] 7个compute全部含正常路径+降级路径+边界条件
[ ] 7个compute全部含 ≥3 it() 测试（正常/降级/边界）
[ ] E-12 compute被至少1个哨兵compute字段引用（growth-quality）
[ ] E-40 compute被至少1个哨兵compute字段引用（reputation-score）
[ ] 与I2-3系列compute同目录、同格式
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=21测试: 7 compute × 3 it()
```

---

## 权威文档引用

- 第1份权威文档: 本体层因果体系权威规范 第六章（与现有体系对齐）
  - §6.7.3: compute规范文档 — 7条边尚无独立compute函数
  - §3: 42条边transfer_function参数定义（每个compute消费的参数来源）