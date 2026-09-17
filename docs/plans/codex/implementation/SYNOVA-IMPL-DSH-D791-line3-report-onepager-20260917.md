---
north-star:
  服务用户: GA（增长顾问，1 人服务 10-20 家客户）+ 企业主（老板 —— 报告真正的读者，PRODUCT-BRIEF §二「最终受益者 = 企业主」）
  服务场景: 诊断跑完 → 老板/GA 打开一页纸 → 10 分钟内看懂「卡在哪 / 凭什么这么说 / 各维度循环怎么样 / 下一步做什么」；想深挖再翻详细报告
  模块终态: 线 3 报告体系 —— 一页纸 = 结论先行四槽位（结论 / 关键证据 / 各维度循环结论 / 行动建议），每条结论带可解析的溯源指针；老板看得懂、审计员查得到源（驻扎企业内部的麦肯锡的第一页）
  对齐北星: .claude/PRODUCT-BRIEF.md §一（不是 ChatBot：自己发现信号、自己出报告）+ §二（GA 用 / 企业主看）+ §三（GA 按需诊断 → 报告）；主线支柱②「报告可溯源」（docs/synova/coordination/整体推进计划-主线-20260913.md §一）
  完成标准: 入口 GET /api/diagnosis/consult/:reportId/report?format=markdown（生产路由，checkpoint 冷读）→ 处理 renderOnePager(report, depth, inputs) 渲染四槽位（循环结论由 cycles/ 注册表驱动、内容为既有溢出快照字段，不新造指标）→ 结果 bash scripts/golden-scenarios/GS-08-report-readable/run.sh exit 0（含 3 条负向断言 + 指针审计 externalResolvableCount ≥ 1）+ 点级证据 3-1/3-7 由 uncommitted → pending_k3
  当前进度: 线 3 = 8 个验收点 0 证据（7 uncommitted + 1 pending_k3，product-progress.json 实读）；D480 已交付一页纸渲染（三槽位混合、无证据槽、无循环槽、无溯源指针）；GS-08 已绿但证据落在 calc-progress 不扫的目录且验收点 id 不匹配 → 三点循环「绿了不算分」（本 spec §4 缺陷 A/B 实测）。本 spec 覆盖 3-1（一页纸结构）+ 3-7（各维度循环结论）
---

<!--
  SYNOVA-IMPL-DSH-D791: 线 3 报告体系 —— 一页纸四槽位 + 各维度循环结论 + 结论可溯源（GS-08 改造）
  状态: dev doc | 2026-09-17 | 优先级 P0（线 3 支柱②「报告可溯源」）
  派单: docs/synova/coordination/派单-批六首批三卡-20260916.md 卡 2（域: win；dev-doc session 产出 spec）
  权威文档: product-lines.yaml 线 3 的 3-1/3-7 定义 + 整体推进计划-主线-20260913.md §一 支柱② + GS-08 场景（scripts/golden-scenarios/GS-08-report-readable/）
  依赖: 无上游阻塞（D480 一页纸渲染已在 main；D593 报告冷读已在 main）；D790（度量口径修复）与本任务无文件交集（D790 只动 scripts/product-lines/）
  并行: 写集与在飞 D782（scripts/doc-system、.github）、预算门禁口径（scripts/control-tower/check-pr-budget.sh）零交集
  实现写集: 12 文件 = 6 修改 + 6 新建（§5.1；上限 = D734 的 12 文件，不得再加，超限拆单）
-->

# SYNOVA-IMPL-DSH-D791 线 3 报告体系：一页纸四槽位 + 各维度循环结论 + 结论可溯源

> **一句话问题**：线 3 的 8 个验收点**全部 0 证据**，且 3-1「一页纸报告结构」与 3-7「一页纸含各维度循环结论」**无 spec 载体**。实测根因有三层：① 一页纸只有「结论 + Top3」混合段，没有「关键证据」槽、没有「各维度循环结论」槽（D480 只做了渲染器，未做槽位）；② 循环数据早在生产可用（`GET /api/overflow/dashboard/:enterpriseId`），报告侧**零消费**；③ GS-08 场景**已经绿了三次**，但证据写在 calc-progress 不扫描的目录、验收点 id 写成场景私有标签（S8-1），所以「绿了不算分」——线 3 的数字永远涨不上去。

---

## 1. Authority Doc Verification

**权威 ① — 派单卡 2 原文**（`docs/synova/coordination/派单-批六首批三卡-20260916.md` §卡 2）:

> **问题**：线 3（报告体系）8 个验收点**全部 0 证据**（7 uncommitted + 1 pending_k3）；3-1「一页纸报告结构（结论先行，10 分钟看完）」与 3-7「一页纸含各维度循环结论（客户/资本/人才等）」无 spec 载体。
> **做什么**：写 spec（`docs/plans/codex/implementation/SYNOVA-IMPL-*-<日期>.md`），覆盖：一页纸信息架构（结论先行的槽位定义：结论 / 关键证据 / 各维度循环结论 / 行动建议）· 数据来源：42 边本体 + 循环模型 + 哨兵 findings（**必须能溯源到证据**，服务支柱②）· 3-7 的「各维度循环结论」如何从既有 `cycles/*.cycle.json` 与 `packages/sog-core ` 派生（不许新造指标）· 验收：GS-08（报告可读场景）可重跑、含负向断言；每节给出可证伪 Done 标准。

**权威 ② — 验收点原文**（`docs/synova/product-lines/product-lines.yaml` 线 3，L140-173）:

> `3-1`「一页纸报告结构（结论先行，10 分钟看完）」· `evidence: ["scenario:GS-08"]` · `status: uncommitted`
> `3-7`「一页纸含各维度循环结论（客户/资本/人才等）」· `evidence: ["scenario:GS-08"]` · `status: uncommitted`
> 线级 `done_definition`：「老板拿到一页纸结论（看得懂），想深挖有详细报告，想调整深浅说句话就行；手机能看，能导出」
> 线级 `modules` 字段（三项）（L137 —— 第 3 项路径在仓库中实测**不存在**，见 §4 缺陷 G）

**权威 ③ — 主线支柱②**（`docs/synova/coordination/整体推进计划-主线-20260913.md` §一，L25）:

> | **② 报告可溯源** | 证据链接通（采集→落库→引用） | 一条诊断报告能溯源到 ≥1 条原始证据 |

同文 §五 原则 8（L99）：「声称必有物理证据 —— 交付须含『声称 ↔ 命令+原始输出』表；无证据=未完成」。

**权威 ④ — GS-08 场景定义**（`scripts/golden-scenarios/README.md` + 场景自带 `README.md`）与 GSS 断言引擎契约（`scripts/golden-scenarios/common/assert.ts` 头注释 L16-20）:

> 断言只认产品物理输出（HTTP 响应/表行数/文件内容/进程退出码），不认 agent 自述；`assertions` 必须 ≥3 条（正常 + 降级 + 负向，GSS 设计 §2.3，assert.ts:73 执行体）；每条断言必带 `purpose`；三态语义 pass/fail/error（`"真空结果" ≠ "查询失败"`）。

**权威 ⑤ — 铁律**（`AGENTS.md`）：0-2（spec→test→impl→wire）、1/4/5（入口→交互→结果；追调用链）、11/24/31（降级必须有 log + degraded 且传播到可见面）、37（dead code 入仓库即违规）、38（`as any` / `as never` / `as unknown as` 零容忍）、39（五层边界）、47（契约优先）、48（测试非空壳三路径）、49（非平凡变更须引用 memory/notes 四态 Note）。

**权威 ⑥ — DSH 基线更正（2026-09-17 实测，本 spec 的调研纪律）**:

> 仓库内 DSH 侧文档（`docs/synova/research/DSH迁移施工图-20260820/`，自标基线 0.1.2-alpha.2 / 0.1.3-alpha.1；`DSH源码锚点映射-20260907/README.md` 自标 0.1.2-rc.1）**已落后于本机实装**。实测命令与结果：
> ```
> DSH="$HOME/Library/Application Support/io.github.hairyf.deepseek-harness-desktop/dependencies/dsh/node_modules/@deepseek-ai"
> python3 -c "import json;print(json.load(open('$DSH/dsh/package.json'))['version'])"   # → 0.1.5-rc.2
> ls "$DSH" | wc -l                                                                     # → 241（旧图"224 包"）
> ls "$DSH" | grep -c "^dsh"                                                             # → 231
> ls "$DSH" | grep -iE "report|onepager"                                                 # → 0 命中
> ls "$DSH" | grep "^dsh-tool" | grep -i report                                          # → 0 命中（旧图 附录A:208 的 dsh-tool-subagent-report 已不存在）
> ```
> ⇒ 结论：**本任务零 DSH 依赖**（不引 `@deepseek-ai` 运行时依赖、不复制 DSH 代码）；本 spec **不引用任何旧图纸的 DSH 侧描述**；凡涉及 DSH 的表述一律以上述实测为准。本 spec 引用的 Synova 侧事实（文件/行号/函数）全部在交付 worktree（`feat/d791-line3-report-spec`，base `origin/main @ 6a06e853`）内逐一 grep/read 实测（§4）。

---

## 2. Problem Statement

对齐北星锚定块：本任务服务的用户是**老板与 GA**，服务场景是**诊断完成后 10 分钟内看懂结论**，模块终态是**一页纸四槽位 + 条条可溯源**。当前差距：

