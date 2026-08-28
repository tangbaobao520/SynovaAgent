---
north-star:
  服务用户: GA（质量守门人/信号侦察兵/训练数据提供者——Module-3 蓝图 §3.1 三角色）+ 企业主（诊断被 GA 校准后更贴近商业现实）；左栏 GA 项现在置灰、GA 协同三块是占位——本 spec 让"GA 人机协同"从蓝图与占位变成可执行后端。
  服务场景: GA 在桌面端 GA 协同面板：①对 Agent 诊断结论做校准（标记错误/补充背景/重写逻辑/降级标记）；②把线下拜访/电话中的"黑域"信息手动注入为信号；③在效用仪表看到自己的贡献计数。
  模块终态: /api/ga/calibration 端点族（校准 CRUD + 手动信号注入 + 效用统计）落地，校准数据单源 AgentMemoryStore、回流单源 D333 feedback_log 通道、注入信号复用 D394 哨兵事件流——零第二套机制；前端 GaDetail 占位（"后端校准接口待接入"）由后续前端切片接线转真实数据。
  对齐北星: PRODUCT-BRIEF §三.1（FDE/GA 按需诊断——校准直接作用于诊断质量）+ §二（GA 是直接用户）；K3 战略「护城河=本体被真实数据验证的速率」（校准=人类验证数据的入口）；Module-3 蓝图（权威文档05，2026-07-10）为设计源头。
  完成标准: （入口）GA 在桌面端调用 /api/ga/calibration 族 →（处理）requireGa 认证 + AgentMemoryStore 单源落库 + feedback_log 回流 + 哨兵事件流注入 →（结果）校准/注入可查、聚合信号可见、stats 可读。可验证：DS1-DS8（§13）。**实现排部署后**（派单口径）。
  当前进度: 左栏 GA 项 canAccessCap 置灰（capability.ts L43-46）+ GaDetail 三块占位（RightPanel.tsx L632-640，注释明言"后端校准接口不存在→不伪造"）；GA 面已有 4 路由文件（admin/corrections/annotations/标注 stats）；D333 进化闭环已真实化（6279f451）——回流可对接真实通道。本 spec 2026-08-28 交付，编码会话尚未开始。
---

# SYNOVA-IMPL-DSH-D551: GA 校准后端（诊断校准/手动信号注入/反馈效用仪表）

> 归属: DeepSeek Harness（DSH）· dev doc | 2026-08-28 | slice: `ga-module-3` | 实现排部署后
> 基线: **origin/main @ 434d7211**（全部 file:line 锚定此 sha；编码前按 §3.3 抽验防漂移——M7 教训）
> 执行方: 🛠 编码 session（实现排部署后）→ K3 → CTO 合并；本 dev doc 阶段写集 = 本 spec 文件本身（src/ 与 electron-renderer/ 只读核实）
> 上游: 派单 D551 / Module-3 蓝图（权威文档05）/ D476（GA 范围权威，O7/O8 已收口）/ D333（N13 进化闭环已真实化）/ D338（中国墙）
> ⚠️ 两处现状更正（相对派单表述，诚实声明）: ①「N13（D333 在做）」——实测 **D333 已落地 main**（6279f451「N13 进化闭环接线 — loop-3/5 真实化」，loop-handlers.ts L360-400 真实进化链），回流结论因此从"记录待用"升级为"对接既有真实通道"（§7）；②左栏置灰的前端契约文件 capability.ts **已在 main**（D544 已合并），不再依赖分支。

---

## 1. Authority Doc Verification

**权威 ① — Module-3 蓝图 §3.2.1 诊断校准面板四操作（原文摘录，docs/synova/research/权威文档05-Agent主动交互系统蓝图-20260710/SYNOVA-RESEARCH-Module-3-GA人机协同与反馈闭环-20260710.html）**:

> **标记为错误**: GA选中Agent的一段诊断结论……标记为"错误"。弹出窗口：选择错误类型（"事实错误"/"归因错误"/"遗漏关键信息"/"过于笼统"）+ 填写正确信息或补充说明 → 形成一条带标注的训练样本 → 进入联邦进化引擎的规则审核队列 → GA的反馈即时效用计数器+1。
> **补充背景信息**: GA在诊断结论旁添加"背景卡片"……写入该客户的上下文存储（持久化，下次诊断自动加载）→ 如果同类客户≥3，触发"此背景可能需要作为通用信号字段"的提案。
> **重写诊断逻辑**: GA的重写版本与Agent原版本并列存储 → 触发"联邦学习样本"……审核通过后更新诊断逻辑权重。
> **降级标记**: GA可以将某个哨兵的信号标记为"对此客户不相关"……写入该客户的企业画像配置 → 该哨兵对此客户的权重降低（不彻底禁用，保留意外发现的可能）。

**权威 ② — Module-3 蓝图 §3.3.1 手动信号五要素（原文摘录）**:

> 信号类型 枚举（预置10种）："人员变动"/"战略转向"/"竞品动态"/"客户反馈"/"监管变化"/"供应商变化"/"市场传闻"/"技术突破"/"内部冲突"/"其他" | 关联42边 多选（E-15（人力配置）/ E-38（人才留存）——如果信号是"该客户CTO离职"） | 关联节点 多选 | 严重度 1-10 | 置信度 0-100%。

**权威 ③ — Module-3 蓝图 §3.3.2 注入反应链（原文摘录）**: 「GA注入手动信号 → 写入本体层（作为ManualSignal节点，data_source="GA_MANUAL"）→ 哨兵注册表检查……触发这些哨兵的重新评估 → 如果哨兵评估结果超过阈值 → 信号进入SignalAggregator → 排序器 → 可能触发主动触达」。

