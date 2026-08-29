# D501-D550 impl-done 处置批 — K3 独立审计（17 任务初审 + D515 补报告）

> 审计员: Kimi K3（独立会话，零上下文）| 2026-08-29
> 分支: `audit/k3-20260828-impl-done`（基于 origin/main @ 7b8921cf——CTO ③′ 物理复核后的证据指针版）
> 派单: CTO 2026-08-29 ③′「17 任务审计派单证据指针修正版」
> 方法: 7 项材料自收集 + 物理复现（命令+断言+预期输出）+ CI check-runs API **job 级**结论（禁整体 run 结论，D320 假红教训）
> 运行环境: macOS（DSH 审计沙箱，workspace-write）。注意: 本机无 `python` 命令（仅 python3）、无 GNU `timeout`——环境依赖失败已逐一区分（D316 教训）。

---

## 〇、总结论表

| D# | 内容 | verdict | 关键发现（file:line） |
|----|------|---------|----------------------|
| D501 | as-any 检查排除测试文件 | **PASS** | 排除落地 pre-commit-check.sh:467/469；19→0 机制复现（D471 3c9e88e0 10 处全消）；P2 注释路径陈旧 |
| D508 | 提交流程减负四项 | **CONDITIONAL PASS** | P1: merge-base 化数学恒等无效应（`A..B ≡ merge-base(A,B)..B`），死循环根治实际来自 D513 fetch 刷新；--check/brief 骨架/登记提前属实 |
| D509 | union driver + G12 回归 main | **CONDITIONAL PASS** | P1: g12-day-window.test.sh 在 main 缺失（6d6e4d0b API-merge 树误用丢失）；P2: g12-taskstate-exempt 裸 python 环境陷阱 |
| D513 | 控制塔四项返修 | **PASS** | 四项 file:line 全核实 + 4 测试绿 |
| D515 | 控制塔 V5.0.0 减负重构 | **FAIL（补报告）** | K3 2026-08-24 结论收录（P0-1 CI 权威幻觉 / P1-1 三重复制 / P2×3）；报告文件随本批入库 |
| D516 | D515 返修 CI strict | **CONDITIONAL PASS** | P0-1/P1-1 闭合（SYNO_CI strict 7/7 + 去重 1444→771）；P1: tag V5.0.0 重打未执行（仍指 8cdf9957 = FAIL 态树）；P2: 503d04ca Vitest 2/2 job 红 |
| D520 | 跨平台适配收口 | **PASS** | eol=lf + renormalize（D533）；PYBIN 三级探测；双平台 CI job 级绿（a8c9f8bb CT ubuntu+windows success；build 失败为存量，958e5d5d 已红） |
| D521 | 提交链路收敛 | **PASS** | tag 时机/竞态/parser/CI 全属实；专项: auto-hook 路径限定缺陷**确认存在**（8b6deaf4 卷带 905 行实证），已由 D554 修复并验证；P2: simulate-ci 全绿桩用例环境敏感 |
| D524 | D518 prod 契约返修 | **PASS** | C2 闭合：旧契约 0 / 新契约 9 处 / vitest 17/17 |
| D525 | synova-commit 测试红态修复 | **PASS** | 红态根因 = D508 移除 D507 内联段；重写对齐 staging_guard 现行为，8/8 绿 |
| D526 | canary 漂移告警 | **PASS** | 双向漂移告警实现+接线 ci.yml:166+实测触发（64 项曝光）+11/11 |
| D534 | Agent Notes 四态 | **PASS** | 四态目录/触发面扩展/铁律49 AGENTS.md:60/git mv 语义/测试 10/10 |
| D535 | guard 循环卫生+超时 | **CONDITIONAL PASS** | P1: 4b 跨平台修正未随手动应用进 main → incident-loop.test.sh macOS 恒红 7/8（声称 8/8 不实） |
| D537 | 并行污染+提交链摩擦根治 | **CONDITIONAL PASS** | #1-#5 逐条 file:line 属实；P1: "#6 双平台全绿"与 job 级证据矛盾（e4cb41ab CT 双红，红态存续 ~2 天）；L4: CI 红未阻断合并 |
| D538 | 前端左栏 Codex 风格 | **PASS** | 设计一致性/lucide 无 emoji/三接口接真数据（sentinel.ts:44+loops.ts:80+actions-api.ts:54）/GA 置灰不伪造/23/23 |
| D549 | sealed-tests-ci-canary | **FAIL** | PR #272 只含 task-state 注册，零代码；声称的 T5b 动态 grep + canary 19→25 双双未落地；claim-regex-narrow.test.sh 硬编码 '749p' 恒红且不在 canary（CI 不可见） |
| D550 | alloc-origin-merge 发号器 | **PASS** | REMOTE_USED 合并+注入缝+撞号不复现（空本地→D558>557）+13/13 |

**批次统计**: PASS ×10 / CONDITIONAL PASS ×5 / FAIL ×2（D515 历史结论 + D549 本批判定）。
**P1 合计**: 7 条（D508-1 / D509-1 / D516-1 / D535-1 / D537-1 / D549-2）。**P0**: 0（D515 的 P0-1 已由 D516 修复并复验）。

---

## 一、D515 补报告（FAIL 结论收录段）

> K3 2026-08-24 已出具 FAIL 报告，但报告文件从未入库（untracked 仅存工作树，CT-40 同型：契约文档入库硬要求）。
> 本批将该报告原文入库（`docs/synova/audit-reports/2026-08-24-D515.md`）+ 结论收录如下 + task-state audit 段回填。

### verdict: **FAIL**（P0 阻断——「CI 为权威」前提不成立，约 20 项安全检查执法真空）

