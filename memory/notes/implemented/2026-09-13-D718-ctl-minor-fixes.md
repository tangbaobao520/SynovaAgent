---
状态: implemented
日期: 2026-09-13
决策: 控制塔小修批三项——① alloc 测试只注入 task-state 导致骨架 brief 泄漏真仓 → 测试补双注入 + 分配器源头守卫（注入态拒绝写真实 brief 目录）② resolve-commit-brief 认领窗口从「纯文件名日期 ±1 天」升级为「任务身份（D#）锚点 ∪ 日期窗口」，跨日任务不再认领不了自己的提交 ③ pre-doc-audit.sh 首行 BOM 清除
理由: 三项同族——门禁/工具链「看起来正常，实际静默失真」。① 同类第 2 次复发（D521 修过 alloc-task-id.test.sh，lock 测试再犯）→ 按「一类一机制」原则不再逐测试打补丁，改为分配器源头 fail-closed；② 日期不是任务身份，D664 实测被拦 2 次后只能靠「改 brief 文件名日期」绕过，属系统级缺口；③ BOM 让 shebang 失效（`#!/usr/bin/env: No such file or directory`），存量且有同族。
---

## 任务

D718（并行 CTO，P1）— 派单 `docs/synova/coordination/派单-下一批四线并行-20260913.md` §D718。
写集：`scripts/control-tower/`、`scripts/workflow/`、`tests/control-tower/`。每项独立 PR，最小爆炸半径。

## 决策 1：alloc 测试烟雾污染 → 双注入 + 源头守卫（不逐测试打补丁）

**缺陷（物理复现）**：`tests/control-tower/alloc-task-id-lock.test.sh:42` 只注入 `SYNO_TASK_STATE_DIR`，
未注入 `SYNO_BRIEF_DIR` → 每次运行把 `seq 1 20` 的 20 份骨架 brief 写进**真实仓库**
`.claude/task-briefs/`。实测：运行一次真仓 brief 数 606 → 626（+20，`git status` 20 条 `??`）；
台账已记录历史泄漏 56 份。副作用：`resolve-commit-brief.sh` 候选集被污染（认领可能落到错误 brief）。

**为什么不是「就修这一行」**：D521 已给 `alloc-task-id.test.sh` 补过同一注入缝 —— 同类第 2 次复发。
按 Loop Engineering「一类一机制」，逐测试补丁无效，必须在**源头**拦：
`alloc-task-id.sh` 检测到「task-state 被注入（= 测试沙箱）但 brief 目录未注入」时，
**拒绝生成 brief 骨架**（显式告警到 stderr，不静默；生产路径不设该变量 → 不受影响）。

**反假绿断言**：只断言「真仓零污染」会在守卫静默跳过时假绿（0→0 也通过）。
故同时断言「沙箱 brief 目录必须收到 20 份」——两层断言互为对照，缺一层则为纸老虎。

## 决策 2：认领窗口 = 任务身份（D#）锚点 ∪ 日期窗口（不做窗口整体放宽）

**缺陷（物理复现）**：`resolve-commit-brief.sh:79-90` 用文件名日期算 `today±1` 窗口筛候选 brief。
D664 brief 生成 2026-09-10、提交 2026-09-12 → 09-10 不在窗口 {09-11,09-12,09-13} 内 →
该 brief **永远无法认领自己的提交** → D328 认领校验判「他人文件」硬阻断（实测被拦 2 次，
处置=把 brief 改名到执行日；D706/D707 同惯例）。跨日任务是常态。

**为什么不整体放宽窗口**：既有测试 #6 明确钉住「today-2 的 brief 不得参与认领」（防 D291/D296
跨 session 误伤复发）——放宽窗口会把**他人**的陈旧 brief 拉回候选池，属于用新问题换旧问题。

**收敛方案**：候选集 = 日期窗口 ∪「本提交所属任务 D# 的 brief」。身份证据（按可靠性）：
① 暂存路径 `task-state/D#.json`（强锚点）② 分支名（强锚点）③ current-brief 文件名。
强锚点另可在认领计数为空时参与最终回退（纯日期回退对跨日任务会落到无关 brief）。
语义：**日期只是兜底，身份才是归属依据**。

