---
north-star:
  服务用户: 多 Agent 并行开发 session（dev-doc / 编码 / CTO / K3 审计四线）+ 创始人。痛点：并行 session 共享主工作区单一 git index / current-brief / task-state / 协调日志，物理互踩（M8 第四次复发 D320/D330/D331/D394→D506）+ 影子提交在 clone 环境因 git identity 缺失而降级（D537 #4 恢复后 L87「identity 未配置?」正是风险路径）。
  服务场景: 编码 session 认领任一 D 任务后在**独立 clone** 中开工/提交/推送/PR；两个及以上 session 并行（一个打 A、一个打 B）时各自在独立 clone 工作；影子提交证据链在 clone 环境照常生成并自然进 main。
  模块终态: 「一个任务一个 clone」——编码任务一律在独立 clone 中工作（独立 .git/index / current-brief.* / session-registry.json，物理隔离），主工作区 = Codex 专用（dev-doc/台账/协调，唯一写者）；影子提交在 clone 照常（identity 配置为前置）；clone 生命周期 + git 配置初始化（user.name/email / credentials / core.quotepath=false）就绪；三处控制塔适配完成；verify-parallel 从本地 pre-push 移 CI/PR。
  对齐北星: .claude/PRODUCT-BRIEF.md §七（我犯过的错 #4「增强哨兵但不检查数据源」+ §五 并行污染是协作/流程根因；诊断是手段，产品数据被并行污染直接导致偏离）+ §八（Loop Engineering 需成为「进程系统」——并行隔离是协作前置，防产品因数据被污染而偏离）。方向不跑偏锚点 = 隔离是为「产品不再因数据污染偏离」，不是为隔离而隔离。
  完成标准: 影子提交断言（worktree + clone 各一次真实 commit 自动生成影子提交，bypass.log 含 COMMITTED + 影子提交随 PR 进 main）+ 并发冲突断言（试点全程幽灵/脏 index/覆盖 = 0 次）+ 拉平断言（每任务开工 pull once）+ 门禁断言（13 组 clone 内全绿 + CI 权威不变）+ 接线断言（新 export 有真实生产调用点，测试调用不计）。可验证（§7 L1 测试 + §8 接线 grep + §10 验收）。
  当前进度: 现状 = 上游已合 origin/main：**D537 #4（e4cb41ab，08-27 01:22）已恢复影子提交登记段**（post-commit.sh L69-84 D521/不变量2）；D539（已合）把 task-start.sh 加 `_assert_dev_worktree`（开工端主树阻断 + worktree 引导）；D515/D537 提交端主树占用硬阻断已在 pre-commit。**遗留缺口**：① clone 环境 git identity / quotepath / credentials **未初始化**（install-hooks.sh 无此配置，本机实测无 global identity → 影子提交 L87 必降级）；② verify-parallel `--scan-today` 仍绑本地 pre-push（门禁5），未移 CI/PR（缺口 2）；③ `post-merge-cleanup.sh` 仍存在（应删，铁律 37 + 影子提交已覆盖）；④ 影子提交 clone 环境**未实测**（identity 降级路径未堵——本机无 global identity，git clone 必触发）。
---

# SYNOVA-IMPL-DSH-D540: 独立 clone 试点 + 影子提交 clone 环境验证（clone-pilot-shadow-commit）

> 归属: DeepSeek Harness（DSH）· dev doc | 2026-08-27
> 状态: dev doc（只读交付物，不改任何代码） | slice: `clone-pilot`
> 优先级: P0（M8 第四次复发 + 影子提交 clone 降级风险的治本） | 依赖: 上游 D539/D515/D537 已合 origin/main；本单前置步骤 0 = 验证独立 clone 环境影子提交照常（非修复失效——D537 #4 已恢复机制）
> 并行: 本单与 D538（前端左栏）无依赖可并行；同一模块同一时间仅本角色认领——TASK-ROUTING v4（scripts/control-tower/ + docs/synova/coordination/ 归 Mac DSH 线；scripts/audit/ K3 专属红线）
> 执行方: 🛠 编码 session（Mac DSH 线）按本 spec 实现 + 测试 + task-state/D540 回填
> 上游输入: 派单 `docs/synova/coordination/派单-D540-clone-pilot-20260827.md` + 多 Agent 协作治理定稿 v3（Codex 三缺口修正 + 创始人 4 补充）+ D507 三层防线 `docs/synova/coordination/并行撞车根治方案-D507-20260823.md`（注：D540 将 D507 §三 否决的「独立 clone」从备选升为主方案）

> ⚠️ **本 spec 的现状基线是 origin/main**（不是本地 main / feat/d505-impl）。实测：本地 `feat/d505-impl` 分支的 `scripts/hooks/post-commit.sh` 是 V4.5.1 旧版（**无影子提交段**——L69 是 bypass 判定 non-COMMITTED 分支）；派单、D537 #4、D539 所述「已恢复/已合」均指 **origin/main**（`ed28ac5`，2026-08-27 19:42）。编码 session 开工前必须 `git fetch --all && git checkout origin/main`（或基于 origin/main 建 worktree/clone），**禁止在旧的 feat/d505-impl 主树基础上实现**（见 §6 明确排除 + §5.2 说明）。

---

## 1. Authority Doc Verification

**权威引用 ①（本任务定义 + CTO 派单）** — [派单 D540](docs/synova/coordination/派单-D540-clone-pilot-20260827.md) §"spec 必答题"：

> 1. **影子提交 clone 环境验证（步骤 0，前置）**：影子提交机制已在 D537 #4 恢复（post-commit.sh L69-84）。本单验证**独立 clone 环境**照常工作——关键风险是 clone 的 `user.name/user.email` 未配置导致 L86 降级「identity 未配置?」。给出：clone 初始化时 identity/凭据配置的正确顺序（影子提交触发前必须配好）+ worktree 和 clone 各验一次真实 commit 生成影子提交的断言。
> 2. **clone 生命周期 + git 配置初始化（补充 2）**：clone 创建后与 install-hooks 同批执行 `user.name/user.email`（Synova 机器系）、凭据（token/credential helper）、`core.quotepath=false`（中文文件名）。给出 clone 创建/工作/结束/清理的完整流程设计。
> 3. **三处控制塔适配（不是重构）**：① hooks 安装（clone 后一次）；② bypass 影子提交自然进 main（删 post-merge 脚本，复用 V5.0.4 机制）；③ 协调文件（current-brief/task-state/session-registry）git 同步。
> 4. **主工作区单写者（补充 3）**：主工作区 = Codex 专用（dev doc/台账/协调），**所有任务（含串行）一律 clone**。给出"任务 session 在主工作区操作被阻断 + 引导 clone"的设计（复用 D539 开工端阻断还是新检测？）。
> 5. **verify-parallel 移 CI/PR（缺口 2）**：本地 pre-push 不再强制 --scan-today；CI/PR 阶段对比 base..head 写集 × 今日已合 PR 写集。给出 CI 阶段实现 + fetch-depth:0 依赖确认。

**权威引用 ②（治理定稿 v3 + 主方案升格）** — [派单 D540 §方法论](docs/synova/coordination/派单-D540-clone-pilot-20260827.md) + [D507（三层防线）](docs/synova/coordination/并行撞车根治方案-D507-20260823.md)：

> - 派单: "多 Agent 协作治理定稿 v3——层1 独立 clone（单机隔离治本）+ 层2 远端单源化（跨机协调）"。
> - D507 §三 曾否决独立 clone（"磁盘×4 + node_modules×4 + 门禁/hooks 不同步漂移；worktree 共享 .git 零拷贝"），**D540 将该否决反转**为试点主方案。本 spec 明确承认这一反转并给出依据（§3.1 a) 业界最佳实践 + §4.5 决策参考），不回避 D507 的反对理由（磁盘/成本用实测值，见 §10；hooks 漂移靠 clone 后同批 `install-hooks.sh` 消除——派单 三处适配①）。

**权威引用 ③（质量/接线/契约/审计红线）** — [AGENTS.md](/Users/wane/SynovaAgent/AGENTS.md) 铁律 + [D336 协作协议](docs/synova/coordination/MULTI-AGENT-COLLAB.md)：

> - **铁律 0-2** 测试先行 + 接线验收——Step 5 WIRE CHECK 硬门禁：`grep -rn "新函数名" src/` 零结果 = 未完成（历史：4 次接线失败）。本任务 verify-parallel 新模式必须 grep 到 CI 生产调用点。
> - **铁律 11/24/31** 静默降级禁止——catch 必须 log.warn/error + degraded 标志；降级信号传播。→ 本次所有阻断/降级（identity 缺失、credential helper 不可用、clone 检测失败）必须显式 degraded 记录（ctrl-tower-change 模式 1 三态：0=通过 / 1=业务阻断 / 2=自身降级）。**尤其影子提交 L87「identity 未配置?」是既有降级路径——本单要在 clone 环境前置堵住它，而非让降级静默发生**。
> - **铁律 37 死代码入仓库即违规**：删除旧文件 + grep 零引用确认。→ `post-merge-cleanup.sh` 是本单删除对象（已实证零生产调用，见 §4.2）。
> - **铁律 39 五层架构边界**：本任务改 scripts/（控制塔，L0 工具层）+ .github/（CI）+ docs/ + tests/，不触 src/ L1-L5，天然合规。
> - **铁律 35 自动化优先**：能变物理门禁的不靠文档/自觉；本任务把「clone 环境 git 配置初始化」从人工步骤升级为 `install-hooks.sh` 幂等自动配置。
> - **D336 审计红线**：本任务只碰控制塔/CI/文档/测试，**永不碰 `scripts/audit/`**、不写审计标准、不自我审计。

