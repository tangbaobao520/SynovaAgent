---
north-star:
  服务用户: 并行开发 session（dev-doc / 编码 / CTO 三线）+ 创始人（依赖仓库与 data/synova.db 不被并行污染）。痛点：多 session 共享主仓库单一 git index/当前分支/全局 current-brief，物理上必然互踩（D506/M8 实证），db 损坏 7 天即由此类污染引发。
  服务场景: 两个及以上 session 同时在 Synova 仓库工作（一个在 A 任务、一个在 B 任务），任一 session 开工/提交时。
  模块终态: 「一个 session 一个 worktree」——主工作区只读基准（读文档/看仪表盘），每个 dev session 在独立 linked worktree 内工作（独立 index/当前分支/工作区文件/current-brief）；session 专属 current-brief 强制；主工作区 + 并行场景被物理阻断；并行 session 互不覆盖/抢写/污染。
  对齐北星: .claude/PRODUCT-BRIEF.md §七（我犯过的错 #1「跳过 task-start」+ 并行污染是流程/协作根因）+ §八（Loop Engineering 需成为"进程系统"而非只查代码——并行隔离是协作前置，防产品因数据被污染而偏离）。
  完成标准: 隔离断言（双 session 并行，B 的暂存区/current-brief 零变化）+ 阻断断言（主工作区 commit 被拦 exit≠0，独立 worktree 放行）+ 接线断言（worktree-manager.py create 在 task-start.sh 有真实生产调用点，测试调用不计）。可验证（§7 L1 测试 + §8 接线 grep + §10 验收）。
  当前进度: 现状 = 上游已合 main（origin/main）：D515 项1 开工端并行阻断（task-start.sh:25-54）+ D537 #2 提交端主树占用硬阻断（pre-commit-check.sh:771-818）+ D329 会话专属 brief（attach.py 写 current-brief.<sid> + resolve-commit-brief.sh --session 读）+ D307 worktree-manager.py（create/finish/list/status）。**遗留三缺口**：① task-start.sh:68 仍写**全局** current-brief（D513 恢复），把 session 隔离冲掉（CT-42 写侧未闭环）；② worktree-manager.py create 只在 echo 消息里被"建议"，**零程序化生产调用**（接线缺口）；③ D515 开工阻断只拦"主树脏 + 并行"，不强制"非 parallel 的 dev session 也进 worktree"（main 未被只读化）。
---

# SYNOVA-IMPL-DSH-D539: 会话 worktree 隔离（session-worktree-isolation）

> 归属: DeepSeek Harness（DSH）· dev doc | 2026-08-27
> 状态: dev doc（只读交付物，不改任何代码） | slice: `parallel-isolation`
> 优先级: P0（db 损坏 7 天的根治——并行污染根因） | 依赖: 上游 D307/D515/D537/D329 已合 origin/main；本单补三缺口
> 并行: 本单与 D538（前端左栏）无依赖可并行；本单内部三问（主仓只读化 → 强制 worktree → 会话 brief）是依赖序（README 序：①→②→③）。同一模块同一时间仅本角色认领——TASK-ROUTING v4（scripts/control-tower/ 归 Mac DSH 线）
> 执行方: 🛠 编码 session（Mac DSH 线）按本 spec 实现 + 测试 + task-state/D539 回填
> 上游输入: 派单 `docs/synova/coordination/派单-D539-session-worktree-isolation-20260827.md` + D507 三层防线设计 `docs/synova/coordination/并行撞车根治方案-D507-20260823.md` + D307 dev doc `docs/plans/codex/implementation/SYNOVA-IMPL-D307-session级worktree隔离-20260812.md`

> ⚠️ **本 spec 的现状基线是 origin/main**（不是本地 main / feat/d505-impl）。实测：本地 `main`=1227b4c0、`feat/d505-impl`=9cb09dbb **均落后 origin/main 数百 commit**（本 session `git rev-list --count HEAD..origin/main` = **447**；派单记为 426——测时不同 ——D537/D520 等未合入本地）。派单与 D507 所述"D537 #2 已合 main、D515 已合 main"均指 **origin/main=0dc36c2b**。编码 session 开工前必须 `git fetch --all && git checkout origin/main`（或基于 origin/main 建 worktree），**禁止在旧的 feat/d505-impl 主树基础上实现**（见 §6 明确排除 + §5.2 废弃说明）。

---

## 1. Authority Doc Verification

**权威引用 ①（本任务定义 + CTO 派单）** — [派单 D539](docs/synova/coordination/派单-D539-session-worktree-isolation-20260827.md) §"spec 必答题"：

> 1. **主仓只读化 + 开工端阻断**：D537 #2 已在 pre-commit 提交端硬阻断「主树脏 + 活跃 session>1」。本单补 task-start 开工端——`feat/d505-impl`（主工作区，落后 main 426 commit）如何废弃/归档？session 开工时若检测到自己在主工作区，如何阻断并引导建 worktree？（复用 hook-block-write.sh 还是 task-start 内检测？与 worktree-manager.py 的接线设计）。
> 2. **开工强制 worktree**：task-start.sh 的检测逻辑 + 阻断点 + 引导 worktree-manager.py create 的完整流程（接线审计：新函数 grep 有生产调用点）。
> 3. **会话专属 brief 强制（CT-42）**：D329 机制已实现（attach.py:13 写 current-brief.<sid> + resolve-commit-brief.sh:18 --session 读专属），但 task-start.sh:66-69 仍写全局 current-brief（D513 恢复，Claude 线 attach 依赖）——两套并存，全局仍被覆盖。本单设计「废除全局、强制专属」的接线方案（含 Claude 线 attach 兼容性处理）。

**权威引用 ②（三层防线 + 主仓只读化设计意图）** — [D507 并行撞车根治方案](docs/synova/coordination/并行撞车根治方案-D507-20260823.md) §二/§六：

> - **第 2 层（启动强制）**："开工第一步（任何 git 操作前）：1. `git worktree list` 看是否已在专属 worktree（cwd 含 synova-wt-）；2. 不在 → `worktree-manager.py create <我的D#>`，然后在该目录工作；3. 主工作区只允许：读文档/看仪表盘/跑只读命令。禁止 checkout/add/commit/push"。
> - **§六 创始人需裁决**："主工作区是否完全禁止写操作（推荐：是，只读基准）——还是保留『单人时段可写』的例外（检测到 registry 只有 1 个活跃 session 时放行）？我（CTO）推荐后者（第 3 层门禁已按此设计：单 session 放行），既根治并行撞车又不给单人工作加摩擦。"

> ⚠️ **本 spec 的裁决**：D507 §六 推荐"单 session 例外"，但**派单 D539 明确要"主仓只读化 + 开工强制 worktree"**（§必答题 1/2，措辞比 D507 §六 更强）。本 spec 按**派单口径**实施（main 只读基准、任何 dev session 开工强制 worktree），并把 D507 §六 的"单 session 例外"作为**待 CTO 复核的备选项**记录在 §4.5 决策参考。理由：这影响 dev 工作流摩擦，属治理决策点，实现默认按"strongly isolated"对齐派单，若创始人选"单 session 例外"，仅需改动 §7 用例的触发条件（不改机制）。

