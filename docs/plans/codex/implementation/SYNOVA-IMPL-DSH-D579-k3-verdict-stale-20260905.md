---
north-star:
  服务用户: 创始人/CTO——产品完成度仪表盘与 CTO 三仪表盘的消费方；每次"现在该做什么"的判断都依赖仪表盘说真话
  服务场景: 周度进度复盘、线 100% 前的 K3 强制复核（A7）、审计准备（pre-audit-summary U3）；当某点显示 verified 时，用户需要知道这个绿是否还作数
  模块终态: 任何 verified（机器绿 / 任务兑换 / k3 裁决）都受同一时效性约束——证据超过 14 天 TTL 或证据日期后绑定模块有变更，一律自动落 stale 待重跑；批次审计报告对每个已登记 D# 派生可见，verdict 滞留不再隐形
  对齐北星: .claude/PRODUCT-BRIEF.md §一（"增长卡在哪里"必须建立在真实进度事实上）+ §七第 4 条（"增强哨兵 finding 但不检查数据源"同构错误：翻绿但不检查证据时效）+ docs/synova/product-lines/product-lines.yaml 头部诚实规则（"只有带证据的验收点才算已验证"）
  完成标准: 入口 = refresh-all.sh A4 calc 重算 + gen-cto-health 渲染；处理 = k3 pass 过 TTL+git_touched_after 失效门（与 machine 类同语义）、audit.report 显式字段优先派生；结果 = 真实数据 8 点转 stale / 2 点保持 verified / 线 1 输出零变化（diff 落盘 evidence），D517/518/519 仪表盘 audit 列 CONDITIONAL_PASS 可见
  当前进度: 机制缺口已双线定位（calc k3 分支免疫失效检查；gen-cto-health 文件名首匹配派生丢中间 D#）；本单交付 spec，编码 session 接力实现，K3 审计在后
---

<!--
  SYNOVA-IMPL-DSH-D579: k3 verdict stale/TTL 机制 + 批次审计报告范围派生修正
  状态: dev doc（spec-only 先行，D556 先例）| 2026-09-06 | 优先级 P1（CT-55/CT-58，D572 K3 FAIL 机制级残留）
  权威文档: D572 K3 审计报告（P1-1/G2/P1-3 原文）+ 审计发现台账-DSH-CTO.md（CT-55~59 登记）+ 派单-D579 + 铁律 47/48/49
  依赖: D576（CT-53 兑换诚实化，已 close e9da5123）；D572 audited FAIL（本单为机制侧闭环）
  并行: 无（D578 = P0-1 Win 真机实测，另一写集：scripts/desktop + electron，零重叠）
  撰写: synova-devdoc 线程（D336 dev doc 角色）| 现状全部 grep/read/实跑核实，非凭记忆
-->

# D579: k3 verdict stale/TTL 机制 + 批次审计报告范围派生修正

> 一句话问题: **k3 pass 对证据失效检查永久免疫**（calc-progress.py 两个 k3→verified 出口在 stale 检查之前 return），且 **CTO 健康仪表盘按文件名"首个 D#"派生审计状态**，批次报告（`D501-D550` 型）覆盖的中间 D# 全部隐形——证据会过时，机制必须知道；verdict 会滞留，仪表盘必须看见。

## 1. Authority Doc Verification

**来源 ①**: [D572 K3 审计报告](../../synova/audit-reports/2026-09-04-D572-line1-desktop.md) §二 P1-1（原文）:

> D556（GA 人机协同前端）在证据日期 2026-08-29 之后改动 electron-renderer：ga-collab.ts 新增 452 行、RightPanel.tsx +193 行（commit 69d81c58）。「开窗即用」相关点（1-2/1-4/1-6）的证据均先于该变更。calc-progress.py 的 stale/TTL 检查只作用于 machine 类证据（calc-progress.py:147-164），k3 pass 永久免疫失效检测——机制缺口。

**来源 ②**: 同报告 §四 G2 防线缺口（修复建议原文——本单 A 项的语义基准）:

> k3 verdict 同样纳入 git_touched_after 检查：证据日期后 modules 有变更 → 转 stale 待复核

**来源 ③**: 同报告 §五 分级清单 P1-1 处置: 「机制修复后排期重验 1-4/1-6」；P1-3 处置: 「形式状态更新为 PASS（C1/C2 已物理闭合，K3 确认无需复审全量）」。

**来源 ④**: [审计发现台账-DSH-CTO.md](../../synova/coordination/审计发现台账-DSH-CTO.md) L255（CT-55/CT-58 登记原文，含本单边界）:

> **P1-1 机制修复 → D579**（CT-55: k3 类证据 stale/TTL 永久免疫……含 P1-3 机制侧 CT-58: 批次审计报告 D501-D550 型文件名派生不可见中间 D# → D517-519 verdict 滞留 CONDITIONAL，机制=范围解析或 task-state 显式 audit_report 字段二选一 spec 必答）……**CT-58（verdict 滞留数据侧待 D579 机制后自动闭环，禁手工改派生字段）**

**来源 ⑤**: [派单-D579](../../synova/coordination/派单-D579-k3verdict-stale机制-20260905.md)（任务定义 A/B + spec 必答 4 题 + 写集约束 + 验收 4 项）。

**来源 ⑥**: [AGENTS.md](../../../AGENTS.md) 铁律 47（契约优先）/ 48（测试非空壳）/ 49（决策沉淀，commit-msg 物理门禁）+ VERSION.md CT-42 bump 纪律。

**来源 ⑦**: [D576 四态 Note](../../../memory/notes/implemented/2026-09-04-d576-redeem-honesty-ct53-ct54.md)（CT-53 前例：机制诚实化 + mini yaml 测试模式 + 写集纪律的同域先例，commit e9da5123）。

## 2. Problem Statement

