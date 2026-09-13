# Task Brief: D712 desktop-line1-reverification

> 生成: 2026-09-13 | 任务: D712 | 认领: 主 CTO（派单与登记；实测由 Mac/Win/K3 分别执行）
> 参考: D333 决策四步；cto-handover skill §〇b/§〇c

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
产品线样板任务（线 1 桌面端）。创始人 2026-09-12 裁定 D-2「桌面端先行」：线 1 共 8 个验收点，
现 7 点 stale（做过、证据过期）+ 1 点待 K3 → 不写新功能即可到 100%，作为"第一条 100% 线"样板。
本批次只做**派单与登记**；实测由 Mac 侧（1-1/1-3/1-4/1-5/1-6/1-7）、Win 侧（1-2）、K3（1-8）分别执行。
### b) 文件审计
- `product-lines.yaml` 线 1 = 8 点（实测），modules = `electron/`、`electron-renderer/`、`scripts/deploy/`、`scripts/setup/`、`scripts/install.sh`、`scripts/install.ps1`
- 证据目录 `docs/synova/product-lines/evidence/` 已有 `stale-reverify-D589-line1.json` 等历史证据（未闭环）
- 上游在途：`#464`（D652 evidence 入库铁律 + D653 合入即绿门禁）——证据入库纪律，本批建议先合
- 归属：桌面端 = 施工图 §3 🟢 死守（品牌表层），无 DSH 借鉴
### c) 决策
出派单文档 + 登记任务号；不写代码、不改验证点定义（重验优先不改代码，改代码会触发整线证据再失效）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- memory 教训：D589 曾产 stale-reverify 证据但未闭环 → 重验必须落**机器可读证据**（record_type/date/verdicts）
  否则进度照旧不计分；M3 家族（机制建成未接线）提示"证据写了没进管线"同型风险。
- 参考：第一性原理（"实测过"的唯一可信凭据＝可重跑的物理事实，非代码存在）+ 证据新鲜度机制（A1）
  → 结论：重验 + evidence-writer 落盘 + refresh 重算 + K3 独立复核。
### 参考：第一性原理 + 证据链机制实证 → 重验优先、机器可读证据、K3 复核 1-8

## Q2: 范围 — 正确的最简方案
做什么：
- docs/synova/coordination/派单-桌面端线1重验批-D712-20260912.md — 派单文档（8 点/分工/时序/验收/写集/创始人复制段）
- task-state/D712.json — 任务登记（status=claimed，待执行方推进）
- .claude/task-briefs/2026-09-13-D712-desktop-line1-reverification.md — 本 brief（派单登记视角；执行方开工时改写为实测视角）
- docs/synova/coordination/派单模板.md — 固化「路由判定」表（本次创始人提问暴露歧义：默认给 dev-doc，但控制塔类/验证类直派执行方；含多执行方发送规则与代码归属≠机器归属）
不做什么：
- 不改 electron/main.ts（重验优先不改代码；改则整线证据再失效）
- 不改 scripts/product-lines/calc-progress.py（进度算法非本任务范围）
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 docs/synova/product-lines/product-lines.yaml（验收点定义当前有效，不因重验而改）

## Q3: 验收 — 入口 → 交互 → 结果
入口：创始人把派单说明转给 Mac / Win / K3 三方
处理：三方按点实测 → evidence-writer 落盘 → refresh-all 重算
结果：线 1 verified 8/8（1-8 由 K3 置位）、stale 清零 → 第一条 100% 线成立

## 架构层: 基础设施（派单与任务登记，非五层）
本批次为派单与登记，不触产品代码；实测阶段按线 1 modules（🟢 死守品牌表层）执行

## Done 标准:
- [ ] 派单文档含五节：`for s in 写前核实 "DSH 借鉴核查" 验收 写集约束 派单说明; do grep -q "$s" docs/synova/coordination/派单-桌面端线1重验批-D712-20260912.md || echo "MISSING: $s"; done` → 零输出
- [ ] 8 个验收点全部出现：`for i in 1-1 1-2 1-3 1-4 1-5 1-6 1-7 1-8; do grep -q "$i" docs/synova/coordination/派单-桌面端线1重验批-D712-20260912.md || echo "缺 $i"; done` → 零输出
- [ ] python3 -c "import json;json.load(open('task-state/D712.json'));print('ok')" → 输出 ok
