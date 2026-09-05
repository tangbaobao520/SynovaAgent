# Task Brief: D579 FIX-D572-k3verdict-stale机制

> 生成: 2026-09-05 | 任务: D579 | 认领: DSH 编码线（CTO 派单 2026-09-05，编码 session 接单 impl 2026-09-06）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）；spec 契约: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D579-k3-verdict-stale-20260905.md（gatekeeper 6/6 ALL PASS）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
产品线进度计算治理脚本（scripts/product-lines）。D572 K3 FAIL 的 P1-1：k3 类证据对 stale/TTL 永久免疫（D556 在证据日期后改 electron-renderer 452+193 行，线1 1-2/1-4/1-6 证据未失效）；P1-3 机制侧：批次审计报告（D501-D550 型文件名）派生不可见中间 D# → D517-519 verdict 滞留。D576（CT-53 兑换诚实化）已 close，本单为同域续作 FIX。
### b) 文件审计
scripts/product-lines/calc-progress.py——stale 机制已存在：`git_touched_after` L106、`status_for_point` L130、`EVIDENCE_TTL_DAYS=14` L67、SIX_STATES 含 stale L69、失效检查生效点 L166；**缺口 = k3 分支 L147-149 在 L166 之前 return verified，绕过失效检查**。tests/control-tower/redeem-task-redeem.test.sh（D576 回归基线 5/5）。
### c) 决策
复用既有 stale 机制语义（不新造一套），把 k3 分支纳入失效检查；批次报告可见性二选一（范围解析 vs task-state 显式 audit_report 字段）在 spec 必答裁决。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
引用铁律 47（契约优先——新判定路径先 JSDoc 输入/输出/降级）/48（测试三路径非空壳）/35（自动化优先）；memory 教训：D572「兑换不读 verdict 细则」→ 设计先定义 verdict 语义表；D576（YamlSubsetError——mini yaml 字段名 acceptance_points 首踩即修）。
参考：Anthropic 工程基线（证据时效性 = 状态机的 hygiene，过期证据自动降级而非人工记忆）+ 第一性原理——verified 的半衰期等于其绑定模块的变更频率；结论 = 复用 git_touched_after 既有语义，k3 与 machine 同一失效规则。

## Q2: 范围 — 正确的最简方案
（按 spec §5.1 写集核对更新 2026-09-06；B 项写集扩围 scripts/control-tower/gen-cto-health.py 已获 CTO 批准）
做什么：
- scripts/product-lines/calc-progress.py — A 项: 新契约函数 freshness_gate（spec §5.2 docstring 落地）+ k3_only/通用两个 k3→verified 出口接入失效门，rejected 短路保持在前
- scripts/control-tower/gen-cto-health.py — B 项: 新纯函数 resolve_audit_report（task-state audit.report 显式字段优先过 _committed D412 口径 + 文件名 glob 兜底同样过 _committed）+ 审计解析接线替换
- tests/control-tower/calc-k3-stale.test.py — 新建 A1-A9 契约测试（mini yaml + 假 git 注入，独立文件不与既有套件耦合）
- tests/control-tower/gen-cto-health-batch-report.test.py — 新建 B1-B5 单测（tmp 真实 git 仓夹具，不依赖真实仓库数据）
- tests/control-tower/product-lines.test.py — 仅两处 enshrined 夹具相对日期化（test_six_states/test_hundred_percent_gate）
- VERSION.md — V4.9.0 → V4.9.1（CT-42 bump 纪律）
- task-state/D579.json — 仅回填 impl 段（D382 状态机; spec 段不改写）
- memory/notes/proposed/2026-09-06-d579-k3-stale-wiring-ct55-ct58.md — 四态 Note（铁律 49, proposed 态入库）
- docs/synova/audit-reports/D579-k3-verdict-stale-evidence-20260906/calc-diff.md — 真数据对账逐点对照（含合并后自效应披露）
- docs/synova/audit-reports/D579-k3-verdict-stale-evidence-20260906/test-output.md — red/green 两轮测试输出
- .claude/task-briefs/2026-09-05-D579-FIX-D572-k3verdict-stale机制.md — 本文件（Q2 范围核对更新）
不做什么 (含文件路径):
- 不改 scripts/audit/audit-rules.sh (K3 红线: scripts/audit/ 全目录禁碰)
- 不改 docs/synova/product-lines/product-lines.yaml (线集/验收点维护权归创始人; 线 24 security/ 死路径与 CT-59 另立任务)
- 不改 scripts/product-lines/redeem-progress.py (spec 必答 1 判定无需改: audit.report 已是权威)
- 不改 src/server.ts (src/ 全目录禁碰——派单不碰清单)
- 不改 electron-renderer/package.json (electron-renderer/ 禁碰——派单不碰清单)
- 不改 scripts/pre-commit-check.sh (pre-commit 门禁脚本禁碰)
- 不改 task-state/D517.json (CT-58: 禁手工改 D517/518/519 派生字段, git diff 零触碰可验)
- 不改 task-state/D518.json (同上 CT-58)
- 不改 task-state/D519.json (同上 CT-58)
- 不改 docs/synova/product-lines/product-progress.json (D576 先例: 仪表盘产物由 CI/refresh-all 再生, 变化以 evidence diff 留证)
- 不改 docs/synova/product-lines/product-progress-page.html (同上 D576 先例)
- 不改 docs/synova/CTO-HEALTH.md (同上 D576 先例: 生成器产物不入本 PR, 实跑 grep 留证)

## Q3: 验收 — 入口 → 交互 → 结果
入口：bash scripts/product-lines/refresh-all.sh（A4 环节）+ python3 scripts/control-tower/gen-cto-health.py（pre-audit-summary U3 门禁）
处理：k3 pass 裁决 → freshness_gate（TTL 14 天 + git_touched_after 线级 modules）；审计状态解析 → task-state audit.report 显式字段优先
结果：真数据 8 点转 stale / 19-2/22-1 保持 verified / 线 1 逐点零变化（diff 落 evidence）；CTO-HEALTH.md 中 D517/518/519 audit 列 = CONDITIONAL_PASS

## 架构层:
scripts（产品线治理脚本 + 控制塔仪表盘，非 src 运行时；治理脚本层/自举层，不属于业务五层 L1-L5；改动伴随 VERSION bump）

## Done 标准
- [ ] verify: python3 tests/control-tower/calc-k3-stale.test.py → A1-A9 全绿
- [ ] verify: python3 tests/control-tower/gen-cto-health-batch-report.test.py → B1-B5 全绿
- [ ] verify: python3 tests/control-tower/product-lines.test.py → 除 3 条既有失败外全绿（range_expansion/capital_line_zero/page_no_jargon 不变）
- [ ] verify: bash tests/control-tower/redeem-task-redeem.test.sh → 5/5（D576 回归零破坏）
- [ ] verify: bash tests/control-tower/alloc-task-id.test.sh → 13/13
- [ ] verify: python3 scripts/control-tower/gen-cto-health.py --strict → exit 0
- [ ] verify: SYNO_CI=1 SYNO_DIFF_BASE=origin/main bash scripts/pre-commit-check.sh → exit 0