产品完成度仪表盘的诚实性依赖两条机制：**证据时效**（A1：证据日期后绑定模块有变更 / 超 14 天 TTL → stale 待重跑）与**审计可见性**（D393 派生制：audit 状态从工件自动派生，不靠人工维护）。两条机制各有一个洞：

- **A 项（CT-55）**: 时效检查只挂在 machine 类证据路径上；k3 裁决的两个 verified 出口（`k3_only` 分支 + 通用 k3 分支）在失效检查之前直接 return——真 K3 审计的 pass 裁决**永久新鲜**，D556 这类"证据日期后 452+193 行 renderer 变更"无法使其失效。
- **B 项（CT-58 机制侧）**: gen-cto-health.py 按 D393 派生审计状态时，从报告**文件名提取首个 `D\d{3}`** 且 glob `*D{num}.md`（要求文件名以该编号结尾）——批次报告 `2026-08-25-D517-D519.md` 只让 D517 进索引（且 glob 仍匹配不上），D518/D519 完全不可见。后果：D517-519 的审计状态在仪表盘显示为"—"（视为未审计），CONDITIONAL verdict 滞留无人看见，即 D572 P1-3 的"滞留 CONDITIONAL 无从自动闭环"的机制根因。

北星对齐: 仪表盘失真 = 自欺（PRODUCT-BRIEF §七第 4 条同构错误）。本单把"翻绿"与"证据新鲜"重新绑定，把"被审计"与"仪表盘可见"重新绑定。

## 3. Q0-Q4

### Q0: 定位 — 项目拼图 + 文件审计

a) **项目拼图**: 治理脚本层（scripts/product-lines/ + scripts/control-tower/，五层业务架构之外的自举层）。产品线仪表盘链 = refresh-all.sh（A3.5 redeem → A4 calc-progress → A5 gen-progress-page）；CTO 三仪表盘链 = gen-cto-health.py（被 pre-audit-summary.sh U3 门禁与渲染前钩子消费）。本单不改业务 src/ 代码，只修两条治理链的诚实性缺口。

b) **文件审计**（grep 实测 2026-09-06）: calc-progress.py 六态状态机 L69、TTL L67、git_touched_after L106、status_for_point L130、k3 分支 L145-156、失效检查 L166-178（详见 §4）。gen-cto-health.py audit 索引 L239-246、报告 glob L281、verdict 解析 L285-291。redeem-progress.py 已把 task-state `audit.report` 当权威（L102-114，无它不兑换）。无同域在途认领（D576 closed，D578 写集不同域）。

c) **决策**: 复用既有机制（A1/TTL/六态/D393 派生制），不新增脚本、不新增状态、不新增字段语义——两处缺口都是"既有机制没接到线上"，修复 = 接线，符合 anti-bloat。

### Q1: 调研 — 业界基线 / 决策链 / memory 教训

- **业界基线（Anthropic 工程原则）**: 缓存/证书类"通过结论"必须带 TTL 与失效条件（fail-closed 优先，"查不了 ≠ 没变过"——calc-progress.py git_touched_after docstring L110-111 已此语义）；仪表盘状态应从工件派生而非人工镜像（D393 已采纳，GitHub/Linear 同哲学）。
- **memory 教训**: D572 P0（兑换洗白 waiting → CT-53 已修）；D576 首踩 YamlSubsetError 即修 + mini yaml 测试模式；D316"实测"不实教训（本 spec 每个声称已跑命令取证）；CT-58"禁手工改派生字段"（数据侧等机制）。
- **铁律**: 47 契约优先（新判定函数先定义输入/输出/降级）；48 三路径测试；49 治理脚本变更 commit 引用四态 Note。

### Q2: 范围 — 正确的最简方案

**做什么**: ① calc-progress.py 两个 k3→verified 出口接入既有失效门（新契约函数，TTL + git_touched_after 语义与 machine 类逐字一致）；② gen-cto-health.py 审计报告解析改为 task-state `audit.report` 显式字段优先、文件名 glob 兜底；③ 上述两处的契约测试（红→绿）+ 真实数据对账留证。

**不做什么（含文件路径）**: 见 §6。

### Q3: 验收 — 入口 → 交互 → 结果

- **入口**: `bash scripts/product-lines/refresh-all.sh`（A4 环节调 calc-progress）+ `python3 scripts/control-tower/gen-cto-health.py`（pre-audit-summary U3 门禁）。
- **处理**: k3 pass 裁决 → TTL（14 天）+ 线 modules 变更检测 → stale/verified/unknown；审计状态解析 → task-state audit.report 优先。
- **结果**: 真实数据对账 diff 落盘（§7 DS4 矩阵：8 stale / 2 保持 / 线 1 零变化）；CTO-HEALTH.md 中 D517/518/519 audit 列 = CONDITIONAL_PASS。

### Q4: 契约与测试

新契约函数（铁律 47，写代码前定义）见 §5.2；测试三路径矩阵见 §7（L1 单元契约 / L2a 接线 / L2b 降级 / L2c 边界），全部有 expect 断言（铁律 48）。

### 3.6 spec 必答 4 题（派单原文逐题回答）

**必答 1 — stale 判定的模块归属映射从哪来？映射缺失 fail-open 还是 fail-closed？**

映射来源 = **yaml 线级 `modules:` 字段**（product-lines.yaml L38 线 1 实证: `["electron/", "electron-renderer/", "scripts/deploy/", "scripts/setup/", "scripts/install.sh", "scripts/install.ps1"]`），与 machine 类失效检查**同源同粒度**——这正是 D572 G2 修复建议原文的语义（"证据日期后 modules 有变更"）。理由：① 验收点级映射在任何机器可读源中都不存在（yaml evidence 无模块字段）；② 本单写集禁改 product-lines.yaml（派单约束 + 维护权归创始人）；③ 自建点级映射表 = 手工维护镜像，正是 CT-53 清除的反模式。线级粒度的已知局限（无法区分"点依赖 renderer"与"点依赖打包脚本"）显式记入 §6 已知局限，点级映射若未来需要 = yaml 增加点级字段（创始人领地，另立任务）。

