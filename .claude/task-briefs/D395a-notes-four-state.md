# Task Brief: D395-a: Agent Notes 四态（派活登记）

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D395) | 认领: 📋 synova-devdoc（spec）
> 来源: K3 战略咨询 §4.2（拆分后 a 现在做，1 天）——以咨询为准

## 任务定义（D395-a，开发组织版）
把 Synova 现有 `memory/`（20 个非结构化教训文件）+ LOOP-ENGINEERING-CHANGELOG 决策传统，改造为四态结构：`memory/notes/{proposed,implemented,archived,rejected}/YYYY-MM-DD-<主题>.md`。
每条 Note 头部四字段：状态/日期/决策/理由；状态迁移 = `git mv` 换目录。
门禁：非平凡 task brief 的 Q1 增加「相关 Note 引用」字段（grep 物理检查）。

## 神（K3 定义）
**开发组织的决策可沉淀、可检索、不腐化**——强化 M7 防线，命中已有 M 类，不新增机制类。

## 形似神不似预警
> 目录建了、20 个旧文件归档了，但新决策不写 Note → 三个月后又是非结构化。防法：pre-commit 对「改 scripts/control-tower/ 或 src/orchestrator/ 的 commit」要求 commit message 引用 Note 路径（物理门禁，不靠自觉）

## 参考材料（main 上可自取）
- K3 咨询: docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md §4.2
- 现状: memory/（20 个教训文件）+ LOOP-ENGINEERING-CHANGELOG

## 产出物
- SYNOVA-IMPL-DSH-D395a-notes-four-state-20260816.md

## 验收锚点
- memory/notes/{四态} 目录结构存在 + 旧文件归档
- 非平凡 brief Q1 有 Note 引用字段（门禁可查）
- D395-b（产品版）**不做**——并入 D398（先看记忆长什么样）
