# Task Brief: D790 A1 度量口径修复——证据失效改比时间戳（TTL 与「证据须晚于代码」意图不变）

> 生成: 2026-09-17 | 分支: fix/d790-a1-freshness-timestamp | as any: 0
> 域: mac（`scripts/product-lines/**` + `tests/control-tower/**`；单域）
> 主线贡献: 度量有效性——创始人看的完成度数字不再随「跑的时间点」跳变
> 触发: `docs/synova/coordination/派单-批六首批三卡-20260916.md` 卡 1（D790，执行方：并行 CTO）
#CRITERIA: D

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
度量层（产品完成度仪表盘 A1-A9，非产品代码）：`scripts/product-lines/calc-progress.py` 是**唯一判分入口**
——读 `product-lines.yaml` + `evidence/*.json` → 六态状态机 → `product-progress.json` → 创始人看的 26 线完成度。
本任务修 A1 失效判据（证据新鲜度比较的时间粒度），不改六态机/权重/兑换/TTL 数值。

### b) 文件审计（实测，命令见 Q3）
- 判据现状：`calc-progress.py:106-129` `git_touched_after()` 支持 ISO 时间戳（`"T"` 在则直接 `--since`）；
  `:232-234` 调用方传 `latest["date"]`（**日期粒度**）→ `--since=<date>T00:00:00`；
  `:158` k3 路径已传 `evidence_at`（CT-62，D582 `acc228dc`）→ **machine 路径与 k3 路径不对称**。
- 事故机制（实测复现）：线 1 modules 最后提交 `b1618971`（2026-09-15T21:41:57+08:00，PR #538）；
  当夜 D774 流水线产出的 `evidence/test-2026-09-15.json`（`date=2026-09-15`，**无 `at` 字段**）
  覆盖面点 1-1/1-3/1-4/1-5/1-6/1-7 → `--since=2026-09-15T00:00:00` 命中 21:41 提交 → 六点判 stale；
  次日 `test-2026-09-16.json`（`date=2026-09-16`）成为最新记录 → 判 fresh 恢复 → 数字跳变。
- 证据时间戳覆盖（实测 46 份记录）：**15 份有 `at`，31 份没有**（全部 machine 类证据由
  `evidence-writer.py` 写入，该脚本**不写任何时间戳字段**）→ 只接 `at` 的修复对本次事故无效。
- 出产侧：`evidence-writer.py:75-84` 记录体仅有 schema/record_type/source/date/written_by/verdicts；
  调用方 `run-machine-evidence.sh:144`、`rerun-evidence.sh:233`、`.github/workflows/product-progress.yml:51`。
- 关联机制：`gen-expiry-warnings.py`（A9，只读 `date`）· `redeem-progress.py`（兑换口径，本任务不动）。

### c) 决策
判分口径改**时间戳比较**，时间来源优先级：记录自带 `at` / `generated_at` →（仅不计分的 machine 路径）
证据文件 **git 入库时间**代理（限「入库日 − 记录日 ≤ 1 天」，防 squash 合并时间冒充生成时间）
→ 都没有则**日期粒度保守回退 + 显式 degraded**（铁律 24/31，绝不静默当 fresh）。
产出侧补 `at` 落盘（`evidence-writer.py`），否则修复在「证据未入库」窗口内无效（31/46 记录缺时间戳的实证）。
k3 计分路径**不用**入库时间代理（裁决过时=假绿，README §二 A 的 `at 补齐=不诚实` 先例）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = 本 brief（口径、优先级、降级语义、验收）② 测试先行 = 四态用例先写（同日先后 / 同秒边界 /
缺时间戳降级 / 入库代理）③ 实现 = 仅时间来源判定，判分语义零改动 ④ 接线 = `refresh-all.sh` 真实链路
⑤ 验证 = 测试全绿 + 点级 before/after + 同日两时点六态一致。
引用依据：铁律 11/24（静默降级禁止）· 铁律 47/48（契约优先 + 测试非空壳）· 铁律 0-2（测试先行+接线验收）·
`cto-handover` §八 待办 1（A1 日期粒度 bug 的历史记录）· `ctrl-tower-change` 模式 1/5/6（三态退出码 + 测试沙箱 + 验收链）。