映射缺失时的降级契约（**分层，不是单选 fail-open/fail-closed**）:
- **TTL 检查不需要映射**（纯日期判定）——必然执行，这是 fail-closed 的底座：映射再缺失，超 14 天的 k3 pass 照样落 stale。
- **git_touched 子检查**：线 modules 为空（映射缺失）→ 该子检查无法执行 → **显式 degraded**（problems 登记"点 X 线 modules 映射缺失，git 失效子检查未执行"），不静默跳过（派单必答 1 降级契约原文）；git 调用失败 → 同样显式登记（现状 git_touched_after L120-123 已返回 error，沿用）。
- **降级时的状态落点 = `pending_k3`**（待裁判，不计分）+ problem 留痕——与 machine 路径的既有降级语义逐字一致（L171-176：日期非法 / git 失败 → pending_k3 + problems）。不准返回 verified（fail-open 假绿 = 本单要修的病），也不准返回 stale（"查不了" ≠ "过时了"，假黄制造噪音）。git 恢复后下次 calc 自动回 verified（自愈）。

**必答 2 — stale 后的 UX：verified+stale 标注还是直接回落？**

**落既有第六态 `stale`（🟡 待重跑，不计分）**，不引入"verified+stale 双标注"，也不回落 uncommitted。依据：
1. 六态状态机（calc-progress.py L69）已定义 stale 语义 = "证据过期待重跑"，machine 类早已如此（L170/L178）——k3 同语义 = 状态机零扩展。
2. 双标注 = 引入第七态 `verified_but_stale`，计分口径立刻模糊（算不算 verified？线 100% 门槛认不认？）——最少机制原则否决。
3. 回落 uncommitted 丢失"曾验证但已过期"信息；stale 态本身携带该信息，且 stale 点重新翻绿的路径已存在：新证据记录（新 k3 复核 / 新机器证据）日期新鲜 + 模块无变更 → 自动回 verified，零新增代码。
4. **对 K3 复核流程的影响**: stale 点进入待重跑池；K3 复核产出新审计报告 → 按 A6 JSON 双轨登记新 k3 记录 → latest pass 日期更新 → 翻绿。进度条可见下降（真实数据 -8 点）是诚实化的**预期行为**，与 D576 CT-53 落地时线 1 清零同性质。

**必答 3 — B 项方案取舍：范围解析 vs task-state 显式字段**

**选方案二：task-state 显式 `audit.report` 字段，生成器读取**。选择依据（四步决策框架详录 §5.3 决策 3）：
1. **迁移成本实测 ≈ 0**: 全仓 task-state 扫描（2026-09-06 实测）——有 audit 块的 126 个任务中 **123 个已有 `audit.report` 字段**，D517/D518/D519 全部已指向批次报告 `docs/synova/audit-reports/2026-08-25-D517-D519.md`；仅 D492/D533/D536 三任务缺字段（走文件名兜底，不强制回填）。
2. **权威性已被同链消费方确立**: redeem-progress.py L108-113 已把 `audit.report` 当权威（"无 audit.report → 不兑换；报告不存在 → 不兑换"）。gen-cto-health 读同一字段 = 两个消费方对齐同一事实源，而不是再造一条解析规则。
3. **范围解析实测确属脆弱**: 现存批次报告文件名形态至少四种——区间 `2026-08-28-D501-D550-impl-done-batch.md`、列表 `2026-08-28-D483-D484-D486.md`、**降序对** `2026-08-29-D551-D487-ga-line.md`（D551 与 D487 是两个任务，不是区间！区间展开会凭空覆盖 64 个 D#）、带后缀 `2026-08-25-D527-D528-slice-c.md`。正则无法可靠区分"区间 vs 列表 vs 降序对"，每新增一种命名形态解析就断一次。

**迁移清单**:
| 项 | 动作 | 成本 |
|---|---|---|
| 123 个已有 audit.report 的任务（含 D517-519） | 零动作，生成器直接读取 | 0 |
| D492/D533/D536（有 audit 块缺 report 字段） | 不回填，走文件名兜底派生（现状语义） | 0 |
| 无 task-state 的历史任务（D393 方案 B 补录） | 文件名派生保留为兜底（现状语义） | 0 |
| 未来批次报告 | 审计流程照常写 task-state audit.report（既有流程，无新规） | 0 |

**必答 4 — 真实用例对账**

**先修正一个前提**（写前核实 ③ 未覆盖的 D576 交互效应，2026-09-06 实跑取证）: 派单预期"1-1/1-3/1-5/1-7（Mac 半边）不误伤"，但线 1 的 8 份 k3 证据（task-D517/518/519/522/523/527/528，日期全部 2026-08-29）note 均含「自动兑换（redeem-progress.py）」→ D576 CT-53 在加载时降级为 task_redeem → 走 machine 路径 → **线 1 的 1-1..1-7 在当前 origin/main 上已经全部 stale**（本线程实跑 calc-progress 取证，committed product-progress.json da5f360c 同状态；1-8 = pending_k3）。该失效来自**既有 machine 路径**，与本单无关；本单的 k3 接线对线 1 **零改变**（自动兑换证据到不了 k3 分支）。因此：

