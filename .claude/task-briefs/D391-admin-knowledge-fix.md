# Task Brief: D391: admin-knowledge.ts:17 L1→L4 跨层修复（派活登记）

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D391) | 认领: 📋 synova-devdoc（spec）/ 实现待定
> 来源: K3 D387 补核 P2-5 派单 + 台账 D309（P0 待做）
> **规格归属：本任务 spec（SYNOVA-IMPL dev doc）由 📋 synova-devdoc 线产出；本 brief 仅作任务板派活登记，不含实现规格。**

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
CI Architecture Check 预存红根因：`src/routes/admin-knowledge.ts:17` 直接 `import { KnowledgeStore } from '../l4/knowledge-store'`——L1(routes) 触 L4，违反铁律 39 五层架构。D309（P0）待做，CI 红 ≥16:03 起无人认领（K3 P2-5：红常态化 = 信号失效 M1 同型）。修复后 CI Architecture 转绿。

### b) 文件审计
- 问题文件: src/routes/admin-knowledge.ts:17（L1→L4 import）
- 归属: src/routes/（按 v4 分工属 Win Claude 线，但 CI 健康为控制塔关注；实现归属待 dev doc 后定）
- 历史: 台账 D309「admin-knowledge.ts L1→L4 修复 | P0 | ❌ 需写 dev doc」

### c) 决策
修复方向（L1→L4 跨层）可选：经 L2 编排桥接 / 挪目录 / 注入依赖——由 dev-doc 线在 spec 中定（契约/测试先行）。参考：第一性原理（铁律 39 边界）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① dev-doc 线出 SYNOVA-IMPL spec → ② 实现（归属待定）→ ③ CI Architecture 转绿验证 → ④ K3 审计。
引用铁律 39（五层边界）、D309、K3 P2-5。

### b) 执行约束
- rule: "修复后 src/routes/ 零 L1→L4 直接 import"
  verify: "grep -r 'from ..*l4' src/routes/ 零结果（除白名单桥接）"
- rule: "CI Architecture Check 转绿"

### c) 决策参考系
参考：第一性原理。收敛。

## Q2: 范围 — 正确的最简方案

做什么（待 dev doc 到位后）：
- src/routes/admin-knowledge.ts（第 17 行 import 修复）
- 对应测试

不做什么：
- 不改 src/l4/knowledge-store.ts（被依赖方不动）
- 不改其他 routes（仅 admin-knowledge.ts 单点）

## Q3: 验收 — 入口 → 交互 → 结果

入口：CI Architecture Check
处理：跨层 import 改走合法路径
结果：CI Architecture 转绿；src/routes/ 无 L1→L4 直接引用

## 架构层: L1 交互（routes）— 修复跨层

#CRITERIA: A

## Done 标准
- [ ] grep "from '../l4" src/routes/admin-knowledge.ts 零结果
- [ ] CI Architecture Check 绿（D391 合并后）
- [ ] dev doc 由 synova-devdoc 线交付（spec 先行）
