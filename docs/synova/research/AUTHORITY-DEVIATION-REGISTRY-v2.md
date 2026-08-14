# AUTHORITY-DEVIATION-REGISTRY — 权威文档偏差登记册 v2.0（最终版）

> 2026-08-13 | K3 第三批审计产出：注册表验证与定稿
> 方法：**独立验证 v1.1**——不假设 v1.1 正确，全部关键结论用物理事实重检（故障注入 / 运行实证 / 全链路追踪）
> 验证基线：HEAD `7ace35e`（2026-08-12 23:37）| v1.1 基线：`407ff1f` | A线原基线：`431e16b`
> 输入：AUTHORITY-DEVIATION-REGISTRY-v1.md（唯一文档输入）+ 其引用的代码/脚本文件
> 核心原则：审计者不相信自己的上一份工作产出
> 终审：v2 成稿后已对全部证据点二次复核（3 处错误修正 + 3 处遗漏补全，见第七节）

---

## 一、验证摘要

| 子任务 | 结果 | 关键结论 |
|--------|------|---------|
| 1. 已闭环项验证（3 项） | ✅ 全部真实闭环 | C-G1 门禁实跑 10/10 PASS；N9 文件存在且被消费；A-G3 文档已更新 |
| 2. P0（N13）故障注入 | ✅ **复现成功，P0 保留，根因加深** | 发现比"未接线"更危险的新层：名义调度通道是 placeholder，返回假成功 |
| 3. 改判交叉验证（3 项） | 2 项确认，**1 项退回修正** | 组 11 ✅；D-G2 ✅（机制边界精确化）；**铁律 38 退回**——packages/ 23 个文件共 81 处 `as any` 无门禁 |
| 4. 待决策项分析（2 项） | ✅ 材料产出 | P0-8：代码有 3 处 boss 幽灵引用；N14：去重键不稳定，窗口大小讨论是次要的 |

**新增偏差（验证过程中发现）**：P1-C1（packages/ `as any` 盲区）、P1-C2（4 个默认循环处理器全部 placeholder 假成功）、D5（C线 S5-3 证据失效）、D6（反向偏差：话术可升级）。

---

## 二、已闭环验证（逐项物理实证 @7ace35e）

| 项 | v1.1 判定 | 验证过程 | 验证结果 |
|----|----------|---------|---------|
| C-G1 黄金数据集门禁 | 已闭环（D300） | ① `.git/hooks/pre-push` → `pre-push-check.sh` ✅；② `pre-push-check.sh:127` 失败即 `exit 1` 阻断 ✅；③ **实际运行 `npx tsx scripts/ci/golden-case-checker.ts` → 10/10 用例 PASS（边=1.0/节点=1.0/级别=true），EXIT=0** ✅ | **真实闭环**（门禁存在且生效） |
| N9 dependency-graph.json | 已闭环 | 文件存在（50KB，08-01 生成）；`generate-dashboard.py:235` 列入 sources 消费，且被 freshness_check 监控缺失/过期 | **真实闭环** |
| A-G3 定位人数 | 已闭环 | `AGENTS.md:116` = "5-1000人团队" | **真实闭环** |

无虚假闭环。

---

## 三、P0 根因：N13 反馈→规则闭环断裂（故障注入实验）

### 实验设计

P0 声称"反馈→规则闭环断裂"。故障注入思路：沿"GA/中层反馈注入点 → 反馈存储 → 聚合 → 规则更新动作"全链路追踪，寻找任何一条能让闭环物理走通的生产路径。

### 链路追踪（全部 @7ace35e）