### b) 本任务执行约束
- rule: "本卡靶心 = 同一天不同时点跑两次 → 六态一致" verify: "`python3 scripts/product-lines/calc-progress.py` 两次（`now` 注入 06:00 / 22:00）→ 逐点 status 全等"
- rule: "不改 TTL 数值 / 兑换口径 / 权重 / 六态机" verify: "`git diff` 逐行 diff 只落在新鲜度时间来源判定行"
- rule: "不动 D774 已交付件" verify: "`git diff --name-only` 不含 scripts/product-lines/rerun-evidence.sh"
- rule: "缺时间戳不静默当 fresh" verify: "测试断言 `degraded.problems` 显式登记"

### c) 决策参考系
参考：第一性原理（判据必须只依赖不可变输入：证据生成时间 + git 提交时间；运行时刻不得进入判据）+ 存量数据实证
（31/46 记录缺 `at` → 只接 `at` 的修复对事故零效果）→ 结论：时间来源分层 + 显式降级，machine 路径用入库时间代理、
k3 计分路径不用（防假绿）。

**DSH 借鉴核查（按本地最新副本复核；非施工图锚定版）**：
- 现行副本 = `~/Library/Application Support/io.github.hairyf.deepseek-harness-desktop/dependencies/dsh/`
  （`deepseek-harness-pkg` **0.1.5-rc.2**，mtime 2026-09-16 23:34；241 包）；施工图锚定 = `v0.1.0-rc.5`（2026-08-20）。
- 范式借鉴（读范式自研，不引代码）：
  ① `dsh-fs-observation-policy/lib/index.js:49,56,69` —— 「已观察版本 + 原子新鲜度校验」：观察记录与当前状态
     不一致即拒绝变更（README.zh 概述："如果文件自读取后发生变化，它也会拒绝变更，并清楚提示重新读取后重试"）
     → 与本卡同形：判据 = 观察/证据时间 vs 变更时间，不合格即显式拒绝而非放行。
  ② `dsh-session-projection-cache/lib/index.js:23-24` —— "A row is never wrong, only possibly stale:
     `seq` says exactly how stale" → 降级必须可量化且不冒充正确（→ 本卡 `degraded.problems/sources` 留痕）。
  ③ `dsh-file-reference-local/lib/index.js:60` —— "Monotonic invalidation counter; a settled index below it is
     stale" → 用单调/不可变量而非墙钟判失效（→ 本卡只用 git 提交时间与证据自带时间戳，运行时刻不入判据）。
- 不引代码/不加依赖（施工图 R1：Stage 3 前零 DSH 依赖）。
- ⚠ **版本锚点漂移（另案登记，不属本卡写集）**：被引用样例 `dsh-subprocess-local/lib/index.js` 的
  `signalTree()` L757 在现行 0.1.5-rc.2 已不存在（该文件 1319→1084 行，现为 `signalChildGroup`:339 /
  `signalName`:607）→ 派单"文件+函数+行号"引用须按**现行副本**复核，不能沿用施工图行号。

