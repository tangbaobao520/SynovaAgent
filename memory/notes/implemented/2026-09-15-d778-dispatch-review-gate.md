# 派单文档复核从习惯变门禁（D778 pre-commit 强制）

> 状态: implemented | 日期: 2026-09-15 | 决策: staged 派单文档必须过 pre-dispatch-check，pre-commit 物理强制（本地软/CI 硬） | 理由: 创始人 2026-09-15「你写的派单文档是否符合过（复核过），你的产出交付前必须符合过，并且这个流程要固化下来」

## 一、触发（创始人指令）

D778 实测三条：① pre-dispatch-check.sh 只在人工想起时跑，没人跑也不拦；② 该脚本曾在第②项崩（D771 修的 `${pr}/${st}` 全角边界）→ 第一遍复核结论不完整却看起来"跑过了"；③ 复核结论依赖跑它时的工作树——工作树落后 main → plan 哈希与 task-state 集合是旧的 → 假红/假绿（批五派单首轮即遇到）。

## 二、决策（本 Note 对应的交付）

1. **独立门禁脚本 `scripts/control-tower/check-dispatch-gate.sh`**（三态 0/1/2，契约见文件头）：staged `docs/synova/coordination/派单-*.md` 逐个跑 pre-dispatch-check；注入缝 `SYNO_PRE_DISPATCH_DOCS`（只能加不能减：置空=回退探测，fail-closed）+ `SYNO_PRE_DISPATCH_BIN`（测试降级路径）。
2. **两处接线，不占 13 组编号**（D734 同款理由：改总组数打破 fastlane 测试横幅断言）：
   - 主流程（D734 PR 预算块后）——覆盖混合提交；
   - **CT-34 纯文档早退分支内（关键发现）**——派单文档命中 CT-34 白名单（docs/*.md），纯派单提交在组 1 前早退，只放主流程一块 = 门禁对派单最常见的提交形态虚设。D472 Notes 门禁同款补法。早退分支不达结果块 → SYNO_CI=1 时由调用处显式 `exit 1` 裁决（否则 CI strict 漏拦）。
3. **判定语义**：soft_check = 本地软提示 + SYNO_CI=1 转硬（V5 CI 权威）；降级（exit 2）同样点名显式留痕，绝不静默当绿（铁律 11）。
4. **配对测试 `tests/control-tower/check-dispatch-gate.test.sh`**：19 断言（绿/红×2/降级×2/边界×2/接线 grep/CT-34 集成红绿/跳过性能），沙箱 git 仓库验证自动探测 glob 不误拦 `编码指令-*.md`。

## 三、为什么不直接在 pre-commit-check.sh 里写循环

独立脚本可被 ct-test-gate（U7/CT-40）配对约束、可独立三态测试（不跑全量 13 组）、被两处调用单一事实源。铁律 35：能写 check-*.sh 的不靠 review。

## 四、遗留观察（非本单写集，已登记不改）

`check-silent-swallow.sh --utf8` 实测 main 上 16 个 .sh 缺 PYTHONIOENCODING 头块（scripts/ci 4 + control-tower 6 + workflow 4 + hooks 1 + …，含 pre-dispatch-check.sh 自身）——存量欠账，超本单 PR 预算（≤12 文件），待 CTO 另行派单。

## 五、验收补丁（2026-09-15 条件通过后）：① 项规则引用型 D# 假阳性

实测（创始人验收 + 55f1e601 设计输入）: 批五派单 L114「按 D734 拆单」被 ① 项当任务号点名——D734 是 PR 预算门禁的**决策编号**，非任务号。假红即噪音，噪音导致绕过。

**选型 (b) 引用词旁路**（拒绝 (a) 结构位置判定的证据）: 批五 L108 `| 5+ | D760 / D766 / … / D769 |` 的真任务号在表格格**中段**，而 L114 的规则引用也在表格行内——两类同处表格，纯位置无法区分；选 (a) 会漏检 D769 这类真任务号（门禁失去牙齿）。(b) 豁免 = D# 紧跟引用词（按/参见/参考/依据/规则/规约/决策[：:]?），其余 D# 一律照旧校验（fail-closed）；历史文档原样通过（无需改已合文档）。

- 落点: pre-dispatch-check.sh ①（ALL_D − RULE_D = 待校验集, comm 求差）+ 头部契约写明豁免规则
- 显式留痕: 豁免打 ℹ️ 行（铁律 11——为何不校验可见），门禁红路径透传该行
- 测试: pre-dispatch-check.test.sh ⑧正例/⑨反例（8→11 断言）; check-dispatch-gate.test.sh ⑫⑬⑭（19→23 断言，⑭=批五实弹: 残余告警 ⊆ {D769,D773}，PR #567/#568 合并后自消为 rc=0）
- 明确不做: 不给 D734/D336 补 task-state 占位（污染号段 = 造假）