**权威引用 ④（Shadow commit 机制来源）** — [D521 note](memory/notes/implemented/2026-08-24-d521-submit-chain.md) + [D537 note](memory/notes/implemented/2026-08-26-d537-tower-parallel-commit-friction.md)：

> - D537 #4: "D530（734ab32e CT-45 merge 豁免）重写 post-commit.sh 时覆盖丢失 D521-2 的 'bypass COMMITTED 登记' 段 → bypass-precommit.test.sh 红态（登记段缺失/HASH 未登记/仍脏/影子提交缺失）+ D451 补记循环。恢复该段（COMMITTED 成对登记 + 影子提交防递归）。"
> - D537 教训: "改共享脚本必须保留既有段（D530 覆盖 D521-2 的教训）……改共享 hook 脚本，先 `git log -p` 看全历史段落，逐段核对是否保留。" → 本 spec **不改** post-commit.sh（机制已恢复，避免二次覆盖）。

---

## 2. Problem Statement（对齐北星锚定块）

M8 并行污染第四次复发（D320/D330/D331/D394→D506）+ 影子提交证据链在 D530 被覆盖丢失（D485 实证未生成，D537 #4 恢复）。软纪律（register/暂存即提交/被拒不重试）只能减害，挡不住物理互踩——所有 session 共享**同一个 git 工作区**，HEAD/index/工作区文件/远程 ref 全是**进程间共享单例**。D507/D539 采用 `git worktree` 方案（每 session 独立 worktree，共享 .git 零拷贝），已在开工端（task-start `_assert_dev_worktree`）落地。

但治理定稿 v3 把方案**升格为独立 clone**（层1 单机隔离治本 + 层2 跨机单源化）。独立 clone 相对 worktree 的优势：**跨机隔离**（远端单源化，clone 不依赖共享 .git —— 多机 PR 工作流 D334 的跨机冲突也能治）+ **真·物理隔离**（连 .git 对象库都不共享，彻底断 M8 类「共享 ref」事故）。代价是**磁盘/时间成本**（本次用实测值，不拍脑袋，见 §10）+ **clone 环境 git 配置缺失**（identity/quotepath/credentials）。

本任务要解决的**具体问题**（物理可复现）：

1. **影子提交在独立 clone 环境照常吗？** —— 本机实测**无 global git identity**（`git config --global` 空），`git clone` 出来的新鲜 clone 必然无 `user.name/user.email` → post-commit.sh L84 的影子提交 `git commit` 必失败 → L87「identity 未配置?」降级 → bypass.log 永脏 → 又回到 D451 补记循环。**这是必须前置堵住的路径**（不是笼统「验证」，是「identity 配置 → 影子提交触发 → bypass.log 含 COMMITTED」的完整断言链）。
2. **clone 生命周期 + 配置初始化缺失**：`install-hooks.sh` 目前只装 hooks + merge.union.driver + http.lowSpeedLimit + synova-commit alias，**不含** user.name/user.email / core.quotepath=false / credential helper。clone 后这些不配，影子提交必降级、中文文件名被转义、push 无凭据。
3. **verify-parallel 仍绑本地 pre-push**（门禁5 跑 `--scan-today`，exit 1 阻断推送）——本地 13 组门禁已很重，再加 verify-parallel 是摩擦；且本地 pre-push 的 `--scan-today` 在单机多 session 场景语义不准（应移到 CI/PR 做 base..head × 已合写集比对）。
4. **主工作区仍可能被当 dev 工作区**：D539 已让 task-start 开工端阻断主树，但主工作区语义需从「只读基准」调整为「Codex 专用（单写者）」；且编码 session 的引导目标应从 worktree 转为 clone（治理 v3 主方案）。

---

## 3. Q0-Q4

### 3.0 Q0 项目拼图 + 文件审计

- **拼图**：本任务属控制塔（scripts/control-tower + scripts/hooks + scripts/workflow，L0 工具层）+ CI（.github/workflows/）+ 文档 + 测试，非五层产品。该层已有 D521（提交链收敛）、D537（并行污染 + 提交链摩擦）、D539（worktree 隔离）、D515/D516（门禁瘦身 + CI strict）。本任务**加固/接线/迁移**现有机制：把隔离从 worktree 升级为 clone，把影子提交从「主工作区已验」扩展到「clone 环境验证」，把 verify-parallel 从本地移到 CI/PR。**不新增组件**（派单红线）。
- **文件审计**（grep/read 实测 origin/main）：
  - `scripts/hooks/post-commit.sh`：L69-84 D521/不变量2 影子提交段（COMMITTED 成对登记 + 影子提交）；L87 degradation「identity 未配置?」。**已恢复（D537 #4），本单不改**——只做 clone 环境验证（其前置 = identity 配置）。
  - `scripts/control-tower/synova-commit`：L607 COMMITTED（DEGRADED-PASS 路径）；L681-688 D414 bypass.log 证据链随提交入库；L701-703 注释「COMMITTED 登记已由 post-commit hook 层统一完成」；L723-727 HEAD 回头检测「若 HEAD 是 hook 的登记影子提交 → 回退到真实提交取文件清单」。**两条 COMMITTED 路径成对（synova-commit + hook），本单不改**。
  - `scripts/install-hooks.sh`：L85-88 装 hooks；L94 merge.union.driver；L99-100 http.lowSpeedLimit；L104-119 synova-commit alias。**缺 identity / quotepath / credentials 配置 → 本单改动点（补充 2）**。
  - `scripts/pre-push-check.sh`：L348-364 门禁5 `bash "$VERIFY_PARALLEL" --scan-today`（exit 1 阻断推送）。**本单改动点（缺口 2 迁移）**。
  - `.github/workflows/ci.yml`：quality job `fetch-depth: 0`（√ 依赖确认）+ D515 docs-only 跳过 + `SYNO_CI: 1`。**本单改动点（加 verify-parallel CI 步骤）**。
  - `scripts/control-tower/verify-parallel.sh`：模式 pair/declared/today；`--scan-today` L178+。**本单改动点（加 CI 模式 base..head × 已合写集）**。
  - `scripts/workflow/post-merge-cleanup.sh`：**孤儿**（无生产调用，仅 loop-score/self-health 检查文件存在）。**本单删除（铁律 37 + 派单）**。
  - `scripts/control-tower/worktree-manager.py`：create/finish/list/status（D307）。**试点期保留、本单不改**（clone 推广后退役）。
  - `scripts/workflow/task-start.sh`：D539 `_assert_dev_worktree`（主树阻断 + worktree 引导，L71-111）+ `_resolve_session_id`（L55）。**主树阻断已在，本单不改**（治理 v3 的「主工作区 Codex 专用 + 编码一律 clone」用现有阻断 + 配置初始化承载；见 §5.4/§4.5）。
  - `.gitattributes`：`.claude/bypass.log merge=union` + `.claude/reference-map.md merge=union`（**已闭环，本单引用不重建**）。
  - `.gitignore`：`.claude/current-brief*`、`.codex/control-tower/session-registry.json`（**运行时产物，去跟踪**——正是独立 clone 各 clone 自持的来源）；`task-state/` **git-tracked**（113 个 D# json）。
- **决策**：影子提交机制已恢复→**不改 post-commit.sh/synova-commit**（避免 D530 二次覆盖教训）；clone 配置初始化放 `install-hooks.sh`（clone 后一次，幂等）；verify-parallel 迁移改 pre-push + ci.yml + verify-parallel.sh 三处；协调文件 git 同步边界用「git-tracked（task-state//union 日志）vs 运行时 per-clone（current-brief.*/session-registry.json/.git/index）」二分。无冲突，直接接线。

### 3.1 Q1 调研（业界最佳实践 / 顶级团队 / memory 教训）

a) **业界最佳实践**：独立 clone（`git clone`）是 git 官方「完全隔离工作区」的最小原生机理——每个 clone 有**独立 .git 对象库 + index + HEAD + 提交历史**，唯一的共享是远端 remote（push/pull 显式协调）。这正是 D334 多机 PR 工作流（"main 是唯一真相，一人一事一分支，合并走 PR"）的单机推广版：**每 session 独立 clone = 彻底断开共享 .git，连对象库都不共享**（worktree 仍共享 .git/objects + refs，跨机仍可能撞）。治理定稿 v3 把独立 clone 升格为主方案，理由即在此（层1 单机隔离治本 + 层2 跨机单源化）。官方 best practice：clone 后 `git config user.name/user.email`（或 global）、`core.quotepath=false`（中文文件名不被转义）、credential helper 配置 push 凭据——三步是 clone 环境的标准初始化，缺一不可。

b) **顶级团队做法（DSH 借鉴，理念级不引代码）**：DSH 的 per-session 隔离 + `dsh-session-persistence-jsonl` 用**每 session 独立持久化存储**（不共享全局单例状态）——对应我们每 session 独立 clone（独立 .git/index）与 per-clone `current-brief.*`/`session-registry.json`。**借鉴「每 session 独立持久化上下文」理念，不 copy DSH 代码**（派单红线 R1/R3：不 npm install、不复制）。dsh-ssh 的凭据（密钥/passphrase/credential helper）处理理念可参考，但不引入。**再次确认：本任务无 DSH 源码移植**。