- "1-2/1-4/1-6 必须标 stale" → **真数据上成立**（且已成立，本单保持不变——修复前后线 1 输出逐点一致，证明零新增误伤）。
- "Mac 半边不误伤" → 真数据上的"不误伤"对照组由**真 k3 证据点**承担（D572 Mac 半边结论的机制侧等价物）：
  - **19-2**（线 19 modules 为 src/agent-observer/, observer-adapters/, src/l2/ 三路径——09-02 后零变更，git log 实测）→ 保持 verified。
  - **22-1**（线 22 modules 为 src/infra/, scripts/watchdog.js, src/deploy/, scripts/backup/ 四路径——09-02 后零变更，实测）→ 保持 verified。
- **必须转 stale 的 8 点**（修复生效的正面证明）:
  | 点 | k3 证据日期 | 失效原因（实测） |
  |---|---|---|
  | 7-1 / 9-2 / 11-1 / 11-2 / 18-1 | 2026-08-13（k3-full-chain-20260813.json） | TTL 过期（08-13+14=08-27 < 今） |
  | 10-4 | 2026-09-02 | 线 10 modules 09-02 后有变更（7b576c89/ece4e268/fdfc0799） |
  | 20-5 | 2026-09-02 | 线 20 modules 09-02 后有变更（7b576c89/c2762846/fdfc0799） |
  | 24-4 | 2026-09-02 | 线 24 modules 09-02 后有变更（fdfc0799 触及 src/infra/ 与 src/l1/ 两目录） |
- **机制本身的配对证明**（不依赖真实数据时点）: 夹具测试——同一 yaml 线 modules 注入假 git（echo 触及文件），k3 pass 日期早于"变更" → stale；晚于 → verified。红→绿见 §7。
- 真实数据 diff 输出（修复前后逐点对照）落盘 `docs/synova/audit-reports/D579-k3-verdict-stale-evidence-20260906/calc-diff.md`（git 跟踪路径，根级 evidence/ 被 .gitignore 禁用——派单交付要求 2）。

## 4. Current State（2026-09-06 实测，行号为 origin/main 现值）

### 4.1 calc-progress.py——A 项缺口（全部 read 核实）

| 位置 | 现状 |
|---|---|
| L67 | `EVIDENCE_TTL_DAYS = 14` |
| L69 | `SIX_STATES` 含 `"stale"` |
| L106-127 | `git_touched_after(modules, since_date, git_cmd)`——git 失败返回 `(False, error)` 显式（不把"查不了"当"没变过"） |
| L139 | `k3 = [v for v in verdicts if v["record_type"]=="k3" and not v.get("superseded_by")]` |
| **L145-150** | **k3_only 分支**: fail→`rejected`；**pass→`return "verified"`（L149，无任何时效检查）**；否则 pending_k3 |
| **L152-156** | **通用 k3 分支**: fail→`rejected`；**pass→`return "verified"`（L156，无任何时效检查）** |
| L158-160 | founder_demo 分支（本单不动，见 §6） |
| L162-179 | machine 路径: fail→failed；**L166-178 失效检查**（L169 TTL 过期→stale；L174 git_touched_after→touched 则 stale）→ 否则 pending_k3 |
| L93-98 | D576 CT-53 存量降级: note 含「自动兑换（redeem-progress.py）」的 k3 记录加载时降为 task_redeem（走 machine 路径） |
| L240 | 生产调用点: `compute()` → `status_for_point(...)` |

缺口语义: 同一个 `status_for_point` 里，machine 绿必须过 L166-178 失效门，k3 pass（真审计裁决，证据强度更高、时效要求理应相同）却从 L149/L156 直接翻绿。**D572 审计时的实证**（audit clone @ 0173b8ee，D576 合并前）: 1-2/1-4/1-6 显示 verified 而 D556 已改 renderer——即 P1-1。**D576 合并后今天**: 线 1 七点已经 machine 路径 stale（CT-53 降级的副作用，见 §3.6 必答 4），但**真 k3 记录的免疫仍在**: 7-1/9-2/11-1/11-2/18-1（08-13 pass，TTL 早已过期）+ 10-4/19-2/24-4/20-5/22-1（09-02 pass）今天全部 verified——其中 5 点按 machine 同语义早该 stale。

### 4.2 gen-cto-health.py——B 项缺口（全部 read 核实）

```python
# L239-246: audit 索引——每个报告文件名只取【首个】D\d{3}
for f in audit_dir.glob("*.md"):
    m = re.search(r"D(\d{3})", f.name)
    if m:
        (audit_files if _committed(f) else phantom_audit).add(int(m.group(1)))
# L276-291: 报告定位 + verdict 解析——glob 要求文件名【以】D{num}.md【结尾】
candidates = sorted(audit_dir.glob(f"*D{num}.md")) or sorted(audit_dir.glob(f"*D{num}[a-z].md"))
...
if "CONDITIONAL PASS" in txt: audit_txt = "CONDITIONAL_PASS"
```

对批次报告 `2026-08-25-D517-D519.md`（已 git cat-file 确认存在，含 `## 结论: **CONDITIONAL PASS**（切片级，覆盖 D517/D518/D519）` L10）:
- D517: 517 ∈ audit_files（首匹配命中），但 `*D517.md` / `*D517[a-z].md` 均不匹配（文件名以 D519.md 结尾）→ candidates 空 → audit_txt 停留 `"—"`。
- D518/D519: 根本不在 audit_files（首匹配只抓到 517）→ audit_txt = `"—"`。
- 后果: 三任务仪表盘 status 派生为 impl_done（审计事实隐形），task-state 里人工登记的 audit 块被 D393 派生制覆盖（L193 注释原文"json 人工 status/spec/impl/audit 字段被派生结果覆盖"）。

### 4.3 测试基线（2026-09-06 实跑）