**决策 2b（执行期实测追加）：同数认领 tie-break 也必须身份优先。**
本单修 `scripts/pre-doc-audit.sh` 时被 `staging_guard.py` 硬阻断一次——根因不是窗口，而是
**共享文件被多个 brief 同时认领**（D664 brief 历史也改过 `pre-doc-audit.sh` 与
`grep-oP-regression.test.sh`）：D664 brief 与本任务 brief 认领数相同 → 旧实现 `claims.sort(key=-n)`
是**稳定排序 = 字典序** → `2026-09-12-D664-*` 恒胜 `2026-09-13-D718-*` → guard 判
「认领 brief D# ≠ 本 session 任务 D#」block。修法：同数时按 强锚点 → 弱锚点 → 原字典序 排序；
无锚点时行为与修复前完全一致。用例 11 钉住（修复前 2 条红）。

## 决策 3：BOM 清除 + 同族全仓扫描

`scripts/pre-doc-audit.sh` 首行 `EF BB BF` → `bash scripts/pre-doc-audit.sh` 报
`#!/usr/bin/env: No such file or directory`（shebang 被 BOM 顶掉）。
**同族扫描发现 15 个 git 跟踪文件含 BOM，非 1 个**（9 个 .sh 有害 + 6 个 .py 属 PEP 263 可容忍）。
其中 1 个在 `scripts/audit/`（K3 域，CTO 红线禁碰）→ 不在本批修，登记台账按域派工；
存量清单以 ratchet 形式写进 sealed 回归网（新增 BOM 立即红；清单与实际不符也红，防僵尸条目）。

**扫描方法陷阱（实测）**：`od -An -tx1 | grep 'ef bb bf'` 因 od 十六进制对之间是**两个空格**而永不命中
→ 首轮扫描为**假阴性**（"全仓只有 1 个 BOM"的错误结论）。改用 `tr -d ' \n'` 后比对 `efbbbf` 才正确。
凡「零命中」类结论，必须先验证扫描器本身能命中已知阳性样本（守卫已加空转哨兵断言）。

## 补记：本批另发现的控制塔存量债（未修，已登记台账）

1. `scripts/` 下 11 个 .sh 缺 UTF-8 头块（`check-silent-swallow.sh --utf8` ❌，含本批改动的
   `alloc-task-id.sh`）——`origin/main` 同样存在，属存量；CI strict 下是否会红需单独核实。
2. 同族 BOM 14 个待清（除去本批 1 个），按域分：K3 域 1 / doc-system 7+1 / CTO 域 4。
3. **pre-push golden-case F1 门禁在"环境失败"时报错误结论**：新 clone 无 `node_modules` →
   `npx tsx` 需写 `~/.npm` 缓存在沙箱外（EPERM）→ 门禁输出「诊断质量退化解冻，见上方 diff」
   并阻断推送。实测 `npx tsx scripts/ci/golden-case-checker.ts` 经主树 tsx CLI 直连后
   **11/11 全绿**——是环境依赖（M5）+ 错误归因（M2 族）双重问题，应让门禁区分「检查未能执行」
   与「检查发现回退」（三态退出码，ctrl-tower-change 模式 1）。
4. **D718 brief 自身缺 `#CRITERIA:`**（派单骨架填实后丢失）→ `brief_parser.parse_criteria` 返回 None
   → 该 brief 无法被 resolver 的最终回退选中（D317 机制对它失效）。本批未改（避免动 brief 语义），
   建议后续在 brief 门禁里补「#CRITERIA 存在性」断言。

## 反向验证（两层防线各自独立证明，缺一不可）

- 抽掉测试侧 `SYNO_BRIEF_DIR` 注入（守卫保留）→ 沙箱 brief 0 份 → 断言红（exit 1），真仓仍零污染
- 再抽掉分配器守卫 → 真仓 +20 份骨架 → 断言红（exit 2）
- 还原两处 → 5/5 绿，真仓 606 → 606