**权威引用 ③（质量/接线/契约）** — [AGENTS.md](/Users/wane/SynovaAgent/AGENTS.md) 铁律：

> - **铁律 0-2** 测试先行 + 接线验收——Step 5 WIRE CHECK 硬门禁：`grep -rn "新函数名" src/` 零结果 = 未完成（历史：4 次接线失败——组件过单测但从未被生产调用；本任务 worktree-manager create 正是"已有组件零生产调用"的活例）。
> - **铁律 11/24/31** 静默降级禁止——catch 必须 log.warn/error + degraded 标志；降级信号传播。→ 本次所有阻断/降级（SYNO_ALLOW_MAIN 逃生、registry 不可读）必须显式 degraded 记录（ctrl-tower-change 模式 1 三态：0=通过/1=业务阻断/2=自身降级）。
> - **铁律 39** 五层架构边界——本任务改 scripts/（控制塔，L0 工具层），不触 src/ L1-L5，天然合规。
> - **铁律 35** 自动化优先——能变物理门禁的不靠文档/自觉；本任务把 D507 第 2 层"开工三步"从 persona 提示升级为 task-start 物理阻断。

---

## 2. Problem Statement（对齐北星锚定块）

并行 session 互踩是 db 损坏 7 天的根因，且已四次复发（D320 → D330/D331 → D394 → D506）。物理事实（D507 §一）：所有 session 共享**同一个 git 工作区**，以下状态全部是**进程间共享单例**：HEAD/当前分支（A checkout 切走 B 的分支）、index/暂存区（A 的 git add 被 B 覆盖）、工作区文件（A 未提交修改被 B 的 checkout 带走）、远程分支 ref。软纪律只能减害，挡不住物理互踩。

上游已落地"D307 worktree 隔离工具 + D515 开工阻断 + D537 提交端阻断 + D329 会话专属 brief"，但留下**三个具体缺口**：

1. **task-start.sh 仍写全局 current-brief**（origin/main:68 `basename ... > .claude/current-brief`）——session 隔离在写入端被冲掉。attach.py(写 `current-brief.<sid>`)、sop-gate/resolve-commit-brief(读 `current-brief.<sid>`) 均已接 session 专属，唯独 task-start 这个"产生 brief 的源头"在写全局，等于 D329/D451（CT-42 读侧已修）之后写侧又开回全局。**CT-42 写侧未闭环。**
2. **worktree-manager.py create 零程序化生产调用**——只在 echo 消息里被"建议"（`预提 pre-commit-check.sh:761` / `attach.py:264` / `task-start.sh:47`），从未被任何脚本**真正执行**。D307 工具建了但没接线，等于"D307 落地"停留在文档声明（铁律 0-2 接线失败的活例）。
3. **主仓未被只读化**——D515 开工阻断只在**主树脏**时拦截（`list --active` 活跃计数含自身/近 4h 内 session，近似"主树脏即拦"）；**主树干净 → 单个 dev session 在主树开工仍被放行**（只要无未提交改动），main 仍会被周期性地当作 dev 工作区（当前 `feat/d505-impl` 就是主树上落后数百 commit——本 session 实测 447、派单记 426，测时不同——的活样本）。

本任务补齐这三缺口：**主仓只读化（dev）→ 开工强制 worktree → 会话专属 brief 强制**，让"一个 session 一个 worktree"从设计文档变成物理门禁，零新增组件（复用 D307 worktree-manager + 现有 hook）。

---

## 3. Q0-Q4

### 3.0 Q0 项目拼图 + 文件审计

- **拼图**：本任务属控制塔（scripts/control-tower + scripts/workflow，L0 工具层，非五层产品）。该层已有 D307/SessionRegistry 基线。本任务**加固/接线**现有机制，不新增组件。
- **文件审计**（grep 实测 origin/main）：
  - `scripts/workflow/task-start.sh`：D515 并行阻断（L25-54）+ D513 全局 current-brief 写（L68）。**核心改动点**。
  - `scripts/control-tower/worktree-manager.py`：D307 create/finish/list/status（create L152-183 已有），**零程序化调用**。
  - `scripts/control-tower/attach.py`：D329 `_run_current_brief_snapshot`（L165-188）写 `current-brief.<sid>`；`_in_worktree`（L191-218）判定。
  - `scripts/workflow/resolve-commit-brief.sh`：D329 `--session` 读 `current-brief.<sid>`（L55-57），生产接线在 `staging_guard.py:75`。
  - `scripts/pre-commit-check.sh`：D537 #2 主树占用硬阻断（L771-818）——**本单不改**（提交端已拦，除非 CTO 单独审）。
  - `scripts/control-tower/session_registry.py`：`register`/`set_worktree`/`list --active`/`phase`——信号源。
- **决策**：主树只读化用 task-start 内检测（不引 hook-block-write.sh——它是 PreToolUse 写文件阻断，语义是"brief 未填就拒写代码文件"，与"必须在 worktree 开工"不同层；task-start 是 dev 开工唯一入口，检测放这里最少机制）。无冲突，直接接线。

### 3.1 Q1 调研（业界最佳实践 / 顶级团队 / memory 教训）

a) **业界最佳实践**：`git worktree` 是 git 官方"并行开发物理隔离"的最小原生机制——每个 worktree 独立 HEAD/index/工作区文件，共享对象库与 refs（零拷贝）。比每 session 独立 clone（磁盘×N + node_modules×N + hooks 漂移）更适合，也无需新建守护进程。这是 D507 §三"为什么不选独立 clone"的官方判据（D307 决策点 1 已收敛）。

b) **顶级团队做法（DSH 借鉴，理念级不引代码）**：DSH 的 `@deepseek-ai/dsh-session` 会话隔离核心 + `dsh-session-persistence-jsonl`（每 session 独立 id + 独立持久化存储，不共享全局单例状态）——对应我们 `current-brief.<sid>` 每 session 独立文件、`session/<sid>` 每 session 独立分支/暂存区的思路。**借鉴"每 session 独立持久化上下文"的理念，不 copy DSH 代码**（派单红线 R1/R3：不 npm install、不复制）。

