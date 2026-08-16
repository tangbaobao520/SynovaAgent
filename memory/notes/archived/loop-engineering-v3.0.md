---
name: loop-engineering-v3.1
description: Loop Engineering v3.1 — 精简执法架构 (5项阻断) + Agent自检5问 + 产品对齐检查
metadata:
  type: project
---

# Loop Engineering v3.1 — 精简物理执法 + Agent 自检 + 产品对齐

> 2026-06-17 v2.5 → v3.0 重构 → 2026-06-19 v3.1 (+产品对齐检查Q1-Q4)。
> 核心翻转：从"每犯一错加一脚本"→"找到根源，用一个机制防一类错"。
> 从"bash 替 agent 思考"→"agent 自问 + bash 查硬伤"。

## 为什么要重构

v2.5 犯了一个根本性错误：每犯一次错加一个 bash 脚本，最终堆出 38 项 pre-commit 检查和 12 个脚本（1,862 行）。提交耗时 40-90 秒，导致 `--no-verify` 泛滥——一个被绕过的门禁等于没有门禁。

v3.0 的设计哲学：**越少越会被执行。**

## 五层执法架构

```
📋 任务启动 (人工)   →  task-start.sh — 3 问翻译意图→规格
🧠 写前注入 (自动)    →  hook-check-memory.sh — 历史教训
✍️ 写后验证 (自动)    →  verify-incremental.sh — L1 oxlint → L2 tsc → L3 vitest → L4 接线
🔴 提交阻断 (自动)    →  pre-commit 5 项 — 全部 <1s
🚀 推送阻断 (自动)    →  pre-push 1 项 — secrets 终扫
```

**Why:** tsc + vitest 只在 PostToolUse 跑一次，pre-commit 和 pre-push 不重复跑。
**How to apply:** 每次提交前执行 `pre-commit-check.sh`（5项 <5s），推送前执行 `pre-push-check.sh`（1项 <3s）。

## 5 项物理阻断

| # | 检查 | 历史事故 |
|---|------|---------|
| 1 | `as any` = 0 | 47 次 |
| 2 | empty catch → log.warn | 静默吞异常 |
| 3 | secrets 扫描 | API key 暴露 |
| 4 | 新 src/ 文件 → 有 tests/ 配对 | 4 次接线失败 |
| 5 | 新 export → 有生产入口调用 | 4 次接线失败 |

## Agent 自检 5 问

写完代码必须在回复中逐项回答：

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳测试）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

## task-start.sh 3 问

```
Q1 调研: a) 业界最佳实践 b) 顶级团队怎么做 c) memory/ 里我们犯过的错
Q2 范围: 最简实现是什么？什么可以不做？
Q3 验收: 入口→交互→结果，三环节各是什么？
```

## v3.0 新增/修改的文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `scripts/pre-commit-check.sh` | 129 | 5 项硬阻断（从 500 行砍下来） |
| `scripts/pre-push-check.sh` | 40 | 1 道门（从 123 行砍下来） |
| `scripts/workflow/task-start.sh` | 90 | 3 问版本 |
| `scripts/workflow/generate-task-brief.py` | 69 | 新模板（Q1/Q2/Q3） |
| `scripts/workflow/decide-next.sh` | 58 | 精简版 |
| `scripts/workflow/hook-block-write.sh` | — | 改造 7 字段检查 |

## v3.0 删除的文件

| 文件 | 原因 |
|------|------|
| `scripts/workflow/hook-check-brief.sh` | 被 task-start.sh 覆盖 |
| `scripts/checks/check-manual-drift.sh` | 脆弱：文档数字 vs 代码计数 |
| `scripts/checks/check-vertical-slice.sh` | agent 自检 Q3 覆盖 |
| `scripts/generate-state-md.sh` | STATE.md 无人阅读 |
| `scripts/check-reality.sh` | @state 注释 ≠ 正确性 |
| `scripts/check-wire.sh` | pre-commit 5 项已覆盖 |

## 关联

- [[project-state-2026-06-17]]
- [[session-2026-06-17]]
- [[loop-engineering-v2.5]]（v3.0 的前身经验）
