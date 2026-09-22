# D911 切片 A — D708 三缺陷根治（取号越界 / 读本地工作树 / 豁免通道无结论字段）

> 卡: `task-state/D911.json`（卡主：CTO）｜派单件: `docs/synova/dispatch/D911-门禁三缺陷根治-20260922.md` §一 切片 A
> 权威证据件: `docs/synova/coordination/裁定记录-门禁三缺陷-20260922.md` §缺陷①（附 §缺陷③a 口径互斥）
> 分支: `fix/D911-merge-writeset-gate`｜工作树: `.synova-wt-d911a`｜起点: `origin/main` `ee0c4eb1`（拉平前）→ `f2b251f3`（拉平后）
> 角色: 编码 A（1 名）；自验由队内**独立**成员承担（编码不兼任，M3）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔门禁域（`scripts/control-tower/`）。本任务改 **D708「合并级写集对账 gate」**：比较
「本 PR 变更集」× 「本 PR 自己的声明写集」（intra-PR 夹带检测），CI 触发点 = PR job。
三条缺陷同属「判据不稳」族：① D# 取号**越界到并入的 main 历史**（#674/#675/#685 实测误拦）；
② 声明源读**本地工作树**而非被检查的 head 树（结论随运行目录漂移）；③ CI 不传 `--pr-body` 时
「豁免通道不可用」只留在 warns 尾注（执行方看不到）。三者互补：前两条去误拦，第三条把状态钉进结论。

### b) 文件审计（grep 实测，完整输出见 §证据 D1/D2）
- 全域扫描 `grep -rn merge_writeset_gate .`（本工作树，排除 .git/node_modules）命中 **26 个文件**；
  其中**代码级引用只有 2 处**：`tests/control-tower/merge_writeset_gate.test.sh`（本任务同改）与
  `.github/workflows/ci.yml:102`（CLI 调用，只传 `--base/--head/--branch`，不 import 任何函数）。
- 函数级扫描（`infer_did` / `find_declaration_files` / `collect_declared` / `collect_explicit_exempt` /
  `resolve_pr_body_text` / `task_id_source`）在 `scripts/`+`tests/`+`.github/` 共 **12 处**，全部落在
  gate 自身与其测试内 → **无仓外调用方**，故允许改签名（调用处同步，契约写进 docstring）。
- 跨卡簿记（必须声明，否则 K3 判重复取号/重复劳动）：**`task-state/D814.json`（status=claimed）是同根因旧卡**，
  其修法为 `git log --first-parent`，与本卡 A1 重叠。本卡口径更严：`merge-base(base,head)..head`
  （`--first-parent` 只走第一父链，仍可能漏掉「分支自身提交在第二父链上」的形态）。

### c) 决策（决策参考四步框架）
① 第一性原理：门禁的「被检查对象」是 **head 树**与**该 head 相对 base 的增量**，故声明源必须与 head 同树、
  取号范围必须与变更集同范围；② Anthropic 工程基线：判据须对**运行时刻/运行目录**不敏感（确定性）；
③ 开源实证：`git diff <merge-base>..<head>` 是本仓既有先例（`ci-vitest-ratchet-merge-base-fix` 同款）；
④ 收敛：复用既有解析器（`devdoc_writeset.py` / `brief_parser.py`），不新写 parser、不新增门禁机制。
参考：Anthropic/DeepSeek/第一性原理 + 结论 = 只去误拦 + 把状态钉进结论字段，不放松任何判据。

## Q1: 调研 — 业界最佳实践 / 历史教训

- 铁律 11（静默降级禁止）+ 铁律 24（区分 ENOENT 与解析失败）：A2 里「文件不在 head 树」= 正常默认（不告警），
  而「head 树不可枚举」= 抛 `GateError` → fail-closed `exit 2`，绝不静默当「无声明」。
- 铁律 35（自动化优先）：三条判据全部落成**夹具退出码断言**，不靠人工 check、不靠 grep 命中。
- 铁律 47/48（契约优先 + 测试非空壳）：三个被改函数先写输入/输出/降级契约 docstring，再改实现；
  测试覆盖正常/降级/边界三路径 + 反例。
- 铁律 0-3：禁 `git stash`（用工作树隔离）；禁 `--no-verify`；拉平基线用 `merge` 不用 `rebase`。
- memory 教训：`memory/notes/proposed/2026-09-18-batch8-queue-closeout-and-gate-holes.md` 已记「`merge origin/main`
  会让 `infer_did` 错锚到 main 侧任务号」（#614 实测 `did=D806`，第二次刷新变 `D803`）——错锚对象不稳定，
  修法必须落在 `infer_did` 本身。
