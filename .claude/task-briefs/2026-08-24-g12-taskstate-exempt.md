# Task Brief: G12 task-state 豁免（创始人授权越界补丁）

> 生成: 2026-08-24 | 任务: G12FIX | 认领: Synova-Win | 来源: 创始人授权（G12 属 DSH 地盘，DSH 预审 PR #142）
> 参考: D366 docs/ 豁免先例; D382 task-state 状态机; V4.9.1 D513 批次

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
task-state/*.json|*.md 是任务登记元数据（D382），非代码实现。dev-doc 提交 spec 时无"实现 brief"，混合提交（dev doc + task-state）走全量 13 组被 G12「不在 Q2 范围」误拦（2026-08-24 PR #139 首跑 CI 红实测）。修法：G12 skip_re 增加 task-state/.*\.(json|md)$ 豁免，与 is_doc_only 的 DOC_PREFIX_RE（pre-commit-check.sh L175 同正则）对齐；仅豁免 json/md，task-state/ 下 .ts 仍被检查。
### b) 文件审计
- scripts/pre-commit-check.sh L1051 — G12 skip_re（task-state 豁免加这里）
- .codex/control-tower/VERSION.md — V4.9.2 bump（门禁行为变化必须 bump）
- tests/control-tower/g12-taskstate-exempt.test.sh — 新建配对测试（U7/CT-40）

## Q1: 调研
D366 docs/ 豁免先例：登记元数据目录豁免 brief 认领，不削弱 G12 对代码文件的保护。D382：task-state 由 dev-doc/编码/K3 各角色按阶段更新，无单一 brief。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/pre-commit-check.sh — G12 skip_re 增加 task-state/.*\.(json|md)$（仅豁免 json/md，.ts 不豁免）
- .codex/control-tower/VERSION.md — V4.9.2（PATCH）+ 变更记录
- tests/control-tower/g12-taskstate-exempt.test.sh — 新建（T1-T5：接线 + json/md 豁免 + .ts 不豁免 + 代码保护不削弱 + docs 先例保持）
不做什么：
- 不改 scripts/audit/（K3 红线）
- 不碰 src/tools/org-expert-tools.ts（D482 实现文件）
- 不碰 tests/middleware/auth.integration.test.ts（D481 实现文件）
- 不碰 tests/tools/org-expert-tools.test.ts（D482 实现文件）

## Q3: 验收 — 入口 → 交互 → 结果
入口：混合提交（docs + task-state）走 pre-commit 13 组
处理：task-state/*.json|*.md 不再报「不在 Q2 范围」；task-state/evil.ts 仍报
结果：g12-taskstate-exempt.test.sh 7/7 绿 + doc-commit-exempt 回归 18/18 + CI 全绿

## 架构层:
scripts（控制塔门禁）

## Done 标准
- [ ] bash tests/control-tower/g12-taskstate-exempt.test.sh 全绿
- [ ] bash tests/control-tower/doc-commit-exempt.test.sh 全绿
- [ ] CI TypeScript + Lint + Iron Laws 绿（G12 不再拦 scripts/pre-commit-check.sh）
