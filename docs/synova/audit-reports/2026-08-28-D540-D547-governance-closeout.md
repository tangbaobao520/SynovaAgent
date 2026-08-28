# K3 独立审计报告 — 治理收口批（D540-D547）

> 审计员: Kimi K3（独立会话，零上下文）| 2026-08-28
> 批次: 并行隔离治理收口（D540 复审 + D541 复审 + D542-D547 初审，D545 作废让渡）
> 审计分支: `audit/k3-20260828-gov-closeout`（基于 origin/main = `8aa06afa`）
> 派单: docs/synova/coordination/审计派单-20260828-治理收口批.md
> 结论总览: **6 PASS / 2 CONDITIONAL PASS / 0 FAIL**；P1×2（D541 测试断裂+未接线；D544 证据未入库）+ 系统性发现 1 条

---

## 0. 运行环境注记

| 项 | 值 |
|---|---|
| 审计工作区 | `/Users/wane/Synova-k3独立审计`（独立 clone，物理隔离） |
| 被审基线 | origin/main = `8aa06afa`（含 D540-D547 全部已合） |
| CI 证据 | GitHub check-runs API（job 级，D320 教训），token 经 `~/.dsh/.credentials.yaml` |
| 本地 bash 测试 | 全部在 Mac 复跑（D540/D541/D542/D543/D547 的 .sh 测试可本地复现） |
| **环境坑（已区分，非缺陷）** | 本机 `node_modules/better-sqlite3` 为 NODE_MODULE_VERSION 137 编译，当前 Node 要求 127 → `new Database(':memory:')` 抛错 → D546 的 vitest 测试（tests/sentinel/）本地全挂。**环境依赖失败**：CI Vitest job 已绿（check-runs 实证），非测试缺陷，不判定 D546 测试失败 |
| 未复跑项 | D546 vitest 测试（better-sqlite3 原生模块版本不匹配，CI 已证绿）；D544 vitest（electron-renderer 无 node_modules） |

---

## 1. 逐任务 verdict 与发现

### D540 — 独立 clone 试点修复（复审）→ **PASS**

上一轮 K3 FAIL（P0-1 CI Iron Laws 红）的放行条件逐条核：

| 放行条件（上轮报告 §7） | 核实结果 | 证据（file:line / check-runs） |
|---|---|---|
| ① quality job 全绿（Iron laws + Verify parallel declaration 两步均 success） | ✅ | check-runs for `70b5a141ad`：`TypeScript + Lint + Iron Laws = success`；job `33097375121` 步骤级：`Iron laws check=success` + **`Verify parallel declaration (D540...) = success`（首次真实执行，非 skipped）** |
| ② Vitest/Golden F1 不再连带 skip | ✅ | 同 run：`Vitest (1/2)/(2/2)=success`、`Golden Case F1 Gate=success` |
| ③ brief 修改不引入 G12 范围漂移 | ✅ | `9147e37e` 只删「迁移」二字（Q0c）；`edba89df` Q2 三测试文件单独列出；CI 绿反证无 G12 漂移 |

三处根因逐条核（派单指定）：

| 根因 | 修复 commit | 核实 |
|---|---|---|
| 迁移裸词（brief Q0c「verify-parallel **迁移**改三处」触发铁律47） | `9147e37e` →「verify-parallel 三处改动」 | ✅ `grep -n "迁移\|拆分"` D540 brief = 零命中（exit 1） |
| verify 字面量（brief Done 行 `grep -qF '完成.*迁移'` 命中收窄后正则） | `dff5fa83` → `grep -cF '迁移'` | ✅ D541 brief L51 现为 `grep -cF '迁移'`，无「完成.*迁移」字面量 |
| brief_parser L\d+（brief Q2「pre-commit-check.sh L750」整体当路径 → G12 越界） | `0de94ca6` 去 L750 + `e3a3f440` parse_q2 补 `\s+L\d+$` 剥离 | ✅ brief_parser.py:86 `re.sub(r"\s+L\d+$", "", path)` 与 devdoc_writeset.py:76 同款 |

