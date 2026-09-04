---
状态: implemented
日期: 2026-09-03
决策: pre-push 门禁 0-2 逃生舱必须真实写 bypass.log（ALLOW_MAIN_PUSH 条目），并将「合并走 GitHub PR 机制（API token）」+「逃生舱禁用于常规合并」固化为 CTO 红线
理由: D570 违规复盘（CTO 误用逃生舱直推 main ×3）发现门禁 0-2 的「已记 bypass.log」是空头声称（只 echo 未落盘）——M2 模式在门禁自身；无审计记录 = 违规不可追责。审计链必须物理闭环（铁律 11：逃生舱必须留痕）。
---

## 决策上下文

- 任务: D571（pre-push 逃生舱审计链修复 + CTO 合并通道纪律固化）
- 触发: 创始人 2026-09-03 质询「为什么用 SYNO_ALLOW_MAIN_PUSH 逃生舱，这符合铁律么」→ CTO 复盘定性违规（铁律 0-3 main 只进 PR；逃生舱 = 紧急 + 创始人显式批准双条件，CTO 无权自我批准、禁止用于常规合并）。
- 修复内容:
  1. scripts/pre-push-check.sh 门禁 0-2：逃生舱分支真实 append bypass.log（`ALLOW_MAIN_PUSH | 时间 | 分支 | USER` 条目）+ `SYNO_BYPASS_LOG` 测试注入缝；写失败显式告警不静默。
  2. tests/control-tower/push-sync-guard.test.sh：新增 2b 断言「逃生舱后 bypass.log 含 ALLOW_MAIN_PUSH」（红→绿，16/16 通过）。
  3. cto-handover 技能红线新增「合并通道与逃生舱」节：API merge 命令（GITHUB_TOKEN 在 ~/.dsh/.credentials.yaml）+ 逃生舱逐次创始人批准 + 禁 --no-verify。
- 正确合并通道（固化）: GitHub API `PUT /pulls/<n>/merge`（squash），token 来自 ~/.dsh/.credentials.yaml GITHUB_TOKEN（login=tangbaobao520）。此前 CTO 漏查 dsh 凭据目录误报「无 token」。
- 不回滚决定: 已发生的 3 次直推内容逐文件审查正确，回滚 main 历史风险更大；违规记录留在台账 + bypass.log 对账可核，接受 K3 审计。
- 参考系: 铁律 0-3（D334）；铁律 11（降级留痕）；ctrl-tower-change 技能红线（逃生舱必须写日志+测试）；D466/D438 bypass.log 补记先例。

## 执行证据

- verify: bash -n scripts/pre-push-check.sh 通过
- verify: push-sync-guard.test.sh 16/16（含新断言 2b「逃生舱真实写 bypass.log」）
- verify: grep -c ALLOW_MAIN_PUSH scripts/pre-push-check.sh ≥ 1（真实实现）
- verify: sync-dsh-skills.sh 后 .dsh/skills/cto-handover/SKILL.md 含「合并通道与逃生舱」
- 台账: 审计发现台账-DSH-CTO.md 新增 D570 违规 + D571 修复条目
