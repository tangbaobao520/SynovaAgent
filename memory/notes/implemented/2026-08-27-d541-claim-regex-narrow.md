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

## CI 红三处根因链（CI 日志实证修复，2026-08-28 补记）

D541 首次推送 CI「2 组未通过」→ 修复 memory_refs 后变「1 组」→ 修复 G12 后**绿**。三处根因（均从 CI 日志实证，token 按 V5.1.3① 惯例取 ~/.dsh/.credentials.yaml）：

1. **组5 铁律47（brief 自我触发）**: 本任务 brief 的 Done verify 行写了 `grep -qF '完成.*迁移'`——该字面量**命中收窄后正则的『完成…X』方向** → 铁律47 误触发。修法：改用不含完成声称字面量的锚（bare『迁移』且同行无『完成』）。**教训：验证正则存在的 verify 行不能写正则字面量本身**。
2. **组6 memory_refs 为空**: plan.json 无 memory_refs 字段 → soft_check「Q1a 未引用 memory/ 文件」。修法：plan.json 回填 brief Q1c 引用的 memory 教训路径（须真实存在，check 对缺失路径硬阻断）。
3. **组12 G12 Q2 行号后缀**: brief Q2 写成 `scripts/pre-commit-check.sh L750` —— **brief_parser.parse_q2 不剥 ` L\d+` 后缀**（devdoc_writeset.clean_entry 会剥，brief_parser 不会）→ match_path 精确尾匹配失败 → 判「不在 Q2 范围」。修法：Q2 路径行禁带行号后缀。

**方法论教训（M4/M2 完整闭环）**: 本地 SYNO_CI=1 复验有两类盲区——① staged 为空时 resolve-commit-brief 解析不到 brief → 铁律47/G12 被跳过（假绿）；② 日期翻篇（brief 文件名前缀非「今日」）→ 同样解析不到。**唯一可靠复验 = push 后用 token 拉 CI 日志逐行核对 ❌**（本地三层直验只作辅助）。

## 版本管理（规范补齐，2026-08-28）

按 docs/synova/coordination/版本管理规范-控制塔.md 执行：D540 → V5.2.0（MINOR：install-hooks clone 配置初始化 + verify-parallel --ci-pr 新模式 + 门禁5 迁移）；D541 → V5.2.1（PATCH：铁律47 门禁判定逻辑变化）。VERSION.md 条目 + logs/version.log（runtime，gitignored）已写；tag 按 §6 合并 main 后补打（D319 feature 推送合法）。
