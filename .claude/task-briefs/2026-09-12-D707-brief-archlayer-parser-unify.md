#CRITERIA: A

# Task Brief: D707 brief-archlayer-parser-unify

> 生成: 2026-09-12 | 任务: D707 | 认领: 🧭 并行 CTO session（synova-cto 预设）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 派单: docs/synova/coordination/派单-并行CTO-控制塔收口批次-20260911.md §D707

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔域（非五层产品架构）。task brief 的「架构层」字段由**两处校验器**判定：
`scripts/pre-commit-check.sh` 组 6（awk 内联实现）与 `scripts/workflow/check-brief-parseable.sh`
（经 `scripts/control-tower/brief_parser.py`）。两者口径不一致 → 本地绿而 CI 红。
本任务把该字段收敛到**单一事实源**。

### b) 文件审计
- `scripts/pre-commit-check.sh` 组 6 架构层段（旧 L842-847）—— awk 第二实现（缺陷 A）
- `scripts/control-tower/brief_parser.py` L98-101 `parse_layer` — 正则 `\s*(.+)$`
  中 `\s` 吞换行 → 空值被当成下一标题（缺陷 B，假绿）
- `scripts/workflow/check-brief-parseable.sh` L73-76 — 消费 `parse_layer`（无独立实现）
- 存量实测: 629 份 brief 中 **232 份用内联写法**（37%）→ 组 6 全部误报「架构层: 未填写」
- 实证: D665 brief 内联写法 → PR #494 首轮 `TypeScript + Lint + Iron Laws` 红

### c) 决策
不新造解析器；**删除第二实现**，组 6 改调 `brief_parser.py --layer`（与
`pre-commit-check.sh:1234` 既有的 `brief_parser.py --q2-include/--q2-exclude` 用法一致）。
解析器侧修正 `parse_layer` 为精确规则。不保留 awk 回退（回退实现自身会漂移——实测全角冒号）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- memory 模式 M7（文档-实现漂移）同族：**同一语义两套实现 = 必然漂移**。
- 第一性原理：门禁判定必须是产物的函数——同一 brief 在所有执法点必须得到同一结论。
- 本仓先例：`check-brief-parseable.sh` 头注释自称「同源解析器（brief_parser.py）」，
  D313 M3 建它是为了同源；组 6 的 awk 恰好违背该设计。
- 参考：第一性原理（一个语义一个实现）+ 本仓既有同源约定 + D313 M3
  → 结论：收敛到 brief_parser.py，禁第二实现。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/control-tower/brief_parser.py — `parse_layer` 改精确规则 + 新增 `parse_field_value` / `_is_blank_or_placeholder`
- scripts/pre-commit-check.sh — 组 6 架构层段改调同源解析器（删 awk 第二实现）
- tests/control-tower/brief-parser-strip.test.sh — 扩展 D707 形状矩阵（①-④ 共 22 断言）
- memory/notes/implemented/2026-09-12-D707-brief-layer-single-parser.md — 四态 Note（铁律 49）
- .claude/task-briefs/2026-09-12-D707-brief-archlayer-parser-unify.md — 本 brief
不做什么：
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 src/server.ts（产品代码属编码/Win 线）
- 不改 scripts/ci/branch-coverage-gate.sh（Win 线 D704 在写）
- 不改 vitest.config.ts（Win 线 D704 在写）
- 不改 .github/workflows/ci.yml（回归测试已在密封清单，扩展既有文件即可）
- 不改 scripts/control-tower/synova-commit（D706 写集，避免 PR 交叉）
- 不改 .claude/task-briefs/2026-09-10-D660-task-board-activity-semantics.md
  （派单原建议「顺手改 1 行 brief」，经实测**不改**：内联写法 232 份，改 1 份属治标；
  根因是校验器口径，改解析器才是治本——取舍理由见决策 Note）

## Q3: 验收 — 入口 → 交互 → 结果
入口：`bash scripts/pre-commit-check.sh`（CI `TypeScript + Lint + Iron Laws` 同源）
处理：组 6 调 brief_parser.py --layer → 内联/body 两种写法等价 → 空值判未填写
结果：内联写法不再报「架构层: 未填写」；空值仍被拒；两校验器结论一致

## 架构层:
scripts（控制塔域，非 L1-L5 产品架构）


## Done 标准
- [x] verify: 内联写法 → 组 6「架构层: 未填写」计数 1→0（原版 vs 本分支对比）
- [x] verify: 空值负例 → 组 6 计数仍为 1（门禁未被改软）
- [x] verify: bash tests/control-tower/brief-parser-strip.test.sh → exit 0（30 断言）
- [x] verify: 反向验证——同测试跑 origin/main 原版 → 6 断言必红
- [x] verify: CI Control Tower Gate Tests（ubuntu/windows）conclusion=success
