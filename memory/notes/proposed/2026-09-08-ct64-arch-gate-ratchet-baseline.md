# Note(proposed): 架构门禁存量治理采用棘轮基线模式（CT-64）

- 状态: proposed（待 K3 审计 + 控制塔裁决后 git mv 至 implemented/）
- 日期: 2026-09-08
- 提出者: DeepSeek Harness（dsh-cto 线，CT-64 派单）
- 关联: 台账 CT-64 | D601 扫描报告 docs/synova/research/L1跨层违规扫描-20260908.md | D515/D516 软提示-CI 权威先例

## 决策内容

门禁脚本发现大面积存量违规（68 处 L1 跨层 import）时，**不采用"修补即全红"**，而采用**棘轮基线（ratchet baseline）**：

1. 存量登记：全部 68 处按 `[方向段] file=count` 粒度登记进 `tests/architecture/l1-cross-layer-baseline.txt`（git 跟踪、可 diff、K3 可审计；总量只减不增）。
2. 可见性：门禁每次运行逐行打印存量违规（file:line:内容），对照扫描报告可核——**假绿变明账**。
3. 新增即红：基线外新增违规，本地 ⚠ 软提示（exit 0，D515），SYNO_CI=1 转硬阻断（exit 1，D516）。
4. 修复收紧：每修复一处，同 PR 下调基线计数；低于基线时门禁提示"棘轮只减不增，请收紧"。
5. fail-closed：扫描源缺失 → exit 2（检查自身失败，绝不与通过混同）——根除 M1 fail-open（`|| true` 吞 grep 自身失败 → 假绿）。

## 参考系（D333 四步）

- 第一性原理：门禁的本质是"新违规不可入"；存量是迁移债，归分簇派单治理，不归门禁全红。
- Anthropic 工程基线：fail-closed + 机器可验契约（基线是文本文件，物理可审）。
- 开源实证：dependency-cruiser / eslint boundaries 的 baseline 模式同构；仓库内先例 packages/test-kit 05-as-any-audit 棘轮（D565）。
- 收敛检查：三参考系同指棘轮基线 → 收敛，执行。

## 适用边界

- 仅适用于"存量大面积违规 + 一次性全红会压垮编码线"的门禁场景；新门禁（无存量）直接硬阻断，不得预借基线。
- 基线文件是门禁写集的一部分，豁免≠基线：豁免（// arch-allow 行内标注）是"判定为不违规"，基线是"违规但已登记待修"。
- 台账 CT-64 治理顺序背书：先修脚本可见性 → 分批修 src/ 六簇（扫描报告 §三）。

## 反面教训（本决策防的事故）

- 2026-09-08 D601 扫描实证：`check-architecture.sh` 输出"全部通过 ✅"而 68 处实违并存——名字豁免恰中违规文件 + 动态 import 全逃逸 + 路径形态盲区 + fail-open，四类漏网叠加成假绿。
