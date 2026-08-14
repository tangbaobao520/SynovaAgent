# SynovaAgent -- D218 写入锁补全 (Write Lock Completion) 实施方案 v1.0

> 2026-07-23 | 权威文档 #17 第四章 Ch4 §2.3 + §4 + 实现表 460-462
> **控制塔 Phase 4 — Ch4 当前 1/5 完成。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/write_lock.py` 存在（D209，acquire/release/wait/is_locked 4 方法），`.write-locks/` 目录机制已工作
- [x] Get-Content 读取：Ch4 §2.3 组件清单 — 锁管理器 `scripts/lock/lock-manager.sh`（D209 write-lock.py 替代）、锁状态扫描 `scripts/lock/lock-scanner.sh`（Cron 定期扫描孤儿锁）、PostToolUse 集成 `scripts/workflow/hook-post-tool-use.sh`（文件写入前调用锁）。Ch4 实现表 460-462 — `lock-scanner.sh` 新增 / `lock-cleanup.cron` 新增（每 60s）/ `hook-post-tool-use.sh` 修改
- [x] Select-String 验证：D209 write-lock.py — `_is_expired()` 方法在 L159 实现超时检测（锁文件 timestamp + 5min），`acquire()` 在 L49 自动释放过期锁
- [x] 引用 — Ch4 §4.2："两个 Agent 同时写同一文件 → 先到先得 → 后者 wait 或 fail"

---

## 问题根因

D209 write-lock.py 实现了核心锁逻辑，但 Ch4 定义的 3 个外围组件缺失：孤儿锁扫描（进程崩溃后残留的锁文件）、Cron 调度（定期清理）、PostToolUse hook 集成（Agent 写文件前自动调用锁）。锁机制现在只能手工调用——没有被集成到 Agent 工作流中。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 写入锁补全。创建 lock-scanner.sh（扫描 `.write-locks/` 中 PID 已死的孤儿锁并清理）+ lock-cleanup.cron（每 60s 调度）+ 在 PostToolUse hook 中集成锁检查。

### Q1：调研
- D209 write-lock.py：`_is_expired()` 基于文件时间戳超时检测；`release()` 有 PID 保护（仅当前进程可释放）
- 孤儿锁场景：Agent 崩溃 → 锁文件残留（PID 已不存在）→ `_is_expired()` 需等 5 分钟 → lock-scanner 主动扫描 PID 存活状态，不等超时
- Ch4 实现表 460：`lock-cleanup.cron` — `*/1 * * * * bash scripts/lock/lock-scanner.sh`
- PostToolUse hook：当前 `hook-block-write.sh` 仅做 task brief 验证，不涉及文件写入锁

### Q2：范围
- 最小：`scripts/lock/lock-scanner.sh`（扫描孤儿锁 + 调用 write-lock.py release）+ `scripts/cron/lock-cleanup.cron`（cron 表达式）+ 修改 `scripts/workflow/hook-post-tool-use.sh`（文件写入前 `acquire`，写入后 `release`）
- 不做：不修改 D209 write-lock.py 核心逻辑、不修改 D214 signal-emitter

### Q3：验收
- 入口：Agent 写文件 → PostToolUse hook → `python write_lock.py acquire <file>` → 写入 → `release <file>`
- 交互：Cron 每 60s → lock-scanner.sh → 清理 PID 已死的残留锁
- 结果：并行 Agent 写同一文件时后者被阻塞（wait 或 fail），孤儿锁在下次 cron 时被清除

### Q4：契约与测试
- @input：文件路径（lock-scanner 扫描 `.write-locks/` 目录）
- @output：清理的孤儿锁计数 + 信号写入 `.codex/signals/write-lock.json`（通过 D214 emitSignal）
- @degraded：`.write-locks/` 目录不存在 → 跳过扫描
- 测试：lock-scanner 清理孤儿锁(1) + 正常锁不清理(1) + hook 集成(1) + cron 语法(1) = 4 tests

---

## 构建内容

### 1. scripts/lock/lock-scanner.sh（新建，约 50 行）

```bash
#!/bin/bash
# 扫描 .write-locks/ 目录，清理孤儿锁（PID 已不存在的进程）
LOCK_DIR=".write-locks"
CLEANED=0

if [ ! -d "$LOCK_DIR" ]; then exit 0; fi

for lockfile in "$LOCK_DIR"/*; do
  [ -f "$lockfile" ] || continue
  PID=$(python3 -c "import json; print(json.load(open('$lockfile')).get('pid',''))" 2>/dev/null)
  if [ -n "$PID" ] && ! kill -0 "$PID" 2>/dev/null; then
    rm "$lockfile"
    CLEANED=$((CLEANED + 1))
  fi
done
echo "{\"cleaned\":$CLEANED,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

### 2. scripts/cron/lock-cleanup.cron（新建，约 3 行）

```
# 每 60 秒扫描并清理孤儿锁
*/1 * * * * bash /path/to/scripts/lock/lock-scanner.sh >> .codex/locks/cleanup.log 2>&1
```

### 3. scripts/workflow/hook-post-tool-use.sh（新建，约 30 行）

在文件写入前：
```bash
# D218: 写入锁 — 文件写入前 acquire，写入后 release
if [ -f "scripts/control-tower/write_lock.py" ]; then
  python scripts/control-tower/write_lock.py acquire "$TARGET_FILE"
  trap 'python scripts/control-tower/write_lock.py release "$TARGET_FILE"' EXIT
fi
```

---

## 不做什么

- 不修改 D209 write-lock.py（核心锁逻辑已完成）
- 不修改 D214 signal-emitter（锁信号由 lock-scanner 直接 emit）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- lock-scanner 清理 PID 已死的孤儿锁 → 返回 cleaned≥1
- lock-scanner 不清理 PID 存活的正常锁 → 返回 cleaned=0
- `.write-locks/` 目录不存在 → 静默退出 0
- lock-cleanup.cron 语法正确（crontab -l 验证）
- 4 个测试

### L2a：接线测试
- hook-post-tool-use.sh 包含 write_lock.py 调用（grep "write_lock" scripts/workflow/hook-post-tool-use.sh）
- lock-scanner.sh 可独立运行（bash -n 语法检查）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| lock-scanner.sh | lock-cleanup.cron (每 60s) | crontab 语法验证 |
| lock-scanner.sh → write_lock.py | 孤儿锁释放 | grep "write_lock" scripts/lock/lock-scanner.sh |
| hook-post-tool-use.sh | PostToolUse hook (.codex/hooks.json) | grep "write_lock" scripts/workflow/hook-post-tool-use.sh |

---

## 完成标准

```
[ ] scripts/lock/lock-scanner.sh: PID 存活检测 + 孤儿锁清理
[ ] scripts/cron/lock-cleanup.cron: */1 * * * * cron 表达式
[ ] hook-post-tool-use.sh: acquire → trap release 集成
[ ] lock-scanner 清理时通过 D214 emitSignal 写入信号
[ ] 降级: .write-locks/ 不存在 → 静默退出
[ ] ≥4 个测试
```

---

## 权威文档引用

- 权威文档 #17 第四章：写入锁 — §2.3 组件清单 / §4 并行冲突场景 / 实现表 460-462
- D209 write-lock.py（核心锁逻辑）
- D214 signal-emitter.ts（锁信号推送）
- AGENTS.md Iron Law 0-5 错误 #23（D97+D98 css 冲突）