- `tests/control-tower/product-lines.test.py`: **28 用例 3 失败（既有红，与本单无关）**——test_range_expansion_and_mapping（aggregate 台账区间）、test_real_repo_capital_line_zero_of_eight（真实数据漂移: 断言 line10 verified==0 实为 2）、test_real_page_and_no_jargon（页面 5 处 D# 术语）。**本单不修这 3 条**（不同根因、不同归属），回归门 = 其余 25 条保持绿 + 本单波及用例更新后绿（§7 red→green 表）。
- `tests/control-tower/redeem-task-redeem.test.sh` 5/5 绿、`alloc-task-id.test.sh` 13/13 绿（派单验收 3 的回归基线）。
- **两处 enshrined-bug 夹具**（当前因 k3 免疫而假绿，修复后必须更新）: test_six_states L168（1-1 = k3 pass 2026-08-13 断言 verified）、test_hundred_percent_gate L233（6 点 k3 pass 2026-08-13 断言全 verified + gate pending）。

### 4.4 其他实测事实

- 版本: VERSION.md 当前 **V4.9.0** → 本单 bump **V4.9.1**（patch: bug 修复，CT-42）。
- D576 先例（e9da5123 文件清单）: 机制 PR 不携带再生仪表盘产物（product-progress.json 由 CI/refresh-all 常规链再生）——本单沿用，真数据 diff 以 evidence 文件留证。
- 已知数据瑕疵（脚注，不在本单修）: product-lines.yaml 线 24 modules 含 `security/`，该目录在仓库根**不存在**（git pathspec 静默空匹配——失效检测对该子路径永不触发，由 src/infra/ 与 src/l1/ 兜底）；线 10 的 7b576c89 提交日期与 10-4 证据日期同为 09-02，`--since=T00:00:00` 同日即命中（machine 路径同语义，日内精度是既有机制局限）。

## 5. What We Build

### 5.1 写集 (5 修改 + 7 新建)

| 文件 | 操作 | 归属 | 说明 |
|------|:---:|:---:|------|
| scripts/product-lines/calc-progress.py | 修改 | 编码 PR | A 项: 新契约函数 `freshness_gate`（§5.2）+ 两个 k3→verified 出口（L149 k3_only / L156 通用）接入失效门；rejected 语义保持（fail 短路在先） |
| tests/control-tower/product-lines.test.py | 修改 | 编码 PR | 两处 enshrined 夹具更新（test_six_states L168 / test_hundred_percent_gate L233: 固定日期 2026-08-13 → `datetime.now()` 相对日期，D576 mini-yaml 教训——测试不得依赖墙钟漂移） |
| scripts/control-tower/gen-cto-health.py | 修改 | 编码 PR | B 项【**写集扩围申报，见下**】: 新纯函数 `resolve_audit_report`（§5.2）——task-state audit.report 显式字段优先（须过 D412 `_committed` 口径），文件名 glob 兜底；L276-291 接线替换 |
| VERSION.md | 修改 | 编码 PR | V4.9.0 → **V4.9.1**（CT-42） |
| task-state/D579.json | 修改 | spec PR（本线程） | spec 段回填 + status=spec_done（D382 任务状态机） |
| docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D579-k3-verdict-stale-20260905.md | 新建 | spec PR（本线程） | 本 spec（spec-only 先行，D556 先例） |
| tests/control-tower/calc-k3-stale.test.py | 新建 | 编码 PR | A 项契约测试（≥9 用例，§7；`_load` 模式 + mini yaml + 假 git 注入，独立文件不与既有套件耦合） |
| tests/control-tower/gen-cto-health-batch-report.test.py | 新建 | 编码 PR | B 项单测（≥5 用例，§7；临时目录夹具注入，不依赖真实仓库数据） |
| memory/notes/proposed/2026-09-06-d579-k3-stale-wiring-ct55-ct58.md | 新建 | 编码 PR | 四态 Note（铁律 49 commit-msg 门禁要求；proposed → implemented 待 audited 后 git mv） |
| docs/synova/audit-reports/D579-k3-verdict-stale-evidence-20260906/ | 新建 | 编码 PR | 真数据对账 diff（calc-diff.md）+ 测试输出（test-output.md）——git 跟踪路径（D577 evidence 目录先例） |
| .claude/task-briefs/2026-09-05-D579-FIX-D572-k3verdict-stale机制.md | 新建 | spec PR（本线程） | 任务 brief（派单流程已生成，随 spec 提交——D328 一致性要求；编码 session 接单后改认领并核对 Q2 范围） |
| docs/synova/coordination/编码指令-D579-20260906.md | 新建 | spec PR（本线程） | 编码 session 启动指令（D381 交付惯例） |

**⚠ 写集偏差申报（需 CTO 在编码 session 启动前裁决）**: B 项的唯一派生消费方是 `scripts/control-tower/gen-cto-health.py`（全 scripts/ grep 实证: 文件名→D# 派生逻辑仅此一处；calc/redeem 均不做文件名派生），而派单写集"可碰"清单未列它。gen-cto-health.py 本就归属 Harness 线（TASK-ROUTING §四"scripts/product-lines/ + 双仪表盘"），无角色边界冲突；但它被 pre-audit-summary.sh U3 门禁消费（非 pre-commit 门禁脚本，不在"不碰"清单）。**CTO 批准 → 按上表执行；不批 → B 项 descope 另立单**（A 项不受影响）。

### 5.2 修复模式（契约先行，铁律 47）

**A 项 — calc-progress.py 新契约函数（两个 k3 出口共用）**:

