# SYNOVA-DESIGN L4 数据契约收敛方案 v1.0（D338）

> 设计：DeepSeek Harness（synova-mac）| 2026-08-14 | 状态：待创始人审
> 依据：K3 全链路审计 20260813（0/3 循环贯通）+ 本机代码核实（2026-08-14）
> 决策参考：第一性原理（数据流最短路径）+ Anthropic 工程基线（契约优先/最小干预）+ DeepSeek 开源实证（兼容层迁移模式）
> 定位：架构方案（dev doc）。实现交 Claude Code（Win），按任务分解逐个 PR。

---

## 一、问题陈述（已物理核实的断裂事实）

K3 审计结论：客户/资本/人才三循环端到端贯通率 **0/3**。本机核实断裂点：

### 1.1 类型体系四口径并存（根因一）

| 口径 | 定义处 | 使用者 | 计数 |
|------|--------|--------|------|
| 新体系 `resource/client` 等 | `packages/ontology/src/node-types.ts`（45 类型） | csv-import、graph-bridge、decision-capture、data-exporter、expert-tools | 写作方 |
| 旧体系 PascalCase（Financial/Client/Person…） | `packages/sog-core/` | **全部哨兵/compute**（`queryNodes('Financial')` 等） | 100+ 处 |
| 大写变体（FINANCIAL/GOAL/PROPOSAL） | 零散裸 SQL | cash-flow-sentinel、org-adapter | 5 处 |
| 权威文档 01 口径 | docs（17 节点 + 16 边） | 文档层 | — |

查询机制：`sqlite-graph-store.ts:194` `WHERE type = ?` **SQL 精确匹配，零别名零容错**。

### 1.2 field-mappings 类型错位（根因二）

| 映射文件 | targetNodeType（写入） | 哨兵查询（读取） | 判定 |
|---------|----------------------|----------------|------|
| crm-standard.json | `Market` | `Client` | **断** |
| hr-standard.json | `People` | `Person` | **断** |
| erp-standard.json | `Financial` | `Financial` | 类型通、属性断 |

### 1.3 属性名断裂（根因三）

erp-standard 写 `cash`/`operating_expense`（snake_case）；compute 读 `cashBalance`/`operatingExpenses`（camelCase）。json_extract 精确匹配 → 恒不命中。

### 1.4 结论

**断裂不在计算层（L3 真），在契约层（L4 类型/属性名）。** 修复 L4 契约，三循环即可贯通——无需动任何 compute 算法。

---

## 二、目标态设计

### 2.1 单一权威：新体系 45 类型

`packages/ontology` 的 45 类型（`resource/` `outcome/` `activity/`）是正式设计方向。旧 PascalCase 是 Novis 遗产。**收敛方向 = 全部消费者迁到新体系**，不做反向妥协。

### 2.2 核心机制：GraphStore 契约网关（归一化层）

在 `src/adapters/sqlite-graph-store.ts` 加一层**类型与属性归一化**，由文件驱动映射表控制：

```
新文件: extensions/ontology/type-alias-map.json
{
  "aliases": {
    "Client": "resource/client",
    "Person": "resource/person",
    "Financial": "outcome/financial",
    "Market": "outcome/market",
    "People": "resource/person",
    "FINANCIAL": "outcome/financial",
    "GOAL": "outcome/operational",
    ...
  },
  "propAliases": {
    "cash": "cashBalance",
    "operating_expense": "operatingExpenses",
    ...
  }
}
```

行为：
- **写入归一化**（createNode）：类型命中 aliases → 存规范名；props 命中 propAliases → 写规范键（原键保留一份兼容读）
- **查询归一化**（queryNodes）：类型命中 aliases → **双向查询**（规范名 + 别名，结果去重合并）；filters 的键命中 propAliases → 同时匹配原键
- **未命中**：原样透传（零行为变化，存量 44 哨兵安全）

### 2.3 为什么是网关而不是直接改消费者

| 方案 | 工作量 | 风险 | 贯通速度 |
|------|--------|------|---------|
| 直接迁移 100+ 消费者到新名 | 巨大（44 哨兵 × N compute + 映射 + 测试） | 高（每个改动都可能引入回归） | 慢 |
| **契约网关（本方案）** | 中（1 个核心文件 + 1 个映射文件 + 测试） | 低（未命中零行为变化） | **立即（3 循环当天贯通）** |

网关是"兼容层迁移"模式：短期让数据流起来（业务价值），中长期消费者按自己的节奏迁到新名（网关别名最终删除）。映射表文件驱动，符合"加文件不改代码"的项目哲学。

---

## 三、迁移三阶段

### 阶段 1：契约网关（P0，立即贯通）