1. **结构差距（3-1）**：一页纸只有「一句话结论 + Top 3 + footer」三件，缺「关键证据」与「各维度循环结论」两个槽位；没有篇幅/条数/单行宽度的可证伪约束 → 「10 分钟看完」无法验证。
2. **数据差距（3-7 + 支柱②）**：循环模型（`cycles/*.cycle.json`，本仓 6 个循环定义）与溢出快照在生产已可用，报告侧**零消费**；诊断报告的结论**没有任何溯源字段**（`DiagnosisReport` 实测只有 description/dimension/confidence，见 §4 缺陷 D），支柱②「报告能溯源到 ≥1 条原始证据」无载体。
3. **证据差距（度量失真）**：GS-08 场景已产出 3 份 `verdict: pass` 证据（2026-08-22 / 09-15 / 09-16），但（a）写在 `scripts/golden-scenarios/evidence/`，而 `calc-progress.py` 只扫 `docs/synova/product-lines/evidence/`（L375 默认值）；（b）验收点标签是场景私有 `S8-1`/`S8-2`，而线 3 的点 id 是 `3-1`/`3-7`（全仓 grep 无任何 S8→3 映射层）。⇒ 线 3 数字恒为 0，**不是没做，是没算**。

**本任务的价值判断（派单 §一「这件事让 ①/②/③ 哪一项前进？」）**：让 **支柱②（报告可溯源）**前进 —— 先把「报告可溯源」这条链在一页纸上物理跑通（结论 → 指针 → 物理记录），并把 3-1/3-7 从「绿了不算分」修正为「绿了算分」。

---

## 3. Q0–Q4

### Q0 定位（项目拼图 + 文件审计）

- **项目拼图**：Synova = 诊断 Agent；本任务在 **L1 交互（报告读取端点）+ L2 编排（报告装配）+ L3 洞察（模板版式）** 三层的「报告最后一公里」。该层现有模块：`src/agent/report-assembler.ts `（四层组装 + 一页纸，265 行）、`src/l3/report-templates.ts `（registry，4 模板）、`src/cycles/ `（6 循环配置 + 溢出计算/仪表盘/图桥接）、`src/agent/sentinel-service.ts `（findings 读侧）、`src/routes/diagnosis.ts `（报告生产入口）。
- **文件审计（关键词 grep）**：`renderOnePager` → 仅 1 定义 + 3 生产调用点（routes/diagnosis.ts:552/700/771）；`cycleRegistry` → 生产调用方 2（routes/overflow.ts、agent/loop-handlers.ts）；`getSentinelExpertReports` → 生产调用方 1（routes/sentinel.ts:84）+ MCP 1（tool-definitions.ts:372）；`buildCycleConclusions` / `report-onepager-trace` → **全仓零命中（本任务新建）**。
- **决策**：**扩展**既有 `renderOnePager` / `executive_summary` 模板（不新建第二套一页纸载体，避免双轨）；**复用**既有 `generateOverflowDashboard` / `cycleRegistry` / `registerLoadedCycles` / `getSentinelExpertReports`（**零新指标**）；**新建** 溯源指针模块 + 循环结论派生服务 + 场景驱动。

### Q1 调研

- **a) 业界最佳实践**：结论先行的董事会级一页纸（BLUF / Minto 金字塔）四件套 = 结论 / 证据 / 分维度状态 / 行动。本 spec 的槽位顺序即照此；「证据」在管理报告里必须是**可回查的指针**（审计可复核），不是形容词。
- **b) 顶级团队怎么做**：① 断言引擎只认物理输出（GSS 设计已固化，assert.ts 头注释）；② 证据必须与「验收点 id」同源对齐（本仓 `calc-progress.py:261-266` 按 `acceptance_point` 索引）——「绿了不算分」的教训正在于此；③ 报告类交付用**确定性与幂等**做回归（同输入同输出），避免不可复现的渲染漂移。
- **c) memory 教训（本仓历史）**：
  - **接线失败 4 次**（AGENTS.md 铁律 0-2 记录）：组件过单测但从未被生产调用 ⇒ 本 spec §8 每条新 export 写死生产调用点 + grep 指纹。
  - **D286「声称 16 实际 17」写集漂移** ⇒ §5.1 写集表逐条声明，实现后 `check-dev-doc-write-set.sh` 对账。
  - **D480「只消费不改 report-templates.ts」**（D480 spec §3.1 注）—— 该约束属 D480 的写集纪律；本任务**必须**改模板（新增三个槽位是版式职责），故在 §5.1 显式登记模板为修改项，并保留 D480 既有断言语义（§7 回归红线）。
  - **D749/D750 假绿教训（K3 P0-3 fail-open）**：`检查未执行 ≠ 检查通过` ⇒ 本 spec 的负向断言与 `error` 三态必须真实生效（assert.ts:236）。
- **决策参考系**：`参考：Anthropic（fail-closed + 机器可验契约）/ DeepSeek（最少机制）/ 第一性原理（结论必须能回查）+ 结论见 §4.5`。

### Q2 范围

**做什么**（每项落到 §5.1 写集表的文件）：
- 一页纸信息架构：`executive_summary` 模板新增 3 个槽位段（关键证据 / 各维度循环结论 / 行动建议）+ 结论槽加溯源指针；篇幅与可读性约束（§5.2）。
- 数据来源与溯源：新增溯源指针模块（构造/解析/覆盖审计/解析审计），每条结论带 `[src:<kind>:<ref>]` 指针（§5.3）。
- 3-7 派生：新增 L2 循环结论派生服务（`registerLoadedCycles` + `generateOverflowDashboard` 复用，**零新指标**，§5.4）。
- 生产接线：`routes/diagnosis.ts` 的 SSE 完成路径 + GET 按需渲染路径注入循环结论与证据要点（§8）。
- 验收：GS-08 场景改造（生产 HTTP 路径 + 四槽位 + 指针审计 + 3 条负向断言）+ 点级证据入库 3-1/3-7（§5.5）。

**不做什么**（含文件路径）：
- 不改 `src/l3/report-template-loader.ts `（.hbs HTML 轨保持现状，只保留 GS-08 既有加载断言做回归）。
- 不改 `src/evidence/evidence-store.ts ` / `src/evidence/types.ts `（证据池接入属支柱② 下一阶段：L1/L2 不可直读 L4，需 L3 provider 另立任务）。
- 不改 src/sentinel/ 目录下任何文件（不新增 findings API；只用既有 L2 只读 `getSentinelExpertReports`）。
- 不改 `src/cycles/overflow-dashboard.ts ` / `overflow-compute.ts` / `cycle-loader.ts`（纯复用；新代码只做映射，不重算）。
- 不做 3-2 详细报告 / 3-3 对话式深浅 / 3-4 导出 / 3-5 手机端 / 3-6 创始人复述（各自独立验收点，本任务不认领）。
- 不改 `scripts/product-lines/**`（D790 在飞，改 `calc-progress.py`；本任务只**调用**既有 `evidence-writer.py` / `calc-progress.py`）。
- 不改 `scripts/audit/**`（K3 专属红线）、不改 CI（`.github/**`）。

### Q3 验收（入口 → 交互 → 结果）

- **入口**：`GET /api/diagnosis/consult/:reportId/report?format=markdown`（生产路由，D593 checkpoint 冷读路径；main 实测 `routes/diagnosis.ts:783`）。SSE 完成路径（`POST /api/diagnosis/consult`）同源产出 `result.report.onePager`。
- **交互**：路由取 `req.app.locals.graphStore`（`src/server.ts :282 ` 注入）+ L2 循环结论派生 + findings 要点 → `renderOnePager(report, depth, inputs)` 渲染四槽位 markdown（每条结论带指针）→ 渲染后跑指针覆盖审计（+ JSON 格式响应附解析审计）。
- **结果**：① 一页纸 markdown 四槽位齐备、篇幅达标、条条带指针、至少 1 条指针解析到「报告之外的物理记录」；② `bash scripts/golden-scenarios/GS-08-report-readable/run.sh` **exit 0**（含 3 条负向断言）；③ 点级证据入库 → `product-progress.json` 线 3 的 `3-1`/`3-7` 由 `uncommitted` → `pending_k3`。

### Q4 契约与测试（铁律 47/48，写代码前定义）

| 新/改能力 | @input | @output | @degraded | 测试（正常/降级/边界） |
|---|---|---|---|---|
| `buildCycleConclusions`（L2 服务，新建） | `orgId: string`；`store: unknown`（注入的 GraphStore 句柄，可为 null） | `{ lines: CycleConclusionLine[]; registeredCount: number; degraded: boolean; reason?: string }` | store 缺席 → 每循环一条「未建立基线」行（`hasSnapshot:false` + `[degraded]`）；无注册循环 → `lines=[]` + `reason='no-registered-cycles'`；加载异常 → `degraded:true` | 正常：2 快照 → 2 行带 `@YYYY-MM` 指针；降级：store null / registry 空；边界：6 循环上限裁剪（负溢出优先） |
| `buildReportPointer` / `parsePointers` / `auditConclusionCoverage` / `resolvePointers`（新建，纯函数） | 文本 / kind+ref / 解析器注入 | 指针串 / 解析结果 / 覆盖审计 / 解析审计 | 输入非字符串 → 返回空结果 + `degraded`（不抛）；解析器缺席 → 该 kind 计 `unknown`（≠ unresolved，不 fail-open） | 正常：4 kind 各解析；降级：解析器抛错 → unknown；边界：空文本 / 无指针 / 重复指针 / 越界 index |
| `renderOnePager(report, depth, inputs?)`（改签名，向后兼容） | 第 3 参数全可选（`cycleConclusions?` / `evidenceHighlights?`） | markdown（含四槽位 + 指针） | 未传 inputs → 槽位渲染 `[degraded]` 诚实说明（不静默省略）；模板降级 → 既有纯文本 fallback（D480 语义不变） | 正常：四槽位齐备；降级：inputs 缺席 / registry 抛错；边界：空 rootCauses（既有用例②语义不变） |
| `executive_summary` 模板（改） | `ReportData`（新增 3 个可选数组字段） | markdown | 数组缺失/空 → 渲染该槽位的 `[degraded]` 说明行 | 正常：三槽位标题 + 条目；降级：全空；边界：条数超限 → slice 上限 |