```python
def freshness_gate(evidence_date, line_modules, git_cmd, today, pid, problems):
    """CT-55（D579）: 证据新鲜度门——k3 pass 与 machine 绿共用的失效判定。

    @input  — evidence_date: str YYYY-MM-DD（被检裁决/证据的日期）
              line_modules: list[str]（yaml 线级 modules，可空=映射缺失）
              git_cmd: str（测试可注入）; today: datetime
              pid: str（验收点 id，降级留痕用）; problems: list[str]（显式降级登记）
    @output — "fresh"   → 调用方落 verified（TTL 内 且 modules 无变更）
              "stale"  → 调用方落 stale（TTL 过期 或 证据日期后 modules 有变更）
              "unknown" → 调用方落 pending_k3 + 已登记 problem（日期非法 / git 不可用 /
                          modules 映射缺失——"无法判定新鲜" ≠ "判定过时"，不计分不假黄）
    @degraded — 日期非法 / git 调用失败 / 映射缺失 → problems 显式登记（铁律 24/31，不静默）
    @contract — TTL 复用 EVIDENCE_TTL_DAYS（L67）与 machine 路径同一比较语义（> N 天）；
                git 检测复用 git_touched_after（L106）；D572 G2 修复建议原文的机制化。
    """
```

两个出口的接线形态（rejected 短路保持在前——负向裁决不失效，与 machine 路径 fail 先于 TTL 同构）:

```python
# k3_only 分支（原 L145-150）与通用 k3 分支（原 L152-156）同构:
if any(v["verdict"] == "fail" for v in k3):
    return "rejected"
passes = [v for v in k3 if v["verdict"] == "pass"]
if passes:
    latest = max(passes, key=lambda v: v["date"])          # 最新 pass 裁决 governs 新鲜度
    gate = freshness_gate(latest["date"], line_modules, git_cmd, today, pid, problems)
    if gate == "stale":
        return "stale"
    if gate == "unknown":
        return "pending_k3"                                 # 降级语义见 §3.6 必答 1
    return "verified"
```

**B 项 — gen-cto-health.py 新契约函数**:

```python
def resolve_audit_report(num, audit_dict, audit_dir, is_committed):
    """CT-58 机制侧（D579）: 解析任务 D# 的审计报告路径。

    @input  — num: int（D 编号）; audit_dict: task-state 的 audit 块（可 None）
              audit_dir: Path; is_committed: Callable[[Path], bool]（D412 口径注入）
    @output — (report_path|None, source: "state"|"filename"|None)
              ① audit_dict["report"] 存在且文件在盘且已提交 HEAD → 权威采信（"state"）
              ② 否则回落现有文件名 glob（*D{num}.md / *D{num}[a-z].md，"filename"，现状语义）
              ③ 均无 → (None, None)
    @degraded — state 指向的文件缺失/未提交 → 静默回落 filename（回落本身是既定语义链一环，
                不新增降级态；调用方 verdict 解析失败路径维持现状）
    @contract — 与 redeem-progress.py L108-113 同一信任源（audit.report 权威）；
                不新增 phantom 机制（D412 口径复用 is_committed 注入）。
    """
```

接线: analyze_task_state 任务循环内，原 L276-281 的 candidates 解析替换为 `resolve_audit_report(...)` 调用；verdict 文本解析（CONDITIONAL PASS 优先序 L285-291）不变；audit_files/phantom_audit 构建与方案 B 历史任务补录循环**不动**（后者仍靠文件名兜底）。

### 5.3 决策参考（S-12/D333，四步框架）

| # | 决策点 | 参考系（①第一性原理 ②Anthropic 基线 ③开源/仓内实证 ④收敛） | 结论 |
|---|--------|------|------|
| 1 | 模块归属映射粒度 | ①最简本质=复用 A1 既有机制，零新概念；②fail-closed 底座（TTL 无需映射必然执行）+显式降级；③仓内实证: D572 G2 建议原文即线级 modules；点级映射无数据源且 yaml 禁改 | **线级 modules**；点级粒度局限显式 descope（§6） |
| 2 | stale 后 UX | ①最少机制=不加第七态；②Anthropic"机器可验契约"=状态单一、计分口径唯一；③仓内实证: machine 类已落 stale 态、六态状态机 v1.4 §3.4 已定义 | **落 stale 态**（不计分，待重跑） |
| 3 | B 项方案 | ①事实源=审计流程自己写的 audit.report，不是文件名；②权威字段已被 redeem 采信（对齐消费方）；③仓内实测: 123/126 已有字段零迁移；文件名四种形态（含降序对 D551-D487）解析必碎 | **方案二**（显式字段优先 + 文件名兜底） |
| 4 | 降级落点 | ①"查不了"≠"没变/过时"；②Anthropic fail-open 禁令（静默假绿）+ 假黄噪音否决；③仓内实证: machine 路径 L171-176 同场景落 pending_k3 + problems | **pending_k3 + 显式 problems**（自愈） |

> 收敛检查: 四项决策双参考系指向一致，无分歧。**参考：Anthropic/DeepSeek/第一性原理 + 结论**（K3 可核）。

## 6. What We Don't Do

| 不做 | 原因（含文件路径） |
|------|------|
| 改 product-lines.yaml（加点级 modules / 修线 24 `security/` 死路径 / 修 1-7 绑定错配 CT-59） | 派单写集禁改；线集与验收点维护权归创始人（yaml 头部 L5）；CT-59 已单独登记待派 |
| 线级 k3_gate（`line:<id>` 复核，calc-progress.py L255-261）接入失效门 | 派单 A 项语义=验收点级 k3 分支；真数据零 `line:` 记录（grep 实证），无可观察影响；且任一点 stale 时 verified<total，gate 逻辑不可达——记为已知局限，不扩scope |
| founder_demo 分支（L158-160）接入失效门 | 派单 A 项限定 k3 类；演示核验是里程碑证据，时效语义需创始人裁决，另议 |
| 手工修改 task-state/D517、D518、D519 的 audit.verdict | CT-58 原文"禁手工改派生字段"；数据侧等本单机制生效后由派生自动可见（CONDITIONAL_PASS） |
| 修 product-lines.test.py 的 3 条既有失败（range_expansion / capital_line_zero / page_no_jargon） | 均与本单无关的真实数据漂移/其他脚本问题；本单回归门明确排除并留证（§4.3），避免写集蔓延 |
| 范围解析（D501-D550 型文件名区间展开） | §5.3 决策 3 否决；降序对 D551-D487 证明其脆弱性 |
| verify-parallel.sh L208-209 的 `ls *-D{did}-*.md` 豁免检查同款修复 | 不同消费方、不同语义（并行 worktree 审计豁免）；中间 D# 盲区同样存在但属另一单，避免本单写集蔓延——记入已知局限 |
| scripts/audit/ 任何文件 | K3 专属（审计红线） |
| src/ 全目录、electron-renderer/、pre-commit 门禁脚本 | 派单"不碰"清单 |

