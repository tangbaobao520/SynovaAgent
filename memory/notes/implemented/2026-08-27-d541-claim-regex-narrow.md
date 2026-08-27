# D541 铁律47 声称完成正则收窄 — 决策与教训

> 状态: implemented | 日期: 2026-08-27 | 任务: D541 | 决策: pre-commit L750 铁律47 正则从 bare 词收窄到完成语义，去掉裸词「拆分/迁移」 | 理由: D540 brief "verify-parallel 迁移改三处"（工作描述）被旧正则误触发铁律47 → CI strict 硬阻断（D540 P0-1 CI 红）

## 决策记录

1. **收窄 L750 正则至只认完成语义**：旧 `拆分\|迁移\|清理.*完成\|已拆\|已迁移\|已清理` 把 bare 词「拆分/迁移」也当完成声称。收窄为 `已拆\|已迁移\|已清理\|拆分.*完成\|迁移.*完成\|清理.*完成\|完成.*拆分\|完成.*迁移\|完成.*清理`——去掉 bare「拆分/迁移」（不做完成声称），只认「已X / X.*完成 / 完成.*X」完成语义。
2. **扩展用户给定正则**（补 `完成.*拆分/迁移/清理`）：用户给定正则 `已拆|已迁移|已清理|拆分.*完成|迁移.*完成|清理.*完成` **捕不到「已完成迁移」**（完成在迁移前，`迁移.*完成` 顺序相反），而用户测试明确要求「已完成迁移」触发。以测试为具体规范，补 `完成.*拆分|完成.*迁移|完成.*清理` 三个正序分支，使正则与测试一致。
3. **配对测试**：`tests/control-tower/claim-regex-narrow.test.sh`（正常/降级/边界/接线 9 断言）。
4. **同步修正 D540 brief**：去掉「verify-parallel 迁移」claim 措辞（改用「verify-parallel 三处改动」），消除 D540 CI 红（D541 是根因根治）。

## 执行中的教训（滚动记录）

- **「本地过=全过」的杀伤力（M4/M2 实证）**：D540 先被用户诊断「brief 措辞触发 CI 红」，我全面 SYNO_CI=1 仿真后**额外发现 4 处 silent-swallow（`2>/dev/null` 无 `# swallow-ok:`）也会让 CI 组2 红**——用户 brief-only 诊断不完整。教训：改控制塔/门禁相关交付，必须用真实全量 SYNO_CI=1 仿真验证，不能靠单点诊断或本地软提示。
- **docs-only 豁免陷阱**：pre-commit-check.sh 在「仅 brief 变更」时走 CT-34 docs-only 路径（只跑 Secrets），**跳过 12 组**——此时「exit 0」不代表 12 组通过。验证 CI 必须构造含 scripts/tests 的完整 staged 集合（或 worktree 应用完整 diff + SYNO_CI=1），否则是 M4/M2 误判。
- **`grep -q` 接管道在 pipefail 下非确定性（SIGPIPE）**：`git log | grep -q` 提前退出→上游 SIGPIPE(141)→pipefail 当失败。物理断言须用 `grep -c`（读全量）。D540 clone-shadow-commit.test.sh 已修。
- **git 无 identity 时自动派生身份（username@hostname），非必降级**：要触发 post-commit L87 须 `user.useConfigOnly=true`。D540 C2 测试据此建模。
- **BSD grep 无 `-P` 使本地「假通过」**：pre-commit-check.sh 组8/组10 用 `grep -P`，本地 BSD grep 报「invalid option -- P」→ 这些检查本地不评估（假通过）；CI 用 GNU grep 正确评估。凡涉及 `grep -P` 的控制塔检查，本地无法完整复验 CI 行为——需 CI 日志或 GNU grep 环境。

> 备注：D541 CI quality job 一度显示「2 组未通过」（不可本地复现，疑为 GNU grep -P 差异）；以 SYNO_CI=1 干净复验 exit 0 为准，K3 审计用 CI 日志核对。
