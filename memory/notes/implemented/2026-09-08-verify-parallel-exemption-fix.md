# Note: verify-parallel 已关闭豁免双缺陷修复（信号3 大小写 + 信号4 反引号）

- 日期: 2026-09-08 | 任务: D599（附带门禁缺陷修复）| 状态: implemented
- 改动: scripts/control-tower/verify-parallel.sh `_is_closed_doc`（信号3 加 `-i`；信号4 cat-file 前 `f.strip('`')`）
- ⚠️ 门禁脚本改动，依铁律 0-5 交 K3 审计（先例: D555/D557 同脚本 Claude 线修复）

## 决策背景（实测复现）

D599 PR（#431）CI 组「TypeScript + Lint + Iron Laws」内 verify-parallel `--ci-pr` 误报：
`docs/plans/codex/implementation/SYNOVA-IMPL-D599-*.md` 与已合任务
`SYNOVA-IMPL-D598-token-meter-cost-guardrail-20260908.md`（PR #427/#428 已合并）写集重叠
`src/routes/diagnosis.ts` → block。但 D598 属已合并串行复用，正是 D555 豁免的设计对象。

## 根因（两处独立缺陷，均为漏配=该豁免不豁免）

1. **信号3 大小写漏配**: 豁免键 `--grep="(D598)"`（大写 D#）vs 仓库提交惯例小写 scope
   （`feat(d598): ...`）——`git log --grep` 默认大小写敏感 → 恒无匹配。
   D593/D594 能豁免纯属其提交恰含大写 `(D593)`/`(D594)`（task-state 亦为 claimed 非关键）。
2. **信号4 反引号漏配**: `devdoc_writeset.py --extract` 原样返回 markdown 表内
   `` `src/x.ts` ``（含反引号），信号4 用原串跑 `git cat-file -e base:`src/x.ts`` → 恒败。
   凡写集表用反引号（主流写法）的任务信号4 全盲。

## 修复

- 信号3: `git log -i --grep="($did)"`（大小写不敏感，两种提交风格都命中）
- 信号4: `f.strip('`')` 后再 cat-file（无反引号表为 no-op）

## 无削弱证据（fail-closed 保持）

- tests/control-tower/verify-parallel-ci.test.sh 14/14（T7 audited / T8 审计报告 /
  T8b 大写提交信号3 / T8c 无反引号信号4 / T9 无任何关闭信号仍 block）
- tests/control-tower/verify-parallel.test.sh 5/5（含 T4 活跃×活跃重叠仍 block）
- 实测: 修复前 D599×D598 误报 block；修复后 D598 获豁免、rc=0

## 影响

串行复用误判是高频地雷（diagnosis.ts 被 D598/D599 等多卡共写），本修复使 D555 豁免
对仓库真实提交惯例（小写 scope）与真实写集表写法（反引号）生效；不放宽任何
fail-closed 分支（无信号仍 block）。