silent-swallow 4 处（`0e316d0f`）：verify-parallel.sh:297（swallow-ok 注释，失败走 else degraded）+ clone-config-init.test.sh:58（去 `2>/dev/null`）+ clone-shadow-commit.test.sh:134/141（去 `2>/dev/null`）。4 处属实。

**P2 结转**（不阻断）：P2-1 三套测试仍未入 CI 清单（见 §2 系统性发现）；P2-2 worktree 试点提交对证据悬空（归档建议未落实）；P2-3 main 预存 CT 红 → 已由 D543 转绿。

---

### D541 — 铁律47 正则收窄（复审）→ **CONDITIONAL PASS**（P1-1 阻断修复）

**正则收窄正确性**（核心交付）✅：

- `pre-commit-check.sh:754` 现正则：`已拆\|已迁移\|已清理\|拆分.*完成\|迁移.*完成\|清理.*完成\|完成.*拆分\|完成.*迁移\|完成.*清理`
- 旧正则 `拆分\|迁移\|清理.*完成\|已拆\|已迁移\|已清理`（bare 词误伤）已移除
- 复跑 `claim-regex-narrow.test.sh`：T1/T2/T3/T4a-d/T5a 全过——工作描述「verify-parallel 迁移改三处」**不触发**、完成声称「已完成迁移/迁移完成/已拆/拆分...完成」**触发**、空 brief 不触发
- 补充「完成.*X」正序分支（用户给定正则缺此向，而测试要求「已完成迁移」触发）——以测试为规范延伸实现，正确

**V5.2.1 bump + tag** ✅：`.codex/control-tower/VERSION.md` V5.2.1 条目（PATCH，门禁判定逻辑变化）；tag `V5.2.1` 存在（指向 `60c4ae34`）。控制塔版本链 V5.2.0（D540）→ V5.2.1（D541）→ V5.2.2（D542/D543）连续。

**P1-1（本任务引入，需修复）**：`tests/control-tower/claim-regex-narrow.test.sh` 在 main 上**确定性失败**（9 断言仅 8 过，T5b 挂）：

- 根因：测试 L71 硬编码 `sed -n '749p'` 校验「无 brief guard 存在」；但 D542（`1bc711f2` soft_check/warn_check 重构）在 749 行之前新增行，guard 从 749 漂移到 **753**（`grep -n '\[ -f "\$BRIEF" \]' scripts/pre-commit-check.sh` = 753；L749 现为 `TODAY=$(date +%Y-%m-%d)`）
- 实测：`bash tests/control-tower/claim-regex-narrow.test.sh` → `❌ T5b 无 brief guard 缺失` + exit 1
- 加剧：该测试**未接线 CI**（不在 ci.yml 密封清单）→ CI 全绿却掩盖了测试断裂
- **归因**：implement（测试硬编码行号，脆弱）；control-tower（新测试未入密封清单，D540 P2-1 同型复发）
- 修复建议（另起 FIX，禁直接改）：测试改稳健断言（`grep -n '\[ -f "\$BRIEF" \]'` 定位行，而非硬编码 749）；并把该测试 + 本批新测试接入 CI 密封清单

---

### D542 — CI 失败可见性（初审）→ **PASS**

- **显示修复 vs 计数语义零变化** ✅：`pre-commit-check.sh` soft_check（L86-104）与 warn_check（L152-165）——SYNO_CI=1 分支打印 `❌ ... [CI strict]` + `HARD_FAIL+1`；本地打印 `⚠️` + `SOFT_COUNT/WARN_COUNT+1`。HARD_FAIL/SOFT_COUNT/WARN_COUNT 加减条件与位置**原样**（仅显示分支重排）。`log_gate "$name" hit/miss` 保留。
- **「N 组未通过」可定位** ✅：CI strict 下每组失败打印 ❌ 行（含检查名），不再只有 ⚠️ 无组名。
- **配对测试** ✅：`bash tests/control-tower/ci-strict-visible.test.sh` = 6/6 绿（接线/本地⚠️/CI❌/warn 同型/边界 miss）。
- **P2**：`ci-strict-visible.test.sh` 未入 CI 密封清单（见 §2）；且其 `extract_helpers` 用 `sed -n '42,44p;47p'` 硬编码行号，与 D541 同款脆弱性（当前仍绿）。