- 本卡不做的事：**不改 `ci.yml`**（单写者）、**不新增放行开关/自动通道**、**不碰 `scripts/audit/**`**。

## Q2: 范围 — 最简方案

做什么:
- scripts/control-tower/merge_writeset_gate.py
- tests/control-tower/merge_writeset_gate.test.sh
- .claude/task-briefs/2026-09-22-D911-A-d708-fixture-truth.md
- memory/notes/proposed/2026-09-22-d911-a-d708-fixture-truth.md

不做什么:
- 不改 .github/workflows/ci.yml 该文件有单写者，本卡只在脚本侧给结论字段与替代路径
- 不改 task-state/D911.json 该卡文件归卡主，编码只读
- 不改 scripts/pre-commit-check.sh 属切片 C（另一编码）的写集
- 不改 docs/synova/coordination/ownership.yaml 属切片 B（另一编码）的写集
- 不改 scripts/audit/ 该目录为 K3 独立审计域，红线禁碰

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）: CI PR job 的 `Merge write-set reconciliation (D708)` step
（`python3 scripts/control-tower/merge_writeset_gate.py --base origin/main --head HEAD --branch <ref>`）；
本地同命令可直接复跑。处理（中间步骤）: ① 取 `merge-base(base,head)` → 变更集；② 取 D#（分支名 → `merge-base..head`
内 subject 回退 → 扫不到即 `None`）；③ 从 **head 树**取 S1/S2/S3 声明源（并集）+ `## 写集豁免`；
④ 逐文件判定并打印结论块（含豁免通道状态）。结果（最终展示）: `✅/❌/⚠️ 结论:` 块 + 夹带文件逐条点名 +
`--json`（`status`/`task_id`/`task_id_source`/`declared`/`smuggled`/`exempt_channel` 等）。
退出码语义**不变**：0 通过（含合法跳过）/ 1 夹带 / 2 无法判定（fail-closed）。

## 架构层: 基础设施

## Done 标准

- [x] A1: subject 回退**只扫 `merge-base(base,head)..head`**；并入的 main 历史不提供 D#；扫不到 → `None`
- [x] A2: S1/S2/S3 声明源一律从 **head 树**读（`git show <head>:<path>` + `ls-tree`），工作树不在该分支仍正确对账
- [x] A3: 豁免通道不可用进**结论块**+`--json` 字段，并给出「改用声明文件内 `## 写集豁免`」；退出码语义不变
- [x] 夹具：先红后绿（同一夹具两侧）+ 反例两条（卡不存在仍 exit 2；真夹带仍 exit 1 + 逐文件点名）
- [x] 回归：既有 29 条断言全绿且只增不减（终态 56 条）
- [x] verify: bash tests/control-tower/merge_writeset_gate.test.sh 返回 exit 0
- [x] verify: python3 -c "compile(open('scripts/control-tower/merge_writeset_gate.py',encoding='utf-8').read(),'g','exec')" 返回 exit 0
- [x] verify: bash -n tests/control-tower/merge_writeset_gate.test.sh 返回 exit 0
- [x] verify: grep -c INJECTED-RED tests/control-tower/merge_writeset_gate.test.sh 输出 0（红证不残留）

## 写集

> D749 单一事实源（机器块优先；上方 Q2 散文仅作说明）。格式对齐 `scripts/control-tower/brief_parser.py:49`。

| 文件 | 类别 |
|---|---|
| `scripts/control-tower/merge_writeset_gate.py` | task |
| `tests/control-tower/merge_writeset_gate.test.sh` | task |
| `.claude/task-briefs/2026-09-22-D911-A-d708-fixture-truth.md` | task |
| `memory/notes/proposed/2026-09-22-d911-a-d708-fixture-truth.md` | task |

## 证据

> 口径：**以拉平 `origin/main` `f2b251f3` 之后的运行为交付主证据**（§证据 F）；拉平前的同命令运行列为附注（§证据 E）。
> 命令一律贴原始输出的关键行 + 退出码；无 grep 型判据（判据 = 夹具退出码与结论行）。

### A1 契约（实现前先写）
```
infer_did(repo, branch, head, base_ref="") -> (D#|None, 来源 ∈ {branch, commit-subject, none})
  @input   branch 最高优先；回退**只在 merge-base(base_ref, head)..head 内**扫 subject
           （跳过 subject 含「bypass COMMITTED 登记」的影子提交）；base_ref 缺省 → 不回退
  @output  (D#, "branch") / (D#, "commit-subject") / (None, "none")
  @degraded merge-base 取不到 或 git log 失败 → (None, "none")：**绝不猜号**，宁走上游
           「无声明 → 文档范围降级 / fail-closed」
  @error   不抛错（变更集判定已由 main() 用同一 base 先行完成）
```