c) **memory/ 教训（本任务直接相关）**：
- **M8 共享暂存区竞争**（D394/08-16 → 08-23~27 复发）：并行 session 共用一个 index → 拉锯/劫持。→ 本任务物理隔离（独立 clone）而非软纪律；独立 clone 把共享 .git 彻底断掉。
- **D537 教训「改共享钩子必须先看全历史段落」**（D530 覆盖 D521-2 教训）：`post-commit.sh` 是「所有 session 共用一份，修改即同步」的高危文件。→ 本任务**不改** post-commit.sh（机制已恢复），只做 clone 验证 + 前置配置。
- **claim-verifier 教训（D316/M7 + D540 派单修正两次不实教训）**：现状核实必须读 origin/main（`git show origin/main:`）、禁凭转述/记忆判断「机制已失效/已实现」。D540 派单第一版误判「影子提交失效」（凭创始人转述），第二版误判「D329 未实现」（凭记忆写错路径）——**同类错误第二次 = 防线失效，升级创始人**（台账已记）。→ 本 spec 全部现状用 `git show origin/main:` 实测（含 D537 #4 恢复 commit 时间戳核实）。
- **M13 测试沙箱污染真实仓库**：测试污染真实数据 → 数据损坏。→ 本任务所有测试走 `mktemp` 沙箱 + `SYNO_*` 注入，零真实目录零网络。
- **验证 clone/credentials 的物理环境坑**：本机 `git config --global` 空 → git clone 无 identity → 影子提交必降级（§10 实测）。这是本任务「identity 配置为前置」的物理依据，不是拍脑袋。

### 3.2 Q2 范围（做什么 / 不做什么）

**做什么**（最小闭环：影子提交 clone 验证 → clone 配置初始化 → 三处适配 → verify-parallel 迁移 → 主工作区单写者设计）：
- `install-hooks.sh` 加**幂等 clone 配置初始化**：`ensure_identity`（有 local/global 则不覆盖，无则设 `user.name=synova-mac`、`user.email=claworg@users.noreply.github.com`，env 可覆盖）+ `core.quotepath=false`（幂等）+ credential helper（无则配，见 §5.3）。
- **删除** `scripts/workflow/post-merge-cleanup.sh`（铁律 37 死代码 + 影子提交覆盖其职责，§5.5）。
- **verify-parallel 迁移**：`pre-push-check.sh` 门禁5 去 `--scan-today` 强阻断（保留同级软提示「已移 CI」）；`verify-parallel.sh` 加 CI 模式（`--ci-pr <base>`：base..head 写集 × 已合写集比对）；`ci.yml` quality job 加 verify-parallel 步骤（fetch-depth:0 已确认）。
- **协调文件 git 同步边界**（文档化 + §8 接线）：git-tracked（task-state/、bypass.log union、reference-map.md union）→ 走普通 git 流；运行时（current-brief.*、session-registry.json、.git/index）→ per-clone 自持，不复用共享。
- **主工作区单写者**（设计 + 文档化，不新增组件）：主工作区 = Codex 专用；编码 session 一律 clone；复用 D539 `_assert_dev_worktree` 主树阻断（不新检测），引导目标从 worktree 转 clone（§5.4）。

**不做什么**（含文件路径，铁律 Q2 排除项 + 写集约束）：
- ❌ **不改 `src/`（产品代码，红线）任何文件**——`src/server.ts`、`src/store/`、`src/sentinel/`、`src/routes/` 等 L1-L5 均只读（本任务控制塔治理 + CI，产品零改动）。
- ❌ **不碰 `scripts/audit/`**（K3 专属红线，违反 = 事故）。
- ❌ **不改 `scripts/pre-commit-check.sh`**（13 组门禁本体，D515/D516/D537 已锁定；本单不碰，除非 CTO 单独审）。
- ❌ **不改 `scripts/hooks/post-commit.sh` / `scripts/control-tower/synova-commit`**（影子提交机制已恢复 D537 #4；改动有 D530 二次覆盖风险——只做 clone 验证，不动机制本体）。**注：这两文件在派单「可碰」清单，但机制已正确，本 spec 明确「不改」，防执行方为改而改**。
- ❌ **不新增独立守护进程 / 服务 / launchd / DSH 依赖**（派单红线：零新组件；配置初始化放 install-hooks.sh，clone 创建走 `git clone` + 现有脚本）。
- ❌ **不改 `scripts/control-tower/worktree-manager.py`**（D307 已交付、试点期保留、clone 推广后退役——本单不写它）。
- ❌ **不改 `scripts/workflow/task-start.sh`**（D539 `_assert_dev_worktree` 已在；本单 only 复用其语义 + 文档化，不重写阻断）。**注：若 K3 判定「主树阻断需改为引导 clone」需改 task-start.sh 引导文本，则单列并 CTO 单独审，不并入本写集**。
- ❌ **写 DOM/渲染测试 / 引 jsdom**（纯 bash/python 控制塔 + CI yaml，无该需求）。
- ❌ **把影子提交「修复」当作目标**（D537 #4 已恢复；本单是「验证 clone 照常 + 前置配置」，不是修 hook——避免对已恢复机制做无谓改动，D485 教训已闭环）。

### 3.3 Q3 验收（入口 → 交互 → 结果，逐条可证伪，即 §10 验收）

- **入口**：编码 session 在独立 clone（`git clone` + 配置初始化）中跑真实 `git commit`/`synova-commit`。
- **交互**：clone 配置初始化把 identity/quotepath/credentials 配好 → commit 走真实 hook 链（pre-commit 写 marker → PASS_WAY≠0 → post-commit 追加 COMMITTED + 生成影子提交）→ bypass.log 含 COMMITTED + 影子提交随 PR 进 main（union 合并）。
- **结果**：影子提交在 clone 环境照常（identity 前置，L87 降级路径被堵）；verify-parallel 移到 CI（本地 pre-push 不再强阻断，CI 权威物理拦截写集重叠）；主工作区单写者（编码一律 clone，Codex 专用）；协调文件 git 同步边界清晰。

### 3.4 Q4 契约与测试（铁律 47/48，写代码前定义）

**新模块/新契约**：
- `install-hooks.sh` 新增 `_ensure_clone_git_config()`：
  - `@input` — `$ROOT`（仓库根）+ env：`SYNO_GIT_NAME`（默认 synova-mac）/ `SYNO_GIT_EMAIL`（默认 claworg@users.noreply.github.com）/ `SYNO_GIT_CREDENTIAL_HELPER`
  - `@output` — `user.name`/`user.email` 已设（local 未设则写 local；local 已有则跳过不覆盖）、`core.quotepath=false`、`credential.helper`（若 local 未设）
  - `@degraded` — 任一 `git config` 失败 → degraded 记录（铁律 11），**不阻断 hooks 安装**（配置失败 ≠ hooks 装不上，但要在 degraded 显式提示，防止影子提交二次降级无据）
  - `@error` — 不抛（bash 函数，配置失败返回非 0 由调用方处理）
- `verify-parallel.sh` 新增 `--ci-pr <base>`：
  - `@input` — `--ci-pr <base>`（默认 origin/main）+ 当前 HEAD（PR head）
  - `@output` — base..HEAD 中的 dev doc 写集 × origin/main 上「已合」dev doc 写集：`exit 1`（有交集，业务阻断）/ `exit 0`（无交集）/ `exit 2`（内核异常 degraded）
  - `@degraded` — base/HEAD 解析失败、devdoc_writeset 异常 → exit 2（degraded，不静默当 pass，模式 1 三态）
  - `@error` — 用法错误 → exit 2

**测试怎么验证**（§7 展开）：L1 沙箱测试（配置初始化幂等/仅当缺失才写/不覆盖已有；verify-parallel CI 模式 block/pass/degraded），`mktemp` 沙箱 + `SYNO_*`/`--repo` 注入，red→green 先写后实现。**影子提交 clone 验证用集成 harness**（§7.1：真实 hook 链沙箱 → commit → 断言 COMMITTED + 影子提交 + identity 缺失 L87 降级）。接线用 §8 grep 断言生产调用点（verify-parallel CI 模式在 ci.yml 被调用；install-hooks 配置函数在 install-hooks.sh 被调用）。

---

## 4. Current State（现状，逐条 grep/read 实测）

> 每条声称均当场对 `git show origin/main:` grep/read 验证（claim-verifier 纪律）。**基线 = origin/main**（本地 feat/d505-impl 的 post-commit.sh 是 V4.5.1 旧版无影子提交段，非有效基线）。

### 4.1 现状基准（origin/main 实测）

