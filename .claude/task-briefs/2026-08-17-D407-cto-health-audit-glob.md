# Task Brief: D407 — CTO-HEALTH 审计报告 glob 修复 + 仪表盘重建验收

> 2026-08-17 | CTO (DeepSeek Harness) | 控制塔维护

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
CTO 周报/验收链路：`task-state/D###.json` → `scripts/control-tower/gen-cto-health.py` → `docs/synova/CTO-HEALTH.md`（第③面仪表盘）。D393 定 status 派生自工件，audit 列派生自 `docs/synova/audit-reports/` 目录 glob。

### b) 文件审计
- `scripts/control-tower/gen-cto-health.py` L230-245: audit glob `*D{num}.md` 匹配不到后缀变体 `2026-08-17-D395a.md` → D395 audit 列误显 "—"；且 `*D394.md` 会误匹配 `2026-08-16-D394-D398-strategy-consult.md` 同前缀文件。
- 修复：精确 glob 优先，后缀 `[a-z]` 兜底。

### c) 决策
控制塔脚本变更 → 加载 ctrl-tower-change 技能；改完重跑生成 + 全量自检。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 门禁三态退出码（D328）、改门禁先过门禁（ctrl-tower-change 模式 6）。
- memory/ 历史：仪表盘未合并源第三次复发（K3 D394 P2-5）——数据源必须真，glob 必须精确。
- 参考：K3 D395a 报告文件名 `2026-08-17-D395a.md` 为既有命名事实，glob 需兼容。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/gen-cto-health.py
- task-state/D391.json
- task-state/D394.json
- task-state/D395.json
- task-state/D396.json
- task-state/D407.json
- .claude/bypass.log
- docs/synova/CTO-HEALTH.md
- docs/synova/coordination/审计发现台账-DSH-CTO.md
- .claude/task-briefs/2026-08-17-D407-cto-health-audit-glob.md

不做什么：
- 不提交他人产出（extensions/industries/saas-tech/thresholds.json、extensions/industries/test-write/thresholds.json、tests/output/expert-quality-cross-industry.json、docs/synova/product-lines/todos.yaml 为测试运行产物，归编码 session）
- 不碰 scripts/audit/（K3 专属）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：`python3 scripts/control-tower/gen-cto-health.py` + `bash scripts/product-lines/refresh-all.sh`
处理（中间步骤）：glob 修复 → D394.json 修复 → 报告合并 → 重跑生成
结果（最终展示）：CTO-HEALTH §五 任务表 D394/D395 显示 CONDITIONAL_PASS、D396 显示 PASS；audit-reports/ 含 D394/D396 报告；全部已入 main。

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] gen-cto-health.py 重跑成功（幂等指纹更新）
- [ ] CTO-HEALTH §五 audit 列 D394/D395=CONDITIONAL_PASS、D396=PASS
- [ ] D394.json 冲突标记已清、impl=a8a5857e、JSON 可解析
- [ ] D394/D396 审计报告已入 main（GitHub API 204/201）
- [ ] 26 线仪表盘 refresh-all.sh 全绿