**权威 ④ — D476（GA 范围权威，docs/plans/codex/implementation/SYNOVA-IMPL-D476-ga-enterprise-scope-20260823.md）**: auth.orgId 权威（fail-closed，跨租户 body/query 声明 → 403）；ga-corrections/ga-annotations D338 已交付形态 = 401 UNAUTHORIZED / 400 ORG_REQUIRED / 403 FORBIDDEN（§1 权威引用 + §3.2.1）。

**权威 ⑤ — AGENTS.md 铁律**: 0-2（接线）/ 24+31（降级诚实）/ 32（错误分类）/ 38（as any=0）/ 39（五层边界）/ 47（契约优先）/ 48（测试非空壳）。

---

## 2. Problem Statement

Module-3 蓝图定义了 GA 人机协同的三大后端能力（诊断校准/手动信号注入/反馈效用），但 main 上三者皆无: 左栏 GA 项被 canAccessCap 置灰（capability.ts L43-46），GA 协同详情是结构占位（RightPanel.tsx L632-640，占位注释自己写明"后端校准接口不存在 → 不伪造、不发 fetch"）。同时 GA 反馈的素材与通道已齐备: 标注路由（ga-annotations，T9 精度基线消费）、纠错路由（ga-corrections）、D333 真实化的 feedback_log 进化管线（loop-handlers L360-400）。本 spec 的任务不是发明新机制，而是把三块校准能力**接到这些既有单源通道上**: 存储单源 AgentMemoryStore、回流单源 feedback_log、注入单源 sentinel_events——这也是防膨胀红线（"回流禁设计第二套进化机制"）的直接落地。

---

## 3. Q0-Q4

### 3.1 Q0 项目拼图 + 文件审计（origin/main @ 434d7211 全部实读）

| 文件 | 实测要点 | 与本任务关系 |
|---|---|---|
| src/routes/ga-admin.ts ( 147 行) | L36 enterpriseStore 内存 Map；L66 GET clients（ga\|admin）；L88 POST clients（ga）；L125 POST switch/:orgId（ga） | 上下文（客户/组织选择） |
| src/routes/ga-annotations.ts ( 285 行) | requireGa L44-60（401/400 ORG_REQUIRED/403）；POST L70（findingId + annotation 四值 L82 + correctionNote ≤2000 L96）→ store.remember type='sentinel_annotation' L119 tags L122；GET L147（tags 过滤 + findingId 二次筛选 L174-181 + 分页 limit≤200 L156）；stats L221（bySentinel + computeSentinelAccuracy L260 + overall L268-277）；append-only 设计原则 L8 | **复用评估主对象**（§5 边界） |
| src/routes/ga-corrections.ts ( 57 行) | requireGa L14-21 同款；POST /api/ga/corrections L23 → remember（key=ga_correction:${reportId}:${Date.now()} L32）报告级纠错 | 复用评估对象（对象=报告级） |
| src/l3/ga-collaboration.ts | GAFeedbackHandler L56；setFeedbackCollector L62 **生产零调用**（grep 全 src/ 仅定义处）→ feedbackCollector null → recordCorrection L213-217 返回 'unrecorded' 降级 | 现状死链证据（§7） |
| src/growth/feedback-collector.ts ( D93) | FeedbackDecision 4 值 L26；FeedbackTargetType 3 值 L29；MiddleFeedbackInput L32-50；FEEDBACK_DDL L112-135（feedback_log decision CHECK L117 / target_type CHECK L118 / schema_version 迁移先例 L128-130）；collectFeedback L162（INSERT L184）；getAggregatedSignals(threshold=3) L281-305（GROUP BY decision,target_type,actor_role，**无 targetType 白名单**）；getFeedbackCollector() 单例 L314 | 回流通道（§7） |
| src/agent/loop-handlers.ts | L360-400 defaultEvolutionHandler（D333 真实化）: L377 getFeedbackCollector().getAggregatedSignals() → L388 processFeedbackSignals → L399 applyEvolutionActions；诚实性不变量 L367-368（success:true ⟺ applied>0） | 回流下游（§7 依赖） |
| src/loops/middle-evolution-engine.ts | processFeedbackSignals L69；信号过滤**按 targetType 白名单硬编码**: L78-79（reject+sentinel_alert）/ L92-93（modify+goal）/ L106-107（reject_path）；L371 source:"ga_correction" 概念已存在 | 回流层 2 边界（§7.3） |
| src/agent/sentinel-service.ts | L13 import getGlobalSentinelRunner；L79/126/177 服务函数经全局单例访问 runner；L1 routes 通过此服务访问（L6 注释） | 注入信号的 L2 路径（§6.2） |
| src/sentinel/runner.ts | L713-739 persistRunEvents（D394 片1 事件写入口）+ L742-747 projectRunRecord + L753 rebuildFromEvents；L1080-1081 executeSentinel duration | 注入落点（§6.2） |
| src/server.ts | GA 族挂载: L316 gaDiagnosisRoutes / L326 gaEvolutionRoutes / L346 gaAdminRoutes / L348 gaCorrectionsRoutes / L349 gaAnnotationsRoutes（import L61-63） | 新路由挂载模式（§9） |
| electron-renderer/src/stores/capability.ts | L43-46 canAccessCap（cap==='ga' → role==='ga'，fail-closed） | 前端契约（§8.3） |
| electron-renderer/src/components/RightPanel.tsx | L632-640 GaDetail 三块占位（L635 banner / L636 诊断校准面板+动作括号「标记错误/补背景/重写逻辑/降级标记」/ L637 手动信号注入 / L638 反馈效用仪表「纠错/信号/采纳率」） | 前端契约锚点（§8.3） |
| tests/routes/ga-annotations.test.ts | 用例内 `await import('../../src/routes/ga-annotations')` 动态导入路由模块断言（L15/22/27/32/37）；tests/routes/ 已有 ga-diagnosis/ga-enterprise/ga-evolution + tests/l3/ga-collaboration.test.ts | 测试惯例（§10） |

