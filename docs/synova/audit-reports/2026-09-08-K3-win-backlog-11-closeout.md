# K3 独立审计报告 — Win 侧积压 11 任务 closeout（D556/D567/D568/D569 新审 + 七任务承接复核）

> 审计员：Kimi K3（独立会话，零上下文）
> 协议：AUDIT-PROTOCOL.md v1.1（L1-L4 四层，15 项清单）
> 审计基线：origin/main @ bd4bb53e（K3 审计清单入库提交 #418；11 个任务合并提交全部为其祖先，逐哈希 `git merge-base --is-ancestor` 验证）
> 日期：2026-09-08
> 仓库：tangbaobao520/SynovaAgent（隔离审计工作区 `/Users/wane/Synova-k3独立审计`，分支 `audit/k3-20260908-win-backlog-11`）
> 派单：docs/synova/coordination/审计清单-20260908-Win侧积压.md（bd4bb53e 引入）

---

## 〇、运行环境注记（先行，D316 教训）

| 项 | 值 |
|---|---|
| 机器/会话 | Mac（darwin-arm64），DSH 隔离审计工作区（tracked 干净，基于 origin/main 新建审计分支） |
| Node | v22.23.2（nvm 显式激活——shell 默认 PATH 无 node；与 2026-09-06/09-08 两批前审同系，better-sqlite3 ABI 兼容） |
| vitest | 4.1.8 |
| 环境变量 | DSH 壳注入 `ELECTRON_RUN_AS_NODE=1` → 全部 vitest 复跑以 `env -u` 剥离（D575 task-state env_notes 预告的坑，前审同法） |
| CI job 级证据 | **不可独立复核**——GitHub 私有仓库无 token/gh CLI。L3 以本地物理证据（bypass.log 全读 / pre-commit 登记 / 测试独立复跑 / 审计基线）替代并显式标注限制。D556 任务态声称的 CI 取证 `evidence/D556/ci-check-runs.md` 位于根级 evidence/（.gitignore:76 禁用，本工作区不存在）→ 其「CI 十项全 success」只能按合并提交消息（69d81c58 内 docs 子提交）采信为机器记录，不升格为独立复核结论 |
| 复跑时间戳 | 全部复跑 2026-09-08 04:33-04:55 +0800 |

**材料自查（7 项自收集）**：提交集 = `git log origin/main --grep=D5xx` 逐任务映射 + `--is-ancestor` 基线归属验证；diff = `git show <merge-hash>`；dev doc = D556 spec 实读（D567/D568/D569 为 K3 finding fix 直派，spec=null，brief 为约束依据）；task brief = 4 份实读（D556 在 main 以 `2026-08-28-D556-ga-collab-e2e.md` 日期前缀命名，G12 认领窗口所致）；AGENTS.md + PRODUCT-BRIEF.md 实读；审计基线 = `audit-check.py --full` 2 PASS / 918 WARN / 481 FAIL（与前批基线一致）+ `tsc --noEmit` = 28（写集零命中）；执行证据 = bypass.log 全文（0 次 --no-verify）。

---

## 一、终局 Verdict（11 任务，每任务独立）

