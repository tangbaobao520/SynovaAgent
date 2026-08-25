# Task Brief: D466 — check-bypass-log 注释同步 + tag-bypass-wiring 测试跨平台修复

> 2026-08-21 | CTO | 控制塔减负审计落地项 2

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔门禁层（scripts/control-tower/）。消除 check-bypass-log.sh 的注释-代码漂移 + tag-bypass-wiring 测试的跨平台失败。

### b) 文件审计
- scripts/control-tower/check-bypass-log.sh（头部注释 fail-open→fail-closed 漂移）
- tests/control-tower/tag-bypass-wiring.test.sh（用例5断言过时 + 用例6/7 shim 跨平台）

### c) 决策
纯减负：注释同步 + 测试跨平台（macOS 系统 python3 拦截），不碰铁律。

## Q1: 调研 — 历史教训

- check-bypass-log.sh 头部注释写 fail-open exit 0，代码是 fail-closed exit 2（D414/U1c 修复 M1 假 PASS 时改了代码没改注释）
- tag-bypass-wiring 用例 6/7 在 macOS 失败：系统自带 /usr/bin/python3，CLEAN_PATH 剔除含 python 目录但漏掉 /usr/bin → PYBIN 遍历先命中系统 python3，回退 shim 永不触发

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/check-bypass-log.sh
- tests/control-tower/tag-bypass-wiring.test.sh
- task-state/D466.json
- .claude/task-briefs/2026-08-21-D466-bypass-log-comment-sync.md

不做什么：
- scripts/audit/（K3 专属）
- 不改门禁逻辑（仅注释同步 + 测试修复，不做行为变更）
- 测试污染 bypass.log（K3 P2-4 测试密封性专项，独立）

## Q3: 验收 — 入口 → 交互 → 结果

入口：tag-bypass-wiring.test.sh 运行
处理：用例 5 认 fail-closed exit 2；用例 6/7 shim 提供 python+python3 拦截
结果：tag-bypass-wiring 24/24 通过

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] tag-bypass-wiring.test.sh 24/24 通过（原 4 失败）
- [ ] check-bypass-log.test.sh 4/4 不回归
- [ ] bash -n 语法通过
- [ ] 提交合并进 main
