# D564 — incident-loop.test.sh Windows 兼容修复（canary 首测双失败）

> 派单: CTO | 2026-08-29 | 执行线: 编码 session | 来源: canary 首次纳入实测（PR #305，Windows runner）
> 类型: FIX；完成后需 K3 复审
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L0 控制塔测试。D561 修复 incident-loop 4b（_find_bash POSIX fallback）后 macOS 8/8；canary 首纳入 → Windows runner 实测 6 通过 2 失败（该测试从未在 Win 跑过——「macOS 绿」是单平台口径）。失败证据: PR #305 Windows gate 日志（run 3323...，FAIL: tests/control-tower/incident-loop.test.sh）。

### b) 文件审计
- tests/control-tower/incident-loop.test.sh：Win 失败 2 断言（实现方从 CI log 定位具体断言）
- scripts/control-tower/incident-loop.py：_find_bash / _bash_env POSIX 分支（D561 改动区）

### c) 决策
修复 Win 语义（8/8 双平台）→ 修复后回 canary（26→27）。

## Q1: 调研
D520 跨平台先例（PATH 差异/Git Bash）；windows-compat 模式库；失败证据 = CI job 级日志（非本地推测）。

## Q2: 范围
做什么：
- 修改 tests/control-tower/incident-loop.test.sh：Win 双失败断言修复（或正确平台分支隔离）
- 修改 scripts/control-tower/incident-loop.py：如根因在工具侧（_find_bash Win PATH 语义）
- 修改 .github/workflows/ci.yml：incident-loop 重新入 canary（26→27）
- task-state/D564.json：回填

不做什么：
- 不改 macOS 语义（8/8 保持）
- 不改 scripts/audit/（审计红线）

## Q3: 验收
入口：CI Windows gate job（双平台真实验收——本任务唯一有效验收通道）
处理：本地 macOS 8/8 + Win 语义分析 → PR → CI
结果：CT Gate Tests windows+ubuntu 全绿 + canary 27

## 架构层:

L0 控制塔（tests/control-tower/ + scripts/control-tower/）

## Done 标准
- [x] macOS 8/8 保持 verify: bash tests/control-tower/incident-loop.test.sh 2>&1 | grep "8 通过"
- [x] canary 回列 verify: grep -c "incident-loop" .github/workflows/ci.yml | xargs test 1 -ge
- [x] Win CI 绿 verify: CTO 合并前查 check-runs job 级（windows-latest success）
- [x] 回填 verify: python3 -c "import json; d=json.load(open('task-state/D564.json')); assert d['status']=='impl_done'"