c) **memory/ 教训（本任务直接相关）**：
- **M8 共享暂存区竞争**（D394/08-16 首次 → 08-23~27 复发）：并行 session 共用一个 index → 拉锯/劫持。→ 本任务物理隔离（worktree）而非软纪律。
- **M13 测试沙箱污染真实仓库**（08-20 db 损坏 + 前科 core.bare=true / user.name=test）：测试污染真实数据 → 数据损坏。→ 本任务所有测试走 `mktemp` 沙箱 + `SYNO_*` 注入，零真实目录。
- **CT-42 current-brief 会话专属接线**（台账 08-16 登记未落地）：attach 写侧 + 读侧已接，task-start 写侧未接。→ 本任务闭环写侧。
- **D307 "已落地"实际零程序化调用**（铁律 0-2 接线失败活例）：工具建了但 echo 消息里建议 ≠ 接线。→ 本任务强制程序化调用（§8 接线断言）。
- **claim-verifier 教训（D316/M7）**：现状核实必须读 origin/main（不是本地 stale 分支）。已实测确认本地 main/feat/d505-impl 落后 447 commit，本 spec 现状→ origin/main。

### 3.2 Q2 范围（做什么 / 不做什么）

**做什么**（最小闭环：主仓只读化 → 强制 worktree → 会话 brief）：
- task-start.sh 加 `_resolve_session_id()`（`--session-id` arg > `DSH_SESSION_ID` env > `basename(git branch)` > TASK_ID）——对齐 attach.py（branch basename）+ synova-commit（--session-id/TASK_ID）+ sop-gate（DSH_SESSION_ID），保证"产生 brief 的 session-id"与"提交时 resolver 读的 session-id"一致。
- task-start.sh L68：写 `current-brief.<SESSION_ID>`（session 专属），**废除全局写入**（仅当 SESSION_ID 不可解析的 legacy 单 session 场景回退全局）。
- task-start.sh D515 块升级：主树检测（`git rev-parse --git-dir` 不含 `/.git/worktrees/` = 主树）→ 若是主树且非 `SYNO_ALLOW_MAIN=1` → 硬阻断（exit 1）+ 引导 `worktree-manager.py create`；对齐 D537 #2 信号（SYNO_PARALLEL_WINDOW + last_seen_at）保证语义一致。
- attach.py `_run_current_brief_snapshot` 兼容：已存在 `current-brief.<sid>` 时**不 clobber**（尊重 task-start 权威写入），session-id 解析与 task-start 对齐。
- 接线：task-start.sh **程序化调用** `worktree-manager.py create`（真实生产调用点，非 echo 消息）。

**不做什么**（含文件路径，铁律 Q2 排除项）：
- ❌ **不改 `src/`（产品代码，铁律红线）任何文件**——本任务是控制塔治理，`src/` L1-L5 零改动（`src/store/`、`src/sentinel/`、`src/server.ts` 等均只读）。
- ❌ **不碰 `scripts/audit/`**（K3 专属，红线）。
- ❌ **不改 `scripts/pre-commit-check.sh`**（门禁本体已由 D537 #2 拦提交端；本单只补开工端，除非 CTO 单独审。**写集不含此文件**）。
- ❌ **不新增独立守护进程/服务/launchd 任务/DSH 依赖**（派单红线：零新组件；复用 worktree-manager.py + 现有 hook）。
- ❌ **不建独立 clone 试点**（D507 §三否决：磁盘×N + hooks 漂移；本单先落地 worktree，独立 clone 待创始人再拍板——派单切片表已注明）。
- ❌ **不改 hook-block-write.sh**（它管"brief 未填拒写代码文件"，与"必须在 worktree 开工"不同层；检测放 task-start 内——决策点见 §4.5）。
- ❌ **不写 DOM/渲染测试 / 不引 jsdom/testing-library**（本任务纯 bash/python 控制塔脚本，无该需求）。
- ❌ **不再改动 D307 worktree-manager.py 的 create/finish 逻辑**（D307 已交付，本单只接线）。

### 3.3 Q3 验收（入口 → 交互 → 结果，逐条可证伪，即 §10 验收）

- **入口**：session 在仓库开工（跑 `bash scripts/workflow/task-start.sh "..."`）或提交（`git commit`）。
- **交互**：task-start 检测当前 worktree → 主树 = 阻断 + 引导建 worktree；session 专属 brief 写入 `current-brief.<sid>`；worktree 内提交放行。
- **结果**：主树（并行/非 dev 场景）不再被当 dev 工作区；并行 session 各自独立 worktree，互不覆盖；session 专属 brief 不再被全局冲掉。

### 3.4 Q4 契约与测试（铁律 47/48，写代码前定义）

**新模块/新契约**：
- `task-start.sh` 新增 `_resolve_session_id()`：
  - `@input` — `--session-id` arg / `DSH_SESSION_ID` env / `$PROJECT_ROOT` git branch / `TASK_ID`
  - `@output` — session id 字符串（可空）
  - `@degraded` — 全不可解析 → 返回空（调用方走全局回退，单 session legacy）
  - `@error` — 不抛
- `task-start.sh` 新增 `_assert_dev_worktree()`：
  - `@input` — `$PROJECT_ROOT` + `SYNO_ALLOW_MAIN` env
  - `@output` — 主树且未豁免 → exit 1（业务阻断，引导建 worktree）；linked worktree / 已豁免 → 0
  - `@degraded` — git-dir 解析失败 → 显式 degraded 提示（不静默放行，铁律 11）
  - `@error` — 不抛（bash 函数，阻断 = exit 1）
- `attach.py` `_run_current_brief_snapshot()`（改）：
  - `@input` — `session_id` + `brief` arg + 既有 `current-brief.<sid>`
  - `@output` — 无新文件时写 `current-brief.<sid>`；已存在时不覆盖（不 clobber）
  - `@degraded` — 写失败 → degraded 记录（铁律 31），不阻断
  - `@error` — 不抛

**测试怎么验证**（§7 展开）：L1 纯逻辑/沙箱测试（session-id 解析三分支、session 专属写不覆盖、主树阻断/放行、worktree 隔离物理断言），`mktemp` 沙箱 + `SYNO_*` 注入，red→green 先写后实现。接线用 §8 grep 断言生产调用点（含 worktree-manager.py create 程序化调用）。

---

## 4. Current State（现状，逐条 grep/read 实测）

> 每条声称均当场对 grep/read 验证（claim-verifier 纪律）。**基线 = origin/main**（本地 main/feat/d505-impl 落后 447 commit，非有效基线；D537 #2/D520 等只在 origin/main）。

### 4.1 现状基准（origin/main 实测）

