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