### A2 契约
```
find_declaration_files(repo, did, head) -> {"S1": {"path","content"}|None, "S2":…, "S3":…}
  @input   head = 被检查的 ref/sha（树）；did 可为 None（→ 三源皆 None）
  @output  选取口径与旧实现逐条一致：S1 task-state/<D#>.json；S2 SYNOVA-IMPL-*<D#>*.md 排序取末；
           S3 .claude/task-briefs/*.md 顶层、文件名含 D# 者排序取末
  @degraded 单源内容缺失 → 该源 None（正常默认，非错误）；S2/S3 外部解析器只吃路径 →
           内容落**系统临时目录**再喂（不写进仓库；清理失败不改判定）
  @error   head 树枚举失败（ls-tree）→ 抛 GateError → 调用方 fail-closed exit 2
```

### A3 契约
```
resolve_pr_body_text(arg_path) -> (正文文本, 通道状态 ∈ {"--pr-body","GITHUB_EVENT_PATH","empty","unavailable"})
  @output   "unavailable" = 两通道都取不到（含 --pr-body 给了但读不出）→ main() 必须写 result["exempt_channel"]
            并在**结论块内**打印 + 给出替代路径（声明文件内 `## 写集豁免`）
  @degraded 读取/解析失败 → ("", "unavailable")：**不放行任何文件、不改退出码语义**
```

### D1 冲突扫描（完整输出；共 26 个文件命中，代码级仅 2）
```
$ grep -rn "merge_writeset_gate" . --exclude-dir=.git --exclude-dir=node_modules
<26 个文件命中：代码级 = tests/control-tower/merge_writeset_gate.test.sh（本任务同改）+
 .github/workflows/ci.yml:102（CLI 调用）；其余为 docs/、memory/、task-state/ 内的文本引用>
$ grep -rn "find_declaration_files\|infer_did\|resolve_pr_body_text\|collect_declared\|collect_explicit_exempt\|task_id_source" scripts tests .github
<12 处，全部在 merge_writeset_gate.py 与其测试内 → 无仓外调用方>
```

### D2 既有测试基线（修前，工作树内 `ee0c4eb1`）
```
$ bash tests/control-tower/merge_writeset_gate.test.sh
  ✅ ⑫ PR 正文（GITHUB_EVENT_PATH）声明源生效 → exit 0 且打印理由
  结果: 29 通过, 0 失败
EXIT=0
```

### D3 E2E 反向验证夹具（`gate/ctrl-verify-batch2`，**钉 sha** `9e24daf5`）
```
$ git rev-parse origin/gate/ctrl-verify-batch2
9e24daf515382968168b4c21d713262b32a7fae2      # = refs/pull/696/head（PR #696 真 head，merge 提交）
修前版 gate（origin/main blob cac0760c）:
$ python3 /tmp/d911a-gate-pre.py --repo-root <wt> --base origin/main --head 9e24daf5 --branch gate/ctrl-verify-batch2
❌ 结论: block — 检测到 14 个写集外文件（夹带）
   任务: D821 | 分支: gate/ctrl-verify-batch2
   变更集: 15 个文件（merge-base 3643db6a）
   ⚠️  PR 正文不可用（--pr-body 未给且无 GITHUB_EVENT_PATH）—— 仅文件声明源生效   ← 修前：只在尾注
EXIT=1
修后版 gate（本次 blob 4a550437）:
$ python3 scripts/control-tower/merge_writeset_gate.py --repo-root <wt> --base origin/main --head 9e24daf5 --branch gate/ctrl-verify-batch2
✅ 结论: pass — 提交文件集 ⊆ 声明写集（无夹带）
   ⚠️ 豁免通道: 不可用 — PR 正文不可用（--pr-body 未给且无 GITHUB_EVENT_PATH）   ← 修后：结论块内
      修复指引: 改用声明文件内 `## 写集豁免`（S1 task-state / S2 dev doc / S3 brief 任一文件内该段落；不依赖 PR 正文）
   任务: D861 | 分支: gate/ctrl-verify-batch2
   变更集: 15 个文件（merge-base 3643db6a）
   声明写集 12 条（多源并集）
