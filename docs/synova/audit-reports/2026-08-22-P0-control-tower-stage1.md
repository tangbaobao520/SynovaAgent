# 审计报告 2026-08-22-P0（模式 A v2）— 控制塔减负（D465-D468）+ Stage1 首批（D500/D472/D473/D474）

> 审计员: K3 | 范式: 声称↔证据驱动（K3-AUDIT-STANDARD-v2-20260820）+ P0 精审
> 审计基线: 产品仓库 main = bb785aa（== origin/main）；审计工作区独立克隆 @ bb785aa 复跑测试
> 运行环境注记: macOS / Node v24.19.0 / git bb785aa / 审计工作区沙箱（产品仓库只读，测试在审计工作区复跑）
> 清单依据: docs/synova/coordination/K3审计清单-20260822.md P0 8 项

## 0. 门禁与声称表存在性

- verify-claims-table.sh: 存在（main aadc1b04 后）| 任务声称表: D465/D466/D467/D468 **无 dev doc**（CTO 直接实施，spec=null）→ 无声称表 = 自证缺失，按 v2 步骤 0 记 P1 轻级（控制塔减负系列为实施直改，D500/D472/D473/D474 有 dev doc + DS1-13 声称表）
- G12d 接线: `grep verify-claims-table scripts/pre-commit-check.sh` 命中（本批不逐项复跑）

## 1. 声称↔证据对账（逐任务）

### D465 — CI 门禁 diff 语义补齐（空暂存假绿消除）→ **PASS**

| # | 声称 | 证据命令 | 实测 | 判定 |
|---|------|---------|------|:---:|
| 1 | CI 模式仅 GITHUB_ACTIONS=true + SYNO_DIFF_BASE 注入时用 base...HEAD 替代 --cached | 10e908f6: pre-commit-check.sh:136-153 | 四变量（NAMES/ALL_NAMES/ADDED_NAMES/DIFF）全部条件替换；非 GITHUB_ACTIONS 走 --cached | ✅ |
| 2 | 本地忽略注入（堵 D390 注入缝旁路） | 同上，`if [ "${GITHUB_ACTIONS:-}" = "true" ]` 守卫 | 守卫存在；本地模拟 GITHUB_ACTIONS=true + SYNO_DIFF_BASE=product/main 跑通 exit 0 | ✅ |
| 3 | ci.yml 注入 SYNO_DIFF_BASE + fetch-depth:0 | 10e908f6: ci.yml | quality job fetch-depth:0 + env SYNO_DIFF_BASE=origin/main | ✅ |

- P2-1（M1 同型，既有非本次引入）: GIT_CACHED_DIFF 系列 `2>/dev/null \|\| true`（pre-commit-check.sh:140/148/151）——git diff 失败 → 空 diff → 增量检查假绿。CI 下 origin/main 由 fetch-depth:0 保证存在，风险低；本地 git 故障时静默假绿。

### D466 — check-bypass-log 注释同步 + tag-bypass-wiring 跨平台 → **PASS**（测试声称环境受限）

| # | 声称 | 证据命令 | 实测 | 判定 |
|---|------|---------|------|:---:|
| 1 | check-bypass-log.sh 头部注释 fail-open→fail-closed 同步 | c183b5d3 1 行 | 注释与代码 exit 2 语义一致 | ✅ |
| 2 | tag-bypass-wiring 用例6/7 跨平台（shim python+python3 + sys.executable 绝对路径） | c183b5d3: 测试 158-195 行 | 双 shim 名 + REAL_PY_BIN 绝对路径（不再依赖 PATH 探测） | ✅ |
| 3 | 24/24 通过 | `bash tests/control-tower/tag-bypass-wiring.test.sh` | **本沙箱复跑 12✅/1❌+abort**——根因: 审计沙箱只读限制（synova-commit PROJECT_ROOT=脚本位置→写真实仓库 .codex 被拒）+ 测试自警"python3 仍可发现"。**环境依赖失败，不判不实**；逻辑审查通过 | ⚠️ 环境受限 |

- P2-1: 测试密封性（synova-commit PROJECT_ROOT 用 `$SCRIPT_DIR/../..` 而非 git rev-parse）——台账已记 K3 P2-4 专项，本次未修属实。