| 环节 | 物理事实 | 证据 |
|------|---------|------|
| ① 注入点（写入侧） | **真实存在**：中层改目标值 / 否决路径时 `feedbackCollector.collectFeedback(...)` 被真实调用 | `src/routes/workspace-data.ts:141,166` |
| ② 反馈存储 | 存在：`FeedbackCollector` 单例（`feedback-collector.ts:297-300`） | 同上 |
| ③ 聚合→行动 | **生产代码零调用**：`processFeedbackSignals` / `computeGAProtection` / `applyEvolutionActions` 全仓 grep（排除 node_modules/dist/docs/快照）——生产代码零匹配；匹配项仅为审计脚本（`check-gates-v2.py`）、测试（2 个 test 文件）、根目录临时脚本与 vitest 日志 | 全仓 grep `processFeedbackSignals\|applyEvolutionActions\|computeGAProtection` |
| ④ 名义调度通道（v2 新发现） | loop-3/loop-5 经 `main-agent.ts:277-278` → `defaultEvolutionHandler`——**placeholder 空壳**：`loop-handlers.ts:65-78` 只 log 一行就返回 `success: true`；文件头自承"MVP 阶段为 placeholder 实现：记录日志 + 返回成功。D9 将替换为真实逻辑"（`loop-handlers.ts:4-5`） | Read `loop-handlers.ts` 全文 |
| ⑤ 假成功记录（v2 新发现） | placeholder 返回 success → `main-agent.ts:182-199` 写入 `'completed'` 执行记录 + 审计日志 + executionCount++ → **控制塔/审计会看到"进化循环执行完成"，实际什么都没做** | `main-agent.ts:182-199` |
| ⑥ 例外 | loop-1 诊断走 `executeWithDecomposition`（`main-agent.ts:171-175`），真实任务分解执行——**6 循环中唯一有真实执行体的** | `main-agent.ts:171-175, 291+` |

### 结论

- **复现成功 → P0 保留**。注入反馈后，生产环境无任何路径将其转化为规则/权重更新；唯一名义通道（loop-3/5）是返回假成功的 placeholder。
- **根因比 v1.1 更深一层**：v1.1 定性为"消费方未接线"；v2 发现定时调度链上接着的是空壳——即使有人以为"进化循环在跑"，执行记录也是伪造的成功。这比"未接线"危险：**它让断裂在仪表盘上不可见**。
- **连带修正**：C线 S5-3"知识沉淀 ✅"的证据是"loop-5 接线 evolution handler（A线 B6 S 证据）"——接线对象是 placeholder，该 ✅ 失去证据支撑 → 文档任务 D5。A线 B6"循环调度 ✅"需限定为"调度机制真实；loop-2/3/4/5/6 执行体为 placeholder"。

### 实验局限性（按降级处理声明）

静态链路追踪 + 全仓 grep，未启动完整 agent 进程做运行时注入。静态证据链完整闭合（写入点真实、消费方零调用、handler 为 placeholder 源码可见），运行时复现不改变结论。

---

## 四、改判复核