## 7. Test Requirements（测试先行——铁律 0-2/48）

**第一步（red）**: 新建 `tests/control-tower/calc-k3-stale.test.py` + `gen-cto-health-batch-report.test.py`，下列用例在修复前必须失败（A1/A2/A5/A6/B1/B2 对现状为 red）；**第二步（green）**: 实现后全绿。

| # | 用例 | 修复前（red） | 修复后（green） |
|---|------|------|------|
| A1 | k3 pass + TTL 过期（evidence 日期 = today-15d）→ **stale**（真实数据 7-1 组的机制化） | 现状 return verified（免疫） | stale |
| A2 | k3 pass 新鲜 + 假 git 报告 modules 触及（echo 触及文件注入，`--git-cmd` 模式同 L208-217 既有用法）→ **stale**（D556 场景机制化） | verified（免疫） | stale |
| A3 | k3 pass 新鲜 + 假 git 报告零触及 → **verified**（不误伤——19-2/22-1 机制化） | verified | verified（回归不变） |
| A4 | k3 fail → **rejected**，且 fail 裁决不受 TTL/git 影响（负向语义保持） | rejected | rejected（回归不变） |
| A5 | k3_only 点 pass + TTL 过期 → stale（1-8 型点的真 k3 复核过期场景） | verified | stale |
| A6 | 降级三连: ①日期非法 → pending_k3 + problems 留痕；②git 失败（exit 1 假 git）→ pending_k3 + problems；③线 modules 空 + TTL 内 → verified 但 problems 显式登记"git 失效子检查未执行" | ①现状直接 verified 无痕（红）；②③按新契约断言 | 全部显式（铁律 24/31） |
| A7 | 配对夹具（必答 4 机制证明）: 同一 yaml/假 git，两条 k3 记录日期一前一后 → 仅早者 stale | 双双 verified | 一 stale 一 verified |
| A8 | superseded_by 的旧 pass 不参与 latest 判定（L139 既有语义保持） | 按现状 | 回归不变 |
| A9 | 既有夹具更新后: test_six_states / test_hundred_percent_gate 全绿（相对日期化） | 更新前对新实现为 red（旧断言 verified） | 绿 |
| B1 | 批次报告 + task-state audit.report 指向它 → resolve 返回该报告（source="state"）——D517/518/519 场景 | 现状无此函数（红） | 命中 |
| B2 | 仪表盘效果: analyze_task_state 对夹具任务（audit.report → 含"CONDITIONAL PASS"的报告）→ audit_txt=CONDITIONAL_PASS + status=audited | "—" + impl_done | 可见 |
| B3 | state 字段指向不存在文件 → 回落 filename 派生（对 *D{num}.md 单报告任务回归不变） | — | 回归不变 |
| B4 | state 文件存在但未提交 HEAD（is_committed=False 注入）→ 不采信 state，回落 filename（D412 口径） | — | 不采信 |
| B5 | 单报告 `*D518.md` 文件名派生回归（无 task-state 场景语义零变化） | — | 回归不变 |

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | Python 单元（unittest，_load 模式） | A1-A9 + B1-B5 = 14 | 正常/stale 命中/降级/边界/回归 |
| L2a | 接线 | 2 | calc 两个 k3 出口真实调用 freshness_gate（A1/A5 即接线证明）；gen-cto-health 循环真实调用 resolve_audit_report（B2） |
| L2b | 降级 | 3 | A6 三场景（映射缺失/git 失败/日期非法）全部显式 problems |
| L2c | 边界 | 4 | A4 负向短路、A7 配对、A8 superseded、B4 未提交不采信 |

**回归（非 red，修复后必须保持）**: product-lines.test.py 除 §4.3 三条既有失败外全绿；redeem-task-redeem.test.sh 5/5；alloc-task-id.test.sh 13/13；gen-cto-health.test.sh 幂等/指纹语义不变（D384）；pre-audit-summary U3（`gen-cto-health.py --strict`）仍过。

## 8. Wiring Verification

| 变更 | 生产调用点（真实传递，测试调用不计——S-3） | 验证 |
|------|------|------|
| freshness_gate（A 项） | calc-progress.py `compute()` L240 → `status_for_point` → k3_only 出口（原 L149）+ 通用 k3 出口（原 L156）；生产入口链: refresh-all.sh **L48/L55**（A4 进度计算/重算）→ CI `.github/workflows/product-progress.yml`（push main + 周五 cron，refresh-all 头注 L14） | grep 断言两个出口均调用 freshness_gate 且先于 return verified；实跑 refresh-all 单链 A4 验证状态变化（evidence 留档） |
| resolve_audit_report（B 项） | gen-cto-health.py `main` → `analyze_task_state` 任务循环（L259 起）接线替换原 L276-281；生产消费链: pre-audit-summary.sh **L48**（U3 产物可复现门禁）+ check-orphan-worktrees.sh L19 / check-ci-stale-red.sh L21（渲染前调用） | grep 断言循环内唯一报告解析入口为 resolve_audit_report；实跑 generator 后 grep CTO-HEALTH.md 中 D517/D518/D519 行含 CONDITIONAL_PASS |

