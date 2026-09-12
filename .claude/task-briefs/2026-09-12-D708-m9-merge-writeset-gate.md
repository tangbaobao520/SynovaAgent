#CRITERIA: A

# Task Brief: D708 m9-merge-writeset-gate

> 生成: 2026-09-12 | 任务: D708 | 认领: 🧭 并行 CTO session（synova-cto 预设）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 派单: docs/synova/coordination/派单-并行CTO-控制塔收口批次-20260911.md §D708（P0）
> 设计稿: docs/synova/coordination/D708-合并级写集对账gate-设计稿-20260912.md（**待主 CTO 复核**）

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔域（非五层）。现有门禁的两格盲区：pre-commit 只看**单提交暂存区**；
`verify-parallel.sh`（ci.yml L51-57）只做 **inter-PR**（本 PR × 已合 PR 写集）重叠。
缺的是 **intra-PR**：本 PR 变更集 × **本 PR 自己的声明**。本任务补这一格（M9）。

### b) 文件审计
- `.github/workflows/ci.yml` L51-57 —— 已有 PR 级 verify-parallel（**边界基准，不重复造**）
- `scripts/control-tower/verify-parallel.sh` / `devdoc_writeset.py` —— 已有写集表解析（**复用**）
- `scripts/control-tower/brief_parser.py --q2-include` —— 已有 brief Q2 解析（**复用**）
- M2 族三次实证: PR #449（夹带 D603 共 51 文件）/ #442（夹带 6 文件）/ D593-FIX（声称提交实未提交）
- 验收基线：无同名脚本（`ls scripts/control-tower/ | grep merge` 零命中）→ 新建

### c) 决策
新建 `merge_writeset_gate.py`（复用既有两个解析器，不新写 parser）；触发点选**合并前 PR job**
（合并后只能事后发现，与「进不了 main」矛盾）；多源声明取**并集**；无声明且含源码变更 **fail-closed**。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- memory: M2（声称 vs 事实）M9 新格 / M3（机制建成未接线，D664 刚踩）/ M4（证据链断裂）
- 本仓先例: `verify-parallel.sh` 的三态退出码 + 声明源解析；D328 三态 exit 0/1/2 惯例
- 参考：第一性原理（声明与事实必须可比对）+ DSH `dsh-hook-protocol` 的 matcher 诊断范式
  → 结论：复用解析器 + 合并前阻断 + fail-closed + 逐文件点名。

## Q2: 范围 — 正确的最简方案
做什么:
- scripts/control-tower/merge_writeset_gate.py — 新建 gate（含 `--json`）
- tests/control-tower/merge-writeset-gate.test.sh — 新建密封测试（21 断言）
- .github/workflows/ci.yml — 在 verify-parallel 步骤后新增 1 个 step（+ 密封清单末尾 1 行）
- docs/synova/coordination/D708-合并级写集对账gate-设计稿-20260912.md — 设计稿（送主 CTO 复核）
- memory/notes/implemented/2026-09-12-D708-merge-writeset-gate.md — 四态 Note（铁律 49）
- .claude/task-briefs/2026-09-12-D708-m9-merge-writeset-gate.md — 本 brief
不做什么:
- 不重复造 verify-parallel 的 inter-PR 能力（本 gate 只做 intra-PR，边界见设计稿 §二）
- 不做「声明多、实际少」的反向校验（D593-FIX 型）——本 gate 能力边界已显式声明，另行登记
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 src/server.ts（产品代码属编码/Win 线）
- 不改 scripts/ci/branch-coverage-gate.sh（Win 线 D704 在写）
- 不改 vitest.config.ts（Win 线 D704 在写）
- 不改 scripts/pre-commit-check.sh（D664/D707 写集，避免 PR 交叉）
- 不设 SYNO_* 逃生舱（逃生舱本身会成绕过通道）

## Q3: 验收 — 入口 → 交互 → 结果
入口：PR CI（`quality` job 新增 step `Merge write-set reconciliation (D708)`）
处理：merge-base..HEAD 变更集 × 声明写集（S1 task-state / S2 dev doc / S3 brief 并集）
结果：夹带 → job 红 + 逐文件点名 + 修复指引；无夹带 → 绿；无法判定 → fail-closed

## 架构层: scripts（控制塔域，非 L1-L5 产品架构）

## Done 标准
- [x] verify: bash tests/control-tower/merge-writeset-gate.test.sh → exit 0（21 断言）
- [x] verify: 人为夹带 PR → CI job 红并点名该文件；撤回 → 绿（贴 CI job 级结论）
- [x] verify: gate 无声明 + 源码变更 → exit 2（fail-closed，非放行）
- [x] verify: 三个历史实证（#449/#442/D593-FIX）在设计稿逐条说明能否抓到
- [x] verify: 设计稿已送主 CTO 复核（复核通过后方可合并）