EXIT=0
```
附注（钉 sha 的必要性，队长实测）：本地分支名 `gate/ctrl-verify-batch2` 可能停在陈旧 sha（`4e263b01`，
`9e24daf5` 的祖先、非 merge）→ 只写分支名会得到 `pass/D861/EXIT=0` 的**假绿**。故本卡证据一律写 `--head 9e24daf5`。

### D4 先红后绿（同一夹具，`SYNO_D708_GATE` 注入缝换 gate 二进制；断言一字不改）
```
$ SYNO_D708_GATE=/tmp/d911a-gate-pre.py bash tests/control-tower/merge_writeset_gate.test.sh
=== D911-A1: D# 取号不得越界（并入的 main 历史不提供 D#）===
  ❌ ⑬ A1 期望 exit 0，实得 1 :: ❌ 结论: block — 检测到 1 个写集外文件（夹带）
  ❌ ⑬ A1 未取到分支自身号:    任务: D811 | 分支: feature/no-did-a1        ← 修前取到并入 main 的 D811
  ❌ ⑬ A1 仍取到并入 main 的 D811（越界取号）
  ❌ ⑭ A1 期望 exit 0，实得 1 :: ❌ 结论: block — 检测到 1 个写集外文件（夹带）
  ❌ ⑭ A1 未走文档范围降级 / ❌ ⑭ A1 仍取到并入 main 的 D811（猜号）
  ❌ ⑭ A1 --json task_id=D811（期望 NULL）
=== D911-A2: 声明源从被检查的 head 树读（不读本地工作树）===
  ❌ ⑮ A2 期望 exit 0，实得 2 :: ⚠️ 结论: degraded — 无任何写集声明（…三源皆空）且变更含源码文件 → fail-closed 阻断
  ❌ ⑮ A2 未取到 head 树里的 brief 声明 / ❌ ⑮ A2 sources.brief 异常: None
  ❌ ⑯ A2 期望 exit 2，实得 0（本地工作树被当成声明源 = 假绿）          ← 修前：未提交的本地文件也当声明
=== D911-A3: 豁免通道不可用 = 结论字段 + 替代路径 ===
  ❌ ⑰ A3 结论块内无豁免通道字段（只在尾注）: '   任务: D849 | 分支: fix/D849-a3'
  ❌ ⑰ A3 缺替代路径指引 / ❌ ⑰ A3 ③ 指引未指向声明文件
  ❌ ⑰ A3 --json exempt_channel=None（期望 unavailable）/ ❌ ⑰ A3 --json exempt_channel_fix 异常: None
=== D911 反例: 该拦的仍须拦 ===
  ✅ ⑲ 反例① 卡不存在 → 仍 exit 2    ✅ ⑳ 反例② 真夹带 → 仍 exit 1    ✅ ⑳ 反例② 撤掉夹带 → 回到 exit 0
  结果: 37 通过, 16 失败
EXIT=1
```

### D5 反例两条（两侧都拦）
```
$ SYNO_D708_GATE=/tmp/d911a-gate-pre.py bash …   （红侧同为 ✅）
  ✅ ⑲ 反例① 卡不存在 → 仍 exit 2（无法判定）
  ✅ ⑲ 反例① 明示 fail-closed
  ✅ ⑲ 反例① --json status=degraded（不是 pass）
  ✅ ⑳ 反例② 真夹带 → 仍 exit 1 且逐文件点名
  ✅ ⑳ 反例② 撤掉夹带 → 回到 exit 0
```

### D6 全量回归（修后，既有 29 条 + 新增 27 条）
```
$ bash tests/control-tower/merge_writeset_gate.test.sh
  结果: 56 通过, 0 失败
EXIT=0
```

### 遗留清单（文件:行 + 为什么不改）
| # | 位置 | 现象 | 为什么不改 |
|---|---|---|---|
| L1 | `.github/workflows/ci.yml:102` | 只传 `--base/--head/--branch`，不传 `--pr-body` → PR 正文豁免在 CI 不可用 | 单写者（派单 §〇 硬边界）；本卡改为把该状态升级为结论字段 + 给不依赖 PR 正文的替代路径 |
| L2 | `scripts/control-tower/merge_writeset_gate.py` `_clean_entry` vs `brief_parser.parse_q2` | 同一份 Q2 文本两端口径不同（剥反引号/破折号规则不一致） | 属派单 §一 切片 C 的写集（`pre-commit-check.sh` + G12 口径统一），本卡不扩写集 |
| L3 | `task-state/D814.json` | 同根因旧卡（status=claimed，修法 `--first-parent`） | 归属卡主；本卡只做跨卡簿记声明（见 Q0b），不改其卡状态 |