---

### D543 — 密封 canary 转绿 + 解析器对称（初审）→ **PASS**

- **CI 双平台 canary 两周来首次绿** ✅（check-runs 实证）：D543 head `9b8b3982b6` → `Control Tower Gate Tests (ubuntu-latest)=success` + `(windows-latest)=success`（D540/D541 时代两者均 failure）。
- **post-commit-marker 断言对齐 D521 hook 登记** ✅：`e3a3f440` 将 S1a/S6a/S6b/S7/S8 期望从「0 行」改为「新增 1 行 COMMITTED」（D537 #4 hook 层登记设计意图）。复跑 `bash tests/control-tower/post-commit-marker.test.sh` = **18/18 绿**。
- **S10 密封性（new_repo 显式 init -b main）** ✅：`3b1a65a9` — `git init -b main` + 旧 git 版本回退 `branch -m main`（CI runner 默认 master 致 `checkout main` 依赖名漂移的根治）。
- **parse_q2 剥 L\d+ 后缀** ✅：`brief_parser.py:86` `re.sub(r"\s+L\d+$", "", path)`，与 devdoc_writeset.py:76 同款正则（两解析器对称）。复跑 `brief_parser.test.sh` = 6/6 绿；`brief-parser-strip.test.sh`（含新增 L750 fixture）已入 CI。
- **P2**：`brief_parser.test.sh`（同名配对测试）未入 CI 密封清单（但语义已由已接线的 `brief-parser-strip.test.sh` 覆盖，风险低）。

---

### D544 — 左栏验收合并（初审）→ **CONDITIONAL PASS**（P1-2 证据未入库）

**8 条验收逐条核**（§六 设计文档，对照实现 file:line）：

| # | 验收 | 核实 | 证据 |
|---|---|---|---|
| 1 | 左栏能力位（搜索下、最近对话上、4 项一行一） | ✅ | LeftPanel.tsx:165-194 cap-section + CAP_ICON 4 项 |
| 2 | Lucide 线性 SVG 无 emoji（Radar/RefreshCw/ListChecks/Users） | ✅ | LeftPanel.tsx:11 import Lucide + :25-30 CAP_ICON 映射；`grep -rn "emoji\|💬\|📁\|🏢" electron-renderer/src/components/LeftPanel.tsx` 零命中（存量 emoji 已 Lucide 化，`04bfbc23`） |
| 3 | 右栏四联动 | ✅ | RightPanel.tsx:643-648 CAP_DETAIL_VIEW reach/loops/action/ga → ReachDetail/LoopsDetail/ActionDetail/GaDetail；:670-671 selectedCap 分派 |
| 4 | 取消选中回默认视图 | ✅ | capability.ts:31-33 `toggleCap: current===next→null`；RightPanel.tsx:670-672 null→默认视图（注：默认视图实为 4 标签 GAWorkspaceTabs/仪表盘，非设计稿字面「三标签」，语义等价） |
| 5 | GA 权限置灰 | ✅ | capability.ts:43-46 canAccessCap fail-closed；LeftPanel.tsx:122/172/179/181-182（disabled 类 + aria-disabled + title「仅 GA 可用」） |
| 6 | 折叠态图标条 | ✅ | LeftPanel.tsx:273-293 collapsed 4 能力 Lucide 图标条 |
| 7 | 代码质量 as any=0/接线/降级/expect | ✅ | `grep -rn "as any" electron-renderer/src/` = 0；capability.ts 6 export 在 LeftPanel/RightPanel 15 处调用；catch→console.warn+setXBadge(null)（铁律24/31）；capability.test.ts 23 用例 39 expect |
| 8 | 术语无 FDE | ✅ | `grep -rn "FDE" electron-renderer/src/` = 0 |

**三接口接线** ✅（注意：派单所列 `/api/signals` 是**伪路径**，实际为 `/api/sentinel/signals`）：