### 3.2 Q1 调研（memory/教训）

- **D487 教训（session_events CHECK 漏扩）**: 扩枚举必须同步 DDL CHECK，否则 INSERT 失败——本任务扩 feedback_log target_type 同款风险（§6.3 migration 设计）。
- **D476 教训（'default' 硬编码 + 跨租户 body 覆盖）**: org 上下文唯一权威 = auth.orgId，fail-closed（§8 契约全端点沿用）。
- **S-14 无重复造轮子**: ga-collaboration L220 collectFeedback 是死链（collector null）——新回流必须接 **getFeedbackCollector() 活单例**（loop-handlers L377 同源），不得复制死链模式。
- **D540/D316**: 验收贴 CI 实测 + 声称即证据。

### 3.3 Q2 范围（做什么 / 不做什么）

**做什么**: ① /api/ga/calibration 端点族（校准提交/查询/统计 + 手动信号注入）+ ga-auth.ts 共享 requireGa 提取；② 校准数据模型（AgentMemoryStore type='ga_calibration'/'manual_signal'，append-only + supersedes 版本链）；③ 回流双写（feedback_log target_type 扩 'diagnosis_conclusion' + schema_version 迁移）；④ 注入信号进哨兵事件流（sentinel-service 新 export + runner 新方法）；⑤ 测试 + 接线。

**dev-doc 阶段写集（本派单口径）**: 仅本 spec 文件（docs/plans/codex/implementation/）；src/ 与 electron-renderer/ 只读核实。

**编码阶段写集（spec 定义，目录粒度——文件级明细在说明列）**:

### 3.3.1 写集 (0 修改 + 0 新建——本 spec 零代码写入；编码执行写集 = 6 目录，文件级明细见说明列)

| 文件 | 操作 | 说明 |
|---|---|---|
| src/routes/ | 新建×2 + 挂载 | ga-calibration.ts (端点族，§8) + ga-auth.ts (requireGa 从 ga-annotations.ts L44-60 模式提取共享，存量三路由不回改) + src/server.ts 挂载一行（对齐 L346-349 模式） |
| src/agent/ | 修改 | sentinel-service.ts + injectManualSignal（§6.2，对齐 L79 getGlobalSentinelRunner 模式） |
| src/sentinel/ | 修改 | runner.ts + injectManualFinding 公开方法（内部调 persistRunEvents L713 + projectRunRecord L742，I2 单源不旁路） |
| src/growth/ | 修改 | feedback-collector.ts target_type CHECK 扩 'diagnosis_conclusion'（L118）+ schema_version 迁移 'd551_target_type'（先例 L128-130） |
| src/loops/ | 预计零改动 | processFeedbackSignals 白名单不改（回流层 2 descope——§7.3 诚实标注） |
| tests/ | 新建×2 | tests/routes/ga-calibration.test.ts (遵循 ga-annotations.test.ts 动态导入惯例) + tests/sentinel/ga-manual-injection.test.ts (对齐 sentinel-events.test.ts 惯例) |

**不做什么（含文件路径，铁律 Q2 排除项）**:
- ❌ 不回改存量 GA 路由（ga-annotations/ga-corrections/ga-admin——已 audited，提取共享仅向前用）
- ❌ 不改 src/loops/middle-evolution-engine.ts (回流层 2 descope，§7.3)
- ❌ 不碰 electron-renderer/（前端消费=后续切片，本 spec 只交契约——§8.3）
- ❌ 不碰 scripts/audit/、scripts/pre-commit-check.sh、.github/workflows/ci.yml
- ❌ 不建第二套进化机制（feedback_log 单源回流——派单红线）；不做 GA AI 副驾（蓝图 §3.4，非本单三块）
- ❌ 不做蓝图下游消费端: 背景卡自动加载进诊断（上下文存储消费）/诊断逻辑权重自动更新/哨兵权重降级执行/ManualSignal 本体节点写入/定向触发哨兵重新评估（§7.3 诚实分层）
- ❌ 不做"采纳率"指标（蓝图 §3.4「系统自动评估：纠错的采纳率」——现系统无采纳判定数据源，诚实降级为"回流计数"，§8.2）

### 3.4 Q3 验收（入口 → 处理 → 结果）

- **入口**: GA 认证请求打 /api/ga/calibration 族。
- **处理**: requireGa（401/400/403 fail-closed）→ 校准/注入落 AgentMemoryStore（单源）→ 回流双写 feedback_log（D333 通道）→ 注入落 sentinel_events + 投影（D394 通道）。
- **结果**: 校准/注入可查（GET）+ 聚合信号含 diagnosis_conclusion 组（getAggregatedSignals(1) 可见）+ stats 可读 + GET /api/sentinel/findings 含注入 finding。

### 3.5 Q4 契约与测试（铁律 47/48）

新契约在 §8（API）与 §6（数据模型）先行定义；测试 = 契约测试 + 回流集成断言（写→双写→聚合可见）+ 注入断言（事件行 + 投影 + findings 可见）+ 故障注入 red（未认证/跨租户/枚举外值/版本链断裂）。全用例 expect 非空壳（铁律 48）。

---

## 4. Current State（2026-08-28 实测，origin/main @ 434d7211）

### 4.1 校准对象域边界（复用评估的事实基础）

| 维度 | 现有 annotations（ga-annotations.ts） | 本任务校准（Module-3 §3.2） | 判定 |
|---|---|---|---|
| 对象 | 哨兵 finding（findingId L74） | Agent 诊断结论/背景/诊断逻辑/信号相关性 | **不同对象域** |
| 动作值域 | confirmed/false_alarm/uncertain/correction（L82 四值） | 标记错误/补充背景/重写逻辑/降级标记（蓝图 §3.2.1） | **不同动作集** |
| 消费方 | T9 哨兵精度基线（stats L219 注释 + computeSentinelAccuracy L260） | 校准回流（feedback_log → D333 进化管线） | **不同消费方** |
| 存储/认证/append-only | AgentMemoryStore remember/list + requireGa + L8 不可覆盖原则 | 相同 | **通道复用**（§5） |