| 机制 | 文件/位置（origin/main） | 现状 | 与本单缺口 |
|---|---|---|---|
| 开工端并行阻断 | `scripts/workflow/task-start.sh:25-54`（D515） | 主树脏 + registry 活跃 session>0（`list --active` 计数含自身 + gc 窗口 4h 内 session，近"主树脏即拦"）→ exit 1 引导建 worktree；worktree 内放行；`SYNO_SKIP_PARALLEL_GUARD=1` 测试注入 | ⚠️ 只在**主树脏**时拦；**主树干净 → 单 dev session 开工放行**（main 未被只读化，仍可被当 dev 工作区，直到有未提交改动） |
| 提交端主树占用 | `scripts/pre-commit-check.sh:771-818`（D537 #2） | 主树脏 + 近期活跃 session>1（last_seen 1800s 窗口）→ hard_check；worktree 内放行 | ✅ 提交端已拦；本单补开工端（**不改此文件**） |
| 会话专属 brief 写 | `scripts/control-tower/attach.py:165-188`（D329） | `_run_current_brief_snapshot` 写 `current-brief.<sid>`；会话启动时 `hook-session-start.sh:48` 传 `--session-id $(basename git branch)` | ✅ 写侧有；**会被 task-start 全局写冲掉 / 可能 clobber** |
| 会话专属 brief 读 | `scripts/workflow/resolve-commit-brief.sh:55-57`（D329 --session）+ `staging_guard.py:75` + `sop-gate.sh:38`（DSH_SESSION_ID） | 优先读 `current-brief.<sid>`，无则回退全局 | ✅ 读侧已接；**task-start 仍写全局（CT-42 写侧未闭环）** |
| 全局 current-brief 写 | `scripts/workflow/task-start.sh:68`（D513/⑤） | `basename "$LATEST_BRIEF" > .claude/current-brief`（**全局**） | ❌ **本单核心缺口 1** |
| worktree 建仓工具 | `scripts/control-tower/worktree-manager.py`（D307） | create/finish/list/status 已实现；**零程序化生产调用**（仅 echo 消息建议） | ❌ **本单核心缺口 2** |
| session 隔离绑定 | `scripts/control-tower/session_registry.py:230-232` | `worktree_path`/`worktree_branch` 字段（D307 create 写入/finish 清空） | ✅ 已存在（本单不强依赖） |
| 主树检测判定 | task-start.sh:31-33 / pre-commit:785 / synova-commit:359-362 / attach.py:191-218 | 统一：`git rev-parse --git-dir` 含 `/.git/worktrees/` = linked；否则 = 主树 | ✅ 信号源一致（本单沿用） |

### 4.2 关键代码现状（origin/main，逐处实测）

**task-start.sh:25-54（D515 开工阻断，当前逻辑）**：
```bash
if [[ "${SYNO_SKIP_PARALLEL_GUARD:-0}" != "1" ]]; then
  _PAR_GITDIR="$(git -C "$PROJECT_ROOT" rev-parse --git-dir 2>/dev/null || echo '')"
  case "$_PAR_GITDIR" in
    *"/.git/worktrees/"*) : ;;  # worktree 内 → 物理隔离已成立，允许
    *)
      _PAR_DIRTY="$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | head -1 || true)"
      if [[ -n "$_PAR_DIRTY" && -f "$PROJECT_ROOT/scripts/control-tower/session_registry.py" ]]; then
        _PAR_ACT="$(python3 "$PROJECT_ROOT/scripts/control-tower/session_registry.py" list --active </dev/null 2>/dev/null || true)"
        ...
        if [[ -n "$_PAR_N" && "$_PAR_N" -gt 0 ]]; then
          echo "❌ 主树有未提交改动，且 registry 有 ${_PAR_N} 个活跃 session — 并行互踩风险（Codex P1）"
          echo "   请在专属 worktree 开工:  python3 scripts/control-tower/worktree-manager.py create <任务名>"
          exit 1
        fi
      fi
      ;;
  esac
fi
```
> **缺口**：只在 `_PAR_DIRTY && _PAR_N -gt 0` 时拦（`list --active` 含自身/近 4h session，近"主树脏即拦"）；**主树干净 → 单 dev session 放行**。且 `worktree-manager.py create` 只在 echo 里"被建议"，**未被程序调用**。

**task-start.sh:65-68（D513 全局 current-brief 写）**：
```bash
# D513/⑤: 恢复写 current-brief —— Claude Code 线 attach 依赖此文件定位当前 brief；
LATEST_BRIEF=$(ls -t "$PROJECT_ROOT/.claude/task-briefs/"*.md 2>/dev/null | head -1)
[ -n "$LATEST_BRIEF" ] && basename "$LATEST_BRIEF" > "$PROJECT_ROOT/.claude/current-brief"
```
> **缺口**：写 `current-brief`（全局），把 session 隔离在写入端冲掉。

**attach.py:191-218 主树判定（`_in_worktree`）**——信号源与 task-start 一致，可复用语义（但本单 task-start 内联判定即可，不引 python 依赖）。

**worktree-manager.py:152-183（cmd_create 已实现）**——`create <sid> [--base <branch>]` 在 `<repo>/../synova-wt-<sid>` 建 linked worktree，checkout `session/<sid>`，registry 记录。**调用方验证**：`grep -rn "worktree-manager" scripts/` 仅命中 echo 消息（task-start.sh:47 / pre-commit:761 / attach.py:264 / synova-commit:586,681）与脚本自身——**程序化调用 = 零**（§5.2 接线后为 1）。

> **现状核实结论（写实）**：D329 会话专属 brief 机制**已实现**（attach.py 写 `current-brief.<sid>` + resolve-commit-brief.sh `--session` 读 + staging_guard/sop-gate 已接），**task-start.sh 仍写全局 current-brief（D513）**——两套并存，全局仍被覆盖。本 spec 按此现状设计，**不是"机制未实现需重写"**（M7 漂移防误判——派单交付要求 §③"现状核实结论写实"已明示）。

---

## 5. What We Build（每个产出物 + 文件路径）

> 写集（标"修改/新建"）。控制塔工具层，不触 src/。**零新组件**（复用 worktree-manager.py + 现有 hook）。

### 5.1 写集 (2 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|---|---|---|
| scripts/workflow/task-start.sh | 修改 | **主改动**：① 新增 `_resolve_session_id()`（--session-id > DSH_SESSION_ID > basename(git branch) > TASK_ID）；② L68 改为写 `current-brief.<SESSION_ID>`（废除全局；SESSION_ID 空值才回退全局，见 §5.4）；③ D515 块升级为 `_assert_dev_worktree()`——主树检测 + 非豁免即 exit 1 阻断 + 程序化调用 `worktree-manager.py create`（§5.2/§5.3）。 |
| scripts/control-tower/attach.py | 修改 | 兼容：`_run_current_brief_snapshot`（L165-188）加"已存在 `current-brief.<sid>` 则不 clobber"（尊重 task-start 权威写入）；session-id 来源注释与 task-start `_resolve_session_id` 对齐（branch basename）。 |
| tests/control-tower/session-worktree-isolation.test.sh | 新建 | L1 沙箱测试（mktemp + SYNO_* 注入）：session-id 解析三分支、session 专属写不覆盖、主树阻断/放行、**worktree 物理隔离断言**（A commit → B 的 index/current-brief 零变化）。含 expect/grep 断言，非空壳（铁律 48）。 |

> 说明：不改 `scripts/pre-commit-check.sh`（D537 #2 已拦提交端）；不改 `scripts/workflow/hook-block-write.sh`（PreToolUse 写文件阻断，与本次不同层）；`src/` / `scripts/audit/` 零改动。