- `/api/sentinel/signals`：LeftPanel.tsx:73 + RightPanel.tsx:466；后端 sentinel.ts:46 `router.get('/signals')` + server.ts:342 `app.use('/api/sentinel', ...)` 挂载
- `/api/loops/status`：LeftPanel.tsx:83 + RightPanel.tsx:533；loops.ts:80
- `/api/actions`：LeftPanel.tsx:96 + RightPanel.tsx:600；actions-api.ts:54

**GA 置灰渲染分支** ✅：LeftPanel.tsx:172/179 disabled 分支（非隐藏，`看不到/置灰` 二选一均满足）。

**孤儿实现收口** ✅：D538 910 行（LeftPanel/RightPanel/capability 等 10 文件）经 `c7857401`（PR #266）合并进 main，975 insertions。

**P1-2（需修复）**：D544 brief Done 标准声称「evidence/D544/chapter2-acceptance.md、chapter3-wiring.md 落盘」，但**该两文件在 git 全历史零记录**（`git log --all -- "*chapter2-acceptance*"` = 空；`git ls-files | grep evidence/` = 空）。D544.json 亦自注 spec「待补交入库」。验收证据链（8 条标注 + 3 接口断言）仅存于 worktree，未提交 → 与 D356 P1-2 / D539 P1 同型（M7 文档-实现漂移）。K3 本次已按代码独立复验 8 条验收 + 3 接口（见上表），证据链已重建，但**交付方须补交证据文件入库**。

**P2（派单质量）**：D538/D544 派单「后端接口 /api/signals（sentinel.ts:46）已核实存在」**不实**——sentinel.ts:46 是相对路径 `/signals`，经 server.ts:342 挂载后全路径为 `/api/sentinel/signals`，不存在 `/api/signals`。实现方在 LeftPanel.tsx:72 注释正确识破（「派单/设计的 /api/signals 是伪信息」）。派单核实未覆盖 mount 前缀。

---

### D546 — 哨兵 findings 事件化验收（初审）→ **PASS**

**src 零改动** ✅：`git diff --name-only 8432c2ae..388cc108` = `.claude/bypass.log` + `task-state/D546.json` + 3 个测试文件（sentinel-events-contract.test.ts 403 行新建 / durationms-regression.test.ts 236 行新建 / sentinel-events.test.ts 130 行改）。事件化本体（sentinel_events append-only + I1/I2/I3）已由 D394 片1（`a8a5857e`，2026-08-17，已 K3 PASS）交付，D546 是收口（只补测试）。

**3 测试真实性** ✅：
- 契约对齐（sentinel_events vs session_events 信封 C1-C6 + 双线映射同构 + C7 双形态）：sentinel-events-contract.test.ts 实质性断言
- 回放 sha256 全投影等价：sentinel-events.test.ts（直写投影 vs rebuildFromEvents 重放投影 canonical-JSON sha256 全等 + 删事件注入 red）
- durationMs 回归网：durationms-regression.test.ts 4 用例（真实 check durationMs ∈ (0,60000] + 纪元防护年份 ≥2026 + sentinel-service L97 来源锁定 + 历史缺陷形态 `new Date(durationMs).toISOString()` 注入 red）

**诚实声明核实（派单交付要求 #3）——两条均属实**：

| 声明 | K3 独立核实 | 结论 |
|---|---|---|
| 派单所列 runner.ts 5 处 durationMs「恒 1970」与代码不符，均为正确 duration 语义 | 逐一实读 runner.ts:363/724/773/1081/1134/1142/1149/1155 —— 全部为 `Date.now() - startTime`（真实耗时），无一处 `new Date(durationMs)` | **属实**（派单位置有误） |
| 历史缺陷在 src/agent/sentinel-service.ts:97 且已随 a8a5857e 修复 | `git show a8a5857e -- src/agent/sentinel-service.ts`：`- checkedAt: new Date(run.result.durationMs).toISOString()` → `+ checkedAt: run.result.checkedAt`（`new Date(小数值durationMs)` 正是「恒 1970」根因，K3 症状描述准确但**位置误记为 runner.ts**） | **属实** |

