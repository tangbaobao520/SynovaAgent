# SynovaAgent -- Gate 8+9 checker fix 实施方案 v1.0

> 2026-07-26 | Gate 8 C4 两分支都加 partial + Gate 9 C3 两分支都加 partial
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/audit/check-gates-v2.py` 存在，`src/growth/goal-store.ts` 存在（D71 createGoal），`src/growth/goal-sentinel.ts` 存在（D73 三因子偏离模型）
- [x] Get-Content 读取：Gate 8 L1003-1008 — C4 `goal_id_fn` 匹配→`partial += 1`，未匹配→`partial += 1`（两个分支都加 partial）。Gate 9 L1063-1068 — C3 `P0.*告警` 找到→`partial += 1`，未找到→`partial += 1`（同样两个分支都加 partial）
- [x] Select-String 验证：goal-store.ts L16 — `export function createGoal(...)` 含 `Promise<string>` 返回类型，gate-sentinel.ts 含 `P0` 告警逻辑
- [x] 引用 — Gate 8 当前 PARTIAL（C1-C3 PASS 但 C4 永远 partial），Gate 9 当前 PARTIAL

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 门禁检查器修复。修复 Gate 8 C4 和 Gate 9 C3 的 `partial` 逻辑反转——与已修复的 Gate 1/2/4/5/15 同模式。

### Q1：调研
- Gate 8 C4：`goal_id_fn` 匹配 createGoal 返回类型时误加 `partial` 而非 `passed`
- Gate 9 C3：`P0.*告警` 匹配 goal-sentinel.ts 中告警逻辑时误加 `partial` 而非 `passed`
- 两组都是一旦匹配条件成立→加 passed；未匹配→保持 partial

### Q2：范围
- 最小：check-gates-v2.py 2 处逻辑修复（L1004 + L1065）
- 不做：不修改 goal-store.ts、goal-sentinel.ts

### Q3：验收
- 重跑 checker → Gate 8 pass（C1-C4 全部 passed）、Gate 9 pass（C1-C3 全部 passed）

### Q4：契约与测试
- @input：checker 静态扫描代码库
- @output：gate-status.json Gate 8/9 pass
- @degraded：无

---

## 修复内容

### 1. Gate 8 C4（check-gates-v2.py L1004）

```python
# 修复前（两分支都 partial）
if goal_id_fn: info["partial"] += 1
else:          info["partial"] += 1

# 修复后
if goal_id_fn: info["passed"] += 1
else:          info["partial"] += 1
```

### 2. Gate 9 C3（check-gates-v2.py L1065）

```python
# 修复前（两分支都 partial）
if p0_alert: info["partial"] += 1
else:        info["partial"] += 1

# 修复后
if p0_alert: info["passed"] += 1
else:        info["partial"] += 1
```

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- Gate 8 C4：goal-store.ts 含 `Promise<string>` → passed
- Gate 8 C4：文件不存在/无返回类型 → partial
- Gate 9 C3：goal-sentinel.ts 含 `P0.*告警` → passed
- 3 个测试

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| check-gates-v2.py Gate 8/9 | 人工/cli 运行 | `python scripts/audit/check-gates-v2.py` |

---

## 完成标准

```
[ ] Gate 8 C4: goal_id_fn 存在→passed
[ ] Gate 9 C3: P0 告警逻辑存在→passed
[ ] 重跑 checker → Gate 8 pass / Gate 9 pass
```