| 项 | 结论 |
|---|---|
| 13 项交付 | 结构/接线/测试/CI/红线大体属实（6 新测试 57 断言全绿、CI 3 run 全 success、scripts/audit/ 零触碰） |
| P0-1 致命缺陷 | 项3「CI 为权威」是幻觉：软化的 ~20 项检查在 CI 跑的是同一份软脚本，本地+CI 双双放行（pre-commit-check.sh:80-93 soft_check 只计 SOFT_COUNT；:1430-1443 判定只看 HARD_FAIL；ci.yml:47 无任何 strict 分支）→ 门禁形同虚设 |
| P1-1 附加缺陷 | 核心脚本三重代码复制（log_gate/soft_check/v5_soft/SYNO_FASTLANE 等 7 块各 ×3，~200 行重复）——「减负」任务自身增负 |
| P2-1 | version.log 运行时「auto-tag V9.9.9」污染（与 D511 同型，系统性存量） |
| P2-2 | tag V5.0.0 指向 8cdf9957（非分支头，3 个补记提交在 tag 外） |
| P2-3 | 报告「G12d 保持 hard」措辞不精确（U4 D423 对照表分支实际改软） |
| 北星 | 方向不偏离（infra 任务）——技术/执行缺陷，非方向偏离 |
| 归因 | devdoc（spec §0.2 未物理核验）+ control-tower（缺「hard→soft 降级必须附 CI 硬兜底存在性证明」门禁） |

**来源**: 报告原文 docs/synova/audit-reports/2026-08-24-D515.md（2026-08-24 出具，本批入库）。修复任务 = D516，本批已复审（见 §三 D516 节）。

---

## 二、逐任务审计（L1-L4）

### D501 — as-any 检查排除测试文件（40d058d5）→ **PASS**

| 审计点 | 命令 + 断言 + 预期 | 结果 |
|---|---|---|
| ① pathspec 落地 | `grep -n "AS_ANY_DIFF" scripts/pre-commit-check.sh` → 现 main :467（CI 分支）/:469（本地 cached 分支）均含 `:(exclude)**/*.test.ts` `:(exclude)**/*.test.tsx` `:(exclude)**/*.d.ts` | ✅ 与 D501 提交一致（40d058d5 后存活于 main） |
| ① 与 findTsFiles 语义一致 | D501 时代 findTsFiles（05-as-any-audit.test.ts:44）= `endsWith('.ts') && !endsWith('.d.ts') && !endsWith('.test.ts')`；pathspec 排除 .test.ts/.test.tsx/.d.ts → 同语义（.test.tsx 为 TSX 超集，方向一致「只查生产代码」） | ✅ 语义一致 |
| ② 19→0 实测可复现 | 复现命令: `git diff df0a0af7...3c9e88e0 -- src/ packages/`（D471 引入 fixture）→ `grep -cE 'as any\b'` = **10**（无排除）；加 3 个 exclude pathspec → **0** | ✅ 机制成立（精确值 19 为当日 CI SYNO_DIFF_BASE 口径，不可回溯，机制为审计对象） |
| ③ 生产文件无残留误伤 | 加 exclude 后对 D471 范围 grep `as any` = 0 命中（10 处全在测试 fixture 内） | ✅ 无误伤 |

- **P2-1（注释路径陈旧）**: pre-commit-check.sh:464 注释称「与 findTsFiles（packages/test-kit/src/security-scanners.ts）排除规则一致」——该文件无 findTsFiles（D501 时代起函数就定义在测试文件内）。归因: implement（注释引用未核实）。
- **北星**: infra 修复，方向不偏离。
- **L4**: 无新缺口。

### D508 — 提交流程减负四项（4982f978）→ **CONDITIONAL PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① check-bypass-log merge-base 化正确性 | 物理验证: `A..B ≡ merge-base(A,B)..B` 是 git 恒等式（实测两场景: ①merge main 后 ②stale ref + 新 main 均新旧范围相同）。4982f978 把 `git log "$BASE..HEAD"` 换成 `git log "$MB..HEAD"` → **行为零变化**。测试 fixture（merge main 后 main 侧不索补记）在旧代码下同样通过——测试是终态断言，无法区分机制 | ❌ **P1-1 声称不实**（M2）: 「对账 merge-base 化（死循环根治）」物理不成立。真正的根治是 D513/③ 防御性 fetch 刷新（check-bypass-log.sh:26-37，Win 37dc1cae 根因: `git push <URL>` 不更新 tracking ref）——D513 注释自认「merge-base 化失效」 |
| ② --check 全量 | synova-commit `--check` 段（4982f978:379-437）: plan-integrity + pre-commit 13 组 + commit-msg 三段汇总输出，exit 1 汇总失败，不 commit 不 push | ✅ 属实（「7 轮逐个揭穿→1 轮看全」目标达成） |
| ③ brief 骨架 | alloc-task-id.sh:125-169 生成六字段骨架（Q0/Q1/Q2/Q3/架构层/Done） | ✅ 属实 |
| ④ D331 对账范围 | COMMITTED 登记提前到 commit 成功瞬间（synova-commit:643-645）+ 降级路径同样登记（:548-549） | ✅ 属实（证据链不因 push 失败/降级丢失） |
| 测试 | check-bypass-log.test.sh 5/5（含 D513/③ 用例）+ synova-commit.test.sh 8/8 | ✅ |

- **P1-1**（归因: implement——机制误判 + control-tower——测试无机制区分断言）: merge-base 化声称不实。影响评估: 无害（范围恒等），但「根治」归因错误掩盖了真根因（stale ref），若 D513 未随后修复，死循环仍会复现。台账 M2 家族。
- **北星**: infra 任务，不偏离。**L4**: 无新缺口（D513 已补真根因）。