| 机制 | 文件/位置（origin/main） | 现状 | 与本单缺口 |
|---|---|---|---|
| 影子提交（hook 层） | `scripts/hooks/post-commit.sh:69-84`（D521/不变量2，D537 #4 恢复） | L83 追加 `COMMITTED | pre-commit PASS (hook 层登记) | HASH=` 到 bypass.log；L84 `git add bypass.log && git commit --no-verify -m "chore: bypass COMMITTED 登记 (auto hook, D521)"` 影子提交；L79 防递归 | ✅ 机制已恢复；**⚠️ clone 需 identity 前置（L87 `git commit` 失败→降级「identity 未配置?」）** |
| 影子提交降解路径 | `scripts/hooks/post-commit.sh:87` | `echo "⚠️ bypass 登记提交失败（identity 未配置?）— 降级，对账时按 D451 补记" >&2` | ❌ **本单核心缺口 1**——clone 环境 identity 未配必触此路径 |
| synova-commit 登记 | `scripts/control-tower/synova-commit:607/681-688`（D521） | L607 `COMMITTED | pre-commit DEGRADED-PASS |...`；L681-688 bypass.log 证据链随提交入库；L701 注释「由 post-commit hook 层统一完成」 | ✅ 两条 COMMITTED 路径成对（synova-commit + hook）；本单不改 |
| 影子提交对账（HEAD 回退） | `scripts/control-tower/synova-commit:723-727` | `if git log -1 --format=%s | grep -q "bypass COMMITTED 登记"; then _CF_REF="HEAD^"; fi`——HEAD 可能是 hook 影子提交 → 回退真实提交取文件清单 | ✅ 已处理；本单不改 |
| hooks 安装 | `scripts/install-hooks.sh:85-88` | pre-commit/commit-msg/pre-push/post-commit 装钩（运行时 `$(git rev-parse --show-toplevel)` 求值，可移植） | ✅ 复用；**clone 后安装即用**（适配 1） |
| git 身份初始化 | `scripts/install-hooks.sh` 全文 | **无** `user.name/user.email/quotepath/credential` 配置 | ❌ **本单核心缺口 2**（补充 2） |
| merge.union.driver | `scripts/install-hooks.sh:94` + `.gitattributes`（bypass.log / reference-map.md merge=union） | 已注册 union driver + 两日志 union 合并声明 | ✅ bypass 影子提交自然进 main（适配 2 已有；本单引用不重建） |
| verify-parallel 本地 | `scripts/pre-push-check.sh:348-364`（门禁5） | `bash verify-parallel.sh --scan-today`，exit 1 阻断推送 | ❌ **本单核心缺口 3**（缺口 2 迁移） |
| verify-parallel 模式 | `scripts/control-tower/verify-parallel.sh` | pair / declared / today（`--scan-today` 仅今日两两比对） | ❌ 缺 CI 模式（base..head × 已合写集） |
| CI fetch-depth | `.github/workflows/ci.yml` quality + test job | `fetch-depth: 0`（√）；quality 有 docs-only 跳过 + SYNO_CI:1 | ✅ CI 依赖确认；**本单加 verify-parallel 步骤** |
| post-merge cleanup | `scripts/workflow/post-merge-cleanup.sh` | 孤儿脚本（无生产调用，仅 loop-score/self-health 检查存在） | ❌ **本单删除**（铁律 37 + 派单） |
| 主树阻断 | `scripts/workflow/task-start.sh:71-111`（D539） | `_assert_dev_worktree`：主树（gitdir 含 `/.git/worktrees/` 判定）→ exit 1 阻断 + 引导 `worktree-manager.py create`；`SYNO_ALLOW_MAIN=1` 豁免；worktree 内放行 | ✅ 主树阻断已在；**⚠️ 语义需从「主树只读」调整为「主树 = Codex 单写者」+ 引导目标从 worktree 转 clone** |
| 协调文件 git 同步 | `.gitignore` / `.gitattributes` | git-tracked：`task-state/`（113 个）、`bypass.log`+`reference-map.md`（union）；gitignore（去跟踪 per-clone）：`current-brief*`、`session-registry.json`、`.git/index`（天然 per-clone） | ⚠️ 边界需文档化（适配 3 ③）：git-tracked 走普通 git 流，运行时 per-clone 自持 |

### 4.2 关键代码现状（origin/main，逐处实测）

**post-commit.sh:69-87（D521/不变量2 影子提交段，已恢复——本单不改）**：
```bash
# ═══ D521/不变量2: COMMITTED 登记（hook 层——commit 后立即成对登记，树永干净）═══
# ...（注释）... 只在 PASS_WAY≠0（pre-commit 真跑过）时登记；--no-verify 提交不登记
LAST_MSG=$(git log -1 --format=%s 2>/dev/null || true)
case "$LAST_MSG" in
  *"bypass COMMITTED 登记"*) : ;;  # 登记提交自身 → 跳过（防递归）
  *)
    HASH_NOW=$(git rev-parse HEAD 2>/dev/null || true)
    if [ -n "$HASH_NOW" ]; then
      echo "$(date -Iseconds) | COMMITTED | pre-commit PASS (hook 层登记) | HASH=$HASH_NOW" >> "$ROOT/.claude/bypass.log"
      if git add "$ROOT/.claude/bypass.log" 2>/dev/null && git commit --no-verify -q -m "chore: bypass COMMITTED 登记 (auto hook, D521)" 2>/dev/null; then
        :  # 登记提交完成——bypass.log 保持干净
      else
        echo "  ⚠️  post-commit: bypass 登记提交失败（identity 未配置?）— 降级，对账时按 D451 补记" >&2   # L87
      fi
    fi
    ;;
esac
```
> **断言链（§10 物理落点）**：`identity` 配置 → L83 追加 COMMITTED → L84 影子提交（`chore: bypass COMMITTED 登记`）→ L79 防递归。**L87 是降级路径**：`git commit` 失败（identity 缺失）→ 影子提交不生成 → bypass.log 永脏 → D451 补记循环。**本单前置 = clone 配置初始化（§5.3）不让 L87 触发**。

**install-hooks.sh（main 现状：只装钩 + union + http + alias，无身份配置）**：
```bash
install_hook "pre-commit"; install_hook "commit-msg"; install_hook "pre-push"; install_hook "post-commit"   # L85-88
git config merge.union.driver "git merge-file --union %A %O %B" ...   # L94
git config http.lowSpeedLimit 1000 ... ; git config http.lowSpeedTime 30 ...   # L99-100
git config alias.synova-commit "!\"$BASH_PATH\" \"$SYNOVA_COMMIT\""   # L104-119
```
> **缺口**：无 `user.name/user.email/core.quotepath=false/credential.helper` —— clone 后必缺，影子提交必降级。

**pre-push-check.sh:348-364（门禁5 verify-parallel 强阻断，本单迁移点）**：
```bash
VERIFY_PARALLEL="$SCRIPT_DIR/control-tower/verify-parallel.sh"
if [[ -f "$VERIFY_PARALLEL" ]]; then
  bash "$VERIFY_PARALLEL" --scan-today
  VP_EXIT=$?
  if [ "$VP_EXIT" -eq 1 ]; then
    echo "❌ 并行声明验证未通过 — 今日 dev doc 写集重叠, 推送已拒绝 (D311)"
    exit 1
  elif [ "$VP_EXIT" -eq 2 ]; then ...  # 降级不阻断
  fi
else
  echo "⚠️ verify-parallel.sh 缺失 — 跳过 (fail-open)"
fi
```
> **缺口**：本地强制 `--scan-today`（今日两两比对）在单机多 session + 协作治理 v3（clone 隔离）下语义不准（今日今日已合 PR 与本地 PR 没在「同一工作区」比）。迁移：本地去 `--scan-today` 强阻断，CI/PR 做 base..head × 已合写集比对。

> **现状核实结论（写实）**：影子提交机制**已恢复**（D537 #4，post-commit.sh L69-84，非失效）；`install-hooks.sh` **缺 git 配置初始化**（cloned 环境必降级）；verify-parallel **仍绑本地前推送**（未移 CI）；`post-merge-cleanup.sh` **孤儿待删**。本 spec 按此现状设计，**不是「修复失效」**（M7 漂移防误判——派单交付要求 §③「现状核实结论写实」已明示 + D540 派单修正两次不实教训）。

---

## 5. What We Build（每个产出物 + 文件路径）

> 写集（标「修改/新建/删除」）。控制塔 + CI + 文档 + 测试。**零新组件**（复用 install-hooks.sh + verify-parallel.sh；clone 创建走 git 原生 `git clone`）。

### 5.1 写集 (4 修改 + 1 删除 + 3 新建)
| 文件 | 操作 | 说明 |
|---|---|---|
| scripts/install-hooks.sh | 修改 | **核心**：加 `_ensure_clone_git_config()`（幂等 identity/quotepath/credential-helper，clone 后一次）——影子提交前置（§5.3）。见下。 |
| scripts/pre-push-check.sh | 修改 | 门禁5 `--scan-today` 强阻断 → 软提示「已移 CI/PR」（不再 exit 1 拦推送）；保留 verify-parallel.sh 缺失 fail-open + degraded 提示（§5.4）。 |
| scripts/control-tower/verify-parallel.sh | 修改 | 加 `--ci-pr <base>` 模式：base..HEAD 写集 × origin/main 已合 dev doc 写集比对（§5.4）。 |
| scripts/workflow/post-merge-cleanup.sh | 删除 | 铁律 37 死代码（零生产调用）+ 派单「删 post-merge 脚本，复用 V5.0.4 机制」——影子提交 + union 合并已覆盖（§5.5）。 |
| .github/workflows/ci.yml | 修改 | quality job 加 `verify-parallel --ci-pr` 步骤（fetch-depth:0 已确认；docs-only 时跳过或降级，§5.4）。 |
| tests/control-tower/clone-config-init.test.sh | 新建 | L1 沙箱测试：`_ensure_clone_git_config` 幂等/仅当缺失才写/不覆盖已有/降级（§7.1）。 |
| tests/control-tower/clone-shadow-commit.test.sh | 新建 | **影子提交 clone 集成 harness**：沙箱 clone + 真实 hook 链 → 真实 commit → 断言 COMMITTED + 影子提交 + identity 缺失 L87 降级（§7.1，red→green）。 |
| tests/control-tower/verify-parallel-ci.test.sh | 新建 | L1 沙箱测试：verify-parallel `--ci-pr` 模式 block/pass/degraded + 接线 grep（§7.1/§7.2）。 |

> 说明：不改 `scripts/hooks/post-commit.sh`、`scripts/control-tower/synova-commit`（机制已恢复，D530 二次覆盖风险，只验证不动机制）；不改 `scripts/pre-commit-check.sh`（门禁本体）；不改 `scripts/workflow/task-start.sh`（D539 主树阻断已在；引导目标转 clone 是文档化 + §5.4 说明，若 K3 判定需改引导文本 → 单列 CTO 审）；`scripts/control-tower/worktree-manager.py` 试点期保留不改；`src/` / `scripts/audit/` 零改动。

### 5.2 说明：为何不改 post-commit.sh / 为何基线是 origin/main