---

## 4. Current State（2026-09-17 实测，全部 file:line；工作树 `feat/d791-line3-report-spec` @ `origin/main 6a06e853`）

### 缺陷 A（P0，度量失真）：GS-08 已绿，但证据落在 calc-progress 不扫描的目录

- 场景证据在 `scripts/golden-scenarios/evidence/GS-08-2026-08-22.json` / `-09-15.json` / `-09-16.json`（三份 `verdict: pass`，实测读）。
- `scripts/product-lines/calc-progress.py:375` 默认证据目录 = `docs/synova/product-lines/evidence`；`:83` 只 glob 该目录 `*.json`。⇒ **场景证据目录不在扫描面内**（`docs/synova/product-lines/evidence/` 内无任何 `GS-08-*` 文件，实测 `ls` 为零）。
- 后果：老板看到的线 3 完成度 = 0，与场景实际状态无关。

### 缺陷 B（P0，id 不匹配）：验收点标签是场景私有 S8-x，无映射层

- `scripts/golden-scenarios/GS-08-report-readable/expect.json:4-5`：`acceptance_point` = `S8-1` / `S8-2`（场景私有标签，仅在该场景 README/expect 内定义）。
- `calc-progress.py:261-266`：证据按 `verdicts[].acceptance_point` 建索引，点命中靠 `point["id"]`（`:170`）。线 3 点 id = `3-1`…`3-7`（product-lines.yaml:140-173）。
- 全仓 grep：`S8-` 在 `scripts/product-lines/*.py` / `product-lines.yaml` **零命中** ⇒ 无任何 S8→3 映射层。⇒ 即使扫到该目录，也**不会**给 3-1/3-7 记分。

### 缺陷 C（P0，结构缺失）：一页纸只有「结论+Top3」，无证据槽、无循环槽

- `src/l3/report-templates.ts :116-139 `（`EXECUTIVE_SUMMARY`）：产物 = `## <头行>` + `**Top 3:**`（🔴 告警×2 + 📉 目标×1 + 💡 建议×1）+ `📎 完整报告: N 目标 · M 告警`。**无**「关键证据」段、**无**「各维度循环结论」段。
- `src/agent/report-assembler.ts :207-225 `（`toOnePagerData`）：`goals: []` / `obstacles: []`（D480 诚实空缺），`alerts ← rootCauses`，`recommendations ← assembleCeo | flywheel.top3`。**无任何循环数据入参**。
- 篇幅：无任何字符数/条数/行宽约束（`grep -n "length\|slice" src/l3/report-templates.ts ` 仅 `slice(0,3)` 类条数裁剪）。

### 缺陷 D（P0，支柱②断裂）：报告结论零溯源字段

- `src/l3/synova-diagnosis-engine.ts :277-306 `（`DiagnosisReport`）：字段 = reportId / teamId / generatedAt / summary / expertReports[{expert,findings[],confidence}] / rootCauses[{description,dimension,confidence}] / recommendations[{action,priority,expert}] / raw。**无 evidence id、无 pointer、无 source 字段**（实测逐字段读）。
- `src/routes/diagnosis.ts :358 ` 与 `src/routes/conversations.ts :283 `：`evidenceCollector: null`（两处生产装配点，实测 grep）。
- `src/evidence/evidence-store.ts :22 ` 有 `CREATE TABLE IF NOT EXISTS evidence`、`src/l3/evidence-retention.ts :183 ` 有 `new EvidenceStore(db)` ⇒ 底座在、**报告侧未接**（与派单 §一 判断一致）。
- ⇒ 结论：一页纸当前**无法**满足支柱② 判据「一条诊断报告能溯源到 ≥1 条原始证据」。

### 缺陷 E（P1，循环数据零消费）：报告侧看不到任何维度循环结论

- 生产已有：`src/cycles/overflow-dashboard.ts :95 ` `generateOverflowDashboard(enterpriseId, registry, store)` → `OverflowDashboard{rows(DashboardRow[]), heatmap, conductionTimeline, crossScaleWarnings, totalCycles, overflowCount}`；`DashboardRow`（:25-36）= cycleId/cycleName/currentOverflow/unit/trendArrow/trendDirection/maturity/maturityLabel/updateCycle/hasOverflow；排序已含「负溢出优先」（:147-151）。
- 入口已有：`src/routes/overflow.ts :47 ` `GET /api/overflow/dashboard/:enterpriseId`（认证 + 租户校验）。
- 循环注册：`src/cycles/cycle-loader.ts :44 ` `loadCycles` / `:151` `registerLoadedCycles`；生产自加载点在 `src/agent/loop-handlers.ts :621-626 `（registry 空时自加载）。
- `grep -rn "generateOverflowDashboard\|OverflowDashboard" src/agent/ src/l3/ src/routes/diagnosis.ts ` = **零命中** ⇒ 报告侧零消费（实测）。

### 缺陷 F（P1，场景断言只覆盖 .hbs 模板加载，不覆盖生产渲染路径）

- `scripts/golden-scenarios/GS-08-report-readable/run.sh:59-100`：只 + `loadTemplate('executive-summary')` + 用**内联 fixture data** 渲染 .hbs + `listTemplates()`；三条断言（`expect.json:8-30`）全部是模板加载器契约级。
- `run.sh:54`：`node -e "require('$REPO_ROOT/dist/l3/report-template-loader.js')" 2>/dev/null || true` —— **死代码**（输出未使用、`dist/` 不保证存在、`|| true` 吞错；铁律 37 + 11）。
- 从未调用生产渲染器 `renderOnePager`，也从未经过生产 HTTP 报告端点。⇒ 「3-1 结构存在，未验证」的准确含义是：**验证的是模板加载，不是报告**。

### 缺陷 G（P2，登记不改）：线级 modules 第 3 项路径不存在

- `product-lines.yaml:137` 线 3 `modules` 三项，其中第 3 项（一个目录路径）在仓库实测不存在。⇒ 本任务**登记为已知残留**（A1 惰性失效检测对该路径恒无命中，不影响正确性），不在本 spec 写集内修（改 product-lines.yaml 属 CTO 域，且 `locked` 字段标注为创始人确认）。

### 缺陷 H（P2，登记不改）：空诊断仍输出「运行平稳」

- `src/l3/report-templates.ts :121-123 `：`criticalAlerts.length === 0` → `✅ ${orgId}: 运行平稳`。当「没数据」与「真的平稳」不可区分时，这是 fail-open 语义。
- 该行为被既有测试锁定：`tests/agent/report-assembler.test.ts:64-75`（用例② 断言 `toContain('运行平稳')`）。
- 本任务**不修**（会改既有语义 + 需改既有测试 = 写集与回归风险扩大），改为：**新槽位自身不得 fail-open**（§5.2 规则 R4 + GS-08 负向断言 N1 只作用于「各维度循环结论」槽的提取片段）；该残留登记在案，供 3-6 复述核验时判读。

### 环境与门禁实测（影响实现选择）

- 架构门禁现状：`bash scripts/check-architecture.sh` → **全部通过 ✅**（含基线棘轮；新增违规会 FAIL）。
- **L2→L4 是硬门**：`scripts/check-architecture.sh:44-47` 对 src/agent/ 与 src/orchestrator/ 两个目录扫 `from.*l4/`，白名单仅 8 个文件（conversation-engine / engine-context / diagnosis-launcher / knowledge-bridge-service / review-service / sentinel-health-service / workspace-context-bridge / data-ingest-service），**无类型位置豁免**。
- 合规先例：`src/agent/loop-handlers.ts :670 ` `type OverflowStore = import('../l4/graph-bridge').GraphStore;` + `:671` 注释「bridge 只消费 GraphStore 的 createNode/queryNodes 子集；全量接口单源声明于 l4/graph-bridge.ts，此处仅做边界一次 cast」。⇒ 新 L2 服务必须用该形态（不写 `from '../l4/...'`）。
- L1 类型位置豁免：`scripts/check-architecture.sh:92-95` `strip_type_position()` 排除 `import type` / `: import(` / `as import(` / `type X = import(` ⇒ `src/routes/diagnosis.ts ` 可用 `type GraphStoreLike = import('../l4/graph-bridge').GraphStore;` 取 `req.app.locals.graphStore`（`src/server.ts :282 ` 已把 store 挂到 `app.locals`）。
- GS-08 场景用的断言能力（实读 `assert.ts`）：`check.type ∈ {http, sqlite, file, process}`（:38）；`expect` 支持 `exists/contains/notContains/rows/cell(op 含 not_contains)/exitCode/stdoutContains`（:153-197）⇒ **负向断言可用 `notContains`**，无需扩引擎。

---