### 4.2 回流通道现状（D333 真实化后的活链与死链）

| 链路 | 状态 | 证据 |
|---|---|---|
| feedback_log ← workspace-data.ts ( 3 处 collectFeedback) | **活**（L1 路由直写） | src/routes/workspace-data.ts L141/166/191 |
| feedback_log ← interactive-card handleDismiss | 存疑（依赖注入参数） | src/agent/interactive-card.ts L267-277 |
| ga-collaboration → collectFeedback | **死链**（setFeedbackCollector 生产零调用 → null → 'unrecorded'） | ga-collaboration.ts L62/L213-217 + grep 全 src/ 仅定义 |
| 进化循环消费 | **活**（D333 真实化） | loop-handlers.ts L377/L388/L399 + 诚实性不变量 L367-368 |
| getAggregatedSignals 聚合 | 无 targetType 白名单（GROUP BY 全量） | feedback-collector.ts L285-291 |

### 4.3 前端契约现状

- 左栏 GA 项: canAccessCap(role,'ga')（capability.ts L43-46）→ 非 ga 置灰（D544 决策: 置灰=访问控制）。
- GaDetail: RightPanel.tsx L632-640 占位，L632 注释「后端校准接口不存在 → 不伪造、不发 fetch · 铁律 8」——接口就绪后由前端切片接线（D544 领地，本单只交契约）。

---

## 5. 章 1 · 复用评估（三块逐块: 扩展什么 / 新建什么 / 边界）

| 块 | 结论 | 复用（证据） | 新建（理由） |
|---|---|---|---|
| 诊断校准面板 | **新建端点 + 复用存储与认证通道** | AgentMemoryStore remember/list（ga-annotations L101-124/L166-171 同款）；requireGa 模式（L44-60）；append-only 不可覆盖原则（L8） | 端点族 /api/ga/calibration——对象域不同（§4.1: finding vs 诊断结论），动作集不同（四值 vs 四操作），消费方不同（T9 vs 回流）；混入 /api/ga/annotations 会破坏 T9 stats 语义 |
| 手动信号注入 | **新建端点 + 复用哨兵事件流** | appendSentinelEvent + persistRunEvents/projectRunRecord（runner.ts L713/L742——D394 片1 I2 单源）；sentinel-service 全局单例模式（L79） | POST /api/ga/calibration/signals——注入是"合成 finding 进哨兵管线"，不存在可扩展现有端点 |
| 反馈效用仪表 | **新建 stats 端点 + 只读复用两单源** | 数据源 A: 校准/注入条目（AgentMemoryStore，type 过滤同 L166-171 tags 模式）；数据源 B: feedback_log（只读 SQL，actor_role='ga' 聚合） | GET /api/ga/calibration/stats——annotations stats L221-283 是 finding 精度专用（computeSentinelAccuracy），效用=贡献计数+回流计数，聚合维度不同 |
| 共享 requireGa | **提取共享模块** | ga-annotations L44-60 逻辑原样 | src/routes/ga-auth.ts 新文件；存量三路由不回改（已 audited），第四份复制不产生（防膨胀: 一次提取止住继续复制） |

> **标注 vs 校准边界（派单要求的明确划线）**: annotations 管"哨兵 finding 质量"（T9 精度基线的训练数据）；calibration 管"Agent 诊断结论的人机对齐"（Module-3 回流数据）。两者共用 AgentMemoryStore 存储通道与 requireGa 认证，**端点、type、值域、消费方互不重叠**——type='sentinel_annotation' vs 'ga_calibration'/'manual_signal' 在 store 层天然隔离（tags 过滤）。

---

## 6. 章 2 · 校准数据模型（schema / 版本链 / 信号注入 schema）

### 6.1 校准条目（AgentMemoryStore，append-only，type='ga_calibration'）

```
key:    `ga_calibration:${targetType}:${targetId}:${Date.now()}`        # 对齐 ga-corrections L32 key 形态
value:  {
  targetType: 'diagnosis_conclusion' | 'diagnosis_logic' | 'signal_relevance',
  targetId: string,                    # 诊断结论 id / 逻辑块 id / findingId（降级标记对象）
  action: 'mark_error' | 'add_context' | 'rewrite_logic' | 'demote_signal',
  errorType?: '事实错误'|'归因错误'|'遗漏关键信息'|'过于笼统',   # mark_error 必填（蓝图 §3.2.1 四值）
  correctedContent?: string,           # mark_error 的正确信息/补充说明
  contextCard?: string,                # add_context 的背景卡片
  originalVersion?: string,            # rewrite_logic: Agent 原版本（并列存储）
  rewrittenVersion?: string,           # rewrite_logic: GA 版本
  sentinelId?: string,                 # demote_signal: 目标哨兵
  supersedes?: string | null,          # 版本链: 被本条取代的先前校准 entry id；null=首版
  gaId: string, orgId: string, calibratedAt: string(ISO 8601)
}
type:   'ga_calibration'
tags:   ['ga_calibration', targetType, targetId, action]              # 对齐 annotations L122 tags 过滤模式
source: `ga:${gaId}`；confidence: 1.0（GA 人工判定）
```

**版本链语义**: append-only（annotations L8 原则延伸）——每次校准新增条目；同一 target 的最新有效版本 = 未被任何后续条目 supersedes 引用的条目；查询按 tags 定位 + 按 supersedes 链回溯（GET 端点返回 latest 链头 + 可选 `?includeChain=1` 全链）。不引入独立版本表（防膨胀；AgentMemoryStore 单源）。