- **post-commit.sh 已恢复不改**：D537 #4 把 D521 影子提交段恢复。改动有 D530 二次覆盖风险（此风险 D537 note 明示）。本任务把「影子提交」当**验证对象**（clone 环境照常 + 前置配置），不是「修改对象」。**若编码 session 以「验证需要」为由改 post-commit.sh → 违规，停手问 CTO**。
- **基线 origin/main**：派单/D537/D539 所述「已恢复/已合」均指 origin/main。本地 `feat/d505-impl` 的 post-commit.sh 是 V4.5.1 旧版（无影子提交段）——**禁止以其为基线实现**。编码 session 首步 `git fetch --all && git checkout origin/main`（或基于 origin/main 建 clone）。

### 5.3 clone 配置初始化（install-hooks.sh 改动，补充 2）

`install-hooks.sh` 在装完 hooks 后调用 `_ensure_clone_git_config`（幂等，clone 后一次，主仓重复跑无害）：

```bash
# D540: clone 环境 git 配置初始化（幂等）——影子提交前置（post-commit.sh L87 降级路径堵漏）
# 仅在 local 未设时写默认；已设则不覆盖（尊重已有配置，主仓重复跑无害）。
_ensure_clone_git_config() {
  local name="${SYNO_GIT_NAME:-synova-mac}"
  local email="${SYNO_GIT_EMAIL:-claworg@users.noreply.github.com}"
  local degraded=0
  # user.name / user.email —— 影子提交（post-commit.sh L84 git commit）的前置，缺失 → L87 降级
  if ! git -C "$ROOT" config --local user.name >/dev/null 2>&1; then
    git -C "$ROOT" config --local user.name "$name" || degraded=1
  fi
  if ! git -C "$ROOT" config --local user.email >/dev/null 2>&1; then
    git -C "$ROOT" config --local user.email "$email" || degraded=1
  fi
  # core.quotepath=false —— 中文文件名不被转义（D339 synova-commit 同款）
  git -C "$ROOT" config --local core.quotepath false || degraded=1
  # credential.helper —— push 凭据；local 未设才配（已有则不动，尊重 token）
  if ! git -C "$ROOT" config --local credential.helper >/dev/null 2>&1; then
    git -C "$ROOT" config --local credential.helper "${SYNO_GIT_CREDENTIAL_HELPER:-osxkeychain}" 2>/dev/null || degraded=1
  fi
  if [ "$degraded" -ne 0 ]; then
    echo "  ⚠️  部分 git 配置写入失败 — 影子提交/中文文件名/push 可能降级 (degraded)" >&2
    _degraded_log "install-hooks.clone-config" "git config 写入部分失败 (degraded=$degraded)"
  fi
  echo "  ✅ clone git 配置初始化 — user=$name <$email> / quotepath=false / credential.helper"
}
```
> **设计要点**：
> - **幂等**：local 已设则不覆盖（`git config --local user.name` 已存在 → 跳过）。主仓重复跑 `install-hooks.sh` 无害（主仓已设 synova-mac = 不覆盖）。
> - **失败不阻断**：`git config` 失败 → degraded 记录 + 提示（铁律 11），不 `exit 1`（hooks 已装好，配置失败只是降级信号，不是安装失败）。
> - **降级日志**：写入 `.codex/control-tower/logs/degraded-events.log`（铁律 11 不静默）。
> - **env 可覆盖**：`SYNO_GIT_NAME/SYNO_GIT_EMAIL/SYNO_GIT_CREDENTIAL_HELPER`（测试注入缝 + 机器差异）。

> **接线断言（§8）**：`grep -rn "_ensure_clone_git_config" scripts/install-hooks.sh` 被调用（生产）；`SYNO_GIT_NAME` 等 env 在测试注入。

### 5.4 verify-parallel 迁移（缺口 2）

**本地 pre-push-check.sh 门禁5（去 `--scan-today` 强阻断）**：
```bash
# D540: verify-parallel 已移 CI/PR —— 本地不再强制 --scan-today（单机多 session 场景语义不准）
# CI/PR 由 ci.yml 调 verify-parallel --ci-pr 做 base..head × 已合写集比对（权威）
if [[ -f "$VERIFY_PARALLEL" ]]; then
  echo -e "  ${YELLOW}ℹ️  并行声明验证已移 CI/PR（D540）——本地不再强制 --scan-today${RESET}"
  # 保留 verify-parallel.sh 可用性探针（fail-closed：脚本缺失 = 降级信号，不静默）
else
  echo -e "  ${YELLOW}⚠️  verify-parallel.sh 缺失 — CI 并行声明验证将降级 (fail-open)${RESET}"
fi
```
> 设计：本地**不再 `exit 1` 拦推送**（消除本地摩擦 + 语义不准）；改**软提示**；保留缺失探针（fail-open 但 degraded 提示）。

**verify-parallel.sh 加 `--ci-pr <base>` 模式**：
```bash
# D540: CI/PR 模式 —— base..HEAD 写集 × origin/main 已合 dev doc 写集比对
# 用法: verify-parallel.sh --ci-pr <base> [--json]
#   base = PR base ref（默认 origin/main）；HEAD = PR head
#   exit 1 = 写集重叠（业务阻断，CI 权威拦）；exit 0 = 无交集；exit 2 = 内核异常/degraded
```
> - **实现思路**：`git diff --name-only <base>...HEAD` 找 base..HEAD 的 dev doc（`SYNOVA-IMPL-*.md`）；对每个 doc 用 `devdoc_writeset.py --extract` 取写集；再枚举 origin/main 上「已合」的 dev doc（`git ls-tree origin/main` 的 `docs/plans/codex/implementation/SYNOVA-IMPL-*.md`）取写集；两两 `compare_docs`（复用现有 compare_docs，见 verify-parallel.sh L95-145 逻辑）。重叠 → exit 1。
> - **focused 比对**：只比「本 PR 的 dev doc」×「origin/main 上已合的其他 dev doc」（排除 PR 自身）——即「本任务写集 vs 已合任务的写集」零交集。这取代本地 `--scan-today` 的「今天所有 doc 两两比」。
> - **fetch-depth:0**：`git diff <base>...HEAD` 需全历史，CI quality job 已 `fetch-depth: 0`（√，§4.1）。

**ci.yml 加步骤**（quality job 内，docs-only 分支走跳过或保守跑）：
```yaml
      - name: Verify parallel declaration (D540, moved from local pre-push)
        if: steps.docsonly.outputs.docs_only != 'true'
        run: |
          # base..head 写集 × 今日已合 PR 写集 —— CI 权威物理拦截写集重叠
          bash scripts/control-tower/verify-parallel.sh --ci-pr origin/main
```
> 设计：docs-only PR（纯文档）跳过本步（无代码写集冲突）；混合 PR 正常跑。**fetch-depth:0 依赖**：`git diff origin/main...HEAD` 需完整历史（ci.yml 已确认 fetch-depth:0）。
> **接线断言（§8）**：`grep -rn "verify-parallel.sh --ci-pr\|--ci-pr" .github/workflows/ci.yml` 命中（CI 生产调用点，非测试）。

### 5.5 删 post-merge-cleanup.sh（铁律 37 + 派单）

- `scripts/workflow/post-merge-cleanup.sh`：**零生产调用**（§4.1 已证：仅 loop-score.sh:82/116、self-health.py 检查文件存在，非实际调用者）。其职责（合并后扫残留 TODO/死代码/旧文件/过期 brief）已被「影子提交 + union 合并」（bypass.log/reference-map.md 自动取并集）与现行门禁覆盖，且本人为孤儿脚本（无人调）。
- **删除**：`git rm scripts/workflow/post-merge-cleanup.sh`。**唯一引用方** = `loop-score.sh`（L82/L116，实测 self-health.py 不引用）——删除后：
  - `loop-score.sh:82`：`check "post-merge-cleanup.sh 存在" 3 "[ -f ... ]"` → 变 false → 该检查计 0 分。**需确认**是保留该分项（文件不存在 → 计 0 合理）还是从 loop-score 移除。本 spec 倾向**保持 loop-score 不动**（文件删除后该项自然计 0，可接受；若要清零分值需改 loop-score.sh——不在写集，若需改则单列）。
- **防膨胀**：零新组件；删除是唯一「组件级」变更（且是删除，非新增）。

### 5.6 主工作区单写者（补充 3，设计 + 文档化）

治理 v3：**主工作区 = Codex 专用（dev doc/台账/协调），所有任务（含串行）一律 clone**。实现分两层：
1. **物理阻断（已存在，复用 D539）**：`task-start.sh` `_assert_dev_worktree`（origin/main L71-111）已拦主树变 dev 工作区（gitdir 含 `/.git/worktrees/` 判定），`SYNO_ALLOW_MAIN=1` 豁免。**编码 session 在主工作区开工 → exit 1 阻断**。本任务**不新增检测**（D539 已覆盖「主树阻断」语义）。
2. **引导目标转 clone（文档化 + 配置初始化承载）**：D539 引导消息指向 `worktree-manager.py create`；治理 v3 目标 = clone。**本单的「引导 clone」由 `install-hooks.sh` 配置初始化 + git 原生 `git clone` 承载**，并把「编码一律 clone」写进派单/协调文档。**若 K3 判定需把 task-start 引导文本从「worktree」改「clone」** → 单列 CTO 审（task-start.sh 不在本写集）。
3. **Codex 主工作区单写者**：Codex（dev-doc）在主工作区写文档/协调文件。**唯一写者** = 通过「主树 git 配置身份 + task-start 主树豁免（Codex preset 设置 SYNO_ALLOW_MAIN=1）+ 影子提交 union 合并」保证。**物理上**：主工作区只有 Codex 写；编码 session 一律 clone，克隆区互不共享 index/current-brief/session-registry（per-clone）。

