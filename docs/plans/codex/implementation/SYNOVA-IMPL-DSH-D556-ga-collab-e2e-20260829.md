---
north-star:
  服务用户: GA——桌面端 GA 协同三块从占位变可操作（校准提交/信号注入/效用可见）；CTO——回流层 2 断裂（S5-2）被真实修复而非再记录一次。
  服务场景: seed GA 身份打开桌面端 → GA 协同面板三块接真实端点 → GA 提交校准/注入信号/看计数 → ≥3 条同类回流自动生成进化动作（D333 管线真实消费）。
  模块终态: GA 人机协同端到端贯通——前端置灰转真实（D551 四端点消费）+ 回流层 2（diagnosis_conclusion 信号 → 进化动作 → agent_memory 审核条目）；层 3（权重自动更新/采纳率）显式不做。
  对齐北星: PRODUCT-BRIEF §二（GA 直接用户）+ §三.1（诊断质量由 GA 校准提升）；K3 战略「护城河=本体被真实数据验证的速率」——本切片是"人类验证数据 → 系统进化"的最后一公里。
  完成标准: （入口）seed GA 打开面板 →（处理）三块调 D551 四端点 + 回流层 2 动作生成 →（结果）UI 断言（占位零残留/三块渲染/计数变化）+ 引擎断言（3 条回流 → 动作生成 + sink 写入）+ 存量零回改。可验证：DS1-DS9（§13）。
  当前进度: D551 后端已合 main（6e9626f9，四端点 L121/239/314/419）；前端 GaDetail 仍占位（RightPanel.tsx L632-640 无 fetch）；回流层 2 白名单缺口实存（middle-evolution-engine.ts L78-107 无 diagnosis_conclusion）；feedback_log CHECK 已扩（L123）+ 消费接线在（loop-handlers.ts L377）。D556 spec 2026-08-29 交付，编码未开始。
---

# SYNOVA-IMPL-DSH-D556: GA 人机协同端到端（前端接线 + 回流层 2）

> 归属: DeepSeek Harness（DSH）· dev doc | 2026-08-29 | slice: `ga-collab-e2e`
> 基线: **origin/main @ 0010eefb**（全部 file:line 锚定此 sha；编码前按 §3.3 抽验——M7 教训）
> 执行方: 🛠 编码 session → K3 → CTO 合并
> 上游: D551 后端（6e9626f9 已合 main，四端点即契约）/ Module-3 蓝图 / D333 进化管线 / 派单 D556
> ⚠️ 对派单的一处行号微校（诚实声明）: 层 2 白名单的具体 filter 行为 L78-79 / L92-93 / L106-107（派单写 L77-119 区间——区间正确，本 spec 引精确行）。

---

## 1. Authority Doc Verification

**权威 ① — D551 spec（已实现并合 main，四端点即前端契约权威）**: `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D551-ga-calibration-backend-20260828.md` §8.2 四端点契约表（POST /api/ga/calibration L121 / GET L239 / POST signals L314 / GET stats L419——main 实测行号一致）+ §6 数据模型（type='ga_calibration'/'manual_signal' + supersedes 版本链）+ §7 回流分层（层 1 已闭环 / 层 2 本单实现 / 层 3 不做）。

**权威 ② — Module-3 蓝图 §3.2.1/§3.3.1**（D551 spec §1 已全文摘录）: 四校准操作 + 信号五要素。

**权威 ③ — D333 诚实性不变量（loop-handlers.ts L367-368 实测）**: 「success:true ⟺ 实际发生回写 (applied > 0)；无信号/零动作/回写失败 → success:false + degraded:true」——层 2 新动作必须经 applyEvolutionActions 计数，不得旁路。

**权威 ④ — AGENTS.md 铁律**: 0-2（接线）/ 24+31（降级诚实——本单 UI 降级渲染的直接依据）/ 38（as any=0）/ 39（五层边界）/ 48（测试非空壳）。

---

## 2. Problem Statement

D551 四端点已合 main，但前端 GaDetail 仍是占位（RightPanel.tsx L632-640，banner 明言"后端校准接口待接入"）——已付后端成本零用户价值。同时回流层 2 断裂实存: GA 校准产生的 diagnosis_conclusion 反馈已进 feedback_log（D551 双写），但 processFeedbackSignals 的信号白名单只认 sentinel_alert/goal/reject_path 三组合（middle-evolution-engine.ts L78-79/L92-93/L106-107 实测），diagnosis_conclusion 信号"进池子、无动作"——S5-2「GA 纠错回流断裂」在新通道上复现。本切片两端并修: 前端接线（置灰转真实）+ 层 2 动作映射（diagnosis_conclusion → 进化动作）。

