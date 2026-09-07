# K3 独立审计报告 — 七任务合并批 closeout（D575 + D576 + D577 + D578 + D586 + D587 + D588）

> 审计员：Kimi K3（独立会话，零上下文）
> 协议：AUDIT-PROTOCOL.md v1.1（L1-L4 四层，15 项清单）
> 审计基线：origin/main @ d197b40b（七任务均已合并入 main）
> 日期：2026-09-08
> 仓库：tangbaobao520/SynovaAgent（隔离审计工作区 `/Users/wane/Synova-k3独立审计`，分支 `audit/k3-20260908-seven-task-batch`）

---

## 〇、运行环境注记（先行，D316 教训）

| 项 | 值 |
|---|---|
| 机器/会话 | Mac（darwin-arm64），DSH 隔离审计工作区 |
| Node | v24.19.0（初始）→ **v22.23.2（终验，与 D575 前审 v22.22.0 同系）** |
| vitest | 4.1.8 |
| native 依赖 | better-sqlite3 11.10.0：Node 24 下 fork worker 退出时 `Assertion failed: (env) != nullptr` 崩溃（Node 24 cleanup-hook 已知不兼容）→ `npm rebuild` 切 Node 22 ABI 后全绿。**环境依赖失败 vs 恒失败的 D316 判别：属环境问题，非代码回归**（D579-D582 批同型） |
| 缺包 | 工作区 node_modules 缺 zustand（root package.json 有声明）→ `npm install --no-save` 补齐（未动 package-lock） |
| 环境变量 | DSH 壳注入 `ELECTRON_RUN_AS_NODE=1`（D575 task-state env_notes 已预告坑）→ 复跑时 `env -u` 剥离 |
| CI job 级证据 | **不可独立复核**——GitHub 私有仓库无 token/gh CLI，无法拉 Actions check-runs。L3 以本地物理证据替代（bypass.log / pre-commit 登记 / 测试独立复跑），并显式标注该限制 |
| 复跑时间戳 | 全部复跑 2026-09-08 01:53-02:05 +0800 |

**材料自查（7 项自收集）**：提交集 = `git log --all --grep=D5xx` 全量映射（§1）；diff = `git show <merge-hash>`；dev doc = 5 份 spec 实读；task brief = `.claude/task-briefs/` 3 份实读（D587/D588/D586）；AGENTS.md + PRODUCT-BRIEF.md 实读；审计基线 = `audit-check.py --full`（2 PASS / 918 WARN / 481 FAIL，写集零命中）+ `tsc --noEmit` = 28（写集零命中）；执行证据 = bypass.log 1133 行全读。

---

## 一、终局 Verdict（每任务独立，禁 CONDITIONAL 滞留——D572 P1 教训）

