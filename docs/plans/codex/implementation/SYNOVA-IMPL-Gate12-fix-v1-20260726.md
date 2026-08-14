# SynovaAgent -- Gate 12 checker fix 实施方案 v1.0

> 2026-07-26 | 审计发现：Gate 12 C3 grep 不含 registerBuiltinLoops（D9 函数未被检测）
> **Gates 8/9/10 已修复（f63faee）——仅需 checker 重跑。Gate 12 需要新加一行 grep。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/audit/check-gates-v2.py` 存在，`src/loops/loop-scheduler.ts` 存在（D91+D9+D223）
- [x] Get-Content 读取：Gate 12 checker L3347-3355 — C3 grep `r"registerHeartbeatCheck"` 仅匹配 D223 的心跳注册，不匹配 D9 L133 的 `registerBuiltinLoops`。Gate 10 L1113 — `r"escalate_to_full_diagnosis|reDiagnosisCount"` 已修复（f63faee）✅。Gate 8 L1003 + Gate 9 L1060 — `info["passed"]` 已修复（f63faee）✅
- [x] Select-String 验证：`registerBuiltinLoops` 在 loop-scheduler.ts L133 存在（D9 添加）✅。在 check-gates-v2.py Gate 12 C3 中不存在
- [x] 引用 — Gate 12 当前 PARTIAL。Gates 8/9/10 代码已修复——仅需 checker 重跑

---

## 问题根因

Gate 12 C3 的 grep 模式 `r"registerHeartbeatCheck"` 只检测 D223（停滞检测注册），不检测 D9（内置循环注册）。D9 在 loop-scheduler.ts L133 添加了 `registerBuiltinLoops()` 函数——checker 未扫描此函数。

Gates 8/9/10 的代码修复已完成（f63faee），checker 尚未重跑——重跑后所有这些门禁都应变为 PASS。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 门禁检查器修复——Gate 12 C3 grep 模式追加 `registerBuiltinLoops`。然后重跑 checker 捕获 Gates 8/9/10/12 的全部修复。

### Q1：调研
- D9 添加了 `registerBuiltinLoops()` 函数在 L133——在 CronScheduler 中注册 loop-4 和 loop-5
- D223 添加了 `registerHeartbeatCheck()` 函数在 L97——当前被 checker 的 C3 grep 检测到
- `registerHeartbeatCheck` 单独存在→`info["passed"] += 1`——但仅检测到一个函数。`registerBuiltinLoops` 也应被检测

### Q2：范围
- 最小：(A) Gate 12 C3 grep 模式添加 `registerBuiltinLoops` (B) 重跑 checker (C) 提交 gate-status.json
- 不做：不修改 loop-scheduler.ts

### Q3：验收
- 重跑 checker → Gate 12 C3 现在检测到两个 cron 注册函数→passed
- 重跑 checker → Gates 8/9/10 回归 PASS（f63faee 修复）
- 最终：Gates 8/9/10/12 全部 PASS——15PASS/2PARTIAL

### Q4：契约与测试
- @input：checker 静态扫描代码库
- @output：gate-status.json Gates 8/9/10/12 pass
- @degraded：无
- 测试：Gate 12 C3 grep 命中(1) + 最终门禁计数(1) = 2 个测试

---

## 修复内容

### 1. Gate 12 C3 — grep 模式追加 registerBuiltinLoops（check-gates-v2.py L3348）

```python
# 修复前
loop_has_d9 = self.grep(r"registerHeartbeatCheck", "src/loops/loop-scheduler.ts")

# 修复后
loop_has_d9 = self.grep(r"registerBuiltinLoops|registerHeartbeatCheck", "src/loops/loop-scheduler.ts")
```

### 2. 重跑 checker + 提交

```bash
python scripts/audit/check-gates-v2.py
git add scripts/audit/check-gates-v2.py .codex/signals/gate-status.json
git commit -m "fix: Gate 12 add registerBuiltinLoops detection + re-run checker"
git push
```

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- Gate 12 C3：`registerBuiltinLoops` 被 `re.findall` 命中→非空列表→passed
- 2 个测试

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| check-gates-v2.py | 人工/cli | `python scripts/audit/check-gates-v2.py` |
| gate-status.json | D220 仪表盘 | 提交并验证 |

---

## 完成标准

```
[ ] Gate 12 C3 grep: registerBuiltinLoops|registerHeartbeatCheck 追加
[ ] 重跑 checker → 15PASS/2PARTIAL（Gates 8/9/10/12 全部 PASS）
[ ] gate-status.json 提交 + 推送
```