### D467 — 方案1 挪CI（本地软提示 + CI 权威）→ **CONDITIONAL PASS**（P1×2）

**核心机制（全部真实）**:

| # | 声称 | 证据 | 实测 | 判定 |
|---|------|------|------|:---:|
| 1 | 本地 pre-commit 硬阻断→软提示 | ab05e2de: install-hooks.sh:41-58 | 失败→pre-commit-failures.log + `GATE_FAIL_SOFT \| exit=$EXIT_CODE`→bypass.log + stderr 提示 + 无条件写 marker + exit 0 | ✅ |
| 2 | GATE_FAIL_SOFT 证据链 | 同上 + check-bypass-log.sh | 写入真实（hook body）；check-bypass-log 按 hash 对账（GATE_FAIL_SOFT 无 hash 不影响），本地放行记录可查 | ✅ |
| 3 | as-any 只拦新增（存量治理） | ab05e2de: pre-commit-check.sh:300-311 | CI 用 `git diff base...HEAD -- src/`，本地用 GIT_CACHED_DIFF，grep `^+` 排除 `+++` 头 | ✅（范围问题见 P1-2） |
| 4 | CI 去无效 SKIP_AS_ANY/SKIP_EMPTY_CATCH | ab05e2de: ci.yml | 已移除；`grep -rE "SKIP_AS_ANY\|SKIP_EMPTY_CATCH" scripts/ .github/`（-E 重查）**零引用** → 死变量清理属实 | ✅ |
| 5 | CI 权威真实兜底 | ci.yml quality job "Iron laws check" | `bash scripts/pre-commit-check.sh` 无 `\|\| true`、job 无 continue-on-error → 13 组失败即 job 红 | ✅ |
| 6 | 测试回归 6/6 + 24/24 | check-dev-doc-write-set.test.sh | 6/6 复现 ✅；tag-bypass-wiring 见 D466 环境受限 | ✅/⚠️ |

**P1-1（控制塔）: CI TypeScript check 为 fail-open — "CI 权威"后类型防线完全真空**
- ci.yml:29 `npx tsc --noEmit 2>&1 | grep -v "..." \|\| true` —— tsc 失败永不红（M1 同型，D396 P2 曾记"复证未愈转待办"，未修）。
- 实测: 产品仓库 main（bb785aa）`npx tsc --noEmit` 报 **28 个错误**——`extensions/sentinels/_extinct/*` 25 处（TS2307/TS7006，退役哨兵残留）、`src/connectors/ima.ts:143`（TS2345）、`src/server.ts:394-395`（TS2345 MainAgent↔MainAgentLike 不兼容）。全部 pre-existing（git blame: server.ts:394 为 2026-07-24 a1c91b01b），**非 D467 引入，但 D467 把本地唯一硬阻断变软后，类型错误在整条链上无任何拦截**（本地软提示 + CI tsc no-op + vitest 不查类型 = 三处全漏）。
- 台账已记 D473 系统性盲点"待 D500 后强化类型检查"——本审计确认该盲点当前是**活动缺陷**（main 28 错 + CI 永不红），建议升级 CT 队列优先项。
- 归因: control-tower（CI tsc fail-open）；M2 部分（"CI 权威"声称未含类型防线边界说明）。

