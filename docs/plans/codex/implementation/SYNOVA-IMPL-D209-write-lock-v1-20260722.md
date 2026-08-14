# SynovaAgent -- D209 写入锁 (Write Lock) 实施方案 v1.0

> 2026-07-22 | 权威文档 #17 第四章：写入锁
> **控制塔 5 组件并行部署 — 第 2/5 项。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：权威文档 #17 Ch4 文件存在（15KB），`scripts/control-tower/` 目录存在
- [x] Get-Content 读取：Ch4 §3.1 状态转换 — FREE → LOCKED → RELEASED / TIMEOUT / ERROR
- [x] Select-String 验证：Ch4 §3.2 acquire 伪代码含 lockfile 创建 + PID 写入 + 超时检测
- [x] 引用 — Ch4 §1.1："文件写入不是无状态的。在多 Agent 并行时，必须有轻量级的锁机制防止写入冲突"

---

## 问题根因

已知错误 #23：D97 + D98 同时修改 `app/css/app.css`，后提交覆盖前提交。写入锁用文件系统锁文件（`.write-locks/` 目录）协调并行 Agent 的写入，先到先得，5 分钟超时自动释放。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 写入锁。轻量级文件锁：Agent 在写文件前 acquire 锁（基于文件路径 hash），写完 release，超时自动释放 + 告警。

### Q1：调研
- Ch4 §2.1：锁服务设计 — 基于文件系统（`.write-locks/` 目录），每个锁文件包含 PID + 时间戳
- Ch4 §3.1：状态转换图 — FREE → LOCKED（acquire）→ RELEASED / TIMEOUT / ERROR
- Ch4 §4：并行冲突场景 — 两个 Agent 同时写同一文件 → 先到先得 → 后者 wait 或 fail
- Ch4 §5：降级 — 锁服务不可用 → 降级允许写入 + 记录告警

### Q2：范围
- 最小：`write-lock.py` — acquire(file_path) / release(file_path) / wait(file_path, timeout) / is_locked(file_path)
- 不做：不实现分布式锁（Redis/DB）、不实现锁队列优先级

### Q3：验收
- 入口：Agent A 调用 `acquire("src/xxx.ts")` → 成功 → 写入 → `release("src/xxx.ts")`
- 交互：Agent B 同时调用 `acquire("src/xxx.ts")` → LOCKED → wait 或 fail
- 结果：同一文件同时只有一个 Agent 写入；超时锁自动释放

### Q4：契约与测试
- @input：文件路径（相对项目根）
- @output：LockResult { acquired: bool, lockId?: str, reason?: str }
- @degraded：锁目录不可创建 → 降级允许写入 + log.warn
- 测试：acquire/release 成功(1) + 重复 acquire 拒绝(1) + timeout 释放(1) + 降级(1) = 4 tests

---

## 构建内容

### 1. scripts/control-tower/write-lock.py（新建，约 120 行）

```python
class WriteLock:
  LOCK_DIR = ".write-locks"
  DEFAULT_TIMEOUT_SEC = 300  # 5 分钟

  acquire(file_path: str, owner: str = "agent") -> LockResult
    # 基于 file_path 的 SHA256 前 16 位生成锁文件名
    # 创建 lock 文件，写入 PID + 时间戳 + owner
    # 检测现有锁是否超时 → 自动释放

  release(file_path: str) -> LockResult
    # 删除 lock 文件（仅当锁属于当前 PID）

  wait(file_path: str, timeout_sec: int = 60) -> LockResult
    # 轮询等待锁释放，最长 timeout 秒

  is_locked(file_path: str) -> bool
    # 检查锁文件存在且未超时
```

### 2. tests/control-tower/test-write-lock.py（新建，约 80 行）

> ⚠️ 前置步骤：`tests/control-tower/` 目录尚不存在，需执行 `mkdir tests\control-tower` 或由脚本自动创建。

测试 acquire/release 正常流程、重复 acquire 拒绝、超时自动释放、降级模式。

---

## 不做什么

- 不实现分布式锁（Ch4 未要求）
- 不实现锁队列优先级
- 不修改 Agent 的 write 工具本身（锁是外部协调机制）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- acquire + release 正常流程 → acquired=true → released
- 重复 acquire 同一文件 → acquired=false
- 超时锁自动释放 → 新 acquire 成功
- 锁目录不可创建 → 降级写入 + log 告警
- 4 个测试，每测试 ≥3 expect()

---

## 接线验证（铁律 4）

| 组件 | 触发方式 | 验证方式 |
|------|------|------|
| write-lock.py | Agent PreToolUse hook 调用 | 集成到 hook-block-write.sh |
| .write-locks/ 目录 | 自动创建于项目根 | Test-Path 验证 |

---

## 完成标准

```
[ ] tests/control-tower/ 目录已创建
[ ] write-lock.py: acquire/release/wait/is_locked 4 方法
[ ] 锁文件基于 SHA256(file_path)[:16]
[ ] 超时自动释放 (默认 300s)
[ ] 降级：锁目录不可创建 → log.warn + 允许写入
[ ] 零 as any（Python 无需检查）
[ ] ≥4 个测试
[ ] python write-lock.py --help 退出码 0
```

---

## 权威文档引用

- 权威文档 #17 第四章：写入锁 — §2 系统架构 / §3 锁生命周期 / §4 并行冲突场景 / §5 降级策略
- AGENTS.md Iron Law 0-5 错误 #23（D97+D98 css 冲突）
- AGENTS.md 铁律 24（异常处理审计）、铁律 31（降级信号传播）