## 4.5 决策参考（S-12）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| **D1 关键证据槽的数据源** | A 证据池（evidence 表）/ B 哨兵 findings（L2 只读）/ C 双源 | 第一性原理（生产可读性：`evidenceCollector` 生产两处恒 null，读 A = 展示空槽）+ 铁律 39（L1/L2 不可直读 L4 `src/evidence/ `，接 A 需新增 L3 provider）+ Anthropic（fail-closed 诚实空缺胜于编造） | **B**——`getSentinelExpertReports()`（`src/agent/sentinel-service.ts :315 `，L2，已被 `src/routes/sentinel.ts :84 ` 生产消费，零新增文件）；A 源登记为支柱② 下一阶段（§6） |
| **D2 循环结论派生位置** | A 写在 `report-assembler` 内联 / B 独立 L2 服务 | 先例（`src/agent/cycle-snapshot-service.ts :13 ` L2 转发 cycles）+ 可测性（纯派生可单测）+ 最少机制（不新增 L3 层） | **B**——新增 L2 服务文件，内部复用 `registerLoadedCycles` + `generateOverflowDashboard`，导出纯映射函数 |
| **D3 一页纸载体** | A markdown registry（生产 `renderOnePager`）/ B .hbs HTML 轨 / C 双轨同步 | 先例（D480 决策 A）+ 生产调用点（`renderOnePager` 有 3 处；.hbs 仅场景消费）+ 最少机制 | **A 为主载体**；B 保持现状不扩展，GS-08 保留其加载断言（回归，不删） |
| **D4 槽位内容归属** | A 全部内容在模板算 / B 模板只出线格、内容+指针由 L2 装配 | 分层职责（L3 版式 / L2 编排）+ 契约最小面（模板只多 3 个可选 `string[]`） | **B**——模板负责槽位标题/顺序/条数二次裁剪；L2 负责内容与指针 |
| **D5 sog-core 是否纳入派生** | A 依派单原文引 `packages/sog-core ` / B 不引 | 实测（`packages/sog-core/src/index.ts :1-12 ` 自标 **[DEPRECATED]**「已全部迁移到 @synova/ontology…仅保留以满足遗留模块编译依赖」）+ 第一性原理（不新增对 deprecated 包的依赖 = 不制造新债） | **B 不引**；循环↔本体边的既有映射字段直接用（`src/cycles/cycle-types.ts :28-29 ` `edgeRefs`「关联的 42 边 ID」、`:98-99` `mapping[]`），边的权威源引用 `extensions/ontology/edge-types/ `（JSON）——**不在本文档复述任何边/节点计数**（D753 计数一致性在飞，避免第二处数字源） |

> 收敛检查：D1–D5 五问均双参考系指向同一答案（生产可读 + 最少机制 + 不新造指标 + 不新增跨层），无分歧。**参考：Anthropic / DeepSeek / 第一性原理 + 结论如上。**

---

## 5. What We Build

### 5.1 写集（D734 拆单：A 组 win 8 文件 = 本 PR；B 组 mac 见下，PR-B 落盘）

| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/l3/report-templates.ts | 修改 | `ReportData` 新增 3 个**可选**字段（`keyEvidence?: string[]` / `cycleConclusions?: string[]` / `actionItems?: string[]`）+ 结论槽加 `conclusionPointer?: string`；`EXECUTIVE_SUMMARY.render` 在既有头行/Top3/📎footer **之外**追加三段（`### 关键证据` / `### 各维度循环结论` / `### 行动建议`），空数组 → 渲染该槽 `[degraded]` 说明行；条数二次裁剪（≤3 / ≤6 / ≤3）。**D480 既有输出字符串（头行、Top3、`N 告警` footer）一字不改**（保既有 5 用例绿） |
| src/agent/report-assembler.ts | 修改 | `renderOnePager(report, depth?, inputs?)` 第 3 参全可选（`OnePagerInputs{cycleConclusions?, evidenceHighlights?}`，向后兼容）；`toOnePagerData` 增槽位映射（指针由 `agent/report-onepager-trace.ts` 构造）；渲染后调覆盖审计（缺指针 → `log.warn`）；降级语义保持「本函数永不抛出」契约 |
| src/routes/diagnosis.ts | 修改 | ① SSE 完成路径（:552-556）与 ② GET 按需渲染（:698-702）注入 inputs：`req.app.locals.graphStore` → `buildCycleConclusions(orgId, store)`（`type GraphStoreLike = import(...)` 形态，L1 类型位置豁免）、`getSentinelExpertReports()`（L2 只读）→ `renderOnePager(report, depth, inputs)`；③ JSON 格式响应附 `pointerAudit`（解析审计结果）；④ store/findings 缺席 → 传空 inputs（槽位走 `[degraded]`）+ `log.warn`（不静默） |
| src/agent/cycle-conclusion-service.ts | 新建 | L2 循环结论派生：`buildCycleConclusions` + `buildCyclePointerResolver`（`mapDashboardRows` 为模块私有纯映射——pre-commit 组 4 接线审计要求 export 有 src/ 跨文件消费者）；依赖用 `type GraphStoreLike = import('../l4/graph-bridge').GraphStore`（不写 l4 相对路径的静态 import 语句，§4 环境实测 + src/agent/loop-handlers.ts :670 先例） |
| src/agent/report-onepager-trace.ts | 新建 | 纯函数：`buildReportPointer` / `collectSlotLines` / `stripPointers` / `auditConclusionCoverage` / `resolvePointers`（`parsePointers` 为模块私有解析内核；解析对外面 = `resolvePointers`） |
| tests/agent/report-onepager-trace.test.ts | 新建 | 指针面 + 渲染结构面：四槽位 / 覆盖审计 / 三态解析审计（4 kind）/ 降级三路径 / 篇幅与单行宽 / 确定性与渲染时钟无关 / 槽位标题双源一致 / 指针文法边界（共 12 用例） |
| scripts/golden-scenarios/GS-08-report-readable/ | 新建（B 组） | **B 组（PR-B 落盘，本 PR 不落盘）**：场景改造为生产路径验收。确切文件名见下方「B 组清单」；本 PR 以**目录级**声明（正向写集校验对目录只查存在性——精确列 B 组文件名会把"本 PR 未改"判为漂移，D313 M3b 硬阻断） |
| scripts/golden-scenarios/evidence/ | 生成（B 组） | **B 组（PR-B 落盘）**：场景机器产物目录（`GS-08-<date>/` 审计工件 + `GS-08-<date>.json` 断言证据）——机器生成、按日期幂等覆盖 |
| tests/agent/cycle-conclusion-service.test.ts | 新建 | 派生链与 S3 内容面：真实快照映射（零新指标）/ store 缺席与非法 orgId 降级 / 无注册循环 / 裁剪 7→6 / 未注册维度不出现（共 6 用例） |

> **D734 拆单登记（CTO 2026-09-17 裁决，本 PR = A 组）**：原实现写集合计 12 文件，但横跨 **win**（`src/**`、`tests/agent/**`、`docs/plans/**`）与 **mac**（`scripts/golden-scenarios/**`）两域，且与 dev-doc 交付件/证据合计 21 文件 > D734 上限 12 ⇒ 拆两 PR。
> **PR-A（win，本 PR）8 文件**：src 5（report-templates / report-assembler / routes-diagnosis / cycle-conclusion-service / report-onepager-trace）+ tests 2（两个同名配对测试）。实测 `check-ownership.py` → `✅ PASS 8 个文件同域: win`。
> **PR-B（mac，A 合入后开）**：`scripts/golden-scenarios/GS-08-report-readable/` 5 文件 + `scripts/golden-scenarios/evidence/GS-08-<date>.json` + `docs/synova/product-lines/evidence/scenario-<date>.json` + `docs/synova/coordination/编码指令-D791-线3报告体系-20260917.md`（mac 域，故随 B 走）+ `.gitignore` + `task-state/D791.json`（后三者为域判定豁免项）。实测 `✅ PASS 7 个文件同域: mac（域判定豁免 3）`。
>
> **B 组清单（写集机器生成，供 K3 对账）**：
> `scripts/golden-scenarios/GS-08-report-readable/run.sh`（改）、`scripts/golden-scenarios/GS-08-report-readable/expect.json`（改）、`scripts/golden-scenarios/GS-08-report-readable/README.md`（改）、`scripts/golden-scenarios/GS-08-report-readable/render-onepager.ts`（新）、`scripts/golden-scenarios/GS-08-report-readable/fixtures/diagnosis-report.json`（新）、`scripts/golden-scenarios/evidence/GS-08-<date>.json`（生成）、`docs/synova/product-lines/evidence/scenario-<date>.json`（生成）、`docs/synova/coordination/编码指令-D791-线3报告体系-20260917.md`（新）、`.gitignore`（改）、`task-state/D791.json`（新）。
>
> **计数口径（实现回填，更正 spec 算术笔误）**：原 dev-doc 写「6 修改 + 3 目录级新建 = 12」实为 6+2+1+2 = **11**，笔误多算 1；实现后因 pre-commit 组 2 配对门禁拆测试，A+B 合计 **12** 文件（= D734 上限）。
> **测试文件由 1 拆为 2（实现回填）**：pre-commit 组 2「新文件配对」要求每个新增 `src/` 文件有同名 `tests/` 配对（`src/agent/report-onepager-trace.ts ` → `tests/agent/report-onepager-trace.test.ts `；`src/agent/cycle-conclusion-service.ts ` → `tests/agent/cycle-conclusion-service.test.ts `），硬阻断无法豁免（`.claude/plan.json ` 的 deferred 白名单属 D599 且 agent 禁改）⇒ 原声明的单一合并测试文件 `tests/agent/report-onepager.test.ts ` 按被测模块拆为两个同名配对文件，用例总数不变（18）。
> A 组目录级条目无（全部逐文件精确声明）；B 组目录级条目 2 条，其确切文件名见上方「B 组清单」（S-6 义务在拆单场景下的等价形态——精确清单入 spec 正文 + PR-B 描述，表格保持目录级以过正向写集校验）。
>
> **共享资源标注（S-8）**：`docs/synova/product-lines/evidence/`（点级证据落盘）与 D790（卡 1）同目录但**不同文件**（本任务 `scenario-<date>[-n].json`，由 evidence-writer 序号防覆盖；D790 不动 evidence 目录）→ 无写冲突。`scripts/product-lines/**` 本任务**只调用不修改**（D790 在飞）。
>
> **实现后回填义务（S-6）**：若实现偏离方案（如指针模块并入 report-assembler、槽位标题改名），必须在本节**同 commit 回填最终形态**并把目录级条目精确化为确切文件名。

