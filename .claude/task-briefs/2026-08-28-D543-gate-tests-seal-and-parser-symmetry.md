# Task Brief: D543 门禁测试密封回归 + brief_parser 解析对称

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔测试与解析器层。两项：① CI 密封 canary（Control Tower Gate Tests 双平台）中 post-commit-marker.test.sh 红——D537 #4 恢复 D521 hook 层登记后行为变更（pass → bypass.log 新增 1 行 COMMITTED），测试断言停留在 D508 时代（pass → 不新增），M7 测试-实现漂移；② brief_parser.parse_q2 缺行号后缀剥离（devdoc_writeset.py:76 有同款 `L\d+` 剥离而 parse_q2 没有）→ Q2 写「x.sh L750」整体当路径 → G12 误判越界（D541 CI 红第三处根因）。
### b) 文件审计
tests/control-tower/post-commit-marker.test.sh（S1a/S6a/S7/S8 四处断言过时）；scripts/control-tower/brief_parser.py（parse_q2 path 链缺剥后缀）；tests/control-tower/brief-parser-strip.test.sh（加用例）；复用 devdoc_writeset.py:76 的既有正则模式，不发明新规则。
### c) 决策
已有正确行为参照（hook 层登记 = 设计意图；devdoc_writeset 剥后缀 = 既有模式）→ 对齐不发明。参考：第一性原理（断言必须匹配当前设计意图）+ D541 实证（解析器不一致造成真实 CI 红）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界：行为变更必须同 commit 更新受影响测试（断言与实现同源）；解析规则单一来源。
b) 顶尖团队：canary 测试红=优先修（它守护门禁本体）。
c) memory/ 教训：M7 测试-实现漂移；D541 三处根因实录（brief_parser 后缀缺失实测触发）；D382 K3 审计串联。

## Q2: 范围 — 正确的最简方案
做什么:
- 更新 tests/control-tower/post-commit-marker.test.sh（S1a/S6a/S7/S8 断言对齐 D521 hook 层登记：pass → 新增 1 行 COMMITTED）
- 更新 scripts/control-tower/brief_parser.py（parse_q2 path 链补 `L\d+` 后缀剥离，对齐 devdoc_writeset.py:76）
- 更新 tests/control-tower/brief-parser-strip.test.sh（加 D543 剥后缀用例）
不做什么（含文件路径）:
- 不改 scripts/hooks/post-commit.sh（hook 行为正确，是测试过时）
- 不改 scripts/workflow/check-dev-doc-write-set.sh、scripts/control-tower/devdoc_writeset.py（既有模式为参照）
- 不改 scripts/pre-commit-check.sh、scripts/audit/、src/、.github/workflows/ci.yml

## Q3: 验收 — 入口 → 交互 → 结果
入口（从哪触发）：CI Control Tower Gate Tests job + pre-commit 组12（G12 认领对账）
处理（中间步骤）：5 个密封测试在干净 checkout 全绿；parse_q2 对「x.sh L750」返回裸路径
结果（最终展示）：CI 双平台 Control Tower Gate Tests 转绿（canary 恢复）；G12 对含行号后缀的 Q2 不再误判越界

## 架构层: L0 控制塔测试/解析器层（scripts/ + tests/）
## Done 标准: 5 个密封测试本地全绿（post-commit-marker 18/18）+ brief-parser-strip 12/12 + parse_q2 实测剥「L750」通过 + CI 双平台 gate tests 转绿
