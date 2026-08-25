# Task Brief: D457 修复 pre-push 门禁对 delete 的误报

> 生成: 2026-08-18 | 分支: main | 角色: DeepSeek Harness (Mac)
> 依据: 创始人授权「修」门禁 0-1 对 git push --delete 的误报

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
pre-push 门禁 0-1（多机同步检查）把 `git push --delete <branch>` 误当成普通推送，
做 behind/ahead 分叉检查 → 删除分支被误拦（HEAD 对比被删分支远端 → 分叉）。

### b) 文件审计（grep 实测）
- scripts/pre-push-check.sh check_push_sync 对 delete 无检测，删除操作也走 behind/ahead
- git push --delete 时 hook stdin 的 local_sha = 40 个 0（全零）

### c) 决策（D333）
参考：第一性原理（删除无 behind/ahead 语义，应跳过同步+对账+secrets 等新提交门禁）+
Anthropic（fail-closed 仅保留 main 保护）。结论：检测 local_sha 全零 → 门禁 0 同步检查
跳过 + 主流程跳过其余门禁（保留 0-2 main 保护）。

## Q1: 调研
铁律 11（不静默降级：删除跳过需显式 echo）。三态退出码保持 exit 0/1/2。

## Q2: 范围 — 最简方案

做什么：
- scripts/pre-push-check.sh
- tests/control-tower/push-sync-guard.test.sh

不做什么：
- 不改 scripts/audit/audit-check.py（K3 红线）
- 不改 scripts/control-tower/check-bypass-log.sh（对账本体不动）

## Q3: 验收 — 入口→交互→结果

入口：git push origin --delete <branch>
处理：检测 local_sha 全零 → 门禁 0 同步检查跳过 + 其余门禁跳过
结果：删除分支成功（exit 0）

## 架构层: 控制塔

#CRITERIA: A

## Done 标准
- [ ] git push origin --delete feat/d442-gs03 成功（实测已删）
- [ ] bash tests/control-tower/push-sync-guard.test.sh 15/15 全绿
- [ ] bash -n scripts/pre-push-check.sh 语法通过