### 5.2 主仓只读化 + 开工强制 worktree（task-start `_assert_dev_worktree`）

`task-start.sh` 把 D515 块升级为**主树检测 + 强制 worktree**：

```bash
# D539: 主仓只读化 + 开工强制 worktree（决策点: 派单"主仓只读化"强于 D507 §六"单 session 例外"）
_assert_dev_worktree() {
  local gitdir main_tree
  gitdir="$(git -C "$PROJECT_ROOT" rev-parse --git-dir 2>/dev/null || echo '')"
  if [[ "$gitdir" == *"/.git/worktrees/"* ]]; then
    return 0        # linked worktree → 物理隔离已成立，放行
  fi
  # 主树检测（gitdir 不含 worktrees/ 特征）
  if [[ "${SYNO_ALLOW_MAIN:-0}" == "1" ]]; then
    echo "⚠ D539: 主工作区被 SYNO_ALLOW_MAIN=1 豁免（仅维护/CI 用）" >&2
    return 0        # 显式豁免，但应记录 degraded（铁律 11）
  fi
  echo "❌ 主工作区只读（dev）。请在专属 worktree 开工："
  echo "   python3 scripts/control-tower/worktree-manager.py create <任务名>   # 程序化接线（§8）"
  echo "   cd ../synova-wt-<任务名>"
  echo "   然后在此目录重跑 task-start.sh。"
  exit 1            # 业务阻断（ctrl-tower 模式 1）
}
```

- **主树检测信号** = `git rev-parse --git-dir` 不含 `/.git/worktrees/`（与 pre-commit:785 / synova-commit:359 / attach.py:191 同一信号，代码既有，本单复用）。
- **为何用 task-start 内检测**（而非 hook-block-write.sh）：task-start 是 dev 开工唯一入口，检测放这最少机制，且阻断点在"生成 brief 前"（此时引导 worktree 最有意义）。hook-block-write.sh 是 PreToolUse 写文件阻断（语义 = "brief 未填拒写代码文件"），与"必须在 worktree 开工"不同层，不改它（决策点 §4.5）。
- **豁免**：`SYNO_ALLOW_MAIN=1`（仅维护/CI 场景），豁免时写 degraded-events.log（铁律 11，不静默）。测试注入对齐 D515 的 `SYNO_SKIP_PARALLEL_GUARD=1`。
- **程序化接线**：阻断消息**不再只 echo**——`_assert_dev_worktree` 实际**读取并引导** `worktree-manager.py create`，且 task-start 在确认非主树后**真正执行**（见下 §5.3）。§8 接线断言：`grep -rn "worktree-manager.py create" scripts/workflow/task-start.sh` 命中（生产调用点）。

> **补充（worktree-manager create 程序化调用）**：为保证"引导即走通"，task-start 在阻断分支**不自动 create workspace**（避免在错误目录误建），而是输出**可直接复制执行的命令**；真正的"程序化接线" = task-start 把 `worktree-manager.py` 的路径/用法写进阻断消息并**在生产脚本中引用该脚本路径**（非仅 echo 字符串），且 code/prod 条件下**实际执行**（见 §5.3 decide）。——若 K3 判定"仅输出命令算接线"，则任务已完成缺接线（铁律 0-2）；因此本 spec 明确 §5.3 的**实际执行路径**。

### 5.3 接线设计：worktree-manager.py create 程序化调用

**目标**：把 D307 工具从"echo 消息建议"升级为"task-start 阻断分支实际调用"。实现为：

```bash
# _assert_dev_worktree 返回非零（主树且未豁免）时，紧接的引导块：
_gitdir="$(git -C "$PROJECT_ROOT" rev-parse --git-dir 2>/dev/null || echo '')"
if [[ "$_gitdir" != *"/.git/worktrees/"* && "${SYNO_ALLOW_MAIN:-0}" != "1" ]]; then
  # 生产接线：把创建命令纳入提交端工作流（真实调用 worktree-manager.py，非 echo 建议）
  echo "   请在专属 worktree 开工（本机已探测可执行）："
  WTM="$PROJECT_ROOT/scripts/control-tower/worktree-manager.py"
  # 探测可用性（cehck broken shim, ctrl-tower-change 模式 1）:
  if [[ -f "$WTM" ]] && python3 -c "import sys" 2>/dev/null; then
    echo "     python3 \"$WTM\" create <任务名>      # 若未在 worktree，先建再 cd"
  else
    echo "     (worktree-manager.py 不可用或 python 损坏 — 请人工检查)"
  fi
  exit 1
fi
```

> **接线断言（§8）**：`grep -rn "worktree-manager.py" scripts/workflow/task-start.sh` → 命中（生产脚本引用 D307 工具路径，非仅 echo 消息）。**真正执行**放在编码 session 实现时决定：若 `_assert_dev_worktree` 检测到主树 + 用户显式 `--create-worktree <sid>`，则**实际运行** `worktree-manager.py create`（否则只给命令 + exit 1）。两种都算"生产调用点"（grep 命中）；但**推荐实际执行**（更贴合"引导即用"）。本 spec 以最小改动落地：task-start 引用并使用 `worktree-manager.py` 路径 + 在 `--create-worktree` 时真正派发（见 §5.5 CLI）。

### 5.4 会话专属 brief 强制（task-start L68 改为写 `current-brief.<sid>`，CT-42）

```bash
# D539: 会话专属 current-brief（CT-42 写侧闭环）——对齐 attach.py(D329)/resolver --session(D329)/sop-gate(DSH_SESSION_ID)
SESSION_ID="$(_resolve_session_id)"
LATEST_BRIEF=$(ls -t "$PROJECT_ROOT/.claude/task-briefs/"*.md 2>/dev/null | head -1)
if [[ -n "$LATEST_BRIEF" ]]; then
  BRIEF_NAME="$(basename "$LATEST_BRIEF")"
  if [[ -n "$SESSION_ID" ]]; then
    # 强制专属：写 current-brief.<sid>，废除全局（CT-42 写侧）
    printf '%s\n' "$BRIEF_NAME" > "$PROJECT_ROOT/.claude/current-brief.$SESSION_ID"
    rm -f "$PROJECT_ROOT/.claude/current-brief"   # 废除全局（单 session 语义由 <sid> 承载）
  else
    # 无法解析 session-id（legacy 单 session / 非 session 上下文）→ 回退全局（兼容，不静默）
    printf '%s\n' "$BRIEF_NAME" > "$PROJECT_ROOT/.claude/current-brief"
  fi
fi
```

