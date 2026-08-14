<!--
  Agent 核心能力全链路贯通审计任务 v1.1
  变更：术语更新——"测量器"全面改为"哨兵（Sentinel）"
  依据：SYNOVA-ARCH-哨兵体系-20260707.md
  当前状态：61个哨兵目录，50个有效（有aggregate.ts），11个空壳，4个P0哨兵compute缺失
-->

# Agent 核心能力全链路贯通审计任务 v1.1

> 任务类型：端到端数据流贯通验证
> 执行者：K3（独立会话，零上下文）
> 辅助：Claude Code 提供代码 grep 结果
> 输入：权威文档 01/03/13/15 + A线审计缺口 + 代码仓库
> 输出：AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md
> 预计时间：60-90 分钟

---

## 一、Synova 的业务定位（审计上下文）

**不是通用 AI Agent，是企业诊断 Agent。**

- **目标客户**：5-1000 人、有数据系统（CRM/财务/HR/代码仓库）的企业
- **核心承诺**：驻扎企业 → 持续观测（Sentinel）→ 主动诊断（FDE）→ 行动建议 → 跟踪执行
- **数据前提**：客户必须有数据，数据从 L5 统一接入。无数据企业不是客户。
- **五层架构**：
  ```
  L5 数据层（connectors）→ 统一接入企业系统
  L4 本体层（GraphBridge/GraphStore）→ 构建企业数字孪生
  L3 洞察层（哨兵体系）→ 61个哨兵（50有效+11空壳），7维度覆盖
  L2 编排层（orchestrator/agent）→ FDE 6阶段管道调度
  L1 交付层（routes）→ API 输出诊断结论
  ```

**术语更新**："测量器"已全面改为"哨兵（Sentinel）"。哨兵是 Synova "主动发现异常"的载体，通过 `aggregate.ts` 的 `check()` 函数执行，调用 `store.queryNodes()` / `traversal.traverse()` 获取 L4 数据，与 `manifest.json` 的 `thresholds` 对比产生 `SentinelFinding[]`。

**审计核心问题**：L5 声称能接入企业数据，但 L4→L3（哨兵）→L2→L1 的数据流真的贯通了吗？

---

## 二、审计方法：端到端链路追踪

不是问"函数是否存在"，是问"数据从进来到出去，每个环节真的走通了吗？"

### 2.1 选择审计循环

以 **3 个核心循环**为代表，验证全链路：

| 循环 | L5 数据源 | L3 哨兵 | L1 交付物 |
|------|----------|--------|----------|
| **客户循环** | CRM（Salesforce/HubSpot/钉钉） | customer-demand-shift, unit-economics 等哨兵 | CAC/LTV/NRR 趋势图 + 诊断结论 |
| **资本循环** | 财务系统（用友/金蝶/银行） | cash-runway, capital-structure, capital-efficiency 等哨兵 | 现金流周期/ROI 分析 |
| **人才循环** | HR 系统（钉钉/飞书/北森） | key-person-risk, talent-density, adaptation-velocity 等哨兵 | 离职率/人效/晋升周期 |

**为什么选这 3 个**：客户循环和资本循环是创始人最关心的（增长和钱），人才循环是组织诊断的核心。**特别注意**：资本循环的 4 个 P0 哨兵（cash-runway, cost-health, profit-health, revenue-health）存在 compute 缺失问题。

### 2.2 链路追踪方法（逐层验证）

对每个循环，按以下顺序验证：

#### Step 1: L5 连接器存在性
```bash
# 问题：L5 有没有这个循环的连接器？
grep -r "crm\|salesforce\|hubspot" src/connectors/ --include="*.ts" | wc -l
grep -r "finance\|用友\|金蝶" src/connectors/ --include="*.ts" | wc -l
grep -r "hr\|human.*resource\|北森" src/connectors/ --include="*.ts" | wc -l
```

#### Step 2: L4 本体映射
```bash
# 问题：L4 有没有把 CRM/财务/HR 数据映射为图节点？
grep -r "customer.*node\|CustomerNode\|crm.*graph" src/l4/ --include="*.ts" | wc -l
grep -r "capital.*node\|finance.*node\|cash.*node" src/l4/ --include="*.ts" | wc -l
grep -r "talent.*node\|hr.*node\|person.*node" src/l4/ --include="*.ts" | wc -l
```

#### Step 3: L3 哨兵可运行（关键变更点）

**不再 grep "测量器函数"，而是验证哨兵体系的真实状态：**

