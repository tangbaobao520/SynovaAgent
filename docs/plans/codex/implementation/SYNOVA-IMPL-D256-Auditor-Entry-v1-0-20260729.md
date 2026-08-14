<!-- SYNOVA-IMPL-D256 v1.0 | 2026-07-29 | CT Graph v2 Phase 1-1 -->
# SynovaAgent -- D256 审计器统一入口 v1.0
> v2计划 §3.1: Ch5 定义5子模块, 仅2实现——缺 rules/cross-check/report

## 代码验证
- external-auditor.sh: `--task-id --diff` 模式存在, 无 `--dispatch` 模式 ❌
- audit-rules.json: 存在, 被 external-auditor.sh 读取 ✅
- known-error-patterns.json: 不存在 ❌
- .codex/audit/audit-result.json: 不存在 ❌

## Q0-Q4
Q0: 审计器(Ch5)缺失统一入口——check-lessons-learned.sh 等脚本散落, 没有调度器。
Q2: 做——external-auditor.sh 新增 `--dispatch` 模式; 新建 known-error-patterns.json(4条初始规则); 统一输出 .codex/audit/audit-result.json; wire到 post-commit hook。不做——cross-check(与Agent自评交叉验证)、独立审计报告。
Q3: post-commit触发 → external-auditor.sh --dispatch → 读 known-error-patterns.json → 逐模式 rg 扫描 → 写 audit-result.json → 推送信号到仪表盘
Q4: L1手动×3 (bash -n + --dispatch 执行 + audit-result.json 存在)

## 改动 (2文件)

### 1. .codex/audit/known-error-patterns.json — 新建
4条初始模式(基于研究session发现):
```json
[
  {"id":"E1","name":"空构造函数","desc":"new X([]) 空数组","pattern":"new \\w+\\(\\[\\]\\)","severity":"P1"},
  {"id":"E2","name":"类型导入未实例化","desc":"import type { X } 未创建实例","pattern":"import type \\{[^}]*\\}","severity":"P1"},
  {"id":"E3","name":"存根函数体","desc":"throw new Error('Not implemented')","pattern":"throw new Error\\('Not implemented'\\)","severity":"P0"},
  {"id":"E4","name":"参数不匹配","desc":"调用方传入参数与函数签名不一致","pattern":"searchSessions\\(q, 10\\)","severity":"P1"}
]
```

### 2. scripts/control-tower/external-auditor.sh — 新增 --dispatch 模式
追加 `--dispatch` 参数: 读 known-error-patterns.json → 循环 `rg` 每个模式 → 聚合结果 → 写 audit-result.json → emitSignal
保留现有 `--task-id --diff` 模式不变(向后兼容)。

## 测试 (L1手动×3)
| # | 测试 |
|---|------|
| 1 | bash -n external-auditor.sh 语法通过 |
| 2 | --dispatch 执行 → audit-result.json 产出 |
| 3 | known-error-patterns.json 格式 valid JSON |

## 完成标准
审计器有统一入口, 4条初始错误模式可扫描。bash脚本无语法错误。