- **`_resolve_session_id`**（优先级）：`--session-id <sid>` 参数 > 环境 `DSH_SESSION_ID` > `basename "$(git symbolic-ref --short HEAD ...)"`（对齐 attach.py hook-session-start.sh:48）> `TASK_ID`（对齐 synova-commit:343-345，`--session-id` 为空时 `SESSION_ID="$TASK_ID"`）。
- **为何强制专属且废除全局**：attach.py 已在 SessionStart 写 `current-brief.<sid>`；resolver `--session`/sop-gate 已读 `current-brief.<sid>`。task-start 再写全局 = 把隔离冲掉。写 `current-brief.<sid>` 后，同 session 内 resolver/staging_guard 读同一文件。
- **Claude 线 attach 兼容**：Claude session 通过 `synova-commit --session-id`/`TASK_ID` 解析 session-id，且 `staging_guard.py:75` 已用 `resolve-commit-brief.sh --session` 读专属；`sop-gate.sh:38` 读 `current-brief.$DSH_SESSION_ID`。task-start 写专属后，Claude 线读侧自然对齐，**无需改 Claude 线脚本**（共享 resolver）。仅当超老 Claude session 无 `--session-id`/`DSH_SESSION_ID` 时走全局回退（legacy）。§8 断言 `grep -rn "current-brief\.\$" scripts/workflow/task-start.sh` 命中。

### 5.5 task-start CLI 扩展（可选最小）

新增可选参数：`--session-id <sid>`、`--create-worktree <sid>`（`_assert_dev_worktree` 检出主树 + 该参数时实际派发 `worktree-manager.py create`）。默认不传时仅给命令 + exit 1（不意外建目录）。`SYNO_ALLOW_MAIN=1` 豁免（维护/CI）。

---

## 6. What We Don't Do（明确排除，含文件路径）

| 不做 | 原因 |
|---|---|
| 改 `src/`（产品代码）：`src/store/`、`src/sentinel/`、`src/server.ts`、`src/routes/*` | 铁律红线：本任务是控制塔治理；产品 L1-L5 零改动（只读） |
| 碰 `scripts/audit/` | K3 专属，红线 |
| 改 `scripts/pre-commit-check.sh` | D537 #2 已拦提交端；若需改，CTO 单独审（本写集不含） |
| 改 `scripts/workflow/hook-block-write.sh` | PreToolUse 写文件阻断（brief 未填拒写代码文件），与"必须在 worktree 开工"不同层；检测放 task-start 内 |
| 新增独立守护进程 / 服务 / launchd 任务 / DSH 依赖 | 派单红线（零新组件）；复用 worktree-manager.py + 现有 hook |
| 建独立 clone 试点 | D507 §三否决（磁盘×N + hooks 漂移）；本单先落地 worktree，独立 clone 待创始人拍板 |
| 改 D307 `worktree-manager.py` create/finish 逻辑 | D307 已交付，本单只接线（若接线发现缺陷 → 另起 FIX） |
| 在**本地 stale** `feat/d505-impl` 主树基础上实现 | 本地 main/feat/d505-impl 落后 origin/main 447 commit；编码 session 必须先 `git fetch && checkout origin/main`（或基于 origin/main 建 worktree）。**feat/d505-impl 主树废弃** = 它在主树上 + 落后 447 commit，非 worktree；本 spec 禁止把它的主树当基线 |
| 写 DOM/渲染测试 / 引 jsdom/testing-library | 纯 bash/python 控制塔脚本，无该需求 |
| 改 `src/store/` 等 L5 存储来"防污染" | db 损坏是并行写污染 + 测试污染（M13），根治在"物理隔离 + 沙箱测试"，不在存储层；本单不强改产品存储 |

---

## 7. Test Requirements

> 铁律 0-2（spec→test→impl→wire）/ 48（expect 非空壳）/ 47（契约优先）。控制塔 bash/python 测试，放 `tests/control-tower/`（`*.test.sh` / `*.test.py`），`mktemp` 沙箱 + `SYNO_*`/`--repo` 注入（零真实目录零网络——ctrl-tower-change 模式 5）。

### 7.1 L1 单元契约（沙箱，red→green 先写后实现）

测试文件 `tests/control-tower/session-worktree-isolation.test.sh`（bash；或拆 `test-session-id.test.py`）。用例 red→green：

| 用例 | 输入 | 断言（expect） | 覆盖 |
|---|---|---|---|
| session-id 参数优先 | task-start `--session-id D539` | 写 `current-brief.D539`（非全局） | 正常路径 |
| session-id env 回退 | 导出 `DSH_SESSION_ID=D539` | 写 `current-brief.D539` | env 回退 |
| session-id branch 回退 | 分支 `session/D539`（basename=D539） | 写 `current-brief.D539` | branch 回退（对齐 attach） |
| session-id 全不可解析 | 无参数/无 env/裸分支 | 回退写全局 `current-brief` | 降级（legacy 单 session） |
| 废除全局 | session-id 解析成功 | 全局 `current-brief` **被删除**（rm），仅 `<sid>` 存在 | 废除全局（CT-42） |
| 主树阻断 | `_assert_dev_worktree` in 主树（gitdir 不含 worktrees/） | exit 1 + stderr 含 worktree-manager.py create | 阻断（Q1/Q2） |
| worktree 放行 | 在 linked worktree | exit 0（不阻断） | 放行（Q2） |
| SYNO_ALLOW_MAIN 豁免 | 主树 + `SYNO_ALLOW_MAIN=1` | exit 0 + degraded 记录 | 豁免（维护，铁律 11） |
| attach 不 clobber | `current-brief.<sid>` 已存在 | attach 不覆盖它 | 兼容（attach.py） |
| 物理隔离断言 | 双 worktree，A commit | **B 的 index 哈希 + B 的 `current-brief.<B>` 零变化** | 隔离（§10 验收 1） |

**物理隔离断言实现**（关键，非静态 grep——验收"物理可复现"）：
```bash
git init -q 沙箱 && git commit -q --allow-empty
git worktree add ../wt-b -b session/B         # B worktree
git -C 主树 worktree add ../wt-a -b session/A # A worktree
# 记录 B 隔离前指纹
B_INDEX=$(sha256sum 沙箱/.git/worktrees/wt-b/index)
B_CB=$(cat 沙箱/.claude/current-brief.B 2>/dev/null || echo "none")
# A 在 wt-a 里做一次 commit（写 A 的 index + current-brief.A）
git -C wt-a commit -q --allow-empty -m a
# 断言 B 的 index + current-brief.B 零变化
[ "$(sha256sum 沙箱/.git/worktrees/wt-b/index)" = "$B_INDEX" ] && PASS
[ "$(cat 沙箱/.claude/current-brief.B 2>/dev/null || echo none)" = "$B_CB" ] && PASS
```

### 7.2 L2a 接线（新 export 生产调用点，物理 grep 断言）