---

## 3. Q0-Q4

### 3.1 Q0 项目拼图 + 文件审计（origin/main @ 0010eefb 全部实读）

| 文件 | 实测要点 | 与本任务关系 |
|---|---|---|
| electron-renderer/src/components/RightPanel.tsx | L632-640 GaDetail 占位（L635 banner / L636-638 三块）/ L633 组件声明 / L642-648 CAP_DETAIL_VIEW 分派 / L138-150 apiFetch（无认证头） | **重写对象**（容器+展示拆分） |
| electron-renderer/src/stores/capability.ts | L43-45 canAccessCap（cap==='ga' → role==='ga'） | 门控复用（不改） |
| electron-renderer/src/stores/app-store.ts | L8 UserRole='admin'\|'manager'\|'ga'\|'liaison'\|'staff'；L40 userRole；L98 默认 'admin'；L112 setUserRole | **seed 身份落点**（§7） |
| src/routes/ga-calibration.ts | L121 POST calibration / L239 GET calibration / L314 POST signals / L419 GET stats（requireGa 已挂——D551 实现） | **只读契约**(不碰 src/routes/ 目录) |
| src/loops/middle-evolution-engine.ts | L22-27 EvolutionActionType 5 值；L78-79/L92-93/L106-107 白名单三组合（无 diagnosis_conclusion）；L299 MIN_TRIGGER_COUNT=3；L292-297 D273 段 logCorrection→agent_memory sink（applyGoalFormulaTweak L453-455 实测「写入 agent_memory」）；L518-554 applyEvolutionActions（4 case + default skipped） | **层 2 修改对象** |
| src/growth/feedback-collector.ts | L123 target_type CHECK 已含 'diagnosis_conclusion'（D551）；L281-305 getAggregatedSignals（GROUP BY decision,target_type,actor_role，无白名单） | 只读（消费上游） |
| src/agent/loop-handlers.ts | L377 getFeedbackCollector().getAggregatedSignals() → L388 processFeedbackSignals → L399 applyEvolutionActions；L367-368 诚实性不变量 | 回流下游（不改） |
| src/middleware/auth.ts | L366-376 legacy x-synova-token（格式 role:orgId:userId → extractAuth role/userId/orgId，orgId 回退 SYNOVA_ORG_ID）；L259-273 devMode 自动 admin | **seed 身份既有通道**（§7，只读不改——D483 在途） |
| 测试基建 | root package.json 有 react ^18.3.1（L68）**无 react-dom**；electron-renderer deps 有 react-dom ^18.3.5 + zustand ^4.5.0 + react-markdown（renderer node_modules 可解析组件全部 import）；root vitest include tests/**/*.test.ts；tests/loops/ 有引擎测试惯例（ga-correction-feedback.test.ts: 真实 fs + 阈值公式断言 + 「少于 3 次 → skipped」） | UI 断言方案（§8） |
| 在途任务 | D483/D484/D486 = register 认证闭环切片 A/B/E2E（均 spec_done）——auth 流将来提供真实身份 | seed 不耦合（§7.4） |
| setUserRole 生产调用 | **零调用**（grep electron-renderer/src 排除 store 自身）→ 当前恒 admin → GA 项恒置灰 | seed 必要性证据（§7.1） |

### 3.2 Q1 调研（教训）

- **D538 §7.4 descope 反转**: DOM 测试基建当时 descope（"较大基建"）——本单以 **renderToStaticMarkup 桥接**（零新依赖，react-dom/server 从 renderer node_modules 解析）实现真 UI 断言，无需 jsdom/testing-library/package.json 变更（三者均不在写集）。
- **D546/D551 写集教训**: spec-only 提交时文件级写集必漂移——本单写集表按派单指示**文件级**，并预登记提交策略（§3.3.1 注）。
- **S-3**: UI 断言的 render 层测试是生产组件直测（非 mock 管线，铁律 12 精神）；接线以 grep 生产调用点断言。

### 3.3 Q2 范围 + 写集表（文件级——D551 教训：目录粒度被 CI 拦）

**做什么**: ① GaDetail 重写（容器 hooks + GaDetailSections 纯展示拆分）接线四端点；② stores/ga-collab.ts 纯逻辑数据层（状态机/请求构建/响应映射/降级决策/seed 读取）；③ app-store dev seed（localStorage 身份 → userRole 初始化）+ apiFetch 附 legacy 头；④ 层 2: EvolutionActionType 扩 'diagnosis_calibration_review' + processFeedbackSignals 新信号类 + applyDiagnosisCalibrationReview（sink 复用 logCorrection→agent_memory 先例）；⑤ 三层测试（逻辑/UI 渲染/引擎）+ E2E 物理验收。

