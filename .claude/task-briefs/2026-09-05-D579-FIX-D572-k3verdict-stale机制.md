# Task Brief: D579 FIX-D572-k3verdict-stale机制

> 生成: 2026-09-05 | 任务: D579 | 认领: DSH 编码线（CTO 派单，执行方接单后改认领）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）

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
做什么：
- scripts/product-lines/calc-progress.py — k3 分支纳入失效检查（L147-149 接入 L166 同款 stale 语义）；批次报告派生可见性（spec 必答选方案）
- tests/control-tower/ — 新增测试（三路径 + 真实用例对账：线1 1-2/1-4/1-6 stale 命中、1-1/1-3/1-5/1-7 不误伤）
- task-state/D579.json、VERSION.md bump、memory/notes/ 四态 Note（铁律 49）
- docs/synova/coordination/审计发现台账-DSH-CTO.md — CT-55~59 登记（随本 brief 同批提交）
- task-state/D488.json — title 归属对账标注（Stage 5b 修复已随 D567 落地，PR #259 关闭）
不做什么：
- 不改 scripts/audit/（K3 红线）
- 不改 docs/synova/product-lines/product-lines.yaml（进度语义不动，只动计算器）
- 不改 scripts/product-lines/redeem-progress.py（除非 spec 必答 1 判定必须，需在 spec 记录理由）
- 不改 src/、electron-renderer/、scripts/pre-commit-check.sh

## Q3: 验收 — 入口 → 交互 → 结果
入口：对 origin/main 真数据跑 calc-progress（refresh-all 同款调用）
处理：k3 stale 判定 + 批次报告派生修正；测试三路径 + 真实用例对账
结果：calc 输出 diff 显示 1-2/1-4/1-6 stale 标注、Mac 半边四点不受影响；D576 回归 5/5 + alloc 13/13 绿；输出 evidence git 跟踪路径落盘

## 架构层:
scripts（产品线治理脚本，非 src 运行时；改动伴随 VERSION bump）

## Done 标准
- [ ] verify: bash tests/control-tower/<新增测试> → 三路径全绿含真实用例对账断言（1-2/1-4/1-6 stale 命中）
- [ ] verify: bash tests/control-tower/redeem-task-redeem.test.sh → 5/5（D576 回归零破坏）
- [ ] verify: python3 scripts/product-lines/calc-progress.py --help 或对真数据运行 → 退出码 0 且输出含 stale 标注 diff（evidence 落 git 跟踪路径）