## 9. Architecture Layer

**治理脚本层（自举层）**——不属于业务五层（L1-L5）。scripts/product-lines/ 与 scripts/control-tower/ 是控制塔/仪表盘治理设施（AGENTS.md"自动化优先"铁律 35 载体），被 L1 之外的 CI/cron/审计流程消费。架构约束: 不 import 业务 src/ 任何模块，不碰 scripts/audit/，不改门禁阻断语义（gen-cto-health 仅读侧渲染，pre-commit 13 组零接触）。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1**: freshness_gate 契约 docstring（输入/输出/降级三段，铁律 47）落地 calc-progress.py；两个 k3→verified 出口（k3_only + 通用）均经 freshness_gate（grep + A1/A5 证明）
2. **DS2**: rejected 短路保持在前——k3 fail 不受 TTL/git 影响（A4）
3. **DS3**: 降级契约生效——日期非法/git 失败/映射缺失三场景均 pending_k3 或留痕 + problems 显式（A6，铁律 24/31）
4. **DS4**: 真实数据对账矩阵达成——7-1/9-2/11-1/11-2/18-1/10-4/20-5/24-4 → stale；19-2/22-1 → 保持 verified；线 1 修复前后逐点一致（1-2/1-4/1-6 stale 维持，零新增误伤）；1-8 pending_k3 不变；diff 落盘 `docs/synova/audit-reports/D579-k3-verdict-stale-evidence-20260906/calc-diff.md`
5. **DS5**: 新测试 calc-k3-stale.test.py（A1-A9）+ gen-cto-health-batch-report.test.py（B1-B5）全绿，red 已证（修复前运行留档 test-output.md）
6. **DS6**: 回归——product-lines.test.py 除 §4.3 三条既有失败外全绿（两处 enshrined 夹具更新后）；redeem-task-redeem.test.sh 5/5；alloc-task-id.test.sh 13/13；gen-cto-health --strict 过
7. **DS7**: B 项生效——gen-cto-health 以 audit.report 为权威源；D517/D518/D519 在 CTO-HEALTH.md audit 列显示 CONDITIONAL_PASS（B2 + 实跑 grep 留证）；未提交报告不采信（B4）
8. **DS8**: VERSION.md 含 **V4.9.1**（同 commit）
9. **DS9**: 治理脚本变更 commit 引用 memory/notes 四态 Note `2026-09-06-d579-k3-stale-wiring-ct55-ct58.md`（铁律 49，commit-msg 物理门禁；proposed 态入库）
10. **DS10**: 写集合规——git diff 文件清单与 §5.1 写集表一致（含扩围项获 CTO 批准的前提；未批准则 B 项 descope 并在交付声明显式标注 DS7/DS8 相关项 ⏸）；红线清单（§6）零触碰；无 --no-verify
11. **DS11**: 交付声明含决策记录（§5.3 四项参考系与结论）+ 完成报告按"agent 自检 5 问"逐项作答；禁手工改 D517-519 task-state（CT-58，git diff 零触碰可验）

## 11. Auth Doc References

- docs/synova/audit-reports/2026-09-04-D572-line1-desktop.md（P1-1/G2/P1-3/处置原文，§1 已引）
- docs/synova/coordination/审计发现台账-DSH-CTO.md L255（CT-55/CT-58 登记与"禁手工改派生字段"边界）
- docs/synova/coordination/派单-D579-k3verdict-stale机制-20260905.md（任务定义/必答 4 题/写集/验收）
- docs/plans/codex/strategy/SYNOVA-DESIGN-产品完成度仪表盘-v1-20260816.md（六态状态机 §3.4 与 A1 规则定义源）
- docs/synova/product-lines/product-lines.yaml（线级 modules 事实源 L38；诚实规则头部）
- AGENTS.md 铁律 0-2/24/31/47/48/49；VERSION.md（CT-42 bump 纪律）
- memory/notes/implemented/2026-09-04-d576-redeem-honesty-ct53-ct54.md（CT-53 同域先例）；memory/notes/README.md（四态迁移语义）
- scripts/product-lines/calc-progress.py、scripts/product-lines/redeem-progress.py、scripts/control-tower/gen-cto-health.py、scripts/product-lines/refresh-all.sh（现状代码，§4 实测行号）

## 自检清单

- [x] D572 审计 P1-1/G2/P1-3 现场核实（calc 两个 k3 出口 L149/L156 无时效检查；gen-cto-health L239-246 首匹配 + L281 结尾 glob，均 read 实证）
- [x] 写前核实 6 项复核通过；**派单前提修正一处**（必答 4: D576 CT-53 使线 1 七点已 stale——实跑取证，非凭记忆），已显式申报并给出替代对照组（19-2/22-1）
- [x] B 项写集缺口显式申报（gen-cto-health.py 为唯一派生消费方，grep 全 scripts 实证）——扩围待 CTO 批，未批则 descope 路径已写明
- [x] 测试基线实测（product-lines.test.py 28 用例 3 既有失败——本单回归门显式排除，不藏）
- [x] 全部受波及既有用例枚举（test_six_states/test_hundred_percent_gate 两处 enshrined 夹具；test_gen_k3_task_pending_gate 与 test_end_to_end 核实不受影响）
- [x] 测试优先: red→green 对照表（§7），降级路径非 happy path（L2b 三场景）
- [x] 决策参考已记录（§5.3，S-12 四项均走框架且收敛）
- [x] DS 与 dev doc 一一对应（DS1-DS11，S-10）；派单验收 1→DS1/DS5、2→DS4、3→DS6、4→DS8/DS9 映射完整
- [x] spec-only 提交（D556 先例）；本线程未写任何实现代码
- [x] 不碰 scripts/audit/、product-lines.yaml、src/ 全目录、electron-renderer/、pre-commit 门禁脚本