### 5.2 一页纸信息架构（槽位契约，3-1 的靶心）

**槽位定义（顺序固定，标题字面固定——断言依赖）**：

| 槽位 | 标题（字面） | 内容来源（既有，禁新造指标） | 条数上限 | 指针（禁空指针） |
|---|---|---|---|---|
| S1 结论 | `## <头行>` + `### 结论` | 既有头行（alerts 驱动）+ `assembleCeo(report)`（≤200 字，D480 上限）+ 既有 `**Top 3:**` 块 | 头行 1 + Top3 ≤3 | 结论行尾 `[src:report:<reportId>#summary]` |
| S2 关键证据 | `### 关键证据` | `getSentinelExpertReports().reports[]`（finding 摘要 + 置信度 + 时间） | ≤3 | `[src:finding:<sentinelId>@<checkedAt>]` |
| S3 各维度循环结论 | `### 各维度循环结论` | `generateOverflowDashboard().rows[]`（循环名/溢出值+单位/趋势箭头+方向/成熟度标签；**只用 DashboardRow 既有字段**） | ≤6（负溢出优先，复用 dashboard 既有排序） | 有快照 `[src:cycle:<cycleId>@<YYYY-MM>]`；无快照 `[src:cycle:<cycleId>@none]` |
| S4 行动建议 | `### 行动建议` | 既有 `report.recommendations[]`（priority + expert + action） | ≤3 | `[src:report:<reportId>#recommendation:<i>]` |
| 尾部 | `📎 完整报告: …` | 既有 footer（一字不改） | — | — |

**可读性约束（全部可机器断言）**：

| 约束 | 值 | 依据 |
|---|---|---|
| 全文篇幅（去空白字符数） | ≤ **1200** | 中文阅读速度按 300 字/分钟**下限**估算 ≈ 4 分钟 ≤ 10 分钟目标，留 2.5× 余量（含图表/停顿） |
| S1 结论槽 | ≤ 200 字符 | 沿用 D480 `assembleCeo` 既有上限（不新造阈值） |
| S2 / S4 | ≤ 3 条 | 一页纸注意力预算，与 Top 3 对称 |
| S3 | ≤ 6 条 | 本仓已注册循环上限（`cycles/` 实测 6 个 `.cycle.json`：4 builtin + 2 industry） |
| 单行字符数（S2/S3/S4 条目行） | ≤ **60** | 移动端窄屏（3-5 目标的工程前提）不折行；与上一行 S1 ≤200 为**互斥作用域**（见下注） |
| 确定性 | 同输入 → 同输出（字节级） | 一页纸**禁含渲染时刻**（否则 GSS 重跑不可复现、幂等断言失效） |

> **回填注（D791 实现，消解同表歧义——审计可核）**：原表把「S1 结论槽 ≤200 字符」与「单行 ≤60」并列。
> 二者若同作用域，则 200 那行是死条文（200 > 60）。**实现口径**（`auditOnePagerReadability` JSDoc 同款声明）：
> `conclusionChars/Ok` 只量 S1 结论行（≤200）；`maxLineChars/Ok` 只量 S2/S3/S4 条目行（≤60）。
> 且两者均**剥离 `[src:…]` 指针后**计量——指针是审计元数据（单条 30–55 字符），非老板阅读面；
> 计入则 ≤60 在本节 §5.4 自定的行文案格式下**数学上不可满足**（真实 `cycleId` 如 `customer-cycle`
> 实测 67 字符含指针 / 33 字符人类可见，见场景 `onepager-meta.json` 与 `audit-extra.json`）。
> 未放开任何阈值：60 与 200 两个数原样保留，只是划清了各自的作用域。

**诚实规则（本轮新增，3 条）**：
- **R1 指针必填**：S1–S4 的**每个条目行**必须带 ≥1 个 `[src:...]` 指针；槽位**空态行**（无条目可引）豁免，但必须带 `[degraded]` 标记。
- **R2 降级显式**：无数据 → 渲染「未建立基线 / 无记录」+ `[degraded]`，**不得**渲染正面结论措辞。降级标记统一用 ASCII `[degraded]`（**不得**用中文「降级」二字——D480 既有 3 个用例断言正常路径 `not.toContain('降级')`，中文标记会误伤既有用例，§7 回归红线）。
- **R3 不编造**：未注册的循环/维度名不得出现（S3 只由 `cycleRegistry.list()` 驱动）；无快照不得出现趋势箭头（`▲/▼`）或数值。

### 5.3 溯源指针语法与审计契约（支柱②的载体）

**指针文法（ASCII，可 grep，Windows 友好）**：
```
[src:<kind>:<ref>]
kind = report | cycle | finding | evidence        # evidence 本任务不产出（预留，§6）
ref  = report : <reportId>#(summary|rootCause:<i>|recommendation:<i>)
       cycle  : <cycleId>@(<YYYY-MM>|none)
       finding: <sentinelId>@<checkedAt ISO8601>
       evidence: <evidenceId>
```

**解析语义（`resolvePointers(text, resolvers)`）三态**：
| 态 | 条件 | 计分 |
|---|---|---|
| `resolved` | 解析器可用 **且** 目标记录存在 | 计入 `resolvedCount`；`kind ∈ {cycle,finding,evidence}` 另计入 `externalResolvableCount` |
| `unresolved` | 解析器可用 **但** 目标不存在（或 ref 语法非法） | 计入 `unresolvedCount`（**= 编造/漂移指纹，必须为 0**） |
| `unknown` | 解析器缺席/抛错/降级 | 计入 `unknownCount` + `degraded`（**"判不了" ≠ "判过了"**，铁律 24/31；不得当 resolved） |

**审计工件契约（场景驱动写盘，key 顺序固定，无缩进 `JSON.stringify`）**：
```json
{"conclusionLines":N,"linesWithPointer":N,"missingPointerLines":0,"totalPointers":M,"resolvedCount":R,"unresolvedCount":0,"unknownCount":0,"externalResolvableCount":X}
```
- `conclusionLines` = S1 结论行 + S2/S3/S4 条目行（不含槽位空态行、不含标题行、不含 footer）。
- `externalResolvableCount ≥ 1` **即支柱② 判据**（一条诊断报告能溯源到 ≥1 条报告之外的物理记录：循环快照 / finding 记录）。
- 维度审计工件：`{"registeredCount":N,"renderedCount":N,"missingDimensionCount":0,"unregisteredDimensionCount":0}`（S3 渲染的维度集合必须 **=** `cycleRegistry.list()` 的全集：不缺、不多）。
- 篇幅工件：`{"charCount":N,"maxLineChars":M,"slotCount":4,"slotsOk":true,"budgetOk":true,"conclusionCharsOk":true,"maxLineOk":true,"deterministic":true}`。

### 5.4 「各维度循环结论」派生契约（3-7；**不许新造指标**）

**派生链（全部复用既有生产函数，零新算法、零新阈值）**：
```
cycleRegistry.list()  ← registerLoadedCycles()（registry 空时自加载；与 src/agent/loop-handlers.ts :621-626 同语义）
        ↓
generateOverflowDashboard(orgId, cycleRegistry, store)      ← src/cycles/overflow-dashboard.ts :95（既有）
        ↓  rows[]（已按「负溢出优先」排序，:147-151）
mapDashboardRows(rows) → CycleConclusionLine[]              ← 纯映射：拼接既有字段，不计算新量
```
**行文案（固定格式）**：
- 有快照：`- <循环名>：溢出 <currentOverflow><unit>｜<trendArrow> <trendDirection 中文化>｜<maturityLabel> [src:cycle:<cycleId>@<最新快照月>]`
- 无快照：`- <循环名>：未建立基线（无快照数据）[degraded] [src:cycle:<cycleId>@none]`
- 无注册循环：槽位渲染 `- [degraded] 暂无已注册循环模型（cycles/ 无 .cycle.json）`
- `trendDirection` 中文化映射（`rising→上升 / stable→持平 / declining→下降`）为**展示映射**，非新指标；`trendArrow`/`maturityLabel` 直接取既有字段。

**明确禁止**：计算任何新比率/新评分/新阈值（如"循环健康分""维度加权总分"）；把 `hasOverflow`（dashboard 既有 50% 启发式，:110）包装成新指标名；对无快照循环输出数值或趋势。

### 5.5 GS-08 场景改造与兑换链路（3-1/3-7 拿分的唯一路径）

