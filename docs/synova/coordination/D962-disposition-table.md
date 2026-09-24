# D962 — pre-commit 检查项清单 + 历史事故映射 + 初版去向表

> 阶段 1 唯一交付物（D962-A）。只读 `scripts/pre-commit-check.sh`（1529 行，main @ 6a714483），未改任何 scripts/ 代码。
> 第 5 列（DSH 对应做法）待 B 的 `docs/synova/coordination/D962-dsh-mapping.md` 产出后合入；当前为占位。

## 〇、口径声明（实测 vs CTO 口径）

- **CTO 口径 48 = soft 25 + hard/block 23**。
- **实测口径：50 项**（以脚本内 `hard_check`/`soft_check`/`decl_check`/`warn_check`/`opt_check`/`v5_soft` 调用点 + 3 处内联软计数块 + GATEKEEPER 前置阻断 + 1 处纯报告型 par_collect 计；三态分支（过/拦/执行失败）合并计 1 项）。**以实测 50 为准。**
- 枚举核对命令（原始输出）：
  - `grep -n 'hard_check "\|soft_check "' scripts/pre-commit-check.sh | wc -l` → `38`（含条件分支多计；三态合并后见下表）
  - 级别分布（实测 50 项）：硬阻断路径 20 / 软提示路径 22 / warn 3 / opt 1 / 纯报告 1 / 前置 exit-1 1（注：decl_check 沙箱降级、soft 在 SYNO_CI=1 转硬、warn 在 CI 转硬——同一项跨环境级别不同，此处按本地缺省级别计）。

## 一、实测环境数字（全部命令原始输出）

### 1. pre-commit 耗时（空暂存只读运行）

```
$ time bash scripts/pre-commit-check.sh
  ✅ 全部 13 组通过
  ⚠️  1 项警告 (不阻断)
  ⚠ V5: 1 项软提示（详情见上）——CI 为权威，本地不阻断
real	0m1.618s
user	0m1.578s
sys	0m1.360s
```

（空暂存走 CT-34 纯文档早退以外的全量路径；有代码暂存时会更高，V4.5.1 优化后标称 ~50s。）

### 2. ci.yml 精确 job 数

```
$ grep -nE '^  [a-zA-Z0-9_-]+:' .github/workflows/ci.yml
10:  quality:
105:  test:
163:  architecture:
178:  test-kit-architecture:
202:  control-tower-tests:
284:  integration-check:
295:  checker-review:
311:  audit:
322:  golden-case:
```

**ci.yml = 9 个 job**。workflows 全量共 5 个文件：ci.yml / dashboard-auto.yml / desktop-build.yml / product-progress.yml / progress-freshness-watchdog.yml。

### 3. tests/control-tower/ 文件数

```
$ ls tests/control-tower/ | wc -l
124
```

### 4. gate-hits 命中统计（辅助证据，不做退役唯一依据）

主仓 `.claude/gate-hits.log` 4744 行，hit 聚合 Top（2026-09 至今）：PRD 对照 231 / 时间戳顺序 28 / 主树占用 26 / plan-integrity 23 / 静默吞错 22 / G12 范围 21+6 / Task Brief 6 字段 20 / G12b 10 / 控制塔测试门禁 7 / 文件驱动 7 / G12c 6 / 骨架 brief 5 / D734 5 / verifiable-done 4 / 架构边界 4 / D2 4 / 新文件配对 3。

## 二、8 列去向表（50 项）

列：**①ID ②检查项（脚本行号）③组 ④本地级别 ⑤DSH 对应做法（待 B 合入）⑥历史事故/来源 ⑦tests/control-tower 对应测试 ⑧去向（7 枚举）**