### d) 相关 Note 引用
`memory/notes/implemented/2026-09-17-d790-a1-freshness-timestamp.md`（本任务 D534 Note，随 commit 引用）·
先例 `memory/notes/implemented/2026-09-06-ct62-freshness-timestamp.md`（CT-62 k3 路径时间戳粒度）。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/product-lines/calc-progress.py — 新鲜度基准时间解析（`at`/`generated_at` → machine 路径入库时间代理 → 日期粒度 + 显式 degraded）；machine 路径与 k3 路径对齐；`now`/`cwd` 注入缝（确定性测试用）；TTL/权重/兑换/六态零改动
- scripts/product-lines/evidence-writer.py — 证据写入时落 `at` 生成时间戳（`--at` 可覆盖；非法值 fail-closed exit 2）
- tests/control-tower/product-lines.test.py — D790 用例组：同日先后两情形 / 同秒边界（真 git 临时仓库）/ 缺时间戳显式降级 / 入库时间代理 / k3 路径不用代理 / 同日两时点六态一致
- tests/control-tower/calc-k3-stale.test.py — A3 夹具补 `at`（完整记录语义，D790 起缺 at 显式 degraded）+ 新增 `test_a3b_missing_at_registers_explicit_degraded`
- memory/notes/implemented/2026-09-17-d790-a1-freshness-timestamp.md — D534 决策 Note
- task-state/D790.json — 台账回填 impl 段
- .claude/task-briefs/2026-09-17-D790-a1-freshness-timestamp.md — 本 brief（写集段机器生成）

不做什么：
- 不改 scripts/product-lines/rerun-evidence.sh（D774 已交付；派单硬约束）
- 不改 scripts/product-lines/product-lines.yaml（不改 TTL 数值 / 验收点 / 权重）
- 不改 scripts/product-lines/redeem-progress.py（兑换口径冻结）
- 不改 scripts/product-lines/gen-expiry-warnings.py（A9 只预警，D774 已交付）
- 不改 scripts/pre-commit-check.sh（控制塔门禁，另有在途任务）
- 不改 docs/synova/product-lines/product-progress.json（刷新产物走 CI bot 通道，D774 先例）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`bash scripts/product-lines/refresh-all.sh`（本地手动 / CI 周五 cron / push main）→ `A4 进度计算` 环节。
处理：证据记录 → 新鲜度基准时间解析（`at`/`generated_at` → 入库时间代理 → 日期回退）→ `git_touched_after`
（`--since=<基准时间>`）→ 六态（machine 绿新鲜 → pending_k3；失效 → stale）。
结果：`docs/synova/product-lines/product-progress.json` 的 `lines[].points[].status` 与
`degraded.problems`（缺时间戳显式留痕）→ 创始人控制台/`product-progress.html`。

复现命令（本 brief 的 b) 段实证，全部实测）：
- `git log -1 --format=%cI b1618971` → `2026-09-15T21:41:57+08:00`
- `git log --diff-filter=A --format=%cI -- docs/synova/product-lines/evidence/test-2026-09-15.json` → `2026-09-16T00:47:09+08:00`
- `python3 -c "import json,glob;fs=[json.load(open(f)) for f in glob.glob('docs/synova/product-lines/evidence/*.json')];print(sum(1 for r in fs if r.get('at')), len(fs))"` → `15 46`

## 架构层: 基础设施

## Done 标准
- [ ] 测试全绿：`python3 tests/control-tower/product-lines.test.py` exit 0（含 D790 用例组）+ `python3 tests/control-tower/calc-k3-stale.test.py` exit 0（CT-62 回归）
- [ ] 靶心：同日两时点（`now` 注入）跑两次 → 逐点六态一致（用例断言 + 实跑原始输出）
- [ ] 点级 before/after：事故回放（09-15 证据集）6 点 stale → pending_k3；今日真实数据逐点对照
- [ ] 逐行 diff：`git diff --stat` + `git diff -U0` 只落在新鲜度时间来源判定（不含 TTL=14/权重/兑换/六态名）
- [ ] 写集机器生成：`bash scripts/control-tower/declare-write-set.sh --base origin/main` 生成写集段
- [ ] 门禁自过：`bash scripts/pre-commit-check.sh` 全绿后经 `synova-commit` 提交（禁 --no-verify）

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| memory/notes/implemented/2026-09-17-d790-a1-freshness-timestamp.md | task |
| scripts/product-lines/calc-progress.py | task |
| scripts/product-lines/evidence-writer.py | task |
| task-state/D790.json | task |
| tests/control-tower/calc-k3-stale.test.py | task |
| tests/control-tower/product-lines.test.py | task |
