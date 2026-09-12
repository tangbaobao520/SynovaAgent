---
状态: implemented
日期: 2026-09-12
决策: 新增「合并级写集对账 gate」（`merge_writeset_gate.py`）——PR 变更集 × **本 PR 自己的声明**（intra-PR），触发点选**合并前** PR job；无声明且含源码变更 → fail-closed
理由: M2 族三次实证（#449 夹带 51 文件 / #442 夹带 6 文件 / D593-FIX 声称提交实未提交）暴露同一结构：**作者声称的变更范围与实际变更范围不一致，而现有门禁都看不见这一格**。pre-commit 只看单提交暂存区；`verify-parallel.sh`（ci.yml L51-57）只做 inter-PR（本 PR × 已合 PR 写集）重叠。intra-PR 是完全空的一格。
---

## 决策

1. **触发点 = 合并前（PR job）**。合并后对账只能事后发现已污染的 main，与「夹带进不了 main」直接矛盾。
2. **与 verify-parallel 正交共存**，不替代、不重复造：前者 inter-PR（两 PR 撞同一批文件），本 gate intra-PR（单 PR 混入未声明文件）。
3. **声明源三源并集**（S1 `task-state.write_set` / S2 dev doc 写集表 / S3 brief Q2 include），
   后两者**复用既有解析器**（`devdoc_writeset.py` / `brief_parser.py`），零新 parser。
   取并集而非交集：三者都是作者自己的声明，取交集会把「在 A 声明、在 B 未列」误判为夹带。
4. **无声明 → fail-closed**（含源码变更时 exit 2）；纯文档范围降级放行 + degraded 登记。
5. **豁免必须显式且带理由**；缺理由的豁免条目**不生效**（有专门反例测试）。
6. **不设 SYNO_* 逃生舱**——逃生舱本身会成为绕过通道（V3.9：软机制 0% 有效）。回滚 = revert 提交。

## 为什么 fail-closed 而不是「缺失就放行」

若「无声明」默认放行，夹带的零成本路径就是**摘掉 brief**——gate 名存实亡。
代价是声明不完整的 PR 会变红，但修复成本是「补一行声明」，且修复指引三选一写在输出里。

## 能力边界（主动声明，防止被高估）

本 gate 只防「**多了**」（变更集 ⊄ 声明），**不防「少了」**（声明多、实际少 = D593-FIX 型）。
后者需要另一类 gate（dev doc DS 项 × 实际 diff 的覆盖校验），**已登记待派**，不在本任务范围。
把两者混为一谈会让 gate 名不副实——设计稿 §八第三条明确写了这一条。

## 诊断质量参照

DSH `dsh-hook-protocol/lib/index.js` 的 `matcherDiagnostic(matcher, mode)`（matcher 拒绝时必须给出
可读理由）与 `lib/invariant.js` 的「判定 / 状态推进分离」。输出含：结论 + 声明源逐条 + 豁免逐条理由
+ 夹带文件逐条 + 修复指引三选一；另有 `--json` 供上层聚合。

## 参考系

- 第一性原理：声明与事实必须可比对，且比对必须在**不可逆动作（合并）之前**
- 本仓先例：`verify-parallel.sh` 三态退出码 + 声明解析；D328（exit 0/1/2）
- 铁律 11（静默降级禁止）、铁律 35（自动化优先）、M2/M3/M4 模式
- DSH 范式：`dsh-hook-protocol` 的 matcher 诊断（只读范式，不引代码）

## 留痕

- 测试: `tests/control-tower/merge_writeset_gate.test.sh` 21/21 绿（密封沙箱，零网络）
- 接线: ci.yml `quality` job 新增 step + 密封清单末尾 +1 行
- T3 实证: 人为夹带 PR → CI job 红并点名；撤回 → 绿（job 级结论）
