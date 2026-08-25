# 控制塔 VERSION — 版本与变更记录

> 控制塔产品契约（设计文档 §2.6/§2.7）。版本只增不减；任何门禁/工具行为变化必须 bump（PATCH 起步）；bump 与代码同 commit。**bump 必须同 commit 打 tag**（synova-commit 自动；手动 git commit 场景：`git tag V<x.y.z> && git push origin V<x.y.z>`，否则 push 被 D319 拦）。

## 版本规则

```
版本号: MAJOR.MINOR.PATCH
- PATCH (第三位): 小升级 — bug 修复/门禁微调 → 4.6.0 → 4.6.1
- MINOR (第二位): 中升级 — 新机制/新组件/新门禁组 → 4.6.0 → 4.7.0
- MAJOR (第一位): 大改版 — 架构重构/产品化里程碑 → 4.6.0 → 5.0.0
```

## V5.1.2 (2026-08-26) — D533 CI 调试可达性根治（凭证共享 + CRLF 治本 + debug 纪律）（PATCH）

> 收敛 3 项（D529 复盘后审计收敛，原 5 项 → 3 项）。spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D533-ci-diagnostics-20260825.md

- **① 凭证共享（开发环境治理，不入库）**: GITHUB_TOKEN 落 `~/.dsh/.credentials.yaml`（0600，与 DEEPSEEK 等 key 同文件）——CI 日志 403 盲猜根因消除；curl 验证 `actions/jobs/<id>/logs` HTTP 200 拉到完整失败日志（run 32879994891 / job 97906882065 / 48KB，定位失败测试）。
- **② CRLF 治本（.gitattributes 行为变化）**: D520 已加 `*.sh/*.py text eol=lf` 但从未 renormalize → 17 个 CRLF blob 让每次全新 checkout 永久脏（D529 根因）。本版本 `git add --renormalize` 规范化 15 个脏文件 + 追加两条豁免：`scripts/audit/** -text`（K3 红线，审计脚本字节不变）+ `scripts/control-tower/*.py -text`（存量 CRLF 无配对测试，CT-40 禁改）→ `git status` 零噪音，audit/control-tower 脚本 vs main 零 diff。
- **③ debug 回传纪律（文档级）**: docs/synova/coordination/CI-诊断通道.md 新增 §五——CI debug 回传必须推 `ci-debug/*` 独立分支（永不动工作分支）+ 首选 curl/gh 日志通道。
- **明确不做（防膨胀）**: ~~CI 挂起探针~~（挂起根因已消除：prebuild-install 无编译）/ ~~机器人 merge 豁免~~（无 CI bot 提交）/ ~~gh CLI 强制~~（可选工具）。
- **验证**: git status 零噪音（worktree 实测复现 D529 → 修复后干净）；pre-commit 6 组本地全绿 + CI TS+Lint+Iron Laws/Vitest 全绿；D331 bypass 对账通过。
- **作者**: dsh-parallel-cto（D533，控制塔线）

## V5.1.1 (2026-08-25) — D525+D526 红态清理 + canary 漂移告警（PATCH）

