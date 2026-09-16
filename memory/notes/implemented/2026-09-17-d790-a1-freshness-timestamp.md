---
状态: implemented
日期: 2026-09-17
决策: D790 A1 度量口径修复——失效比较基准从「证据日期（T00:00:00）」改为「证据生成时间戳」；时间来源分层 = 记录自带 at/generated_at →（非计分 machine 路径）证据文件 git 入库时间代理（限「入库日−记录日 ≤1 天」）→ 日期粒度回退 + 显式 degraded
理由: 日期粒度把「证据当天任意时刻的提交」都算 touched → 当日生成的证据恒判 stale，完成度数字随判定时点/证据刷新跳变。实测（回放 2026-09-15 夜跑证据集 eb0fe7cb）：6 点被误杀（7-7/18-2/18-5/25-1/25-2/25-3，线 7/18/25 modules 当日晚于 00:00 的提交）；09-13 窗口线 1 另有 3 点（1-1/1-6/1-7）同型误杀。派单原文把事故归因「#538（09-15 21:41）吞掉线1 六点」——实测 b1618971 未触线 1 modules（名单见下），归因不成立，但缺陷本体与修法成立。
---

## 变更清单

1. `scripts/product-lines/calc-progress.py`
   - 新增 `parse_iso_ts()`（兼容 `Z`，Python 3.9 `fromisoformat` 不认）、`git_last_commit_time()`（证据文件 git 入库时间 = `git log -1 --format=%cI`）、`ingest_ts_plausible()`（入库日−记录日 ∈ {0,1}）、`evidence_freshness_ts()`（时间来源判定 + 显式降级登记）
   - `git_touched_after(..., cwd=None)`：新增仓库根注入缝（测试用）；语义注释明确「`--since` 含边界 ⇒ 提交时间 == 证据时间 → touched，即『证据时间 > 提交时间』才算 fresh」
   - `compute(..., now=None)`：墙钟注入缝（确定性测试）；加载记录时补 `at`（含 `generated_at`）与 `ingest_ts`；`problems` 末尾去重（同证据多点触发同一 message）
   - machine 分支：`git_touched_after(line_modules, ev_ts or latest["date"])`（原为 `latest["date"]`）—— k3 路径（CT-62，acc228dc）与 machine 路径对齐
   - `freshness_gate()`：k3 计分路径缺 `at` → 回退日期粒度 + 显式登记 problems（**不用**入库时间代理）
2. `scripts/product-lines/evidence-writer.py`：证据记录落 `at`（缺省 = 写入时刻本地 ISO 8601 带偏移）；新增 `--at` 覆盖；非法值 fail-closed exit 2
3. `tests/control-tower/product-lines.test.py`：+8 D790 用例（同日先后 / 同秒边界[真 git 临时仓库] / 缺时间戳显式降级 / 入库代理 / 代理 >1 天拒绝 / k3 计分路径不用代理 / 同日两时点六态一致[真实数据] / evidence-writer at 落盘）；+`test_evidence_writer_at_stamp`
4. `tests/control-tower/calc-k3-stale.test.py`：A3 夹具补 `at`（完整记录语义）+ 新增 `test_a3b_missing_at_registers_explicit_degraded`

## 语义矩阵

| 情形 | 改前 | 改后 |
|---|---|---|
| 证据带 at 且晚于该线最后提交 | fresh | fresh（不变） |
| 证据带 at 且早于/等于提交（同秒） | stale | stale（不变，边界更明确） |
| 证据无 at，当日提交晚于证据生成 | **stale（误杀）** | machine：入库时间代理 → fresh；k3：保守 stale + 显式 degraded |
| 证据无 at，入库日−记录日 >1 天 | stale | stale（拒绝代理，防 squash 合并时间冒充生成时间）+ 显式登记 |
| 证据无 at 且未入库（工作区新文件） | stale | stale（保守，不静默当 fresh）+ 显式登记 |
| TTL 14 天 / 六态机 / 权重 / 兑换口径 | — | **零改动** |

计分影响面：machine 路径最高 `pending_k3`（不计分）→ 代理放宽不产生假绿；k3 计分路径（→ verified）**不用**代理（README §二 A「at 补齐=不诚实」先例）。产品总进度今日实测 0% → 0%（164 点中 6 点在回放窗口恢复为 pending_k3）。

## 效果（实测）

- 事故回放 @eb0fe7cb：`stale 27→24`、`pending_k3 34→37`，6 点 `stale → pending_k3`（7-7/18-2/18-5/25-1/25-2/25-3）
- 今日真实数据：0 点状态变化（当日无同型误杀），但 `degraded.problems` 显式登记「以入库时间代理」2 条、`degraded.sources` 登记拒绝代理 5 条
- 靶心「同一天不同时点跑两次 → 六态一致」：改前/改后**都**一致（对同一证据集，日历粒度本是时间无关的）——本卡据此把真正的判据缺陷改为「同一份证据的判定依赖其日历日」并修掉；回归护栏落为测试 `test_same_day_two_run_times_identical`
- 残留窗口（如实登记）：`at` 缺失且**尚未入库**的存量证据只能保守判 stale（producer 修复后新证据自带 `at`，窗口只影响历史文件）

## 参考系 / DSH 借鉴（按本地最新副本复核）

- 现行 DSH 副本 = `~/Library/Application Support/io.github.hairyf.deepseek-harness-desktop/dependencies/dsh/`
  `deepseek-harness-pkg` **0.1.5-rc.2**（mtime 2026-09-16 23:34，241 包）
- 范式借鉴（读范式自研，不引代码）：
  ① `dsh-fs-observation-policy/lib/index.js:49,56,69`「已观察版本 + 原子新鲜度校验」→ 不一致即拒绝并提示重读
  ② `dsh-session-projection-cache/lib/index.js:23-24`「never wrong, only possibly stale; seq says how stale」→ 降级可量化、不冒充正确
  ③ `dsh-file-reference-local/lib/index.js:60`「Monotonic invalidation counter」→ 用不可变量而非墙钟判失效
- 第一性原理：判据只依赖不可变输入（证据生成时间 + git 提交时间），运行时刻不得进入判据

## 版本锚点漂移（另案登记，不属本卡写集）

施工图锚定 `v0.1.0-rc.5`（2026-08-20；`DSH迁移施工图-20260820.md:43`），本地现行副本 `0.1.5-rc.2`：
被引用样例 `dsh-subprocess-local/lib/index.js` 的 `signalTree()` **L757 已不存在**（该文件 1319→1084 行，
现为 `signalChildGroup`:339 / `signalName`:607；旧版 rc.8 = nvm checkout 里 L757 仍在）。
⇒ 派单"文件+函数+行号"引用须按**现行副本**复核后再发（M6 版本锚点断裂）。