**场景执行序（`run.sh`）**：
1. `fresh-db.ts` → 临时数据目录 + `SYNOVA_DB_PATH`（既有 GSS 契约，铁律 0-4 数据隔离）。
2. `npx tsx render-onepager.ts --mode seed --data-dir <dir> --out <OUT>`：真实 `SqliteGraphStore`（`src/adapters/sqlite-graph-store.ts `）写 2 条循环快照（`writeOverflowSnapshot`，**写后复读校验**——该函数静默吞写失败，不复读不可信）→ 真实 `SessionStore.saveDiagnosisCheckpoint` 写 phase=5 归档行（fixture 报告，`onePager:null` 强制 GET 走生产按需渲染）→ 渲染**降级变体** `onepager-degraded.md`（不传 inputs）与 `onepager-no-snapshot.md` + `cycle-slot-no-snapshot.md`（store 缺席 → S3 全量「未建立基线」）。
3. `bootstrap.ts` 起临时服务（同库）。
4. `curl -H "Authorization: Bearer $GS_TOKEN" "<BASE>/api/diagnosis/consult/<reportId>/report?format=markdown"` → 存 `onepager.md`（**生产路径产物，非 fixture 渲染**）+ `report-endpoint-status.txt`。
5. `npx tsx render-onepager.ts --mode audit ...`：对 `onepager.md` 跑 `parsePointers` + `resolvePointers`（真实解析器：报告自身 + **直读 `graph_nodes` 物理记录**判 @month 存在性——不复用产品查询路径自证）→ 写 `pointer-audit.json` / `dimension-audit.json` / `onepager-meta.json` / `cycle-slot.md` / `audit-extra.json`。
6. `assert.ts --expect expect.json --out scripts/golden-scenarios/evidence/GS-08-<date>.json`。
7. **退出前**（`exit 0` 路径）：点级证据入库（见下）。

> **实现回填（幂等 + 可独立重跑）**：`<OUT>` 落在 **git 跟踪**的 `scripts/golden-scenarios/evidence/GS-08-<date>/ `（非临时目录）——K3 重跑后可直接读原工件；同日重跑**逐字节幂等**（实测 14 个工件 sha 全等）。点级证据入库带**幂等保护**：当日 `docs/synova/product-lines/evidence/scenario-<date>.json ` 已存在则跳过（K3 独立重跑不产生 `-1/-2` 增量、不改写既有证据）；`GS08_PUBLISH_EVIDENCE=0` 可强制跳过。断言数 **24**（含 4 条负向 + 1 条端到端等价性 `http-equals-local-render`：生产 HTTP markdown 与本地同输入渲染逐字节相等）。

**断言清单（≥8 条；负向 3 条标 🚫）**：

| # | id | 类型 | 判定 | 证明 |
|---|---|---|---|---|
| 1 | `slots-complete` | file | `onepager.md` contains `### 各维度循环结论` | 生产 markdown 有四槽位（含循环槽） |
| 2 | `slot-count-and-budget` | file | `onepager-meta.json` contains `"slotsOk":true` + `"budgetOk":true` | 四槽位齐 + 篇幅 ≤1200 |
| 3 | `conclusion-length` | file | `onepager-meta.json` contains `"conclusionCharsOk":true` | S1 ≤200 字符 |
| 4 | `line-width` | file | `onepager-meta.json` contains `"maxLineOk":true` | 单行 ≤60（移动端前提） |
| 5 | `deterministic` | file | `onepager-meta.json` contains `"deterministic":true` | 同输入同输出（幂等） |
| 6 | `pointer-coverage` | file | `pointer-audit.json` contains `"missingPointerLines":0` | R1 条条带指针 |
| 7 | `pointer-resolved` | file | `pointer-audit.json` contains `"unresolvedCount":0` + `"unknownCount":0` | 无编造指针、无未知态 |
| 8 🚫 | `external-traceable` | file | `pointer-audit.json` **notContains** `"externalResolvableCount":0` | **支柱② 判据**：≥1 条指针解析到报告之外物理记录 |
| 9 | `dimensions-complete` | file | `dimension-audit.json` contains `"missingDimensionCount":0` | S3 不缺维度 |
| 10 🚫 | `dimensions-registered-only` | file | `dimension-audit.json` contains `"unregisteredDimensionCount":0`（且 `onepager.md` **notContains** `供应链循环`——未注册维度指纹） | S3 不编造维度（防硬编码「客户/资本/人才」三件套） |
| 11 🚫 | `no-false-calm` | file | `cycle-slot.md` **notContains** `平稳` | 数据缺失不得报平稳（R2；对「运行平稳」fail-open 注入的负向防线） |
| 12 🚫 | `no-fabricated-trend` | file | `cycle-slot.md` **notContains** `▲`（降级变体） | 无快照不得造趋势（R3） |
| 13 | `degraded-honest` | file | `onepager-degraded.md` contains `[degraded]` | 降级显式、不静默（铁律 24/31） |
| 14 | `hbs-loader-regression` | file | 既有 `load-result.json` contains `"degraded":false` | .hbs 轨回归（保留 D449 覆盖） |

**点级证据入库（兑换链路，缺陷 A/B 的修复）**——`exit 0` 后执行：
```bash
python3 scripts/product-lines/evidence-writer.py \
  --type scenario --verdict pass --points 3-1,3-7 \
  --source "scripts/golden-scenarios/GS-08-report-readable/run.sh @ <commit>" \
  --quote "<assert 摘要 + onepager.md 路径 + pointer-audit.json 路径>"
```
- 输出落在 `docs/synova/product-lines/evidence/scenario-<date>.json`（calc-progress 唯一扫描面）。
- **同日失效规避（CT-62）——实现实测更正（重要）**：`evidence-writer.py` 写入的记录**不含 `at` 字段**（实测 :75-86）。**但 `at` 在 main 的 `calc-progress.py` 里只被 `freshness_gate`（**k3 计分路径**，:150-162）消费；`status_for_point` 的 **machine 路径**（scenario/test/ci/task_redeem）调 `git_touched_after(line_modules, latest["date"])` 且**不传 `at`**（:216-232 实测逐行读）。⇒ 对本任务（scenario 证据）**补 `at` 不改变判定**：`--since` 仍取 `<date>T00:00:00`，与 `src/l3/` 提交同日即判 `stale`。
  **正确解法 = 跨天重跑**（本仓既有先例：线 1 的 `test-2026-09-15.json` 因同日提交失效 → 次日 `test-2026-09-16.json` 重验 → `pending_k3`，实测读）。做法：实现提交落库后，在**下一个自然日**再跑一次 `bash scripts/golden-scenarios/GS-08-report-readable/run.sh` → 自动写 `docs/synova/product-lines/evidence/scenario-<新日期>.json `（幂等保护不覆盖旧记录）→ `3-1/3-7` 判 `pending_k3`。
  **不得**改口径迁就：DS13 唯一判定仍是「`3-1`/`3-7` 状态 ∈ {`pending_k3`}」。D790（时间戳粒度）合入后该跨天步骤可省。
- 线 3 `modules` 含 `src/l3/ `（本任务改了 `report-templates.ts`）⇒ 证据的 `at` 必须晚于该文件最后一次提交时刻。

### 5.6 场景工件目录（K3 可独立重跑）

**落盘位置（实现回填）**：`<OUT>` = `scripts/golden-scenarios/evidence/GS-08-<date>/`（**git 跟踪的持久目录**，
非临时数据目录——K3 可独立重跑后直接读原工件；同日重跑覆盖为同名同内容，不发散 `-1/-2` 增量）。

| 工件 | 路径（`<OUT>` = 场景输出目录） | 用途 |
|---|---|---|
| 生产 markdown | `<OUT>/onepager.md` | 槽位/篇幅/指针审计对象（生产 HTTP 产物） |
| 降级 markdown | `<OUT>/onepager-degraded.md` | 降级诚实性 + 负向断言 13 |
| 无快照变体 markdown | `<OUT>/onepager-no-snapshot.md` | store 缺席路径（S3 全量「未建立基线」）留痕 |
| 循环槽片段 | `<OUT>/cycle-slot.md` | 负向断言 11（`平稳`）的精确作用域（生产 S3 段） |
| 无快照循环槽片段 | `<OUT>/cycle-slot-no-snapshot.md` | 负向断言 12（`▲`）的精确作用域（无快照变体 S3 段） |
| 端点状态 | `<OUT>/report-endpoint-status.txt` | 生产端点 HTTP 状态码（断言 1） |
| 种子元数据 | `<OUT>/seed-meta.json` | 快照写入 + 复读校验结果 |
| 审计诊断面 | `<OUT>/audit-extra.json` | `httpMatchesLocal`（生产 HTTP 产物 ≡ 本地同输入渲染，断言 24）等 |
| .hbs 轨回归面 | `<OUT>/load-result.json` / `render-meta.json` / `templates.json` | D449 覆盖保留（断言 21–23） |
| 指针审计 | `<OUT>/pointer-audit.json` | 覆盖/解析/外部可溯源计数 |
| 维度审计 | `<OUT>/dimension-audit.json` | 维度集合与 registry 等价 |
| 篇幅工件 | `<OUT>/onepager-meta.json` | 篇幅/单行/槽位/确定性 |
| 断言产物 | `scripts/golden-scenarios/evidence/GS-08-<date>.json` | assert.ts 机器产物（evidence_map 含 3-1/3-7） |
| 点级证据 | `docs/synova/product-lines/evidence/scenario-<date>.json` | calc-progress 消费面（**3-1/3-7 记分**） |

---

## 6. What We Don't Do