### 3.3.1 写集 (3 修改 + 5 新建——文件级)

| 文件 | 操作 | 说明 |
|---|---|---|
| electron-renderer/src/components/RightPanel.tsx | 修改 | GaDetail 重写: 容器（role 防御 + canAccessCap 双保险 + fetch 编排）+ GaDetailSections 纯展示组件（props 驱动，供 renderToStaticMarkup 断言）；apiFetch 附 x-synova-token dev 头（seed 存在时，§7.3）；占位文案零残留 |
| electron-renderer/src/stores/app-store.ts | 修改 | boot seed: localStorage 'synova.dev-identity' → userRole 初始化（'ga' 时生效；默认 'admin' 不变，L98 语义保持） |
| src/loops/middle-evolution-engine.ts | 修改 | EvolutionActionType + 'diagnosis_calibration_review'（L22-27）；processFeedbackSignals 新信号类 Signal 5（diagnosis_conclusion × reject/modify/ineffective，count≥3，L77-119 区间内追加）；applyDiagnosisCalibrationReview 新 applier（sink= logCorrection→agent_memory 同款，L453-455 先例）+ applyEvolutionActions 新 case（L525-540） |
| electron-renderer/src/stores/ga-collab.ts | 新建 | 纯逻辑数据层: GaCollabState 状态机（idle/loading/loaded/degraded/blocked）+ buildCalibrationRequest/SignalRequest + mapStatsResponse（诚实 note 透传）+ getSeedIdentity/getSeedToken（localStorage 读取）——零 react/zustand import（node 可测） |
| electron-renderer/src/test-support/render.ts | 新建 | renderToStaticMarkup 桥接（react-dom/server 从 renderer node_modules 解析——root 无 react-dom；仅 tests import，生产 bundle 零影响） |
| tests/ga-collab-logic.test.ts | 新建 | 数据层单测（状态机/降级决策/请求构建/seed） |
| tests/ga-collab-ui.test.ts | 新建 | UI 断言: renderToStaticMarkup(GaDetailSections) 五场景（占位零残留/三块渲染/计数/降级条/role 防御空态） |
| tests/loops/ga-calibration-evolution.test.ts | 新建 | 层 2: 3 条回流 → 动作生成 + sink 写入断言（对齐 ga-correction-feedback.test.ts 惯例：真实 fs + 阈值语义） |

> **提交策略预登记（spec-only 提交的预期漂移）**: 上表 5 个新建文件在 spec 阶段不存在、3 个修改文件在 spec 阶段零 diff——check-dev-doc-write-set 对 spec-only 提交将报 8 条预期漂移（文件级语义的已知代价，派单指示）。**消解方式 = spec 文件随编码首个 commit 同批提交**（届时新建文件已存在、修改文件已入 diff → 全命中零漂移）；若 CTO 需单独先提交 spec，预知 8 条漂移为预期（非事故）。编码执行写集（源码侧）与 D551 已交付面（src/routes/ 与 src/growth/feedback-collector.ts 两个文件）零重叠（§11）。

