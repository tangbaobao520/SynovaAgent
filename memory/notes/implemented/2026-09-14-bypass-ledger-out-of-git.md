---
状态: implemented
日期: 2026-09-14
决策: bypass 证据账本从 git 跟踪文件（.claude/bypass.log，每次提交必脏）迁到 per-session 落点（.sessions/<sid>/bypass.log，git 忽略）；迁移分两 PR —— Stage 1 双写兼容并存（旧路径仍权威），Stage 2 才切换+清理。**Stage 2 已落地（D970，2026-09-25）**：停写旧路径 + 删除影子登记提交 + 旧路径出库（`git rm --cached`）+ 历史证据冻结归档 `docs/authority/bypass-ledger-archive/`。
理由: 写冲突的根因是「多写者写同一个被 git 跟踪的文件」——union merge driver 只是补丁；换会话级落点后写者之间零竞争，且落点已被 .gitignore 忽略 → 提交不再产生 bypass.log 变更。一次切完会同时失去旧证据链与新链路的验证窗口，故派单要求分两 PR。
---

# bypass 账本出库（D735）

## 触发场景

`.claude/bypass.log` 是 **git 跟踪文件**，post-commit hook 每次提交追加一行证据（COMMITTED / detected-bypass / possible-bypass）。
后果实测：
- **每个分支都带 bypass.log 变更** —— 批 A 开工时抽样 origin 上 3 个真实分支（`feat/win-d704-*`、`fix/d726-*`、`feat/mac-d716-*`），**100% 出现** `.claude/bypass.log`；
- 多 PR 并发合并必然冲突，只能靠 `.gitattributes:14` 的 `merge=union` 打补丁；
- 每个提交后面跟一个「bypass COMMITTED 登记」影子提交（D521），只为把该文件弄干净。

## 决策内容

1. **落点换成 per-session**：`.sessions/<sid>/bypass.log`。`.gitignore:83` 已忽略 `.sessions/` → 写入**零 git status 变更**（这正是验收「连跑 3 次提交 → git status 零 bypass.log 变更」的物理基础）。
2. **会话标识优先级**：`SYNO_SESSION_ID` > `DSH_SESSION_ID` > `SYNO_TASK_ID` > `TASK_ID` > git 分支名 > 仓库目录名 > `default`；一律归一为 `[A-Za-z0-9._-]`（路径安全 + 跨平台）。回退到后两档时 stderr 显式提示（铁律 11，不静默）。
3. **分两 PR**（派单硬要求）：Stage 1 = 解析器 + 双写 + 联合读（旧路径仍权威，零行为变化）；Stage 2 = 停写旧路径 + 清理 union driver/内置豁免 + 其余 13 个消费方切读。
4. **D331 等价替代**：对账器 `check-bypass-log.sh` 的来源由单一旧路径改为 **union（旧路径 + 本 session + 仓库内其他 session）**，去重后稳定排序。D331 的语义、exit code、fail-closed 行为**全部不变** —— 证据链不丢，只是读取面变宽。
5. **fail-closed 不许静默回退**：新落点不可写 → `append` exit 2。**不得**因写不进新落点而悄悄只写旧路径（那会让迁移期证据静默分裂，且 Stage 2 切换时会发现新链路从来没被验证过）。
6. **两个测试注入缝**：`SYNO_BYPASS_LEDGER_DIR`（落点目录）+ `SYNO_BYPASS_SESSIONS_ROOT`（仓库级扫描根）。后者是实测补的：只注入前者时，`sources` 仍会扫到真实仓库的 `.sessions/`，测试不 hermetic（首轮跑就暴露）。

## 实测踩到的坑（免疫细胞候选，**同一坑第二次**）

**D370 bash + 全角变量边界**：`fail "sources 条数 = $CNT（应 2，重复即去重失效）"` 里 `$CNT` 紧贴全角 `（`，
`LC_ALL=C.UTF-8` 下 bash 把 `（` 并入变量名 → `unbound variable`，**只在失败路径触发**（门禁最需要说话时哑掉）。
批 A 已在 `check-pr-budget.sh`(×3) 与 `check-ownership.test.sh`(×1) 修过同型问题，本 PR **开测即又踩一次**。
→ 本轮起，新增/修改控制塔脚本后**先跑 `$VAR` 紧贴非 ASCII 扫描**，再跑测试（本 PR 的 6 处即由此一次扫净、残留 0）。
建议：把该扫描做成 `scripts/control-tower/` 的常驻 check（铁律 35：能变 check-*.sh 的不靠 review）——仍未做，记为待办。

## 顺带实测发现（非本 PR 引入）

`tests/control-tower/tag-bypass-wiring.test.sh` 在 **origin/main 上已是红**：3 条失败（「孤儿 tag V8.8.8 → exit 1 — exit=0 期望 1」等），
在干净 worktree 上对 `origin/main` 实测复现，与本 PR 改动无关。已如实登记，未在本 PR 修（不属写集）。