**诚实性判定**：实现方在派单信息有误（位置从 sentinel-service.ts:97 误标为 runner.ts）的情况下，逐行实读定位真凶、不做伪修复、只补回归网，并在 spec §4.1/§7 如实标注。这是**编码诚实性的正面样板**。

**P2（派单质量）**：派单「durationMs 时间戳 bug（K3 发现）：runner.ts L363/724/773/1081/1134」位置错误——真凶在 sentinel-service.ts:97，已于 D394 片1（a8a5857e）修复。派单未核 K3 原文的 file:line 就照搬位置清单。

---

### D547 — 骨架 brief 门禁（初审）→ **PASS**

- **门禁逻辑** ✅：`pre-commit-check.sh:858-867`（`187c7460`）——遍历 STAGED_ALL 中 `.claude/task-briefs/*.md`，含 `认领: <agent>` 或 `<本任务在哪一层` → `hard_check` 硬阻断（本地+CI 均硬）。
- **防误伤** ✅：`grep -rl "认领: <agent>\|<本任务在哪一层" .claude/task-briefs/` = 零命中（当前 492 个已填 brief 无占位符）；`b8de815a` 已清理误入 main 的骨架 brief（D545 删 + D546 覆盖）。
- **配对测试** ✅：`bash tests/control-tower/skeleton-brief-gate.test.sh` = 6/6 绿（接线/降级×2 占位符触发/正常填好不触发/边界路径过滤）。
- **P2**：`skeleton-brief-gate.test.sh` 未入 CI 密封清单（见 §2）。

---

## 2. 系统性发现（L4 防线缺口收割）

**P1-3（系统级，跨 D540/D541/D542/D547）**：本批新产出的 4 个密封（hermetic，纯 mktemp/grep 自包含）bash 门禁测试**均未接线 CI 的「Control Tower Gate Tests」密封清单**（ci.yml L134-154 显式 `for t in ...` 列表，仅 19 个）：

| 新测试 | 任务 | 密封性 | CI 接线 | 现状 |
|---|---|---|---|---|
| claim-regex-narrow.test.sh | D541 | hermetic | ❌ 未入 | **已断裂**（T5b 行号漂移），CI 无法察觉 |
| ci-strict-visible.test.sh | D542 | hermetic | ❌ 未入 | 绿但无回归保护 |
| skeleton-brief-gate.test.sh | D547 | hermetic | ❌ 未入 | 绿但无回归保护 |
| clone-config-init / clone-shadow-commit / verify-parallel-ci | D540 | hermetic | ❌ 未入 | 绿但无回归保护 |

**本该拦住的防线**：ci.yml 密封清单是「门禁坏了能抓到」的 canary（ci.yml L127-129 注释明言）。新门禁机制的配对测试不进清单 = 门禁的回归保护真空。D540 上轮报告 P2-1 已点名此缺口（「三套新测试未接入 CI 密封清单」），本批**不仅未修复，反而新增 4 个未接线测试，且 D541 测试已实际断裂而 CI 全绿**——P2 升级为 P1（M3 机制建成未接线 + M2 声称「9 断言测试」实为 8 过 1 挂）。

