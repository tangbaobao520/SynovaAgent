# Task Brief: D393: task-state 状态「工件自动派生」改造

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D393)
> 决策参考：DeepSeek 第一性原理（状态=可重演事实）+ Anthropic（机器可验契约）+ 开源实证（GitHub/Linear 状态=事件派生）——收敛

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
task-state 状态靠人工维护 → 必失真（实证：D385-D392 提交后全忘更新）。改造：生成器从工件自动派生状态（spec=dev doc 文件存在 / impl=git 提交 / audit=审计报告），json 降级为元数据层。打开即真相。

### b) 文件审计
- scripts/control-tower/gen-cto-health.py（analyze_task_state 派生逻辑 + import subprocess 修复 + 指纹含脚本自身）
- tests/control-tower/gen-cto-health.test.sh（派生用例）
- task-state/README.md（派生语义）
- docs/synova/CTO-HEALTH.md（重新生成）
- .claude/task-briefs/2026-08-16-D393-derived-status.md
- task-state/D393.json

### c) 决策
三参考系收敛（第一性原理/Anthropic/开源实证）——状态派生优于门禁强制人更新（反内卷：消除人工动作）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 失真实证 → ② 派生逻辑（工件→状态）→ ③ 调试（import subprocess 缺失 = M1 静默降级边缘）→ ④ 测试 → ⑤ 提交。
引用 D393 plan、CT-37。

### b) 执行约束
- rule: "状态从工件重算，不读 json.status"
  verify: "删 json status 字段生成器仍输出正确"
- rule: "新代码带测试"
  verify: "gen-cto-health.test.sh 7/7"

### c) 决策参考系
参考：DeepSeek/第一性原理 + Anthropic + 开源实证。收敛。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/gen-cto-health.py
- tests/control-tower/gen-cto-health.test.sh
- task-state/README.md
- docs/synova/CTO-HEALTH.md
- .claude/task-briefs/2026-08-16-D393-derived-status.md
- task-state/D393.json

不做什么：
- 不改 task-state/*.json 的既有 status 字段（deprecated 标注，物理删除留后续）
- 不改 alloc-task-id.sh（建壳 status=claimed 保留为初始值）

## Q3: 验收 — 入口 → 交互 → 结果

入口：gen-cto-health.py 运行
处理：工件扫描 → 派生状态
结果：D356/D379 impl 自动检测；D385-D392 不再靠人工更新；测试全绿

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] 生成器派生 D356=audited（impl 检测到 6db5a17a）
- [ ] D393=claimed（无工件）
- [ ] gen-cto-health.test.sh 7/7
- [ ] 幂等保持（指纹含脚本自身）