```bash
# 3.1 哨兵目录规模（验证架构文档声称）
ls extensions/sentinels/ | wc -l
echo "应有 61 个哨兵目录"

# 3.2 有效哨兵（有 aggregate.ts）vs 空壳（无 aggregate.ts）
find extensions/sentinels/ -name "aggregate.ts" | wc -l
echo "应有 50 个有效哨兵"

# 3.3 特定循环的哨兵是否存在
ls extensions/sentinels/ | grep -i "customer\|demand\|unit-economics"
ls extensions/sentinels/ | grep -i "cash\|capital\|revenue\|cost\|profit"
ls extensions/sentinels/ | grep -i "talent\|key-person\|adaptation"

# 3.4 哨兵 aggregate.ts 的真实内容（不是空壳？）
# 客户循环代表哨兵
cat extensions/sentinels/customer-demand-shift/aggregate.ts | head -30
cat extensions/sentinels/unit-economics/aggregate.ts | head -30

# 资本循环代表哨兵（注意：4个P0哨兵compute缺失）
cat extensions/sentinels/cash-runway/aggregate.ts | head -30
cat extensions/sentinels/capital-structure/aggregate.ts | head -30

# 3.5 哨兵 compute 函数是否存在（不是 TODO/空壳）
grep -r "TODO\|FIXME\|stub\|placeholder\|not implemented" extensions/sentinels/*/aggregate.ts | wc -l
grep -r "compute" extensions/sentinels/cash-runway/ --include="*.ts"
grep -r "compute" extensions/sentinels/revenue-health/ --include="*.ts"

# 3.6 哨兵 manifest.json 的阈值配置
# 验证 thresholds 字段是否存在且合理
cat extensions/sentinels/cash-runway/manifest.json | grep -A 5 "thresholds"
cat extensions/sentinels/customer-demand-shift/manifest.json | grep -A 5 "thresholds"
```

#### Step 4: L2 管道调度（哨兵触发链路）
```bash
# 问题：FDE 管道是否真的调用了哨兵？SentinelRunner 是否执行了 check()？
grep -r "SentinelRunner\|runSentinel\|check(" src/orchestrator/ src/agent/ --include="*.ts" | head -20

# 问题：Cron 调度是否真实配置了哨兵？
grep -r "sentinel\|cron.*schedule" src/cron/ --include="*.ts" | head -20
cat src/cron/scheduler.ts | head -50

# 问题：哨兵注册是否三重入口混乱？
grep -r "getSentinelRegistry\|register()" src/sentinel/ --include="*.ts" | wc -l
grep -r "loadSentinels\|file-driven" src/ --include="*.ts" | head -10
```

#### Step 5: L1 API 交付
```bash
# 问题：API 路由是否返回了哨兵的诊断结论？
grep -r "sentinel\|finding\|diagnosis.*report" src/routes/ --include="*.ts" | wc -l
grep -r "/api/sentinel\|/api/diagnosis\|/api/report" src/routes/ --include="*.ts" -A 10 | head -30
```

#### Step 6: 端到端调用（最关键）
```bash
# 问题：从 API 入口到哨兵 aggregate.ts，调用链是否完整？
# 方法：找一个具体的诊断 API，追踪其调用链

# 示例：GET /api/diagnosis/:id 的调用链
grep -r "diagnosis\|/api/diagnosis" src/routes/ --include="*.ts" -A 20 | head -50

# 追踪：这个路由调用了哪些函数？哪些函数最终调用了哨兵的 check()？
# 手动追踪 2-3 个关键函数，确认链路是否断裂
```

### 2.3 判定标准

| 链路状态 | 判定 | 说明 |
|---------|:---:|------|
| L5→L4→L3（哨兵）→L2→L1 全贯通 | ✅ PASS | 数据能真的从 CRM 进来，走到哨兵 check()，产生 Finding，走到诊断报告出去 |
| 某个环节断了（如 L3 哨兵空壳） | ❌ FAIL | 这个循环的观测能力是空壳 |
| 某个哨兵 aggregate.ts 是桥接文件（import 但无实现） | ⚠️ PARTIAL | 声称已实现，实际未接线 |
| 哨兵有 aggregate.ts 但 compute 缺失 | ⚠️ DEGRADED | 功能存在但计算逻辑缺失（如4个P0哨兵） |

---

## 三、哨兵体系专项验证

基于哨兵体系架构文档（SYNOVA-ARCH-哨兵体系-20260707.md），专项验证以下声称：

| 架构文档声称 | 验证命令 | 判定 |
|-----------|---------|:---|
| "61个哨兵目录" | `ls extensions/sentinels/ \| wc -l` | 是否=61 |
| "50个有aggregate.ts" | `find extensions/sentinels/ -name "aggregate.ts" \| wc -l` | 是否=50 |
| "4个P0哨兵compute缺失" | `grep -r "compute" extensions/sentinels/cash-runway/ --include="*.ts"` | 是否缺失 |
| "11个空壳" | `for d in extensions/sentinels/*/; do [ ! -f "$d/aggregate.ts" ] && echo "EMPTY: $d"; done` | 是否=11 |
| "三重注册入口" | `grep -r "getSentinelRegistry\|register()" src/ --include="*.ts" \| wc -l` | 是否>1（冗余） |
| "正向信号放大未实现" | `grep -r "excellence\|positive\|severity.*positive" src/sentinel/ extensions/sentinels/*/manifest.json` | 是否存在 |

---

## 四、与 A线审计的交叉验证