### D509 — union driver + G12 修复回归 main（dbdcdbcf）→ **CONDITIONAL PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① union driver 接线 | .gitattributes 追加 `.claude/reference-map.md merge=union`（dbdcdbcf）；driver 注册 = install-hooks.sh:141 `git config merge.union.driver "git merge-file --union %A %O %B"`（复用，无需新注册） | ✅ |
| ② G12 修复进 main | 现 main pre-commit-check.sh:1196-1210: `DAY_WINDOW_RE=$(python3 ...)` + `[[ $b =~ $DAY_WINDOW_RE ]]` ERE（case 变量展开 fail-open 修复） | ✅ D506 P0-1 修复确实在 main |
| ③ g12 测试 10/10 复跑 | **物理事实**: `git ls-tree -r origin/main --name-only \| grep g12-day-window` = **空**。该测试在 2370fc88（D506）创建，6d6e4d0b（V4.9.0 chore，API-merge 树误用）后从 main 消失，此后任何分支均未恢复（`git log --all --follow` 仅一条记录） | ❌ **P1-1 声称无法复现**（M2/M7 家族）: dbdcdbcf 提交信息称「Verified: g12-day-window.test.sh 10/10」，但该文件在 main 不存在（提交时已丢失）——声称只能在残留旧工作树成立。G12 认领窗口逻辑现无配对回归测试 |
| 附带 | g12-taskstate-exempt.test.sh 本机首跑 2/7 红 → 根因 = 测试用裸 `python`（本机仅 python3，macOS 常态）→ 加 python shim 后 **7/7 绿** | **P2-1**（M5 家族）: 环境依赖测试缺陷（PYBIN 未对齐，CT-5 队列），非恒失败。CI Ubuntu 有 python → CI 绿 |

- **归因**: P1-1 → control-tower（API-merge 树误用丢失配对测试且无「测试文件存在性」对账门禁）；P2-1 → implement（裸 python）。
- **北星**: 不偏离。**L4**: 「测试文件在 main 的存在性对账」——D526 的 canary 漂移告警（08-25 落地）正是此类防线，D509（08-23）时该防线不存在；此缺口已被后续机制覆盖。

### D513 — 控制塔四项返修（90d787c2）→ **PASS**

| 项 | file:line | 验证 |
|---|---|---|
| ③ 对账 base 防御 | check-bypass-log.sh:26-37（fetch tracking ref，失败显式降级；D515 项9 加显式提示） | ✅ Win 37dc1cae 真根因修复 |
| ① D328 merge 豁免 | commit-msg-check.sh:8-13（MERGE_HEAD 存在 → exit 0） | ✅ 与 CT-45/D530 后 merge 豁免体系一致 |
| ② PYBIN 探测 | verify-parallel.sh:67-78（python3/python/py 三级 + import sys 可用性探测，探测失败显式降级） | ✅ 第三处漏网清零 |
| ⑤⑥ brief 指向 | task-start.sh:34-37（恢复写 current-brief，ls -t 取最新 mtime）；hook-block-write.sh:118-119（find\|head -1 → ls -t） | ✅ |
| 测试 | commit-msg-merge / task-start / hook-block-write / verify-parallel（5/5 含 PYBIN 接线）全绿 | ✅ |
| 版本 | VERSION.md V4.9.1 + brief Q2「不改 .github/workflows」diff 核实零 yml | ✅ |

- **北星**: 不偏离。**L4**: 无新缺口。thin 测试（1-2 断言/文件）为接线级断言，本审计已逐项代码级补验。

### D516 — D515 审计返修 CI strict（503d04ca）→ **CONDITIONAL PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① SYNO_CI strict 软转硬断言 | ci.yml:50 `SYNO_CI: "1"`（Iron Laws job 注入，注释 D516/K3 P0-1）；pre-commit-check.sh:87-88（soft_check）、:105-107（v5_soft）、:135-136（warn_check）SYNO_CI=1 → HARD_FAIL++；现 main 三者各定义 1 次仍存活 | ✅ P0-1 闭合。实测 ci-strict-mode.test.sh **7/7** |
| ② 三重定义去重 | 现 main: log_gate()/soft_check()/v5_soft()/HARD_FAIL=0 各 **1** 次；文件 1444→771 行（-673） | ✅ P1-1 闭合。残留: SOFT_COUNT=0 ×3（:44-46 幂等赋值）+ 注释块重复（:115-124）→ **P2-1** 记（无功能影响） |
| ③ P2×4 逐条闭合 | ① version.log V9.9.9 清除: version.log 为运行时文件（`git ls-files` 无），本工作区 .codex 无该日志 → 不可核（P2 级）⏸；② D515 impl.files 修正: 现 task-state/D515.json files 含 task-state/D516.json + ci-strict-mode.test.sh（21 项）✅；③ 报告措辞（G12d）: VERSION.md V5.0.0 条目精确列出「特例 G12d 生成物单点（D458）、G13 技能同步（D370）」✅；④ **tag V5.0.0 重打: 未执行**——tag 仍指 8cdf9957，其树 = 1444 行三重复制版 + SYNO_CI=0（K3 FAIL 态树）；D516 memory Note 自记「待合并后重打」 | ⚠️ **P1-1 tag 锚点断裂（M6 家族）**: V5.0.0 语义锚点指向 FAIL 态树，`git checkout V5.0.0` 拿不到 CI strict 修复。归因: implement（待办未闭环） |
| 附带 | 503d04ca job 级 CI: Vitest (2/2) failure + (1/2) cancelled（TS+CT 绿）；35e71b8c（D515 合并）Vitest 双绿；a8c9f8bb（下个 PR）Vitest 双绿 → 失败为 D516 提交瞬时态，已被后续恢复 | **P2-2** 记（失败细节因匿名 API 无日志权限不可核） |

