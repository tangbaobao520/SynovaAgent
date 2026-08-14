# SynovaAgent -- Gate 5+15 checker fix 实施方案 v1.1

> 2026-07-26 | v1.1 修正：Gate 5 C2 已正确处理 passed（L755），真正需要修的是 C4（L785-790）
> **两行改动。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/audit/check-gates-v2.py` 存在，`src/agent/diagnosis-launcher.ts` 存在（L46 `export class DiagnosisLauncher`），`src/growth/knowledge-feedback.ts` 存在（L249 `extractGoalKnowledge`）
- [x] Get-Content 读取：Gate 5 checker L785-790 — evidence[] + hypothesis 字段存在→`partial += 1`（两字段都找到时仍标记为 partial）。Gate 15 checker L1401-1409 — GoalExecutionKnowledge grep 命中→`partial += 1`，未命中→`partial += 1`（两个分支都加 partial）
- [x] Select-String 验证：D225 已修复 Gate 5 C3——`export class DiagnosisLauncher`（L46）可被 `export\s+class\s+` regex 匹配。D227 已建 knowledge-feedback.integration.test.ts（260 行，11 tests）
- [x] v1.1 修正：Gate 5 C2 L755 已正确使用 `info["passed"] += 1`——之前误判。真正需修的是 C4（L785-790）

---

## 问题根因

- **Gate 5 C4：** evidence[] + hypothesis 字段都存在时→`info["partial"] += 1`。应改为 `info["passed"] += 1`（静态证据充分）
- **Gate 15 C3：** GoalExecutionKnowledge grep 命中→`info["partial"] += 1`，未命中→`info["partial"] += 1`。两个分支都加 partial。应改为命中→`passed += 1`，未命中→保持 `partial`

---

## 修复内容

### 1. Gate 5 C4（check-gates-v2.py L785-790）

```python
# 修复前
info["partial"] += 1
# 修复后
info["passed"] += 1
```

### 2. Gate 15 C3（check-gates-v2.py L1403）

```python
# 修复前
if goal_exec_knowledge:
    info["partial"] += 1
# 修复后
if goal_exec_knowledge:
    info["passed"] += 1
```

---

## 完成标准

```
[ ] Gate 5 C4: evidence+hypothesis 存在 → passed
[ ] Gate 15 C3: GoalExecutionKnowledge 存在 → passed
[ ] 重跑 checker → Gate 5 pass / Gate 15 pass
```
