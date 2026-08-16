# 审计发现台账（DSH-CTO 维护）

> **本文件由 DeepSeek Harness CTO（Mac DSH，2026-08-16 起）维护**，用于识别区分：
> - **本文件（审计发现台账-DSH-CTO.md）** = DSH-CTO 维护的完整台账——**承接原 `AUDIT-FINDINGS-LEDGER.md` 全部历史内容（不丢失）**，DSH-CTO 相关发现/固化登记于此（新增内容用 🆕 标注）。
> - **原 `AUDIT-FINDINGS-LEDGER.md`** = 历史文件（Codex/K3 维护期），**保留不动**，不再新增。
> - 用途：把 K3 审计发现 + DSH 控制塔固化固化为**开发过程迭代的关键素材**——改进控制塔 + 改进 dev doc 编写标准。
> - 关联：[AUDIT-PROTOCOL](AUDIT-PROTOCOL.md) / [ROLES](ROLES.md) / 审计报告 `docs/synova/audit-reports/` / 原台账 [AUDIT-FINDINGS-LEDGER.md](AUDIT-FINDINGS-LEDGER.md)

## 一、审计发现台账（历史，K3 审计发现 — 自原台账继承）

| 日期 | D# | 级别 | 发现 | 根因（该拦的防线） | 修复 | 改进归属 |
|------|----|:---:|------|------------------|------|:---:|
| 08-12 | D328 | P1-1 | python 损坏 shim 时一致性门禁**静默漏拦**（2/6 败，物理复现） | fail-open 把"检查未执行"与"检查通过"压成同一 exit 0；`command -v` 只探存在性不探可用性 | D330（探测+三态） | 控制塔+skill |
| 08-12 | D328 | P1-2 | DS4 声称"四条豁免全部测试覆盖"，Revert/无暂存**无用例** | DS verify 不映射"声称项↔用例"（自报无法自证） | D330（补 2 用例+措辞） | skill |
| 08-12 | D328 | P1-3 | DS7 无物理证据（bypass.log 空窗，ea1cb71 落窗内） | bypass.log 无对账方，执行证据链断裂无人发现 | D331（对账） | 控制塔 |
| 08-12 | D329 | P1-1 | tag V4.7.1 指向**孤儿提交** f685fa0（版本锚点断裂） | 无 tag-祖先校验（amend 重提交后 tag 未跟随） | D331（重指+校验） | 控制塔 |
| 08-12 | D329 | P1-2 | dc369fd 无 bypass.log 记录（**同型缺口第二次**） | 对账机制未建立即再犯 = 防线系统性失效 | D331（对账强制） | 控制塔 |
| 08-12 | D329 | P2-1 | write-set 记录无 task_id（dev doc §3.1 声称过度） | 文档-实现漂移：声称"记录含 X"但未实现/未验收 | D331 | skill |
| 08-12 | D329 | P2-2 | resolver --session **零生产调用方**（机制建成未接线） | dev doc §5 接线验收写浅：没要求"生产调用点真实传递" | D331（接线+§5 升级） | skill |
| 08-12 | D329 | P2-5 | synova-commit:367 裸 python3 + `\|\| true` 吞失败（同文件刚修过 commit-msg） | PYBIN 未全局对齐；`\|\| true` 连崩溃都吞 | D331（升级 P1） | 控制塔 |
| 08-12 | D329 | P2 其他 | 测试无 runner 接线 / genuine except 无 degraded / brief 引用不存在文件 / DS6"同 commit"与 gitignore 矛盾 / DS9 verify --self-test 无效 | 多个"声称 vs 物理"小缺口 | D331 清理 | skill+控制塔 |
| 08-09/12 | Mac ba653c3 | P2 | engine-core 退役清理"grep 物理证明零引用"**声称不实**：tests/run-e2e-pipeline.cjs（死文件）残留 3 处 packages/engine-core 引用 | M2 声称 vs 事实（清理时 grep 范围漏 tests/*.cjs） | 待清理 chore | skill |
| 08-12 | Mac 清理 | — | 审计基线 439→**434**（78K 删除，-5 FAIL / -1 arch / -2 WARN）；admin-knowledge.ts:17 L1→L4 违规**仍在**（D309 待做） | 大规模删除改变基线契约 | 基线已更新（2026-08-12） | 控制塔 |
| 08-12 | D330/D331 并行 | P0 | **共享暂存区拉锯**：D331 re-add 抢占 → D330 被 D328 门禁拒绝 → 循环（防护在工作，暴露 D307 缺失） | git index 是 worktree 级单例；门禁仲裁替代物理隔离；依赖任务被并行派发 | D332（软加固）+ D307（根治） | 控制塔+skill |
| 08-12 | K3 权威偏差审计 | P0×1 | **N13 反馈→规则闭环断裂**（middle-evolution 零调用、feedback-collector 无消费方） | 写了没接线（M3 类） | D333（P0） | 产品 |
| 08-12 | K3 权威偏差审计 | P1×5 | direction-monitor 未接线 / loop-4 无专属处理器 / GA 仅 type import / 静默升级回滚未实现 / orgId 未全量验证 | 多为"机制建成未接线/口径滞后" | D334-D338 | 产品+文档 |
| 08-12 | K3 权威偏差审计 | 文档×2 | AGENTS.md 哨兵口径 20 vs 45+4；N14 去重窗口 5 vs 30 | 口径滞后（代码无缺陷） | D339（待创始人定 N14） | 文档 |
| 08-12 | K3 D330 复审 | P1×1 | **bypass.log 连续第三个任务无记录**（6c00e46/407ff1f）——防线失效本身，两次排队进 CT 无物理执行体发现 | 对账机制只在队列，无自动执行 | **升级 P0 流程事项：D331 check-bypass-log 立即执行（K3 已给最小实现 comm -23）** | 控制塔 |
| 08-12 | K3 D330 复审 | 技术事实 | broken-python3 + 可用 python 时门禁**仍不拦截**（resolver PYBIN 无探测先死）——D330 只"不静默"非"仍拦截" | resolver 硬化未含探测 | D331 折入（§2.6/DS13） | 控制塔 |
| 08-12 | K3 D330 复审 | P2×5 | resolver exit 1 二义 / 用例 10 标题矛盾 / DS8 基线 439（我已误写 434 已修）/ V4.7.3 幻影条目 / 测试无 runner | 文档-代码小漂移 + 版本编排副作用 | D331 折入 + 文档已修 | skill+控制塔 |
| 08-12 | K3 权威偏差 v1.1 | P1×5 | ①V5 视图硬编码旧 6 专家（D282 未传播，铁律 9 违规实例）；②gate-status.json 缺失（3/19 信号仅 3 文件）；③铁律 36 无全量 vitest 强制点；④铁律 37 无 dead-code 扫描（direction-monitor 存活 11 天）；⑤铁律 9 无传播检查 | 控制塔视图/信号/铁律门禁缺失 | D340-D342 | 控制塔 |
| 08-12 | K3 权威偏差 v1.1 | 改判 | D-G2"已修复"→"引擎已修复，数据链路未担保"（gate-status 缺失 + 快照 11 天 + 自检盲区）；组 11 并入组 4（12 组计数口径 → D3）；铁律 38 确认全仓扫描 | 复核深化 | 演示前 checklist + D339 | 控制塔+文档 |
| 08-14 | K3 全链路审计 | P0×3 / P1×5 / P2×6 | **Agent 核心能力全链路 FAIL（0/3 贯通）**：L5 无 CRM/财务/HR 连接器；L4 类型契约断裂（Market≠Client、People≠Person、Event/Tool 零写入方）+ 属性契约断裂（cashBalance≠cash）+ filter bug（compute-cash-runway-months.ts:60）；P0 哨兵阈值告警生产死代码（sentinel-loader 从不挂 manifest）；L4 查询层静默 fail-open（schema 漂移只 warn 返回空）。活运行证明 L3 计算能力本身是真的，断裂在数据进出两端 | L5 连接器缺失 + L4 契约失配 + manifest 死代码 + fail-open | D355-D360（见仪表盘） | 产品 |
| 08-15 | K3 D366 审计 | P1×3 / P2×5 | **CONDITIONAL PASS（无 P0）**：DS1-DS8 八项物理一致（newermt=0、4 处生产调用、无 rm、T1/T2 双侧 15/15+12/12 绿、写集 9/9、版本三同步），自报偏离 a-i 全部诚实。**T3 故障注入发现 2 个新引入边缘回归**：P1-1 git commit --amend 必触发 detected-bypass head-mismatch 误报（marker 记旧 commit、HEAD^ 恒不等，一次 amend=当日提交死锁，CT-29 同型）；P1-2 D 前缀 brief 被"今日集合"物理排除（today_files_by_prefix 只匹配 YYYY-MM-DD-*，D 前缀 session 提交代码文件被 G12 阻断，§2.3 记录两种命名但方案只覆盖一种）；P1-3 dev doc 从未进入实现分支树（契约链分岔）。项 13 CI pending DEGRADED | 判定语义层缺口（dev doc 引用 CT-28 却语义层重蹈覆辙） | D373 | 控制塔 |

## 二、模式归纳（跨审计复现的根因类）

| # | 模式 | 首次 | 再次 | 对应防线 |
|---|------|------|------|---------|
| M1 | **fail-open 静默失效**（检查未执行==检查通过） | D328 P1-1 | D329 P2-5（`\|\| true`） | 三态输出（pass/degraded/fail） |
| M2 | **声称 vs 事实**（doc/报告 overclaim） | D328 P1-2 | D329 P2-1（task_id）、Mac ba653c3（零引用声称） | DS verify 覆盖映射；写集声称=实现+验收 |
| M3 | **机制建成未接线**（WIRE CHECK 失败） | D329 P2-2 | — | 接线要求"生产调用点真实传递"（测试不计） |
| M4 | **执行证据链断裂**（bypass.log） | D328 P1-3 | D329 P1-2（第二次） | git log vs bypass.log 对账 |
| M5 | **环境依赖门禁**（python3/broken shim） | D328 P1-1 | D329 P2-5 | PYBIN 全局 + 可用性探测 |
| M6 | **版本锚点断裂**（tag 孤儿） | D329 P1-1 | — | tag-祖先校验（pre-push/CI） |
| M7 | **文档-实现漂移**（dev doc 未回填/声称未实现） | D329 P2-1 | — | dev doc 与最终实现同 commit 回填 |
| M8 | **共享暂存区竞争**（并行 session 共用 worktree index） | D330/D331（08-12） | — | worktree 隔离（D307）+ staging-guard 指引/事件记录（D332） |

## 三、控制塔改进队列（CT）

| # | 项 | 来源 | 状态 |
|---|-----|------|------|
| CT-1 | fail-open 三态（gate 输出区分 pass/degraded/fail） | M1 | ⏳ 健康审计队列（D330 只做 commit-msg 局部） |
| CT-2 | WIRE CHECK 升级（≥1 生产调用点，测试不计） | M3 | ⏳ 健康审计队列（D331 §5 局部落地） |
| CT-3 | bypass.log 对账（post-commit + 定期/CI） | M4 | 🔄 D331 折入 |
| CT-4 | tag-祖先校验（pre-push） | M6 | 🔄 D331 折入 |
| CT-5 | PYBIN 全局对齐（全 scripts 裸 python3 清零） | M5 | 🔄 D331 折入（synova-commit）+ 剩余点待扫 |
| CT-6 | CI job 级判定（生成器假红） | D320 审计 | ⏳ 未排 |
| CT-7 | pre-commit 性能/双重执行 | D319 报告 | ⏳ 未排 |
| CT-8 | baseline-check.test.sh 3 失败 | D318 报告 | ⏳ 未排 |
| CT-9 | 10 个 .sh UTF-8 头块 | D318 报告 | ⏳ 未排 |
| CT-10 | staging-guard 被拒带指引（活跃 session/归属/建议） | M8 | 🔄 D332 折入 |
| CT-11 | attach.py SessionStart 强制 register session | M8 | 🔄 D332 折入 |
| CT-12 | wait_manager 暂存区竞争检测/提示 | M8 | 🔄 D332 折入 |
| CT-13 | 提交被拒事件记录（parallel-conflicts.log） | M8 | 🔄 D332 折入 |
| CT-14 | 审计协议 L3 加"并行合规"检查项 | M8 | ✅ 已入 AUDIT-PROTOCOL（2026-08-12） |
| CT-15 | worktree 隔离落地（D307：独立 index/暂存区/current-brief + worktree-manager 生命周期） | M8 根因 | 🔄 D307 dev doc 就绪（2026-08-12，V4.8.0）— 待派发 |
| CT-16 | 进化闭环接线（N13/middle-evolution 零调用） | K3 权威偏差 P0-A1 | 🔄 D333（P0）待写 dev doc |
| CT-17 | **bypass 对账物理执行**（防"队列无执行体"——连续 3 任务无记录） | K3 D330 复审 P1 | 🔄 D331 check-bypass-log（升级 P0 优先级） |
| CT-18 | resolver PYBIN 可用性探测 + 退出码 0/1/2 语义化 | K3 D330 复审 | 🔄 D331 折入（§2.6/DS13） |
| CT-19 | 控制塔 V5 视图动态化（agent_health 读 expert-registry） | v1.1 P1-B1 | 🔄 D340 |
| CT-20 | 控制塔信号完整性（gate-status 回填 + 自检部分缺失升级） | v1.1 P1-B2 | 🔄 D341 |
| CT-21 | 铁律 36/37/9 门禁补全 | v1.1 P1-B3~B5 | 🔄 D342 |
| CT-22 | P2 结转治理（测试 runner 接线 / 用例标题 / brief 引用 / genuine degraded）——3 审计连续 carried，禁再 carry | 多份 | ⏳ 控制塔健康审计批次 |
| CT-23 | DS 对账机制（交付声明 vs dev doc DS 一一对应，禁重编号，缺项显式 descope） | K3 D331 L4 | 🔄 S-10 已入 skill；门禁化待健康审计 |
| CT-24 | resolver 硬化交付（DS13：PYBIN 可用性探测 + 退出码 0/1/2） | K3 D331 P1-1 | 🔄 D352 |
| 演示前 | D-G2 数据链路动作（回填信号 + 刷快照 + 验红灯） | v1.1 改判 | 🔄 并入 D341 |
| CT-25 | 循环执行体真实化（loop-2/3/4/5/6 placeholder 假成功 → 真实执行 + 修假 completed + middle-evolution 接入） | v2 P0-A1/P1-C2 | 🔄 D333（P0） |
| CT-26 | 铁律 38 扫描范围扩至 packages/（as any 清理或声称降级） | v2 P1-C1 | 🔄 D353 |
| CT-27 | N14 去重键稳定（finding.id 去时间戳） | v2 N14 | 🔄 D354 |
| CT-28 | **verify-parallel --scan-today 语义缺陷**（L135-146 只按当天 mtime 圈 doc 两两比对，不理解「依赖/接力顺序」——D332/D307 与 D331 写集重叠被误判并行冲突硬阻断；自愈=离开当天范围即放行。K3 审计仅验「门禁 5 存在+接线」，未覆盖判定语义=控制塔语义审计盲区） | 2026-08-13 并行拦截复盘（K3 盲区，本机发现） | 🔧 建议并入 D332 写集或新建补丁 |
| CT-29 | **pre-commit marker 并发缺陷**：post-commit 靠全局单例 `.claude/last-precommit-success` 检测 --no-verify 绕过，多 session 并发时一个 session 的 post-commit `rm` 掉 marker，导致另一个 session 的正常提交被误判 `detected-bypass no-precommit-marker`，反过来触发 GATEKEEPER 硬阻断所有提交（2026-08-14 文档拉平 D362 死锁实证）。修复方向：per-session marker 或按 commit hash 对账，替代单文件时间戳 | 2026-08-14 D362 文档拉平死锁 | 🔧 建议新建补丁（D363+） |
| CT-30 | **Secrets 门禁 .env 过拦**：check-secrets.sh 全工作区扫描 + 本地 .env 检查把 gitignored 未跟踪的 .env（本地密钥库，产品运行依赖真实密钥的正常状态）当违规硬阻断 → 2026-08-14 23:04 .env 写入真实密钥起**所有提交被误拦**（上一 session WIP 卡死实证）。修复（D370）：未跟踪 .env 豁免；被 git 跟踪/被暂存 .env 仍阻断（泄漏路径不变）。测试 tests/control-tower/secrets-env-exempt.test.sh 7 用例 | 2026-08-15 D370 门禁自检发现 | ✅ D370 已修 |
| CT-31 | **hook 测试缺 git 操作矩阵维度**：改动 hook 判定逻辑的交付，测试必须枚举"git 操作 × marker 状态"矩阵（至少普通/amend/reset 重提 × 匹配/不匹配/缺失/陈旧）——amend 场景打破"一次 pre-commit 对应一次全新 parent"假设，D366 只枚举了 marker 内容维度漏了操作维度 | K3 D366 审计 L4 发现 1（P1-1） | 🔧 并入 D373 + S 队列 |
| CT-32 | **判定语义变更缺"新旧过滤器等价集对账"DS**：判定类门禁的语义变更，DS 必须含新旧逻辑等价集对账（真实目录跑新旧过滤器，输出集合 diff 为空或逐项豁免）——D366 改了 mtime→文件名日期，但 DS 只验"newermt 清零+调用数"，没验"新旧今日集合等价"，导致 D 前缀 brief 语义回归（dev doc 引用 CT-28 却语义层重蹈覆辙） | K3 D366 审计 L4 发现 2（P1-2） | 🔧 并入 D373 + S 队列 |
| CT-33 | **分支与 brief 无对账**：G12 skip_re 豁免 docs/ 使文档类越界提交对 scope 门禁不可见（分支污染）；brief 头部"分支"字段从不与 `git branch --show-current` 对账（死文本）——commit 时 brief 声明分支与当前分支对账，或删除该字段 | K3 D366 审计 L4 发现 3（P2-5） | 🔧 并入 D373 或健康审计批次 |
| CT-34 | **文档提交豁免严格门禁（只保留 Secrets 扫描）**：文档（docs/、.claude/task-briefs/、memory/ 等）提交仅为跨机器（Mac/未来同事）同步信息，不应与代码同跑 13 组严格门禁。现状卡点（实证）：①组 6 时间戳顺序（before-brief 残留）不区分文档/代码，文档提交被误拦（D362 文档拉平 + D366 审计登记反复卡）；②G12b brief 可解析性对暂存 brief 触发；③task brief/Q2 范围/测试/接线/架构/契约对纯文档无意义。豁免：12 组（task brief + Q2 范围 + 时间戳 + 测试 + 接线 + 架构 + 契约 + 类型 + 文件驱动 + CP3 + scope + 技能）；保留：**Secrets 扫描**（文档同样泄密，D312 settings.json token 实证）。文档"真实性"不靠 pre-commit，靠 K3 审计兜底（声称 vs 事实复核）。归属：门禁脚本 scripts/pre-commit-check.sh 是 DSH 地盘，由 DSH 实现 | 2026-08-16 创始人决策 + D362/D366 文档提交反复卡门禁实证 | 🔧 DSH 排期（新 D#） |
| CT-35 | **写集对账门禁**（brief 声称文件集 vs 实际提交 diff 校验——组 12 只查"超出范围"不查"少于声称"；D383 P1-1 漏交无门禁） | K3 D383 审计 L4-1 | 🔧 D384 折入 + 门禁化待健康审计 |
| CT-36 | **D# 注册表**（task-state/ 充当编号占用登记） | K3 D383 审计 L4-2 | ✅ **D384 已实现**：alloc-task-id.sh（查占用+单调递增+建壳登记，测试 12/12）+ persona/skill 取号纪律落位 |
| CT-37 | **产物-数据源一致性**（gen-cto-health 渲染前重算数字，与已提交产物差异非时间戳 → 告警；防 CTO-HEALTH 数据无源） | K3 D383 审计 L4-3 | 🔧 D384 折入 |
| CT-39 | **CI 红超 24h 自动入 CTO 待办**（红常态化 = 信号失效 M1 同型；D387 P2-5 实证 CI 双红无人认领） | K3 D387 补核 P2-5 | 🔧 待排（CI 状态回写仓库后自动触发） |
| CT-38 | **新 .py 脚本必须有测试配对门禁**（pre-commit 组 2 只对 .ts/.tsx；gen-cto-health.py 329 行零测试漏网） | K3 D383 审计 L4-4 | 🔧 D384 折入 + 门禁化 |
| 权威18 | 审计体系冲刺（7 任务重编号 D343-D349）：D343 bypass A+B（P0）/ D344 报告git+dispatcher（P0）/ D345 doc-audit / D346 组13 / D347 JSON规范 / D348 CLAIM标签化（5份核心80%，按§5.5+验收#7）/ D349 JSON生成器 | 权威文档 18（2026-08-12） | 📝 D343-D349 待写 dev doc |
| 决策 | N14 去重窗口 ✅ 裁决 A（文档改 5 分钟，任务地图 v2 已改 2026-08-13）｜P0-8 boss 角色 ✅ 裁决 A（ENT 补 → D351）｜npm audit ⏳ 待裁（建议豁免并入 D309/D310） | 创始人 2026-08-13 | 🔄 D351 待写 + D339 含 N14 |
| 08-13 | K3 D331 复审 | P1×1 | **DS13 静默消失**：dev doc 承诺 resolver 硬化（PYBIN 探测 + 退出码 0/1/2）零交付，交付声明止于 DS12 无 descope——D330 L4#2 同构复发；broken-python 门禁仍不拦截、无 brief 仍误标 degraded | dev doc 完成标准 ⊆ 交付声明无对账机制 | D352（补做）+ S-10（skill） | skill+控制塔 |
| 08-13 | K3 D331 复审 | P2×4 | 25/25 vs 24/24 计数失真；brief 未入仓；"已写 memory"声称不实（第 2 次公式化声称）；测试无 runner（carried） | 声称-事实小漂移 | S-11（skill）+ carried | skill |
| 08-13 | K3 权威偏差 v2 | P0 加深 | **N13 根因加深：loop-3/5 名义进化通道是 placeholder 假成功**（loop-handlers.ts:4-5 "D9 未兑现"），每次 cron 触发写伪造 'completed' 记录（main-agent.ts:182-199）——断裂在仪表盘不可见 | placeholder 假成功 + 假审计记录 | D333（P0，吸收 D335/P1-C2） | 产品 |
| 08-13 | K3 权威偏差 v2 | 新 P1×2 | P1-C1：铁律 38 "as any 零存在"不实（组 1 只扫 src/，packages/ 36 文件 81 处无门禁）；P1-C2：4 默认循环处理器全 placeholder（吸收 P1-A2） | 门禁扫描范围盲区 + 假成功 | D353 + D333 吸收 | 控制塔 |
| 08-13 | K3 权威偏差 v2 | 改判 | 铁律 38 从"实证全覆盖"**退回**（packages 盲区）；D-G2 精确化（freshness/CP1 被动记录型，cp1 停 08-01）；N14 真问题是**去重键不稳定**（finding.id 含时间戳），窗口是二级 | v1.1 复核不完整 | D354 + 台账修正 | 控制塔 |
| 08-13 | K3 权威偏差 v2 | 文档 D5 | C线 S5-3/T-2/A线 B6 的 ✅ 基于 placeholder 接线，证据失去支撑 | 声称基于假执行体 | D339 扩 | 文档 |

## 四、dev doc 编写 skill 改进队列（Codex synova-dev-doc）

| # | 改进 | 来源 | 状态 |
|---|------|------|------|
| S-1 | **MANDATORY push+CI DS**（推送后 origin..HEAD 空 + CI 逐 job 绿） | D328/D329 未推送教训 | ✅ 已入 requirements.md（2026-08-12） |
| S-2 | 写集表"记录含 X"声称 = 实现 + 验收（禁声称过度） | M2 | ✅ 已入 requirements.md（2026-08-12） |
| S-3 | §5 接线要求必须"生产调用点真实传递"（测试调用不计） | M3 | ✅ 已入 requirements.md + template.md（2026-08-12） |
| S-4 | DS verify 命令必须有效且映射"声称项↔用例" | M2/DS9 | ✅ 已入 requirements.md + template.md（2026-08-12） |
| S-5 | 测试 red 必须覆盖"失败模式"（broken shim/劫持/绕过），非仅 happy path | M1/M5 | ✅ 已入 requirements.md + template.md（2026-08-12） |
| S-6 | dev doc §3.2 最终实现同 commit 回填 | M7 | ✅ 已入 template.md（2026-08-12） |
| S-7 | 依赖非空 → 禁止并行派发（派发说明标注 worktree 要求） | M8 | ✅ 已入 requirements.md + template.md（2026-08-12） |
| S-8 | 写集表标注共享资源（VERSION.md/current-brief/暂存区） | M8 | ✅ 已入 requirements.md + template.md（2026-08-12） |
| S-9 | 任务前置含环境检查（session-registry 活跃 session） | M8 | ✅ 已入 requirements.md（2026-08-12） |

## 四、DSH 防线映射（synova-dsh persona 免疫细胞）

> 2026-08-15 创始人批准：K3 审计错误闭环覆盖 DeepSeek Harness。DSH 无 PreToolUse hook，
> 免疫细胞形态 = persona 规则（`~/.dsh/.agent-presets/synova-dsh/agent.cordis.yml`）。
> 闭环规则：**同类错误第二次出现 = 防线系统性失效，必须升级给创始人。**

| M 模式 | 根因类 | DSH persona 防线 |
|--------|--------|------------------|
| M1 | fail-open 静默失效（检查未执行==检查通过） | SOP ⑤ verify 必须真实执行；验证失败 ≠ 通过；降级诚实（自检 5 问 2） |
| M2 | 声称 vs 事实（doc/report overclaim） | 汇报必须文件 + 行号；"拆完了"由 grep 物理证明（铁律 47） |
| M3 | 机制建成未接线（WIRE CHECK 失败） | 自检 5 问 1：新 export 谁调用（grep 确认调用方存在） |
| M4 | 执行证据链断裂（bypass.log） | 禁止 --no-verify；提交走 synova-commit |
| M5 | 环境依赖门禁（python3/broken shim） | 关键脚本 PYBIN 探测；脚本失败不算通过 |
| M6 | 版本锚点断裂（tag 孤儿） | 铁律 0-3：开工前 git fetch + pull --ff-only；禁止 behind 开工 |
| M7 | 文档-实现漂移（dev doc 未回填） | 交付汇报与实现同 commit 回填 |
| M8 | 共享暂存区竞争（并行 session） | 分支隔离（铁律 0-3/34）+ 认领制（D296） |

**DSH 侧审计发现闭环流程**：
```
K3 发现 → 查本台账 M 模式 → 归属判定
  · DSH 犯的错 → 记入台账 + 长成 persona 规则（免疫细胞）
  · 控制塔/工程缺陷 → 记入 CT 队列（DSH 领地，负责修）
  · 审计脚本/审计标准 → 只转达 K3，绝不修改 scripts/audit/（红线）
→ 记录 → 同类第二次 → 升级创始人
```

## 五、演进记录（DSH-CTO 维护期 🆕 自此追加）

| 日期 | 事件 |
|------|------|
| 2026-08-12 | 建台账；登记 K3 D328/D329 两轮审计发现（P1×5 + 关键 P2）+ 7 模式 + CT/S 队列 |
| 2026-08-12 | S-2~S-6 写入 synova-dev-doc skill（requirements.md + template.md），skill 改进队列全部落地 |
| 2026-08-12 | 登记 Mac 双提交（ba653c3 engine-core 清理 + 46b9271 D321 Mac 兼容）；审计基线 439→434；admin-knowledge D309 待做；run-e2e-pipeline.cjs 残留待清；分支分歧待合并 |
| 2026-08-12 | D330/D331 共享暂存区拉锯事件 → 根因三层（物理/设计/流程）+ M8 模式 + CT-10~14 + S-7~9；D332 dev doc 就绪（V4.7.4）；PARALLEL-DISCIPLINE.md 建立 |
| 2026-08-12 | **D307 dev doc 补齐**（长期 backlog 未落地，本次承认疏漏并补写；V4.8.0 物理根治）→ CT-15 |
| 2026-08-12 | K3 权威偏差审计（A线复核）登记：P0×1/P1×5/文档×2 → D333-D339 队列；已闭环×4 防重定案；G6 改判；快照 08-01 观察项 |
| 2026-08-12 | K3 D330 复审：CONDITIONAL PASS（P1-1/1-2 独立复验通过，加分项诚实标注）；bypass 连续 3 任务无记录 → 升级 P0；resolver 探测折入 D331；DS8 基线 439 修正（我误写 434） |
| 2026-08-12 | K3 权威偏差 v1.1：P1-B1~B5 → D340-D342；D-G2 改判；铁律覆盖总表（36/37/9 无门禁）；组11 修正；D-G2 数据链路演示前动作；P0-8/N14 待决策 |
| 2026-08-13 | 权威文档 18（审计体系）登记：D# 冲突重编号（研究方案 D331-337 → D343-349，7 任务）；代码现状核（dispatcher/doc-audit-interface/claim-tag-spec 已存在，doc-audit.sh/bypass-log-reconcile.sh 缺失，报告未 git 跟踪）；标注方案内部矛盾（§五迁移 vs §5.5 不迁移，按 5.5+验收#7） |
| 2026-08-13 | 创始人裁决 N14=A（文档改 5 分钟已落实）+ P0-8=A（ENT 补 boss → D351）；建立"创始人待裁决区"（npm audit 仍待）；复盘：待裁决项此前只登记未主动提出，流程已纠正 |
| 2026-08-13 | K3 D331 复审：CONDITIONAL PASS——D329 的 P1/P2 全部落地（bypass 证据链首次完整）；P1-1 DS13 resolver 硬化零交付（D352 补做）；P2×4；L4 DS 对账机制 → S-10/S-11 已入 skill |
| 2026-08-13 | K3 权威偏差 v2：N13 根因加深（placeholder 假成功 + 伪造 completed）→ D333 扩为循环执行体真实化；铁律 38 改判退回（packages 81 处 as any）→ D353；N14 真问题去重键 → D354；D335 吸收；D5 文档 → D339 |
| 2026-08-13 | 决策参考机制建立（DECISION-REFERENCE.md）：四步框架（第一性原理→Anthropic→DeepSeek 开源实证→收敛检查）+ 记录参考系强制；S-12 入 dev-doc skill（多选项任务必填决策参考小节 + 完成报告决策记录） |
| 2026-08-15 | **DSH 审计闭环建立**：① 决策模式（D333）写入 synova-dsh persona——技术决策自决四步 + 记录参考系 + 收敛直接执行，只有产品/业务决策问创始人（创始人无代码基础，禁止转嫁技术决策）；② 审计免疫写入 persona——K3 发现 → 查台账 M 模式 → 归属判定（DSH 犯错→persona 规则；控制塔缺陷→CT 队列；审计脚本→只转达 K3）；③ 本台账新增 §四 DSH 防线映射（M1-M8 → persona 规则）；④ 台账维护权扩至 DSH（创始人批准） |
| 2026-08-16 | 🆕 **哨兵口径核实（D378，CTO 审计后更新）**：哨兵为双体系——文件驱动 45 个（extensions/sentinels/，42 个在顶层 manifest + 3 个规范外：path-dependency / sentinel-forecast-accuracy / sentinel-pricing-strategy）+ 内置适配器 4 个（src/sentinel/adapters/）= **49 活跃**，另有 12 个退役（_extinct/）。**发现 3 个新事实**：①交接文档与 AGENTS.md 的「26/20 哨兵」口径过时（源头=台账 D339 计划名未落地，D339 编号被 quotepath 修复占用，编号冲突）；②**path-dependency 哨兵空壳**（manifest entryPoint 指向不存在的 computes/detect.ts，registerLoadedSentinels 将报错，实际可注册 44/45）；③台账 D360「规范外哨兵 2 个」应为 3 个。修正：AGENTS.md / cto-handover skill（.claude+.dsh）/ DASHBOARD-CN 三处口径统一为 45+4=49；D360 计数修正。**遗留：path-dependency 空壳补实现（归属 DSH 哨兵切片）** |
| 2026-08-16 | 🆕 **控制塔固化 D381（maker 建议 → CTO 独立验证后实施，待 K3 审计）**：① `dev-doc-gatekeeper.sh` 新增 **C6 写集表存在性检查**——`devdoc_writeset.py --extract` 提取失败 = FAIL 阻断（堵 `check-dev-doc-write-set.sh` 的 fail-open：无写集表曾 SKIP + exit 0，M1 活实例）；② `devdoc_writeset.py` 容忍写集表标题后空行（解析器脆弱性修复）；③ dev-doc persona 新增三条纪律（写前必读 D352 范例对齐 7 样结构 / 格式契约：写集表标题 + §8 只用「Wiring Verification」/ 接线 grep 实测 + read 被调用方真实定义）；④ 顺手修 pre-existing 假失败：`test-dev-doc-gatekeeper.py` 引用不存在的 .py（D212 后回归 .sh 测试未跟上，32512 command not found，M7 漂移）。**测试：新 9/9 + 既有 5/5 全绿。改门禁 = 无豁免，待 K3 审计。生效条件：dev-doc session 重启加载新 persona。** |
| 2026-08-16 | 🆕 **任务状态机 D382 建立 + 审计闭环铁律（创始人裁决）**：① 新增 `task-state/`（README 状态机 + TEMPLATE + D356/D379 示范），「dev-doc spec + 代码 + 审计报告」三产物唯一串联点；② **创始人裁决：K3 审计出问题 → 一律另起 FIX 任务，禁止直接改原任务（证据链混淆）**——原任务已交付+写集 close，塞回修复污染证据且 K3 无法区分原问题与修复质量；折入例外需 CTO 判定（同领域+进行中+改动小）并标注；③ 第③面 CTO-HEALTH 新增 §五 任务状态汇总（读 task-state/ 显示 spec/impl/audit 三态）；④ cto-handover 技能固化审计闭环铁律（§八b）；⑤ dev-doc persona 加步骤 ⑧（spec 后更新 task-state）、编码 persona 加步骤 ⑦b（impl 后更新 task-state），已落位（重启生效）。**阶段 2（K3 JSON 自动填充）/ 阶段 3（门禁强制）待做。** |
| 2026-08-16 | 🆕 **D387 审计（K3）— CONDITIONAL PASS（无 P0；P1×2）**。CT-34 纯文档豁免门禁（pre-commit 白名单 + Secrets 保留），机制物理验证全绿（12 用例 17 断言、白名单矩阵、fail-closed、混合负测被拦、基线 435=435、north-star 对齐）。**P1-1（安全级）**：SYNO_GIT_CACHED_* 注入缝无武装守卫 + 豁免事件零审计落盘——组合 SYNO_SECRETS_ROOT 构成**无痕迹全 13 组旁路**（post-commit 检测失效，比 --no-verify 差一个审计维度），归 M4 强化；修复 = exempt.log 落盘 + SYNO_TEST_ARM 武装守卫（**已排 CT-P1-1**）。**P1-2**：CI 不可核（网络超时），需创始人本地核（git log origin/feat/d387-doc-commit-exempt..1c72c2be 为空 + CI 逐 job）。P2×4（行号未回填 M7 / DS14 交付声明无载体 M2 / 基线 434→435 漂移观察 / 豁免面 task-state 单点依赖 K3 审计观察）。报告: docs/synova/audit-reports/2026-08-16-D387.md。 |**补核（2026-08-16）→ verdict 转 PASS**：推送 range 空（1c72c2be 已推）+ CI 6/8 绿、2 红预存（admin-knowledge.ts:17 D309 + npm audit）本地复现排除 D387。**新发现 P2-5（M1 同型）**：CI 双红 ≥16:03 无人认领 = 信号失效 → D391 派单（admin-knowledge 修复）+ CT-39（CI 红超 24h 自动入待办）。**创始人裁决（2026-08-16）：npm audit 豁免**——33 漏洞在 node-gyp 编译链非产品运行时 + 本地部署攻击面不成立；CI 改 continue-on-error 黄灯；触发升级条件 = 上云/公网化。 |
| 2026-08-16 | 🆕 **D383 统一批次审计（K3）— CONDITIONAL PASS（无 P0；P1×4）+ M4 第三次复发（升级创始人）**。报告: docs/synova/audit-reports/2026-08-16-D383.md（审计工作区，已提交 99820d6）。通过面：C6 fail-open 已堵（9/9+5/5 物理复跑）、哨兵口径 45+4=49 属实、基线 434 未恶化、推送属实、north-star 对齐。**P1×4**：① 写集漂移（brief 声称 25 文件实际 23——TASK-ROUTING 未提交 + D356/D379 spec 未入库，M2 类）；② D382 编号撞车（task-state 状态机 vs dev-doc 线 doc-commit-exempt 共用 D382，D339 教训重演）；③ CTO-HEALTH 产物数据无源 + D383 无 bypass.log 记录（**M4 第三次触发**——D328→D329→D383；根因含 CTO 操作：git reset --hard 回滚致生成时 bypass.log 中间版本丢失，产物不可复现）；④ gen-cto-health.py 幂等声称不实（时间戳内嵌恒写文件）+ 329 行零测试。**L4 缺口 4 项**（写集对账门禁 / D# 注册表 / 产物-数据源一致性 / 新脚本测试门禁）→ CT 队列。**按铁律：P1 修复另起 FIX 任务（D384），禁直接改原任务 98b0d4d1。** |