| 改判项 | v1.1 判定 | 验证 @7ace35e | 结论 |
|--------|----------|--------------|------|
| 组 11："phantom"→"已并入组 4" | 修正 | grep 确认 echo 组号为 1-10+12 共 11 个；`pre-commit-check.sh:351` 注释"组 4: 接线完整性 (原 5, 11 合并)" | ✅ **确认**（计数口径滞后，非检查缺失） |
| D-G2："已修复"→"引擎已修复，数据链路未担保" | 改判 | ① 引擎：最新快照仍 `20260801T063408Z`（差异化评分）✅；② 数据链路：gate-status.json 仍缺失；**机制边界需精确化**——`freshness_check`（`generate-dashboard.py:236-252`）会把缺失/过期源记入 missing/stale，`write_dashboard_checkpoint:279-299` 据此将 CP1 置 fail——**检测能力存在，但纯属被动记录**：cp1-dashboard-check.json 最后记录停在 `2026-08-01T09:48:19Z`（status=pass），此后 12 天无人运行，当前失真的状态未被任何活动检查捕获 | ✅ **确认，机制边界修正为**：检测存在但被动（需人跑 dashboard + 需人看 cp1），无主动告警、无阻断 |
| 铁律 38："推断覆盖"→"实证全覆盖" | 升级 | 组 1 扫描逻辑（`pre-commit-check.sh:212-215`）确实是硬阻断+跳过注释行——**但范围是 `grep -rn ... src/`，只覆盖 src/**；实测 `packages/` 下非测试非注释 `as any` 共 **81 处、分布在 23 个活跃文件**（`_archived` 占 0；connector-registry、engine-core/pipeline/diagnosis/* 等） | ❌ **改判存疑 → 退回修正**：真实覆盖 = "src/ 全扫硬阻断 + packages/ 完全盲区（23 文件 81 处存量）"。铁律 38"代码中零存在"的声称在 packages/ 不成立 → 新偏差 P1-C1 |

---

## 五、待决策项分析（K3 只出分析，不替创始人决策）

### P0-8：ENT 缺 boss 角色（08 六角色矩阵 vs 代码五角色）

**现状物理事实**：
- 代码角色体系：`WorkspaceRole = 'admin' | 'manager' | 'liaison' | 'staff' | 'ga'`（`rbac.ts:13`），角色定义表 `rbac.ts:44-60`；邀请接受时角色 cast 为四角色（`enterprise.ts:226`）
- **代码内已有 3 处 boss 幽灵引用**：`policy-engine.ts:136` 有一条 `roles: ['boss']` 的策略规则（**永不命中**——没有任何合法用户能持有 boss 角色）；`data-lifecycle.ts:32,59` 两处请求解析默认 `role = 'boss'`

**选项 A：改代码（补齐 boss 为正式角色）**
- 涉及文件：`rbac.ts`（union + 定义表 + canAccessWorkspace 映射）、`enterprise.ts:226`（cast）、user-store 角色类型（若独立定义）、`app/js/admin.js:60`（邀请 UI 角色输入，已验证存在）、相关测试 ≈ 6-8 文件
- 收益：`policy-engine.ts:136` 规则激活；data-lifecycle 默认角色合法化；08 六角色落地；老板（产品第一用户）在权限体系有独立位
- 成本：中等（1 个 PR 量级）；需定义 boss 与各角色权限差异（大概率≈全局只读+报告/推送特权）

**选项 B：改文档（08 六角色→五角色）**
- 涉及：权威08 角色矩阵章节 + 全文档交叉引用（跨文档审计 R8 相关条目）
- 成本：低
- 代价：boss 语义并入 liaison（全局只读）；policy-engine/data-lifecycle 的 3 处 boss 引用成为新的文档-代码不一致，需一并清理或标注预留

**关键判据（供决策）**：老板是否需要与 liaison 不同的推送/制衡特权（D285 targetRoles 已按角色分发，`proactive-push.ts:161-165` critical 推全角色）——若产品叙事中"老板收警报、做取舍"是独立角色行为，选 A；若老板就用 admin 账号，选 B。

### N14：推送去重窗口 5 分钟（代码）vs 30 分钟（任务地图 v2 验收）

**现状物理事实**：
- 代码：`DEDUP_WINDOW_MS = 300_000`（5 分钟，`proactive-push.ts:114`）；去重键 = `finding.id`（`:199-209`），同 key 窗口内跳过
- **关键发现（比窗口大小更重要）**：主要 finding.id 生成器含时间戳——`runner.ts:274` `notif-${signal.id}-${Date.now()}`、`runner.ts:742` `conflict-...-${Date.now()}`、`signal-aggregator.ts:144` `sig_${entity}_${now.getTime()}`——**同一未消解的问题每轮产生新 id → 去重键永不重复 → 无论 5 还是 30 分钟，去重对这几类 finding 都不生效**。唯一可能稳定的：`runner.ts:360` `'sentinel-' + signal.id + '-' + i`（取决于 signal.id 是否稳定）

**业务影响（假设先修复 key 稳定性）**：
- 5 分钟：老板对同一 critical 问题最多每小时收 12 次重复推送（critical 推全角色，`proactive-push.ts:161-165`）→ 提醒强、噪音大、易疲劳
- 30 分钟：每小时最多 2 次 → 噪音小，但持续恶化的问题再提醒慢

**决策路径建议（分析，非决策）**：
1. 前置技术问题（无需决策）：去重键稳定性——若不同意为"缺陷"，5 vs 30 的讨论无意义
2. 窗口取值：若产品定位"老板不被打扰"优先 → 30 分钟；若"重要警报不淹没"优先 → 5 分钟 + critical 升级通道
3. 无论选哪个，任务地图 v2 与代码需同步为同一值

---

## 六、最终偏差清单

### P0（必须修复 — 产品级断裂）

| # | 偏差 | 状态 |
|---|------|------|
| **P0-A1** | **N13 反馈→规则闭环断裂 + 名义通道 placeholder 假成功**（v2 根因加深）：① 消费方 `middle-evolution-engine` 零生产调用；② loop-3/5 名义进化通道是 placeholder（`loop-handlers.ts:4-5,65-78`），每次触发产生伪造的 'completed' 审计记录（`main-agent.ts:182-199`）；③ 写入侧真实（`workspace-data.ts:141,166`）。修复：middle-evolution 接入 loop-3/5 真实执行体（替换 placeholder），端到端跑通 GA 纠错→权重调整→规则更新；接线后复跑黄金数据集。分级：C线 S5-1 P0-block（产品级），部署后首季必暴露 | **v2 故障注入复现确认** |

### P1（建议修复）

> A/B 条目完整字段（文档ID/章节/偏差描述/建议修复）见 v1.1 第二、三节，v2 已逐项复核、判定不变；本表保留关键证据。C 条目为 v2 新增，字段完整。

| # | 偏差 | 关键证据 @7ace35e |
|---|------|------------------|
| P1-A1 | direction-monitor 未接线（权威02 核心）。修复：接入 loop 调度触发链 | src/ 仅自身匹配（7ace35e 复验） |
| P1-A2 | loop-4 无专属处理器 → **被 P1-C2 吸收升级**（fallback 到 placeholder 诊断变体） | `main-agent.ts:270-285` |
| P1-A3 | GA 验证闭环仅 `import type` 引用（比弱引用更弱）。修复：报告确认流程接入 GAFeedbackHandler 实例 | `interactive-card.ts:13`（7ace35e 复验） |
| P1-A4 | 静默升级/回滚未实现（electron-updater 零使用）。修复：接线 electron-updater 或文档降级 | `electron/main.cjs` 零匹配（7ace35e 复验） |
| P1-A5 | 单实例内 orgId 逐表覆盖未验证（跨客户物理隔离已由本地部署保证，P0-7 已定案）。修复：专项审计 + 补 GA 中国墙 | store/growth 抽样 8 文件有 orgId |
| P1-B1 | 控制塔 V5 视图硬编码已废弃 6 专家体系（铁律 9 违规实例）。修复：改从 expert-registry.yaml 动态读取 + 全仓清旧 ID | `agent_health.py:21-28` vs 7 位 registry |
| P1-B2 | gate-status.json 数据源缺失；freshness/CP1 检测存在但被动（最后运行 08-01）。修复：agent-start 纳入演示前 checklist + 自检加主动告警 | `.codex/checkpoints/cp1-dashboard-check.json` |
| P1-B3 | 铁律 36 无全量 vitest 强制点（pre-push 仅 --changed）。修复：CI/pre-push 加全量或文档降级 | `pre-push-check.sh:3-19` |
| P1-B4 | 铁律 37 无 dead code 扫描（实证存活 ≥12 天）。修复：加存量周期扫描或铁律补"增量"限定 | direction-monitor/middle-evolution 仍在仓 |
| P1-B5 | 铁律 9 无传播检查脚本（B1 即后果）。修复：task brief 加"传播清单"必填字段联动组 6 | 12 组无对应项 |
| **P1-C1**（v2 新增） | **铁律 38 声称"as any 代码中零存在"，但组 1 只扫 src/——packages/ 23 个活跃文件共 81 处 as any 无门禁**（`_archived` 占 0；connector-registry、engine-core/pipeline/diagnosis/* 等）。修复：组 1 扫描范围扩至 packages/（预计需先清理 81 处存量），或铁律 38 声称降级为"src/ 零存在" | `pre-commit-check.sh:212` 范围限定 + grep 实测 81/23 文件 |
| **P1-C2**（v2 新增，吸收 P1-A2） | **4 个默认循环处理器全部 placeholder 假成功**（`loop-handlers.ts:29-95`，自承"D9 将替换为真实逻辑"未兑现）：loop-2 导航/loop-4 自检/loop-6 溢出无真实执行体；审计日志显示"completed"但无实际工作。修复：按循环语义实现真实执行体或文档降级"6 循环"声称；连带修正 C线 S5-3/T-2 判定（见 D5） | Read `loop-handlers.ts` 全文 |

### 铁律覆盖核查总表（AGENTS.md 声称 vs 脚本实证 @7ace35e）

| 铁律 | 声称 | 覆盖判定 |
|------|------|---------|
| 38 as any | "代码中零存在" | ⚠️ **src/ 全扫硬阻断（:212-215）+ packages/ 盲区 81 处 → P1-C1** |
| 39 架构边界 / Secrets / Task Brief | 硬阻断 | ✅ 有门禁（组 5/7、组 3+pre-push 终扫、组 6） |
| 0-2/4/5 接线验收 | "硬门禁" | ⚠️ 增量：组 4 含接线深度检测但仅作用 staged/新 export（存量未接线不见） |
| 47/48 契约/测试非空壳 | 硬阻断 | ⚠️ 增量：组 9/组 2 仅作用 staged；存量引擎文件无门禁 |
| 11/24/31 静默降级禁止 | "禁止" | ⚠️ 增量硬阻断（:245-267 空 catch、:275-280 D313 吞错）+ 存量仅警告 |
| 36 全量 vitest | "零失败才合并" | ❌ 无全量强制点 → P1-B3 |
| 37 Dead code | "入仓库即违规" | ❌ 无扫描 → P1-B4 |
| 9 变更全仓传播 | grep 检查所有引用 | ❌ 无脚本（纯自律）→ P1-B5 |
| 34 Feature Branch | "禁止直接在 main 上 commit" | ❌ 无检查（P2，纯自律） |

### 文档修复任务

| # | 文档 | 声称 vs 现实 | 修复 |
|---|------|-------------|------|
| D1 | AGENTS.md:128 | "20哨兵适配器" vs 45 扩展 + 4 内置 | 改口径并全仓同步 |
| D2 | 任务地图 v2 N14 | 30 分钟 vs 5 分钟（**且去重键不稳定为前提缺陷**，见第五节） | 先修 key 稳定性，再定窗口，再同步文档 |
| D3 | AGENTS.md + pre-commit echo | "12 组" vs 编号组 11 个（组 11 并入组 4） | 统一口径或重排编号 |
| D4 | 权威17 V3（07-30） | "19 信号文件/6 专家/依赖图未构建/checkpoints 空" 均已过时 | 演示前产出 V4 |
| D5（v2 新增） | C线第三章 S5-3"知识沉淀 ✅"、T-2"诊断周期 ✅"、A线 B6"循环调度 ✅" | 证据基于"loop-5 接线 evolution handler"，handler 为 placeholder（P1-C2）→ ✅ 失去支撑 | S5-3 改判 ❌/未验证；T-2 限定为"loop-1 真实"；B6 限定为"调度机制真实、5/6 执行体 placeholder" |
| D6（v2 新增，反向偏差） | C线第五章叙事红线 3 + 弹药 5 诚实脚注 | "不宣称黄金数据集自动回归"写于 C-G1 未修时；D300 后 pre-push **确实自动执行 F1 回归**（v2 实跑 10/10 PASS）→ 文档滞后于代码 | 话术可升级为"每次推送自动回归 10 用例 F1"；B线/C线联调确认措辞后修订 |

### 已验证闭环（v2 物理实证，见第二节）

C-G1（门禁实跑 10/10 PASS）、N9、A-G3 —— 全部真实闭环，无虚假闭环。

### 部分闭环（维持 v1.1 改判，机制边界已精确化）

D-G2：引擎已修复（差异化评分）；数据链路未担保——freshness/CP1 为被动记录型检测，最后运行 08-01，当前 gate-status.json 缺失未被任何活动检查捕获。演示前动作：跑 agent-start 回填信号 → 刷快照 → 验证 CP1 置 fail → 考虑给自检加主动告警通道。

### G1–G6 假设终态（供总计划回填）

| 假设 | 终态（v2） |
|------|-----------|
| G1 结论真实性未外部验证 | 维持 ✅ 验证，待客户数据 |
| G2 Agent 自主性未接线 | 维持 ✅ 验证（B-G1/G2/G3 @7ace35e 复核确认） |
| G3 无数据诊断未产品化 | 部分（本次未复核） |
| G4 老板看得懂的交付物缺失 | 部分推翻（本次未复核） |
| G5 进化飞轮未闭合 | 维持 ✅ 验证，且证据加强：N13 断裂 + loop-3/5 placeholder 假成功（P0-A1/P1-C2） |
| G6 自诊断失真 | 改判：引擎级已修复；数据源完整性/新鲜度为被动检测，当前未担保（P1-B2） |

### 不列入项（P2/观察）

B-G3 NCI 零代码（P2）、C-G4 行业模板（P2）、A-G2 双引导（P2）、铁律 34 无分支检查（P2）、cp4 缺失（观察）、D-G3 heartbeat 无运行痕迹（观察）、C-G5 效果待客户数据（观察）。

---

## 七、版本变更日志（v1.1 → v2.0）

| 类型 | 内容 |
|------|------|
| 基线更新 | 验证基线 `407ff1f` → `7ace35e`（3 个新 commit 不影响已验证项） |
| 已闭环验证 | 3 项全部物理实证为真实闭环（C-G1 增加运行实证：10/10 PASS） |
| P0 根因加深 | P0-A1 增加②③层：名义调度通道 placeholder + 假成功审计记录；实验局限性已声明 |
| 改判确认 | 组 11 ✅；D-G2 ✅（机制边界精确化：被动记录型检测，cp1 最后记录 08-01） |
| **改判退回** | 铁律 38"实证全覆盖"→ 修正为"src/ 全覆盖 + packages/ 盲区 23 文件 81 处"，生成新偏差 P1-C1 |
| 新增偏差 | P1-C1（packages/ as any 盲区）、P1-C2（4 默认 handler placeholder 假成功，吸收 P1-A2）、D5（C线 S5-3/T-2、A线 B6 判定修正）、D6（反向偏差：红线 3 话术可升级） |
| 决策材料 | P0-8（3 处 boss 幽灵引用 + 两选项影响面）、N14（去重键不稳定为前置缺陷 + 窗口权衡） |
| 终审补全 | v2 成稿后二次复核：修正 as any 文件数（8+→23）；修正 ③ 环节措辞（临时脚本/日志匹配项）；补回 v1.1 的反向偏差（D6）、G1–G6 假设表、铁律覆盖总表；P0-8 选项 A 的 user-store 表述限定为"若独立定义" |
| 待续 | 跨文档 v3 未决项（P0-1、P0-2/6 闭环核对、28 项 P1 抽查）、C线实测项（T-1/S3-1）、orgId 专项、D-G2 收尾验证 |

---

*第三批验证完成。全部 4 个子任务执行完毕；故障注入实验已做（静态链路追踪，局限性已声明）；无虚假闭环；1 项改判退回修正；P0 保留且根因加深；终审二次复核完成（3 错误修正 + 3 遗漏补全）。*
