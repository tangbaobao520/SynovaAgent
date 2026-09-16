# PR 预算门禁只计审查面（D788 口径修正）

> 状态: implemented | 日期: 2026-09-16 | 决策: check-pr-budget.sh 文件数只计审查面（治理产物不计入 ①②），上限 12 不变 | 理由: CTO 验收 K3 批次四时误判「审计批次被预算门禁拦死」——K3 前置审 F1 证实该门禁对 docs-only PR 无自动执行点（CI 被 D515 跳过 + 本地软提示）；真实卡点是分支落后/冲突，门禁本身只造成**手工复核摩擦**

## 一、为什么改（口径而非拆锁）

- 门禁自述保护对象是**审查面**（冲突概率 ∝ 改动大小 × 分支存活时间）；审计批次产物是 append-only 治理产物（audit-reports/task-state/台账），按代码 PR 的 12 件上限去卡 = 把唯一落地路径堵死 + 诱导纯开销拆 PR。
- **适用范围（本 Note 同步显性化）**: 本门禁只在含审查面文件的 PR 上自动生效；纯治理/审计 PR（docs-only）**无自动执行点**——CI Iron laws 被 D515 docs-only 条件跳过（实测 ci.yml docsonly 正则匹配批次四全部 51 文件），本地为 soft_check + CT-34 早退。**保留 D515 跳过**（有意的性能设计），不强跑 docs-only（若要强跑属 CI 口径变更，交 CTO 裁决）。

## 二、改了什么（fail-closed 方向）

1. **计数口径**: 治理排除表 `GOV_PREFIX_RE='^(docs/|task-state/|\.claude/|memory/)'` 显式白名单；**未列路径一律默认计入审查面**（unknown_dir/ 自动计入，防新目录逃逸——F2）。
2. **双计数显性输出（F3 禁静默）**: 「审查面 N 件（上限 12）／ 治理产物 M 件（不计入）」；审查面 0 + 治理 N ≠ 「无变更文件」（原 :122 分支失真已修）。
3. **域判定只审审查面**: 治理产物不再触发跨域误拦（批次四的 k3 audit-reports vs mac coordination 假跨域消失）。
4. **上限 12 不变**；③ 落后检查不变；--files 注入缝与真 git 双模式均生效。

## 三、放宽后什么仍被拦（不许静默的安全边界）

- 审查面 > 12 件 → 拦（13 件代码 PR 仍红，测试 9b）
- 审查面跨域 → 拦（src(win)+scripts(mac) 仍红，测试 9c——治理豁免不掩盖真跨域）
- fail-closed: 未列入排除表的新目录默认计入（测试 9d）
- D708 合并级写集对账、G12 写集一致性不在本单范围（各管一段）

## 四、测试与验收

- tests/control-tower/check-pr-budget.test.sh 24 → **39 项**（+15: 12+30 放行/13 拦/跨域拦/fail-closed/N_FILES 语义/字面输出/沙箱副本反向验证 src/ 入排除表→绿、恢复→红）
- #572 双模式真跑: --files 51 件 → PASS（审查面 0／治理 51）；真 git（#572 分支 worktree + --base origin/main + 新脚本）→ PASS（改前旧脚本 FAIL 已留证）
- pre-commit 性能: 基线 2s → 改后 3s（≤+5s 红线内）

## 五、附带收口（F4/F5）

- F4: 派单模板.md 补「依据计划」锚点行 + 语义说明（@后 8 位 = 计划文档 sha256 前 8 位，非 git commit）；pre-dispatch-check.sh ⑩ 注释同步
- F5: 本单复核在与 origin/main 同步的 worktree（behind=0）跑 → 派单机械项全通过（修 3 处裸文件名引用后）
- 派单文档 3 处裸引用补全路径（ci.yml×2 / check-pr-budget.sh）——语义零改动，仅为可机械核验

## 六、遗留观察

- #572 旧脚本对其 FAIL 的原始输出已留存（PR 正文）——它是「改前」证据，也是 K3 §5 附加项（本 PR 非 docs-only → Iron laws 真跑）的对照