## Stage 2 落地记录（D970，2026-09-25）

### 落地内容
1. `.gitattributes` **只删一行**（`.claude/bypass.log merge=union`；`reference-map.md` 那行与注释未动）——`git diff --numstat` = `0 1`。
2. `.gitignore` 增显式 `.claude/bypass.log`（原被 `*.log` 顺带覆盖，显式化以记录意图）。
3. `git rm --cached .claude/bypass.log`（**文件保留磁盘**，231530B / 1802 行 —— 证据链保全）。
4. `scripts/hooks/post-commit.sh`：`_bypass_append` 改为**只写 per-session**；**删除影子登记提交**（其唯一目的是让被跟踪的旧路径「永不脏」，出库后该目的消失）。
5. `scripts/control-tower/bypass-ledger.sh`：`sources` 读面 = 冻结归档 + 旧路径（若存在）+ 全部 per-session，全量 `sort -u` 去重 + 稳定排序。
6. `scripts/control-tower/check-bypass-log.sh`：接受「账本不随仓走」；**exit code / fail-closed 语义不变**（0 全有记录 / 1 有缺记录或**全部来源不可读** / 2 base 或 git log 不可用）。

### 证据链保全：选甲（冻结归档）+ 显式登记缺口
**参考**：第一性原理（证据必须能被任意 clone 读到；「多写者写同一被跟踪文件」本身就是根因）+ Anthropic 基线（运行期产物与版本化产物分离；不可变、可核）+ 开源实证（追踪型 append-only 共享日志在并发分支下必然需要 union 之类的补丁，属已知反模式）+ 收敛检查（本卡要求 `check-bypass-log.sh` 语义不变 ⇒ 不能在本卡改判据）**+ 结论：选甲**。

- 保全的：**截至冻结时点的全部历史证据**（1802 行随仓，任一 clone 可读；`sources` 已纳入 `*.txt` 归档）。
- **未解决并显式登记的缺口**：冻结之后，**他机/他工作区**产生的登记只落在**其本机** `.sessions/<sid>/bypass.log`（该目录 git 忽略、不随仓走）⇒ 合并他机分支后再推送时，D331 仍可能判「缺记录」并拒推，需沿用既有的一次性补记（D451）。此缺口**在本卡之前就已存在**（台账 2026-09-23 ② / 2026-09-25 ② 已记），甲案**不使其恶化**，但**也不解决它**。
- 后续方向（不属本卡）：让「pre-commit 真跑过」这件事**随提交走**（如提交 trailer / git notes 证明），从根上移除对共享账本的依赖。

### 动机活体证据（本卡为何是 5 条 dirty PR 的唯一根因）
逐条实测 5 条 dirty PR（#761/#756/#757/#754/#742，head 取自 GitHub API）：
- `union` 在场：`git merge-tree --write-tree origin/main <head>` → **全 rc=0**、零冲突；
- 移除那一行后同一命令 → **全 rc=1**，冲突文件**全部且仅** `.claude/bypass.log`。
另：GitHub 服务端不认 `merge=union`（`PUT /pulls/742/update-branch` → HTTP 422），故 dirty **不是缓存过期**。

### 同类第二例（本卡未动，需升级）
`.gitattributes:20` `.claude/reference-map.md merge=union` 与 `:14` 同型（append-only 写者 + 服务端不认 union）⇒ 同样会在并发分支上产生真冲突。**本卡按派单要求未动它**，登记为待升级。

### 与本次并发的熔断实证
`origin/main` 的 `.claude/bypass.log` 含 2026-09-25 唯一一条 `detected-bypass head-mismatch marker=ce5b13b9… parent=2b38d177…`，
其中 marker 是 **merge 提交**（`Merge remote-tracking branch 'origin/main' into HEAD`）且 marker 与 parent **都不在 main 历史**
⇒ 陈旧 marker 型误判（`post-commit.sh:43-53` 自陈同类 **D524** 已实证）。该记录触发 `pre-commit-check.sh` 的 Gatekeeper
（`BYPASS_COUNT>0` 即硬阻断）**熔断全队当日合法提交**，本批经队长授权以 `SYNO_GATEKEEPER_ACK=1` 解封并留痕
（`.codex/control-tower/logs/degraded-events.log`）。**同类第 2 次 ⇒ 按红线升级。**

## 相关 D#

D735（本 Note，Stage 1 + Stage 2）· D970（Stage 2 执行卡）· D331（证据链对账门禁）· D451（纯补记豁免）· D457（union 合并）· D508/D513（tracking ref 陈旧致补记循环）· D521/CT-43（影子登记提交）· D524/D530/CT-45（Gatekeeper 熔断误伤）· D370（bash 变量边界教训）