| 不做 | 原因（含文件路径） |
|---|---|
| 不接证据池（`src/evidence/evidence-store.ts ` / `src/evidence/types.ts `）作 S2 源 | 生产装配点 `evidenceCollector: null`（`src/routes/diagnosis.ts :358 `、`src/routes/conversations.ts :283 `）；且 L1/L2 不可直读 L4（铁律 39）→ 需 L3 provider **另立任务**。`[src:evidence:<id>]` 文法预留但不产出（不编造） |
| 不改 .hbs HTML 轨（src/l3/report-template-loader.ts 与 extensions/reports/ 目录下模板） | D480 已裁决 markdown 为主载体；双轨同步属 3-4/3-5 的独立工作（导出/手机端） |
| 不做 3-2 详细报告 / 3-3 对话式深浅 / 3-4 导出 / 3-5 手机端 / 3-6 复述核验 | 各自独立验收点（product-lines.yaml 线 3），本 spec 只认领 3-1/3-7 |
| 不改 `src/cycles/overflow-dashboard.ts ` / `overflow-compute.ts` / `cross-scale-validator.ts` / `cycle-loader.ts` | 纯复用。任何改动都会让 3-7 的「既有」变成「新造」 |
| 不改 `scripts/product-lines/**`（含 `calc-progress.py` / `evidence-writer.py`） | D790（卡 1）在飞同一目录；本任务只**调用**。`evidence-writer` 缺 `--at` 的缺口用「场景直写等价记录」绕开（先例 d592-e2e-2-1.json），不回改脚本 |
| 不改 `product-lines.yaml`（含线 3 `modules` 第 3 项不存在） | 该文件 `locked` 标注创始人确认 + 点 id 属产品定义；缺陷 G 只登记不改 |
| 不改 `tests/agent/report-assembler.test.ts` | D480 既有 5 用例是回归红线（§7）：新槽位设计已保证不改既有输出字符串；若实现发现必须改动 → **停手报 CTO**（属写集扩张，不得自行扩） |
| 不碰 `scripts/audit/**`、不写审计标准、不自我审计 | 铁律 0-5 审计红线（K3 专属） |
| 不引 `@deepseek-ai` 运行时依赖、不复制 DSH 代码 | §1 权威⑥：本任务零 DSH 依赖（实测 0.1.5-rc.2 无报告型能力可借） |
| 不做多租户/权限改造 | `routes/diagnosis.ts` 报告读取的租户语义不在 3-1/3-7 范围；发现缺口 → 登记不修 |

---

## 7. Test Requirements

### L1 单元（新建 `tests/agent/report-onepager.test.ts`，`npx vitest run tests/agent/report-onepager.test.ts`）

| # | 用例 | 路径类型 | 断言要点 |
|---|---|---|---|
| 1 | 四槽位齐备（带 inputs） | 正常 | 四个槽位标题字面命中；S3 行数 = registry 长度；每行含 `[src:cycle:` |
| 2 | 指针覆盖审计 | 正常 | `missingPointerLines === 0`；`conclusionLines ≥ 4` |
| 3 | 解析审计（注入解析器 ×4 kind） | 正常 | 4 kind 全 resolved；`externalResolvableCount ≥ 1` |
| 4 | inputs 缺席 → 槽位 `[degraded]` | 降级 | S2/S3 空态行含 `[degraded]`；**不抛异常**（whole-body catch 契约） |
| 5 | registry.render 抛错 | 降级 | 走 D480 纯文本 fallback（用例③语义不变，回归守护） |
| 6 | 解析器抛错 → `unknown` 而非 resolved | 降级 | `unknownCount > 0` 且 `resolvedCount` 不虚增（防 fail-open） |
| 7 | 确定性：两次渲染字节相等 | 边界 | `renderOnePager(r,'ceo',i) === renderOnePager(r,'ceo',i)`（禁渲染时刻） |
| 8 | 篇幅/单行上限 | 边界 | 1200/200/60 三约束的工件布尔位在超限输入下为 false |
| 9 | S3 裁剪（7 循环 → 6 条） | 边界 | 保留负溢出优先者；被裁条目不出现在正文 |
| 10 | 未注册维度不出现 | 边界 | 输入含未注册名 → 输出不含该名（防硬编码维度表） |

### L2a 接线（`bash scripts/golden-scenarios/GS-08-report-readable/run.sh`）

- 生产路径：HTTP `GET /api/diagnosis/consult/:reportId/report?format=markdown` → 200 + markdown（**非** fixture 渲染）。
- 断言 1–14（§5.5 表）：exit 0 才算出证据。
- 生产调用点校验：`grep -n "buildCycleConclusions\|getSentinelExpertReports" src/routes/diagnosis.ts ` 双命中（§8）。

### L2b 降级（同场景 + 单测）

- store 缺席（`app.locals.graphStore` 未注入）→ S3 槽位 `[degraded]` + `log.warn`（不静默、不 500）。
- findings 源空 → S2 槽位 `[degraded]`。
- registry 空 → S3 槽位 `[degraded]` + `reason='no-registered-cycles'`。
- 断言 11/12/13 即降级诚实性的机器判定。

### L2c 边界

- 空 `rootCauses` + 空 `recommendations`：`renderOnePager` 不抛；既有「未发现显著瓶颈」路径不变（D480 用例②语义）。
- 单条描述超长（> 500 字符）：裁剪后不破单行 ≤60 约束（或整行入槽位时按既有 `assembleCeo` 截断语义）。
- checkpoint 归档行形状非法（缺 reportId / summary 非字符串）：GET 走 404（既有 `isDiagnosisReportArchive` 语义，不 500）。
- 指针 ref 越界（`#recommendation:99`）：计 `unresolved`（不静默通过）。

### red→green 对照（S-5：RED 必须覆盖失败模式，非仅 happy path）

| 用例/断言 | 改造前（RED） | 改造后（GREEN） |
|---|---|---|
| `slots-complete`（断言 1） | `### 各维度循环结论` 不存在 → fail | 生产 markdown 命中 → pass |
| `slot-count-and-budget`（断言 2） | `onepager-meta.json` 不存在 → error/fail | 工件生成 → pass |
| `pointer-coverage`（断言 6） | 指针机制不存在 → 工件缺失 → fail | `missingPointerLines:0` |
| `external-traceable`（断言 8 🚫） | 无任何 `[src:cycle:…]` → `externalResolvableCount:0` → **负向断言 fail** | ≥1（循环快照解析成功） |
| `no-false-calm`（断言 11 🚫） | 降级变体若按「hasOverflow=false → 平稳」实现 → fail | 空态行 = `未建立基线` → pass |
| `dimensions-registered-only`（断言 10 🚫） | 硬编码「客户/资本/人才」三件套 → 缺 3 个已注册循环 → `missingDimensionCount>0` → fail | registry 驱动 → pass |
| `hbs-loader-regression`（断言 14） | 已 pass（回归项，非 red） | 保持 pass（零回归） |
| 既有 D480 5 用例（`tests/agent/report-assembler.test.ts`） | 全绿（基线） | **必须仍全绿**（禁改既有断言） |

---

## 8. Wiring Verification

> 铁律 4/5：入口可触达 + 完整链路走通 + 结果可见。测试调用**不计**（S-3），下表每条都是 `src/ ` 内的生产传递链。

| 新 export / 新字段 | 生产调用点（真实传递） | 验证命令（实现后逐条跑） |
|---|---|---|
| `buildCycleConclusions`（`src/agent/ ` 新 L2 服务） | `src/routes/diagnosis.ts ` — SSE 完成路径（:552 区块）与 GET 按需渲染（`renderOnePagerOnDemand` :698 区块）各 1 处 | `grep -n "buildCycleConclusions" src/routes/diagnosis.ts `（≥2 命中） |
| `resolvePointers` / `auditConclusionCoverage` / `buildReportPointer` / `parsePointers`（`src/agent/ ` 新纯模块） | ① `src/agent/report-assembler.ts `（渲染时构造指针 + 覆盖审计告警）；② `src/routes/diagnosis.ts `（响应后解析审计，JSON 分支附 `pointerAudit`） | `grep -rn "report-onepager-trace" src/agent/report-assembler.ts src/routes/diagnosis.ts `（双文件命中）+ `grep -rn "resolvePointers\|auditConclusionCoverage" src/ `（≥2 命中，非测试） |
| `getSentinelExpertReports`（既有 L2，本任务新增消费点） | `src/routes/diagnosis.ts `（报告 inputs 装配） | `grep -n "getSentinelExpertReports" src/routes/diagnosis.ts `（命中；既有消费点 `src/routes/sentinel.ts :84 ` 不动） |
| `ReportData.keyEvidence / cycleConclusions / actionItems`（`src/l3/report-templates.ts ` 新增可选字段） | `src/agent/report-assembler.ts ` 的 `toOnePagerData` 填充 → 模板 `EXECUTIVE_SUMMARY` 消费 | `grep -n "cycleConclusions\|keyEvidence\|actionItems" src/agent/report-assembler.ts src/l3/report-templates.ts `（双文件命中） |
| `req.app.locals.graphStore`（既有 L1 可触面，`src/server.ts :282 ` 注入） | `src/routes/diagnosis.ts ` 读 → 传 `buildCycleConclusions` | `grep -n "locals.graphStore" src/routes/diagnosis.ts `（命中） |
| 场景生产入口 | `scripts/golden-scenarios/GS-08-report-readable/run.sh` curl 报告端点 | `grep -n "api/diagnosis/consult" scripts/golden-scenarios/GS-08-report-readable/run.sh`（命中） |

**架构合规验证（必须零新增）**：`bash scripts/check-architecture.sh` → 全部通过（阈值：不得新增 L2→L4 / L1→L3/L4/L5 命中；新 L2 服务用 `type X = import('../l4/graph-bridge').GraphStore`（`src/agent/loop-handlers.ts :670 ` 先例），**禁用 `from '../l4/...'` 形态**）。

---

## 9. Architecture Layer

