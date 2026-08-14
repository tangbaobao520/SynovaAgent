<!--
  SYNOVA-CROSS-AUDIT-阶段性报告-20260727
  状态: 审计进行中 (5/10 轮完成)
  已执行: Round 3(架构), Round 5(数字), Round 6(专家体系), Special A(42边消费-进行中), Special B(CT组件验证)
  待执行: Round 1(术语), Round 2(数据契约), Round 4(时间尺度), Round 7(测试体系), Round 8(安全部署), Round 9(专题集成)
-->

# Synova 跨文档一致性审计 — 阶段性报告 v1.0

> 2026-07-27 | 已执行 5 轮 + 1 专项 | 发现 P0 级问题 6 项, P1 级问题 15 项

---

## 一、P0 级发现 (数据契约断裂——会导致系统不能正常工作)

### P0-1: AGENTS.md V4.5.0 架构定义与实际代码目录严重脱节 [Round 3]

**证据 A**: AGENTS.md 第 165-175 行定义的五层架构仅包含 14 个目录。
**证据 B**: `src/` 目录实际包含 49 个目录——35 个未在 AGENTS.md 中定义。

缺失的目录包括: `growth/`(Goal导航核心)、`loops/`(循环调度核心)、`cycles/`(溢出计算)、`adapters/`(GraphStore适配器)、`ingest/`(数据管道)、`control-tower/`(控制塔脚本)、`security/`、`providers/`、`connectors/` 等。

**后果**: `check-architecture.sh` 的跨层违规检测(L2→L4 / L3→L5)只能覆盖 14 个目录，对 35 个新目录不做检测。任何新模块都可能存在跨层引用而不会被发现。

**基准**: AGENTS.md V4.5.0 (已锁定)。

### P0-2: 专家数量——文档声称 8 位, 代码实际仅 6 位 [Round 5 + Round 6]

**证据 A**: AGENTS.md V4.5.0 数据流图声称 8 位专家: `strategy/org/finance/tech/marketing/action/business_model/knowledge`。
**证据 B**: 文档 10 第一章定义了 8 位专家的完整 AgentSpec。
**证据 C**: 文档 10 第六章 §6.3 自审发现 `expert-prompts.ts` L30-200 **仅含 6 位专家定义**，明确标注 "缺 business_model 和 knowledge 专家定义"。
**证据 D**: `src/expert-platform/` 中 `expert-prompts.ts` 确实只有 6 位专家的提示词模板。

**后果**: business_model 和 knowledge 两位专家从设计到代码全链路缺失。哨兵系统无法路由到这两位不存在的专家，诊断报告中将没有任何商业模式或知识维度的分析。

**基准**: 文档 10 (专家提示词工程) 为定义基准。

### P0-3: 专家 ID 跨文档完全不兼容——13 使用自创命名, 与 03/10 完全不同 [Round 6]

**证据 A**: 03 (AGENTS.md) 和 10 使用短 ID: `strategy`, `org`, `finance`, `tech`, `marketing`, `action`, `business_model`, `knowledge`。
**证据 B**: 13 §4.3 轻量级再诊断专家选择表使用长 ID: `strategic_analyst`, `org_diagnostician`, `financial_analyst`, `tech_architect`, `marketing_analyst`。
**证据 C**: 两套命名零重叠。如果 13 的 `GoalManifest.expert` 填入 `"financial_analyst"`，而 `expert-prompts.ts` 的键名是 `"finance"`，运行时路由查找将静默失败。

**后果**: Goal 创建后触发的轻量级再诊断永远找不到正确的专家。P0 告警→再诊断链路断裂。

**基准**: 文档 03/10 为命名基准 (短 ID)。

### P0-4: CT 附录 A Gate 5 引用的 `triggerFullDiagnosis` 函数不存在 [Special B]

**证据 A**: 附录 A Gate 5 通过条件 3 要求 `src/agent/diagnosis-launcher.ts` 含 `triggerFullDiagnosis` 导出。
**证据 B**: `src/agent/diagnosis-launcher.ts` 实际导出的是 `DiagnosisLauncher` 类，入口方法是 `startDiagnosis()`。全仓 grep `triggerFullDiagnosis` → 零结果。

**后果**: check-gates-v2.py 的 Gate 5 自动判定脚本将永远报告 "diagnosis-launcher.ts: 存在但无导出函数"——即使诊断启动器功能完好。Gate 5 被永久锁定为 PARTIAL。

### P0-5: CT 附录 A Gate 1 声称 `bcrypt.hash` 在 enterprise.ts 中被调用——实际为死导入 [Special B]