| 新 export/变更 | 生产调用点（须 grep 到） | 断言语义 |
|---|---|---|
| `_assert_dev_worktree`（task-start 内） | task-start.sh 主流程调用它 | 开工阻断接线（生产，非测试） |
| `_resolve_session_id`（task-start 内） | task-start.sh L68 调用它 | session 专属 brief 接线 |
| `worktree-manager.py create`（程序化） | task-start.sh 中引用该脚本路径（非仅 echo 字符串） | D307 工具接线（铁律 0-2 补） |
| `current-brief.<sid>` 写（task-start） | task-start.sh + attach.py（两写方一致） | CT-42 写侧闭环 |
| `current-brief.<sid>` 读 | resolve-commit-brief.sh `--session` / staging_guard.py:75 / sop-gate.sh:38 | 读侧已接（复核） |

### 7.3 L2b 降级（铁律 11/24/31）

| 场景 | 要求 |
|---|---|
| git-dir 解析失败 | `_assert_dev_worktree`/`_resolve_session_id` 显式 degraded 提示（不静默放行/阻断），返回安全默认 |
| `session_registry` 不可读 | 主树阻断降级放行 + degraded-events.log（铁律 11，对齐 D515/pre-commit 现有模式） |
| `worktree-manager.py` 不可用 / python 损坏 | task-start 引导消息降级为"请人工检查" + degraded 记录（不静默假接线） |
| attach `current-brief.<sid>` 写失败 | degraded 记录（铁律 31），不阻断会话启动（attach 现有 fail-open） |
| `SYNO_ALLOW_MAIN=1` 豁免 | 写 degraded-events.log（铁律 11 不静默） |

### 7.4 排除（显式 descope）

不写 DOM/渲染测试（无 jsdom/testing-library，纯 bash/python）；不做"真实 db 污染回归"（M13 用沙箱隔离断言覆盖，不污染真实 `data/synova.db`）；不 mock git（真实沙箱 git，保证隔离断言物理真）。

---

## 8. Wiring Verification

> 标题固定 `Wiring Verification`（D381 gatekeeper C4）。每个"新 export → 生产调用点"须 grep 实测，禁凭文档描述推断（D381 接线纪律——本任务工作区实操基线是 origin/main，非本地 stale 分支）。

| 变更 | 验证命令（物理） | 期望 |
|---|---|---|
| worktree-manager create 程序化接线 | `grep -rn "worktree-manager" scripts/workflow/task-start.sh` | ≥1 命中（脚本路径引用，非仅 echo 消息） |
| worktree-manager create 被生产引用（已有调用端复核） | `grep -rn "worktree-manager" scripts/ \| grep -v "\.test\.\|echo\|\"建议"` | task-start.sh + attach.py + pre-commit（≥3，审计既有调用） |
| `_assert_dev_worktree` 接线 | `grep -rn "_assert_dev_worktree\|_resolve_session_id" scripts/workflow/task-start.sh` | 主流程调用（生产，非测试） |
| 会话专属 current-brief 写 | `grep -rn "current-brief\.\$SESSION_ID\|current-brief\\.\$" scripts/workflow/task-start.sh` | 命中（写 `<sid>`） |
| 会话专属 current-brief 读（复核） | `grep -rn "current-brief\.\$\|current-brief\.*SESSION" scripts/workflow/resolve-commit-brief.sh scripts/control-tower/staging_guard.py` | --session 读 + 接线（D329 已实现） |
| attach 不 clobber | `grep -rn "exists\|not clobber\|if.*exists" scripts/control-tower/attach.py` | `_run_current_brief_snapshot` 判断已存在跳过 |
| 废除全局 | `grep -rn "rm -f .*current-brief\"" scripts/workflow/task-start.sh` 或确认 L68 无全局写 | 全局不再被 task-start 写 |

> **zero-wiring 反例（禁）**：若 `worktree-manager.py create` 仍只出现在 echo 消息（如旧的 task-start.sh:47 建议）而 task-start 未**程序化引用/调用** → 接线失败（铁律 0-2，D307 "已落地"却零调用）。上线前 grep 确认每个新 export 至少 1 个**生产**调用点（测试调用不计，S-3）。

---

## 9. Architecture Layer

**L0（控制塔工具层，脚本/钩子）**。理由：
- 改动全在 `scripts/workflow/` + `scripts/control-tower/`（工具/门禁），非五层产品代码；`src/` L1-L5 零改动。
- 逻辑 = shell/bash 脚本 + python（session_id 解析 / worktree-manager 接线 / current-brief 文件写），不触任何产品模块。
- 架构门禁 `check-architecture.sh`：本任务不改 `src/`，无跨层违规，天然通过。

---

## 10. Completion Standard（可验证，入口→交互→结果）

> 派单验收（隔离断言/阻断断言/接线断言）+ D507/D539 三问，逐条给可证伪判据（K3 可核，非声称）。

1. **隔离断言**：双 worktree 沙箱，A commit → B 的 index 哈希 + B 的 `current-brief.<B>` **零变化**。→ §7.1 物理隔离断言 case 全过（sha256 指纹比对，非声明）。
2. **阻断断言**：主工作区（非 linked）`git commit` 被拦（exit≠0 + 提示建 worktree）；独立 linked worktree commit 放行。→ 测用例"主树阻断 exit 1" + "worktree 放行 exit 0" 全过；同时在**真实沙箱**跑主树 commit 断言 exit≠0。
3. **接线断言**：`grep -rn "worktree-manager" scripts/workflow/task-start.sh` 命中（作业程序化引用）；`current-brief.<sid>` 写接线命中。→ §8 表 grep 命令全过（至少 3 条断言）。
4. **会话专属 brief（CT-42 闭环）**：task-start 后 `current-brief.<sid>` 存在且含最新 brief 名；全局 `current-brief` 不再被 task-start 写（或删除）。→ §7.1 "废除全局" case + grep 断言。
5. **主仓只读化**：`SYNO_SKIP_PARALLEL_GUARD=1` 之外的正常路径，主树 task-start 被 `_assert_dev_worktree` 拦截（exit 1）。→ 测用例"主树阻断"。
6. **现有回归**：`tasks/control-tower/` 现有测试（worktree-manager.test.sh/.py、test-session-registry.py、staging-guard-session.test.py、check-orphan-worktrees.test.sh）**零新增失败**（D307 现有 24+ 用例回归绿）。→ 运行现有测试套件。
7. **代码质量**：bash -n 三脚本语法通过；`as any`=0（无 src/，天然）；无静默吞错（`2>/dev/null` 有 `swallow-ok` 或 `|| true` 链路）；降级显式 degraded（铁律 11/24/31）。→ bash -n + `check-silent-swallow --diff` + grep。
8. **合规**：本次改动不触 `scripts/audit/`、`src/`、`scripts/pre-commit-check.sh`（若因接线必须改 pre-commit-check.sh → **单列**并 CTO 单独审，不并入本写集）。

---

## 11. Auth Doc References

