# SynovaAgent -- Gate 0+4 checker fix 实施方案 v1.0

> 2026-07-26 | Gate 0 healthz/sentinel 端口仍为 18790 + Gate 4 C3 两分支都加 partial
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/audit/check-gates-v2.py` 存在，`scripts/agent-start.bat` 存在（D229），`src/sentinel/registry.ts` 存在
- [x] Get-Content 读取：Gate 0 L359 — `http://localhost:18790/api/healthz` 端口仍是 18790（D225 已修复 Gate 1 为 3000 但 Gate 0 未同步）。L374 — sentinel health 同样 18790。L37 — `SERVER_PORT = 18790` 全局常量未更新。Gate 4 L716-724 — registry.ts 存在且含注册逻辑→`partial += 1`（两个分支都加 partial）
- [x] Select-String 验证：D225 L504 — `http://localhost:3000/api/enterprise/register`（Gate 1 已修复）。Gate 0 C1 已有 agent-start.bat 静态检查——唯一缺口是 C2/C3 端口
- [x] 引用 — Gate 0 当前 FAIL（healthz/sentinel 端口错误+服务未运行时标记 fail），Gate 4 当前 PARTIAL

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 门禁检查器修复。修复 Gate 0 的端口硬编码（18790→3000）和 Gate 4 C3 的 `partial` 逻辑反转。

### Q1：调研
- Gate 0 C1 已有 agent-start.bat 静态检查——C2/C3 端口硬编码 18790 未与 Gate 1 同步
- Gate 4 C3 两分支都加 `info["partial"] += 1`——与已修复的 Gate 1/2/5/8/9/15 同模式

### Q2：范围
- 最小：check-gates-v2.py 3 处端口（L37/L359/L374）+ Gate 4 C3 逻辑修复
- 不做：不修改 agent-start.bat、不修改 registry.ts

### Q3：验收
- Gate 0 重跑 checker → healthz/sentinel 端口正确 → partial（服务器未运行时可验证基础设施就绪）
- Gate 4 重跑 checker → C3 registry 存在→passed

### Q4：契约与测试
- @input：checker 静态扫描代码库
- @output：gate-status.json Gate 0 partial / Gate 4 pass
- @degraded：healthz/sentinel 服务器未运行 → partial（非 fail）

---

## 修复内容

### 1. Gate 0 端口修复（L37 + L359 + L374）

```python
# L37  SERVER_PORT = 18790  →  SERVER_PORT = 3000
# L359 http://localhost:18790/api/healthz    → 3000
# L374 http://localhost:18790/api/sentinel/health → 3000
```

### 2. Gate 4 C3（L716）

```python
# 修复前（两分支都 partial）
if reg: info["partial"] += 1
else:   info["partial"] += 1

# 修复后
if reg: info["passed"] += 1
else:   info["partial"] += 1
```

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- Gate 0 C2 healthz 端口 3000 可访问（服务运行时）→ passed
- Gate 0 服务未运行时 → C2/C3 partial（非 fail）
- Gate 4 C3 registry 含注册逻辑→passed
- 3 个测试

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| check-gates-v2.py Gate 0/4 | 人工/cli 运行 | `python scripts/audit/check-gates-v2.py` |

---

## 完成标准

```
[ ] L37 SERVER_PORT = 3000
[ ] L359 healthz 端口 3000
[ ] L374 sentinel health 端口 3000
[ ] Gate 4 C3 registry 存在→passed
[ ] 重跑 checker → Gate 0 partial / Gate 4 pass
```