- **D525 synova-commit.test.sh 红态修复**: 6 个 D507 断言（随 D508 门禁移除失效）重写为现行为断言——staging_guard 接线/他人写集阻断（沙箱行为实测 exit 1 + 点名归属）/自己写集放行 + commit 链路走通/guard 崩溃显式降级/status JSON 判定语义，8/8。测试入 CI canary 清单（红态自此有防线感知——D525 漏网根因闭环）。
- **D526 canary 漂移告警**: check-canary-drift.sh（新）——tests/*.test.sh vs CI canary 清单对账，漂移/幽灵双向点名 + ::warning（CI warnings 面板可见），告警不阻断（派单明确防误伤）；接 ci.yml canary 步骤。存量漂移 47 项即刻曝光（全量密封化 = K3 P2-4 单独立项）。
- **测试**: check-canary-drift.test.sh（新，11/11：漂移出现/消失双态/幽灵/.ts 不计/降级/真机机制自检），入 canary。
- **作者**: dsh-cto（并行 CTO，K3 D521 审计遗留闭环）

## V5.1.0 (2026-08-25) — D521-4 synova submit 统一提交入口（MINOR：新机制）

- **synova-submit.sh（新）**: 六步编排——① tag 时机检查（孤儿 tag 提前黄色警告，不再 push 时撞 D331 盲猜）→ ② bypass 竞态确认（hook 层登记接线验证）→ ③ 门禁 dry-run（synova-commit --check 一次报全）→ ④ CI 等价模拟（simulate-ci.sh，本地能抓的错不送 CI）→ ⑤ git commit（SYNO_SUBMIT_MODE=1：不 auto-tag 不 auto-push，§6 纪律）→ ⑥ push + 失败诊断（::error 注解通道，CI-诊断通道.md）。--dry-run 只跑 ①-④；--no-push 留本地。SYNO_SUBMIT_CHECK_CMD/SIM_CMD 注入缝（测试）。
- **synova-commit**: SYNO_SUBMIT_MODE=1 跳过 auto_tag_and_version + push_with_tags（tag 在 main 合并后打——§6 纪律由编排层物理落地）。
- **设计原则**: 编排而非新门禁——每阶段调用现有 check 脚本（--check/simulate-ci/pre-push 语义），只是顺序和时机正确。
- **测试**: synova-submit.test.sh（新，10/10：六段物理顺序/全绿 dry-run/④红⑤不执行/③红④不执行/缺参 exit 2），进双平台 CI。
- **作者**: dsh-cto

## V5.0.5 (2026-08-25) — D521-3 CI 诊断通道 + push 前 CI 等价模拟（PATCH）

- **工具1 CI 诊断通道**: docs/synova/coordination/CI-诊断通道.md——无 token 时经匿名 check-runs annotations API 读 CI 失败（curl 模板 + 边界）；pre-commit-check.sh 的 hard_check 失败与终局 verdict 在 GITHUB_ACTIONS 下输出 `::error` 注解（失败点名进 annotations，本地输出不污染）。
- **工具2 simulate-ci.sh**: push 前 CI 等价模拟——① Iron Laws（GITHUB_ACTIONS=true SYNO_CI=1 SYNO_DIFF_BASE=origin/main）+ ② 密封 gate 测试（清单从 ci.yml CT job 单源提取，防漂移）。SYNO_SIM_PRECOMMIT 注入缝（测试用）；三态退出（D328）。
- **模拟首战立功（吃自己的药）**: 抓到 3 个真问题——① alloc-task-id.test.sh 测试污染（在真实 brief 目录生成占位 brief，模板排除项文本在 CI strict 下硬炸）→ alloc-task-id.sh 加 SYNO_BRIEF_DIR 注入缝 + 测试沙箱化；② brief 排除项无文件路径（修）；③ 跨午夜 brief 日期漂移 + 写集漏列 scripts/hooks/post-commit.sh（修）。
- **测试**: simulate-ci.test.sh（新，7/7：绿桩/红桩抓差异/缺失 exit 2 降级/接线三断言）；post-commit-marker 15/15（SYNO_SKIP_AUTOREG 测试隔离分层）。
- **作者**: dsh-cto

## V5.0.4 (2026-08-24) — D521-2 bypass COMMITTED 挪 hook 层（PATCH）

- **不变量2 hook 层登记**: post-commit.sh 在 bypass 检测通过（PASS_WAY≠0，即 pre-commit 真跑过）后，立即追加本提交 HASH 的 COMMITTED 行 + 成对影子登记提交（message 标记「bypass COMMITTED 登记」防递归）——覆盖裸 git commit 与 synova-commit 两条路径；bypass.log 提交后永干净（无脏文件挡 merge），D451 补记循环从根消除。--no-verify 提交不登记（不洗白绕过）。
- **影子提交天然豁免对账**: 影子只改 .claude/bypass.log → 命中既有 D451 豁免（纯补记提交不能被要求自己被自己记录），无需改对账逻辑。
- **synova-commit 去重**: D508 的 COMMITTED 追加删除（hook 已统一登记，双写必留脏）；write-set 释放识别影子提交回退 HEAD^ 取真实文件清单。
- **测试**: bypass-precommit.test.sh（新，7/7：裸 commit 含 HASH/树干净/影子标记/链长稳定无嵌套/绕过不登记/接线双断言），进双平台 CI。
- **作者**: dsh-cto

## V5.0.3 (2026-08-24) — D521-1 parser 剥壳对称 + tag 校验收窄（PATCH）

- **不变量3 parser 剥壳对称**: brief_parser.py parse_q2 的 include 段与 exclude 段同等剥壳——剥动词前缀（改/修改/新增/新建/修复/扩展/实现/更新/重构/升级/创建/编写/增加/优化/调整/添加）+ 剥全角/半角括号描述（"src/x（说明）"→"src/x"）；exclude 前缀补「不动」（对齐 check-plan-integrity 动词表）。resolve-commit-brief.sh 内嵌降级解析器同步。修复: D328 动词前缀误拦 + G12 全角括号误报（同一病根：剥壳规则不对称）。
- **不变量1 tag 校验收窄（D331）**: check_tag_ancestry 从「所有本地 tag 须为 HEAD 祖先」改为「非 HEAD 祖先的孤儿 tag 跳过不拦；HEAD 祖先 tag 须为 origin/main 祖先」——孤儿 tag（V4.7.1 类历史事故/其他分支 tag）不再拦死无关分支推送（D520 实证×3）；未合并分支上的 tag 仍拦（tag 只在 main 可达时合法）；origin/main 不可解析 → 显式降级（铁律 11）。
- **D319 时机契约（§6 配套）**: feature 分支推送时 VERSION.md 最新版本无 tag = 合法中间态（§6: tag 在 main 合并后打），降级显式提示；main/无分支上下文（SYNO_TAG_ONLY 测试）保持严格。
- **测试**: tag-ancestry.test.sh（新，8/8：孤儿不拦/未合并拦/main 可达放/降级提示）+ brief-parser-strip.test.sh（新，10/10：5 动词剥壳 + 裸路径回归 + exclude 对称 + resolver 接线），均进双平台 CI。
- **作者**: dsh-cto（并行 CTO session，spec 执行方）

## V5.0.2 (2026-08-24) — D520 跨平台适配收口（PATCH；V5.0.1 已被 Win 线 verify-parallel 豁免占用，本任务顺延）

- **任务1 task-start CRLF 修复（P0）**: 并行拦截 `_PAR_N` 双步清洗（`tr -d '\r\n'` + `//[^0-9]/`）——修 Win 下 `[[ "3\r" -gt 0 ]]` 算术错误致并行隔离空转（08-16 起 3 次复发 P1 病根）；同时发现并修复 main 合并事故把 `tr -d '\n\r'` mangle 成字面双 LF。pre-commit `_ACT_N` 同型加固。
- **任务2 双平台 CI**: control-tower-tests job 加 `os: [ubuntu-latest, windows-latest]` 矩阵（`shell: bash`）；密封测试 5 → 10（+task-start-parallel/fastlane-bypass-only/gate-stats/q2-error-locating/platform-checklist）。
- **任务3 PLATFORM-CHECKLIST.md**: 8 条平台差异清单（PYBIN/CRLF/quotepath/UTF-8/date/mktemp/grep -P/timeout）+ pre-commit 软检查接线（新控制塔脚本含裸 python3/date +%s/date -v/grep -P → 点名 checklist；SYNO_CI=1 转硬）。
- **附带 P0 修复（冒烟终验发现）**: d3e63e8f"D516 去重 690 行"误删 pre-commit 组 6.5-13 + 结果判定（G12d/G13 质量根特例在 main 消失、脚本无 exit 静默 fail-open）。本次自 8cdf9957 完整版重建：保留 SYNO_CI strict 演化 + 恢复全部组与 verdict + 消除三重定义（D515 补丁重放瑕疵）。
- **任务4 API 禁 merge 纪律（M15）**: 版本管理规范新增 §六——API 只允许 push 传输、禁 merge（D509/D516 两次数据丢失实证）+ 树写入后冒烟终验清单。
- **测试**: task-start-parallel（+CRLF 回归 4 例，12/12）/ platform-checklist（新，14/14）/ ci-strict-mode 7/7 保持绿。
- **作者**: dsh-cto（并行 CTO session，spec 执行方）
## V5.0.1 (2026-08-24) — verify-parallel 已完成任务文档豁免（Win 反馈，D483 派发实测）

- **verify-parallel 误判已合并任务为并行冲突**（P2，Win 2026-08-24 D483 派发实测）: `--scan-today` 对比今日全部 dev doc 写集，D481（已合并 #144）与 D483（修订其 auth.integration.test.ts）被判写集重叠 → pre-push 硬拦。修法: compare_docs 前置检查——任一文档写集全部已在 origin/main → 视为已完成任务，跳过（串行演进非并行冲突）；origin/main 不可解析 → 不豁免（fail-closed）。
- **测试**: tests/control-tower/verify-parallel.test.sh 重写（T1-T5：接线 + 已完成 vs 活跃跳过 + 活跃重叠仍 block + PYBIN 回归，5/5 过）。
- **作者**: Synova-Win（创始人授权越界补丁，DSH 预审）

## V5.0.0 (2026-08-24) — D515 控制塔减负重构（三批 13 项，MAJOR）

> 门禁体系收缩性重构：提交端硬阻断收敛到 4 道质量根 + 其余软提示（CI Iron Laws 为权威）+ 命中统计。
> spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D515-tower-v5-dedrag-20260824.md

- **项1 并行隔离物理强制**: task-start.sh 开工拦截（主树脏 + registry 有活跃 session → exit 1，提示 worktree 命令）；pre-commit 组 6 软告警。
- **项2 纯补记快速通道**: synova-commit `--files` 仅 .claude/bypass.log → SYNO_FASTLANE=1，pre-commit 只跑 Secrets（90-120s → <3s）。防 D414 误触发：只认环境变量不裸看暂存区。
- **项3 硬阻断收敛**: 保留 4 道质量根（as any / 测试配对+expect / Secrets / 接线物理事实）+ 特例 G12d 生成物单点（D458）、G13 技能同步（D370）。其余全部 hard_check → soft_check：判定代码与输出原样保留（--check 报告与 K3 审计依赖），本地不再阻断，汇总行 `⚠ V5: X 项软提示——CI 为权威，本地不阻断`。前置 GATEKEEPER（当日 detected-bypass 硬拦）与检查器执行失败（D328 exit 2）保持硬阻断。
- **项4 门禁命中统计**: hard/soft 每次触发写 JSONL 到 .claude/gate-hits.log（gitignore），gate-stats.sh 汇总近 30 天命中/拦截/误报代理指标——月度清理数据地基。
- **项5 Q2 排除项报错定位**: check-plan-integrity.sh 报错附违规原文 + brief 行号 + 修复示例（Codex P6）。
- **项6 VERSION 头部 bump-tag 说明**: 两文档加"bump 必须同 commit 打 tag"（Codex P3）。
- **项7 纯文档 PR CI 瘦身**: ci.yml quality job 前置 docs-only 探测，全 md/json/task-state/.claude → 跳过 TS+Iron Laws 步骤（Secrets 保留；只跳步骤不跳 job）。
- **项8 git 网络韧性**: install-hooks.sh 幂等配置 http.lowSpeedLimit=1000 / lowSpeedTime=30（Codex P9）。
- **项9 tracking ref 陈旧提示**: check-bypass-log.sh 防御 fetch 失败时显式提示 base 可能陈旧（Codex P10）。
- **项10 改 scripts/ 需认领 brief**: 版本管理规范新增章节 + G12 拦截输出附修复指引（Codex P5）。
- **项11 --check 快速通道**: synova-commit --check 的 plan-integrity 段对纯补记/纯 docs 场景跳过（与项 2 联动）；pre-commit 失败判定改认硬失败标记（软提示不再让 --check 红）。
- **项12 worktree-manager merge driver 健康度**: status 子命令顺带显示 bypass.log/reference-map 的 union 注册状态（.gitattributes）。
- **项13 经验沉淀**: memory/notes/implemented/ D515 Note（D395-a）。
- **测试**: tests/control-tower/{task-start-parallel,fastlane-bypass-only,hard-gate-convergence,gate-stats,q2-error-locating}.test.sh（新建 5 个，先 red 后 green；M13 沙箱纪律）。
- **作者**: dsh-cto（新 CTO session，spec 执行方）

## V4.9.2 (2026-08-24) — G12 豁免 task-state 登记元数据（Win 反馈）

- **G12 skip_re 豁免 task-state/**（P2，Win 2026-08-24 实测 PR #139 首跑 CI 红）: task-state/*.json|*.md 是任务登记元数据（D382 状态机，各角色按阶段更新），非代码实现；dev-doc 提交 spec 时无"实现 brief"，混合提交走全量 13 组被 G12「不在 Q2 范围」误拦。修法: skip_re 增加 `task-state/.*\.(json|md)$`——与 is_doc_only 的 DOC_PREFIX_RE（L175 同正则）语义对齐（D366 docs/ 豁免同型）；**仅豁免 json/md，task-state/ 下若出现 .ts 仍被 G12 检查**（防藏代码，fail-closed）。
- **测试**: tests/control-tower/g12-taskstate-exempt.test.sh（新建，T1-T5：接线 + json/md 豁免 + .ts 不豁免 + 代码保护不削弱 + docs 先例保持）。
- **作者**: Synova-Win（创始人授权越界补丁，DSH 预审）

## V4.9.1 (2026-08-23) — D513 批次（控制塔四项返修：Win 台账反馈 + D331 残余根因）

- **③ 对账 base 防御性刷新**（P0，Win 37dc1cae 根因）: `git push <URL>` 不更新 tracking ref → BYPASS_BASE 陈旧 → merge-base 失效 → 补记循环残余。check-bypass-log.sh 对账前 fetch 最新 tracking ref（失败显式降级）。
- **① D328 merge 豁免**: MERGE_HEAD 存在即跳过——本地 merge 构成提交各自已过 D328；Win 曾被迫走注入缝绕过。
- **② verify-parallel PYBIN 探测**: 裸 python3 → 三级探测（D329/D330 同型第三处漏网；Win Git Bash 无 python3 曾 exit 127）。
- **⑤⑥ brief 指向**: task-start.sh 恢复写 current-brief（最新 mtime）；hook-block-write.sh `find|head -1` 改 `ls -t`。
- **M13 教训（本批开发中第四次 index/config 污染事故根因）**: 测试沙箱的 `git config` 写入会污染宿主（GIT_DIR 只隔 index 不隔 config）——沙箱 git 身份必须 `git -c user.*=` 一次性参数，禁止 `git config` 持久写入。commit-msg-merge.test.sh 已按此重写。
- **作者**: dsh-cto

## V4.9.0 (2026-08-23) — D506/D507/D508 批次（提交链路减负 + 并行物理隔离 + 门禁时区修复）

> 创始人指示的流程减负专项：CTO 自查 + Win PR#128 五摩擦项综合。质量根（13 组判定本体/K3 注入/S-6/S-10/接线验收）零触碰。

### V4.9.0 变更明细

- **D506 门禁时区修复**: G12 认领窗口 case 变量展开 `|` 是字面量（parse-time vs runtime）→ 匹配恒失败 → G12 CI 上 fail-open 静默跳过。改 `[[ =~ ]]` ERE（bash 3.x/5.x 一致）+ 行为级密封测试（K3 审计 P0-1 返修，D382 铁律另起 FIX）
- **D507 并行物理隔离**: session 专属 worktree 三层防线（worktree-manager 生命周期 + 四预设"开工三步"注入 + synova-commit 硬阻断门禁：多活跃 session 且不在 worktree → 拦截；单人时段放行零摩擦）。M8 第 4 次复发（D506 提交被打进他人分支）的根治，创始人批准
- **D508 提交流程减负四项**:
  1. D331 对账 merge-base 化 — merge main 后 main 侧已验提交不再要求补记（Win 实测 6+ 次死循环根治；无记录新提交仍拦，双断言测试）
  2. `synova-commit --check` 全量 dry-run — plan-integrity + 13 组 + message 格式一次跑完汇总（逐个揭穿 7 轮 → 1-2 轮）
  3. alloc-task-id 生成 brief 六字段骨架（真实变量 NEW_ID/TITLE + 未定义守卫）
  4. COMMITTED 登记提前到 commit 成功瞬间（push 失败不再丢记录）+ GATE_FAIL_SOFT 移独立日志 gate-soft-warnings.log
- **附带根治**: 测试沙箱 index 污染（本批次开发中三次事故）— GIT_DIR/GIT_WORK_TREE 结构性隔离 + 宿主 index 不变断言
- **验证**: check-bypass-log 7 用例 / synova-commit 10 用例 / G12 窗口 10 用例 / worktree-manager 13 用例全绿；PR #125/#126/#134 CI 全绿
- **作者**: dsh-cto

## V4.8.0 (2026-08-15) — D307 批次（session 级 worktree 隔离：物理根治共享 index 拉锯/劫持）

> MINOR bump — 新机制（git worktree 隔离层）。D320 写集被吞、D330-D331 共享暂存区
> 劫持的根因是同一主 worktree index 的多 session 拉锯；门禁只能事后拦截，worktree
> 是事前物理隔离（git 硬约束: 两 worktree 不能 checkout 同分支）。决策: session/<sid>
> 分支 + finish merge 回主（第一性原理 + git 官方用法开源实证，收敛）；attach 只提示
> 绝不 os.chdir（SessionStart hook 无法改变宿主进程 cwd，Anthropic 基线: 不能做的不假装做）。

- **变更**: MINOR bump — 新增 worktree 生命周期管理 + 并行模式检测提示 + session/* 分支推送保护
- **D307 (worktree 隔离)**:
  - `scripts/control-tower/worktree-manager.py` — 新建。create/finish/list/status 四命令；JSON 输出 + 三态退出码 (0 ok/1 block/2 degraded)；git 生命周期操作 fail-closed（脏 worktree/脏主树/冲突 → block 且保留一切）；registry 簿记 fail-open；`SYNO_CT_DIR`/`--repo` 测试注入
  - `scripts/control-tower/attach.py` — ⑦ 并行模式检测提示: registry 活跃 session 或 --parallel 且非 worktree → 提示 worktree 隔离（0 处 os.chdir）
  - `scripts/control-tower/session_registry.py` — register 新记录含 worktree_path/worktree_branch 字段 + set_worktree() + worktree CLI (--path/--branch/--clear)；main 支持 SYNO_CT_DIR 注入
  - `scripts/control-tower/synova-commit` — 链接 worktree 判定（git-dir 含 /.git/worktrees/ 子串特征，Mac 无 realpath 兼容）；session/* 分支跳过 auto-tag/auto-push 显式提示；worktree 内提交后 finish 指引
  - `tests/control-tower/worktree-manager.test.py` — 13 用例（create/独立 index 物理证明/并行提交互不干扰/finish 合并清理/hooks 共享回归/registry 字段/脏树与分支冲突边界/attach 并行检测），red→green 已证
- **验证**: 13 测试全绿 | pre-commit 12 组 | as any = 0
- **作者**: Claude Code (D307)

## V4.7.9 (2026-08-15) — D366 批次（门禁"今日/本次"判定修复：mtime → 文件名日期 + marker head 对账）

> PATCH bump — 门禁判定机制 bug 修复。git pull/checkout 刷 mtime 使 `find -newermt` 把
> 346 个历史 brief 全部误判为今日（G12 起 346 个 python 进程 → 门禁 900s+ 超时死锁，
> D362 实证）；全局单例 marker 被并发 session 的 post-commit rm 后，另一 session 正常
> 提交被误判 detected-bypass（CT-29，3 条误判触发 GATEKEEPER 硬阻断死锁）。
> 修复：文件名日期筛选 + head hash 对账（只覆盖不删除）。

- **变更**: PATCH bump — 4 处 `find -newermt` 今日判定 → `today_files_by_prefix/suffix` 文件名日期筛选；marker `head|ts` 对账 + 去 rm + legacy 纯时间戳过渡分支 + root commit 显式降级
- **D366 (门禁判定修复)**:
  - `scripts/pre-commit-check.sh` — 组 12 ALL_TODAY_BRIEFS 按文件名日期前缀
  - `scripts/workflow/resolve-commit-brief.sh` / `scripts/workflow/hook-check-task-scope.sh` — 同上
  - `scripts/control-tower/verify-parallel.sh` — --scan-today 按 `-YYYYMMDD.md` 文件名后缀
  - `scripts/hooks/post-commit.sh` — head==HEAD^ 对账、不匹配/无 marker=detected-bypass、超时=possible-bypass、legacy 兼容、root commit 降级；不 rm marker
  - `scripts/install-hooks.sh` — pre-commit wrapper 写 `head|timestamp`
  - `tests/control-tower/today-by-name.test.sh` + `tests/control-tower/post-commit-marker.test.sh` — RED→GREEN 单测（346→1、CT-29 交错时序，各 ≥6 断言）
- **验证**: DS1-DS8 | newermt=0 | today_files_by 生产调用 ≥4 | 两测试全绿 | tsc 基线 +0
- **作者**: Claude Code (D366)

## V4.7.8 (2026-08-14) — D336 批次（多 Agent 协作协议：四角色两线 + 审计红线 + 任务路由）

> PATCH bump — 流程约束变更。创始人将 DeepSeek Harness (Mac) 加入协作团队，
> 确认三决策：① DeepSeek Harness = 架构师+第二开发者+PR 审查 ② 审计红线严格隔离
> ③ 协作协议立即落地。本批次把四角色协作宪法入库。

- **变更**: PATCH bump — 协作治理文档化（角色职责/审计红线/任务路由表）
- **D336 (多 Agent 协作协议)**:
  - `docs/synova/coordination/MULTI-AGENT-COLLAB.md` — 四角色两线架构、审计红线五条（铁律级）、任务生命周期七步、防撞车规则、共享记忆规则
  - `docs/synova/coordination/TASK-ROUTING.md` — 任务类型路由表 + 模块认领状态 + 认领/交还流程
  - `CLAUDE.md` — 铁律 0-5 多 Agent 协作协议 + 审计红线（DeepSeek Harness/Claude Code 永不碰 scripts/audit/、禁自我审计、PR 审查 ≠ 审计）
- **验证**: pre-commit 12 组 | as any = 0
- **作者**: DeepSeek Harness (D336)

## V4.7.7 (2026-08-14) — D335 批次（防线闭环：提交端同步门禁 + synova.db 异地自动备份）

> PATCH bump — 门禁行为变化（新增提交端门禁）。创始人复核 D334 指出两个漏洞：
> ① 开工端仍是软机制（物理强制只在 push 端）② synova.db 数据无异地备份。
> 本批次: synova-commit 前置分支同步硬阻断 + launchd 每日 iCloud 备份。

- **变更**: PATCH bump — synova-commit 新增提交端同步门禁（过期基线禁止提交）；新增数据异地备份体系
- **D335 (防线闭环)**:
  - `scripts/control-tower/check-branch-sync.sh` — 提交端门禁：main 落后/分支基线过期/分叉 → 硬阻断并给修复命令；SYNO_SKIP_BRANCH_SYNC=1 逃生舱（记 degraded）；fetch 失败 fail-open 显式提示
  - `scripts/control-tower/synova-commit` — 挂载 check-branch-sync.sh（pre-commit 之前）——提交端与 push 端（D334 门禁 0）构成两端闭环
  - `scripts/backup/backup-db.sh` — sqlite3 .backup 一致性快照 + 原子落盘 + integrity_check + 14 份轮转 + 日志；默认目标 iCloud Drive
  - `scripts/backup/install-backup-launchd.sh` — launchd 每日 03:30 自动备份（crontab 在 Mac 被 TCC 拦，launchd 原生无需 root）
  - `CLAUDE.md` — 铁律 0-4 数据资产备份
- **测试**: branch-sync-guard.test.sh 11 用例 + backup-db.test.sh 9 用例（正常/降级/边界/接线，red→green 已证）
- **验证**: pre-commit 12 组 | as any = 0
- **作者**: DeepSeek Harness (D335)

## V4.7.6 (2026-08-14) — D334 批次（多机 PR 工作流：门禁 0 同步检查 + main 保护 + 协作规范落地）

> PATCH bump — 门禁行为变化（新增门禁 0）。事故驱动：2026-08-11~13 双机同分支交替 push，
> Mac tracking ref 过期 4 天误报 ahead、实际落后 11 commit，险些互相覆盖。创始人 2026-08-14
> 定案 PR 工作流（方案 A），本批次落地规范 + skill + 物理门禁。

- **变更**: PATCH bump — pre-push 新增门禁 0（push 前强制 fetch + 落后/分叉硬阻断 + main 直推保护）；门禁 3 改基从硬编码改为动态
- **D334 (多机 PR 工作流)**:
  - `pre-push-check.sh` — 门禁 0-1 同步检查（fetch 目标分支，落后/分叉 → 硬阻断并给修复命令）；门禁 0-2 main 直推保护（SYNO_ALLOW_MAIN_PUSH=1 逃生舱）；门禁 3 改基动态化（$PUSH_REMOTE/$PUSH_BRANCH 替代硬编码 origin/feat/prompt-architecture）
  - `install-hooks.sh` — pre-push entry 传 "$1" "$2"（remote 名/url，门禁 0 fetch 需要）
  - `docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md` — 协作规范（创始人 2 件事 + agent 开工/收工 5 步）
  - `.claude/skills/git-sync-pr/SKILL.md` — Claude Code skill
  - `CLAUDE.md` — 铁律 0-3 多机 PR 工作流
- **测试**: push-sync-guard.test.sh 13 用例（main 阻断/逃生舱/落后/分叉/同步/fail-open×2/接线×2，red→green 已证）
- **验证**: pre-commit 12 组 | as any = 0
- **作者**: DeepSeek Harness (D334)

## V4.7.5 (2026-08-13) — D333 批次（决策参考四步框架落地：brief 模板 Q1c + 注入器全文注入 + CLAUDE.md 引用）

> PATCH bump — 门禁行为变化（模板新增字段）。决策参考框架（创始人 2026-08-13 定，docs/synova/coordination/DECISION-REFERENCE.md）落地到任务启动流程：所有新 session 的 task brief 自动含 Q1c 决策参考系 + 注入器全文注入框架内容。D332 批次 V4.7.4 声明独占（未落地），本条目置顶为其补序（接力模式，D332 落地后由其后继补序）。

- **变更**: PATCH bump — 决策参考框架落地（模板/注入器/文档引用）
- **D333 (决策参考框架落地)**:
  - `generate-task-brief.py` — Q0 c) 决策 追加"冲突取舍 → 走 DECISION-REFERENCE 四步，结论写入 Q1c"；Q1 新增 `### c) 决策参考系`（四步框架 + 决策记录格式 `参考：Anthropic/DeepSeek + 结论`）
  - `inject-context.py` — parse_brief 增加 DECISION-REFERENCE 模式；该文档全文注入（无 E-XX/src 路径时不生成空壳块）
  - `doc-registry.json` — 注册 DECISION-REFERENCE → docs/synova/coordination/DECISION-REFERENCE.md
  - `CLAUDE.md` — 流程约束追加决策参考四步框架引用（新 session 必读）
- **测试**: brief-template-decision.test.sh 8 用例（red 11 失败 → green；模板/注入器/注册表/CLAUDE.md/版本五处物理验证）
- **验证**: pre-commit 12 组 | as any = 0
- **作者**: Claude (D333)

## V4.7.3 (2026-08-12) — D331 批次（D329 审计 P1 修复：tag 重指 + 防线补齐 + 接线落地）

> PATCH bump — 门禁行为变化（bug 修复）。D331 独占版本编排；D330 批次 V4.7.2 已落地（6c00e46+407ff1f），本条目置顶为其补序（D330 委托后继执行，内容零改动）。

- **变更**: PATCH bump — KIMI K3 D329 审计（2026-08-12，P1×2 + 关键 P2）修复
- **P1-1 (tag V4.7.1 孤儿)**: `git tag -f -a V4.7.1 dc369fd` 重指（amend 前身 f685fa0 不再指向，版本锚点恢复）+ pre-push 新增 **tag-祖先校验**（所有 `V\d+\.\d+\.\d+` tag 须为 HEAD 祖先，VERSION.md 最新版本 tag 存在且为祖先；孤儿/断裂 → 硬阻断）
- **P1-2 (dc369fd 无 bypass.log 记录)**: 新建 **check-bypass-log.sh** 对账（base..HEAD 提交 vs bypass.log HASH 条目；缺失 → 列出 + exit 1；SYNO_BASE_REF 注入缝）+ pre-push 门禁 7 接入 + ea1cb71/dc369fd 一次性补记
- **P2-5→P1 (guard 裸 python3 + `|| true` 吞崩溃)**: synova-commit staging-guard 调用改 **PYBIN 回退 + rc 捕获**（rc≠0 且 JSON status=block → 硬阻断；非 JSON → 显式 degraded 提示；python 不可用 → fail-open 显式提示）
- **P2-2 (resolver --session 零生产调用方)**: staging_guard 认领判定传 `--session`（生产唯一调用点，DS6 grep 物理证据）；D329 dev doc §5 接线升级（WIRE CHECK：测试调用不计入）
- **P2-1 (write-set 无 task_id)**: session_registry write-set 条目携带 task_id（继承 session）+ staging_guard 归属判定同任务互认（对齐 D329 dev doc §3.1 声称）

## V4.7.2 (2026-08-12) — D330 批次（D328 审计 P1 修复：python 损坏探测 + 豁免测试补全 + 文档回填）

> PATCH bump — 门禁行为变化（bug 修复）。D330 独占版本编排；D331 批次 V4.7.3 落地后由其补序（已由 D331 后继补序完成）。

- **变更**: PATCH bump — commit-msg 一致性门禁修复（KIMI K3 首审 2026-08-12，P1-1/P1-2 物理复现）
- **P1-1 (python 损坏静默漏拦)**: commit-msg-check.sh PYBIN 探测加**可用性验证**（`command -v` 只验存在性，Windows Store stub/损坏 shim 存在但执行即败 → GENUINE 静默归 0 → 劫持漏拦，当前树 shim 实测 2/6 败）；GENUINE 三态（0=无认领 / 1=有认领 / rc≠0=显式 degraded 提示）；resolver 失败 rc 捕获（broken-shim 下 resolver 内部 PYBIN 无可用性验证 → exit 1，此前静默跳过）
- **P1-2 (DS4 声称过度)**: Revert/无暂存补测试用例（原声称"四条豁免全部测试覆盖"仅 Merge/无 D# 有用例）
- **P2-2**: 用例 1 stage 8 文件（补 `.claude/task-briefs/D320-dashboard-gitify.md`，与 commit message 声明一致）
- **P2-1/P2-5**: D328 dev doc §3.2 回填 PYBIN 最终实现 + DS4 措辞修正；brief 路径笔误 `synova-commit.sh` → `synova-commit`
- **测试**: commit-msg-consistency.test.sh 10 用例（原 6 + Revert + 无暂存 + broken-shim degraded + broken-shim 劫持可追溯），red 10 过 2 败 → green 13/13
- **验证**: pre-commit 12 组 | audit 基线 439 FAIL 不变 | as any = 0
- **作者**: Claude (D330)

## V4.7.1 (2026-08-11) — D328+D329 批次（commit 一致性门禁 + session 身份独立化）

> 批次统一 MINOR bump——D328/D329 两个任务的行为变化合并为一个版本。版本编排由 D329 独占（D328 提交时未 bump）。

- **变更**: MINOR bump — 新机制（提交声明-内容一致性门禁 + session 身份独立化 + 认领制暂存区隔离 + current-brief 独立化）
- **D328 (commit 声明-内容一致性门禁)**: commit-msg-check 绑定"消息声明的 D#"与"暂存文件真实认领 brief 的 D#"——不一致 → 硬阻断（防 D320 式并行劫持，已随 ea1cb71 上线）
- **D329 (session 身份与暂存归属根治)**:
  - `synova-commit` — 删除 SESSION_ID 自动采用认领 brief（D320 劫持根因），缺省 `SESSION_ID=TASK_ID`（显式 --session-id 优先）；write-set 登记移到 staging-guard 通过之后（防 --files 预登记"洗白"他人文件）；register 的 brief 路径按 TASK_ID 前缀查找
  - `staging_guard.py` — 认领制硬校验：暂存文件被"真实认领 brief（Q2 include 命中）的 D# ≠ 本 session 任务 D#"认领 → block（own_set 判定之前，不依赖 registry 登记时序；精确 D# 相等，禁 startswith）
  - `session_registry.py` — register --task-id 绑定（session ↔ 任务 D#）
  - `resolve-commit-brief.sh` — 支持 `--session <sid>`（session 专属 current-brief 优先，无则回退全局）；内联 fallback 契约修复（parse_q2 返回 dict）
  - `attach.py` — SessionStart 写 `.claude/current-brief.<sid>`（session 专属 current-brief 的写入方）
  - `commit-msg-check.sh` — PYBIN 回退（D328 P2 折入: python3→python→py，全无 → 显式 degraded 提示）
  - `.claude/current-brief*` 去跟踪（.gitignore + git rm --cached，运行时产物）
- **测试**: staging-guard-session.test.py 10/10（劫持窗口/预登记绕过/精确匹配/resolver --session/PYBIN 回退/无 python 显式降级）
- **验证**: pre-commit 12 组 | audit 基线 439 FAIL 不变 | as any = 0
- **作者**: Claude (D329)

## V4.7.0 (2026-08-09) — D318+D319+D320 批次（git tag 自动化 + 双机身份 + 仪表盘 git 化）

> 批次统一 MINOR bump——D318/D319/D320 三个任务的行为变化合并为一个版本。版本编排由 D319 独占。

- **变更**: MINOR bump — 新机制（git tag 层 + 双机身份 + 仪表盘 git 化）
- **D319 (git tag 自动化)**: synova-commit 提交成功后自动为 VERSION.md 最新版本打 annotated tag + version.log 自动追加 + push --follow-tags；pre-push 新增门禁 6 附挂 tag 一致性检查（VERSION.md 最新版本必须已有对应 tag，否则硬阻断）；历史回填 V4.6.0/V4.6.1/V4.6.2 三个 annotated tags（c5d8d15/fdad612/5b93579）
- **测试**: tag-consistency.test.sh 12/12（red 10 失败 → green；V9.9.9 临时 repo 隔离 + SYNO_ 注入缝）
- **验证**: pre-commit 12 组 | audit 基线 439 FAIL 不变 | git ls-remote --tags origin 含新 tag
- **作者**: Claude (D319)

## V4.6.2 (2026-08-07) — D317 修复（G12b/brief 解析 CI 红）

> Codex 审计（SYNOVA-IMPL-D317）发现 D316 push 后 CI Iron Laws 红（run 31067628720）。缺陷 A 用 worktree 模拟 CI 干净检出完整复现。

- **变更**: PATCH bump — 门禁行为变化（回退过滤）
- **缺陷 A (P0)**: CI 干净检出（无 staged）时 resolver 最终回退按文件名日期前缀选最新 = D286（旧格式 criteria=null）→ G12b 硬阻断 → Iron Laws 红
  - resolver 最终回退改"最新日期→最早逐个 brief_parser 验证 criteria A-D，选第一个可解析"
  - 全部不可解析 / python 不可用 → exit 1（fail-open → G12b 跳过），绝不静默返回坏 brief
  - brief_parser 定位改脚本相对路径（$ROOT 指向临时 repo 时无解析器——测试隔离暴露）
- **缺陷 B (P1)**: PYBIN 跨平台回退（python3→python→py，全无 fail-open skip + degraded）——本机实测 python3 可用（WindowsApps shim），按防御性增强修复
- **测试**: resolve-commit-brief.test.sh 新建 11/11（red 5 失败 → green）；brief-parseable.test.sh 12/12（+4 断言）
- **验证**: worktree 模拟 CI 干净检出 pre-commit exit 0（修复前 exit 1）；audit 基线 439 FAIL 不变
- **作者**: Claude (D317)
- **关联 incident**: INC-20260802-stash（历史闭环案例）

## V4.6.1 (2026-08-05) — D316 修复（incident-loop 跨平台 + version.log 补写）

> Codex 审计（SYNOVA-IMPL-D316）发现 3 缺陷，逐一实测核实后修复。

- **变更**: PATCH bump — bug 修复（行为变化必须 bump）
- **缺陷 A (P1)**: incident-loop.py verify() 硬编码 `["bash",` — 纯系统 PATH（CI/任务计划/非 Git Bash 启动的 python）下 WinError 2 → verify 恒 degraded，学习闭环不可用
  - `_find_bash()` — shutil.which → Git 安装显式路径 → None（fail-open degraded）
  - `_bash_env()` — 自包含 subprocess 环境（Git bins + sys.executable 目录 + WindowsApps），hook 依赖链 bash/cat/python3 全部显式可达
  - 同款修复 attach.py `_run_parseable`（dev doc 遗漏，审计补漏）
  - 测试: 受限 PATH 断言（red degraded → green closed，8/8）
- **缺陷 B (P1)**: version.log 缺失 — 补写 4.6.0 首发 + 4.6.1 两条，五件套齐全
- **缺陷 C (P1)**: D313-D315 共 4 提交未推送 — 随本版本推送落库
- **P2-1**: hook-git-detect.test.sh EXIT trap 清窗（中断残留 → 下次首测失败）
- **关联 incident**: INC-20260802-stash（verify 闭环案例）
- **作者**: Claude (D316)
- **验证**: incident-loop 8/8 | hook-git-detect 13/13 | pre-commit 12 组 | 推送后 origin..HEAD 空

## V4.6.0 (2026-08-04) — 控制塔独立化正式首发

> M1-M5 全部落地 + 独立化底座 + 日志五件套 + 学习闭环。控制塔从"session 触发的脚本集合"升级为**独立常驻系统**（hook 轻量触发，不真常驻——常驻 daemon 延后到产品化阶段）。

- **变更**: 控制塔 V4.6.0 独立化完成（D311-D314 全部交付）
- **D313 (M3 brief 契约 + M5 编码)**:
  - `brief_parser.py` — 同源解析器库（Q2 include/exclude + #CRITERIA + 架构层 + Done；消灭 G12 awk vs resolve-commit-brief python 双副本，4 方共用）
  - `check-brief-parseable.sh` — 填完 brief 立即验证（#CRITERIA 必填/架构层/Done/模板自检）
  - `devdoc_writeset.py` + `check-dev-doc-write-set.sh` — 写集声明 vs 代码 grep（M3b）
  - `generate-task-brief.py` — 模板同源（`## 架构层:` 标题 + `#CRITERIA: A` 字段 + V4.6.0）
  - `check-silent-swallow.sh` — 静默吞错扫描器（level-0/1/2 + --strict/--utf8/--diff）
  - UTF-8 强制 — 47 个 .sh 头块 + 21 个 .py reconfigure + settings.json env 兜底
- **D314 (M4 基线豁免 + 独立化底座)**:
  - `verify-incremental.sh` L2 — tsc 基线豁免（baseline-check.sh --tsc，存量 28 不阻断新增阻断）
  - `verification-state.json` — M4b（全量 vitest ≤1 次/任务）
  - `control_tower_log.py` — 日志五件套写入器（runtime/gate/incident/degraded/version）
  - `attach.py` — SessionStart 轻量 attach（register + 日志 + self-health + parseable；<2s fail-open）
  - `self-health.py` — 控制塔自身健康五维（组件/信号/版本一致性/日志/资源）
  - `incident-loop.py` — 学习闭环（record/suggest/verify；INC-20260802-stash 已闭环可追溯）
  - settings.json — SessionStart + PostToolUse verify-incremental + env 块
- **验收**: §四 17 条全过（测试先行 6 套 48 断言 red→green；fail-open 实测；版本一致性实测；vitest ≤1；日志五件套；pre-commit 12 组无 --no-verify）
- **关联 incident**: INC-20260802-stash（D312 闭环）、INC-20260802-D300/D292/D286（D311 闭环）
- **作者**: Claude (D313+D314)
- **路线图（延后项）**: 常驻 daemon（产品化阶段）；CI 基线判定接线（ci-failures.json 只登记）；D309/D310 存量清理（_extinct 25 + admin-knowledge）；npm audit 决策；loop-score.sh 预存乱码修复

## 变更记录

### V4.6.0-WIP (2026-08-02) — D311 M1 多会话协调

- **变更**: 控制塔 V4.6.0 独立化第一阶段（M1 多会话协调）
- **关联 incident**: INC-20260802-D300（并行 session 覆盖 brief/暂存被卷走/中间态污染/空等 7h）、INC-20260802-D292（并行声明与实际写集不符）、INC-20260802-D286（"零共享"实为 15 个 src/ 文件重叠）
- **新增机制**:
  - `session_registry.py` — 会话注册表（register/write-set/claimants/attribution/gc/phase + fail-open + 损坏自愈 + 双层互斥）
  - `verify-parallel.sh` — 并行声明物理验证（dev doc 写集表解析/4 形态清洗/两两比对/fail-open）
  - `staging_guard.py` — 暂存区隔离（他人写集 → block；committed 忽略；杂散 → warn；fail-open）
  - `wait_manager.py` — 并行等待管理（CP1-CP4 阶段/错峰提示/依赖提示/等待显式化）
  - `pre-push-check.sh` — 门禁 3 改基（`origin/feat/prompt-architecture..HEAD`）+ 门禁 4 中间态警告 + 门禁 5 并行声明验证
  - `synova-commit` — 新增 `--session-id` + staging-guard 硬阻断 + 显式路径 commit + 写集 committed + 阶段 CP4
  - `VERSION.md` — 本文件（控制塔产品契约起点；正式首发在 D314）
- **写集表格式契约**（verify-parallel 依赖，未来 dev doc 必须遵守）:
  - 写集表标题: `### N.N 写集 (N 修改 + M 新建)`（正则 `^#{2,4}\s*\d+(\.\d+)*\s*写集`）
  - 表头: `| 文件 | 操作 | 说明 |`，第一列支持: 纯路径 / `[text](url)` 链接 / 行号后缀 `L750` / 计数 `(N 个)` / 目录级（`/` 结尾）
- **验证**: session-registry 12/12 | verify-parallel 13/13 | staging-guard 8/8 | wait-manager 7/7 测试通过
- **作者**: Claude (D311)

### V4.6.0-WIP (2026-08-03) — D312 M2 hook×git 兼容 + 官方基线工具 + U4

- **变更**: 控制塔 V4.6.0 独立化第二阶段（M2 + U4 脚本清理）
- **关联 incident**: INC-20260802-stash（git stash/pop 间隙被 hook 写文件 → pop 冲突，39 tracked + 615 untracked 卷入）
- **新增机制**:
  - `hook-git-guard.sh` — git 操作写窗口守卫库（git_op_window_active/enter/exit + TTL 300s + 标记文件 + fail-open）
  - `hook-git-detect.sh` — PreToolUse(Bash)+PostToolUse(Bash) hook（classify_command → stash/gitop/none；ban-stash 提示；写/清窗口；exit 0 永不阻断）
  - `baseline-check.sh` — 官方基线工具（tsc/测试失败/审计三基线；快照基线法存量 vs 新增；--seed/--update-baseline/--json；SYNO_ 注入缝；fail-open）
  - `settings.json` + `.codex/hooks.json` — 新增 Bash matcher（Claude + Codex 双侧防护）
  - `hook-block-write.sh` / `hook-check-memory.sh` — source guard + SKIP_HOOK_WRITES 包裹仓库内写点（L37/L39/L323/L118/L136-144；/tmp 证据保留）
  - AGENTS.md — 铁律 0-3 禁止 git stash（替代方案: baseline-check / worktree / synova-commit）
- **修复**: U4 — pre-commit-check.sh 分母统一 /12（10 处）+ 头部注释 9→12 组
- **验证**: baseline-check 13/13 | hook-git-detect 13/13 | ban-stash 6/6 测试通过；真实 seed 28 条 tsc 存量 → "存量 28 + 新增 0"
- **作者**: Claude (D312)
- **正式首发**: D314（含日志五件套/自身健康/daemon 轻量触发）
