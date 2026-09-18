---
状态: proposed
日期: 2026-09-18
决策: 批八四卡（D811 队列收口 / D812 派单引用锚点门禁 C4 / D813 tests 类型网 ratchet / D814 D708 任务号推断修复）——把三类「已经不是第一次」的失效从自律改成物理门禁，并把队列从「未合 39 个」收敛为「每个都有判定 + 能合的 behind=0」；同时确认「门禁已写好但没合」是当前主要浪费（D778 #574 / D796 #611 / D788 #604 三件均代码完成、卡在合并）。
理由: ① 派单引用不存在的小节同型第 2 次（`编码指令-D808后续-20260917.md:24` 引用「本文 §四」，该文档只有 `## 一`/`## 二`）→ 按红线属防线系统性失效，必须物理化；② 类型门禁 `git diff -- src/ packages/ ':(exclude)**/*.test.ts' …` 让仓库根 `tests/**` 整体在扫描面外（实测过滤器命中 0、门禁组 1 放行 ✅）；③ 标准刷新动作 `merge origin/main` 会让 D708 的 `infer_did()` 按提交日期错锚到 main 侧任务号（#614 实测 `did=D806`，用别的任务 brief 当声明源 → 在途 PR 被判夹带），刷新是队列收口的常规动作，影响面 = 所有刷新过的 PR。
---

## 触发场景（实测证据，非转述）

1. **C4 引用锚点缺失**：`docs/synova/coordination/编码指令-D808后续-20260917.md:24`「与本文 §四 原文比对」；该文件标题行仅 `## 一、K3 审计指令…`（L9）、`## 二、四张派卡…`（L49）→ K3 D808 审计判 P1。同型第 2 次。
2. **tests 类型网盲区**：暂存 `tests/_probe_type_net/probe.test.ts`（含 `as never` + `as unknown as string`）→ 门禁文件过滤器命中 **0**；同内容放 `src/_probe/probe.ts` → 命中 **1**；实跑 `scripts/pre-commit-check.sh` 组 1 输出 `✅ as any / as never / as unknown as 零容忍（新增，铁律 38…）`（放行）。
3. **D708 错锚**：`infer_did('','docs/dispatch-batch7-20260917','HEAD')` → `('D806', 'commit-subject')`；「声明写集 11 条」全部 `← S3:brief.Q2-include`（D806 的文件）；本 PR 自己的 9 文件（派单文档 + D790/D791/D794/D796/D797–D800 卡）被判「夹带文件 9 个」。
4. **pre-push 黄金门禁环境假阻断（同型第 2 次，已登记未修）**：临时 worktree 无 `node_modules` → `npx tsx` 下载 → `~/.npm/_cacache` 写被拒（`npm error code EPERM`，缓存含 root-owned 文件）→ 门禁把「未执行」报成「诊断质量退化解冻」。补软链后 golden 真实 11/11 ✅。

## 落地（批八四卡）

- D811 队列收口（编码 · mac）：全量 open PR 逐个 ahead/behind + 自身文件是否已被 main 取代；R3 做 merge-main 刷新并推送；输出报告 + 需签字的关闭清单。
- D812 引用锚点门禁（编码 · mac，前置 #574）：`pre-dispatch-check.sh` 增检查 ⑪——`§<token>` / `第N节` 的目标文件标题集合必须存在；缺失 → exit 1 点名；歧义/缺文件 → 显式 degraded。
- D813 tests 类型网（编码 · mac）：新增 `check-test-type-net.sh` + 冻结基线（ratchet，增即红），接线 `pre-commit-check.sh`（本地软 / CI `SYNO_CI` 硬）；`src/`+`packages/` 零容忍口径不变。
- D814 D708 推断修复（编码 · mac）：`infer_did()` 回退链改 `git log --first-parent`（只扫分支自身提交），加夹具测试与真实分支复跑验收。

## 相关 D#

- 本批：D811 / D812 / D813 / D814
- 前置与关联：D778（#574 派单复核门禁，已写好未合）、D796（#611 交付纪律三闸，已写好未合）、D788（#604 预算只计审查面，已写好未合）、D708（合并级写集门禁本体）、D797（批七派单：队列治理 R1/R2/R3 规则来源）
- 依据计划: v1.2@4e46603f（`docs/synova/coordination/整体推进计划-主线-20260913.md`）