| 产出 | 层 | 理由 |
|---|---|---|
| `src/routes/diagnosis.ts `（改） | **L1 交互** | HTTP 报告读取端点（既有入口），只做装配与传递；不直触 L4/L5（store 经 `app.locals` 注入 + 类型位置 import 形态） |
| `src/agent/report-assembler.ts `（改）+ 两个新 `src/agent/ ` 文件 | **L2 编排** | 报告装配与派生是编排职责；依赖注入（store/findings 由 L1 传入）+ 纯函数便于单测；L2→L3（模板 registry）与 L2→cycles（先例 `src/agent/cycle-snapshot-service.ts :13 `）均合法 |
| `src/l3/report-templates.ts `（改） | **L3 洞察** | 模板/版式注册表（既有归属）；只描述槽位与裁剪，不取数据 |
| `scripts/golden-scenarios/**`（改/新建） | 验收基建（非产品层） | GSS 场景与断言；驱动脚本可直连真实类（`SqliteGraphStore` / `SessionStore`），不受五层约束（测试/脚本域） |

**不引入**：新 L3 provider（证据池接入留待支柱② 下一阶段）、新 L4/L5 直读、新跨层依赖。

---

## 10. Completion Standard（DS1–DS14，逐条可证伪；禁重编号 / 禁静默缺项，S-10）

| # | Done 标准 | verify 命令 / 证据 |
|---|---|---|
| DS1 | 一页纸四槽位齐备（生产 markdown 含 4 个固定标题） | `bash scripts/golden-scenarios/GS-08-report-readable/run.sh` → 断言 1 pass |
| DS2 | 篇幅/条数/单行三约束机器可判（1200 / 200 / 60 / 3 / 6） | 断言 2/3/4 pass（`onepager-meta.json`） |
| DS3 | 每条目带指针，覆盖审计 0 缺口 | 断言 6 pass（`"missingPointerLines":0`） |
| DS4 | 指针解析 0 unresolved / 0 unknown | 断言 7 pass |
| DS5 | **支柱②**：≥1 条指针解析到报告之外的物理记录（循环快照/finding） | 断言 8（负向 `notContains "\"externalResolvableCount\":0"`）pass |
| DS6 | S3 维度集合 = `cycleRegistry.list()` 全集（不缺/不多） | 断言 9/10 pass（`dimension-audit.json`） |
| DS7 | 无快照 → 槽位显式降级且不造趋势/不报平稳 | 断言 11/12/13 pass（负向 + `[degraded]`） |
| DS8 | **零新指标**：S3 内容只取既有 `DashboardRow` 字段 | `grep -n "generateOverflowDashboard" src/agent/ ` 命中且无新计算；`git diff` 不含 `src/cycles/ ` |
| DS9 | 确定性：同输入同输出（无渲染时刻） | 断言 5 pass（`"deterministic":true`）+ 单测用例 7 |
| DS10 | 生产接线：`renderOnePager` 的 3 处调用点全部注入 inputs（或显式降级） | `grep -rn "renderOnePager" src/routes/diagnosis.ts src/agent/report-assembler.ts ` + §8 表逐条 grep 命中 |
| DS11 | 零回归：D480 既有 5 用例 + 全量 vitest 通过 | `npx vitest run tests/agent/` 全绿；`npx vitest run` 无新增失败（与 main 基线对照并写明差值） |
| DS12 | 架构门禁零新增违规 + 类型安全 | `bash scripts/check-architecture.sh` 全部通过 ✅；`bash scripts/pre-commit-check.sh` 13 组过（禁 `--no-verify`） |
| DS13 | **点级证据入库**：`3-1` / `3-7` 由 `uncommitted` → `pending_k3` | `python3 scripts/product-lines/calc-progress.py` 后 `python3 -c "import json;d=json.load(open('docs/synova/product-lines/product-progress.json'));print([p['status'] for p in [l for l in d['lines'] if l['id']==3][0]['points'] if p['id'] in ('3-1','3-7')])"` → `['pending_k3','pending_k3']`（若因同日失效判 stale → 按 §5.5 顺序重跑，不得改口径） |
| DS14 | 写集一致 + 无绕过 + 推送落库 | `bash scripts/workflow/check-dev-doc-write-set.sh <spec>`（实现后漂移 0）；`grep -c no-verify .claude/bypass.log` 零新增；`git log origin/main..HEAD --oneline` 空（推送后） |

> 交付声明必须覆盖 DS1–DS14 全部并标注状态（✅/⏸/❌ + 理由）；**禁止重编号/跳号/静默缺项**。LLM 不可用时的诚实边界：场景**不跑**真实六阶段诊断（fixture 报告 + checkpoint 归档行 + 真实渲染路径），须在 `README.md` 与证据 `quote` 双处标注「契约级（生产渲染与读取路径真实、LLM 产物为 fixture）」，**禁止**声称全链路 LLM 诊断已验。

---

## 11. Auth Doc References

| # | 文件 | 引用点 |
|---|---|---|
| 1 | `docs/synova/coordination/派单-批六首批三卡-20260916.md` | §卡 2（任务定义、硬约束、验收） |
| 2 | `docs/synova/product-lines/product-lines.yaml` | 线 3 定义（L134-173：value / done_definition / modules / 3-1…3-8 / evidence 绑定） |
| 3 | `docs/synova/product-lines/product-progress.json` | 线 3 实测状态（8 点：7 uncommitted + 1 pending_k3，`verified: 0`） |
| 4 | `docs/synova/coordination/整体推进计划-主线-20260913.md` | §一 主线支柱②（报告可溯源）；§五 原则 8（声称必有物理证据） |
| 5 | `.claude/PRODUCT-BRIEF.md` | §一（不是 ChatBot）/ §二（GA 与最终受益者）/ §三（GA 按需诊断 → 报告） |
| 6 | `scripts/golden-scenarios/common/assert.ts` | 断言引擎契约（check 白名单 :38 / assertions ≥3 + purpose :73-79 / 三态 :236 / notContains :191） |
| 7 | `scripts/golden-scenarios/GS-08-report-readable/{run.sh,expect.json,README.md}` | 现状（缺陷 F：fixture-only + 死代码 :54） |
| 8 | `scripts/product-lines/calc-progress.py` | 证据扫描面（:83 / :375）+ 索引口径（:261-266）+ 六态（:167-241）+ 失效门（:118 / :132-162） |
| 9 | `scripts/product-lines/evidence-writer.py` | 入库契约（:75-86 record 形状，无 `at`） |
| 10 | `docs/synova/product-lines/evidence/d592-e2e-2-1.json` | 带 `at` 的证据记录先例（CT-62 同日失效规避形状） |
| 11 | `src/agent/report-assembler.ts ` | D480 `renderOnePager`（:253）+ 一页纸映射（:207-225） |
| 12 | `src/l3/report-templates.ts ` | `EXECUTIVE_SUMMARY`（:116-139）+ fail-open 头行（:121-123） |
| 13 | `src/cycles/overflow-dashboard.ts ` | `generateOverflowDashboard`（:95）+ `DashboardRow`（:25-36）+ 负溢出排序（:147-151） |
| 14 | `src/cycles/cycle-types.ts ` / `cycles/*.cycle.json` | 循环配置 + 既有映射字段（`edgeRefs` :28-29 / `mapping` :98-99）+ 6 个循环定义 |
| 15 | `src/agent/sentinel-service.ts ` | `getSentinelExpertReports`（:315，L2 只读面） |
| 16 | `src/routes/diagnosis.ts ` | 报告入口（SSE :552 / GET :783 / 冷读 :698-770）+ `evidenceCollector: null`（:358） |
| 17 | `src/store/session-store.ts ` | checkpoint 归档（DDL :266-271 / 写 :546 / 读 :562）+ 归档守卫（:84-98） |
| 18 | `scripts/check-architecture.sh` | L2→L4 门（:44-48）+ L1 类型位置豁免（:92-95） |
| 19 | `src/agent/loop-handlers.ts ` | 循环自加载先例（:621-626）+ GraphStore 类型位置 import 先例（:670） |
| 20 | `tests/agent/report-assembler.test.ts` | D480 5 用例（回归红线，:43-131） |
| 21 | DSH 基线实测（本机 `dependencies/dsh`，0.1.5-rc.2 / 241 包） | §1 权威⑥ 命令与结果（旧图纸 DSH 侧描述不引用） |

---

## 自检清单

- [x] 每个"X 存在/签名是 Y"的声称都在交付 worktree（`feat/d791-line3-report-spec` @ `origin/main 6a06e853`）内 grep/read 实测（§4 全部 file:line；§1 权威⑥ DSH 实测命令）
- [x] 写集表标题后紧跟表头（无空行）；§8 标题为 `Wiring Verification`；每条新 export 有生产调用点 + grep 指纹
- [x] DS1–DS14 与 §5/§7/§8 一一对应，无 phantom 声称（S-11）；负向断言 3 条（断言 8/10-11/12）
- [x] 决策参考已记录（§4.5，D1–D5 双参考系 + 收敛结论，S-12）
- [x] 不新造指标：S3 全部字段来自既有 `DashboardRow`；不引 deprecated `packages/sog-core `（D5）；不复述本体计数（D753 在飞）
- [x] 架构门禁预判：新 L2 服务用类型位置 import 形态，L1 用 `type X = import(...)`（§4 环境实测 + 先例）
- [x] 零 DSH 依赖（§1 权威⑥ 实测；不引 `@deepseek-ai`、不复制 DSH 代码）
- [x] 红线：不碰 scripts/audit/ 目录（K3 专属）；不改 src/ 下任何文件（本 spec 仅文档；实现写集已逐条声明）
- [x] 非凭记忆：所有行号均在 base commit `6a06e853` 校对