**证据 A**: 附录 A Gate 1 通过条件 2 要求 "注册端点内部调用 `bcrypt.hash(password, ...)`"。
**证据 B**: `src/routes/enterprise.ts` 第 22 行导入了 `bcrypt` 但从未调用。实际 bcrypt.hash 在 `user-store.ts` 和 `auth.ts` 中。enterprise.ts 的注册端点将密码哈希委托给 `UserStore.createUser()`。

**后果**: check-gates-v2.py 在 enterprise.ts 中 grep `bcrypt\.hash` → 零结果 → 假阴性。Gate 1 可能被错误判定。

### P0-6: 13 遗漏 3/8 专家——business_model, action, knowledge 无任何结构化引用 [Round 6]

**证据 A**: 13 §4.3 维度→专家映射表仅覆盖 5 位专家。
**证据 B**: `business_model` 和 `knowledge` 在 13 的五章正文中零出现。
**证据 C**: `action` 仅在 Proposal 章节的散文描述中被模糊提及，无结构化定义。

**后果**: Goal 导航系统生成的提案永远不会包含商业模式、行动、知识三个维度的分析。8 位专家的设计意图在应用层被削减为 5 位。

---

## 二、P1 级发现 (术语/数字不一致——导致开发困惑)

### 2.1 数字不一致

| 发现 | 来源 | 详情 |
|------|------|------|
| 感知断裂点: 5 vs 4 | 01 前置研究定义 "5大断裂点", 02 和审计计划使用 "4 个感知断裂点" | Round 5 |
| 架构层数: 5 vs 4 | AGENTS.md 定义五层(L1-L5), 权威文档 14 可能使用四层架构 | Round 5 |
| 哨兵数量: 20 vs 4 | AGENTS.md 声称 20 哨兵适配器, 实际 `src/sentinel/adapters/` 仅含 4 个 .ts 文件 (+ helpers.ts) | Round 3 |

### 2.2 CT 附录 A 组件引用不精确 (6 项)

| 附录引用 | 实际 | 影响 |
|---------|------|------|
| enterprise.ts:116 (invite 端点) | 第 136 行 | 行号偏差 20 行 |
| AutonomyResult.hypothesis: 第 46 行 | 第 45 行 | 偏 1 行 |
| direction_status 字段 | 仅注释中存在; 实际为 `status: DirectionStatus` | 字段名错误 |
| CronScheduler class in loop-scheduler.ts | 使用的是 `CronSchedulerLike` 接口 | 类型名不精确 |
| createGoal(): Promise\<string\> | 返回 `string` 而非 `Promise<string>` | 返回类型错误 |
| scripts/synova-commit | 实际路径: scripts/control-tower/synova-commit | 路径缺少 control-tower/ |

### 2.3 术语混用

| 术语 | 混用情况 |
|------|---------|
| GraphBridge / GraphStore / GraphBridgeLike / GraphStoreLike | 19 个文件混用四种变体。user-store.ts 使用 GraphStoreLike, goal-types.ts 使用 GraphBridgeLike, AGENTS.md 使用 GraphBridge |
| 专家 ID 命名 | 03/10 使用短 ID (strategy/org/finance...), 13 使用长 ID (strategic_analyst/org_diagnostician...) |

---

## 三、已确认一致的项目

| 检查项 | 状态 |
|--------|:---:|
| 42 条因果边数量 | ✅ 全文档一致 |
| 6 个控制塔组件 | ✅ 控制塔 6 章均引用相同 6 组件 |
| 6 个业务循环 | ✅ 15 文档 6 循环定义与 loop-scheduler.ts 一致 |
| CT 附录 A 35 个组件引用中 27 个 | ✅ 文件/函数/字段真实存在 |
| 55 个 edge-type JSON | ✅ 附录声称 ≥42，实际 55 个(超出预期) |
| 45 个 transfer_function | ✅ 与附录一致 |

---

## 四、进行中 / 待执行

| 轮次 | 状态 |
|------|------|
| Special A (42 边下游消费完整性) | 🔄 子 Agent Nash 执行中 |
| Round 1 (术语一致性 - 全 21 组) | ⏳ 待执行 |
| Round 2 (数据契约链 01→02→03→3D→13→15) | ⏳ 待执行 |
| Round 4 (时间尺度 02↔07↔15) | ⏳ 待执行 |
| Round 7 (测试与质量 06↔CT↔14) | ⏳ 待执行 |
| Round 8 (安全与部署 08↔09↔ENT) | ⏳ 待执行 |
| Round 9 (专题集成 NCI↔02↔15, AR↔01↔13) | ⏳ 待执行 |