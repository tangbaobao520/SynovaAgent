<!--
  SYNOVA-IMPL-D701: 决策驱动来源落地（DecisionRecord + Goal.source.decisionRecordId）——导航 P1 第一件
  状态: dev doc | 2026-09-10 | 优先级 P1（导航目标全生命周期）
  权威文档: docs/synova/research/增长导航目标管理闭环-20260906/第二章 §2.2/§2.3/§2.8 + 第六章 §6.5；docs/authority/AUTHORITY-UPGRADE-NOTICE-20260906.md
  借鉴: 无（导航来源扩展，非 DSH 借鉴卡）
  依赖: P0 文档批（ARCHITECTURE.md + 权威文档13 定位更新）已合并 dff18196
  并行: 无（写集 src/growth/ 新建/修改；与 D700 专家 tools 卡（expert/）零交集）
-->

# SYNOVA-IMPL-D701：决策驱动来源落地（DecisionRecord + Goal.source.decisionRecordId）

> 状态：dev doc | 2026-09-10 | 优先级 P1（导航 P1 第一件）
> 归属：Win 线（src/growth/）
> 依赖：P0 文档批已合并（导航 = 目标全生命周期管理）

## 1. 权威文档引用

- **第二章 §2.2 目标来源三类**：诊断驱动（`source.diagnosisReportId`，已有）/ **决策驱动（`source.decisionRecordId`，新增）** / 外部驱动（`source.externalEventId`，新增）。决策驱动 = 老板凭直觉/经验定新方向 → 记录决策 → 分解为目标。
- **第二章 §2.3 DecisionRecord 数据结构（原文）**：`{ id, decidedBy:{role:'founder'|'ga',name}, decidedAt, direction, rationale, relationToDiagnosis:'aligned'|'overriding'|'unrelated', overriddenRecommendationId?, constraints?:{budget?,resource?}, derivedGoals[] }`。
- **第二章 §2.8 决策捕获触发**：① 对话式捕获（LLM 识别「新方向决策」→ 生成 DecisionRecord 草稿 → 老板确认）；② 主动录入（界面直接建目标，来源=决策驱动）。决策记录要**事后可补充、可修正**（保留完整审计链）。
- **第六章 §6.5 落地路线图 P1**：决策驱动来源落地（DecisionRecord + source.decisionRecordId）依赖第二章。

## 2. 代码审计——现状（file:line，实测）

### 2.1 现状（缺陷）

- **缺陷 A（Goal 无决策来源）**：`src/growth/goal-types.ts:89` `interface Goal` 只有 `proposalId`（来源 Proposal）+ `diagnosisId`（来源诊断报告）——**无 `decisionRecordId`**，决策驱动来源无法表达。
- **缺陷 B（无 DecisionRecord 结构）**：`grep -rn "DecisionRecord\|decisionRecordId" src/` 仅命中 `src/l4/decision-capture.ts`（**不同概念**——那是「用户确认/驳回根因节点记录决策边」，Palantir Action-as-First-Class，非老板直觉决策记录）——导航 DecisionRecord **不存在**。
- **缺陷 C（无决策记录存储）**：无 `DecisionRecordStore`/持久化。

### 2.2 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | `DecisionRecord` 零命中（`l4/decision-capture.ts` 是同名不同义，需区分）；`decisionRecordId` 零命中 |
| 施工图可借鉴清单 | 非借鉴卡；第二章 §2.3 已给数据结构（可直接采用） |
| 既有层确认 | Goal/Proposal 在 `src/growth/`（goal-types/proposal-types/goal-store）；本卡新增 `src/growth/decision-record.ts`，复用 goal-store 的持久化风格 |
| 结论 | 新增 DecisionRecord + Goal 加 `decisionRecordId`，不重造 Goal/Proposal |

## 3. 实现方案

### 3.1 写集 (1 新建 + 2 修改 + 1 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `src/growth/decision-record.ts` | 新建 | `DecisionRecord` 接口（§2.3 原样字段）+ `DecisionRecordStore`（create/get/list/updateRationale——支持「事后可补充、可修正」）+ 契约 JSDoc（@input/@output/@degraded） |
| `src/growth/goal-types.ts` | 修改 | `interface Goal` 加 `decisionRecordId?: string`（与 `proposalId`/`diagnosisId` 并列，三来源） |
| `src/growth/goal-store.ts` | 修改 | `createGoal` 支持 `decisionRecordId` 入参透传（无则 undefined，向后兼容既有诊断驱动） |
| `tests/growth/decision-record.test.ts` | 新建 | 单测：创建/读取/修正 rationale/列表 + Goal.decisionRecordId 透传 + 无 decisionRecordId 兼容 |

### 3.2 最终实现同 commit 回填

最终实现（本卡同一 commit）三处偏离已回填：

1. **`goal-store.ts` 仅注记、无逻辑改动**：`createGoal` 用 `...goal` spread 持久化，`decisionRecordId` 本就自动透传（无需白名单）——依 spec §3.1「透传」意图在 createGoal 加注释说明三来源（diagnosisId/decisionRecordId/externalEventId），未加冗余代码。
2. **DecisionRecordStore 读路径去类型逃逸**：`fromProps(props)` 逐字段运行时收窄（不用 `as unknown as`），替代 spec 隐含的直接断言；写路径 `toProps(record)` 显式构造。
3. **测试 9 用例**（spec 要求 ≥5）：create/三 relation/get/updateRationale/constraints+derivedGoals/校验 fail-closed/store 降级/list/linkGoal 幂等+fail-closed/Goal.decisionRecordId 透传+决策→Goal 关联。
4. **`DecisionRecordStore` 真实接线（CI 组4 修复）**：`createGoal` 内用 DecisionRecordStore.linkGoal 把 Goal 关联回决策记录（决策→分解闭环）；同时把 `VALID_DECISION_RELATIONS`/`DECISION_RECORD_NODE_TYPE`/`DECISION_RECORD_GRAPH` 收回模块内部（不导出），避免「新 export 无生产调用方」拦截。

