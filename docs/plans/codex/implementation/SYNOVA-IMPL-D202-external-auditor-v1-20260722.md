# SynovaAgent -- D202 外部审计器 实施方案 v1.0

> 2026-07-22 | 权威文档 #17：创始人控制塔 -- 第五章
> **Agent 自我报告说"审计通过"，但代码有 bug。外部审计器独立扫描代码，对照 23 项已知错误模式，与 Agent 自我报告交叉对比——矛盾时标记人工审查。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：pre-commit-check.sh（8 组）、AGENTS.md 铁律 0-5（23 项错误）、SYNOVA-AUDIT-SPEC（5 点审计方法）
- [x] Get-Content 读取：第五章第 1-50 行（问题定义、审计哲学、设计目标）
- [x] Select-String 验证：审计规范中 5 个审计检查类别存在（接线/异常/类型/测试/契约）
- [x] 权威文档原文引用：第五章 §1.2——审计哲学："不信任 Agent，只检查物理事实，矛盾标记人工审查"

---

## Loop Engineering V4.4.5 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 自动化代码质量审计。D202 构建一个在每次提交后运行的外部审计器：扫描变更文件，对照 23 项已知错误模式，输出 P0/P1/P2 严重度分级报告，并与 Agent 的自我报告交叉对比。审计器不信任 Agent 的自我评估——它独立扫描代码。

### Q1：调研
- 权威文档 #17 第五章 §1：审计哲学（独立验证，仅物理事实）
- 权威文档 #17 第五章 §2：5 点审计框架（接线/异常/类型/测试/契约）
- AGENTS.md 铁律 0-5：23 项已知错误模式，作为审计规则
- SYNOVA-AUDIT-SPEC-20260722.md：已有审计规范，含详细方法

### Q2：范围
- 最小实现：external-auditor.sh 对变更文件运行 5 类检查，输出 P0/P1/P2 报告
- 不做：自动修复生成（仅检测）、语义正确性分析（仅物理事实）

### Q3：验收
- 入口：synova-commit 包装器在成功提交后调用 external-auditor.sh
- 交互：审计器扫描 git diff，运行 5 类检查，生成报告
- 结果：审计报告输出到 .codex/audit-reports/{task-id}.md，含 P0/P1/P2 发现

### Q4：契约与测试
- @input：git diff 范围（HEAD~1..HEAD）+ task-id
- @output：审计报告（Markdown），含严重度分类的发现
- @degraded：审计脚本自身崩溃 → 标记 degraded + 通知，不阻塞 Agent
- 测试：检测到空 catch、检测到未接线的 export、检测到缺失测试、干净代码通过

---

## 当前状态（2026-07-22，grep 验证）

- pre-commit-check.sh：存在（8 组，含 G2 空 catch、G5 接线）
- AGENTS.md 铁律 0-5：23 项已知错误模式已记录
- SYNOVA-AUDIT-SPEC-20260722.md：完整的审计规范，含 5 点审计方法
- 外部审计器：零存在
- 审计报告存储：.codex/audit-reports/ 目录不存在
- 权威文档 #17 第五章 §2：5 点审计框架规范

---

## 构建内容

### 1. scripts/control-tower/external-auditor.sh + audit-rules.json（总计约 250 行）

包装器 bash → 运行 5 类检查，聚合结果：

```
external-auditor.sh --task-id D123 --diff HEAD~1..HEAD
```

**5 个审计类别（来自第五章 §2）：**

| 类别 | 检查内容 | 错误模式引用 |
|------|------|------|
| 接线 | 每个新 export 在 src/ 中有调用方（grep）| 铁律 0-5 错误 #3、#12 |
| 异常 | 每个 catch 有 log.warn/error + degraded | 铁律 0-5 错误 #20（空 catch）|
| 类型 | 生产代码中 as any = 0（src/ 非 tests/）| 铁律 38 |
| 测试 | 每个新 src/ 文件有配对的测试文件 | 铁律 0-5 错误 #10 |
| 契约 | 每个 compute 函数有 @input/@output/@degraded JSDoc | 铁律 0-5 错误 #2、铁律 47 |

### 2. audit-rules.json -- 规则配置

```
{
  "rules": [
    { "id": "E001", "category": "EXCEPTION", "pattern": "catch.*\{\s*\}", "severity": "P0" },
    { "id": "W001", "category": "WIRING", "check": "grep_export_callers", "severity": "P0" },
    ...
  ]
}
```

### 3. 与 Agent 自我报告的交叉对比

审计后，将发现与 Agent 在 task brief 中的自我报告对比：
- Agent 说"接线：通过"但审计器发现零调用方 → 矛盾（标记人工审查）
- Agent 说"测试：10/10"但审计器发现缺失测试文件 → 矛盾
- Agent 与审计器在所有点上一致 → 一致

### 4. 报告输出（.codex/audit-reports/{task-id}.md）

```
## 审计报告 -- D123（2026-07-22 14:30）

### 概要
- P0：2 | P1：5 | P2：3 | 通过：8/13
- Agent 自我报告一致性：矛盾（3 项）

### P0 发现
| 类别 | 文件:行号 | 问题 |
...

### 交叉对比
| 检查项 | Agent 报告 | 审计器 | 状态 |
...
```

---

## 不做什么

- 不修复 bug——仅检测并报告
- 不因审计发现阻塞 Agent 流程（仅报告，创始人决定行动）
- 不做语义正确性分析

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 审计规则 E001（空 catch）：@input（含空 catch 的代码）/ @output（P0 发现）/ @degraded（无匹配 → 空）
- 审计规则 W001（接线）：@input（export 名称列表 + caller grep 结果）/ @output（零调用方 → P0）
- 审计规则 T001（缺失测试）：@input（src 文件列表 + test 文件列表）/ @output（有 src 缺失 test → P1）
- 每条规则 4 组 fixture：正常（检出问题）、边界（干净代码通过）、错误（grep 失败 → degraded）、时序（相同文件产生相同结果）

### L2a：接线测试
- external-auditor.sh 被 synova-commit post-commit hook 调用（grep "external-auditor.sh" scripts/control-tower/synova-commit）
- .codex/audit-reports/ 目录存在且可写

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| external-auditor.sh | synova-commit post-commit hook | grep "external-auditor.sh" scripts/control-tower/synova-commit |
| audit-rules.json | external-auditor.sh | grep "audit-rules.json" scripts/control-tower/external-auditor.sh |

---

## 完成标准

```
[ ] external-auditor.sh：接受 --task-id 和 --diff 参数
[ ] 5 个审计类别已实现：接线/异常/类型/测试/契约
[ ] audit-rules.json：按铁律 0-5 映射 23 条规则
[ ] 报告输出：P0/P1/P2 严重度分级 + 文件:行号引用
[ ] 交叉对比：审计器发现 vs Agent 自我报告对比
[ ] 降级：审计脚本崩溃 → 标记 degraded + 通知（不阻塞）
[ ] 集成：从 synova-commit post-commit 步骤调用
[ ] bash -n 语法检查通过
[ ] 零 as any（bash 脚本——无 TypeScript）
[ ] ≥10 个测试：接线 (2) + 异常 (2) + 类型 (1) + 测试 (2) + 契约 (1) + 交叉对比 (1) + 降级 (1)
```

---

## 权威文档引用

- 权威文档 #17：创始人控制塔 -- 第五章：外部审计器
  - §1.2：审计哲学（独立验证，仅物理事实）
  - §2：5 点审计框架规范
  - §3：交叉对比机制
- SYNOVA-AUDIT-SPEC-20260722.md：已有审计规范
- AGENTS.md 铁律 0-5：23 项已知错误模式