### 6.2 手动信号注入（type='manual_signal' + 哨兵事件流双落）

```
POST /api/ga/calibration/signals 请求体（蓝图 §3.3.1 五要素）:
  signalType: '人员变动'|'战略转向'|'竞品动态'|'客户反馈'|'监管变化'|'供应商变化'|'市场传闻'|'技术突破'|'内部冲突'|'其他',
  title: string, description: string,
  severity: number(1-10), confidence: number(0-100),
  relatedEdges?: string[], relatedNodes?: string[],     # 蓝图"关联42边/关联节点"多选；本 spec 以载荷承载，不写 L4 本体节点（§7.3 诚实分层）
响应: { ok: true, signalId(entry.id), findingId }
```

**落点（零旁路，D394 事件流单源）**: 路由 → sentinel-service.injectManualSignal()（新 export，模式对齐 L79）→ runner.injectManualFinding()（新公开方法）→ 内部组装 SentinelRunRecord（sentinelId='ga-manual'，sentinelName='GA 手动信号注入'，findings=[合成 SentinelFinding{source 字段载 GA_MANUAL 元数据}]）→ persistRunEvents（L713，finding 事件落 sentinel_events）+ projectRunRecord（L742，投影）→ GET /api/sentinel/findings（routes/sentinel.ts L27→sentinel-service L85）立即可见 + 下轮信号聚合自然消费（runner.ts L433-434 aggregateSignals 既有路径——蓝图 §3.3.2 反应链第 1、3 步落地；第 2 步"定向触发重新评估"诚实 descope——§7.3）。

### 6.3 feedback_log target_type 枚举扩展（回流写入前提）

- FeedbackTargetType（feedback-collector.ts L29）: + `'diagnosis_conclusion'`。
- DDL: FEEDBACK_DDL 内 target_type CHECK（L118）扩新值 **+ migration**（CREATE TABLE IF NOT EXISTS 不会改已存在表——SQLite 无法 ALTER CHECK）: 重建表迁移（CREATE feedback_log_new → INSERT SELECT 复制 → DROP → RENAME）+ `INSERT OR IGNORE INTO schema_version VALUES ('d551_target_type')`（机制先例 L128-130 'd93b_actor_role'）+ 启动时按 schema_version 判定执行一次。MiddleFeedbackInput 类型同步（L32-50）。
- getAggregatedSignals（L281-305）**无需改**（GROUP BY 无白名单，实测 L285-291）——新 target 自动进聚合池。

---

## 7. 章 3 · 回流机制（与 D333 的关系——诚实分层，不假装闭环）

### 7.1 结论

**与 D333 共用 feedback_log 单源通道（不建第二套进化机制）**。D333 已真实化（6279f451，loop-handlers L360-400 真实进化链 + 诚实性不变量 L367-368），且回流通道的活写入方与活消费方均已实测（§4.2）。校准提交时**双写**: ① AgentMemoryStore 主存（§6.1，校准面板查询源）；② getFeedbackCollector().collectFeedback()（活单例 L314——非 ga-collaboration 死链）映射: mark_error → decision='reject'、rewrite_logic → decision='modify'、demote_signal → decision='ineffective'、add_context → 不写 feedback_log（背景卡是上下文增强，非纠错信号——蓝图数据流转为"上下文存储+提案"，本 spec 只落存储）；targetType='diagnosis_conclusion'、targetId=targetId、actorRole='ga'、evidenceRefs=[校准 entry id]（互链）。

### 7.2 回流的诚实终点（派单交付要求 #3）

| 层 | 范围 | 状态 |
|---|---|---|
| 层 1（本 spec 实现） | 校准 → feedback_log（新 target_type）→ getAggregatedSignals 聚合可见（GROUP BY 无白名单，L285-291 实测） | ✅ 闭环 |
| 层 2（显式 descope） | processFeedbackSignals 对 diagnosis_conclusion 生成进化动作——**engine 按 targetType 白名单硬编码**（middle-evolution-engine.ts L78-79 reject+sentinel_alert / L92-93 modify+goal / L106-107 reject_path），扩动作类型需同步 applyEvolutionActions（D273 回写）+ EvolutionActionType 枚举——超出本单防膨胀边界 | ⏸ 显式依赖: 后续任务"校准→进化动作映射"（本 spec 只保证信号进池可查，不假装动作已生成） |
| 层 3（蓝图下游，全部不做） | 背景卡自动加载进下次诊断 / 诊断逻辑权重自动更新（蓝图"审核通过后更新"）/ 哨兵权重降级执行 / ManualSignal 本体节点（L4）/ 定向触发哨兵重新评估 / GA AI 副驾 | ⏸ 各自依赖 L4 本体线、画像模块、审核队列——蓝图理想态，本单诚实不做 |

### 7.3 手动信号注入的反应链诚实分层

蓝图 §3.3.2 四步: ①写入系统（✅ 本 spec: 事件流+投影+memory）；②定向触发哨兵重新评估（⏸ 本 spec 不做——注入 finding 经常规 cron/聚合管线流动，即时触发属后续）；③进 SignalAggregator/排序器（✅ 自然发生——注入 finding 进 records 后下轮 aggregateSignals 消费，runner.ts L439-451 既有路径）；④GA 即时反馈文案（⏸ 前端切片）。

---

## 8. 章 4 · 前端契约（左栏 GA 置灰转真实数据的 API 契约，完整可执行）

### 8.1 认证（全端点统一，requireGa 提取自 ga-annotations L44-60 模式）

| 失败 | 码 | 条件 |
|---|---|---|
| 401 | UNAUTHORIZED | extractAuthFromRequest 无 auth |
| 400 | ORG_REQUIRED | auth.orgId 缺失（D338 中国墙 fail-closed） |
| 403 | FORBIDDEN | role ∉ {ga, admin} |
| 500 | INTERNAL_ERROR | store 异常，响应体含 degraded: true（铁律 24/31） |

