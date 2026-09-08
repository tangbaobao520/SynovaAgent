# Task Brief: D600 任务看板映射校准 + L1 跨层违规扫描

> 生成: 2026-09-08 | 任务: D600 | 认领: dsh-cto（🧭 synova-cto，创始人直接派单）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计 + 决策

### a) 项目拼图
Synova = 组织数字孪生诊断系统。本任务在控制体系层（CTO 职责），不碰产品代码 src/ L1-L5。两个子任务：
① 任务看板映射校准——DSH 任务看板（dsh/plugins/task-board-adapter）的 running 列严重虚高（94 张 vs 权威活跃 ~13），映射口径需按创始人指示校准；
② L1 跨层违规扫描——L1 审计发现 14 处跨层违规（L1→L3 5 + L1→L4 6 + L1→L5 3），check-architecture.sh 四类形态漏网，需全量扫描输出报告。

### b) 文件审计
- dsh/plugins/task-board-adapter/lib/sync.js:27-33 DEFAULT_STATUS_MAPPING（spec_done→todo / claimed→running / impl_done→running / audited→done / failed→failed）——impl_done→running 是虚高主因（52 张）；closed/cancelled 未映射落入 todo 并告警
- dsh/plugins/task-board-adapter/lib/sync.js:225 mapWinTaskToBoardTask committed→running（25 张，同口径虚高）
- dsh/plugins/task-board-adapter/test/sync.test.js 37 例 + derive.test.sh 9 例全绿（改前基线）
- ~/.dsh/task-board/ledger-v2.json 实测 309 卡（running 93 = 87 D# + 6 L#）；task-state 实测 177 D# 文件（claimed 11 / spec_done 3 / impl_done 53 / audited 103 / closed 8 / failed 0 / cancelled 0）
- scripts/check-architecture.sh 待读（子任务②）
- L1 目录: src/routes/ src/tui/ src/mcp/（+桌面 electron/）；L3: src/l3/ src/sentinel/ src/expert-platform/ src/expert/；L4: src/l4/ src/evidence/；L5: src/store/ src/cron/

### c) 决策
① 映射校准创始人已定方向（running 仅 = claimed + spec_done），按 founder 指示执行：impl_done → todo（待审计队列，防假完成保留——2026-08-23 创始人"K3 审计才算 done"决策不推翻）；closed → done、cancelled → failed 补全映射消除未知告警。Win committed 同口径 → todo。决策参考：创始人 2026-09-08 派单原文 + D502 历史口径，非技术取舍，直接执行。
② 扫描只读：grep 静态 + 动态 import，输出 file:line 清单 + 修复路径建议，不改 src/、不改 scripts/audit/（K3 红线）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 39 五层架构边界（L1 禁触 L3/L4/L5）；铁律 35 自动化优先（门禁漏网形态要登记并建议补门禁）
- M7 文档-实现漂移：README 映射表与代码必须同步改（本次 3 文件同步）
- D502 教训：多源上板后单源口径不一致（Mac impl_done / Win committed）→ 本次双处同口径校准
- cto-handover §十二：遗漏/漏洞主动登记台账；改控制塔走 ctrl-tower-change + windows-compat 技能
- 决策参考：创始人 2026-09-08 直接裁决（running = claimed + spec_done），非我自定——第一性原理印证：看板 running 的语义 = 正在活跃推进的工作，impl_done 处于"等 K3 审计"队列态，列 todo 保持 done 列可信（防假完成）

## Q2: 范围 — 正确的最简方案
做什么：
- dsh/plugins/task-board-adapter/lib/sync.js — DEFAULT_STATUS_MAPPING 七态校准 + impl_done 描述待审计说明 + mapWinTaskToBoardTask committed→todo
- dsh/plugins/task-board-adapter/test/sync.test.js — 测试断言同步新口径
- dsh/plugins/task-board-adapter/README.md — 映射表同步
- docs/synova/research/L1跨层违规扫描-20260908.md — 扫描报告（只读分析产出）
- task-state/D600.json + 本 brief + memory/notes/proposed/ 决策 note（铁律 49 沉淀）
不做什么：
- 不改 src/（产品代码归编码线，红线）
- 不改 scripts/audit/、不写审计标准（K3 红线，禁止自我审计）
- 不部署插件（重启 dsh web 会中断会话，待创始人点头）
- 不修 check-architecture.sh 本身（本任务只扫描+报告，门禁修补另案派单）
- 不修 task-state 数据问题（D559.json task_id=D558 注册怪态，另案登记）

## Q3: 验收 — 入口 → 交互 → 结果
入口：`node --test test/sync.test.js && bash test/derive.test.sh`（dsh/plugins/task-board-adapter/）
处理：测试断言七态映射 + Win committed→todo + impl_done 描述
结果：37 单测 + 9 集成全绿；扫描报告 file:line 清单 ≥14 处（L1→L3/L4/L5 分列）

## 架构层:
scripts（控制塔）+ dsh 插件（控制体系），不触 L1-L5 产品层

## Done 标准
- [ ] verify: `cd dsh/plugins/task-board-adapter && node --test test/sync.test.js` → 37/37 pass
- [ ] verify: `grep -n "impl_done" dsh/plugins/task-board-adapter/lib/sync.js | grep running` → 零命中
- [ ] verify: 扫描报告含全部 14 处 file:line（≥ 5 L1→L3 + 6 L1→L4 + 3 L1→L5）