- [ ] `extensions/ontology/type-alias-map.json` 新建（初始映射：K3 审计矩阵的 14 个断裂类型 + erp/crm/hr 属性断裂清单）
- [ ] `sqlite-graph-store.ts` 加归一化（写入 + 查询双向）
- [ ] field-mappings 三个文件 targetNodeType 改规范名（Market→outcome/market 等——网关会兜底，但源头就写对）
- [ ] 测试：K3 的 T2/T3 活运行实验复现（空库 + 注入数据）→ 三循环贯通
- [ ] 验收：`data/synova.db` 注入合成 CRM/ERP/HR 数据 → customer-demand-shift / cash-runway / talent-density 三个哨兵产出真实 findings

### 阶段 2：消费者迁移（P1，逐步收敛）

- [ ] 哨兵 compute 的 `queryNodes('Client')` → `queryNodes('resource/client')`（44 哨兵分批，每批一个 PR）
- [ ] 迁移时移除该类型的 aliases 条目（映射表收缩 = 迁移进度可视化）
- [ ] 大写变体清零（FINANCIAL/GOAL/PROPOSAL → 新名，cash-flow-sentinel 裸 SQL 改走 GraphStore）
- [ ] 属性名：compute 读规范键；erp-standard 写规范键（网关别名逐步退役）

### 阶段 3：旧体系退役（P2，文档与代码同步）

- [ ] sog-core 旧枚举删除或标 @deprecated（grep 零引用证明）
- [ ] 权威文档口径统一：45 类型为唯一权威；17/22 节点口径标注"历史演进"
- [ ] AGENTS.md/CLAUDE.md 哨兵口径（20 vs 45）统一
- [ ] 网关 aliases 清空 → 归一化层退化为纯透传（或保留文件驱动空表）

---

## 四、任务分解（给 Claude Code 的实现清单）

| # | 任务 | 依赖 | 预估 |
|---|------|------|------|
| T1 | type-alias-map.json 初始版（类型 14 项 + 属性断裂清单）+ manifest 校验器扩展 | — | 小 |
| T2 | sqlite-graph-store 归一化层（写入/查询）+ 单元测试（命中/未命中/去重/属性兼容） | T1 | 中 |
| T3 | field-mappings 三个文件规范名修正 | T1 | 小 |
| T4 | K3 T2/T3 活运行实验脚本化（`tests/l4/contract-gateway.e2e.test.ts`）→ 三循环贯通验收 | T2 | 中 |
| T5 | 哨兵消费者迁移批次 1（客户循环 9 处 Client→resource/client） | T4 | 小 |
| T6 | 哨兵消费者迁移批次 2（资本循环 16 处 Financial + 属性名） | T4 | 小 |
| T7 | 哨兵消费者迁移批次 3（人才循环 11 处 Person + 其余） | T4 | 小 |
| T8 | 大写变体清零（cash-flow-sentinel 裸 SQL → GraphStore） | T2 | 中 |
| T9 | 文档口径统一（AGENTS/CLAUDE/权威文档）+ sog-core @deprecated | T7 | 小 |

建议顺序：T1→T2→T3→T4（阶段 1 闭环，验收贯通）→ 阶段 2 按批次（每个批次独立 PR + K3 抽查）。

---

## 五、验收标准（对 K3 审计逐条回应）

- [ ] 三循环贯通：T4 实验脚本证明 0/3 → **3/3**
- [ ] P0 哨兵告警路径：cash-runway 注入数据后产出真实 critical（非死代码、非误报）
- [ ] 降级诚实性：无数据时返回 degraded/info（不静默 0 findings）
- [ ] 存量 44 哨兵零回归：全量 vitest 通过（基线 283 存量失败外零新增）
- [ ] 映射表收缩可视化：阶段 2 每批迁移后 aliases 条目减少，最终清零

## 六、风险与待创始人裁决

| 风险 | 缓解 |
|------|------|
| 网关双查性能 | SQLite 本地 <1ms；类型别名只影响未迁移消费者，迁移完成后单查 |
| 归一化层引入新 bug（L4 核心路径） | 未命中零行为变化 + 全量测试 + K3 复审计 |
| 映射表维护责任 | 注册进文件驱动检查（manifest 校验器扩展，T1 内） |
| **待裁决**：属性别名策略——"写规范键、读双键" vs "双向都归一化"，前者更干净后者更稳，建议前者 + 过渡期兼容读 |

---

## 附：本方案与 K3 审计的对应关系

| K3 发现 | 本方案回应 |
|---------|-----------|
| 0/3 循环贯通 | 阶段 1 网关立即贯通（T1-T4） |
| L4 类型契约断裂 | 2.2 契约网关 + 阶段 2 消费者收敛 |
| L5 连接器缺失 | 不在本方案范围（连接器是数据入口问题，契约是数据通路问题；建议另立 D# 任务） |
| P0 哨兵死代码/误报 | 贯通后 T4 实验自然覆盖；manifest 门控缺陷另立修复（不属契约层） |
| 新旧本体双轨 | 阶段 3 退役旧体系 |