### 8.2 端点契约表

| # | 端点 | 请求 | 响应 | 对应前端块 |
|---|---|---|---|---|
| 1 | POST /api/ga/calibration | {targetType, targetId, action, errorType?, correctedContent?, contextCard?, originalVersion?, rewrittenVersion?, sentinelId?, supersedes?}（§6.1 校验: mark_error 必填 errorType+correctedContent；rewrite_logic 必填 originalVersion+rewrittenVersion；demote_signal 必填 sentinelId；supersedes 存在须指向同 targetType+targetId 条目，否则 400 CHAIN_ERROR） | 201 {ok:true, calibrationId, supersedes} | RightPanel L636 诊断校准面板（四动作括号） |
| 2 | GET /api/ga/calibration?targetType=&targetId=&action=&limit(≤200,默认50)&offset(默认0)&includeChain=0 | — | {ok, calibrations:[{calibrationId, targetType, targetId, action, ..., gaId, calibratedAt, supersededBy?}], total} | 同上面板列表 |
| 3 | POST /api/ga/calibration/signals | {signalType(10 枚举), title, description, severity(1-10), confidence(0-100), relatedEdges?, relatedNodes?}（枚举外/越界 → 400 VALIDATION_ERROR） | 201 {ok:true, signalId, findingId}（findingId=哨兵事件聚合键，可在 /api/sentinel/findings 查） | L637 手动信号注入 |
| 4 | GET /api/ga/calibration/stats | — | {ok, calibration:{total, byAction:{mark_error,add_context,rewrite_logic,demote_signal}}, injection:{total, byType:{...10 枚举}}, reflux:{feedbackCount(ga 角色回流行数), byDecision:{reject,modify,ineffective}}, note:'回流计数 ≠ 采纳率——采纳判定数据源不存在（§3.3 排除），指标诚实降级'} | L638 反馈效用仪表（蓝图 §3.4「纠错/信号/采纳率」→ 采纳率诚实降级为回流计数） |

> 端点 2 的 supersededBy = 反向索引（后续条目 supersedes 指向它即被取代）；includeChain=1 时按链返回全版本数组（按 calibratedAt 升序）。

### 8.3 置灰转真实数据的接线语义（供后续前端切片，本单不实现）

- 左栏置灰不变: canAccessCap(role,'ga')（capability.ts L43-46）只放行 ga 角色——UI 可见性与 API 层 ga|admin 的差异 = D544 既有决策（置灰=访问控制），不改。
- GaDetail（RightPanel L633-640）接线时: L635 banner 删除、三块改 fetch 端点 2/3/4（apiFetch + getApiBase，RightPanel L138-150 既有模式）+ 降级提示条（cap-degraded-banner，铁律 31）——占位注释 L632「不伪造」原则保持（接口未就绪前不接）。
- 分页/筛选语义: 与 GET /api/ga/annotations（L147-206）一致，前端零新概念。

---

## 9. Wiring Verification（接线审计——S-3 测试调用不计）

| 断言 | 命令（编码完成后在验收 worktree） | 期望 |
|---|---|---|
| 新路由挂载 | grep -n "gaCalibrationRoutes" src/server.ts | import + app.use 各 ≥1（对齐 L61-63 import + L346-349 mount 模式） |
| 校准路由生产文件 | grep -n "router.post('/api/ga/calibration'" src/routes/ga-calibration.ts | ≥1 |
| 注入服务 export | grep -n "export function injectManualSignal" src/agent/sentinel-service.ts | 1，且路由文件 import 之 |
| runner 注入方法 | grep -n "injectManualFinding" src/sentinel/runner.ts src/agent/sentinel-service.ts | 定义 1 + 服务调用 1（L2→L3 链通） |
| I2 单源不旁路 | grep -n "appendSentinelEvent" src/sentinel/runner.ts | 含 injectManualFinding 内部调用（persistRunEvents 路径），无路由直写事件表 |
| 回流走活单例 | grep -n "getFeedbackCollector" src/routes/ga-calibration.ts | ≥1（不得 import ga-collaboration 死链 GAFeedbackHandler） |
| 枚举扩展 | grep -n "diagnosis_conclusion" src/growth/feedback-collector.ts | 类型 + DDL CHECK + migration 三处 |
| 共享认证 | grep -n "requireGa" src/routes/ga-auth.ts src/routes/ga-calibration.ts | 定义 1 + 使用 ≥4（四端点） |
| 存量不回改 | git diff origin/main..HEAD -- src/routes/ga-annotations.ts src/routes/ga-corrections.ts src/routes/ga-admin.ts | 空 |

---

## 10. 章 5 · Test Requirements（三块测试 + red 设计 + 接线审计）

测试惯例对齐 tests/routes/ga-annotations.test.ts ( 用例内动态 import 路由模块)与 tests/sentinel/sentinel-events.test.ts ( 内存 SQLite 建表)。全用例 expect 断言（铁律 48）。