- **北星**: 不偏离。**L4**: 「tag 待办不闭环」——版本编排无「memory Note 中待办 → 强制后续动作」机制；CT-35 只查「声称版本号→bump」不查「tag 待重打」。归 control-tower 队列。

### D520 — 跨平台适配收口（248e290f，PR #157 合并 a8c9f8bb）→ **PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① .gitattributes eol + renormalize | `*.sh text eol=lf` + `*.py text eol=lf`（D520 b8e1eb20）；renormalize 15 脏文件（D533 f540085a）+ `scripts/audit/** -text`（K3 红线）+ `scripts/control-tower/*.py -text`（CT-40 豁免）。实测 `git ls-files --eol`: 全部 .sh LF；仅 4 个 .py 为 CRLF = 全部在 -text 豁免名单内 | ✅ 终态正确 |
| ② PYBIN 回退链 | verify-parallel.sh 三级探测（D513）+ task-start.sh _PAR_N 双步清洗（tr -d '\r\n' + 数字清洗，Win 并行隔离空转病根）+ PLATFORM-CHECKLIST.md 第 1 条修法 + pre-commit-check.sh:1363-1378 平台敏感命令软检查接线 | ✅ |
| ③ fastlane | fastlane-bypass-only.test.sh 密封进双平台 canary（ci.yml 矩阵）+ platform-checklist.test.sh 14/14 | ✅ |
| ④ 双平台 CI 绿实证 | **job 级**（a8c9f8bb = PR #157 合并）: Control Tower Gate Tests (ubuntu-latest) = success / (windows-latest) = success / TypeScript+Lint+Iron Laws = success / Vitest 1/2+2/2 = success / Golden Case F1 = success。`build` job failure = **存量**（desktop-build.yml，958e5d5d 时已红，D529 08-25 修复——非 D520 引入） | ✅ 声称范围绿 |

- **北星**: 不偏离。**L4**: 无新缺口。

