# 把 CTO 接到文档契约上（预设 / skill / 入口层）

状态: implemented
日期: 2026-09-27

## 一句话

契约立住了，但执行者（CTO）没接线 —— 本 note 记录接线动作。

## 问题

实测：`presets/synova-cto/*`（preset 2 行 / persona 64 行 / README 6 行）提契约 **0 次**；
`cto-handover` skill（CTO 开工必读）提契约 **0 次**；`AGENTS.md` / `CLAUDE.md` 提契约 **0 次**。
⇒ 这是「资产清单 ≠ 能力清单」的同一类病：**契约是资产，没接上执行者**。

## 决定

① `cto-handover`（.claude + .dsh 双份）新增「文档契约 · 我必须遵守的」节（七条，含"谁保证我遵守"三重）
② `presets/synova-cto/persona-block.yml` 新增 `document_contract` 块（must / must_not / enforced_by）
③ `AGENTS.md` / `CLAUDE.md` 入口层各加一行指向契约

## 考虑过的其他方案

只在契约里写「CTO 不得豁免」（现状）—— 否决：**那是承诺，不是机制**；
没有开工必读的载体，我每次开工不会自动想到它。

## 后果

- 契约的遵守有三道保证：门禁（机械）/ K3 抽审（外部独立）/ 开工必读载体（本节 + persona）
- 这同时是"如何保证 CTO 自己也遵守"的答案

## 取代

无。