| # | 文件 | 用例（覆盖正常/降级/边界） | red 证明（S-5） |
|---|---|---|---|
| DS2 | tests/routes/ga-calibration.test.ts | ①认证三态: 401 无 auth / 400 缺 orgId / 403 非 ga-admin；②四动作各 1 正常提交 → 201 + AgentMemoryStore 条目 type='ga_calibration'；③校验: mark_error 缺 errorType → 400 / supersedes 跨 target → 400 CHAIN_ERROR / 信号 signalType 枚举外 → 400 / severity=11 → 400；④版本链: 两次校准同 target，第二条 supersedes=第一条 → GET includeChain=1 返回 2 条有序 + latest 判定正确；⑤降级: store 抛错 → 500 + degraded:true + log.error | 用例①在无认证实现时必红（若编码跳过 requireGa，401 断言抓住）——red 已内建于认证断言 |
| DS4 | 同上（回流集成） | ⑥校准提交后: feedback_log 出现行（target_type='diagnosis_conclusion', actor_role='ga', evidence_refs 含校准 id）→ getFeedbackCollector().getAggregatedSignals(1) 含该组；⑦migration: 预置旧 schema 表 → 启动迁移后 INSERT 新值成功 + schema_version 含 'd551_target_type' | ⑥在回流缺失（只写 memory 不写 feedback_log）时必红——防"回流假装" |
| DS5 | tests/sentinel/ga-manual-injection.test.ts | ⑧injectManualSignal → sentinel_events 含 finding 事件（sentinel_id='ga-manual'）+ getRecentResults 投影可见 + getSentinelFindings 输出含该 finding（对齐 sentinel-events.test L156-168 模式）；⑨边界: severity/confidence 越界在路由层拦截（不落事件）；⑩runner 未初始化（getGlobalSentinelRunner null）→ 服务函数 degraded 返回（对齐 sentinel-service L79-84 模式） | ⑧在注入旁路（直接写事件表不进投影）时投影断言红——防 I2 旁路 |
| DS6 | stats 断言（并入 ga-calibration.test.ts） | ⑪四类计数与注入 byType 正确聚合 + note 字段存在（诚实降级指标） | — |

**CI 验收**: PR check-runs `TypeScript + Lint + Iron Laws` / `Vitest (1/2)` / `Vitest (2/2)` 全 success（贴结果，本地绿不算——D540 教训）+ `Architecture Check` 绿。运行命令:

```bash
npx vitest run tests/routes/ga-calibration.test.ts tests/sentinel/ga-manual-injection.test.ts
npx vitest run tests/routes/ tests/sentinel/    # 域回归
npx tsc --noEmit                                 # 零新增
```

---

## 11. What We Don't Do（明确排除，含文件路径）

| 不做 | 原因 |
|---|---|
| 回改 ga-annotations/ga-corrections/ga-admin 三存量路由为共享 requireGa | 已 audited（D338/D476 链），共享提取仅向前用——零回归风险 |
| 改 src/loops/middle-evolution-engine.ts ( 加校准动作映射) | 回流层 2 descope（§7.3；L78-108 白名单改造需同步 applyEvolutionActions，超防膨胀边界）——显式依赖后续任务 |
| 背景卡自动加载/权重自动更新/ManualSignal 本体节点/定向触发重新评估/GA AI 副驾 | 蓝图下游消费端（§7 层 3），依赖 L4 本体线与画像模块——诚实不做 |
| 前端接线（electron-renderer/ 任何文件） | D544 领地 + 实现排部署后；本单只交契约（§8.3） |
| "采纳率"指标 | 无采纳判定数据源（蓝图 §3.4 的"系统自动评估"无实现基础）——诚实降级为回流计数 |
| 碰 scripts/audit/、scripts/pre-commit-check.sh、.github/workflows/ci.yml | 红线/控制塔线 |

---

## 12. Architecture Layer

**L1（routes/ga-calibration.ts + ga-auth.ts）→ L2（sentinel-service.injectManualSignal + growth FeedbackCollector 回流）→ L3（runner.injectManualFinding）/ L5（AgentMemoryStore 经既有 l4 门面、feedback_log 表）**——全部沿既有邻接路径: routes→sentinel-service 是 src/routes/sentinel.ts L13-19 既有模式；feedback-collector 已被 workspace-data.ts ( L1 路由)直接调用（L141 实测先例）；AgentMemoryStore 经 ga-annotations L37-41 getStore() 惰性导入模式。无新跨层（铁律 39）。

---

## 13. Completion Standard（DS1-DS8，与章节一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1** API 契约表 + 数据模型 + 回流分层落 spec（§6/§7/§8）——dev-doc 已完成（本文档）。
2. **DS2** src/routes/ga-calibration.ts ( 端点 1-4)+ src/routes/ga-auth.ts ( 共享 requireGa)+ src/server.ts 挂载；测试用例①-③⑤全绿。
3. **DS3** 校准数据模型: type='ga_calibration'/'manual_signal' + supersedes 版本链（用例④绿）。
4. **DS4** 回流: target_type 扩 'diagnosis_conclusion' + migration 'd551_target_type' + 双写；用例⑥-⑦绿（聚合可见为收口）。
5. **DS5** 注入: sentinel-service.injectManualSignal + runner.injectManualFinding；用例⑧-⑩绿（findings 可见为收口）。
6. **DS6** stats 端点 + 诚实降级 note（用例⑪绿）。
7. **DS7** §9 九条接线 grep 全命中 + 存量三路由零 diff + as any=0 + 降级诚实（24/31）。
8. **DS8** CI 三 job 全 success 贴结果 + Architecture Check 绿；task-state/D551.json 回填 impl 段 + slice=ga-module-3 + 状态机推进。

---

## 14. Auth Doc References