### D521 — 提交链路收敛（40b90520，PR #172）→ **PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① tag 时机 | V5.0.3/5.0.4/5.0.5/5.1.0/5.1.1 全部指向 main 上提交（无分支 tag、无孤儿 tag） | ✅ §6 纪律落地 |
| ② bypass 竞态 | COMMITTED 登记挪 post-commit hook 层（post-commit.sh:69-94，任何裸 git/synova-commit 过检后立即成对登记，marker message 防递归，--no-verify 不登记不洗白）；post-commit.test.sh **12/12** | ✅ 竞态根治 |
| ③ parser 语义 | brief_parser.py 剥壳对称（exclude 剥「不改+（）」/include 动词前缀剥壳）；brief-parser-strip.test.sh **12/12**；tag-ancestry **8/8**；bypass-precommit.test.sh 已被 D537 #4 的 post-commit.test.sh 取代（supersession 非丢失） | ✅ |
| ④ CI | simulate-ci.sh（CI 等价三件套 + 清单从 ci.yml 单源提取 + 防递归排除自身）；**job 级**（40b90520）: TS+Iron Laws / CT ubuntu / CT windows / Vitest ×2 / Golden Case / npm audit / Architecture 全 success（build/windows-nsis/macos-dmg 为 desktop-build 存量失败，D529 修复线） | ✅ |
| **专项: auto-hook 路径限定（CT-43）** | 缺陷**确认存在**: 8b6deaf4（08-28 21:26）「chore: bypass COMMITTED 登记 (auto hook, D521)」卷带 dsh/plugins/synova-dashboards/** 7 文件 905 行（D552 实证，M8 变体——D311 guard 阻断后遗留 staged 文件被影子提交整体卷入）。修复 = D554（d245f5f4/91f52fcb, 08-28 22:40, 在 main）: post-commit.sh:87 改 `git commit --no-verify -q -o -m "..." -- "$ROOT/.claude/bypass.log"`（`-o` + pathspec 只提交 bypass.log，不消费他人 staged）。实测: 修复后全部 auto-hook 提交均只含 bypass.log（cb58d68f/38531330/… 均 1 file changed）；post-commit.test.sh 12/12 含「foreign.txt 未卷入/仍留暂存区」断言 | ✅ 缺陷已修且测试覆盖（D554 在批外，本专项结论: D521 原始实现有路径限定缺陷，已被后续任务修复并验证） |
| P2-1 | simulate-ci.test.sh「全绿桩→exit 0」用例**环境敏感**: 桩只替代 pre-commit，simulate-ci.sh 仍跑真实 canary 19 测试——本机 fastlane-bypass-only 耗时 5s≥3s 断言红 → simulate-ci 红 → 用例红（6/7）。CI runner 更快故 CI 绿 | **P2-1** 归因: implement（stub 不完整，测试头部声称「零真实仓库门禁执行」与实现不符） |

- **北星**: 不偏离。**L4**: 卷带事故（8b6deaf4）本该被「影子提交写集=bypass.log 单文件」的门禁拦住——修复前无此门禁；D554 修复 + 测试断言后防线成立。归 control-tower（已闭环）。

### D524 — D518 dev doc prod 契约返修（532aaa41 + 77bdaa8c）→ **PASS**

| 审计点 | 命令 + 断言 + 预期 | 结果 |
|---|---|---|
| C2 旧契约清除 | `grep -c 'node dist/src/index.js' SYNOVA-IMPL-DSH-D518-single-entry-20260824.md` → **0** | ✅ |
| C2 新契约覆盖 | `grep -n 'dist/backend.mjs'` → **9 处**（:27/:32/:48/:55/:56/:57/:58/:76/:105——覆盖 §2/§4/§5.1/§7/DS3） | ✅ 覆盖 §2:32/§5.1:55-58/§7:76（K3 C2 要求的三处） |
| ELECTRON_RUN_AS_NODE | 3 处（:32/:56/:58） | ✅ |
| 物理实现一致 | backend-spawn.cjs:70 `{ bin: process.execPath, args: ['dist/backend.mjs'] }` + 测试 backend-spawn.test.ts:235 断言 | ✅ doc=代码=测试三方一致 |
| 测试复跑 | `env -u ELECTRON_RUN_AS_NODE npx vitest run tests/electron/backend-spawn.test.ts` → **17/17 绿** | ✅ 与 recheck 声称一致 |
| 红线 | 532aaa41 只改 dev doc（9+/9-）；77bdaa8c 只改 task-state；aef5fbef（spec 定稿）也在 main | ✅ 零 src/ electron/ tests/ scripts/audit/ 触碰 |

- **北星**: 不偏离。**L4**: 无新缺口（M7 漂移的修复本身，闭环）。

### D525 — synova-commit.test.sh 红态修复（d5286c52 + 2826abc7）→ **PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① 红态根因 | D508 移除 D507 内联并行门禁段后，旧断言 grep「D507: 并行 session 物理隔离门禁」必然失配 → 恒红。修复: 断言重写为 staging_guard（D311）现行为（synova-commit.test.sh 头部注释 + ①②③④⑤ 五组新断言） | ✅ 根因分析正确（diff 物理核实） |
| ② 测试复跑绿 | 本机 **8/8 绿**（staging_guard 接线/他人写集 exit 1+点名/自己写集放行+commit 落库/降级显式/status JSON 语义） | ✅ |
| 测试入 canary | ci.yml canary 清单含 synova-commit.test.sh | ✅ |
| 2826abc7 沙箱身份跟进 | CI runner 无全局 git identity 致内部 commit 128 → 沙箱补 `git -c` 一次性身份（4 行） | ✅ |

- **北星**: 不偏离。**L4**: 无新缺口。

### D526 — CI canary 密封清单漂移告警（d5286c52）→ **PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① 漂移告警实现 | check-canary-drift.sh 全文件: 契约注释（铁律47 输入/输出/exit/降级）+ 双向对账（drift=仓库有清单无；ghost=清单有文件无）+ ::warning 注解 | ✅ |
| ② 告警触发实测 | 本机运行: 「测试文件总数 658 | canary 清单 19 项 ⚠ 漂移: 64 个 .test.sh 不在 CI canary 清单」+ 点名列表 + ::warning 可见（交付声称 47 项为 D526 当日口径，随仓库增长至 64，方向一致） | ✅ 实测触发 |
| ③ L4 归属 | task-state spec.source = 「K3 D521 审计 L4」；check-canary-drift.test.sh 11/11 绿；ci.yml:166 `bash scripts/control-tower/check-canary-drift.sh \|\| true` 接线（告警不阻断，防误伤——派单明确） | ✅ |

- **北星**: 不偏离。**L4**: 本任务即 L4 收割产物，闭环。
- **附**: 本批 D549 的「红态不可见」恰被本告警点名（claim-regex-narrow.test.sh 在漂移清单中）——机制有效性得到独立印证。

### D534 — Agent Notes 四态（02381ad7）→ **PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① 四态机制物理落地 | memory/notes/{proposed,implemented,rejected,archived}/ 四目录存在；README.md 四态迁移语义表（各迁移的门槛/触发 + 物理可验证判定） | ✅ |
| ② 触发面扩展 | commit-msg-check.sh:121: 触发区 = scripts/{control-tower,workflow,hooks}/ + src/orchestrator/ + AGENTS.md/CLAUDE.md/memory/notes/README.md；排除 *.test.sh（grep -vE '\.test\.sh$'）与 docs/ 纯文档；两层检查（消息引用 + Note 文件真实存在） | ✅ |
| ③ 铁律49 引用 | AGENTS.md:60 精确命中（「铁律 49（D534 新增）. 决策必须沉淀」） | ✅ |
| ④ git mv 迁移语义 | README 表显式 `git mv` 命令 + 头字段「状态:」与目录一致性判定；d472 note 迁移到 implemented/ 完成 | ✅ |
| 测试 | commit-msg-note-mandatory.test.sh **10/10**（PASS=10 FAIL=0） | ✅ |

- **北星**: 不偏离。**L4**: 无新缺口。

### D535 — guard 循环卫生+超时（02381ad7）→ **CONDITIONAL PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① 循环卫生分级 | incident-loop.py record 重复 → {status:duplicate, repeat_count, reminder, last_recorded}（不再静默）；幂等保持（不重复追加行）；契约 JSDoc 补全（铁律47） | ✅ |
| ② 超时通用化 | 控制塔循环卫生标准 §1: subprocess 默认 30s timeout + 验证命令（grep 零结果）+ verify 已 timeout=10 | ✅ |
| ③ block 接线 | synova-commit:505-521: staging-guard block → incident-loop record + reminder 打印（fail-open 显式） | ✅ |
| ④ timer 泄漏 | incident-loop-hygiene.test.sh **12/12**（含 L2b 频发提醒/降级三路径） | ✅ |
| **P1-1** | 主树手动应用（02381ad7）**丢失 4b 跨平台修正**: 分支版（9d9b3f8e）incident-loop.test.sh:71-79 接受「closed 或显式 degraded」双合法结果；main 版回退为只认 `assert_contains "$OUT" '"closed"'`（硬编码 Windows PATH `/c/Windows/system32:/c/Windows`）→ macOS 下 _find_bash 返回 None → degraded → 断言恒失败。实测 **7/8 红**（非环境依赖——断言与平台语义不符，修复内容存在但被应用时回退） | ❌ **P1-1**（M7 家族）: task-state evidence 声称「incident-loop.test.sh 8/8(4b 跨平台修正)」与 main 物理状态矛盾。归因: implement（手动应用到 main 时丢失修正） |

- **北星**: 不偏离。**L4**: 手动应用（避 CRLF 噪音挡 merge）缺「分支树 vs main 应用树逐文件 diff 对账」步骤——D534/D535 两任务证据表明手动应用引入回退。归 control-tower 队列（M7 变体：跨树手动应用对账）。

### D537 — 并行污染+提交链摩擦根治（e4cb41ab，V5.1.4）→ **CONDITIONAL PASS**

| Win 反馈 | file:line | 验证 |
|---|---|---|
| #1 CRLF | 已由 D520 修复（*.sh/*.py eol=lf）——本任务不重复 | ✅ 引用正确 |
| #2 主树占用前移 | pre-commit-check.sh:776-800+（_MAIN_DIRTY + session_registry list --active + SYNO_PARALLEL_WINDOW=1800s last_seen_at 过滤，worktree 内豁免/registry 不可读显式降级） | ✅ 三态齐备 |
| #3 fastlane 扩展 | synova-commit:331-355（三通道: 纯 bypass.log / MERGE_HEAD merge / 证据簿记白名单组合；判定只看 --files 显式列表防 D414） | ✅ |
| #4 D521-2 hook 层登记恢复 | post-commit.sh:69-94（D530 覆盖丢失根治）；bypass-precommit.test.sh → post-commit.test.sh 重写（12/12） | ✅ |
| #5 baseline 漂移归因 | baseline-check.sh「D537 #5」段: BRANCH_CHANGED = origin/main...HEAD 改动集，文件 ∈ 本分支改动集才拦；归因不可用 fail-closed 拦全部；SYNO_BRANCH_CHANGED 注入缝 | ✅ 测试 16/16 |
| #6 canary 补 2 新测试 | ci.yml canary + parallel-main-tree-occupancy.test.sh + fastlane-extended.test.sh（两者本机绿） | 清单✅ 但见 P1-1 |
| **P1-1** | **job 级证据**（e4cb41ab = PR #223 合并提交）: Control Tower Gate Tests (ubuntu-latest) = **failure** / (windows-latest) = **failure**（Vitest 双绿、TS+Iron Laws 绿）。红态在 main 存续 ~2 天（361a3bfd/be99d625 均双红，08-28 才恢复绿）。task-state 声称「#6 …双平台全绿」与合并时 job 级证据**矛盾** | ❌ **P1-1**（M2）: 交付时 CI canary 双平台红。根因候选（log 无权限不可精确点名）: D537 #4 重写的 post-commit.test.sh 沙箱未配 git identity（`git config user.name t` 由 D554 91f52fcb 补入）→ CI runner 无全局身份 → hook 影子提交 exit 128；post-commit-marker.test.sh 默认分支 master/main 漂移（D543 3b1a65a9 修复）。归因: implement（测试沙箱身份）+ control-tower（CI 红未阻断 PR #223 合并，红态存续无升级） |
| L4 | **CI 红不阻断合并**: PR #223 分支 CI 末跑（a39eac86）failure 仍被合并 → 分支保护/合并门禁缺失或未启用。归 control-tower 队列 | 新缺口登记 |

- **北星**: 不偏离。**注**: #1-#5 的代码修复全部核实属实，P1-1 仅针对 #6 声称口径。

### D538 — 前端左栏 Codex 风格（d2b183a1）→ **PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① 与设计文档一致 | 设计 doc §二/三/五 vs 实现: cap-section 能力导航组（LeftPanel.tsx:166+，4 项一行一个）、lucide-react 图标（import :11，Radar/RefreshCw/ListChecks/Users/ChevronRight，16px currentColor，**无 emoji**——grep 核实能力区无 emoji 渲染）、selectedCap 状态机（RightPanel.tsx:656+，再点同项取消回默认三标签）、折叠态图标条（LeftPanel.tsx:137）、cap-badge 数字角标样式（global.css） | ✅ 验收 1/2/3/4/6 全覆盖 |
| ② DSH 借鉴（理念不引代码） | `grep "from 'dsh\|dsh/" electron-renderer/src/` = **0**；设计文档自证「借鉴理念（Slot 机制/sidebar 组织）不引代码」 | ✅ |
| ③ 三能力接口接真数据 | ReachDetail → `GET /api/sentinel/signals`（src/routes/sentinel.ts:44 存在，server.ts:54 挂载）；LoopsDetail → `/api/loops/status`（src/routes/loops.ts:80，server.ts:70）；ActionDetail → `/api/actions`（src/routes/actions-api.ts:54，server.ts:34）。三路由全部真实存在且挂载 | ✅ 真数据接线（非 mock） |
| ④ GA 置灰分支 | GaDetail（RightPanel.tsx:633-640）= 结构占位 + banner「后端校准接口待接入」，**不发 fetch 不伪造**（铁律 8）；canAccessCap（capability.ts）fail-closed（cap==='ga' → role==='ga'） | ✅ 与 CTO 台账「前端先行接 3 能力，GA 项置灰待后端」统筹一致 |
| 质量 | as any = 0（4 文件 grep）；术语 FDE = 0（统一 GA）；capability.test.ts **23/23** | ✅ |

- **北星三问**: ① 服务真实用户场景（FDE/企业主经桌面端查看主动触达/五循环/Action 状态）✅；② 更接近终态（桌面端施工图切片，产品独有能力导航）✅；③ Synova 仍是「驻扎企业、主动诊断、为增长服务」的 Agent（诊断内核零改动，GA 占位诚实）✅。**裁决: 对齐北星**。
- **L4**: 无新缺口。

### D549 — sealed-tests-ci-canary（756573df，PR #272）→ **FAIL**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① 动态 grep 替代硬编码 | **物理事实**: PR #272 唯一提交 731d2469 的 diff = **仅新增 task-state/D549.json**（11 行注册壳，status=claimed）。`git log --all --follow -- tests/control-tower/claim-regex-narrow.test.sh` = 仅 48914b89（D541 创建），此后**任何分支零修改**。现文件 T5b 仍 `sed -n '749p'` 硬编码（claim-regex-narrow.test.sh:71），pre-commit-check.sh guard 已漂移到 :753 | ❌ **P1-1 修复未落地**（M2）: 声称「claim-regex T5b 硬编码行号 → 动态 grep」物理不成立 |
| ② 6 新密封测试入 CI canary（19→25） | `grep -oE 'tests/...\.test\.sh' .github/workflows/ci.yml` 现清单 = **19 项**（非 25）；claim-regex-narrow.test.sh 不在清单；全部 4 个 workflow 文件核查仅 ci.yml 有清单 | ❌ **P1-2 声称不实**（M2）: canary 扩展从未发生 |
| ③ 双平台绿 | job 级（756573df）: CT ubuntu/windows = success ——**真空绿**: 红态测试不在 canary 内，CI 绿只证明「没跑它」 | ⚠️ 属实但无意义（FIX-D541 的「CI 无法察觉」问题原样存续） |
| 测试实测 | `bash tests/control-tower/claim-regex-narrow.test.sh` → **❌ T5b 无 brief guard 缺失，结果 8/9，exit 1**——main 上恒红（硬编码行号漂移） | ❌ 恒失败（非环境依赖） |
| 漂移告警 | check-canary-drift.sh 已点名 claim-regex-narrow.test.sh（64 项漂移之一）——红态可见性靠 D526 告警维持，但无人处置 | 佐证 |

- **结论**: **FAIL**。任务声称修复 K3 FIX-D541 + P1-3，但合并进 main 的 PR 零代码——K3 D540-D547 批 P1-1（claim-regex 测试断裂+未接线）**原样未闭环**。归因: implement/CTO（自修登记声称与 PR 内容不符——M2 声称 vs 事实，且 D549.json audit 段「CTO 自修（未 K3）」+ note 声称与实际 PR 内容矛盾）。
- **北星**: 不偏离（infra 测试修复，但未交付）。**L4**: FIX 任务的「闭合性对账」——声称修复的 PR 必须 diff 级核实「测试文件变更 + ci.yml 清单变更」双存在；当前无此门禁。归 control-tower 队列。

### D550 — alloc-origin-merge 发号器（f1c9be5a，PR #276）→ **PASS**

| 审计点 | 验证 | 结果 |
|---|---|---|
| ① REMOTE_USED 合并 | alloc-task-id.sh:84-95: `git ls-tree --name-only origin/main task-state/` 占用并入 USED；origin/main 不可读 → 显式降级提示（「可能漏号，建议先 git fetch」） | ✅ |
| ② 测试 seam | SYNO_ALLOC_NO_REMOTE=1 注入缝（用例 1-5 全部隔离 origin 依赖；用例 6 测真实合并） | ✅ |
| ③ 撞号不复现实证 | 独立复现: 空本地 task-state 目录 + 真实 origin/main → 发 **D558** > main max **D557**——D547/D548 撞号（重发已有号）无法复现 | ✅ |
| ④ 配测试 | alloc-task-id.test.sh **13/13 绿**（含用例 6「空本地发 D558 > main max D557（不漏号）」）；job 级 CI（f1c9be5a）CT 双平台 success | ✅ |

- **北星**: 不偏离。**L4**: 无新缺口。

---

## 三、跑偏第二道（北星三问，整批）

对照 PRODUCT-BRIEF.md 原文（L20「直接用户 = FDE」、L25「两套系统并行」、L14「它主动替企业干活」）:

1. **服务真实用户场景？** 17 任务中 16 个为控制塔/流程/测试基础设施（间接服务：缩短交付 → 更快服务 FDE/企业主），1 个（D538）直接服务桌面端 FDE/企业主能力导航（主动触达/五循环/Action/GA 协同 = PRODUCT-BRIEF 两套系统的用户可见入口）。✅ 无对不上的任务。
2. **更接近终态？** 全部为既定施工图/冻结边界内（控制塔减负 V5 线 + Stage1 续 + 桌面端切片）的收口/修复，无横向无关新增（D537 明确「防膨胀：全复用既有机制，零新独立机制」）。✅
3. **变味吗？** 零 src/ 诊断内核改动（D538 仅 electron-renderer 展示层 + 已有 API 消费）；Synova 仍是「驻扎企业、主动诊断、为增长服务」的 Agent。✅

**裁决: 整批对齐北星，无方向偏离。**（技术/执行缺陷已按 P0/P1 记入各任务节，非方向问题。）

---

## 四、批次级发现（跨任务）

### F-1 影子提交卷带（D521 专项，已闭环）
auto-hook 影子登记提交无路径限定 → 8b6deaf4 卷带 905 行（D552 实证）→ D554 修复（`-o -- path`）+ 测试 12/12。**已闭环**。归因: control-tower（修复方）。

### F-2 「API-merge 树误用」家族第三次复发（D509 测试丢失）
6d6e4d0b（V4.9.0 chore）经 API merge 用错 base tree → g12-day-window.test.sh 从 main 消失且从未恢复。D516 的 commit message 已自认「D509 同型」——该家族至少复发 3 次（D509/D516/D520 执行期），版本管理规范 §六「API 只允许 push 传输禁 merge」（D520 任务4）是治本动作，但**已丢失文件的「找回对账」无人执行**。归因: control-tower → 台账 CT 队列。

### F-3 声称「双平台全绿」与 job 级证据的张力（D537）
task-state note 类声称（「canary 补 2 新测试双平台全绿」）与合并时 check-runs job 级结论（CT 双红）矛盾。审计方法论上：本批全部 CI 结论均走 **job 级 check-runs API**（禁整体 run 结论），且对「绿」的判定要求「红态测试是否在跑」（D549 真空绿教训）。建议：impl note 中「CI 绿」声称一律附 job 级结论来源。归因: control-tower（登记规范）。

### F-4 手动应用到 main 的回退风险（D535）
「手动应用到 main（避 CRLF 噪音挡 merge）」丢失分支侧 4b 修正 → 测试在 macOS 恒红。手动应用缺「分支树 vs 应用树 diff 对账」步骤。归因: control-tower → 台账 CT 队列（M7 变体）。

### F-5 未合并分支携带旧证据指针（本批派单相关）
origin/audit/k3-20260829-ga-line（f685ccfe，前批 K3，基于 84fc5655）仍含 **7 处旧证据指针**（D508=35367fe6 / D521=01334c0c / D525=D526=61182a97 / D534=6bfe26ff / D535=9d9b3f8e / D537=95b09aec）且其派单文档副本为修正前版本。**若 CTO 直接合并该分支，将回退本批派单的 7 处指针修正**（task-state 6 文件冲突 + 派单文档冲突）。处置: 合并前 rebase 到 origin/main 或按 main 版解决冲突。归因: control-tower（分支合并前基线检查）。

### F-6 审计清单过期
`K3审计清单-20260822.md` 未含本批（D501-D550）任何任务——清单已过期，本批按派单（task-state priority=P0 为准）执行。需 CTO 更新清单。归因: control-tower。

---

## 五、L4 防线缺口收割（本该拦住它的是什么？为什么没拦住？缺什么？）

| # | 发现 | 本该拦住的防线 | 为什么没拦住 | 缺口 |
|---|------|--------------|-------------|------|
| 1 | D549 声称修复但 PR 零代码（M2 复发） | FIX 任务闭合性对账（PR diff 应含「测试文件变更 + ci.yml 清单变更」双存在） | 无此对账机制；K3 发现后自修路径无复核 | **新缺口**: FIX 任务 PR 闭合性对账门禁 → control-tower 队列 |
| 2 | D537 合并时 CT 双红仍合入 | 分支保护 / CI 绿才能合并 | PR #223 分支 CI failure 仍被合并——无保护或未启用 | **新缺口**: 合并门禁（CI job 级绿前置）→ control-tower 队列 |
| 3 | D535 手动应用丢失 4b 修正（M7 变体） | 跨树手动应用 diff 对账（分支树 vs 应用树） | 手动应用只避 CRLF 噪音，无对账步骤 | **新缺口**: 手动应用对账 → control-tower 队列（M7 变体） |
| 4 | D509 测试文件从 main 消失未恢复（API-merge 家族第 3 次） | 「配对测试存在性」对账（D526 漂移告警事后可见但当时未落地） | D526 机制 08-25 才落地；丢失文件无找回对账 | 已有机制覆盖方向（D526），缺「文件找回」动作 → 台账登记 |
| 5 | D516 tag V5.0.0 指向 FAIL 态树（M6 家族） | tag 语义锚点校验（tag 树 = 发布树） | memory Note「待合并后重打」无强制执行体 | 已入 CT-35 家族 → 台账确认 |
| 6 | D508 merge-base 化无效应（机制误判） | 「根治声称」的机制级验证（红→绿须证明机制因果） | 测试为终态断言，无法区分旧/新代码 | 已入 M2 家族 → 强化已有防线（DS verify 机制因果要求） |
| 7 | 本批 7 任务 impl.commit 曾登记影子提交（派单已修正） | 影子登记提交识别（M7 纪律） | CTO ③′ 物理复核已修正；但未合并的 ga-line 分支仍携带旧值（F-5） | 派单已闭环 + F-5 处置提示 |

**防再犯（Anti-bloat，一类一机制）**: 新发现全部分属既有 M 家族（M2 声称 vs 事实 ×4、M6 版本锚点 ×1、M7 文档-实现漂移 ×2、M8 变体 ×1）——**不提议新 M 类**。强化方向 = 合并门禁（缺口 2）+ FIX 闭合对账（缺口 1）两个 bash/流程门禁，归 control-tower 队列，由 CTO 排期。

---

## 六、写回与产物

- 报告路径: `docs/synova/audit-reports/2026-08-28-D501-D550-impl-done-batch.md`
- D515 报告原文入库: `docs/synova/audit-reports/2026-08-24-D515.md`（补齐「报告文件不在 git」缺口）
- task-state 回填: 17 个 D# 的 `audit` 段（verdict/blokers/findings/file:line/by=K3/at=2026-08-29），见本分支提交
- 审计分支: `audit/k3-20260828-impl-done`（推送后由 CTO 合并回流 main）
- 审计出问题 → FIX 任务建议（另起，禁直接改原任务）: D549（claim-regex 动态 grep + canary 扩展——原 FIX-D541 内容重新执行）、D535（4b 跨平台修正补应用）、D516（tag V5.0.0 重打）