A线审计（2026-08-01）已发现的缺口，在本次审计中重点验证：

| A线缺口 | 本次验证重点 |
|--------|------------|
| direction-monitor 未接线 | 方向循环的 L2→L3（哨兵）链路是否断裂？ |
| middle-evolution-engine 未接线 | 进化循环的哨兵是否有空壳？ |
| NCI 零代码 | 方向循环的非共识检测是否完全缺失？ |
| G2: Agent 自主性 vs 实现差距 | 3 个循环的哨兵自动观测是否真的运行？ |
| 4个P0哨兵compute缺失 | cash-runway, cost-health, profit-health, revenue-health 是否仍缺失？ |

---

## 五、输出格式

```markdown
# Agent 核心能力全链路贯通审计报告

## 审计循环：客户循环 / 资本循环 / 人才循环

### 客户循环链路验证

| 层级 | 组件 | 状态 | 证据 |
|------|------|:---:|------|
| L5 | CRM 连接器 | [PASS/FAIL] | grep 找到 X 个文件 |
| L4 | 客户图节点映射 | [PASS/FAIL] | grep 找到 X 个映射函数 |
| L3 | customer-demand-shift 哨兵 | [PASS/FAIL] | aggregate.ts 存在+compute完整 |
| L3 | unit-economics 哨兵 | [PASS/FAIL] | aggregate.ts 存在+compute完整 |
| L2 | SentinelRunner 调度 | [PASS/FAIL] | 是否执行 check() |
| L1 | API 诊断报告 | [PASS/FAIL] | 路由是否返回哨兵 Finding |
| **端到端** | **全链路贯通** | **[PASS/FAIL/PARTIAL]** | **调用链追踪结果** |

### 资本循环链路验证（注意：4个P0哨兵）

| 层级 | 组件 | 状态 | 证据 |
|------|------|:---:|------|
| L5 | 财务连接器 | [PASS/FAIL] | |
| L4 | 财务图节点映射 | [PASS/FAIL] | |
| L3 | cash-runway 哨兵 | [FAIL/DEGRADED] | **compute 缺失** |
| L3 | capital-structure 哨兵 | [PASS/FAIL] | aggregate.ts + compute |
| L2 | SentinelRunner 调度 | [PASS/FAIL] | |
| L1 | API 报告 | [PASS/FAIL] | |
| **端到端** | **全链路贯通** | **[PARTIAL/FAIL]** | **P0哨兵阻断** |

### 人才循环链路验证
...

## 哨兵体系专项验证

| 声称 | 验证结果 | 状态 |
|------|---------|:---|
| 61个哨兵目录 | 实际 X 个 | [PASS/FAIL] |
| 50个有效（有aggregate.ts） | 实际 X 个 | [PASS/FAIL] |
| 4个P0哨兵compute缺失 | 实际 X 个仍缺失 | [确认/已修复] |
| 11个空壳 | 实际 X 个 | [PASS/FAIL] |
| 三重注册入口 | 是否冗余 | [DEGRADED] |
| 正向信号放大 | 未实现 | [已知缺失] |

## 与 A线缺口交叉验证

| A线缺口 | 本次验证结果 | 状态变化 |
|--------|------------|---------|
| direction-monitor 未接线 | ... | 确认/修复/恶化 |
| 4个P0哨兵compute缺失 | ... | 确认/部分修复/已修复 |

## 总体判定

- **全链路贯通循环数**：X/3
- **哨兵有效比例**：X/61
- **P0哨兵修复状态**：X/4
- **建议优先修复**：...
```

---

## 六、降级处理

| 场景 | 降级行为 |
|------|---------|
| 某个连接器不存在于 src/connectors/ | 检查 docs/ 或 packages/ 是否有独立连接器包 |
| 哨兵 aggregate.ts 依赖 packages/engine-core/ | 记录路径差异，验证是否被正确 import |
| 端到端追踪因依赖复杂无法完成 | 改为静态调用链分析（grep import 关系） |
| API 无法实际调用（无运行环境） | 降级为代码静态分析，标注局限性 |
| 哨兵目录不存在于 extensions/sentinels/ | 检查 src/sentinel/adapters/（遗留路径） |

---

## 七、验收标准

1. 3 个循环的 L5→L1 链路全部验证，每层有具体 grep 证据
2. **哨兵体系专项验证完成**：61/50/11/4 四个数字确认
3. 与 A线审计的缺口交叉验证完成（特别是 4 个 P0 哨兵）
4. 端到端调用链至少追踪 1 个完整的哨兵运行流程
5. 空壳/TODO 比例计算准确
6. 输出 `AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md`

---

> **版本变更**：v1.0 → v1.1
> **变更内容**：术语"测量器"全面改为"哨兵（Sentinel）"，依据 SYNOVA-ARCH-哨兵体系-20260707.md
> **关键数据**：61个哨兵目录 / 50个有效 / 11个空壳 / 4个P0哨兵compute缺失

*任务定义完。K3 按此清单执行端到端链路审计。*