| # | 检查项（行号） | 组 | 级别 | DSH 做法 | 历史事故 | 测试文件 | 去向 |
|---|---|---|---|---|---|---|---|
| 1 | as any / as never / as unknown as 零容忍（L493） | 1 | 硬 | 待B合入 | 铁律38：47 次 as any 运行时崩溃；engine-core 20 桥接文件 as any 绕过类型检查、17 处 CJS require 在 ESM 崩溃；CT-46 `getDatabase() as never` 逃逸 | 无专项（as-any-audit 在 packages/test-kit） | 保留-CI |
| 2 | from" 语法损伤（L499） | 1 | 硬 | 待B合入 | D93/D95：Claude Code 批量改 import 留下 `from"` 残骸，tsc 报错但 token 费、CI 才发现 | 无 | 退役（防护去向：CI quality job 的 `tsc --noEmit` 对 import 语法错误物理报错，同类别已双覆盖） |
| 3 | 硬编码业务数据/类型（L514，调 check-hardcoded.sh） | 1 | 软 | 待B合入 | 文件驱动架构承诺：部门名等可扩展实体写成代码（AGENTS"文件化扩展"节） | 无专项 | 暂不动（grep 启发式高误报，linter 化属阶段 2 决策——铁律35"能变 lint 规则的不靠脚本"） |
| 4 | 旧适配器废弃映射报告（L517，par_collect 纯打印） | 1 | 纯报告 | 待B合入 | V4.2.4：11 个 @deprecated 旧适配器删除后的存量追踪 | 无 | 降为旁路看板指标（无判级纯报告，并入 gate-stats 月报观察） |
| 5 | empty catch 无 log（L551） | 2 | 软 | 待B合入 | 铁律11/24/31：静默降级事故——catch 空吞异常生产无日志 | 无专项（verify-claims 相关不覆盖） | 保留-CI |
| 6 | 静默吞错扫描 `2>/dev/null` 无 swallow-ok（L556） | 2 | 软 | 待B合入 | D313 M5b：Windows 静默吞错门禁（命中 22 次） | 无专项 | 保留-CI |
| 7 | 新文件配对：impl 同 commit 有 test（L583，plan_aware） | 2 | 硬 | 待B合入 | 4 次接线失败：组件过单测但从未被生产代码调用（铁律0-2/48）；命中 3 次 | 无专项（ct-test-gate 不覆盖此项） | 保留-CI |
| 8 | 桩测试：新测试 ≥3 expect()（L610） | 2 | 硬 | 待B合入 | 铁律48：空壳测试→假绿 CI→合并后回归 | 无专项 | 保留-CI |
| 9 | 跨模块集成：bridge/context 需 .integration.test.ts（L611） | 2 | 硬 | 待B合入 | 铁律12：单元测试 mock 一切，跨层调用只有集成才真实 | 无专项 | 保留-CI |
| 10 | 控制塔脚本测试门禁 U7/CT-40（L617-625，三态） | 2 | 硬 | 待B合入 | D393：控制塔脚本改了没测试门禁→交付态红灯无物理拦截；命中 7 次 | ct-test-gate.test.sh | 保留-CI |
| 11 | Secrets 全工作区扫描（L640，par check-secrets.sh；另 L331/L366 纯文档与 fastlane 通道保留同扫） | 3 | 硬 | 待B合入 | .env 真实 API Key 暴露入库 + 飞书 App Secret 暴露（2026-06）；旧门禁只扫暂存区漏掉磁盘 Key | check-secrets.test.sh, secrets-env-exempt.test.sh | 保留-CI |
| 12 | 接线审计：新 export 必须被引用（L677，plan_aware） | 4 | 硬 | 待B合入 | 4 次接线失败（同 #7 源；铁律4/5） | 无专项 | 保留-CI |
| 13 | 接线深度：import 了但从未调用（L697） | 4 | 硬 | 待B合入 | v3.5：agent import 函数不调用以绕过"有调用方"检测 | 无专项 | 保留-CI |
| 14 | 架构边界：禁止跨层引用（L728，内联实现） | 5 | 软 | 待B合入 | 铁律39 跨层违规；命中 4 次 | 无专项（check-architecture.sh 在 CI architecture job 单独跑） | 合并到 check-architecture.sh（新名：CI architecture job 单点判定；全类别：L1→L4/L5、L2→L5、L3→engine-core 跨层 import——pre-commit 内联副本与独立脚本双实现漂移） |
| 15 | 桥接文件/包级 engine-core/壳包检测（L767） | 5 | 软 | 待B合入 | 铁律46：2026-05~06 engine-core 拆分欺诈——声称完成 4 次、538 文件原封不动、20 桥接文件伪装迁移、17 处 CJS require 运行时崩溃（Synova 最严重事故）；V4.4.2 Codux 审计再爆 42 行壳包绕过 | 无专项 | 保留-CI |
| 16 | 铁律47：声称拆分完成须 grep 物理证明（L779 warn） | 5 | warn | 待B合入 | 同 #15（tsc 零错误≠拆完，import 路径骗编译器骗不过 grep） | 无 | 保留-CI（warn 在 SYNO_CI=1 转硬，D542） |
| 17 | 主树占用检测：主树脏+多活跃 session（L843） | 6 | 硬 | 待B合入 | M8 变体四连发（D394→D481/482→D486→D537）：并行 session 主树互踩；命中 26 次 | parallel-main-tree-occupancy.test.sh | 保留-脚本（本地并行语义，CI 单 runner 无意义；本地物理硬拦） |
| 18 | Task Brief 存在（L894 decl） | 6 | 硬(decl) | 待B合入 | 铁律0：无 brief→假设共识→做没人要的东西；v2.5 --no-verify 泛滥诱因之一 | task-start.test.sh（brief 生成侧） | 保留-CI |
| 19 | Task Brief 6 核心字段（L895 decl；架构层走 brief_parser.py 单源，D707） | 6 | 硬(decl) | 待B合入 | 命中 20 次；D707：第二套 awk 解析器与 brief_parser.py 结论相反，232/629 份 brief 误报，D665 白烧一轮 CI（PR #494 首轮红） | brief_parser.test.sh, brief-parseable.test.sh, brief-parser-strip.test.sh | 保留-CI |
| 20 | 骨架 brief 占位符检测（L906） | 6 | 硬 | 待B合入 | D547：骨架 brief 占位符进 main→check-plan-integrity CI 回退命中→全局阻断所有非 docs PR（D544/D546）；同类第三次复发；命中 5 次 | skeleton-brief-gate.test.sh | 保留-CI |
| 21 | 时间戳顺序：brief 早于代码（L916） | 6 | 软 | 待B合入 | V4.2.5 免疫细胞#18：brief 未填先写码，VSCode 扩展忽略 exit code→证据落 /tmp/；命中 28 次 | 无专项 | 保留-CI |
| 22 | Notes 迁移门禁 D472（L921-933 条件软；另 L336-345 纯文档早退分支内硬拦同源） | 6 | 软/硬 | 待B合入 | 铁律49/D472：proposed/ 僵尸条目——实现落地但决策 Note 未迁移 | check-notes-lifecycle.test.sh, notes-four-state.test.sh | 保留-CI |
| 23 | plan-integrity：Q1/Q2 承诺可验证（L936 v5_soft） | 附加 | 软 | 待B合入 | V4.1 免疫细胞；命中 23 次 | 无专项（write-set-check.test.sh 邻近） | 保留-CI |
| 24 | Done 可证伪性：-[x] 须含 verify 命令（L939 v5_soft） | 附加 | 软 | 待B合入 | V3.9：声称完成不可证伪；命中 4 次 | 无专项 | 保留-CI |
| 25 | Q0c 取消跟踪：取消任务须有 follow_up（L942 v5_soft） | 附加 | 软 | 待B合入 | V4.2.3：取消不补＝僵尸承诺（q0c-cancelled 升级 warn→block 的后续） | 无专项 | 保留-CI |
| 26 | 旧 SOGNodeType 引用（L945-950 内联） | 附加 | 软 | 待B合入 | V4.5.1 本体迁移期看守 | 无 | 退役（防护去向：实测 `grep -rn "SOGNodeType\.\|SOGEdgeType\.\|@synova/sog-core" src/ --include="*.ts"` 仅 1 处且为注释 src/mvp-server.ts:13——迁移已完成、检查恒空转；旧引擎引用类别由 #15 桥接/旧包扫描承接） |
| 27 | 旧 SOGEdgeType 引用（L951-955 内联） | 附加 | 软 | 待B合入 | 同 #26 | 无 | 退役（防护去向：同 #26，实测零代码引用） |
| 28 | @synova/sog-core 仍被 src/ 引用（L957-961 内联） | 附加 | 软 | 待B合入 | 同 #26 | 无 | 退役（防护去向：同 #26；且与 #15"禁止旧引擎引用"同类别防重复癌变） |
| 29 | PRD 对照：Done 引用 PRD 章节（L972 opt，永不转硬） | 附加 | opt | 待B合入 | 命中 231 次全程零阻断——纯提示噪音第一名（D520 实证：转硬会误炸 Iron Laws） | 无 | 降为旁路看板指标（gate-stats 已记录；从 pre-commit 输出移除减噪） |
| 30 | 禁止新 DiagnosticModule（L992） | 7 | 软 | 待B合入 | DiagnosticModule 注册表已删但 agent-tool-registry.ts:386 listModules() 运行时崩溃 | 无 | 暂不动（Sentinel 接口替代期看守；存量清零后再评估退役） |
| 31 | 专家配置校验：yaml 引用断裂（L995-1000） | 7 | 软 | 待B合入 | 引用断裂=运行时崩溃（expert-registry tool/skill 引用须真实存在） | 无专项 | 保留-CI |
| 32 | 门禁故障审计：24h 失败>10 次告警（L1016-1023） | 7 | 警告 | 待B合入 | v2.5→v3.0：38 项检查 90s 导致 15 次 pre-commit 失败、--no-verify 泛滥 | 无 | 降为旁路看板指标（观测型 meta 检查，无判定语义；数据源 pre-commit-failures.log 已可入 gate-stats） |
| 33 | 绕过审计 7c：detected/possible-bypass 分级（L1029-1055） | 7 | 软/告警 | 待B合入 | D438：强弱信号分离——stale marker 误报不再锁死；v2.5 --no-verify 泛滥 | bypass-ledger.test.sh, check-bypass-log.test.sh, bypass-union-merge.test.sh | 保留-脚本（本地绕过行为检测，CI 无 --no-verify 场景） |
| 34 | 数据流：路由文件须含 API 调用证据（L1070） | 7 | 软 | 待B合入 | 静态 mock 未替换（原组18） | 无 | 降为旁路看板指标（grep 启发式"API 调用证据"模式匹配易误报，命中记录看板观察，不做判定） |
| 35 | 验收 CI：能力验收测试过 CI（L1088 v5_soft） | 8 | 软 | 待B合入 | V3.9 能力验收 | 无专项 | 保留-CI |
| 36 | 文件驱动架构完整性（L1089 v5_soft，check-file-driven.sh；命中 7 次） | 8 | 软 | 待B合入 | V3.6 关键新增：文件驱动是核心架构承诺，防"engine-core 欺诈模式"在文件驱动上重演 | 无专项 | 保留-CI |
| 37 | 契约门禁：声明产出须在暂存区（L1117，.codex/contracts/） | 9 | 软 | 待B合入 | D257 契约优先（铁律47）；实测 `.codex/contracts` 目录不存在→当前恒跳过 | 无 | 暂不动（契约目录未启用，检查零成本待命；启用与否属阶段 2 决策） |
| 38 | G10 条件区域不匹配（L1156 warn，criteria-code-map.json 存在） | 10 | warn | 待B合入 | D260 V3 CP3：条件区域+测试覆盖 | 无 | 暂不动（映射文件在用；与 G11 同属 CP3 流水线，合并/退役需先评估 criteria-map 使用率） |
| 39 | G11 声明端到端验收但无测试文件（L1179 warn） | 10 | warn | 待B合入 | 同 #38 | 无 | 暂不动（同 #38） |
| 40 | G12 Q2 范围一致性（L1323 decl，认领制 v2；命中 21+6 次） | 12 | 硬(decl) | 待B合入 | D296 跨 session 污染根治 + D291 并发 brief 误伤 + D502/D506 CI 时区 fail-open 事故 + D749 写集单一事实源 | g12-day-window.test.sh, g12-taskstate-exempt.test.sh, write-set-check.test.sh | 保留-CI |
| 41 | G12d 生成物单点生成门禁（L1345 硬） | 12 | 硬 | 待B合入 | D458/D429/D452/D455：session 手改 CI bot 单点产物→并行冲突多次实证 | generated-gate.test.sh | 保留-CI |
| 42 | G12b brief 可解析性（L1353 decl；命中 10 次） | 12 | 硬(decl) | 待B合入 | D313 M3：消灭双副本解析器 | brief-parseable.test.sh | 保留-CI |
| 43 | G12c dev doc 写集验证（L1362 软；命中 6 次） | 12 | 软 | 待B合入 | D313 M3b：dev doc 声明写集 vs 实际 | check-dev-doc-write-set.test.sh | 保留-CI |
| 44 | G12d 声称↔证据对照表（L1371-1379，三态 soft/hard） | 12 | 软/硬 | 待B合入 | U4/D423：交付声明须逐条挂证据 | verify-claims-table.test.sh | 保留-CI |
| 45 | G13 技能同步一致性（L1394/1396 硬，三态） | 13 | 硬 | 待B合入 | D370：.claude/skills ↔ .dsh/skills 双目录漂移；误报率低、命中即真事故 | sync-dsh-skills.test.sh | 保留-CI |
| 46 | GATEKEEPER 前置：当日 detected-bypass 硬阻断（L239-257，exit 1；SYNO_GATEKEEPER_ACK=1 人工放行降级） | 前置 | 硬(exit) | 待B合入 | D201 L3；CT-29/D421 单点误报不再锁死全线（逃生舱写 degraded-events.log） | tag-bypass-wiring.test.sh, check-bypass-log.test.sh | 保留-脚本（本地 --no-verify 语义，CI 显式跳过防自阻断） |
| 47 | D1 文档真相：导航文档 vs 代码事实（L1416-1430，三态 soft） | D782 | 软 | 待B合入 | D782/K3 2026-09-14 §7.2：D1 建成即零调用——M3"机制建成未接线"第三次复发，W1/W2 断言红 ≥25 天无 runner 可见 | founder-truth.test.sh（邻近）、doc-commit-exempt.test.sh | 保留-CI（刚接线的新防线，历史欠账正在还） |
| 48 | D2 登记门禁：新 .md/.yaml 须登记 DOCS-REGISTRY.yaml（L1433-1446，三态 soft；命中 4 次） | D782 | 软 | 待B合入 | 同 #47 | 无专项（tests/doc-system/doc-registry-gate.test.sh 在 CI） | 保留-CI |
| 49 | D734 PR 预算：文件数/单域/落后基线（L1462-1474，三态 soft；命中 5 次） | 附加 | 软 | 待B合入 | D721：一个 PR 背三类门禁问题挂半天、分支落后差点回退他人成果 | check-pr-budget.test.sh | 保留-CI |
| 50 | V5 平台敏感命令：新控制塔脚本对照 PLATFORM-CHECKLIST（L1479-1492 软） | 附加 | 软 | 待B合入 | D520：裸 python3/date -v/grep -P 的 Windows 坑（D313-D316 全程踩坑） | platform-checklist.test.sh | 保留-CI |

### 保留边界声明（P0 三件 + 事故回归集）

- **P0 三件不在本表 50 项内**（它们是 CI/pre-push 侧门禁，不是 pre-commit 检查项），实测确认存在且**全部保留**：`merge_writeset_gate`（ci.yml:102，测试 ci.yml:256）、`check-dsh-anchor`（测试 ci.yml:267）、`check-k3-report`（测试 ci.yml:268）。
- 事故回归集（#1 铁律38×47次、#15/#16 engine-core 欺诈、#7/#12 接线×4次、#11 Secrets、#41 生成物冲突、#17 M8×4次、#40 D296/D749）均落在保留/合并列 ✔。

## 三、统计（与表逐行一致）

| 去向 | 数量 | 项 |
|---|---|---|
| 保留-CI | 33 | 1,5,6,7,8,9,10,11,12,13,15,16,18,19,20,21,22,23,24,25,31,35,36,40,41,42,43,44,45,47,48,49,50 |
| 保留-脚本 | 3 | 17,33,46 |
| 合并到<X> | 1 | 14（合并到 check-architecture.sh） |
| 降为旁路看板指标 | 4 | 4,29,32,34 |
| 退役（防护去哪了） | 4 | 2,26,27,28 |
| 暂不动 | 5 | 3,30,37,38,39 |

合计 33+3+1+4+4+5 = **50** ✔（逐行核对：保留-CI 列举 33 个编号）

**最终统计：保留 37（CI 33 + 脚本 3 + 合并 1 保留语义）/ 旁路 4 / 退役 4 / 暂不动 5**。

## 四、证据附录（可复核命令）

| 声称 | 命令 | 结果摘要 |
|---|---|---|
| 脚本 1529 行 | `wc -l scripts/pre-commit-check.sh` | `1529` |
| 检查调用点 38 处（未合并三态） | `grep -n 'hard_check "\|soft_check "' scripts/pre-commit-check.sh \| wc -l` | `38` |
| ci.yml 9 job | `grep -nE '^  [a-zA-Z0-9_-]+:' .github/workflows/ci.yml` | quality/test/architecture/test-kit-architecture/control-tower-tests/integration-check/checker-review/audit/golden-case |
| tests/control-tower 124 文件 | `ls tests/control-tower/ \| wc -l` | `124` |
| pre-commit 空跑 1.6s | `time bash scripts/pre-commit-check.sh` | `real 0m1.618s`，✅ 全部 13 组通过 |
| SOG 零代码引用 | `grep -rn "SOGNodeType\.\|SOGEdgeType\.\|@synova/sog-core" src/ --include="*.ts"` | 1 处，src/mvp-server.ts:13 注释 |
| 契约目录不存在（#37 恒跳过） | `ls .codex/contracts` | `No such file or directory`；criteria-code-map.json 存在 |
| gate-hits 数据 | 主仓 `.claude/gate-hits.log` | 4744 行，hit 聚合见 §一.4 |

## 五、待办（阶段 2 输入）

1. B 的 DSH 映射表产出后合入第 5 列（当前全部"待B合入"占位）。
2. 退役 4 项（#2/#26/#27/#28）与旁路 4 项（#4/#29/#32/#34）的物理实施属阶段 2，须走 ctrl-tower-change 模式 + CT 排期（本阶段未动任何 scripts/ 代码）。
3. 合并项 #14 的实施前提：确认 CI architecture job 与 pre-commit 内联版判定完全同源后再删内联副本。

— D962-A，工作树 .synova-wt-d962a（分支 docs/d962-disposition），2026-09-25