| 任务 | 内容 | 合并提交 | Verdict | 一句话依据 |
|---|---|---|---|---|
| **D556** | GA 校准前端接线 + 回流层 2 | 69d81c58 (#309) | ✅ **PASS**（P1×1 + P2×2 随附） | 63 断言独立复跑全绿；接线链（store→容器→进化管线 case）file:line 全命中；降级诚实；as any=0；三偏离全部如实披露（seed 通道 auth 拓扑不可达已上报 CTO，修复路径 D483-D486 在途） |
| **D567** | 专家枚举硬编码残留 ×4 传播修复（K3 15-1） | 7b576c89 (#330) | ✅ **PASS**（P2×2 随附） | 17/17 + cross-validator 8/8 = 25/25 与声称精确一致；5 处封闭枚举全闭合（file:line）；枚举残留 grep=0；tsc 28=28 写集零命中；as any=0 |
| **D568** | enterprise-fact superseded_by 语义实现（K3 18-5） | 7b576c89 (#330) | ✅ **PASS**（P2×1 随附） | 4/4 绿；归档+supersededBy 回填+默认链头+listFacts/deleteFact 语义 file:line 全命中；注释与实现一致化；调用方（fact-approval/conflict-scanner/L4 agent-memory-store）真实存在 |
| **D569** | 仪表盘 collector 改 git 权威读取 | 4c48a21c + 92ef7285 | ✅ **PASS**（P2×1 随附） | collectDashboards 实测 states=174/pct=5/三 section 零 degraded；三 git 读函数均被生产调用；冷启动竞态修复（gitLs await ensureFresh）diff 级证实 |
| **D575** | LLM 配置首启向导 | c124f8c8 (#354) | ✅ **PASS**（承接前审；P1×2 开放项存续） | 64/64 独立复跑；写集至 bd4bb53e 零漂移；P1×2（evidence 不可复核 / llm-config JWT 前挂载 server.ts:297-298）基线仍真 |
| **D576** | 产品线兑换机制修复 CT-53 + CT-54 | e9da5123 (#351) | ✅ **PASS** | 5/5 + 13/13 独立复跑绿；三机制（task_redeem/存量降级/k3_only 封顶）在终版 calc/redeem 存活（file:line）；k3_only 25 点物理存在 |
| **D577** | 哨兵阈值配置真实挂载 | ece4e268 (#355) | ✅ **PASS**（承接前审） | threshold-injection 10/10 + flip 1/1（跑后盘面干净）+ tests/sentinel/ 214 绿独立复跑；loader:130/:259 + runner:1203 接线存活；合并后漂移全部归因 D580（已审计 PASS），零 D577 相关漂移 |
| **D578** | Win 真机实测 1-2（D572 P0 本体） | 1493539f（台账）+ 9cfd7c36（D581） | ✅ **PASS**（1-2 四断言 evidence 待 Win 复跑入 git——状态确认，不兑换） | 台账根因链代码级证据存活（backend-spawn.cjs:70 / build-synova.cjs beforePack 守卫）；D581 测试 23+3 独立复跑绿；main 内 docs/synova/product-lines/evidence/ 无 D578 Win 复跑证据——状态维持「待 Win 复跑」 |
| **D586** | LLM 错误码 taxonomy（B-01） | 56c4dd1d (#400) | ✅ **PASS**（承接 2026-09-07 前审；P1×1 + P2×3 存续） | 22/22 独立复跑；接线 base.ts:39+237/248/258 基线存活；task-state 壳本批由 K3 回填入 git（前审 P1 闭合） |
| **D587** | 工具结果修剪器（B-04） | 75f13b56 (#408) | ✅ **PASS**（P2×2 存续） | 6/6 独立复跑；接线 tool-loop-executor.ts:151/:282 + conversation-engine.ts:447 基线存活；task-state 壳本批由 K3 回填 |
| **D588** | 会话投影注册表（B-07） | eebd9c99 (#405) | ⚠️ **CONDITIONAL PASS**（创建阶段 PASS；接线 D597 实现完成、未合 main） | 7/7 独立复跑；**接线状态（本批确认）**：D597 已实现于 origin/fix/d597-session-projection-wiring（0a192e6f，bootstrap.ts:27 副作用 import，bootstrap 经 server.ts:84-85 在生产图）——**未合 main**；task-state/D588.json 壳本批由 K3 回填；条件 ① 仅剩「合并 D597」动作 |

**批次级 P0 = 0。**

---

## 二、D556 — GA 校准前端接线 + 回流层 2（新审，完整 L1-L4）

### 2.1 提交集与 L2 对账

- 提交集：派单 0010eefb/da6a9178 → spec f8dadf7b (#308) → 编码 69d81c58 (#309，squash：80a19f0d + brief 日期前缀改名 + task-state 回填 + 台账 CT-45)。
- 写集实际（task-state 声明 vs 物理）：修改 3（RightPanel.tsx / app-store.ts / middle-evolution-engine.ts）+ 新建 8（ga-collab.ts / ga-detail-sections.tsx / test-support/render.ts / 3 测试 / spec / brief）。spec §3.3.1 表列 3+5——ga-detail-sections.tsx（折入 RightPanel 行）、spec、brief 未列表头。**任务方在 task-state deviations 已预登记（+1 偏离 + D333 决策），披露充分**（P2/M7，§9 F3）。
- brief 在 main 名为 `2026-08-28-D556-ga-collab-e2e.md`（G12 认领窗口日期前缀，合并消息自注两轮 CI 红根因 + CT-45 登记）。六字段 + Q1c D333 决策记录齐全（实读核验）。

### 2.2 独立复跑（2026-09-08，Node 22）

| 命令 | 结果 |
|---|---|
| `env -u ELECTRON_RUN_AS_NODE npx vitest run tests/ga-collab-ui.test.ts tests/ga-collab-logic.test.ts tests/loops/ga-calibration-evolution.test.ts` | **3 文件 63 passed**（与声称「三层 63 断言（logic 37 + ui 17 + engine 9）」精确一致） |

### 2.3 L1 关键物理复核（file:line @ bd4bb53e）

| 审计项 | 证据 |
|---|---|
| 接线深度（铁律 0-2/5） | ga-collab.ts 被 app-store.ts:5（getSeedIdentity boot seed）+ RightPanel.tsx:20（状态机/请求构建）+ ga-detail-sections.tsx:20（类型）消费；GaDetailSections 被 RightPanel.tsx:22 真 import；apiFetch 附 legacy 头 RightPanel.tsx:159；POST 回显 calibrationId/findingId RightPanel.tsx:735-736/764-765 |
| 层 2 回流（spec §6） | middle-evolution-engine.ts:31 动作类型追加 + :161 Signal 6（count≥3）+ :583 applyDiagnosisCalibrationReview + :649-650 applyEvolutionActions case——三既有信号类语义零变化（diff 零删除行，DS6 属实） |
| 降级诚实（铁律 8/24/31） | ga-collab.ts decideBlockState（:107-138）403→blocked/其余→degraded 单一判别点；sink 写入失败 log.warn + skipped++（:613-626）；UI 三块独立降级条 + cap-degraded-banner（RightPanel.tsx:504）不连坐 |
| 类型安全（铁律 38） | 写集 diff `as any/never/unknown as` = 0（grep 命中 2 处均为注释「零 as any」自述文字）；mapStatsResponse unknown→类型守卫 |
| Mock/TODO 残留（铁律 8） | 写集 5 源文件 grep TODO/FIXME/mock = 0 |
| 测试质量（铁律 48） | UI 测试 17 用例全部真实 expect（95 处断言行），五场景含占位零残留 + blocked 态 fail-closed + note 原文透传；非空壳 |

### 2.4 三偏离逐条核验（task-state deviations 声称 vs 物理）

| # | 偏离声称 | 物理核验 | 判定 |
|---|---|---|---|
| ① 渲染桥接 | renderToStaticMarkup 经 renderer node_modules 不可行 → 零依赖序列化器等价实现 | test-support/render.ts 实读：零 react-dom/zustand/react-markdown import（grep=0），契约 JSDoc（输入/输出/降级/错误四要素），仅 tests 引用 | ✅ 属实，D333 决策记录于 brief Q1c |
| ② seed 通道服务端可达性 | 全局 jwtAuthMiddleware 下 legacy x-synova-token 不可达 requireGa | auth.ts:81-99 白名单**无 /api/ga/\***；DEV_MODE=true → getSecret 返 null → :261-264 自动 assign dev-admin（覆盖 legacy token）→ 两模式均不可达。**物理证实** | ✅ 属实（P1，§9 F1；已上报 CTO，修复路径 D483-D486 在途） |
| ③ 层 2 sink type 值 | 'ga_calibration_review' 不在 MemoryType 枚举 → 落 'ga_correction' + 判别值冗余三处 | middle-evolution-engine.ts:592-608：type='ga_correction' + key 前缀 + tags[0] + value.actionType 三处冗余 | ✅ 属实，披露充分 |

### 2.5 L3 执行证据

- bypass.log：D556 窗口（08-28~08-30）全为 pre-commit PASS；08-29T19:33Z 一条 `detected-bypass head-mismatch`（marker=020443b6/parent=9b2e7cff）——两 hash 在本 clone 不可解析（Win 侧 rebase 改写，与前批 B3 同型）→ 警告级观察，不升级。
- CI job 级：无 token 不可独立复核（§〇 注记）。合并消息自注两轮 CI 红根因（G12 brief 日期前缀 UTC/CST 双时钟）+ CT-45 台账登记 + DS9「CI 十项全 success」回填——按机器记录采信。

---

## 三、D567 — 专家枚举硬编码残留 ×4 传播修复（新审）

### 3.1 提交集

squash-merge **7b576c89** (#330，D567+D568 同稿)：D567 侧 10 文件（expert-config-loader.ts / tui-v2/chat.tsx / cli/commands/expert.ts / agent/cross-validator.ts / l3/synova-diagnosis-engine-impl.ts / sentinel/runner.ts + 2 测试 + brief + task-state）。

### 3.2 独立复跑

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/expert/expert-enum-propagation.test.ts tests/expert/manifest-consistency.test.ts` | **17 passed**（propagation 7 + manifest 10） |
| `npx vitest run tests/agent/cross-validator.test.ts` | **8 passed** |
| 合计 | **25/25 —— 与 task-state 声称「红转绿 25/25」精确一致** |

### 3.3 5 处封闭枚举闭环物理核验（file:line）

| 点 | 证据 |
|---|---|
| chat.tsx | :427-430 `EXPERT_NAMES` 由 `getAllExpertIds()` Object.fromEntries 动态构建，展示标签降级回退 ID |
| cli/expert.ts | :27 `builtinExperts()`（yaml 优先/目录扫描降级 console.error——不静默）；:61/:96/:196 消费 |
| expert-config-loader.ts | :104 `getAllExpertIds` 新 export（yaml 声明序，缓存，空配置降级 []） |
| cross-validator.ts | :81 `allExperts = () => getAllExpertIds()`；:146 tiebreaker `\|\| 'host'` 兜底 |
| engine-impl | :545-553 维度映射 7 位对齐 registry + 运行时 `getAllExpertIds().includes(mapped)` 校验，失效值降级 'host' |
| runner.ts | :76 LAYER_EXPERTS 7 位对齐；:714 VALID_EXPERTS（registry.listTypes）过滤；:720-721 旧 6 位 union cast 已删（注释留证） |

Done 三 verify 独立复核：`grep -rn "marketing: '营销'" src/` = **0**（含 _extinct）；`grep -c business_model src/tui-v2/chat.tsx` = 0；`tsc --noEmit` = 28 = 基线，错误分布（_extinct 聚合 + server.ts）写集零命中。

### 3.4 发现

- **P2（已披露观察项，建议另立任务）**：runner.ts:714-715 无效专家 ID `if (!expertType) continue;` **静默丢弃**（无 log.warn）——extensions/sentinels/ manifests 大量旧专家 ID 为数据层传播，交付方已在合并消息登记「超范围未修，建议另立任务」。铁律 11 精神下建议后续 D# 加 log.warn + 计数（归因: implement 存量）。
- **P2（M2，审计材料）**：清单写集「src/agent/expert.ts」实为 expert-config-loader.ts + cli/commands/expert.ts；复跑路径「tests/store/manifest-consistency.test.ts」实为 tests/expert/（§9 F2）。

---

## 四、D568 — enterprise-fact superseded_by 语义实现（新审）

### 4.1 提交集

7b576c89 (#330) D568 侧 5 文件：scripts/control-tower/enterprise-fact-store.ts + tests/control-tower/enterprise-fact-chain.test.ts + memory note（proposed，D395-a 门禁通过）+ brief + task-state。

### 4.2 独立复跑与语义核验

| 项 | 证据 |
|---|---|
| 测试 | `npx vitest run tests/control-tower/enterprise-fact-chain.test.ts` = **4/4 passed**（断言①旧条目保留+supersededBy 回填 / ②readFactVersion+listFactVersions 追溯 / ③默认读链头 / ④listFacts 只列链头+deleteFact 清理全链——expect 全部带失败消息，非空壳） |
| 实现语义 | createFact :99-110 归档 `{key}.v{N}.md` + 回填 `supersededBy={key}#v{新版本}`；readFact 默认链头（调用方零改动）；:196 readFactVersion / :212 listFactVersions / :130 listFacts 过滤版本文件 / :168 deleteFact 同步清理历史 |
| 注释一致（Done②） | `grep -c '不覆盖'` = 2（声称 ≥1——超量达标）；原 L91-92 注释与覆盖式 writeFileSync 矛盾已一致化 |
| 调用方真实存在 | fact-approval-service.ts + conflict-scanner.ts（scripts/）+ src/l4/agent-memory-store.ts:20（L4 AgentMemoryStore 即该文件的消费方——清单将「agent-memory-store」列为写集系误读消费方为写集） |
| 类型安全 | 写集 diff `as any/never` = 0 |

- 边界说明（任务方披露）：updateStatus 仍直改链头 front matter（状态流转非内容版本，与 D551 语义一致）——合理。
- **P2（M2，审计材料）**：清单写集「src/agent/enterprise-fact-store.ts + src/agent/agent-memory-store.ts」两文件不存在/未触碰——实际写集仅 scripts/control-tower/enterprise-fact-store.ts（§9 F2）。

---

## 五、D569 — 仪表盘 collector 改 git 权威读取（新审）

### 5.1 提交集与写集纠正

4c48a21c（初版）+ 92ef7285（CTO 审查修复）两提交：dsh/plugins/synova-dashboards/lib/collect.js + brief + task-state。
**清单写集与复跑命令双双错引**（§9 F2）：`scripts/control-tower/collect-dashboard.js` 不存在；`gen-cto-health.py` 未被 D569 触碰（git log 末次触碰为 D579/D461/D453）；实际文件 = dsh/plugins/synova-dashboards/lib/collect.js（export collectDashboards，无 CLI）。

### 5.2 独立实测（正确入口）

```bash
node --input-type=module -e "import { collectDashboards } from './dsh/plugins/synova-dashboards/lib/collect.js'; ..."
```

| 项 | 结果 |
|---|---|
| states | **174**（声称 149 为 2026-09-02 实现时值——6 天新增 25 个 task-state，增长方向一致，含新任务） |
| pct | **5**（声称 11 为 2026-09-02 时值；11→5 由 CT-53/CT-62 兑换诚实化解释——与 D576 自身声称「calc 重跑 1%→5%」精确一致，**非 D569 缺陷**） |
| 三 section | product/tasks/health 全 ok，**零 degraded** |
| 接线 grep | readText→gitShow(:79)、mtimeIso→gitCommitDate(:93)、collectTasks→gitLs(:152)——三 git 读函数均有生产调用（声称 ≥2 属实） |
| 竞态修复 | 92ef7285 diff：ensureFresh 返回 fetch promise + gitLs 头部 `await ensureFresh()`——「冷启动用旧 ref 漏新文件」修复真实落地 |
| 降级 | 每 section 独立 try/catch 返 `{ok:false, degraded:true}`；git 失败回退磁盘读（显式注释）；fetch 60s 冷却防重复拉取 |

**verdict：PASS。** 数据权威性修复（D334「main 是唯一真相」同源）真实生效，实测三个治理面全部绿色。

---

## 六、七任务承接复核（D575-D578 + D586-D588，前审 2026-09-08 报告 e0308d35 已在 main）

> 前审报告 `docs/synova/audit-reports/2026-09-08-K3-seven-task-batch-closeout.md` 已合 main（e0308d35 #415）。本批按派单要求做**合并后完整状态补充审计**：关键测试在新基线 bd4bb53e 独立复跑 + 开放项存续核验。

### 6.1 独立复跑（本批，bd4bb53e）

| 任务 | 命令 | 结果 |
|---|---|---|
| D575 | `npx vitest run tests/services/llm-credential-store.test.ts tests/routes/llm-config.test.ts tests/llm-config-frontend.test.ts` | **64/64 passed** |
| D576 | `bash tests/control-tower/redeem-task-redeem.test.sh` + `bash tests/control-tower/alloc-task-id.test.sh` | **5/5 + 13/13** |
| D577 | `npx vitest run tests/sentinel/threshold-injection.test.ts` | **10/10** |
| D577 | `D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts` | **1/1**，跑后 `git status -- extensions/sentinels` 干净（字节级恢复复证） |
| D577 | `npx vitest run tests/sentinel/` | **29 文件 214 passed + 1 skipped**（D584 改 39 个 sentinel 测试文件后计数不变——前审点级 PASS 维持成立） |
| D578/D581 | `npx vitest run tests/electron/desktop-build.test.ts` | **23 passed + 3 skipped** |
| D586 | `npx vitest run tests/errors/llm-error-taxonomy.test.ts` | **22/22**（35 批跑内） |
| D587 | `npx vitest run tests/llm/tool-result-pruner.test.ts` | **6/6**（35 批跑内） |
| D588 | `npx vitest run tests/store/session-projection.test.ts` | **7/7**（35 批跑内） |

### 6.2 开放项存续核验（基线 bd4bb53e）

| 前审开放项 | 本批状态 |
|---|---|
| D575 P1-1 evidence 落盘被 .gitignore:76 忽略 | `git check-ignore evidence/` 仍命中——**仍开放**（等价自动化代理 64 用例已复核绿） |
| D575 P1-2 llm-config 挂载于 JWT 之前 | server.ts:297-298 顺序不变——**仍开放**（spec 决策 5 已登记，D483-D486 收编窗口） |
| D575 写集合并后漂移 | `git diff c124f8c8 bd4bb53e --stat -- <写集 9 文件>` = **空**——零漂移 |
| D576 三机制终版存活 | redeem-progress.py:58 REDEEM_RECORD_TYPE="task_redeem"；calc-progress.py:95-98 存量降级 + :180-195 k3_only 封顶；`grep -c k3_only` yaml = **25**——全部存活 |
| D577 合并后漂移归属 | `git log ece4e268..bd4bb53e -- src/sentinel/` 唯一命中 e8d11fd6（D580，已审计 PASS）；14 个 live aggregate 中 D577 相关零漂移（aggregate 变更全为 D580 去重稳定化） |
| D578 1-2 四断言 evidence | `git ls-tree -r origin/main --name-only docs/synova/product-lines/evidence/` 无 D578 Win 复跑证据；task-state/D578.json notes「1-2 兑换等四断言 evidence 入 git（D581 修脚本后 Win 复跑）」——**状态维持：待 Win 复跑，不兑换** |
| D586 前审 P1（task-state 缺 main） | 仍缺（`git cat-file -e origin/main:task-state/D586.json` FAIL）——**本批由 K3 回填闭合**（§8） |
| D587/D588 task-state 缺 main | 同态——**本批由 K3 壳回填**（§8） |
| D586 P2×3 / D587 P2×2 | 基线代码未变（写集零漂移），前审发现全部仍真 |

### 6.3 D588 接线状态确认（派单标注项——本批新取证）

| 项 | 状态 |
|---|---|
| D597 派单 | 已入库 main：47b3d2b8 (#416)「docs(D597): D588 会话投影接线派单——M3 第 5 次修复」——条件 ①「接线 D# 显式立项」**已满足** |
| D597 实现 | origin/fix/d597-session-projection-wiring 分支：0a192e6f「fix(D597): D588 会话投影接线——bootstrap.ts 副作用 import 激活投影驱动」——**实现完成**。diff 物理核验：bootstrap.ts:27 `import '../store/session-projection';`（+M3 修复注释 3 行）；bootstrap 自身经 server.ts:84-85 在生产图；session-projection.ts:363 内建投影注册 + :410 installAppendEventSeam 为模块级副作用——import 即激活，落点正确 |
| 合并状态 | **未合 main**（`git grep "session-projection" origin/main -- src/` 除模块自身零命中；`git log origin/main..origin/fix/d597-session-projection-wiring` = 4 commits ahead） |
| 条件 ② task-state/D588.json 壳 | 全历史零命中——**本批由 K3 壳回填**（§8） |
| 条件 ③ DS1 口径 | D597 合并后按「phase 4 完成」路径闭合；DS1 字面 grep（registerProjection 非测试内）仍只在模块文件内命中——口径建议：DS1 判据改为「grep session-projection src/ 非测试命中」或承认 bootstrap 副作用 import 即接线点 |

**D588 verdict 维持 CONDITIONAL PASS**：创建阶段 PASS 不变；接线阶段 = D597 实现完成、合并为唯一剩余动作；三条件中 ②③ 本批闭合、① 仅剩合并动作。合并后复审范围 = 0a192e6f diff（4 行）only。

---

## 七、L3 执行审计（批次级）

| 项 | 证据 | 判定 |
|---|---|---|
| bypass.log 全文 | **0 次 --no-verify**；四任务实现窗口（08-29~09-02）全为 pre-commit PASS；09-02（D567/D568/D569 impl 日）窗口干净 | ✅ |
| head-mismatch 观察 | 08-29T19:33Z 一条（D556 窗口）+ 前批已记 09-04/09-05/09-06 各两条——hash 均不可解析（Win rebase 改写），警告级不升级 | ⚠️ 观察 |
| 审计基线 | `python3 scripts/audit/audit-check.py --full` = **2 PASS / 918 WARN / 481 FAIL**——与前批基线一致，批次零恶化 | ✅ |
| tsc | 28 = 基线，11 任务写集零命中（错误全在 _extinct 聚合 + server.ts 存量） | ✅ |
| 并行合规（CT-14） | parallel-conflicts.log 不存在；D567/D568 同稿合入、D569 独立 dsh 插件文件、D556 独立 renderer/loops——写集零重叠；D488 PR #259 与 D567 同稿已由 CTO 对账关闭（台账 1493539f 内） | ✅ |
| 版本编排 | 11 任务合并提交均未触碰 VERSION.md/version.log（逐哈希扫描） | ✅ |

---

## 八、task-state 回填（本批审计动作，precedent: 4c2b7043）

| 文件 | 动作 | audit 段 |
|---|---|---|
| task-state/D556/D567/D568/D569/D575/D576/D577/D578.json | 在 main 既有文件上回填 | verdict + report 路径 + by/at + findings/conditions |
| task-state/D586.json | 承接前审未提交壳（本工作区 untracked）随本批入 git，audit 段维持前审（report 指向 2026-09-07 报告，该报告文件亦随本批入 git——闭合前批 B1③） | 已含 |
| task-state/D587.json / D588.json | **K3 新建壳**（D384「先登记后使用」债在审计侧闭合：task_id/title/status=audited/impl 摘要自 git + audit 段） | 本批写入 |

---

## 九、批次级发现清单（分级 + 归因）

| # | 级 | 发现 | 证据 | 归因 |
|---|---|---|---|---|
| F1 | **P1** | D556 seed 通道服务端不可达：legacy x-synova-token 在全局 jwtAuthMiddleware 下无法到达 requireGa（DEV_MODE=true 被 dev-admin 覆盖 / false 被 401 拦截）——spec §7.2.3 前提与 auth 拓扑偏差。任务方如实披露并上报 CTO（task-state deviations ②），修复路径 D483-D486 在途 | auth.ts:81-99 白名单无 /api/ga/*；auth.ts:53 getSecret DEV_MODE 返 null → :261-264 自动 dev-admin | devdoc（前提未实证）+ 承接派单在途 |
| F2 | P2 | **审计清单材料错引 ×4**（M2）：D556 写集「ga-detail-sections.ts + src/agent/ + src/l3/」实为 ga-detail-sections.tsx + src/loops/；D567 写集「src/agent/expert.ts」实为 expert-config-loader.ts + cli/commands/expert.ts、复跑路径 tests/store/ 实为 tests/expert/；D568 写集含不存在的 src/agent/ 两文件；D569 写集与复跑命令指向不存在的 scripts/control-tower/collect-dashboard.js 且 gen-cto-health.py 未触碰 | 逐条 git ls-tree/cat-file + ls 实测（§二~§五） | audit（派单材料生成侧） |
| F3 | P2 | D556 spec §3.3.1 写集表 3+5 与实际 3+8 计数漂移（M7）——任务方已预登记 + D333 决策，披露充分 | task-state deviations ① + spec 表 vs commit stat | devdoc（M7，前批 L4-5 已提强化建议未落地） |
| F4 | P2 | D567 观察项：runner.ts:714-715 无效专家 ID 静默 continue（无 log.warn）——存量模式，铁律 11 精神下建议另立 D# 修复 | runner.ts:714-715 | implement（存量，交付方已登记观察项） |
| F5 | P2 | D588 接线（D597）实现完成但 4+ 小时未合 main——条件 ① 闭合只剩合并动作；合并后 D588 复审范围 = 0a192e6f diff（4 行） | `git log origin/main..origin/fix/d597-session-projection-wiring` = 4 commits | control-tower（合并节奏） |
| F6 | P2 | D578 1-2 四断言 evidence 仍未入 git（main 内 product-lines/evidence/ 零命中）——状态维持「待 Win 复跑」，不兑换 | git ls-tree 核对 | audit 状态标注（非缺陷） |

---

## 十、跑偏第二道（north-star 三问，对照 PRODUCT-BRIEF.md 原文）

| 任务 | ①服务真实用户场景（FDE/企业主/GA）？ | ②更接近终态？ | ③Synova 仍是对的那个 Agent？ | 裁决 |
|---|---|---|---|---|
| D556 | ✅ GA 按需诊断（§三.1）的反馈环节——§六 P0「诊断报告质量验证：GA 用过吗？报告准吗？**需要真实反馈**」的第一块砖 | ✅ 反馈收集→审核队列 = 真实反馈机制雏形 | ✅ 无变味 | 对齐 |
| D567 | ✅ 「文件优先」（§四：加专家=写文件不改代码）承诺的物理前提——枚举残留清零才可能加文件即生效 | ✅ registry 单一事实源 = 「无限扩展」终态一步 | ✅ 无变味 | 对齐 |
| D568 | ✅ 企业事实版本链 = 数字孪生（§四）诊断依据可追溯 | ✅ 本体层可追溯性一步 | ✅ 无变味 | 对齐 |
| D569 | ⚠️ 治理线任务（CTO 三仪表盘），非 FDE/企业主直接场景——按治理线标准：数据权威性 = 决策质量输入（D334 main 是唯一真相），间接服务产品方向正确性 | 中性（治理基础设施，不直接推进产品终态） | ✅ 无变味 | 对齐（治理线，如实标注） |
| D575-D578/D586-D588 | 前审 e0308d35 §十已逐任务裁决「对齐」——本批无新偏离 | — | — | 维持 |

**批次级：无方向跑偏。**

---

## 十一、L4 防线缺口收割（本该拦住它的防线是什么？为什么没拦住？）

| 发现 | 本该拦住的防线 | 为什么没拦住 | 缺口（免疫细胞建议，CTO 执行） |
|---|---|---|---|
| F2 审计清单材料错引 ×4（M2 第 N 次：前批 B2 同型） | 前批 L4-5 已提议「K3 材料自收集 SOP 逐条 cat-file 预验」 | **未落地**——且本批材料由 CTO 侧生成（审计清单），责任面从 K3 自收集扩大到派单生成侧；4 个任务的写集/复跑命令路径错引导致审计员现场纠错耗时 | **不新增机制**——将 L4-5 从「SOP 提醒」升级为「派单材料生成侧校验」：CTO/派单侧出清单前对每个任务的写集路径 + 复跑命令逐条 `git cat-file -e origin/main:<path>` 预验（bash 可断言，一条命令）；K3 侧维持现场复验兜底 |
| F1 D556 spec §7.2.3 seed 通道前提与 auth 拓扑不符（M2 devdoc 变体） | dev-doc skill Q1 调研 + hook 接口真实性反向验证 | hook 反向验证只 grep「函数签名存在」——签名存在 ≠ 路由可达；spec 假设的通道（legacy token → requireGa）从未做 auth 中间件拓扑验证 | **devdoc skill 强化一条规则**：Q1 调研新增「通道可达性验证」必答项——spec 声明任何请求通道/鉴权路径时，必须 grep auth 中间件白名单 + 挂载顺序给出可达性结论（D556 案例：auth.ts:81-99 + server.ts:291-298 两步即可发现） |
| F4 D567 静默丢弃观察项（runner.ts:714） | 铁律 11 静默降级禁止（pre-commit 警告存量） | 存量模式从未被门禁点出；交付方如实登记观察项但未另立 D# | **不新增机制**——CTO 将观察项排入队列即可（存量修复走常规派单；铁律 11 已覆盖新代码） |
| F5 D588 接线 D597 实现完成未合 main | plan.json deferred 通道 + PR 合并流程 | 上一批 L4-1 提议的「deferred 到期检查」尚未落地；D597 合并属人工节奏问题 | 合并动作提醒（CTO）；L4-1（pre-commit 对 deferred phase 断言后续 D# 存在）维持待办 |

**M 类命中**：F1/F2/F3 命中 M2/M7 既有类；F4/F5/F6 为存量观察/节奏类。**不新建 M9**——机制数量收敛于错误模式种类数（本轮零新免疫细胞，全部为既有建议落地强化）。

---

## 十二、兑换建议表（只出结论，兑换由 CTO 执行）

| 对象 | 结论 | 一句依据 |
|---|---|---|
| 1-2（D578） | **不兑换**——Win 复跑四断言 evidence 入 git 后 K3 复核 | evidence 未入 git = 不可复核（CT-53 精神）；D581 已修脚本，复跑路径已通 |
| 7-2 / 8-1 / 10-3（D577） | 维持前审 PASS（已 verified） | 本批 10/10 + flip 1/1 + sentinel 214 绿 + 接线存活 |
| 桌面端「首启 LLM 配置」点（D575 P2-4） | 建议 CTO 补登记验收点 | 能力已 PASS 而产品线无对应点（前审存续） |
| D556 GA 校准面 | 前端交付面 PASS；seed 通道缺口走 D483-D486 收编后建议补 E2E 实测点 | F1 修复路径在途 |
| D588 三条件 | ②③ 本批闭合；① 仅剩合并 origin/fix/d597-session-projection-wiring → 合并后复审 = 0a192e6f diff | 接线落点已物理核验（bootstrap.ts:27 + server.ts:84-85 生产图） |

---

## 十三、附：本批复跑命令与结果总表（2026-09-08，Node v22.23.2，env -u ELECTRON_RUN_AS_NODE）

| # | 命令 | 结果 |
|---|---|---|
| 1 | `npx vitest run tests/ga-collab-ui.test.ts tests/ga-collab-logic.test.ts tests/loops/ga-calibration-evolution.test.ts` | 3 文件 63 passed（D556） |
| 2 | `npx vitest run tests/expert/expert-enum-propagation.test.ts tests/expert/manifest-consistency.test.ts` | 17 passed（D567） |
| 3 | `npx vitest run tests/agent/cross-validator.test.ts` | 8 passed（D567 回归） |
| 4 | `npx vitest run tests/control-tower/enterprise-fact-chain.test.ts` | 4 passed（D568） |
| 5 | `node --input-type=module -e "collectDashboards(...)"` | states=174 / pct=5 / 三 section ok（D569） |
| 6 | `npx vitest run tests/services/llm-credential-store.test.ts tests/routes/llm-config.test.ts tests/llm-config-frontend.test.ts` | 64 passed（D575） |
| 7 | `bash tests/control-tower/redeem-task-redeem.test.sh` + `alloc-task-id.test.sh` | 5/5 + 13/13（D576） |
| 8 | `npx vitest run tests/sentinel/threshold-injection.test.ts` | 10 passed（D577） |
| 9 | `D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts` | 1 passed，跑后 git clean（D577） |
| 10 | `npx vitest run tests/sentinel/` | 29 文件 214 passed + 1 skipped（D577） |
| 11 | `npx vitest run tests/electron/desktop-build.test.ts` | 23 passed + 3 skipped（D578/D581） |
| 12 | `npx vitest run tests/errors/llm-error-taxonomy.test.ts` | 22 passed（D586） |
| 13 | `npx vitest run tests/llm/tool-result-pruner.test.ts` | 6 passed（D587） |
| 14 | `npx vitest run tests/store/session-projection.test.ts` | 7 passed（D588） |
| 15 | `npx tsc --noEmit` | 28 errors（= 基线，写集零命中） |
| 16 | `python3 scripts/audit/audit-check.py --full` | 2 PASS / 918 WARN / 481 FAIL（= 前批基线） |
| 17 | `grep -c "no-verify" .claude/bypass.log` | 0 |
| 18 | `git merge-base --is-ancestor <11 合并哈希> bd4bb53e` | 11/11 全 IN main |

---

> 报告完。本报告提交于分支 `audit/k3-20260908-win-backlog-11`（含报告 + task-state audit 段回填，PR 回流由创始人合并）；兑换执行由 CTO 承担（审计红线：K3 不改 product-lines.yaml / scripts/audit/）。
