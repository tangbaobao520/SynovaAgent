# D555 — verify-parallel --ci-pr 已关闭任务豁免（serial reuse）

> 状态: implemented | 2026-08-28 | by: dsh-cto | 关联: D551 / V5.2.4

## 决策

--ci-pr 写集比对只拦「在途并行冲突」；对已关闭任务（task-state audited 或 audit-reports 有报告）的串行文件复用豁免。

## 背景

D551 新任务 spec 合法复用 src/server.ts（D478 已合）与 src/growth/feedback-collector.ts（D338 已合），V5.2.0 的「无豁免纯重叠判定」CI 恒拦——串行演进被误判并行。V5.0.1 曾用「写集文件都在 main」豁免，V5.2.0 因该信号恒真而移除；本修复换**任务状态信号**（audited 终态 = 关闭），保留在途拦截能力。

## 实现要点

- `_is_closed_doc()`：task-state/<D#>.json status=audited 或 docs/synova/audit-reports/*-<D#>[-.md] 存在 → 豁免；都无 → 继续比对（fail-closed）
- 只豁免已合 doc 侧（mtmp），PR 自身 doc 不做关闭判定
- 豁免输出显式点名「已关闭任务豁免（serial reuse）」——K3 可核

## 教训沉淀

- 门禁的豁免信号必须选「状态信号」（任务生命周期）而非「存在性信号」（文件在 main 恒真）——否则豁免恒过、门禁失能
- 串行复用（sequential reuse）与并行冲突（parallel conflict）的区分标准 = 任务是否已关闭，不是文件是否已提交