**不做什么（含文件路径，铁律 Q2 排除项）**:
- ❌ 不碰 src/routes/ 全部文件（ga-calibration.ts 等 D551 交付面只读）
- ❌ 不碰 src/growth/feedback-collector.ts, src/agent/loop-handlers.ts (回流上游已通，只读消费——loop-handlers 的消费函数已调 processFeedbackSignals，新动作零接线改动即生效）
- ❌ 不碰 src/middleware/ 目录（D483 在途——seed 用既有 legacy 通道 auth.ts L366-376，不改 auth）
- ❌ 不碰 scripts/**（治理冻结）、capability.ts (门控复用不改）、App.tsx / electron-renderer/package.json（零新依赖红线——renderToStaticMarkup 方案成立的前提）
- ❌ 不做层 3: 权重自动更新/采纳率/背景卡自动加载/ManualSignal 本体节点（D551 §7.3 层 3 边界延续）
- ❌ 不改 vitest.config.ts / 根 package.json（root vitest include 已覆盖 tests/**；react 已在 root L68）

### 3.4 Q3 验收（入口 → 处理 → 结果）

- **入口**: seed GA 身份（localStorage）打开桌面端 → 左栏 GA 项可点 → GaDetail 三块渲染真实数据。
- **处理**: 校准提交（四动作表单）→ POST /api/ga/calibration → 回显 calibrationId → 列表刷新；信号注入（五要素表单）→ POST signals → 回显 findingId；stats 轮询/刷新 → 计数变化；同类回流 ≥3 → 引擎循环生成进化动作。
- **结果**: UI 断言全过（§8）+ 引擎断言全过（§10 层 2 表）+ evidence/D556/ 落盘。

### 3.5 Q4 契约与测试（铁律 47/48）

契约: D551 §8.2 端点契约（只读消费）+ 本 spec §6 层 2 动作契约（新增，先行定义）。测试三层: 逻辑（node）/ UI 渲染（renderToStaticMarkup）/ 引擎（真实 fs + agent_memory sink 断言）——全 expect 非空壳。

---

## 4. Current State（2026-08-29 实测，origin/main @ 0010eefb）

| # | 事实 | 证据 |
|---|---|---|
| 1 | GaDetail 占位无 fetch，banner「后端校准接口待接入」 | RightPanel.tsx L632-640 逐行实读 |
| 2 | 四端点已合 main 且 requireGa 挂载 | ga-calibration.ts L121/L239/L314/L419 grep 实测 |
| 3 | 回流层 1 已通: CHECK 含 diagnosis_conclusion | feedback-collector.ts L123 |
| 4 | 回流层 2 断裂: 白名单三组合无 diagnosis_conclusion | middle-evolution-engine.ts L78-79/L92-93/L106-107 |
| 5 | 进化消费线在位 | loop-handlers.ts L377/L388/L399 |
| 6 | 新动作 sink 有先例: logCorrection→agent_memory（applyGoalFormulaTweak「写入 agent_memory」） | middle-evolution-engine.ts L292-297/L453-455 |
| 7 | 阈值语义: MIN_TRIGGER_COUNT=3 | middle-evolution-engine.ts L299 |
| 8 | role 恒 admin: setUserRole 生产零调用 | app-store.ts L98/L112 + grep |
| 9 | seed 既有通道: legacy x-synova-token role:orgId:userId | auth.ts L366-376（只读，D483 不耦合） |
| 10 | UI 断言可行性: root 有 react 无 react-dom；renderer 有 react-dom ^18.3.5 + 组件全依赖 | package.json 双侧实测 |

---

## 5. 章 1 · GaDetail 三块端点映射 + 降级渲染（必答 1）

### 5.1 三块 → 端点映射（D551 §8.2 契约只读消费）

| 前端块 | 端点 | 交互 | 渲染 |
|---|---|---|---|
| 🧬 诊断校准面板（L636） | GET /api/ga/calibration?limit=50（列表）+ POST /api/ga/calibration（提交） | 四动作表单（mark_error 必填 errorType 四值+correctedContent / add_context 必填 contextCard / rewrite_logic 必填 originalVersion+rewrittenVersion / demote_signal 必填 sentinelId）→ 201 {calibrationId} 回显 → GET 刷新列表 | 校准条目列表（action/targetType/calibratedAt/supersedes 链头） |
| 📥 手动信号注入（L637） | POST /api/ga/calibration/signals | 五要素表单（signalType 10 枚举/title/description/severity 1-10/confidence 0-100/relatedEdges+relatedNodes 可选）→ 201 {signalId, findingId} 回显 | 注入历史 + 最近回显 |
| 📊 反馈效用仪表（L638） | GET /api/ga/calibration/stats | 刷新按钮 + GaDetail 挂载时拉取 | calibration.total/byAction + injection.total/byType + reflux.feedbackCount/byDecision + **note 字段原文展示**（D551 诚实降级声明透传——采纳率不可得的 UI 显性化） |

### 5.2 role≠ga 降级渲染（fail-closed 双保险）

- 左栏置灰（capability.ts L43-45，不改）= 第一道。
- GaDetail 容器内**防御性复查**: `canAccessCap(userRole,'ga')` 为 false（如 seed 漂移/store 异常）→ 渲染「仅 GA 可见」空态 + **零 fetch**（不发起任何请求）——铁律 31 fail-closed 到 UI。
- 依据: state='blocked'（stores/ga-collab.ts 状态机恒定分支，逻辑层测试覆盖）。

### 5.3 503/网络失败降级 UI（铁律 24/31）

- apiFetch 返回 null（含 503/网络错，RightPanel L138-150 既有语义: `if (!res.ok) return null` + catch console.warn）→ state='degraded' → 渲染 `cap-degraded-banner`「⚠ GA 协同服务降级，稍后重试」+ Empty + 重试按钮（重新 fetch）——零假数据（铁律 8）。
- 每 fetch 必 console.warn（apiFetch L147 已有）+ state 显式标记（新数据层）——禁静默。
- 部分成功（列表 ok、stats 失败）→ 分块独立降级（每块独立 state，不整面板连坐）。

---

## 6. 章 2 · 回流层 2（必答 2）: diagnosis_conclusion × 三决策 → 进化动作

### 6.1 动作映射表（新契约，先行定义——铁律 47）

| 回流组合（getAggregatedSignals 分组键） | 阈值 | 生成动作（EvolutionAction） | sink 落点 | 诚实边界 |
|---|---|---|---|---|
| decision='reject' × diagnosis_conclusion（GA 标记错误） | count≥3（MIN_TRIGGER_COUNT 同源，middle-evolution-engine.ts L299） | {type:'diagnosis_calibration_review', parameter:{decision:'reject', targetIds, sampleCount, hint:'结论块反复被标记错误 → 进人工审核队列'}, confidence:min(count/10,0.9), triggeredAt} | agent_memory 审核条目（logCorrection 同款 sink，L453-455 先例）——key=`ga_calibration_review:${decision}:${targetIdsHash}:${Date.now()}`、type='ga_calibration_review'、tags=['ga_calibration_review',decision] | 审核条目=待办队列，**不自动改诊断逻辑权重**（层 3 不做） |
| decision='modify' × diagnosis_conclusion（GA 重写逻辑） | 同 3 | 同 type，decision:'modify'，hint:'GA 重写版本与 Agent 版本并列 → 审核队列'（蓝图 §3.2.1） | 同上 | 同上 |
| decision='ineffective' × diagnosis_conclusion（GA 降级标记） | 同 3 | 同 type，decision:'ineffective'，hint:'信号相关性降级建议 → 审核队列' | 同上 | 同上 |

### 6.2 实现面（middle-evolution-engine.ts 单文件内闭环）

1. EvolutionActionType（L22-27）+ `'diagnosis_calibration_review'`。
2. processFeedbackSignals（L69+）追加 Signal 5: `signals.filter(s => s.targetType === 'diagnosis_conclusion' && ['reject','modify','ineffective'].includes(s.decision) && s.count >= 3)` → 每组一条动作（getAggregatedSignals 已按 decision,target_type,actor_role 分组——三决策各自成组，实测 L285-291 D551 session）。
3. applyDiagnosisCalibrationReview(action, result): 组装 review 条目 → 复用 logCorrection sink（L292-297 D273 段既有，applyGoalFormulaTweak L453-455 同款调用形态）→ agent_memory 写入；写失败 → log.warn + skipped++（对齐 L541-546 错误语义）。
4. applyEvolutionActions（L525-540）+ `case "diagnosis_calibration_review"`。
5. 诚实性不变量保持（loop-handlers L367-368）: applied/skipped 真实计数——新 case 进计数即兼容，loop-handlers 零改动。
6. **engine 白名单三组合不动**（threshold_adjust/goal_formula_tweak/path_rank_downgrade 语义保持——只追加不修改）。

---

## 7. 章 3 · GA 角色来源 + seed 验收身份（必答 3）

### 7.1 角色来源（file:line）

- 类型: `UserRole = 'admin'|'manager'|'ga'|'liaison'|'staff'`（app-store.ts L8）。
- 状态: `userRole`（L40）默认 `'admin'`（L98）；setter `setUserRole`（L112）——**生产零调用**（grep electron-renderer/src 排除 store 自身为空）→ 当前应用恒 admin → GA 项恒置灰（canAccessCap('admin','ga')=false）。**seed 是让"面板可见"成立的必要条件**，非可选项。

### 7.2 seed 身份设计（不与在途 D483-D486 耦合）

D483/D484/D486（register 认证闭环切片 A/B/E2E，均 spec_done）将来经注册流发真实身份——本单 seed 走**既有 legacy 兼容面**（auth.ts L366-376: `x-synova-token: role:orgId:userId` → extractAuth 完整上下文，orgId 回退 SYNOVA_ORG_ID L374 fail-closed 保留），零 middleware 改动:

1. **身份注入**: localStorage `synova.dev-identity` = `{"role":"ga","orgId":"<org>","userId":"ga-seed-1"}` → app-store boot seed 读它初始化 userRole（'ga' 生效；无 seed → 'admin' 原语义）。
2. **API 身份**: stores/ga-collab.ts getSeedToken() 把 identity 组装为 `ga:${orgId}:${userId}` → RightPanel apiFetch 附 `x-synova-token` 头（仅 seed 存在时附加；无 seed 请求形态与现状完全一致）。
3. **server 侧**: requireGa 经 extractAuthFromRequest legacy 分支（L367-375）拿到 role='ga'/orgId → 四端点全通；actorRole='ga' 进 feedback_log（聚合分组正确）。
4. **验收身份固定值**: `synova.dev-identity = {"role":"ga","orgId":"default","userId":"ga-seed-1"}`（SYNOVA_ORG_ID 未设时 orgId 落 'default' 与 L374 兜底一致）——写入 evidence/D556/seed.md。
5. **生产安全模型不变**: legacy 通道是 auth.ts 既有兼容面（L350 注释「向下兼容旧格式」）；本单不改 auth.ts、不新增授权面；D483-D486 落地后 seed 自然被真实 JWT 替代（seed 仅 localStorage dev 语义）。

---

## 8. 章 4 · Test Requirements — UI 断言方案（renderToStaticMarkup 零新依赖）

**约束推导**: root 有 react 无 react-dom（package.json L68/L80 实测）；electron-renderer/package.json 不在写集（禁新 devDeps）→ jsdom/testing-library 不可用 → **react-dom/server 的 renderToStaticMarkup** 从 renderer node_modules 解析（react-dom ^18.3.5 已在 renderer deps）——经 electron-renderer/src/test-support/render.ts 桥接（tests import 桥接 → react-dom 从 electron-renderer/node_modules 解析 ✓；生产 bundle 零影响——仅 tests import）。

**断言矩阵（tests/ga-collab-ui.test.ts，五场景全 renderToStaticMarkup 字符串断言）**:

| 场景 | props | 断言 |
|---|---|---|
| 占位零残留 | 任意 | 输出**不含**「后端校准接口待接入」（L635 占位文案删除的回归证明） |
| 三块渲染 | state=loaded（空数据） | 含「诊断校准面板」「手动信号注入」「反馈效用仪表」三标题 + 三端点区块结构 |
| 计数变化 | state=loaded, stats={calibration:{total:5},injection:{total:2},reflux:{feedbackCount:3}} | 含 '5'/'2'/'3' 计数渲染 + note 字段文本透传 |
| 降级 UI（503） | state=degraded | 含 cap-degraded-banner 类名 + 降级文案 + 重试按钮 + 零计数假数据 |
| role 防御 | role='admin'（state=blocked） | 含「仅 GA 可见」空态 + 零列表/零表单结构 |

**逻辑层（tests/ga-collab-logic.test.ts，node）**: 状态机迁移（idle→loading→loaded/degraded/blocked）/ 降级决策（503→degraded、403→blocked、部分失败分块独立）/ buildCalibrationRequest 四动作校验规则（mark_error 必填 errorType 等，镜像 D551 服务端校验）/ getSeedIdentity/getSeedToken（localStorage mock）。

**引擎层（tests/loops/ga-calibration-evolution.test.ts，对齐 ga-correction-feedback.test.ts 惯例: 真实 fs + tmp 清理）**: 3 条回流（reject/modify/ineffective 各一组 AggregatedSignal）→ processFeedbackSignals 生成 3 条 'diagnosis_calibration_review' 动作 + 阈值断言（count=2 → 零动作，对齐既有「少于 3 次 → skipped」L93 语义）→ applyEvolutionActions → agent_memory 审核条目存在断言（sink 真实写入）+ applied 计数。

---

## 9. Wiring Verification（接线审计——S-3 测试调用不计）

| 断言 | 命令（编码完成后） | 期望 |
|---|---|---|
| 占位零残留 | grep -n "后端校准接口待接入" electron-renderer/src/components/RightPanel.tsx | 零结果 |
| 三端点生产调用 | grep -n "api/ga/calibration" electron-renderer/src/components/RightPanel.tsx electron-renderer/src/stores/ga-collab.ts | 端点 1/2/4 调用 ≥3 处（ga-collab 构建请求 + RightPanel 编排） |
| 信号端点调用 | grep -n "calibration/signals" electron-renderer/src/stores/ga-collab.ts | ≥1 |
| seed 通道 | grep -n "synova.dev-identity\|x-synova-token" electron-renderer/src/stores/ga-collab.ts electron-renderer/src/components/RightPanel.tsx | 读取 1 + 附头 1 |
| role 防御 | grep -n "canAccessCap" electron-renderer/src/components/RightPanel.tsx | GaDetail 容器内 1（既有分派外新增防御） |
| 层 2 动作类型 | grep -n "diagnosis_calibration_review" src/loops/middle-evolution-engine.ts | ≥3（union + filter + applier/case） |
| 新动作进 apply | grep -n "applyDiagnosisCalibrationReview" src/loops/middle-evolution-engine.ts | 定义 1 + case 1 |
| 存量零回改 | git diff origin/main..HEAD -- src/routes/ src/growth/ src/middleware/ src/agent/loop-handlers.ts electron-renderer/src/stores/capability.ts | 空 |
| 既有白名单不动 | git diff origin/main..HEAD -- src/loops/middle-evolution-engine.ts \| grep -c "sentinel_alert\|'goal'" | 仅上下文行（三既有 filter 语义不变——diff 审阅确认只增不改） |

---

## 10. What We Don't Do（明确排除，含文件路径）

| 不做 | 原因 |
|---|---|
| 碰 src/routes/ 文件（ga-calibration.ts 等） | D551 交付面只读；前端消费发现的契约偏差 → 停手报 CTO（不跨写集修） |
| 碰 src/growth/feedback-collector.ts, src/agent/loop-handlers.ts | 回流上游已通（L123/L377 实测），零改动即消费新信号 |
| 碰 src/middleware/auth.ts | D483-D486 在途；seed 用既有 legacy 通道（L366-376） |
| 碰 capability.ts / App.tsx / electron-renderer/package.json / vitest.config.ts / 根 package.json | 门控复用；零新依赖红线（renderToStaticMarkup 方案成立的前提） |
| 层 3 全部 | 权重自动更新/采纳率/背景卡自动加载/本体节点（D551 §7.3 边界延续；采纳率无数据源） |
| 引擎三既有信号类语义 | 只追加 Signal 5，不改 threshold_adjust/goal_formula_tweak/path_rank_downgrade（D333 管线零回归） |

---

## 11. Architecture Layer

**L1（RightPanel GaDetail + stores/ga-collab.ts）→ HTTP → L1 routes（D551，只读）**；**层 2 在 src/loops 引擎内闭环**（processFeedbackSignals 纯函数 + applyEvolutionActions 既有编排，sink 走 agent_memory 既有通道——applyGoalFormulaTweak 同款）。前端测试桥接（test-support）仅 tests 引用。零新跨层（铁律 39）；架构门禁 Architecture Check 复核。

---

## 12. Auth Doc References

- 派单 D556（四必答/写集/验收原文）
- D551 spec + 实现（6e9626f9）: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D551-ga-calibration-backend-20260828.md + src/routes/ga-calibration.ts (L121/L239/L314/L419 实测）
- Module-3 蓝图 §3.2.1/§3.3.1（校准四操作/信号五要素）
- D333 管线: loop-handlers.ts L360-400（诚实性不变量 L367-368）+ middle-evolution-engine.ts (L22-27/L69/L78-108/L292-300/L453-455/L518-554 实测）
- auth 通道: src/middleware/auth.ts L348-376（legacy token 原文）+ L259-273（devMode）
- 前端锚点: RightPanel.tsx L138-150/L632-648 + capability.ts L43-45 + app-store.ts L8/L40/L98/L112（全部 origin/main @ 0010eefb 实测）
- PRODUCT-BRIEF §二/§三.1；AGENTS.md 铁律 0-2/24/31/38/39/47/48

---

## 13. Completion Standard（DS1-DS9，一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1** 端点映射表/动作映射表/身份方案落 spec（§5/§6/§7）——dev-doc 已完成（本文档）。
2. **DS2** stores/ga-collab.ts 纯逻辑数据层 + tests/ga-collab-logic.test.ts 全绿（状态机/降级/请求构建/seed）。
3. **DS3** GaDetail 重写（容器+GaDetailSections）+ tests/ga-collab-ui.test.ts 五场景 UI 断言全绿（含占位零残留）。
4. **DS4** app-store seed + apiFetch legacy 头注入（seed 存在时生效，无 seed 行为不变）。
5. **DS5** 层 2: EvolutionActionType 扩 + Signal 5 + applyDiagnosisCalibrationReview + applyEvolutionActions case；tests/loops/ga-calibration-evolution.test.ts 全绿（3 条回流 → 3 动作 + sink 写入 + count=2 → 零动作阈值断言）。
6. **DS6** 存量零回改: §9 存量零回改断言 + 三既有信号类 diff 审阅只增不改。
7. **DS7** E2E 物理验收: seed GA → 面板三块可见（UI 断言 + 截图）→ POST 校准回显 calibrationId → 注入信号回显 findingId → stats 计数变化 → evidence/D556/（seed.md + 输出 + 截图）落盘。
8. **DS8** as any=0 + 降级诚实（每 fetch catch console.warn + degraded UI）+ tsc --noEmit 零新增。
9. **DS9** CI 三 job（quality / Vitest 1/2 / Vitest 2/2）全 success 贴结果 + Architecture Check 绿；task-state/D556.json impl 段回填 + slice=ga-collab-e2e + status=impl_done。

---

## 14. 决策参考（S-12）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| UI 断言实现 | A jsdom+testing-library（需 renderer package.json 新 devDeps）/ B renderToStaticMarkup 桥接（零新依赖） | 写集排除 renderer package.json + root 无 react-dom 实测 + D538 descope 教训（基建最小化） | **B**——presentational 拆分 + renderToStaticMarkup 五场景断言；test-support 仅 tests 引用 |
| 层 2 动作粒度 | A 三决策三动作类型 / B 单类型 'diagnosis_calibration_review' + decision 参数 | getAggregatedSignals 已按 decision 分组（L285-291）+ applyEvolutionActions switch 最小扩展 + 防膨胀 | **B**——一个新类型覆盖三组合，parameter.decision 区分 |
| 层 2 sink | A 新建审核队列表/服务 / B agent_memory 复用（logCorrection 先例） | applyGoalFormulaTweak L453-455 同款实测 + 防膨胀（禁第二套机制）+ 引擎层零跨层（既有 import） | **B** |
| seed 身份 | A 等 D483-D486 注册流 / B legacy x-synova-token + localStorage | D483-D486 均未实现（spec_done）+ legacy 通道为 auth.ts 既有兼容面（L350/L366-376）+ 派单明示不耦合 | **B**——dev 语义 seed，生产安全模型零改动 |
| GaDetail 拆分 | A 整组件 hook 内联 / B 容器+纯展示拆分 | renderToStaticMarkup 无 hooks（React 18 renderToStaticMarkup 不执行 effect）+ 可测性 | **B**——GaDetailSections props 驱动 |

> 参考：Anthropic（fail-closed + 最小依赖）+ 第一性原理（已付成本变现的最短路径）+ D333 诚实性不变量。收敛检查：无分歧。

---

## 15. 自检清单

- [x] 派单四必答逐条落章: §5（端点映射+降级渲染）/ §6（进化动作+阈值+落点+诚实边界）/ §7（角色来源 file:line + seed 不耦合 D483）/ §3.3.1（文件级写集 + 提交策略预登记）
- [x] 派单引用行号全部复核并微校（白名单精确行 L78-79/92-93/106-107；占位 L632-640；四端点 L121/239/314/419；CHECK L123；消费 L377——全部 origin/main @ 0010eefb 实读）
- [x] 两处现状增强发现已纳入: setUserRole 生产零调用（seed 必要性证据 L98/L112+grep）；applyGoalFormulaTweak 已有 agent_memory sink 先例（L453-455——层 2 零新机制依据）
- [x] 写集表文件级（D551 教训）+ spec-only 提交 8 条预期漂移预登记 + 消解策略（与编码首 commit 同批）
- [x] 诚实声明: 层 3 descope + 采纳率不可得（stats note 透传）+ 回流收口=动作生成非权重更新
- [x] 零新依赖（root/react-renderer package.json 均不动）+ UI 断言零 jsdom（renderToStaticMarkup 桥接）
- [x] 存量零回改断言（§9）+ 引擎三既有信号类只增不改（DS6）
- [x] 门禁实测（origin/main @ 0010eefb 验证工作树）: dev-doc-gatekeeper **exit 0 ALL PASS**（C3 首跑缺 Test Requirements 标题已修）；C2 路径捕获 perl 模拟——现存路径全 OK，5 项预期 MISS 全为 renderer 前缀剥前缀盲区类（同 D546 登记）；check-dev-doc-write-set exit 1 = **恰好 8 条预登记漂移零意外**（3 修改零 diff + 5 新建不存在——文件级语义 spec 阶段必然态，派单指示；编码首 commit 后归零，见 §3.3.1 提交策略）
- [x] 自复核修正记录: applyGoalFormulaTweak sink 行号 sed 相对编号陷阱（L443-446 → L453-455，8 处）；两处 prose 路径捕获污染（全角括号/`**` 通配）
- [x] 本 spec 零代码写入；不用 --no-verify
