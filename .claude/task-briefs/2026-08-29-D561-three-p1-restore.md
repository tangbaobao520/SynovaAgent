# D561 — 三 P1 恢复批：g12-day-window 恢复 + incident-loop 4b + 注释如实化

> 派单: CTO | 2026-08-29 | 执行线: 编码 session | 来源: K3 impl-done 处置批 P1×3（D509/D535/D508）
> 类型: FIX；完成后需 K3 复审
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L0 控制塔。三个「丢失/红态」型 P1：
1. D509：g12-day-window.test.sh 在 main 不存在（API-merge 树误用丢失）——「10/10 复跑」无法复现；文件内容可从 dangling 提交 9cb09dbb（D505 树）恢复
2. D535：incident-loop.test.sh 4b 断言（受限 PATH _find_bash fallback）macOS 恒红 7/8（CTO 实测确认）
3. D508：check-bypass-log.sh L66-73 注释声称「merge-base 化 6+ 次补记循环根治」——数学上 merge-base 化在已 merge 场景为恒等，真根治是 D513 的 fetch 刷新；注释如实化

### b) 文件审计
- git show 9cb09dbb:tests/control-tower/g12-day-window.test.sh（内容恢复源）
- scripts/control-tower/incident-loop.py：_find_bash 实现（4b 根因处）
- scripts/control-tower/check-bypass-log.sh：L66-73 注释 + L27 已自认 merge-base 化失效（D513）

### c) 决策
恢复 + 修复 + 注释修正，三小修一批（同型：丢失/红态/声称不实）。

## Q1: 调研
铁律 35/48；D536 教训③（git show origin/main: 权威核实）；K3 file:line 已固定三处证据。

## Q2: 范围
做什么：
- 新增 tests/control-tower/g12-day-window.test.sh：自 9cb09dbb 树恢复 + 适配当前 main（D506 ERE 修复后语义）
- 修改 tests/control-tower/incident-loop.test.sh：4b 断言修复（macOS 恒红根治）
- 修改 scripts/control-tower/incident-loop.py：4b 根因（_find_bash fallback 逻辑，按测试断言对齐）
- 修改 scripts/control-tower/check-bypass-log.sh：注释如实化（merge-base 化非根治，真根治 = D513 fetch 刷新）
- task-state/D561.json：回填

不做什么：
- 不改 D549 相关（D560）
- 不改 tag V5.0.0（CTO 复核：当前指向 503d04ca 修复树，K3 此条 P1 不成立）
- 不改 scripts/audit/（审计红线）

## Q3: 验收
入口：bash tests/control-tower/g12-day-window.test.sh && bash tests/control-tower/incident-loop.test.sh
处理：恢复 → 先红后绿 → 回归
结果：g12-day-window 全绿 + incident-loop 8/8 + 注释 grep 命中新表述

## 架构层:

L0 控制塔（tests/control-tower/ + scripts/control-tower/）

## Done 标准
- [x] g12-day-window 恢复可跑 verify: bash tests/control-tower/g12-day-window.test.sh 2>&1 | grep "0 失败"
- [x] incident-loop 8/8 verify: bash tests/control-tower/incident-loop.test.sh 2>&1 | grep "8 通过"
- [x] 注释如实化 verify: grep -c "merge-base" scripts/control-tower/check-bypass-log.sh | xargs test 2 -ge
- [x] 回填完成 verify: python3 -c "import json; d=json.load(open('task-state/D561.json')); assert d['status']=='impl_done' and d['impl']['commit']"
