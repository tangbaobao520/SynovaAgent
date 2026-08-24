# Task Brief: D513 控制塔四项返修（Win 台账反馈 + D331 残余根因）

> 生成: 2026-08-23 | 任务: D513 | 认领: dsh-cto | 来源: Win 台账 8f33e82a/37dc1cae
> 参考: memory/notes/implemented/2026-08-23-d508-commit-flow-dedrag.md

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔提交链路返修。Win 在 D478/D479/D480 三 PR 合并中实测踩到的门禁缺陷，CTO 逐项在 main 核实属实。
### b) 文件审计
- scripts/control-tower/check-bypass-log.sh — `git push <URL>` 不更新 tracking ref → BASE 陈旧 → merge-base 失效 → 补记循环残余（Win 37dc1cae 根因分析正确）
- scripts/commit-msg-check.sh — D328 无 MERGE_HEAD 检测，本地 merge 必被拦死，Win 走注入缝绕过
- scripts/control-tower/verify-parallel.sh — 裸 python3：Win Git Bash 无 python3 → exit 127 拦 pre-push（D329/D330 同型第三处漏网）
- scripts/workflow/task-start.sh — 不写 current-brief（Claude attach 断，陈旧指向误伤）
- scripts/workflow/hook-block-write.sh — `find|head -1` 多 brief 挑错证据对象
### c) 决策
四项均为明确 bug 修复：③防御 fetch（失败显式降级）；①MERGE_HEAD 豁免（不削普通提交防劫持）；②PYBIN 三级探测（复制现成模式）；⑤⑥一行级修正。V4.9.1（PATCH）。M13 教训：测试沙箱 git 身份必须 `git -c` 一次性参数（本任务开发中第四次污染事故的根因——GIT_DIR 只隔 index 不隔 config）。

## Q1: 调研
Win 37dc1cae 更正早期判断：补记根因非"mac API 通道不写记录"，是 push 走 URL 不更新 tracking ref。D508 merge-base 正确，缺 base 新鲜度保障。
参考：Win 实测 + D508 Note + git MERGE_HEAD 惯例。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/control-tower/check-bypass-log.sh — BASE 解析后防御性 fetch
- scripts/commit-msg-check.sh — MERGE_HEAD 检测豁免 D328
- scripts/control-tower/verify-parallel.sh — PYBIN 三级探测
- scripts/workflow/task-start.sh — 恢复写 current-brief（最新 mtime）
- scripts/workflow/hook-block-write.sh — ls -t 替换 find|head
- tests/control-tower/check-bypass-log.test.sh — 追加 D513/③ 接线用例
- tests/control-tower/commit-msg-merge.test.sh — 新建（merge 放行，M13 加固版沙箱）
- tests/control-tower/task-start.test.sh — U7 配对
- tests/control-tower/hook-block-write.test.sh — U7 配对
- tests/control-tower/verify-parallel.test.sh — U7 配对
- .codex/control-tower/VERSION.md — V4.9.1
- .claude/task-briefs/2026-08-23-D513-tower-repairs.md — 本 brief
- task-state/D513.json — 状态回填
不做什么：
- 不改 scripts/audit/（K3 红线）
- 不改 scripts/control-tower/check-bypass-log.sh 的 merge-base 判定语义（只加 base 刷新）
- 不改 scripts/control-tower/verify-parallel.sh 的并发判定语义
- 不动 .github/workflows/ 内任何 yml 文件

## Q3: 验收 — 入口 → 交互 → 结果
入口：git push（对账）/本地 merge 后 commit（D328）/Win Git Bash（verify-parallel）
处理：③base 恒新鲜 ①merge 不误伤 ②python 跨平台 ⑤⑥brief 指向正确
结果：Win 线零绕过零 shim；补记循环最后残余关闭

## 架构层:
scripts（控制塔）

## Done 标准
- [ ] verify: bash tests/control-tower/check-bypass-log.test.sh 全绿（含 D513/③）
- [ ] verify: bash tests/control-tower/commit-msg-merge.test.sh 全绿
- [ ] verify: bash tests/control-tower/task-start.test.sh && bash tests/control-tower/hook-block-write.test.sh && bash tests/control-tower/verify-parallel.test.sh 全过
- [ ] verify: grep -c MERGE_HEAD scripts/commit-msg-check.sh ≥1 且 VERSION.md 含 V4.9.1