### 5.7 协调文件 git 同步（适配 3 ③，边界文档化）

| 类别 | 文件 | 同步机制 |
|---|---|---|
| git-tracked（跨机单源） | `task-state/*.json`（113 个） | 普通 git 流（每任务独立 json，并行更新不同 D# 不冲突） |
| git-tracked + union | `.claude/bypass.log`、`.claude/reference-map.md` | `merge=union`（.gitattributes 已声明 + install-hooks L94 注册 driver）——**影子提交自然进 main** |
| 运行时（per-clone 自持） | `.claude/current-brief*`、`.codex/control-tower/session-registry.json`、`.git/index`、`.git/HEAD` | **gitignore 去跟踪 + 独立 clone 物理隔离**（每个 clone 一份，互不覆盖） |

> **设计要点**：git-tracked 协调文件走普通 git 流（PR 合并取并集）；运行时协调文件**去跟踪 + 物理隔离**（独立 clone 后天然 per-clone，从根上消除「共享 current-brief/registry/index」的互踩）。这正是「层1 单机隔离治本 + 层2 跨机单源化」的文件层面落地。

---

## 6. What We Don't Do（明确排除，含文件路径）

| 不做 | 原因 |
|---|---|
| 改 `src/`（产品代码）：`src/server.ts`、`src/store/`、`src/sentinel/`、`src/routes/*` | 铁律红线：本任务是控制塔治理 + CI + 文档；产品 L1-L5 零改动（只读） |
| 碰 `scripts/audit/` | K3 专属红线，违反 = 事故 |
| 改 `scripts/pre-commit-check.sh` | 13 组门禁本体（D515/D516/D537 锁定）；本单不碰，除非 CTO 单独审 |
| **改 `scripts/hooks/post-commit.sh` / `scripts/control-tower/synova-commit`** | 影子提交机制已恢复（D537 #4）；改动有 D530 二次覆盖风险；本单只验证 clone 环境 + 前置配置，不改机制本体 |
| 改 `scripts/control-tower/worktree-manager.py` | D307 已交付、试点期保留、clone 推广后退役——本单不写它 |
| 改 `scripts/workflow/task-start.sh` | D539 `_assert_dev_worktree` 主树阻断已在；本单复用其语义不重写。若 K3 判定需改「引导文本 worktree→clone」→ 单列 CTO 审，不并入本写集 |
| 改 `scripts/workflow/loop-score.sh` | 它引用 post-merge-cleanup.sh 路径（L82/L116，**实测 self-health.py 不引用**）。删除后该项计 0 可接受（文件确已删除 = 该项应计 0）；**若需改 loop-score.sh 清零分值 → 单列 CTO 审**（不在写集） |
| 新增独立守护进程 / 服务 / launchd / DSH 依赖 | 派单红线（零新组件）；clone 创建走 `git clone` + 现有脚本；配置初始化放 install-hooks.sh |
| 「修复」影子提交 | D537 #4 已恢复；本单是验证 + 前置配置，不是修 hook（D485 教训已闭环） |
| 写 DOM/渲染测试 / 引 jsdom/testing-library | 纯 bash/python 控制塔 + CI yaml + 沙箱 git，无该需求 |
| 在**本地 stale** `feat/d505-impl` 主树基础上实现 | 本地分支的 post-commit.sh 是 V4.5.1 旧版（无影子提交段）；编码 session 首步 `git fetch --all && git checkout origin/main`（或基于 origin/main 建 clone） |
| 把「clone 一律」变成硬门禁（pre-commit 拦非 clone 提交） | 治理 v3 目标如此，但涉及 pre-commit 门禁本体 + 需 CTO 拍板；本单试点先交付「配置初始化 + 主树阻断复用 + verify 迁移」，全量硬门禁留后续（防膨胀，见 §10 边界诚实记录） |

---

## 7. Test Requirements

> 铁律 0-2（spec→test→impl→wire）/ 48（expect 非空壳）/ 47（契约优先）。控制塔 bash/python 测试，放 `tests/control-tower/`（`*.test.sh`），`mktemp` 沙箱 + `SYNO_*`/`--repo` 注入（零真实目录零网络——ctrl-tower-change 模式 5）。**影子提交 harness 用真实沙箱 git + 真实 hook 链（不 mock git），保证隔离断言物理真**。

### 7.1 L1 单元契约（沙箱，red→green 先写后实现）

**测试文件 1：`tests/control-tower/clone-config-init.test.sh`**（install-hooks `_ensure_clone_git_config`）：

| 用例 | 输入 | 断言（expect） | 覆盖 |
|---|---|---|---|
| 幂等：local 已设 user.name | 沙箱 local 已设 synova-mac | 不改写（值不变） | 不覆盖已有（正常路径） |
| 仅当缺失才设 | 沙箱 local 无 user.name/email | 设为默认 synova-mac / claworg@users.noreply.github.com | 正常路径（clone 新手） |
| env 覆盖 | `SYNO_GIT_NAME=foo` `SYNO_GIT_EMAIL=bar` | local 设为 foo/bar | env 注入（正常路径） |
| core.quotepath=false | 沙箱 local 无 quotepath | `git config --local --get core.quotepath` = false | 中文文件名（正常） |
| credential.helper | 沙箱 local 无 helper | 设为默认（osxkeychain 或 env） | push 凭据（正常） |
| 不覆盖已有 credential | 沙箱 local 已设 helper | 不变 | 尊重已有 token（边界） |
| git config 失败降级 | 注入只读沙箱（config 失败） | degraded 记录 + 不 exit 1（hooks 仍装） | 降级（铁律 11） |
| 接线（生产调用） | grep | `_ensure_clone_git_config` 在 install-hooks.sh 被调用 | 接线（§8） |

**测试文件 2：`tests/control-tower/clone-shadow-commit.test.sh`**（影子提交 clone 集成 harness，核心）：

> 目标：物理验证「clone identity 配置 → 真实 commit → 影子提交触发 → bypass.log 含 COMMITTED + 影子提交生成」，以及「identity 缺失 → L87 降级路径」。

```bash
# 沙箱: 真实 git + 真实 post-commit 逻辑（加载 post-commit.sh 的核心段或完整脚本）
setup_sandbox_clone() {
  git init -q "$SBX" 
  # 模拟 clone: 无 identity（本机无 global → git clone 即无）
  # 装 hooks（用真实 install-hooks.sh 或 stub pre-commit 写 marker）
}
# 用例 1 (正常): identity 配置 → commit → COMMITTED + 影子提交
#   git -c user.name=synova-mac -c user.email=... commit ...
#   断言: bypass.log 含 "COMMITTED | pre-commit PASS (hook 层登记) | HASH="
#   断言: git log 含 "chore: bypass COMMITTED 登记 (auto hook, D521)"
#   断言: git status 干净
# 用例 2 (降级): 无 identity → 影子提交 git commit 失败 → L87 降级消息
#   断言: stderr 含 "identity 未配置" （L87 路径真实触发）
#   断言: bypass.log 未含该 HASH 的 COMMITTED（降级不洗白）
# 用例 3 (防递归): 影子提交自身不再触发影子提交
#   断言: git log 中 "chore: bypass COMMITTED 登记" 仅出现一次（L79 防递归）
# 用例 4 (isolated clone vs worktree): 独立 clone 双 commit，互不污染 index/HEAD
#   A clone commit → B clone 的 HEAD/index 零变化（sha256 指纹，铁律 0-2 隔离断言）
```
> **物理断言实现**（非静态 grep——验收「物理可复现」）：真实沙箱 git + 真实 hook 链（pre-commit 写 marker → post-commit 读 marker → PASS_WAY≠0 → COMMITTED + 影子提交）。`sha256sum` 指纹比 index/HEAD 隔离。

**测试文件 3：`tests/control-tower/verify-parallel-ci.test.sh`**（verify-parallel `--ci-pr`）：

| 用例 | 输入 | 断言（expect） | 覆盖 |
|---|---|---|---|
| 无交集 pass | base..HEAD doc 写集 vs 已合 doc 写集零交集 | exit 0 | 正常（并行合法） |
| 有交集 block | 两 doc 写集重叠 | exit 1 + 输出重叠文件 | 业务阻断（并行非法） |
| 委托依赖跳过 | base 解析失败 | exit 2（degraded） | 降级（fail-closed 模式 1） |
| 接线（生产调用） | grep ci.yml | `verify-parallel.sh --ci-pr` 被 CI 调用 | 接线（§8） |

### 7.2 L2a 接线（新 export 生产调用点，物理 grep 断言）

| 新 export/变更 | 生产调用点（须 grep 到） | 断言语义 |
|---|---|---|
| `_ensure_clone_git_config`（install-hooks.sh） | install-hooks.sh 主流程调用它 | clone 配置初始化接线（生产，非测试） |
| `verify-parallel.sh --ci-pr`（新模式） | `.github/workflows/ci.yml` 调用 `verify-parallel.sh --ci-pr` | CI 迁移接线（铁律 0-2 补，D311 工具接线） |
| verify-parallel 本地去强阻断 | pre-push-check.sh 门禁5 不再 `exit 1`（本地 `--scan-today` 移除） | 本地迁移（缺口 2） |
| 删除 post-merge-cleanup.sh | grep 零引用（loop-score/self-health 仅检查存在，非调用） | 铁律 37 死代码清理 |
| bypass 影子提交进 main（复用） | `.gitattributes` bypass.log merge=union + install-hooks L94 注册 driver | 适配 2（已存在，复核） |
| 协调文件 git 边界（文档化） | task-state/ git-tracked + bypass.log/reference-map.md union | 适配 3 ③（复核） |

