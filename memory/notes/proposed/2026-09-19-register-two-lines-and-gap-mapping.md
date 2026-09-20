---
状态: proposed
日期: 2026-09-19
决策: 执行创始人 2026-09-19 三项裁定——① 两条新线（27 测量与参数标定 / 28 多客户配置与租户分层）**登记进 product-lines.yaml**（`total_lines: 26 → 28`，各 5 个验收点，共 10 点进入待定区：36 → 46）；② 11 项 DSH 缺口**归线不新开**（登记表分离成 `docs/synova/product-lines/gap-line-mapping.yaml`）；③ **前提清单优先级高于线**（`preconditions.yaml` 加 `priority: above-lines` + 裁定来源）。
理由: 三项裁定直接影响"看板能不能与真实结构对齐"。执行中实测到一个**必须记录的技术约束**：看板派生器（`scripts/project/gen-project-board.py`）用的是**仓内自研 YAML 子集解析器**，不支持行内映射 `{...}`——我最初把缺口归线表写成行内映射，派生器直接 `degraded`（backlog_points=null）。改为**分离文件 + 块状风格**后恢复正常（degraded=False、backlog_points=46）。另：看板的线清单来自**冻结的 V1 验收标准**（不是 yaml），所以新线**登记了也不会立刻出现在看板上**，要进计分须走 V1 标准变更单（D838）。
---

## 落地件

- `docs/synova/product-lines/product-lines.yaml`：+线 27 / 28（各 5 点）+ `total_lines: 28`
- `docs/synova/product-lines/gap-line-mapping.yaml`（新建）：11 项缺口归线登记（含方式标注 ③/①/② 与依赖）
- `docs/synova/product-lines/preconditions.yaml`：`priority: above-lines` + 裁定来源
- `docs/synova/coordination/草案-新增两线-20260918.md`：状态更新为"创始人已确认并登记"
- 卡 `task-state/D838.json`：V1 标准变更单（草案）+ 11 点起草（交创始人确认）

## 相关 D#

- D838（变更单起草）；上游裁定：创始人 2026-09-19 三项
- 依据计划: v1.2@4e46603f