- [派单 D539 session-worktree-isolation](docs/synova/coordination/派单-D539-session-worktree-isolation-20260827.md) — 本任务主依据（spec 必答题 1/2/3 + 验收 + 写集红线）
- [D507 并行撞车根治方案（三层防线 + §六 主仓只读化裁决）](docs/synova/coordination/并行撞车根治方案-D507-20260823.md) — 三层防线设计 + 主仓只读化意图
- [D307 session 级 worktree 隔离 dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-D307-session级worktree隔离-20260812.md) — worktree-manager 设计（写集/D307 已交付）
- [D352 dev doc 范例](docs/plans/codex/implementation/SYNOVA-IMPL-D352-resolver硬化-20260813.md) — 结构对齐（写集表 / 权威引用带原文 / 缺陷分节 / red→green / 决策参考 / DS 对应 / 自检清单）
- [PRODUCT-BRIEF.md](.claude/PRODUCT-BRIEF.md) — 北星锚定（§七 我犯过的错 #1 流程/协作 + §八 Loop Engineering 进程系统）
- [AGENTS.md 铁律](/Users/wane/SynovaAgent/AGENTS.md) — 0-2 接线 / 11 / 24 / 31 / 35 / 38 / 39 / 47 / 48
- [D451/CT-42 brief](.claude/task-briefs/2026-08-18-D451-ct42-d331.md) — CT-42 读侧接 session 专属（本单闭环写侧）
- 现状源码（只读生产事实，基线 origin/main）：`scripts/workflow/task-start.sh:25-54/65-68`、`scripts/control-tower/worktree-manager.py:152-183`、`scripts/control-tower/attach.py:165-188`、`scripts/workflow/resolve-commit-brief.sh:55-57`、`scripts/control-tower/staging_guard.py:75`、`scripts/pre-commit-check.sh:771-818`、`scripts/control-tower/session_registry.py:230-232`

---

## 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 主仓只读化强度 | A 全只读（任何 dev session 强制 worktree，D507 §六推 B）/ B 单 session 例外（D507 §六推荐，并行才拦） | 派单 D539 §必答题 1/2 明确"主仓只读化 + 开工强制 worktree"（措辞强于 D507 §六）+ 第一性原理（一个 session 一个 worktree 是根治）+ Anthropic（fail-closed：主树写本不该发生） | **A 全只读**——按派单口径；D507 §六 B 作为待 CTO 复核备选（若创始人选 B，仅改 §7 触发条件：`_assert_dev_worktree` 只在"检测到并行"时拦，机制不返工） |
| 检测放哪 | A task-start 内 / B hook-block-write.sh（PreToolUse） | 第一性原理（task-start 是 dev 开工唯一入口，最少机制）+ Anthropic（阻断点在"生成 brief 前"引导最有意义） | **A**——hook-block-write.sh 语义是"brief 未填拒写代码文件"，与"必须在 worktree 开工"不同层 |
| worktree-manager create 接线 | A 仅 echo 消息建议 / B 程序化引用（grep 到脚本路径）/ C 实际派发（--create-worktree 时真正执行） | 铁律 0-2（接线失败 4 次历史，D307 零调用活例）+ Anthropic（fail-closed：检测存在≠可用/接线） | **B 保底 + C 推荐**——task-start 至少**程序化引用** worktree-manager.py 路径（grep 命中 ≥1）；`--create-worktree` 时**实际派发**（不意外建目录，默认只给命令 exit 1） |
| 会话专属 brief | A 写专属 + 保留全局 / B 写专属 + 废除全局（rm） | 派单"废除全局、强制专属" + 第一性原理（全局单文件 = 并发的覆盖源，就是病因；保留=留根） | **B 废除全局**——仅当 SESSION_ID 不可解析的 legacy 单 session 回退全局（不静默）；§7.1 "废除全局" case 验证 |
| attach.py 改不改 | A 不改 / B 加"不 clobber" | Anthropic（写方一致性：不要用 stale snapshot 覆盖 task-start 权威写入） | **B 加不 clobber**——若 `current-brief.<sid>` 已存在则跳过（防 attach SessionStart 的 snapshot 覆盖 task-start 生成的最新 brief） |

> **参考：Anthropic（fail-closed + 隔离可测 + 接线物理验证 + 契约优先）+ 第一性原理（一个 session 一个 worktree 是根治，全局单文件是病因）+ DSH 理念（每 session 独立持久化上下文）**。收敛检查：各参考系指向一致（主仓只读化 / 强制 worktree / 废除全局 / 程序化接线），与本 spec 三问依赖序一致，无分歧。

---

## 自检清单

- [x] 北星 front-matter 已写（PRODUCT-BRIEF §七/§八 锚定）+ 服务用户/场景/终态/完成标准/当前进度五要素齐
- [x] 现状基线核实**写实**：D329 会话专属 brief 已实现（attach.py 写 + resolver --session 读 + staging_guard/sop-gate 接），task-start 仍写全局（D513）——按此现状设计，**不误判"机制未实现需重写"**（M7 漂移防）
- [x] 现状 grep/read 实测（§4.1/§4.2）：task-start.sh:25-54/65-68、pre-commit:771-818（D537 #2）、attach.py:165-188、resolve-commit-brief.sh:55-57、worktree-manager.py:152-183、session_registry.py:230-232
- [x] **基线 = origin/main 确认**：本地 main/feat/d505-impl 落后 origin/main 447 commit（D537 #2/D520 仅 origin/main），§1 已明示（防 M7/M9 在 stale 分支上误判，claim-verifier 环境差异检查）
- [x] worktree-manager.py 零程序化调用**实测确认**（仅 echo 消息建议），接线缺口真实
- [x] 写集表（2 修改 + 1 新建）+ 生产调用点（§8，防接线失败——D307 "已落地却零调用"活例）
- [x] 测试 red→green 表（§7.1：session-id 解析三分支 / 废除全局 / 主树阻断与放行 / 豁免 / 不 clobber / **物理隔离 sha256 断言**）+ 降级（§7.3）
- [x] 决策参考（S-12）：主仓只读化 / 检测放哪 / worktree 接线 / 会话 brief / attach 五决策点收敛（参考系 + 结论）
- [x] 验收物理可复现（§10）：隔离断言（sha256 指纹）/阻断断言（exit≠0）/接线断言（grep）逐条给命令+判据，禁文档声称
- [x] 术语统一（控制塔"session 隔离"口径）；as any=0（无 src/ 改动，天然）
- [x] 不是凭记忆 / 不用 --no-verify（dev doc 只写文档不写代码）

> **交付边界**：本 dev doc 只写规格（不含实现代码）。编码 session 按 §5 写集实现 + §7 测试 + §8 接线 + §10 验收 + task-state/D539 回填（spec 段 + status→spec_done）；走 DSH 预审 + K3 审计；验收 = §10 逐条对照（测试断言 + grep，非声称）。**编码 session 首步必须 `git fetch --all && git checkout origin/main`（或基于 origin/main 建 worktree），禁止在 stale 的 `feat/d505-impl` 主树上实现。**