### 7.3 L2b 降级（铁律 11/24/31）

| 场景 | 要求 |
|---|---|
| `git config` 写入失败（install-hooks clone 配置） | degraded 记录 + 提示（不 exit 1——hooks 已装，配置失败只是降级信号） |
| clone 无 identity（影子提交 L87） | **前置堵住**（install-hooks 配 identity）；若仍触发 → post-commit L87 已显式降级（既有），记录 degraded 不静默 |
| verify-parallel CI 内核异常（base/HEAD 解析失败） | exit 2（degraded），CI job 不通过（fail-closed，不静默当 pass） |
| verify-parallel.sh 缺失（pre-push / CI） | 提示 + degraded（fail-open 但显式），不静默 |
| post-merge-cleanup.sh 删除后 loop-score 计 0 | 文件确已删除 → 该项计 0 合理；degraded 记录说明（如需清零分值改 loop-score 单列） |

### 7.4 排除（显式 descope）

不写 DOM/渲染测试（无 jsdom）；不做「真实 data/synova.db 污染回归」（M13 用沙箱隔离断言覆盖，不污染真实库）；不 mock git（真实沙箱 git，保证隔离断言物理真）；不做「全量 clone 硬门禁」测试（那是后续治理决策，本单试点先交付配置 + 迁移 + 验证）。

---

## 8. Wiring Verification

> 标题固定 `Wiring Verification`（D381 gatekeeper C4）。每个「新 export → 生产调用点」须 grep 实测，禁凭文档描述推断（D381 接线纪律——本任务现状基线是 origin/main，非本地 stale 分支）。

| 变更 | 验证命令（物理，origin/main 基线） | 期望 |
|---|---|---|
| clone 配置初始化接线 | `grep -rn "_ensure_clone_git_config" scripts/install-hooks.sh` | 命中（主流程调用，生产） |
| verify-parallel --ci-pr CI 接线 | `grep -rn "\-\-ci-pr" .github/workflows/ci.yml scripts/control-tower/verify-parallel.sh` | ci.yml 命中（CI 生产调用点）+ verify-parallel 定义 |
| 本地 migrate（不再强阻断） | `grep -rn "\-\-scan-today" scripts/pre-push-check.sh` | **不再 exit 1**（门禁5 改软提示）——断言无 `--scan-today` 强阻断 |
| verify-parallel --ci-pr 定义接线 | `grep -rn "def\|--ci-pr\|add_argument" scripts/control-tower/verify-parallel.sh` | --ci-pr 模式定义（生产） |
| post-merge-cleanup 删除 | `grep -rn "post-merge-cleanup" scripts/ \| grep -v "\.test\."; ls scripts/workflow/post-merge-cleanup.sh 2>&1` | 文件不存在（git rm）+ 仅 loop-score/self-health 检查存在（非调用者） |
| bypass 影子提交进 main（复核） | `grep -rn "merge=union" .gitattributes` + `grep -rn "merge.union.driver" scripts/install-hooks.sh` | bypass.log/reference-map.md union（适配 2 已有） |
| 协调文件边界（复核） | `grep -rn "current-brief\|session-registry" .gitignore`; `git ls-tree origin/main --name-only task-state/ | wc -l` | current-brief/*/session-registry.json gitignore；task-state/ 113 个 git-tracked |
| 影子提交段（复核，不改） | `git show origin/main:scripts/hooks/post-commit.sh | sed -n '69,87p'` | L69-84 COMMITTED 登记 + L87 降级（确认未改） |

> **zero-wiring 反例（禁）**：若 `_ensure_clone_git_config` 只在测试里被调用而 install-hooks.sh 未程序化调用 → 接线失败（铁律 0-2）；若 `verify-parallel --ci-pr` 只在测试出现而 ci.yml 未调用 → 迁移失败（D311 工具接线——「已建但零生产调用」活例）。上线前 grep 确认每个新 export 至少 1 个**生产**调用点（测试调用不计，S-3）。

---

## 9. Architecture Layer

**L0（控制塔工具层，脚本/钩子 + CI + 文档）**。理由：
- 改动全在 `scripts/`（install-hooks.sh / pre-push-check.sh / verify-parallel.sh / 删除 post-merge-cleanup.sh）+ `.github/workflows/ci.yml`（CI）+ `docs/` + `tests/`，非五层产品代码；`src/` L1-L5 零改动。
- 逻辑 = shell/bash 脚本（clone 配置初始化 / verify-parallel CI 模式 / 门禁迁移）+ Python（verify-parallel 调 devdoc_writeset）+ YAML（CI）。
- 架构门禁 `check-architecture.sh`：本任务不改 `src/`，无跨层违规，天然通过。**同 D539 分层结论（控制塔 L0 工具层），本单只把隔离机制从 worktree 升格 clone + verify 迁移 + 配置初始化。**

---

## 10. Completion Standard（可验证，入口→交互→结果）

> 派单验收（影子提交断言/隔离断言/并发冲突断言/拉平断言/门禁断言）+ 治理 v3 五必答题，逐条给可证伪判据（K3 可核，非声称）。每条附「命令 + 断言 + 预期输出」——验收物理可复现，禁止静态 grep 冒充（M2 红线）。

1. **影子提交断言（worktree + clone 各一次真实 commit）**：在**真实 clone**（`git clone <remote> ../synova-clone-<task>` + `bash scripts/install-hooks.sh`，确保 identity 已配）+ **worktree** 各做一次真实 commit。断言：
   - `grep -q "COMMITTED | pre-commit PASS (hook 层登记) | HASH=" .claude/bypass.log` → 命中（影子提交登记）
   - `git log --oneline | grep -q "chore: bypass COMMITTED 登记 (auto hook, D521)"` → 命中（影子提交生成）
   - `git status --porcelain` → 空（树干净，无残留脏 bypass.log）
   - **worktree 与 clone 两环境各跑一次，都通过方算过**（§7.1 clone-shadow-commit.test.sh 集成 harness 已物理覆盖；这里强调真实 clone + 真实 worktree 各一次）。
2. **隔离断言**：双 clone 沙箱，A clone commit → B clone 的 index 哈希 + `current-brief.<B>` 零变化（sha256 指纹比对，§7.1 用例 4）。→ 独立 clone 物理隔离成立。
3. **并发冲突断言**：试点任务全程幽灵对象 / 脏 index / 覆盖 = **0 次**。→ 运行期采样（git status/git gc 检查）+ 台账记录（K3 可核）。
4. **拉平断言**：每任务开工 `git fetch --all && git pull --ff-only` 1 次（本地前推送不再多做协调）。→ 记录开工 pull 命令执行次数（每任务 ≤1）。
5. **门禁断言**：13 组门禁在 clone 内全绿 + CI 权威不变（SYNO_CI=1 硬阻断）。→ clone 内跑 `bash scripts/pre-commit-check.sh` exit 0；CI quality+test job 全绿（含新增 verify-parallel 步骤）。
6. **verify-parallel 迁移断言**：本地 `pre-push-check.sh` 不再对 `--scan-today` `exit 1` 拦推送；CI 跑 `verify-parallel.sh --ci-pr origin/main`。→ `bash scripts/pre-push-check.sh` 通过（门禁5 软提示不阻断）+ ci.yml 步骤存在（grep）。
7. **配置初始化断言**：clone 内 `git config --local user.name` / `user.email` / `core.quotepath` / `credential.helper` 均已设（仅缺失才写，已有不覆盖）。→ §7.1 用例全过 + clone 实测 `git config --list`。
8. **接线断言**：`grep -rn "_ensure_clone_git_config" scripts/install-hooks.sh` 命中；`grep -rn "verify-parallel.sh --ci-pr" .github/workflows/ci.yml` 命中（生产调用点，非测试）。→ §8 表。
9. **诚实声明（clone 成本实测）**：clone 的磁盘/时间成本用实测值（`du -sh` + `time git clone`），不拍脑袋——文档化到派单/协调文档，供创始人判断「worktree vs clone」成本。→ 附实测数字。
10. **代码质量**：bash -n 三脚本语法通过；无 as any（无 src/ 天然）；无静默吞错（`2>/dev/null` 有 swallow-ok 或降级链路）；降级显式 degraded（铁律 11/24/31）。→ bash -n + check-silent-swallow + grep。
11. **合规**：不触 `scripts/audit/`、`src/`、`scripts/pre-commit-check.sh`；post-commit.sh/synova-commit 未改（git diff 确认）；`git diff --name-only` 与写集一致。→ diff 对账。

> **边界诚实记录**：① 本单「编码一律 clone」是**试点 + 配置 + 验证**，非「pre-commit 硬拦非 clone 提交」的全量门禁（后者涉门禁本体 + CTO 拍板，留后续）；② 主树「引导 clone」若需改 task-start 引导文本（worktree→clone），单列 CTO 审，不计入本单已交付；③ delete post-merge-cleanup 后 loop-score 该项计 0（文件确已删，合理），如需清零分值需改 loop-score（单列）。上述 3 点 K3 审计可核，非 overclaim（S-2）。

---

## 11. Auth Doc References

- [派单 D540 clone-pilot-shadow-commit](docs/synova/coordination/派单-D540-clone-pilot-20260827.md) — 本任务主依据（spec 必答题 1-5 + 写集约束 + 验收 + 交付要求）；**含 D540 派单修正两次不实教训（影子提交已恢复，非失效）**
- [D507 并行撞车根治方案（三层防线 + §三 否决独立 clone → 本单反转升格）](docs/synova/coordination/并行撞车根治方案-D507-20260823.md) — 根因（共享 git 单例）+ 三层防线；本单把独立 clone 从「否决」升格为「主方案」
- [D539 session-worktree-isolation dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D539-session-worktree-isolation-20260827.md) — 同类控制塔隔离任务，结构/分节/写集对齐；本单沿用其主树 `_assert_dev_worktree`
- [D521 提交链收敛](memory/notes/implemented/2026-08-24-d521-submit-chain.md) — 影子提交 COMMITTED 登记（hook 层，本单验证对象）
- [D537 控制塔并行污染+提交链摩擦](memory/notes/implemented/2026-08-26-d537-tower-parallel-commit-friction.md) — #4 恢复影子提交段 + 「改共享 hook 先看全历史段落」教训（本单不改 post-commit 依据）
- [D352 dev doc 范例](docs/plans/codex/implementation/SYNOVA-IMPL-D352-resolver硬化-20260813.md) — 结构对齐（写集表 / 权威引用带原文 / 缺陷分节 / red→green / 决策参考 / DS 对应 / 自检清单）
- [PRODUCT-BRIEF.md](.claude/PRODUCT-BRIEF.md) — 北星锚定（§七 我犯过的错 #4 数据污染 + §八 Loop Engineering 进程系统）
- [AGENTS.md 铁律](/Users/wane/SynovaAgent/AGENTS.md) — 0-2 接线 / 11 / 24 / 31 / 35 / 37 / 38 / 39 / 47 / 48
- [D336 多 Agent 协作协议](docs/synova/coordination/MULTI-AGENT-COLLAB.md) — 四角色两条线 + 审计红线（scripts/audit/ 禁碰）+ 一人一事一分支
- 现状源码（只读生产事实，基线 origin/main `ed28ac5`）：`scripts/hooks/post-commit.sh:69-87`、`scripts/control-tower/synova-commit:607/681-727`、`scripts/install-hooks.sh:85-119`、`scripts/pre-push-check.sh:348-364`、`scripts/control-tower/verify-parallel.sh`、`.github/workflows/ci.yml`、`scripts/workflow/post-merge-cleanup.sh`、`scripts/workflow/task-start.sh:71-111`、`.gitattributes`、`.gitignore`

---

## 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 独立 clone vs worktree | A 用 worktree（D507/D539 现状）/ B 升格独立 clone（治理 v3）+ D507 §三 曾否决 | 治理定稿 v3「层1 独立克隆治本 + 层2 单源化」+ 业界标准（git clone 完全隔离）+ Anthropic（真·物理隔离：连对象库都不共享，断 M8 类共享 ref；跨机单源化）+ D507 否决理由（磁盘/成本用实测值兑现） | **B 独立 clone**——作为治理 v3 主方案；D507 反对理由（磁盘/hooks 漂移）用 §5.3 配置初始化 + §10 实测成本兑现（hooks 漂移靠 clone 后同批 install-hooks.sh 消除） |
| 是否改 post-commit.sh | A 改（防 clone 降级）/ B 不改（只前置配置） | 第一性原理（机制已恢复，问题是 clone 缺 identity 配置，不是 hook 逻辑）+ Anthropic（fail-closed：配置前置堵 L87，而非改 hook 填降级）+ D537 教训「改共享 hook 有二次覆盖风险」 | **B 不改**——用 install-hooks.sh 前置身份配置堵 L87；改 post-commit 是治标（且高危），配置前置是治本 |
| clone 配置初始化放哪 | A install-hooks.sh（clone 后一次）/ B 新 clone 脚本 / C task-start | 第一性原理（clone 后唯一必然执行的初始化 = install-hooks.sh）+ 派单「与 install-hooks 同批」+ Anthropic（幂等 + 失败降级不阻断）+ 零新组件 | **A**——install-hooks.sh 加 `_ensure_clone_git_config`；不新增脚本（零新组件红线） |
| verify-parallel 迁移 | A 本地保留 --scan-today + CI 加 / B 本地去强阻断 + 全移 CI | 派单「本地 pre-push 不再强制 --scan-today；CI/PR 对比 base..head×已合」+ 第一性原理（本地单机多 session 语义不准，CI base..head 是权威）+ Anthropic（CI 权威物理拦截，本地减摩擦） | **B**——本地去强阻断（软提示），CI 加 `--ci-pr` 权威拦截（fetch-depth:0 已确认） |
| 主树阻断 | A 复用 D539 `_assert_dev_worktree`（主树阻断已有了）/ B 新检测 | 派单「复用 D539 开工端阻断还是新检测？」+ 第一性原理（D539 已拦主树，语义=主树非 dev 工作区，本次只是目标机制 worktree→clone）+ Anthropic（fail-closed：主树阻断已有，不重复造） | **A 复用 D539**——主树阻断已有；本单把「引导」承载在 install-hooks 配置初始化 + 文档化；若需改 task-start 引导文本 → 单列 CTO 审 |
| post-merge-cleanup 删除后 loop-score | A 不动 loop-score（文件删 = 该项计 0）/ B 改 loop-score 清零 | 铁律 37（死码删）+ 第一性原理（文件确已删，该项计 0 合理）+ 防膨胀（改 loop-score 不在写集） | **A 不动 loop-score**——计 0 可接受；如需清零分值单列 CTO 审 |
| 协调文件 git 同步 | A git-tracked 走普通 git 流 + 运行时 per-clone / B 全 git-tracked | 第一性原理（git-tracked=跨机单源；运行时 per-clone=物理隔离，正是独立 clone 的意义）+ Anthropic（union 合并 append-only 日志）+ 派单「协调文件 git 同步」 | **A**——task-state//union 日志 git-tracked；current-brief.*/session-registry.json/.git/index per-clone（gitignore 去跟踪已有） |