| 任务 | 内容 | 合并提交 | Verdict | 一句话依据 |
|---|---|---|---|---|
| **D575** | LLM 配置首启向导 | c124f8c8 (#354) | ✅ **PASS**（合并后补充审计；P1×2 开放项存续） | 前审 2026-09-05 PASS 复核成立；64 用例基线独立复跑全绿；接线/安全/零依赖全复核；写集合并后零漂移 |
| **D576** | 兑换机制修复 CT-53/CT-54 | e9da5123 (#351) | ✅ **PASS** | 5/5 + 13/13 独立复跑绿；25 k3_only 物理存在；三机制（task_redeem/存量降级/k3_only 封顶）在终版 calc/redeem 中存活；alloc worktree 扫描落地 |
| **D577** | 哨兵阈值真实挂载 | ece4e268 (#355) | ✅ **PASS**（合并后补充审计） | 前审 PASS 复核成立；threshold-injection 10/10 + flip 1/1（盘面字节级恢复，git clean）+ tests/sentinel/ 214 绿独立复跑；接线点 loader:259/runner:1203 基线存活 |
| **D578** | Win 真机实测 1-2（D572 P0 本体） | 1493539f（台账）+ 9cfd7c36（D581 收尾） | ✅ **PASS**（1-2 四断言 evidence 待 Win 复跑入 git——标注状态，不兑换） | 根因链代码级物理证实（backend-spawn.cjs:70 prod 命令 + build-synova.cjs beforePack 守卫 D581）；D581 测试 23 绿；BOM 已修；Win 实测本体为机器记录（台账 1493539f），Mac 不可复现如实标注 |
| **D586** | LLM 错误码 taxonomy（B-01） | 56c4dd1d (#400) | ✅ **PASS**（承接前审 2026-09-07 PASS，本批独立复验） | 22/22 + providers 3/3 绿；DSH 锚点（error.js 四码 + adapter-failure.js:13）本机逐字核验属实；接线 base.ts:39+237/248/258；前审 P1×1 + P2×3 全部复验仍真 |
| **D587** | 工具结果修剪器（B-04） | 75f13b56 (#408) | ✅ **PASS**（P2×2 随附） | 6/6 绿（25 expect）；接线真实（tool-loop-executor.ts:151/:282，生产消费 conversation-engine.ts:447）；降级诚实（log.warn + degraded + 原文）；零依赖零 as any |
| **D588** | 会话投影注册表（B-07） | eebd9c99 (#405) | ⚠️ **CONDITIONAL PASS**（创建阶段 PASS；接线阶段缺位。条件单一可机检，非滞留） | 7/7 绿（whole-value 断言真实）；代码质量高；**但 src/ 内零生产引用（M3 家族建成未接线）**——plan.json phase 3 声明 wiring deferred（founder 批准通道）合法，phase 4（wire src/agent/synova-agent.ts）无 D# 承接；spec DS1 口径被 brief 弱化。条件：① 接线任务 D# 显式立项 ② task-state/D588.json 壳补登记 ③ DS1 口径统一 |

**批次级 P0 = 0。**

---

## 二、D575 — 合并后补充审计（前审 2026-09-05 PASS，本批基线复验）

### 2.1 提交集与状态

- 提交集：派单 d5e5310f → spec cbcb25aa → 复核 0e03166d/ae516cba → task-state 21f6eaf2 → 编码 6517c052 → squash-merge **c124f8c8**（#354）。
- **合并后零漂移**：`git diff c124f8c8..d197b40b --stat -- <13 个写集文件>` = 空。
- task-state audit 段 = null（main 现状）——前审报告未入库所致（见 §8 B1）。

### 2.2 基线独立复跑（2026-09-08）

| 命令 | 环境 | 结果 |
|---|---|---|
| `npx vitest run tests/services/llm-credential-store.test.ts tests/routes/llm-config.test.ts tests/llm-config-frontend.test.ts` | Node 22.23.2，`env -u ELECTRON_RUN_AS_NODE` | **64/64 passed**（store 12 + API 集成 21 + 前端 31，与声称 64 精确一致） |

Node 24 首跑前端文件崩溃（better-sqlite3 cleanup-hook ABI）——环境注记先行，非代码回归。

### 2.3 关键物理复核（file:line @ d197b40b）

| 审计项 | 证据 |
|---|---|
| server 挂载位 | `src/server.ts:50` import + `:297` `app.use(llmConfigRoutes)` —— 紧邻 `:298` `app.use(jwtAuthMiddleware)` **之前**（首启无用户系统必须可用，spec 决策 5） |
| 前端调用链 | `App.tsx` welcomeState 判定 → `WelcomeScreen.tsx` firstLaunch 分支 → `<LlmSetupCard/>`（L5-13 注释+实现）；StatusBar 黄条消费（前审已全链核实，本批 spot 命中） |
| 热重载同进程 | `tests/routes/llm-config.test.ts` L165-177：POST 后 `process.pid` 不变 + 同进程 `loadConfig().llmApiKey === KEY_NEW`（真实 HTTP 路由 + stub 上游，铁律 12） |
| 凭证安全 | `src/services/llm-credential-store.ts:152` `chmodSync(tmpPath, 0o600)`（原子写 tmp+rename :149-154）；`synova.json` `grep -cE "apiKey\|api_key"` = **0**；响应只回 maskedKey（routes L139） |
| G1 零 DSH 依赖 | `grep -rn "@deepseek-ai" src/ electron-renderer/src/` = **0** |
| tsc 基线 | 28 错误全部在 `_extinct` 聚合 + server.ts + ima.ts，**写集零命中** |

### 2.4 前审 P1 开放项存续核验（合并后状态）

| # | 项 | 基线状态 | 判定 |
|---|---|---|---|
| P1-1 | evidence 落盘被 .gitignore:76 忽略 → 12 件 GUI/生产态证据不可复核 | `git check-ignore evidence/` 仍命中；派单材料所述 `docs/synova/audit-reports/D575-ticket-slice-evidence-20260906/` **在 main 不存在**（唯一存在的是 `D580-ticket-slice-evidence-20260906`——派单材料路径错引，§8 B2）；GUI 级证据唯一 git 跟踪载体 = `k3-D575-D577-closeout.json`（前审结论摘要） | **仍开放**。等价自动化代理（64 用例 + 渲染测试）已复核绿；GUI 截图/生产态探测证据不可复核的事实不因本批改变 |
| P1-2 | `/api/llm/config` 无认证挂载（localhost 任意进程可读写 LLM 凭证） | server.ts:297-298 物理确认挂载仍在 JWT 之前 | **仍开放**（spec 决策 5 已登记：首启无用户系统；D483-D486 收编窗口，跟踪收编） |
| P2-4 | 未挂产品线缺口（桌面端无「首启 LLM 配置」验收点） | product-lines.yaml 无对应点 | 存续，见 §9 兑换建议 |

**verdict 复核结论：前审 PASS 成立，本批维持 PASS。** 两项 P1 均为已登记、有既定收编路径的开放项，不阻断 PASS，但收编前不视为闭合。

---

## 三、D576 — 兑换机制修复 CT-53 + alloc 在途盲区 CT-54

### 3.1 提交集

单提交 **e9da5123**（#351）：9 文件 = calc-progress.py +17 / redeem-progress.py +49 / alloc-task-id.sh +35 / product-lines.yaml +25 / 测试 157 新建 / brief / memory note / bypass.log。写集与 task-state 声明一致。

### 3.2 独立复跑

| 命令 | 结果 |
|---|---|
| `bash tests/control-tower/redeem-task-redeem.test.sh` | **5/5 通过**（T1 task_redeem 类型 / T1b 无 k3 冒充 / T2 k3_only 跳过 / T3 存量降级→pending_k3 / T4 k3_only 封顶） |
| `bash tests/control-tower/alloc-task-id.test.sh` | **13/13 通过**（含 D550 撞号回归 + worktree 扫描零破坏） |

### 3.3 机制物理核验（终版文件 @ d197b40b）

| 机制 | 证据 |
|---|---|
| CT-53 兑换类型诚实化 | `redeem-progress.py:58` `REDEEM_RECORD_TYPE = "task_redeem"`；calc `:178` machine 路径含 task_redeem |
| 存量假 k3 降级 | `calc-progress.py:95-98`：`record_type=="k3"` 且 note 含「自动兑换（redeem-progress.py）」→ 加载时降级 task_redeem + degraded 记录（不改历史文件） |
| k3_only 封顶 | `calc-progress.py:180-187`：k3_only 点 fail→rejected / pass→verified / **其余→pending_k3**（自我指认禁止）；yaml `grep -c "k3_only: true"` = **25** 精确一致 |
| CT-54 worktree 盲区 | `alloc-task-id.sh` 9 处 worktree 逻辑：`git worktree list --porcelain` 扫描各 worktree 的 task-state/D*.json 合入占用表；非 git 目录降级跳过 + 显式提示（不静默） |

### 3.4 15 项压缩表

接口/路径/边界/数据流/接线（calc+redeem 由 refresh-all.sh A3.5/A4 环节调用不变）/降级（存量降级记 degraded 显式）/测试契约/覆盖/文件驱动/自报交叉/偏离（写集 vs 声明一致）/控制塔（bypass.log 窗口内全 PASS，e9da5123 无 --no-verify）/版本（未触 VERSION.md）/并行（与 D575/D577 写集零重叠，§8 表）——**全部通过**。Edge ID 项 N/A（非本体图任务）。

### 3.5 后续演进确认

用户披露「calc-progress.py 后续被 D579/D582（CT-62）追改」属实：`git log e9da5123..d197b40b -- scripts/product-lines/calc-progress.py` 命中 1c084775（D579）+ acc228dc（D582）——两任务均已在 2026-09-06 批审计 PASS（报告 2026-09-06-K3-D579D580D581D582-closeout.md 已入库 main）。D576 三机制在终版存活（§3.3 证据取自终版文件）。

**verdict：PASS**（无 P0/P1/P2 实质发现）。

---

## 四、D577 — 合并后补充审计（前审 2026-09-05 PASS，本批基线复验）

### 4.1 提交集与状态

派单 436e216d → spec e7a44f5f → task-state 2c696773 → 编码 46d296bd → squash-merge **ece4e268**（#355）。task-state audit 段 = null（同 D575，§8 B1）。

### 4.2 基线独立复跑（2026-09-08）

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/sentinel/threshold-injection.test.ts` | **10/10 passed**（T1-T9 + T8 卫生） |
| `D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts`（独占） | **1/1 passed**；跑后 `git status` 干净（afterEach 字节级恢复物理证实） |
| `npx vitest run tests/sentinel/` | **29 文件 214 passed + 1 skipped**（flip 无 env 跳过），0 failed |
| `python3 tests/control-tower/calc-k3-stale.test.py` | **15/15 OK**（含 CT-62 同日边界双用例）——注：该文件实为 D579/D582 CT-62 写集，派单材料将其挂 D577 属归属错位（§8 B2），测试本身绿 |

### 4.3 关键物理复核（file:line @ d197b40b）

| 审计项 | 证据 |
|---|---|
| 单一解析点存活 | `src/sentinel/sentinel-loader.ts:130` `resolveThresholds` + `:259` wrapper 每 check 注入（生产调用点）；`src/sentinel/runner.ts:1203` `getThreshold` 委托 |
| 合并后漂移核验 | `git diff ece4e268..d197b40b -- src/sentinel/` 仅 runner.ts +211/-5，**全部来自 D580（e8d11fd6，已审计 PASS）**——工单类型/状态机，与 D577 阈值机制零交集；D577 14 个 live aggregate 无 D577 相关漂移（`_extinct` 之外零改动） |
| DS6 DEPLOYS 修复存活 | `extensions/sentinels/customer-demand-shift/aggregate.ts:50-54` log.warn + `{findings:[],degraded:true}`（前审 file:line，本批 spot 命中） |
| tsc 基线 | 28 = 28，写集 23 文件零命中 |

### 4.4 验收点级结论（7-2 / 8-1 / 10-3）

维持前审点级 PASS（k3-D575-D577-closeout.json 已记录 pass×3，产品线已走 verified）：
- **7-2** PASS：14 aggregate 40 判定行换 `th()` 源 + loader:259 注入 + T4/T8 绿（本批 10/10 复核）
- **8-1** PASS：flip 独立复跑 1/1（本批）+ 盘面恢复核实
- **10-3** PASS：4 P0 哨兵接线存活（本批 loader/runner spot 命中）

**verdict：PASS**（前审 P2×2 计数漂移 34vs39 / ALLOWLIST 18vs17 存续，无 P0/P1）。

---

## 五、D578 — Win 真机实测 1-2（D572 P0 本体修复）

### 5.1 审计对象与方法

本任务交付物 = Win 真机实测记录（台账 1493539f）+ D581 收尾（9cfd7c36）。**Mac 审计机不可复现 Win 真机安装→出窗→healthz 流程**——如实标注，不假装复现（D316 纪律）。可物理审计的部分：① 根因链的代码级证据；② D581 三残留修复质量；③ 任务状态机一致性。

### 5.2 根因链代码级物理证实

| 环节 | 证据（@ d197b40b） |
|---|---|
| prod 启动命令 | `electron/backend-spawn.cjs:70` `{ bin: process.execPath, args: ['dist/backend.mjs'] }`——包内缺 `dist/backend.mjs` 必 spawn ENOENT（与台账根因链一致） |
| 打包通道 | `build-synova.cjs:94` `{ from: 'dist', to: 'dist', ... }` extraResources 本应打入 bundle——缺产物则空包 |
| D581 构建守卫 | `build-synova.cjs:36-68` `beforePack: assertBackendArtifact`：`dist/backend.mjs` 缺失 → throw（含三步构建链提示），成功路径返回 undefined（packager.js 实证 false 会终止打包） |
| 守卫测试 | `npx vitest run tests/electron/desktop-build.test.ts` = **23 passed + 3 skipped**（独立复跑绿） |
| ps1 BOM | `file scripts/desktop/win-install-verify.ps1` = **UTF-8 (with BOM)**——D581 修复已落盘 |

### 5.3 状态标注（用户指令：标注即可，不兑换）

1. **1-2 四断言 evidence 尚未入 git**：task-state/D578.json `residuals` 声明「1-2 兑换等四断言 evidence 入 git（D581 修脚本后 Win 复跑）」——main 内 docs/synova/product-lines/evidence/ 无 D578 Win 复跑证据（`ls` 确认）。状态 = **待 Win 侧复跑**。
2. 1-7 NSIS 升级路径未测（Win 下次会话）——存续。
3. CI run 33980824064（重打 + `test -f dist/backend.mjs` 门禁）为机器记录，无 token 不可复核——按台账登记采信为机器记录，不升格为独立复核结论。

### 5.4 发现

- **P2（归因 audit 线近失）**：侧支 commit cd56801c「chore(D578): task-state 回填 impl_done + **audit PASS**（Win 真机实测完成）」——由 Win 会话回填 audit 段，**自审计**（红线：审计结论只认 K3）。该提交未入 main（main 的 D578.json audit=null 正确），但暴露「task-state audit 段写入者无门禁」缺口（§8 L4-3）。

**verdict：PASS**（根因修复真实落地 + CI 守卫化；1-2 evidence 状态如上，兑换建议见 §9）。

---

## 六、D586 — 承接前审（2026-09-07 PASS），本批独立复验

### 6.1 前审报告状态

前审报告 `docs/synova/audit-reports/2026-09-07-K3-D586-closeout.md` 存在于本工作区但**未提交 git**（untracked）；task-state/D586.json 同态。本批将该 verdict 收录进本报告（git 跟踪）一并闭环（§8 B1）。前审内容经本批独立复验后才可承用——以下为复验结果。

### 6.2 独立复验（2026-09-08，@ d197b40b）

| 前审声称 | 本批复验 | 判定 |
|---|---|---|
| 22 用例全绿 | `npx vitest run tests/errors/llm-error-taxonomy.test.ts` = **22/22 passed** | ✅ 属实 |
| 22+3=25 全绿 | `npx vitest run tests/providers/` = **3/3 passed**（合计 25） | ✅ 属实 |
| 接线 base.ts:39 + 三边界 237/248/258 | `grep -n` 命中 base.ts:39 真调用 + finalizeAdapterFailure 调用点 237/248/258 | ✅ 属实 |
| EMPTY_RESPONSE types.ts:50 | 命中；ErrorCode 23→**24** 码（grep 计数 24） | ✅ 属实 |
| isXxx 合一分类 types.ts:774/788 | 命中（JSDoc 契约齐全） | ✅ 属实 |
| @deepseek-ai src/ = 0 | 独立 grep = **0** | ✅ 属实 |
| as any/never/unknown as = 0 | `git show 56c4dd1d -U0` 对 3 写集源文件 = **0** | ✅ 属实 |
| tsc 28 零命中写集 | 28 错误分布无 types.ts/base.ts/测试文件 | ✅ 属实 |
| DSH 锚点逐字一致 | 本机 DSH checkout `@deepseek-ai/dsh-llm@0.1.2-rc.1`：error.js 四 canonical 码（CONTEXT_WINDOW_EXCEEDED/QUOTA/EMPTY_RESPONSE/INVALID_CREDENTIAL）逐字命中；adapter-failure.js:13 `carried.code === ownErrorCode(error)` 逐字命中（前审所引行号 L22-42 因版本差偏移 1-2 行，内容零漂移） | ✅ 属实（**借鉴真实性核心断言独立证实**） |
| bypass 3 条均 PASS 非 --no-verify | bypass.log 全文 1133 行 **--no-verify 出现 0 次**；D586 窗口 3 条均为「pre-commit PASS (hook 层登记)」 | ✅ 属实 |

### 6.3 前审发现复验（P1×1 + P2×3）

| # | 前审发现 | 本批复验 | 状态 |
|---|---|---|---|
| F1 P1 | task-state/D586.json 缺失（全仓库零命中） | `git cat-file -e d197b40b:task-state/D586.json` = NOT in main | **仍真**（本工作区 untracked 版含前审 audit 段，待 CTO 回填提交） |
| F2 P2 | spec §4 写集表「2 修改+0 新建」实为 2+1 | spec §4 表头 vs commit 5 文件（测试新建） | 仍真（M7 家族） |
| F3 P2 | finalizeAdapterFailure INTERNAL fallback `retryable:true` vs `isRetryable(INTERNAL)=false` 语义缝 | base.ts:57-61 构造 `retryable: true`；types.ts:537 INTERNAL 在 false 返回组 | **仍真，基线未变** |
| F4 P2 | chat catch 无 log.warn（stream catch 有） | base.ts:235-238 recordFailure + re-throw 无 log；:256 stream 有 | 仍真（存量模式） |

**verdict：PASS**（无 P0；P1×1 + P2×3 承前审存续，兑换建议见 §9）。

---

## 七、D587 — 工具结果确定性修剪器（B-04）完整审计

### 7.1 提交集与 L2 对账

- 提交集：dev doc d3dcfb9e（D587/D588 合稿）→ 编码 ccbbc9ac/51ae050c（侧支，未入 main）→ squash-merge **75f13b56**（#408，= 2 内提交重做 + bypass 登记）。
- 写集实际：`src/llm/tool-result-pruner.ts` 149 行新建 + `src/agent/tool-loop-executor.ts` +23 修改 + `tests/llm/tool-result-pruner.test.ts` 143 行新建 + brief 78 行新建。
- **P2（M7）**：spec §4 写集表「1 新建 + 1 修改」——实际为 2 新建 + 1 修改 + brief（测试文件未计入表头；§5 已声明测试，与 D586 F2 同族计数漂移）。

### 7.2 L1 代码审计

| 项 | 判定 | 证据 |
|---|---|---|
| 范式落地 | ✅ | PRUNE_MARKER 逐字节同 DSH（:23）；码点计数 `Array.from`（:64-66）；resolveConfig 未知 key 抛错 + 整数断言 + head+marker+tail≤threshold（:86-111）；replay-safe 幂等（:132 未超阈值原样返回）+ 防御性后置断言（:139-146） |
| 契约（铁律 47） | ✅ | `pruneToolResult` JSDoc 输入/输出/降级三要素（:113-126）；错误类 code+phase+retryable（铁律 32，:49-59） |
| 接线深度（铁律 0-2） | ✅ **真实接线非 import-only** | `tool-loop-executor.ts:151`（非流式）与 `:282`（流式）两处 `content: this.pruneForPrompt(JSON.stringify(execResult))` 进 messages；生产消费链 ToolLoopExecutor ← conversation-engine.ts:447 |
| 降级诚实（铁律 24/31） | ✅ | pruneForPrompt catch → log.warn（含 code/phase/degraded:true）+ 降级原文返回（:37-48）——不阻断对话不丢数据 |
| 类型安全 | ✅ | 写集 diff `as any/never/unknown as` = 0（两处 grep 命中均为 brief 内「as any = 0」自检文字，非代码） |
| G1 零依赖 | ✅ | `grep -rn "@deepseek-ai" src/` = 0 |
| 测试质量（铁律 48） | ✅ | 6 用例 25 expect（≥3/例）；独立复跑 **6/6 passed**；覆盖正常/边界/降级三路径 |
| 架构边界 | ✅ | src/llm 纯函数层 + L2 agent 调用，无跨层 |

- red→green 的 red 阶段为 Win 侧自报（红态不入 git，不可独立复现）——如实标注，green 独立证实。

### 7.3 发现

| # | 级 | 发现 | 归因 |
|---|---|---|---|
| F1 | P2 | spec §4 写集表计数漂移（1+1 vs 实际 2 新建+1 修改+brief） | devdoc（M7） |
| F2 | P2 | L1-audit 报告引用 D587 实现 hash `ccbbc9ac`（pre-rebase 侧支版本，未入 main；main 实际 75f13b56）——文档引用漂移 | devdoc（M7） |

**verdict：PASS**（P2×2 随附）。

---

## 八、D588 — 会话投影注册表（B-07）完整审计

### 8.1 提交集与 L2 对账

- 提交集：dev doc d3dcfb9e → 编码 fbd7738f → fae709c2（CI 组4 红 → plan.json deferred）→ squash-merge **eebd9c99**（#405）。
- 写集实际：`src/store/session-projection.ts` 410 行新建 + `tests/store/session-projection.test.ts` 248 行新建 + `.claude/plan.json` 修改（phase 3 新增 + current_phase 2→3）+ brief 63 行新建。
- **P2（M7）**：spec §4 写集表「1 新建 + 0 修改」——实际含 plan.json 修改 + 测试新建（brief Q2 已声明 plan.json，spec 表未列）。

### 8.2 L1 代码审计（创建阶段交付质量）

| 项 | 判定 | 证据 |
|---|---|---|
| 范式落地 | ✅ | register 校验 stateVersion 非负安全整数 + 同 key 拒绝（:135-154）；eager drive + Object.is 变更门（:251-277）；checkpoint val = structuredClone 分离副本（:184-191）；restoreFloor one-below 锚点（:200-208）；restore 三条件 + 日志缩短抛错（:220-242）；惰性 fold（:282-317） |
| whole-value 承重不变量 | ✅ | wholeValue 单元变更时 apply(init,e) vs apply(prev,e) 深等价断言（:257-270）+ log.warn + 违规记录（保留 200 条上限）——测试 :208 用例真实断言 |
| 降级诚实 | ✅ | drive 异常计数 + log.warn 不回滚（seam :395-405）；payload 解析失败截断前缀 + degraded:true（:327-338） |
| 类型安全 | ✅ | 写集代码 diff `as any/never/unknown as` = 0（命中 2 处均为 brief 自检文字）；`state as S` 为泛型收窄非违规（铁律 38 只禁 any/never/unknown-as） |
| 测试质量 | ✅ | 7 用例（增量 apply/版本化重放/ver 不匹配/日志缩短/空 log/whole-value/内建投影 seam）；独立复跑 **7/7 passed**（Node 22 + better-sqlite3 ABI rebuild） |
| G1 零依赖 | ✅ | `grep -rn "@deepseek-ai" src/` = 0 |

### 8.3 核心审计点：接线缺位（M3 家族）

**物理事实**：`grep -rn "session-projection" src/ --include="*.ts" | grep -v src/store/session-projection.ts` = **0 命中**。app/、electron/、electron-renderer/ 同样零命中。唯一 import 来自测试文件。即：**模块的 seam（installAppendEventSeam，:384-410）在生产永不装载——`registerProjection` 从不被生产代码调用，`SESSION_ACTIVITY_STATS_KEY` 内建投影只活在测试里。**

**交付方的合规通道**：CLAUDE.md plan.json 机制（三权分立表「锁定的 plan 覆盖 bash」）——eebd9c99 将 plan.json `current_phase: 2→3`，新增 phase 3（create session-projection.ts，`wiring: "deferred"`）与 phase 4（wire src/agent/synova-agent.ts，`wiring: "enforce"`）；plan.json `approved_by: "founder"`。PR #405 由 CTO 合并 = 人类审批。**通道使用合法**（先例 D333/D541/D358/D296，brief Q1 已声明）。

**但三个缺口使本轮不能给无条件 PASS**：

1. **P1（M3 承继风险）**：phase 4（synova-agent.ts 接线）**无 D# 承接**。D590-D596 收工计划（465b9147）中 D590 仅「设计前读 D588 spec 防写集语义冲突」，无一任务显式包含「wire sessionProjections 进 synova-agent.ts」。历史 M3 共 4 次（AGENTS.md 铁律 0-2 记录），deferred 通道若到期无承接 = 第 5 次。条件闭合项之一。
2. **P1（M4 家族）**：task-state/D588.json 壳缺失——D384「先登记后使用」登记债升级（L1-audit 复核 891dcdbe 明示「D588.json 壳至今仍缺」）。main 中 D586/D587/D588 三卡 task-state 全缺。条件闭合项之二。
3. **P2（M2 家族）**：spec DS1 =「`grep -rn "registerProjection" src/` 命中（真实接线，**非测试内**）」，brief Done 标准将其改为「verify: grep -rn registerProjection src/store/session-projection.ts」（文件内命中即勾选）——**验收口径被交付方弱化**，spec 定义的 DS1 未达成。条件闭合项之三（口径统一：承认 DS1 未达成、以 phase 4 为准，或完成接线后勾选）。

### 8.4 verdict

**CONDITIONAL PASS（创建阶段 PASS；接线阶段缺位）**。条件（单一可机检，非滞留）：

1. CTO 派单：plan.json phase 4 接线（src/agent/synova-agent.ts 引入 sessionProjections + 至少一个生产消费点，如 token 统计）显式纳入某 D# 写集（D590 或新号）；
2. task-state/D588.json 壳补登记（含本报告 audit 段回填）；
3. spec DS1 与 brief 口径统一（或随接线完成自然满足）。

条件闭合后的复审范围 = 仅 phase 4 变更 diff（不重审本批已 PASS 的创建阶段）。

---

## 九、批次级发现清单（分级 + 归因）

| # | 级 | 发现 | 证据 | 归因 |
|---|---|---|---|---|
| B1 | **P1** | **前批 K3 报告未入库**：① D575/D577 前审报告（4efe6853，2026-09-05）从未合并 main，唯一指向它的机器记录 k3-D575-D577-closeout.json 引用未入库 commit；② 638dfb90 提交信息声称「闭环审计终局报告（双 PASS）」但物理内容仅 product-progress 再生成（76+279 行），**报告文件不在其中**；③ D586 前审报告 + task-state 写回停留在工作区 untracked 未提交 | ① `git ls-tree d197b40b docs/synova/audit-reports/ --name-only` 无该文件；`git branch -r --contains 4efe6853` = 空；② `git show 638dfb90 --stat` 仅 2 文件；③ `git status --short` 两文件 `??` | **audit**（审计线交付未走完「提交→PR→合并」闭环）+ 控制塔缺口（见 L4-2） |
| B2 | P2 | 派单材料证据错引：① 本批派单材料称 D575 evidence 在 `docs/synova/audit-reports/D575-ticket-slice-evidence-20260906/`——main 不存在（存在的是 **D580**-ticket-slice）；② calc-k3-stale.test.py 挂 D577 复跑清单——实为 D579/D582 CT-62 写集 | `git ls-tree` 核对 | **audit 派单侧**（材料自收集环节引用错误，M2 家族） |
| B3 | P2 | bypass.log 两条 `possible-bypass diff=552s`（2026-09-06T06:47:01Z，D578/D581 窗口）——对应 hash（b599366a/1dffcf8e）在现 clone 不可解析（Win 侧 rebase 改写），无法归因到具体 commit；同日紧邻两条 pre-commit PASS 登记。全文 0 次 --no-verify。 | bypass.log 1133 行全读 | 警告级观察，不升级；若 Win 侧发现 552s 实为绕过需单独登记 |
| B4 | P2 | 自审计回填近失（§5.4）：cd56801c 侧支由 Win 会话回填「audit PASS」 | `git show cd56801c` | **audit 线红线近失**（未入 main，无实际污染） |

---

## 十、跑偏第二道（north-star 三问，逐任务机械裁决）

对照 `.claude/PRODUCT-BRIEF.md` 原文：

| 任务 | ①服务真实用户场景（FDE/企业主）？ | ②更接近终态？ | ③Synova 仍是对的那个 Agent？ | 裁决 |
|---|---|---|---|---|
| D575 | ✅ 桌面端第一触点——打开产品第一步即配置 LLM，否则 Agent 无法运行 | ✅ 「能装/能开/**能用**」的能用环节 | ✅ 无变味 | 对齐 |
| D576 | ✅ 治理任务：产品进度真实性 = 增长导航决策的输入质量（间接服务 FDE/企业主） | ✅ 兑换机制是「跟踪执行」的可信基础设施 | ✅ 无变味 | 对齐 |
| D577 | ✅ 阈值按配置真实触发 = 哨兵对企业主的真实信号，死代码转活 | ✅ 25 哨兵巡检终态「可配置、真实触发」 | ✅ 无变味 | 对齐 |
| D578 | ✅ 桌面端（企业主交付形态）Win 真机可用 | ✅ 桌面端验证点闭环 | ✅ 无变味 | 对齐 |
| D586 | ✅ LLM = 8 专家并行 + 25 哨兵的底座，稳定错误码 → 可重试/轮换/压缩 | ✅ L3 provider 底座终态「可靠、可路由、可重试」 | ✅ 无变味 | 对齐 |
| D587 | ✅ 工具结果进提示词前的确定性修剪 = 诊断/对话链路可靠性与成本纪律 | ✅ 编排层终态一步 | ✅ 无变味 | 对齐 |
| D588 | ✅ 会话事件流之上派生可查询状态 = Agent 驻扎运行的记忆底座（token 统计/调度态） | ⚠️ **内容对齐，但「更接近终态」以 phase 4 接线落地为前提**——当前零生产消费 | ✅ 无变味 | 内容对齐；完整度缺口 = §8 条件 |

**批次级：无方向跑偏。**

---

## 十一、L4 防线缺口收割（本该拦住它的防线是什么？为什么没拦住？）

> 每任务末尾固定回答。命中 M 类则强化该类已有防线；不命中才提议新类。

| 发现 | 本该拦住的防线 | 为什么没拦住 | 缺口（免疫细胞建议，CTO 执行） |
|---|---|---|---|
| D588 接线缺位（M3 第 5 次风险）+ DS1 口径弱化（M2） | plan.json `wiring:deferred` 通道 + spec DS1 验收 | deferred 声明**无到期检查**——plan.json 允许「接线在后续阶段」，但没有任何门禁断言「后续阶段的 D# 已存在」；brief Done 勾选可以自行改写验收口径而无对账 | **L4-1**：pre-commit/CI 组 4 对 deferred 的采纳加物理前提——plan.json 中 wiring deferred 的 phase 必须能在 task-state/ 找到绑定该文件的后续 D#（bash 可断言）；spec DS 判据与 brief Done 的逐条对账纳入组 6（「DS1 非测试内」字样出现 = 必须 grep 生产调用方，不许在文件内自查） |
| B1 前批 K3 报告未入库（M4 家族） | K3 报告「git 跟踪 + PR 回流」约定 | 约定无物理执法：① 审计线产出 commit 后无「已推送/已合并」闭环断言；② CTO 侧合并 638dfb90 时无「K3 分支 PR 必须含 docs/synova/audit-reports/ 新文件」的检查——提交信息声称有报告但物理没有 | **L4-2**：CTO 合并 K3 审计分支前，断言 PR 内存在 `docs/synova/audit-reports/*.md` 新增文件且 `git cat-file` HIT（FOUNDER-GUIDE-MERGE 或 CI 均可承载）；K3 会话交付 SOP 增加「commit → push → 报告 PR 号回填」三步闭环检查（本批已按此执行） |
| task-state 壳缺失 D586/D587/D588（M4/M7 家族，D586 前审 F1 同源） | D384「先登记后使用」+ alloc 认领制 | 约定无门禁：Win 线交付三卡均未写 task-state；合并侧无「task-state/<D#>.json 存在」检查；alloc 只管发号不管壳存在性 | **L4-3**：merge/CI 侧对 feat(D#)/fix(D#) 提交断言 `task-state/D#.json` 存在（或 PR 模板必填项）；D576 CT-54 已在 alloc 侧堵了发号盲区，壳存在性是另一端 |
| cd56801c 自审计回填（红线近失） | 「审计结论只认 K3」红线 | task-state audit 段任何人可写，无写入者门禁 | **L4-4**：task-state 生成器/CI 断言 audit 段只能由 K3 报告派生（CT-53 同向：「声称验证过的必须是可核的」）——回填动作保留给 CTO，但 audit 段内容必须绑定报告路径 |
| B2 派单材料错引（M2 家族） | K3 材料自收集 SOP | 派单材料的证据路径未逐条 `git ls-tree` 预验 | 不新增机制：K3 自收集 SOP 增加「材料 7 项逐条 cat-file 预验」提醒（本批已按此执行并当场纠出 B2） |
| D587/D588/D586 spec 写集表计数漂移（M7 家族，D586 前审 F2 同源二次命中） | dev-doc skill 写集表对账 | 前审已提议「写集表强制修改 N + 新建 M 与文件清单逐行对账」，**尚未落地** → 本批 D587/D588 同型再犯 | **不新增机制**——落实前批已提的 dev-doc skill 强化即可（一类一机制，同一类不再加第二个免疫细胞） |

**M 类命中**：M2 / M3 / M4 / M7 全部命中既有模式类。**不新建 M9**——机制数量收敛于错误模式种类数（本轮提议 4 个免疫细胞中 L4-1/L4-2 为新防线，L4-3/L4-4 为既有约定门禁化，L4-5 落实旧建议）。

---

## 十二、兑换建议表（只出结论，兑换由 CTO 执行）

| 对象 | 结论 | 一句依据 |
|---|---|---|
| 7-2 / 8-1 / 10-3（D577） | 维持前审 **PASS**（已 verified，无需动作） | 本批基线复验：10/10 + flip 1/1 + sentinel 214 绿 + 接线点存活 |
| 1-2（D578） | **不兑换**——等 Win 复跑四断言 evidence 入 git（D581 已修脚本）后 K3 复核 | evidence 未入 git = 不可复核（CT-53 精神：可核性优先） |
| 桌面端「首启 LLM 配置」点 | 建议 CTO 补登记验收点（前审 P2-4 存续），完成后以本报告 D575 章节为 K3 依据 | 现有产品线无此点，能力已审计 PASS 却无法兑换 |
| D588 三条件（§8.4） | CTO 派单 + 壳补登记 + 口径统一 | 条件闭合后复审 = phase 4 diff only |

---

## 十三、附：本批复跑命令与结果总表（2026-09-08，Node v22.23.2 为主）

| # | 命令 | 结果 |
|---|---|---|
| 1 | `npx vitest run tests/services/llm-credential-store.test.ts tests/routes/llm-config.test.ts tests/llm-config-frontend.test.ts` | 64/64 passed（D575） |
| 2 | `bash tests/control-tower/redeem-task-redeem.test.sh` | 5/5（D576） |
| 3 | `bash tests/control-tower/alloc-task-id.test.sh` | 13/13（D576） |
| 4 | `npx vitest run tests/sentinel/threshold-injection.test.ts` | 10/10（D577） |
| 5 | `D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts` | 1/1，跑后 git clean（D577） |
| 6 | `npx vitest run tests/sentinel/` | 29 文件 214 passed + 1 skipped（D577） |
| 7 | `python3 tests/control-tower/calc-k3-stale.test.py` | 15/15 OK（CT-62 文件，归属见 B2） |
| 8 | `npx vitest run tests/errors/llm-error-taxonomy.test.ts` + `tests/providers/` | 22/22 + 3/3（D586） |
| 9 | `npx vitest run tests/llm/tool-result-pruner.test.ts` | 6/6（D587） |
| 10 | `npx vitest run tests/store/session-projection.test.ts` | 7/7（D588，better-sqlite3 ABI rebuild 后） |
| 11 | `npx vitest run tests/electron/desktop-build.test.ts` | 23 passed + 3 skipped（D581/D578 收尾） |
| 12 | `npx tsc --noEmit` | 28 errors（= 基线，写集零命中） |
| 13 | `python3 scripts/audit/audit-check.py --full` | 2 PASS / 918 WARN / 481 FAIL（写集零命中） |
| 14 | `grep -rn "@deepseek-ai" src/` | 0（D575/D586/D587/D588 G1） |
| 15 | `grep -c "no-verify" .claude/bypass.log` | 0（1133 行全文） |

**环境注记**：Node 24 下 better-sqlite3 11.10.0 fork worker 退出崩溃（cleanup-hook ABI）——环境依赖失败（D316 判别），rebuild 至 Node 22 后全绿；该现象与代码质量无关，但建议控制塔后续将审计机 node_modules ABI 与运行 Node 版本绑定登记（K3 清单提示 #4 同源）。

---

> 报告完。本报告提交于分支 `audit/k3-20260908-seven-task-batch`（只含报告，PR 回流由创始人合并）；task-state 回填与兑换执行由 CTO 承担（审计红线：K3 不改 task-state / product-lines.yaml / scripts/audit/）。
