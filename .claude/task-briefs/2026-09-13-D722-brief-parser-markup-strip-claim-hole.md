# Task Brief: D722 brief-parser-markup-strip-claim-hole

> 生成: 2026-09-13 | 任务: D722 | 认领: 主 CTO（synova-cto）
> 参考: ctrl-tower-change skill（模式 1/6）+ 铁律 11（静默降级禁止）
> 触发: D721 提交被 staging-guard 误判「并行劫持」→ 追到 brief 写集认领恒为空

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔认领解析修复（非五层）。链路：brief 的 Q2 写集 → parse_q2 提取路径 → match_path 与实际文件比对 →
决定「该 brief 是否认领此文件」。这条链喂三个门禁：pre-commit 的 D328 归属校验、staging_guard 的
认领制硬校验、resolve-commit-brief 的 brief 解析。
### b) 文件审计（读代码 + 探针实测）
- scripts/control-tower/brief_parser.py:166-168 match_path：以 `(^|/)pat$` 锚定比对，pattern 原样使用，未剥 markdown 包裹符
- scripts/control-tower/brief_parser.py:80-88 parse_q2：只剥动词前缀、括号描述、行号后缀，**不剥反引号/加粗**
- 探针实测：2026-09-13-D720 那份 brief 的 Q2 include 首项带反引号（包裹整条路径）→ 与真实路径比对恒不命中
- 调用方实测：staging_guard.py（认领制硬校验）、resolve-commit-brief.sh:125（主路径）、commit-msg-check.sh
### c) 决策
修 match_path 一处（剥壳后匹配），三个消费者同时受益；不改 parse_q2 返回值形态（避免影响其既有断言与打印）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- ctrl-tower-change 模式 1：门禁三态；模式 6：改完必须过「语法 → 专项测试 → 门禁自过」验收链
- 铁律 11：认领恒为空 = **静默降级**（门禁看着在跑，实际判定退化）→ 必须修根因，而不是让它继续 fail-open
- 铁律 47 同构：门禁「在跑」不等于「在判定」——必须由可复现输入证明命中/不命中
- 历史教训：D707 已收敛过一次「brief 双解析器」；D521/不变量3 修过 include/exclude 剥壳不对称 —— 本单是同族「提取端不剥壳 → 比对端永不命中」
### 参考：ctrl-tower-change + 铁律 11/47 + D707/D521 同族教训 → 在比对端统一剥 markdown 包裹符，并补端到端断言

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/control-tower/brief_parser.py — match_path 两侧先剥 markdown 包裹符（反引号/加粗/引号/方括号）与空白；剥壳后 pattern 为空 → False（绝不退化为匹配一切）
- tests/control-tower/brief-parser-markup.test.sh — 新增密封测试（16 断言：正常/回归/边界/端到端/降级/接线）
- .github/workflows/ci.yml — 本测试入控制塔测试白名单（防机制建成未接线）
- docs/synova/coordination/board-backlog.json — 登记 PLAN-brief-parser-inline-fallback-divergence、PLAN-stale-brief-steals-claim
- memory/notes/implemented/2026-09-13-brief-parser-markup-claim-hole.md — 决策沉淀（铁律 49）
- .claude/task-briefs/2026-09-13-D722-brief-parser-markup-strip-claim-hole.md、task-state/D722.json — 本单
不做什么：
- 不改 scripts/audit/（审计红线）
- 不改 parse_q2 返回的路径字符串形态（只改比对端，避免影响既有断言与打印）
- 不改 resolve-commit-brief.sh 的内联回退解析器（分叉风险已登记为 backlog 条目，单独立项）
- 不改 staging_guard.py 的判定阈值/阻断语义（本单只让认领恢复真实命中）
- 不追溯改写已发布的 D715-D718 brief（返工成本大于收益；parser 修好后它们自动恢复认领）

## Q3: 验收 — 入口 → 交互 → 结果
入口：brief 的 Q2 写集（含反引号写法）→ 任一依赖认领的门禁（pre-commit D328 / staging_guard / resolver）
处理：parse_q2 提取路径 → match_path 剥壳后比对
结果：反引号写法的 brief 恢复正常认领；staging-guard 不再因「认领为空」回退到陈旧 brief 而误拦

## 架构层: 基础设施（控制塔认领解析，非五层）
变更面限 brief_parser.py 的 match_path + 新增测试 + ci.yml 白名单 + 登记 + Note

## Done 标准:
- [ ] 新增测试全绿：bash tests/control-tower/brief-parser-markup.test.sh → 16 通过 0 失败
- [ ] 反向验证必红：还原 match_path 旧实现后重跑同一测试 → 有失败（实测 4 失败，已记录）
- [ ] 既有测试无回归：brief-parser-strip / alloc-task-id / merge_writeset_gate 三个测试 PASS（已实测）
- [ ] 接线在位：grep -c brief-parser-markup.test.sh .github/workflows/ci.yml → ≥1
- [ ] 登记在案：board-backlog 含 PLAN-brief-parser-inline-fallback-divergence 与 PLAN-stale-brief-steals-claim