5. **🚨 自审发现的真 bug（合并后修复，本 commit）**：`create` 原把 `randomUUID()` 当 record.id，但真实 `SqliteGraphStore.createNode` **恒生成 `node-${uuid}` 并忽略 props.id** → `get(id)`/`updateNode(id)` 在真实 store 下取不回来（测试用「按 props.id 建档」的假 store 才蒙混过关）。修法：`create` 用 `createNode` 返回值作为 `record.id`；`toProps` 不再写 id；`fromProps(id, props)` 从节点 id 取；测试假 store 改为**对齐真实 store**（恒生成 `node-<n>`、忽略 props.id/goalId），使该缺陷可被测试复现。关联观察：`goal-store.createGoal` 自身也忽略 store 返回 id（用自造 goalId），故 `getGoal(goalId)` 在真实 store 下同样取不回——pre-existing 模式问题，非本卡引入，已在台账登记。

**tsc 基线口径**：分支点 `tsc --noEmit` = 33（非 spec 写的历史 28——`_extinct`/mcp 既有错），新增 3 文件零错误，33=基线恒等。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不做对话式 LLM 捕获（§2.8 路径①） | 属决策捕获触发（LLM 识别 + 草稿），独立卡（P1 后续） |
| 不做约束注入（第三章）/决策→Goal 分解（第三章） | 属 P1 第二/三件 |
| 不做 `source.externalEventId`（外部驱动） | 属外部事件来源，独立卡 |
| 不引 `@deepseek-ai` | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

第一步写测试跑红（DecisionRecord 模块不存在 / Goal 无 decisionRecordId → fail），第二步实现跑绿。每用例 ≥3 expect。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/growth/decision-record.test.ts` | 单测 | ≥5 | create 返回 id、get 读回、relationToDiagnosis 三值、updateRationale 修正（事后可补）、constraints 可选、Goal.decisionRecordId 透传、无 decisionRecordId 兼容（诊断驱动路径不变） |

RED 必须覆盖失败模式（S-5）：`DecisionRecordStore` 不存在 → red；`Goal.decisionRecordId` 未定义 → red；无 `decisionRecordId` 的旧 Goal 仍可创建（向后兼容）→ green。

### 4.5 决策参考（S-12）

- **决策点 1（DecisionRecord 字段）**：参考系 = 第二章 §2.3 原文结构——采纳**原样字段**（direction/rationale/relationToDiagnosis/overriddenRecommendationId/constraints/derivedGoals），不自造。
- **决策点 2（Goal 三来源表达）**：参考系 = §2.2 三来源表——采纳 `decisionRecordId?` 可选字段（与 proposalId/diagnosisId 并列，缺省不影响诊断驱动）。

## 5. 接线要求（生产调用点，S-3）

| 新 export/函数 | 调用方 | 确认方式 |
|---|---|---|
| `DecisionRecordStore` | `src/growth/goal-store.ts`（createGoal 透传 decisionRecordId） | `grep -rn "DecisionRecordStore\|decisionRecordId" src/growth/` 命中 |
| `Goal.decisionRecordId` | goal-store + 下游 Goal 消费 | `grep -rn "decisionRecordId" src/growth/goal-types.ts src/growth/goal-store.ts` 命中 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 DecisionRecord 落地**：`ls src/growth/decision-record.ts` 存在；`grep -n "interface DecisionRecord" src/growth/decision-record.ts` 命中。
- **DS2 Goal 三来源**：`grep -n "decisionRecordId" src/growth/goal-types.ts src/growth/goal-store.ts` 命中。
- **DS3 测试 red→green**：`npx vitest run tests/growth/decision-record.test.ts` 先 red → green（≥5 用例）。
- **DS4 零回归**：`npx vitest run tests/growth/` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增，逐条 diff）。
- **DS5 类型安全**：`grep -rn "as any\|as never\|as unknown as" src/growth/decision-record.ts` 零命中（新增行）。
- **DS6 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界。
- **DS7 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
- **DS8 推送+CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿。

## 7. 自检清单

- [ ] 第二章 §2.2/§2.3/§2.8 + 第六章 §6.5 已读（原文引用）
- [ ] Goal 三来源现状（proposalId/diagnosisId）grep 实证；DecisionRecord 不存在（区分 l4/decision-capture）
- [ ] DecisionRecord 字段原样采用 §2.3
- [ ] 对话式捕获/约束注入/externalEventId 明确 descope
- [ ] 向后兼容：无 decisionRecordId 的旧 Goal 仍可创建
- [ ] 不是凭记忆 / 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| DecisionRecord 落地 | `rg "interface DecisionRecord" src/growth/decision-record.ts` | 命中 |
| Goal 三来源 | `rg "decisionRecordId" src/growth/goal-types.ts src/growth/goal-store.ts` | 命中 |
| 测试 red→green | `npx vitest run tests/growth/decision-record.test.ts` | 全 pass |
| 零回归 | `npx tsc --noEmit` | 28 = 基线 |
| as any=0 | `rg "as any" src/growth/decision-record.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 一致 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后）+ CI 绿 |