**缺什么（防再犯，一机制，收敛到既有 M3 防线）**：
- 把「新门禁脚本的配对测试必须进 CI 密封清单」作为**门禁脚本变更的接线验收项**（对齐铁律 0-2 Step 5 WIRE CHECK 语义：测试调用不计，但 CI canary 是生产调用点）。`check-canary-drift.sh`（D526）已有「tests/*.test.sh vs CI canary 清单对账，漂移双向点名」机制——但它只 `::warning` 不阻断（派单明确防误伤），且 D541 断裂是「测试内容错」而非「测试未入清单」，drift 检查抓不到「测试内容漂移后仍挂」。

---

## 3. 归因汇总

| 发现 | 级别 | 归因 | 改哪个预设/脚本 |
|---|---|---|---|
| D541 claim-regex-narrow.test.sh 断裂（硬编码行号漂移） | P1-1 | implement | 测试禁止硬编码 `sed -n 'Np'` 行号，改 `grep -n` 定位；门禁脚本测试须覆盖「后续 commit 加行」的漂移场景 |
| D544 证据文件未入库（chapter2/3） | P1-2 | implement | 交付 evidence/ 产物必须同 commit 入库（S-6/M7 已入 skill，执行层未守） |
| 新测试未入 CI 密封清单（D540/D541/D542/D547） | P1-3 | implement + control-tower | 门禁脚本变更的接线验收 = 配对测试进 CI canary（强化 M3 已有防线） |
| D538/D544 派单 /api/signals 路径不实 | P2 | devdoc（派单） | 派单接口清单须核 mount 前缀（`grep app.use` 全文径） |
| D546 派单 durationMs bug 位置误标 runner.ts | P2 | devdoc（派单） | 派单引用 K3 发现须核原文 file:line（K3 原文症状准确、位置未核） |

**台账 M 映射**：P1-3 = M3（机制建成未接线）二次复发；P1-2 = M7（文档-实现漂移）/ M2（声称 vs 事实）；两 P2 = 派单质量（M2 变体）。均命中既有 M 类 → 强化该类防线，不开新 M 类。

**控制塔缺陷（CTO 队列）**：`check-canary-drift.sh`（D526）只告警不阻断，且无法抓「测试内容漂移后仍挂」——canary 漂移检测需升级为「清单内测试失败 = CI 红」（现已如此）+「新密封测试未入清单 = 阻断或 P0 告警」。

**审计脚本缺陷**：无（K3 自身防线未见缺口）。

---

## 4. 北星裁决（跑偏第二道）

本批全部为治理层（控制塔门禁/L0 工具层）+ 品牌表层（D544 桌面端左栏）+ 领域核心（D546 哨兵测试收口）任务，无方向跑偏：

- 问 1 服务真实用户场景：治理任务真实用户 = 多 Agent 开发线 + 数据链路（同 D539/D540 先例）；D544 桌面端 = 品牌表层（施工图 🟢 死守）；D546 = 哨兵监测线（护城河 = 本体被真实数据验证的速率）。**过**。
- 问 2 更接近终态：门禁收窄/失败可见性/canary 转绿/骨架门禁 = 控制塔「零 AI 自律」终态正向一步；D544 孤儿实现收口 = 桌面端终态（能装能开能用）推进。**过**。
- 问 3 变味：src/ 产品代码零改动（D546 显式零改动；D540/D541/D542/D543/D547 均 scripts/ 门禁），Synova 仍是驻扎企业诊断 Agent。**过**。
- **裁决**：对齐，无跑偏发现。

---

## 5. 结论与流转

| D# | verdict | blockers |
|---|---|---|
| D540 | **PASS**（复审，P0-1 闭环） | 无（P2 结转：测试入 CI 清单见 P1-3） |
| D541 | **CONDITIONAL PASS**（P1-1 阻断修复） | P1-1 测试断裂+未接线（file:line: claim-regex-narrow.test.sh:71 + pre-commit-check.sh:753） |
| D542 | **PASS** | 无（P2：测试入 CI 清单） |
| D543 | **PASS** | 无 |
| D544 | **CONDITIONAL PASS**（P1-2 补交证据） | P1-2 证据文件未入库（chapter2-acceptance.md/chapter3-wiring.md） |
| D546 | **PASS** | 无（诚实声明核实属实） |
| D547 | **PASS** | 无（P2：测试入 CI 清单） |

**放行建议**：D540/D542/D543/D546/D547 可直接放行。D541 与 D544 各带 1 个 P1，需另起 FIX 任务（审计闭环铁律：禁直接改原任务）：
- FIX-D541：claim-regex-narrow.test.sh 改稳健断言 + 本批 4 新测试接入 CI 密封清单。
- FIX-D544：补交 evidence/D544/chapter2-acceptance.md + chapter3-wiring.md 入库。

**CI 现状附注（不阻断，转 CTO）**：main 头 `8aa06afa` 的 check-runs 含 desktop-build job `build=failure`（Electron 桌面构建红）——与本批治理任务无关（本批零 electron 构建改动，D544 仅前端源码），属桌面端构建线独立问题，转 CTO 队列。