> **参考：Anthropic（fail-closed + 隔离可测 + 接线物理验证 + 契约优先 + 幂等配置）+ 第一性原理（独立 clone 是共享 .git 的根治；影子提交是身份缺失降级，幂等配置前置是治本）+ DeepSeek（最少机制/零新组件：复用 install-hooks + verify-parallel + D539 阻断）+ DSH 理念（每 session 独立持久化上下文）**。收敛检查：各参考系指向一致（独立 clone / 不改 post-commit / 配置前置 install-hooks / verify 全移 CI / 复用 D539 阻断 / 协调文件二分），与本任务五必答题依赖序一致，无分歧。

---

## 自检清单

- [x] 北星 front-matter 已写（PRODUCT-BRIEF §七/§八 锚定）+ 服务用户/场景/终态/完成标准/当前进度五要素齐，对齐 §五 数据污染根因
- [x] 现状核实**写实**：影子提交**已恢复**（D537 #4，post-commit.sh L69-84），非失效——本单是「验证 clone 照常 + 前置配置」，不误判「需修复」（M7 防 + D540 派单修正两次不实教训）
- [x] 现状 grep/read 实测（§4.1/§4.2，基线 origin/main ed28ac5）：post-commit.sh L69-87、synova-commit L607/681-727、install-hooks.sh L85-119、pre-push-check.sh L348-364、verify-parallel.sh、ci.yml（fetch-depth:0）、post-merge-cleanup.sh（孤儿）、task-start.sh L71-111、.gitattributes/.gitignore
- [x] **基线 = origin/main 确认**：本地 feat/d505-impl 的 post-commit.sh 是 V4.5.1 旧版无影子提交段（claim-verifier 环境差异检查 + D540 教训「必须 git show origin/main 读权威版」）
- [x] **影子提交断言链物理验证**：真实沙箱 git 实测（§10 前置 + §7.1）：identity 配置 → commit 成功 → COMMITTED 追加 + 影子提交生成 + 树干净；**无 identity → 「Author identity unknown / Please tell me who you are」→ L87 降级路径真实触发**（本机无 global identity 已实测确认）
- [x] 写集表（3 修改 + 1 删除 + 3 新建）+ 生产调用点（§8：install-hooks 配置函数 + ci.yml verify-parallel --ci-pr + pre-push 去强阻断 + post-merge-cleanup 删除 grep 零引用）
- [x] 测试 red→green 表（§7.1：配置幂等/仅当缺失才写/env 覆盖/降级 + 影子提交集成 harness COMMITTED/降级/防递归/隔离 + verify--ci-pr block/pass/degraded）+ 降级（§7.3）
- [x] 决策参考（S-12）：独立 clone vs worktree / 改不改 post-commit / 配置放哪 / verify 迁移 / 主树阻断 / loop-score / 协调文件 七决策点收敛（参考系 + 结论）
- [x] 验收物理可复现（§10）：影子提交断言、隔离断言、并发冲突断言、拉平断言、门禁断言、迁移断言、配置断言、接线断言，逐条给命令 + 断言 + 预期输出，禁文档声称（M2 红线）
- [x] 术语统一（独立 clone = git 原生 / 影子提交 = D521 hook 层 / 不混用）；as any=0（无 src/ 改动，天然）
- [x] 边界诚实记录（§10 边界 3 点：非全量硬门禁 / task-start 引导文本单列 / loop-score 计 0）——S-2 不 overclaim
- [x] 不是凭记忆 / 不用 --no-verify（dev doc 只写文档不写代码）

> **交付边界**：本 dev doc 只写规格（不含实现代码）。编码 session 按 §5 写集实现 + §7 测试 + §8 接线 + §10 验收 + task-state/D540 回填（spec 段 + status→spec_done + slice=clone-pilot）；走 K3 审计；验收 = §10 逐条对照（测试断言 + grep，非声称）。**编码 session 首步必须 `git fetch --all && git checkout origin/main`（或基于 origin/main 建独立 clone），禁止在 stale 的 feat/d505-impl 主树上实现。**
