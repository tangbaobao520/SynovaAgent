# Task Brief: D651 专家名引用全量同步——补 D650 缺口（signal-aggregator/runner/Composer/impl L271/测试断言），确保专家体系完整

> 生成: 2026-09-09 20:17:45 | 分支: feat/win-d651-expert-ref-sync (base=origin/main 含已合并的 #454/D650) | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统，也是组织增长导航系统。
诊断是手段，增长才是目的。核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。pre-commit 物理阻断跨层 import。

**横向解耦：11 个独立 Monorepo 包**
@synova/sog-core / @synova/sentinel-engine / @synova/expert-platform 等，接口边界明确。

**扩展解耦：文件驱动，不改代码**
新增专家 = 新建目录 + 文件 → expert-registry 自动注册；专家名以 expert/expert-registry.yaml 为唯一事实源。

流程约束: V4.5.1 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务是 L3 洞察层（sentinel 信号→专家路由 + l3 诊断引擎事件标签）与 L1 展示层（桌面端专家下拉）的**机械引用同步**：D650 已把 expert/expert-registry.yaml 专家名 cycle 命名改为问题域命名（PR#454 已于 2026-09-09 11:42Z 合入 main），但注册表之外的硬编码旧名引用仍在，导致路由值被 VALID_EXPERTS（registry.listTypes 动态校验）过滤成空路由——哨兵信号派发不出专家。现有模块：runner.ts findSignalRoute 层→专家路由表、signal-aggregator.ts SIGNAL_TO_EXPERT 信号→专家映射、Composer.tsx EXPERT_LIST 下拉数据。本任务 = 扩展（引用对齐），不新增模块、不改架构。

### b) 文件审计
grep 实证（clone @origin/main f3df0284）：runner.ts:78-103（LAYER_EXPERTS finance-structure/talent-cycle/tech）+ :97/:103 interface 细化路由；signal-aggregator.ts:48-58（SIGNAL_TO_EXPERT 含 org/tech/strategic/finance/business_model 旧 9 位名——spec §2.1 审计遗漏的第 7 处，recommendedExperts 的真正生产者）；synova-diagnosis-engine-impl.ts:271（expert: 'org'）；Composer.tsx:13-22（EXPERT_LIST 旧 8）；tests/sentinel/integration-pipeline.test.ts:58/133/134 + tests/sentinel/signal-aggregator.test.ts:15/47/48（旧名断言，spec 遗漏后者）。src/tui-v2/chat.tsx：D650 已改名（基线 grep 零旧名），本卡零改动。src/cycles/：资源循环 cycleId，保留不动。

### c) 决策
已有覆盖→复用：专家集合唯一事实源 = getAllExpertIds() 动态读 registry（不改加载逻辑，只改硬编码旧名引用）。无新建硬编码类型。冲突→无（D650 已合入，映射表以 spec §2.2 两段 + registry v3.0 为准）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = spec §6 DS1-DS8 机器可验；② 测试先行——先改 tests/sentinel/ 两文件断言到新名跑红（recommendedExperts 旧值不匹配→fail），再改 src 跑绿；③ 实现 = 机械映射替换，零逻辑变更；④ 接线 = 新名在 VALID_EXPERTS（registry v3.0）合法、路由不再被过滤；⑤ 验证 = DS1-DS8 + tsc 基线对照。
引用依据：铁律 0-2（spec→test→impl→wire→merge）；铁律 7（入口可触达+链路走通+结果可见）；铁律 47（拆完必须 grep 物理证明）；memory/2026-09-09-d650-expert-domain-rename-delivery.md（G12 matches 路径末段规则）。

### b) 本任务执行约束
  - rule: "旧专家名机械替换禁止顺手改逻辑——diff 只允许映射表值/断言值/displayName 变化"
    verify: "git diff --stat HEAD -- src/ | wc -l"
  - rule: "资源循环 cycleId 绝对不改——src/cycles/ 与 tests/cycles/ 零改动"
    verify: "git diff --name-only HEAD -- src/cycles/ tests/cycles/ | wc -l"
  - rule: "grep 用精确 token 防误报——DS3 查 id: 'org'/expert: 'org'/toContain('org') 完整模式，不用裸 org 子串"
    verify: "grep -rnE \"id: '(strategy|finance|org|tech|marketing|action|business_model|knowledge)'|expert: 'org'|toContain\\('(org|tech)'\\)\" src/sentinel/ src/tui-v2/ src/l3/synova-diagnosis-engine-impl.ts electron-renderer/src/components/Composer.tsx tests/sentinel/ | wc -l"

### c) 决策参考系
决策点 1（D650 未合如何开工）: 开工实测发现 PR#454 已于 11:42Z 合入 main → 参考第一性原理（最少机制）：放弃堆叠分支，直接基于 origin/main 开分支，无需依赖排序。参考：第一性原理 + 结论（基 origin/main）。
决策点 2（signal-aggregator 是否纳入写集）: spec §2.1 遗漏它是 recommendedExperts 唯一生产者；不改它 DS4 测试永远跑不红转绿。参考：Anthropic（机器可验契约——测试是契约，生产者必须同步）+ 结论（纳入写集并在 spec §3.2 同 commit 回填）。
决策点 3（Composer 六条 displayName 措辞）: spec §3.1 写「竞争战略专家」，D650 已合入的 manifest.json displayName=竞争与战略专家，chat.tsx 注释明确「标签与 manifest displayName 对齐」。参考：Anthropic（单一事实源一致性优先于文案偏好）+ 结论（六条 displayName 逐一取 manifest v3.0 值，偏离记入 spec §3.2）。

### d) 相关 Note 引用
- [ ] memory/2026-09-09-d650-expert-domain-rename-delivery.md（D650 交付先例与 G12 规则）

### 文档引用
- docs/plans/codex/implementation/SYNOVA-IMPL-D651-expert-name-reference-sync-20260909.md（唯一契约，§2.2 映射表 + §6 DS1-DS8）
- docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章-专家架构权威定义与路线图-20260905.md §6.6 术语表 + §6.9.1 迁移映射
- docs/synova/research/专家架构重定义与权威口径审计-20260905/第七章-专家可组合性深度补充研究-20260906.md §7.4 英文名
- expert/expert-registry.yaml v3.0（D650 交付，权威英文名落地）

### 接口审计
src/sentinel/runner.ts: findSignalRoute（:60，LAYER_EXPERTS :76 + interface 细化 :94-108，下游 :681 VALID_EXPERTS=registry.listTypes() 校验后 :723 dispatcher.runExpert）
src/sentinel/signal-aggregator.ts: aggregateSignals（:48 SIGNAL_TO_EXPERT 映射 → :149 recommendedExperts 产出，integration-pipeline.test 直接断言其输出）
src/l3/synova-diagnosis-engine-impl.ts: mapDimensionToExpert（:526 映射表 D650 已改；本卡只改 :271 expert_hypothesis emit 的 expert 字段，类型为 string，见 synova-diagnosis-engine.ts:153）
electron-renderer/src/components/Composer.tsx: EXPERT_LIST（:13 数据数组，消费点 :143 filteredExperts + :192 mention 标签回显，纯数据替换）
src/tui-v2/chat.tsx: EXPERT_DISPLAY_NAMES（:44，D650 已改新键，本卡零改动——基线 grep 零旧名实证）

## Q2: 范围 — 正确的最简方案是什么？

做什么（写集 6 代码文件 + 2 簿记，逐文件认领）：
- src/sentinel/runner.ts
- src/sentinel/signal-aggregator.ts
- src/l3/synova-diagnosis-engine-impl.ts
- electron-renderer/src/components/Composer.tsx
- tests/sentinel/integration-pipeline.test.ts
- tests/sentinel/signal-aggregator.test.ts
- docs/plans/codex/implementation/SYNOVA-IMPL-D651-expert-name-reference-sync-20260909.md
- .claude/task-briefs/2026-09-09-D651-expert-name-reference-sync.md

映射规则（spec §2.2 两段）：capital-cycle→fundamental-efficiency、customer-cycle→customer-growth、talent-cycle→organizational-capability、tech→technology-foundation、finance-structure→fundamental-efficiency、competitive-strategy 保留、strategy→competitive-strategy、finance→fundamental-efficiency、org→organizational-capability、marketing→customer-growth、action→host、business_model→competitive-strategy、knowledge→host、strategic→competitive-strategy（旧 9 位死名，registry 任何版本均无此 ID）。

不做什么（排除项，路径紧跟动词）：
- 不改 src/cycles/ 与 tests/cycles/（cash-cycle/customer-cycle/talent-cycle 此处是资源循环 cycleId 非专家名，全局 sed 禁止）
- 不改 expert/ 与 expert/expert-registry.yaml（D650 已交付 #454）
- 不改 src/tui-v2/chat.tsx（D650 已改，基线 grep 零旧名）
- 不改 src/agent/expert-router.ts（D650 已改）
- 不改 src/agent/task-decomposer.ts（D650 已改）
- 不改 src/l3/synova-diagnosis-engine-impl.ts 的 mapDimensionToExpert 映射表（:526-553 D650 已改，本卡只动 :271 一行）
- 不做 Composer 组件结构重构（只换 EXPERT_LIST 数据旧 8 → 新 6）
- 不引 @deepseek-ai（非借鉴卡）；不用 --no-verify

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：GA 诊断 consult / 哨兵 Cron → Sentinel.check → aggregateSignals 产出 recommendedExperts → runner 路由派发专家。
处理（中间经过哪些步骤）：findSignalRoute 用 LAYER_EXPERTS + interface 细化路由产出 experts → VALID_EXPERTS 注册表校验（新名合法不再被过滤）→ dispatcher.runExpert 派发；SIGNAL_TO_EXPERT 同步问题域命名。
结果（最终展示在哪）：专家报告进诊断流（expert_hypothesis 事件 expert 字段=organizational-capability）；桌面端 Composer @ 下拉展示 6 个新专家（host + 5 问题域）；tests/sentinel 全绿 + DS1-DS8 逐条通过。

## 架构层: L3
L3 洞察层（sentinel 信号→专家路由 + l3 诊断引擎事件标签）为主，触及 L1 展示层（electron-renderer Composer 下拉数据，机械引用同步）。无新增跨层依赖，无五层边界变更。
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Q4: 历史教训（memory/ 检索结果对照）
- D282 改名不全教训（spec §4.5 决策点 1 引用）→ 本卡一次收口旧 cycle 名 + 旧 8/9 位名，并实测补上 spec 遗漏的 signal-aggregator.ts 生产者，不重演「改名不全」。
- D650 交付（memory/2026-09-09-d650-...）→ G12 matches 只认路径末段：Q2 include 逐文件裸路径列全，不用目录复合行。
- D470/D588 → *-auto brief 被 gitignore + CI 按日期找 brief：brief 已改追踪名 2026-09-09-D651-expert-name-reference-sync.md 并随 PR 提交。
- D598 → clone+junction vitest 双实例全灭：统一用 node --preserve-symlinks node_modules/vitest/vitest.mjs run。
- D356/D479 → /tmp/.synova-before-brief 陈旧条目（含 D650 会话 memory 写入误报）在提交前 rm，brief mtime 晚于证据时 rm 安全。
- D338 → 测试副作用工件提交前还原；本卡零数据写入，无此风险。

## Done 标准
- [ ] DS1 旧 cycle 名零残留: verify: grep -rn "capital-cycle\|customer-cycle\|talent-cycle\|finance-structure" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx src/l3/synova-diagnosis-engine-impl.ts tests/sentinel/integration-pipeline.test.ts → 0 命中
- [ ] DS2 新名落地: verify: grep -rn "fundamental-efficiency\|customer-growth\|organizational-capability\|technology-foundation" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts electron-renderer/src/components/Composer.tsx → 命中 ≥6
- [ ] DS3 旧 8 名 + tech 精确零残留: verify: grep -rnE "id: '(strategy|finance|org|tech|marketing|action|business_model|knowledge)'|expert: 'org'|toContain\('(org|tech)'\)" src/sentinel/ src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx src/l3/synova-diagnosis-engine-impl.ts tests/sentinel/ → 0 命中
- [ ] DS4 测试 red→green: verify: node --preserve-symlinks node_modules/vitest/vitest.mjs run tests/sentinel/integration-pipeline.test.ts tests/sentinel/signal-aggregator.test.ts → 全 pass（红证据留存在会话记录）
- [ ] DS5 零回归: verify: node --preserve-symlinks node_modules/vitest/vitest.mjs run tests/sentinel/ tests/agent/expert-router.test.ts tests/agent/task-decomposer.test.ts 全绿 + npx tsc --noEmit 报错集 = 基线（零新增，逐条 diff）
- [ ] DS6 类型安全: verify: grep -rn "as any\|as never\|as unknown as" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts electron-renderer/src/components/Composer.tsx → 新增行 0 命中
- [ ] DS7 范围一致: verify: git diff --name-only origin/main..HEAD → 恰为本 brief Q2 写集 + 无越界（src/cycles/ 零改动）
- [ ] DS8 无绕过 + 推送 CI: verify: grep -n "no-verify" .claude/bypass.log → 0 命中；git push 后 CI task-relevant jobs 绿