**P1-2（implement + 控制塔）: as-any 检查本地/CI 范围不一致 + packages 盲区**
- CI 模式 `git diff "$SYNO_DIFF_BASE"...HEAD -- src/`（**限定 src/**）；本地模式用 GIT_CACHED_DIFF（**全仓**）——同一检查两种语义。
- D467 note 声称"as any 存量用完整逻辑匹配实为 0"——**以偏概全**: `src/` 存量 0 属实（grep 复验 0 命中），但 `packages/` **33 处**（sog-core 等，`grep -rn 'as any\b' packages/` 复验）。D353（CT-26）曾把铁律 38 扫描扩至 packages/，D467 把 CI 检查缩回 src/ → **packages/ 新增 as any 在 CI 漏拦**（本地软提示下可放行）。
- 归因: implement（声称范围）+ control-tower（检查器范围回归）。

**P2 级**: P2-1 as-any 新增行注释误报未排除（声称"注释排除"实现只排除 `+++` diff 头）；P2-2 GATE_FAIL_SOFT 混入 bypass.log 使该文件从"绕过记录"变"门禁结果记录"，u1 对账语义需明确（无 hash 不影响对账，语义漂移）；P2-3 merge 门禁依赖 GitHub branch protection（gh CLI 不可用，需创始人核 CI 是否 required check——D387 P1-2 同型外部项）。

### D468 — 方案3 同步降频（砍 D335）→ **PASS**

| # | 声称 | 证据 | 实测 | 判定 |
|---|------|------|------|:---:|
| 1 | synova-commit 不再调用 check-branch-sync | c141da43: synova-commit -16 行 | D335 块移除，注释说明单端兜底 | ✅ |
| 2 | 删除 check-branch-sync.sh + test（铁律 37） | c141da43 stat | -115 / -119 行删除，`ls` 确认不存在 | ✅ |
| 3 | push 时 D334 门禁 0 单端兜底保留 | pre-push-check.sh check_push_sync | 落后/分叉/main 直推硬阻断 + 逃生舱仍完整 | ✅ |
| 4 | 文档同步（拉平降频） | MULTI-MACHINE-PR-WORKFLOW.md:89 | 第 7 条已补记（"开工前拉平 + push 前防覆盖保留"） | ✅ |

### D500 — 事件溯源 session log（Stage1-D1）→ **PASS**

**dev doc 质量**: north-star 锚定（FDE/企业主/审计线）、DS1-13、诚实降级（engine seam）、复核修复记录（§12，4 问题 + 1 降级）——本轮所见最高质量 spec 之一。

| # | 声称 | 证据 | 实测 | 判定 |
|---|------|------|------|:---:|
| 1 | session_events 表 + UNIQUE(session_id, seq) | session-store.ts:127-136 | 建表 + 唯一约束 + 索引（2026-08-22 并发写教训①防线） | ✅ |
| 2 | appendEvent 契约（seq 单调 + 失败显式 degraded） | session-store.ts:272-284 | JSDoc 契约 + log.error + degraded 返回 | ✅ |
| 3 | addMessage 内部双写下沉 | session-store.ts:246-256 | agent_messages + appendEvent；**成功写入重置 lastDegraded**（214ac7f2 非粘滞修复在码） | ✅ |
| 4 | deriveMessages backing getMessages | session-store.ts:352-357 | getMessages → deriveMessages（复核修复 2 在码，生产读取统一事件流） | ✅ |
| 5 | SessionManager 注入 + model-visible⟺logged 断言 | session-manager.ts:51/60/79-93 | 构造可选注入 + 断言失败 log.error + degraded 传播 | ✅ |
| 6 | conversation-engine 接线 | conversation-engine.ts:617 | `addMessage({...}, this.sessionId)`（spec 写 616，实测 617——行号 1 行漂移） | ✅ |
| 7 | bootstrap 生产装配 | bootstrap.ts:682 | `new SessionManager({}, new SessionStore(db))` | ✅ |
| 8 | 测试 28/28 | vitest 复跑（审计工作区 bb785aa） | session-event-log 13 + session-manager-eventlog 8 = **21/21 通过**（两文件合计；28 含其余相关文件） | ✅ |
| 9 | engine 悬空 seam 诚实降级 | cli.ts:118 / mcp/index.ts:222 / bootstrap:682→wiring / tui-v2/lib/bootstrap.ts:130 | 5 实例化点均未传带 store 的 SessionManager；bootstrap 的注入经 createOrchestrationWiring 无 engine 消费（wiring.ts:63-66 仅持有）；生产事件流经 8 处直连 store.addMessage | ✅ 降级声明属实 |
| 10 | 复核修复 4+1 全部落地 | 214ac7f2 + 4af54eb3 | 粘滞/backing/seq 冲突实证/断言分支/engine seam 均已在 main 核实 | ✅ |

- P2-1（M2 轻微）: "tsc 零错误"声称不实（全仓 28 错 pre-existing；若指本次变更文件则成立）——dev doc 未限定检查范围。
- P2-2: 跨分支污染事故（PR #101 混入 D500 前 5 提交）已由 PR #102 收齐，main 现为完整交付——事故已闭环（台账已记）。

### D472 — Agent Notes 四态铁律结构化（Stage1-D2）→ **PASS**

| # | 声称 | 证据 | 实测 | 判定 |
|---|------|------|------|:---:|
| 1 | hook 注入过滤（archived 零注入） | hook-check-memory.sh:21/59 | find 范围 = proposed + implemented | ✅ |
| 2 | 迁移门禁接线 | pre-commit-check.sh:206/671 | check-notes-lifecycle.sh 两处生产调用 | ✅ |
| 3 | CT-34 纯文档豁免绕过修复 | f157dedd | pre-commit-check.sh +13（纯文档早退分支内补跑门禁） | ✅ |
| 4 | 测试 21/21 | bash 复跑 | check-notes-lifecycle 18/18 + hook-check-memory 4/4 = 22（声称 21 计数微差，P2） | ✅ |

### D473 — guard 循环卫生 + 超时（Stage1-D4）→ **PASS**

| # | 声称 | 证据 | 实测 | 判定 |
|---|------|------|------|:---:|
| 1 | ToolDefinition.timeoutMs + ToolTimeoutError | tools.ts:61/70-75 | 契约字段 + 结构化错误类 | ✅ |
| 2 | withTimeout 包裹（声明才超时，cooperative） | tools.ts:209 + 256-285 | Promise<ToolCallResult>（TS2322 已修）+ finally clearTimeout（timer 泄漏已修） | ✅ |
| 3 | ToolGuard 分级 [2 提醒/3 阻断] | tool-guard.ts:57-68/115-129 | 阶梯压缩（MAX_TOOL_ROUNDS=3 下 5 不可达的修正）+ reminder 注入模型可见 | ✅ |
| 4 | 提醒注入两路径 | tool-loop-executor.ts +97-108 | reminder level 分支 push 模型可见消息 | ✅ |
| 5 | block 路径 level 一致性 | 89cf38e8 | 参数校验/重复失败 block 补 level:'block' | ✅ |
| 6 | 测试 32/32 | vitest 复跑 | **32/32 通过**（原 19 回归 + 新增 13；声称 31/31 系修复前计数） | ✅ |

### D474 — snapshot keyless 回放门禁（Stage1-D3）→ **CONDITIONAL PASS**（P1×1）

| # | 声称 | 证据 | 实测 | 判定 |
|---|------|------|------|:---:|
| 1 | keyless 录制 + severity 级对比 + 阶段 5 + pre-push 接线 | golden-snapshot-runner.ts / golden-case-checker.ts:382-394 / pre-push-check.sh（check-golden-regression --verify-only） | 全部命中 | ✅ |
| 2 | main 入口阶段5失败误绿修复 | 7e44c02e | isMainModule 判定修复（失败→exit 非 0） | ✅ |
| 3 | 测试 35/35 | vitest 复跑 | **66/68（与 D473 合计）——golden-case-checker 2 失败为审计工作区路径非 ASCII（中文目录名 URL 编码 → 数据集路径解析失败 → degraded）**，产品仓库 ASCII 路径不受影响 → 环境依赖，不判不实 | ✅/⚠️ 环境受限 |

- **P1-1（implement，windows-compat 领域）: `repoRootDir()` 非 ASCII 路径 bug**——golden-case-checker.ts:358-362（D474 引入，git blame 确认 b25d05c1）：`new URL(import.meta.url).pathname` 未做 `decodeURIComponent`，中文路径（中文 Windows 用户名/目录、任何非 ASCII 安装路径）下黄金数据集恒"不存在"→ degraded:true + passed:false → **pre-push 恒被拦 → 被迫绕过（M4 风险）**。当前部署（ASCII 路径）无影响；修复 = decodeURIComponent 或改用 `fileURLToPath`。
- P2-1: 计数漂移（声称 35/35 vs 实测文件 36 用例），轻微 M2。

## 2. 沉默审计

- D500/D472/D473/D474 四份 dev doc 的 DS 声称表均存在且完整（S-10 合规）；D465-D468 无 dev doc（CTO 直接实施）——缺失自证按步骤 0 记 P1 轻级（已入上文）。
- diff 覆盖: 各任务提交文件均有对应声称行覆盖，无沉默文件。
- 副作用沉默: D467 的 as-any 范围变更（src/ 限定）与 D473 盲点强化建议（台账"待 D500 后"）——已捕获为 P1-1/P1-2。

## 3. 逢绿必验 + 抽样

| 抽中点 | 池 | 证据 | 判定 |
|-------|:---:|------|:---:|
| D467 "as any 存量 0"（转绿声称，逢绿必验） | 1 | src/ 0 ✅ / packages/ **33** ❌ | **P1-2** |
| D467 "CI 权威"（架构声称） | 1 | ci.yml Iron Laws 无 || true ✅；tsc `\|\| true` ❌ | **P1-1** |
| D500 engine seam 降级声明 | 2 | 5 实例化点 grep 全验证 | ✅ 属实 |
| D474 main 入口误绿修复 | 2 | 7e44c02e diff | ✅ |
| 本批成本: ≈¥15 / ≤¥20 | seed: 20260822 | 结转清单: 无 | |

## 4. 常设项（13/14/15）

- **#13 控制塔执行审计**: D465-D468 均有 bypass.log 补记 + task-state 回填 + PR 合并记录（D331 对账链完整）；D467 软提示后 GATE_FAIL_SOFT 条目已开始落 bypass.log（证据链机制工作）。
- **#14 版本编排**: 本批无版本 bump（V4.8.1/V4.9.0 tag 已存在且为祖先）。
- **#15 并行合规**: Stage1 四任务写集零交集声明经 dev doc 交叉核对属实；跨分支污染事故（D500×PR#101）已闭环。

## 5. 分级汇总

| 级别 | 编号 | 内容 | file:line | 归因 |
|------|:---:|------|-----------|------|
| P1 | D467-P1-1 | CI tsc `\|\| true` fail-open — 类型防线真空（main 实测 28 错永不红） | .github/workflows/ci.yml:29；实测 src/server.ts:394、ima.ts:143、_extinct×25 | control-tower（CT 队列升级） |
| P1 | D467-P1-2 | as-any CI 只查 src/（本地全仓）+ "存量 0"以偏概全（packages/ 33 处） | scripts/pre-commit-check.sh:303-305；packages/sog-core/src/sog-schema-registry.ts:57 等 | implement（声称）+ control-tower（范围） |
| P1 | D474-P1-1 | repoRootDir() 非 ASCII 路径 → 黄金门禁恒 degraded → push 恒拦/绕过 | scripts/ci/golden-case-checker.ts:358-362 | implement（windows-compat） |
| P2 | 多 | GIT_CACHED_DIFF \|\| true / GATE_FAIL_SOFT 语义 / branch protection 外部项 / 计数微差 | 见上文 | control-tower / 外部 |

## 6. 总体结论: **CONDITIONAL PASS**

- D465/D466/D468/D500/D472/D473: **PASS**（核心声称全部物理验证；D466 测试声称环境受限不判不实）
- D467/D474: **CONDITIONAL PASS**（核心机制真实；P1-1/P1-2/P1-1 需跟进，均不阻断当前运行）

## 7. L4 防线缺口收割

| 本次发现 | 本该拦住的防线 | 为什么没拦住 | 缺什么 |
|---------|--------------|-------------|--------|
| CI tsc fail-open（28 错永不红） | CI quality job / 铁律 36 全量 vitest 无类型检查 | `\|\| true` 是 D396 已记 P2（M1 同型）从未升级；D473 盲点记录停在"待 D500 后" | CI tsc 去 `\|\| true` + 类型检查入铁律 36 门禁（CT 队列升级） |
| as-any packages 盲区 | pre-commit 组 1（D353 曾扩 packages/） | D467 改检查范围时未保留 packages/ 覆盖；"存量 0"只算了 src/ | 检查器范围恢复 packages/ + 声称必须注明范围 |
| 非 ASCII 路径 | 跨平台测试（windows-compat） | 场景脚本/门禁测试全部在 ASCII 路径机器上开发，无非 ASCII 用例 | repoRootDir 用 fileURLToPath + 非 ASCII 路径测试用例 |
| task-state impl.commit 未回填（P2 批次共性） | task-state 状态机回填纪律 | CTO 侧批量任务多数 commit=local/NONE（M7 漂移） | 回填纪律或自动回填（git log --grep D# 兜底） |

*P0 批审计完。P1 批见 2026-08-22-P1-gs-deploy-u.md；P2 批见 2026-08-22-P2-batch-audit.md。*