- 派单 D551: docs/synova/coordination/派单-D551-ga-calibration-20260828.md（已合 main，实测存在）
- Module-3 蓝图: docs/synova/research/权威文档05-Agent主动交互系统蓝图-20260710/SYNOVA-RESEARCH-Module-3-GA人机协同与反馈闭环-20260710.html（§3.2.1/§3.3.1/§3.3.2/§3.4 原文摘录）
- D476 GA 范围权威: docs/plans/codex/implementation/SYNOVA-IMPL-D476-ga-enterprise-scope-20260823.md（O7/O8 收口 + auth.orgId fail-closed）
- D338 中国墙: docs/synova/audit-reports/2026-08-22-D338-org-audit.md（ORG_REQUIRED 形态权威）
- D333/N13: AUDIT-FINDINGS-LEDGER.md CT-16 + commit 6279f451（loop-handlers.ts L360-400 真实进化链）
- 生产事实源（origin/main @ 434d7211 只读实测）: src/routes/ga-admin.ts ( L36/L66/L88/L125)/ src/routes/ga-annotations.ts ( L8/L44-60/L70-137/L147-211/L221-283)/ src/routes/ga-corrections.ts ( L14-21/L23-55)/ src/l3/ga-collaboration.ts ( L56-62/L213-235)/ src/growth/feedback-collector.ts ( L26-50/L112-135/L162/L184/L281-305/L314)/ src/agent/loop-handlers.ts ( L360-400)/ src/loops/middle-evolution-engine.ts ( L69/L78-108)/ src/agent/sentinel-service.ts ( L6/L13/L79)/ src/sentinel/runner.ts ( L713-753)/ src/server.ts ( L61-63/L316/L326/L346-349)/ src/routes/sentinel.ts ( L13-19/L27)/ electron-renderer/src/stores/capability.ts ( L43-46)/ electron-renderer/src/components/RightPanel.tsx ( L632-640)
- 前端交互设计（已合 main）: docs/synova/coordination/SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1.md（GA 占位与蓝图引用）
- PRODUCT-BRIEF §二/§三.1；AGENTS.md 铁律 0-2/24/31/32/38/39/47/48

---

## 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 校准端点形态 | A 扩 /api/ga/annotations 端点 / B 新建 /api/ga/calibration 族 | §4.1 对象域/动作集/消费方三维不同 + annotations stats 的 T9 语义保护（L219）+ 防膨胀（存储通道仍复用） | **B**——端点新建、通道复用 |
| 回流通道 | A 新建校准回流表/机制 / B feedback_log 单源 + target_type 扩枚举 + migration | D333 已真实化（6279f451）+ getAggregatedSignals 无白名单（L285-291 实测）+ 派单红线「禁第二套进化机制」+ schema_version 迁移先例（L36-38） | **B**——层 1 闭环；层 2（engine 动作映射）显式 descope 诚实标注 |
| requireGa 共享化 | A 第四份复制 / B 提取 ga-auth.ts (仅向前用) | 三处已复制（ga-annotations L44 / ga-corrections L14 / ga-admin inline L68-71）+ 存量 audited 不回改 + 防膨胀 | **B**——一次提取止住复制 |
| 注入信号落点 | A 直写 sentinel_events（路由层）/ B sentinel-service → runner.injectManualFinding → persistRunEvents + 投影 | I2 单源（投影与事件必须一致，routes/sentinel.ts L13-19 的 L1→L2→L3 既有模式）| **B**——零旁路，findings 立即可见 |
| ManualSignal 本体节点 | A 按蓝图写 L4 节点 / B 载荷承载 relatedEdges/relatedNodes | L4 本体线归属其他线 + 蓝图反应链第 2 步依赖本体查询 + 防膨胀 | **B**——诚实分层（§7.3），L4 写入为后续依赖 |
| "采纳率"指标 | A 硬造采纳率 / B 诚实降级为回流计数 + note 字段 | 采纳判定数据源不存在（蓝图 §3.4"系统自动评估"无实现）+ 不假装闭环 | **B**——stats note 显式声明 |

> 参考：Anthropic（fail-closed + 契约优先）+ 第一性原理（单源不二建）+ Module-3 蓝图（产品语义权威）。收敛检查：各决策点指向一致，无分歧。

---

## 自检清单

- [x] 北星 front-matter（PRODUCT-BRIEF §二/§三.1 + Module-3 蓝图 + K3 护城河）
- [x] 复用评估引用 ga-annotations.ts file:line（§4.1/§5: L8/L44-60/L74/L82/L101-124/L147-171/L221-283）——派单验收①
- [x] API 契约表完整可执行（§8.2 四端点: 请求/响应/校验/错误码/降级）——派单验收②
- [x] 回流与 D333 关系明确结论 + 诚实标注依赖（§7: 层 1 闭环 / 层 2-3 显式 descope 含 file:line 证据）——派单验收③；「N13（D333 在做）」表述已更正为「D333 已落地」（§头部更正①）
- [x] 基线行号全部复核（§3.1 表 13 行 file:line 逐条实读 origin/main @ 434d7211）——派单交付要求 #2
- [x] capability.ts/RightPanel.tsx 前端锚点实测在 main（D544 已合并——派单"分支待合并"隐含前提已更新）
- [x] 写集表目录粒度（check-dev-doc-write-set 语义）+ dev-doc 阶段与编码阶段写集显式分层（§3.3）
- [x] 防膨胀红线逐条落实: 存储单源/回流单源/事件流单源/requireGa 一次提取/零第二套进化机制（§5-§7）
- [x] E-15/E-38 引用经 C1 白名单源核验（权威文档01 目录实测含两 ID——Linux C1 亦过）
- [x] C2 路径捕获经 perl 模拟逐条核验（origin/main @ 434d7211 工作树）: 现存路径全 OK；5 类预期 MISS 已记录——①electron-renderer/src 剥前缀盲区 ×2（门禁前缀表未建模，同 D546 登记）②ga-auth.ts/ga-calibration.ts 为声明新建的未来文件 ③tests/routes/ga-annotations.test.ts L15 的无扩展名 import 指示符原文引用——三者均为门禁环境行为，非文档错误
- [x] 自复核修正记录（本 session 实际抓出并修复）: ①feedback-collector 行号 cat -n 重编号陷阱（L25/26/36-38 → 实际 L117/118/128-130）②aggregateSignals 聚合路径行号（L439-451 → L433-434）③写集表副本旧行号漏修（L90）④perl 规范化副作用的括号配对损坏（19 处）⑤§8.2 端点 2 查询串语法残缺
- [x] 本 spec 零代码写入；实现排部署后（派单口径）；不用 --no-verify
