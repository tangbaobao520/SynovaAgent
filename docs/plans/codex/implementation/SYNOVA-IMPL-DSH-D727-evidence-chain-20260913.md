---
north-star:
  服务用户: GA（直接用户）+ 企业主（最终受益者）——痛点是「报告凭什么这么说」：GA 把报告交给企业主时，每条结论必须能回到原始证据（访谈原话 / 上传文档），否则 GA 卖的是"我说的"，不是"数据说的"
  服务场景: GA 访谈企业主（八维框架）→ 系统把访谈原话落成证据行 → GA 发起诊断 → 引擎/专家读到这些证据 → 报告携带溯源引用 → 企业主追问"这个结论哪来的" → GA 用 reportId 一路查到原始证据行（可复现、可审计）
  模块终态: 证据层有唯一事实源（`evidence` 行 + 引用关系）+ 唯一写入闭环（GA 访谈触发）+ 报告携带 provenance（evidenceRefs + degraded）；第三方（K3/运维）可用 sqlite3 三段查询物理复现「报告 → 证据」；证据默认永久保留，只有「已被更高层引用过 + 双键显式开启」才可释放（与 D725 接口，本 spec 只管怎么来 / 怎么留痕）
  对齐北星: PRODUCT-BRIEF.md §一（7×24 驻扎、主动发现——"靠数据不靠感觉"的物理前提是可溯源）+ §二（直接用户=GA / 最终受益者=企业主）+ §三（GA 按需诊断：采访 → 上传 → 专家分析 → 报告）+ §六 P0（哨兵真实数据流 / 诊断报告质量验证——报告准不准的前提是证据链没断）
  完成标准: 入口 = `POST /api/conversations`（GA 访谈每轮）与 `POST /api/diagnosis/consult`（GA 发起诊断）；处理 = 装配注入 EvidenceCollector → Phase 0 采集落 `evidence` 表（expires_at 派生）→ 诊断读证据进输入 → 报告写 provenance + 引用关系；结果 = `GET /api/diagnosis/consult/:consultId/report` 返回**非空** `provenance.evidenceRefs`，且 sqlite3 三段查询逐条可解析。**可证伪点三条**：① 注入点回退 `null` → evidenceRefs 恒空（红）；② 悬空引用 → 溯源查询 exit≠0（红）；③ 证据内容未进入诊断输入 = 假溯源（红）
  当前进度: **P0 空洞**——`evidence` 表在生产库不存在（55 张表实测零命中）+ `new EvidenceStore` 生产零实例化（src/ 零命中）+ `expires_at` 全仓零写入方 + `DiagnosisReport` 零证据引用字段 → 「报告可溯源」目前无物可溯。本 spec 是证据层数据流的首次成文契约（采集落库 / 溯源引用 / 与 D725 边界 / 实施交接）
---

<!--
  SYNOVA-IMPL-DSH-D727: 证据层数据流 spec（采集→落库 / 溯源链 / expires_at 契约）
  状态: dev doc（spec） | 2026-09-13 | 优先级 P0 | 证明层级: L2 编排（采集触发）+ L3 洞察（消费/引用）+ L4 本体（EvidenceStore 数据面）+ L5 存储（SQLite 表）
  归属: 实施归 **Mac 线（D728）**——派单 §二 已定「D728｜🛠 Mac 编码：证据层接线实现（P0，依赖 D727）」
  基线声明: 本 spec 基线 = origin/main @cff43d6f（含 D725 spec 包 #535）。**D717 的保留模块 evidence-retention.ts 与 bootstrap 改动只在 #527 上，未合 main**——凡引用该文件处，行号以 #527 为准并在实施前重核（防 D524 M7 行号漂移）。
  取号说明: 本任务编号 D727 由 scripts/control-tower/alloc-task-id.sh 实分配（登记见 task-state/D727.json，D384 取号纪律）。
-->

# SYNOVA-IMPL-DSH-D727：证据层数据流（证据怎么来 / 怎么留痕 / 怎么溯源）

> 一句话问题：我们的产品卖点是「报告可溯源」（PRODUCT-BRIEF §一 "靠数据不靠感觉"），但**证据根本没落库**——`evidence` 表在生产库不存在、`new EvidenceStore` 在 src/ 零命中、`expires_at` 全仓零写入方、`DiagnosisReport` 连一个证据引用字段都没有。D-1 状态驱动通知模型（创始人亲裁）与 D725 的「被引用过才算蒸馏完成」都建立在**证据状态**之上 → 这不是配置问题，是产品级空洞。
>
> **必答四问索引**（派单 §一 强制）：① 表不存在的根因 → **§4.3**；② 证据写入最小闭环（谁触发）→ **§5.4**；③ `expires_at` 谁写 / 写失败怎么办 → **§5.5**；④ 怎么物理证明「一条报告能溯源到证据」→ **§5.6**。
>
> **本 spec 的两条硬边界**：不写实现（实现是 D728/Mac 的活）；不碰 scripts/audit/（K3 红线）。

---

## 1. Authority Doc Verification

### 权威 ① — 派单（本任务的直接来源，逐字摘录）

`docs/synova/coordination/派单-第三批-D727-D731-20260913.md` §一（D732 派发，2026-09-13）：

> **交付**：1. 采集→落库契约：谁写 `evidence`、写什么字段、`expires_at` 由谁负责、缺失时降级语义；2. 溯源链：一条诊断结论如何回溯到原始证据（`provenance` 语义，与 D725 五层阶梯的「被引用过才算完成」对齐）；3. 与 D725 的边界：D725 管「能不能删」，本 spec 管「怎么来/怎么留痕」；两者接口点写清；4. 既有消费方盘点：`EvidenceStore`、`evidence-writer.py`、product-lines 状态机各读什么。
> **必答**：① 生产库表不存在的根因是「没人建表」还是「建了没调用」？② 证据写入的最小闭环是什么（谁触发）？③ `expires_at` 该由谁写、写失败怎么办（fail-closed 还是 fail-safe）？④ 验收怎么物理证明「一条报告能溯源到证据」？
> **写集**：`docs/plans/codex/implementation/`、`docs/synova/coordination/`、`task-state/D727.json`。**红线**：不写实现；不改 `scripts/audit/`；不改 `.github/CODEOWNERS`

### 权威 ② — CTO 派单前复核（"两处错误"一节，逐字）

同文件 §八补（CTO 亲自复现）：

> | `evidence` 表在生产库不存在 | `sqlite3 data/synova.db ".tables" | grep -ci evidence` → **0** | ✅ 属实 |
> | `EvidenceStore` 零生产实例化 | `grep -rn "new EvidenceStore" src/ --include=*.ts | grep -v test` → 空 | ✅ 属实 |
> | **D728 写集 src/evidence/** | `ls -d src/evidence ` → 不存在；实际代码在 src/evidence/ （`evidence-store.ts`） | ❌ **CTO 写错 → 已在本派单全文修正**（§十 v1→v2：错路径写成 l4 目录下的 evidence，v2 全文修正为 src/evidence/ 。**本 spec 复现：该目录存在、3 文件**；派单该行的命令文本与它的结论自相矛盾，本 spec 按 §十 为准记录） |

> **本 spec 的立场**：权威②的两条"属实"已由我在**基线 cff43d6f** 上独立复现（§4.1 给原始输出）；派单对 D728 写集的路径修正**仍不完整**——§5.3 给出实测缺口（6 个文件不在 D728 声明的写集内，但不改就无法达成派单自己的验收 ②）。这是本 spec 向 CTO 提出的唯一扩写集请求。

### 权威 ③ — 本 spec 基线实测（全部结论的来源，逐条可复现）

> 复现环境：`.synova-wt-d727-devdoc`（base = origin/main @cff43d6f），2026-09-13。生产库 = `data/synova.db`（2.34 MB）。原始输出见 §4。

| # | 声称 | 命令 | 输出 |
|---|------|------|------|
| E1 | 生产库无 evidence 表 | `sqlite3 .tables \| grep -ci evidence` | **0**（共 55 张表） |
| E2 | EvidenceStore 生产零实例化 | `grep -rn "new EvidenceStore" src/ --include=*.ts \| wc -l` | **0**（tests/ 8 处） |
| E3 | 注入点硬编码 null | `grep -rn "evidenceCollector: null" src/routes/ ` | **2**（diagnosis.ts:358 / conversations.ts:283） |
| E4 | expires_at 零写入方 | `grep -rn "expiresAt" src/ --include=*.ts` | 仅 evidence 模块内 DDL/SELECT/透传，**无赋值**（§4.4-A） |
| E5 | 报告零证据字段 | `grep -n "evidence" src/l3/synova-diagnosis-engine.ts ` | **零命中** |
| E6 | 本体 Evidence 节点 0 行 | `sqlite3 "SELECT count(*) FROM graph_nodes WHERE type='Evidence'"` | **0** |

### 权威 ④ — D725 spec（边界权威：谁管「能不能删」）

`docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D725-d660-data-lifecycle-20260913.md`（已在 main）：

- **创始人裁定①（D725 §1 权威①，逐字）**：「**A) 证据已被更高层引用过（溯源链建立）才算完成**」→ 「蒸馏完成」= 该条证据**已被更高层引用过**。D725 据此定义 L2 证据层的释放门：`queryDistillationRefs(evidenceId).length ≥ 1` 才允许删；无引用 = 未蒸馏 = **永不删**。
- D725 §5.1 写集**已认领** src/evidence/evidence-store.ts 的引用表：`evidence_refs(id, evidence_id, ref_layer, ref_id, created_at)` + `recordDistillationRef()` / `queryDistillationRefs()` / `purgeDistilled()`。
- **本 spec 不重复建表、不改删判据**——只定义：谁**写**引用、ref 的完整性与降级、以及溯源查询口径（§5.7 接口点表）。

### 权威 ⑤ — 既有回填/接线的三次历史先例（本次不是第一次尝试）

| 先例 | 位置 | 事实 | 教训 |
|---|---|---|---|
| D430 A2 机器验证入库 | `.claude/task-briefs/2026-08-18-D430-a2-evidence-wiring.md` | 「证据」在这套仓里有**第二个含义**：产品线验收证据（JSON 文件） | 同名异物必须显式区分（§4.2 第 5 路） |
| EvidenceCollector 声称接线 | commit `d6390bd1`（2026-06-03）标题「EvidenceCollector 接入 Phase 0」，正文写 `Wire Check: ✅ EvidenceCollector=5处引用 (line 22/71/72/125/287)` | 引用数 ≠ 生产装配；两处装配点后来**硬编码 null** | 这是铁律 0-2/4/5 记载的第 5 次接线失败（前 4 次见 AGENTS.md），且是唯一一次打穿产品卖点的 |
| D717 保留分级 | evidence-retention.ts （l3 目录，#527 引入，245 行） | 默认 `permanent` 时在构造函数**之前** return（行 174-180），`new EvidenceStore(db)` 在行 183 | 连"副作用建表"都是条件性的 → 表存在与否取决于保留策略（§4.3） |

### 权威 ⑥ — 产品北星与铁律

`.claude/PRODUCT-BRIEF.md` §一 / §二 / §三 / §六 P0；AGENTS.md / CLAUDE.md 铁律：0-2（spec→test→impl→wire）、0-3（禁 git stash，隔离用 worktree）、1/4/5/7（垂直切片 + 入口→交互→结果）、11/24/31/32（降级显式 + 分类错误）、37（dead code 入仓库即违规）、38（`as any`/`as never`/`as unknown as` 零容忍）、39（五层边界）、47/48（契约优先 + 测试非空壳）、49（决策沉淀）。

### 权威 ⑦ — 决策框架

`docs/synova/coordination/DECISION-REFERENCE.md`（D333 四步：第一性原理 → Anthropic 工程基线 → 开源实证 → 收敛检查）；参考范例（D381 写前必读）：`docs/plans/codex/implementation/SYNOVA-IMPL-D352-resolver硬化-20260813.md`。

---

## 2. Problem Statement

### 2.1 症状：同一套仓里有**五个**东西叫「证据」，其中四个是死的

诊断证据（第 1-4 路）没有任何一路在生产里活着；唯一活着的是**同名异物**（第 5 路，工程验收证据）：

| # | 概念 | 载体 / 定义位置 | 生产者 | 消费者 | 生产实况 |
|---|------|----------------|--------|--------|---------|
| 1 | **诊断证据池**（设计上的真相源） | `evidence` 表（src/evidence/evidence-store.ts 行 22 DDL） | `EvidenceCollector.collectFromInterview`（src/evidence/index.ts 行 32） | `EvidenceStore.query/search/countByType`；`diagnosis-launcher.ts:130` | ❌ **表不存在 + 零生产实例化 + 零行** |
| 2 | **专家输出证据引用** | LLM 输出的 `findings[].evidenceRefs: string[]`（src/l3/expert-output-schema.ts 行 18） | LLM（src/l3/expert-dispatcher.ts 行 394 透传） | `QualityFirewall`（src/l3/quality-firewall.ts 行 22） | ❌ 生产 firewall 未接线（`graphStoreForFirewall` 恒 null，`expert-dispatcher.ts:142/162`）→ **零校验、零解析** |
| 3 | **哨兵合成证据** | 内存对象 `sentinel-<signalId>-<i>`（src/sentinel/runner.ts 行 685-695） | sentinel runner | `ExpertDispatcher.runExpert`（`:725`，`as unknown as Evidence[]`） | ❌ **从不落库**；合成 id 在任何存储里都不存在 |
| 4 | **本体证据节点** | GraphStore `type='Evidence'` 节点 | 无人 | `QualityFirewall` check 1（`quality-firewall.ts:54` `queryNodes('Evidence', {id})`） | ❌ **0 行**（E6） |
| 5 | **产品线验收证据**（同名异物） | `docs/synova/product-lines/evidence/*.json` | `scripts/product-lines/evidence-writer.py`（`VALID_TYPES` 行 38） | `scripts/product-lines/calc-progress.py:77-83` | ✅ 活着且自洽——但**与诊断证据无任何关系**（工程验收证据 ≠ 客户数据证据） |

**后果**：GA 拿到的诊断报告，其结论与客户原始输入的连接**只存在于 LLM 的上下文里**，未落库、无引用、不可复核。企业主问"这个结论哪来的"，系统能给的只有 LLM 复述。

### 2.2 「报告可溯源」当前无物可溯

`DiagnosisReport`（src/l3/synova-diagnosis-engine.ts 行 277-306）的字段是 `expertReports[].findings: string[]` / `rootCauses[].description` / `recommendations[].action`——**全部是自由文本，零 evidence 引用字段**（E5）。报告落库走 `diagnosis_checkpoints`（phase=5 行，src/routes/diagnosis.ts 行 596-608 → src/store/session-store.ts 行 546-559），因此报告 JSON 里有什么，溯源就只能查什么。

即使证据池被填满，链路仍断在两处（§4.4-B/C）：
- 报告**不认识**证据（无字段、无装配）；
- 唯一读取证据的地方（`diagnosis-launcher.ts` 行 129/134）把结果存进 `evidenceSummary` 后**从不使用**——死变量（全仓 4 处命中，本处只写不读，见 §4.4-C）。

### 2.3 为什么现在做

1. **表零行 = 定义 schema 的唯一免费时刻**。`expires_at` 语义、引用表完整性规则、谓词口径，现在改是零迁移成本；一旦上线有数据，每个改动都要迁移 + 回填。
2. **D725 的实施在等这个判据**。D725 的「已蒸馏」门需要「证据被引用过」这一事实的**来源**——引用关系由谁在什么时机写，正是本 spec 的对象（§5.7）。
3. **派单的排序原则**（§〇）把证据链列为当前最高优先级实现项：D-1 状态驱动通知模型建立在证据状态之上。
4. **串行窗口已开**：D728 与 D725 实施共享 `bootstrap.ts` 装配点，CTO 已定串行 → 两个 spec 的接口正好在同一批次收敛（§5.7）。

---

## 3. Q0-Q4

### Q0: 定位 — 项目拼图 + 文件审计

**a) 项目拼图**

这不是"某一层的功能"，而是**横切 L2→L3→L4→L5 的一条数据链规格**：定义证据从哪来（采集触发）、落到哪（表/字段/保留策略快照）、被谁引用（溯源关系）、怎么被查（查询口径）、失败了怎么诚实降级。

- **新增 / 替换 / 扩展**：**扩展 + 少量新建**。复用既有的 src/evidence/ （EvidenceStore / EvidenceCollector / CorroborationEngine）、既有的报告落库通道（`diagnosis_checkpoints`）、既有的装配范式（bootstrap → `app.locals` → 路由）；新建仅限"引用关系的写入/查询契约"与"溯源验证口径"。
- **零新建架构**：不新增层、不新增数据库、不新增服务进程。

**b) 文件审计**（基线 cff43d6f 实测，行号已核）

| 对象 | 现状（实测） | 结论 |
|---|---|---|
| src/evidence/evidence-store.ts （128 行） | `initSchema` 行 20-63（构造函数内建表）；`add` 行 66-80；`expireOld` 行 121-127（按 `collected_at` 删，**main 上零调用方**） | **扩展**（表存在性解耦 + expires_at 语义 + 引用查询） |
| src/evidence/index.ts （186 行） | `EvidenceCollector` 行 18-49（`collectFromInterview` 行 32-48）；`CorroborationEngine` 行 53-160；`ConfidenceScorer` 行 164-186 | **扩展**（降级契约 + 保留策略注入） |
| src/evidence/types.ts （65 行） | `Evidence` 行 8-35（`expiresAt?` 行 23）；`EvidenceFilter` 行 37-44 | **扩展**（引用类型 + 注入类型） |
| src/deploy/bootstrap.ts （1296 行） | Phase 1 存储层行 714+（1c 构造 `SqliteGraphStore` → 其构造函数调 `reconcileSchema`）；`BootstrapServices` 行 89+；服务装配行 637 | **扩展**（装配点，唯一） |
| src/server.ts | 行 106 `new Bootstrap()`；行 264-265 `app.locals.sessionStore` / `app.locals.orchestration` | **扩展**（注入点，1 行） |
| src/routes/diagnosis.ts | 行 358 `evidenceCollector: null`（D489 起）；行 783 GET report | **扩展**（接线，替换 null） |
| src/routes/conversations.ts | 行 283 `evidenceCollector: null`（D590 起）；行 234 构造 ConversationEngine | **扩展**（接线，替换 null） |
| src/agent/conversation-engine.ts | 行 625-629 Phase 0 采集调用点**已存在**（d6390bd1）；行 424 `config.evidenceCollector \|\| null` | **扩展**（消费降级结果） |
| src/agent/diagnosis-launcher.ts | 行 129/134 读证据 → `evidenceSummary`（**死变量**）；行 175 `runConsultation`；行 84/164 检查点落库 | **扩展**（注入输入 + 挂 provenance） |
| src/agent/engine-context.ts | 行 33/35 `evidenceCollector: EvidenceCollector \| null`（type-only L4 引用，L2↔L4 设计桥接） | **扩展**（注入结构类型） |
| src/l3/synova-diagnosis-engine.ts | `DiagnosisReport` 行 277-306（无 evidence 字段） | 只读（provenance 由 L2 装配，见 §5.6） |
| src/l3/expert-dispatcher.ts / `quality-firewall.ts` / `expert-output-schema.ts` | 专家 `evidenceRefs` 链路完整但校验未接线（`graphStoreForFirewall` 恒 null） | **只读**（跨线边界，§6） |
| src/sentinel/runner.ts | 行 685-695 合成内存证据；行 725 `as unknown as Evidence[]` | **只读**（跨线边界，§6） |
| `evidence-retention.ts`（#527，未合 main） | 行 174-180 permanent 短路 → 行 183 `new EvidenceStore(db)` | **扩展**（谓词收敛，已在 D728 写集内） |
| `scripts/product-lines/evidence-writer.py` + `calc-progress.py` | 第 5 路同名异物（工程验收证据） | **只读**（不在本链路上，§4.2） |

**c) 决策**

| 情形 | 判定 |
|---|---|
| 已有覆盖？ | 复用：src/evidence/ （对象层）、`diagnosis_checkpoints`（报告落库）、bootstrap→app.locals→路由（装配范式）、D725 引用表（`evidence_refs`，不重复建） |
| 无覆盖？ | 新建最小件：① 采集侧降级契约（`collectFromInterview` 返回结果对象）；② 报告 provenance 装配（L2）；③ 引用写入契约（ref_type/ref_id 值域 + 完整性）；④ 溯源验证命令（运维/K3 可复现，不需要新脚本） |
| 冲突？ | 一处：`expireOld` 时间谓词（`collected_at` vs `expires_at`）——本 spec 裁决为**单口径 `expires_at`**，理由与协调要求见 §5.5 / §5.7 |

### Q1: 调研 — 业界最佳实践 / 顶级团队怎么做 / memory 历史教训

**a) 业界最佳实践（数据血缘 provenance）**

| 实践 | 来源 | 本 spec 采用的部分 |
|---|---|---|
| **W3C PROV 三元组**（Entity / Activity / Agent；wasGeneratedBy / wasDerivedFrom / wasAttributedTo） | W3C PROV-O 推荐标准 | 报告→证据用「派生关系」建模：`evidence_ref(ref_type='report', ref_id=reportId, evidence_id)` = **wasDerivedFrom 的最小可用形态**；不引入完整 PROV 词汇表（最少机制） |
| **OpenLineage / Marquez**（job/run/dataset 三元 + 命名空间） | 数据平台血缘事实标准 | 「引用必须在被引用对象存在时写入」= **血缘完整性先于血缘丰富度**；本 spec 只要求"引用可解析"，不要求"因果强度" |
| **S3/GCS 生命周期规则**（policy 在对象创建时打标，后续策略变更不追溯） | AWS/GCP 文档 | `expires_at` = **写入时刻的策略快照**，而非清理时刻的滚动计算（§5.5） |
| **事件溯源 append-only**（引用关系只增不删） | 通用模式 | 引用行不随证据删除而级联删——否则「被引用过」这一历史事实自我湮灭（§5.6 规则 4） |

**b) 顶级团队怎么做（Anthropic / DeepSeek 工程基线）**

- **fail-closed 不可判定即拒绝**：溯源查询遇到悬空引用必须**报错**，不能静默跳过（否则"可溯源"退化成"看起来可溯源"）。
- **机器可验契约**：契约写成可 grep、可 sqlite3、可 exit code 判定的形态（`QUALITY.md`：可测量的完成标准）。
- **降级必须显式且可传播**（本仓铁律 11/24/31）：证据层不可用时，报告要标记 `provenance.degraded=true`，**而不是**输出空引用冒充"无需证据"。
- **单点写入**：一个概念只有一个写入方（DeepSeek 侧"最少机制"原则）——证据写入 = 采集路径；引用写入 = 消费路径；两者不交叉。

**c) memory/ 历史教训（我们犯过的错）**

| 教训 | 出处 | 对本次的约束 |
|---|---|---|
| **双数据源欺诈** — 新建模块前必须确认旧系统是否仍活跃 | `memory/notes/archived/dual-source-fraud.md`（约束：旧 enum/union/array 在 src/ 直接引用数 = 0） | 证据有 **5 路**概念 → 本 spec 必须先立"唯一事实源"再谈接线（§4.2/§5.4） |
| **假接线** — grep 引用数 ≠ 生产装配 | commit `d6390bd1` 正文的 `Wire Check: ✅ ...=5处引用` | 本 spec 的接线验收只认 **生产调用点**（S-3：测试调用不计），且必须贴 sqlite3 行证据 |
| **M3 机制建成未接线** | D725 spec §Q1；`expireOld`/`purgeExpired` 家族 | 本 spec 的每条交付必须回答"谁在启动路径上无条件执行它" |
| **M2 声称≠事实** | D725 §1 对 D717 表述的更正 | 本 spec 每条结论附命令+原始输出（§4.1） |

> **参考：Anthropic 工程基线（fail-closed / 机器可验）+ 第一性原理（溯源的本质 = 一条可被第三方重放的引用路径）+ 业界实证（W3C PROV / OpenLineage / S3 生命周期）+ 结论：唯一写入闭环 + 引用关系表 + 策略快照 expires_at + 三段可复现查询。**

### Q2: 范围 — 正确的最简方案

**做什么**（契约层面，实现归 D728）：
1. **表存在性解耦**：`evidence` 表由启动路径**无条件**建立（bootstrap 装配点构造 EvidenceStore），不再寄生于"某处是否会 new 一个对象"。
2. **采集→落库契约**：唯一写入口 `EvidenceCollector`；写入时机 = GA 访谈 Phase 0（调用点已存在）；返回结果对象（`{written, skipped, degraded, errorCode}`）替代 `void`。
3. **`expires_at` 契约**：写入时刻的策略快照；默认 `NULL`（永久）；策略不可判定 → `NULL` + degraded（fail-closed 向"不删"）。
4. **报告 provenance 契约**：`report.provenance = { evidenceRefs: string[], degraded: boolean, reason?: string }`；证据**必须真实进入诊断输入**（修死变量）才允许挂 refs。
5. **引用关系写入契约**：复用 D725 的 `evidence_refs`；值域、完整性（悬空即拒绝）、不级联删。
6. **溯源验证口径**：三段 sqlite3 查询 + 两条反向验证（必红），K3/运维可原样重放。
7. **既有消费方盘点**（派单要求 ④）：§4.2 + §4.5。

**不做什么**（含文件路径）：
- 不改 `scripts/audit/`（K3 红线）；不改 `.github/CODEOWNERS`。
- 不写实现代码（本 spec 只出契约；实现 = D728/Mac）。
- 不改 src/sentinel/runner.ts （哨兵合成证据 → 落库是**跨线**改造，需另立任务；本批只登记为第 3 路分裂，见 §6）。
- 不改 src/l3/expert-dispatcher.ts / src/l3/quality-firewall.ts / src/l3/expert-output-schema.ts （专家 `evidenceRefs` 校验接线属 L3 洞察线，另立任务）。
- 不改 `scripts/product-lines/**`（第 5 路同名异物是**另一个域**的活系统，改它零收益）。
- 不做 src/store/schema-migration.ts 的迁移注册（P1 待办，理由见 §5.8 决策 2）。
- 不做 per-conclusion 逐条引用（需 LLM 逐条引用能力，属下一阶段；本批只做报告级 + 可解析）。
- 不改 src/l4/agent-memory-store.ts / src/l3/pkb-lifecycle.ts （D725/他人域，本 spec 只读引用语义）。

### Q3: 验收 — 入口 → 交互 → 结果

| 环节 | 内容 |
|---|---|
| **入口** | ① `POST /api/conversations`（GA 访谈每轮，Phase 0 采集）；② `POST /api/diagnosis/consult`（GA 发起诊断，读证据 + 挂 provenance） |
| **处理** | bootstrap Phase 1 构造并注册 evidence 三件套 → `app.locals` → 路由注入 EngineContext（替换 `null`）→ Phase 0 `collectFromInterview` 落 `evidence` → 诊断读证据进输入（修死变量）→ 报告挂 provenance + 写 `evidence_refs` → 报告落 `diagnosis_checkpoints` |
| **结果** | `GET /api/diagnosis/consult/:consultId/report` 返回 `report.provenance.evidenceRefs` **非空**；sqlite3 三段查询逐条解析成功；注入点回退 → 必红 |

### Q4: 契约与测试

- 输入/输出/降级三段契约写在 §5.4-§5.6（铁律 47 契约头形态）。
- 测试要求见 §7：L1 单元（正常/降级/边界，铁律 48）+ L2a 接线（生产调用点 + 端到端集成）+ L2b 降级（4 条必红）+ L2c 边界（5 条）。
- 实现期同 commit 回填最终实现（S-6）。

---

## 4. Current State（基线 = origin/main @cff43d6f，2026-09-13 实测）

### 4.1 基线声明与复现命令（**编码前必须重核**）

```bash
# 基线
git log --oneline -1 origin/main            # cff43d6f docs(d725): D725 spec 包落 main（自 #527 拆出） (#535)
# E1 生产库表
sqlite3 data/synova.db ".tables" | tr -s ' ' '\n' | grep -ci evidence          # → 0
sqlite3 data/synova.db "SELECT count(*) FROM sqlite_master WHERE type='table';" # → 55
# E2 生产实例化
grep -rn "new EvidenceStore" src/ --include=*.ts | wc -l                       # → 0
grep -rn "new EvidenceCollector" src/ --include=*.ts | wc -l                   # → 0
grep -rn "new CorroborationEngine" src/ --include=*.ts | wc -l                 # → 0
# E3 注入点
grep -rn "evidenceCollector: null" src/routes/                                 # → diagnosis.ts:358 / conversations.ts:283
# E4 expires_at 写入方
grep -rn "expiresAt\s*=" src/ --include=*.ts | grep -v "\.test\."              # → 0（仅 evidence-store.ts:74 读透传）
# E6 本体证据节点
sqlite3 data/synova.db "SELECT count(*) FROM graph_nodes WHERE type='Evidence';" # → 0
# 生产库空表佐证
sqlite3 data/synova.db "SELECT count(*) FROM agent_memory;"                     # → 0
```

> ⚠️ **漂移风险**：`evidence-retention.ts`（#527）与 src/deploy/bootstrap.ts 的 D717 改动**未合 main**。#527 合并后 bootstrap 行号必漂移 → 实施前 `git fetch --all && git pull --ff-only` 后**重新核验行号**（D524 M7 教训）。

### 4.2 五路证据概念台账（本 spec 的核心诊断）

见 §2.1 表（E1-E6 为其实测依据）。**读法**：第 1 路是设计上的唯一事实源；第 2-4 路是各自为政的"伪证据"；第 5 路是同名异物。本 spec 只把**第 1 路做活**，并把第 2-4 路的处置登记为后续任务（§6）。

### 4.3 必答① — 生产库 `evidence` 表不存在的根因

**结论：既不是单纯的「没人建表」，也不是单纯的「建了没调用」——是三层叠加。**

| 层 | 根因 | 物理证据 |
|---|---|---|
| **L-a 建表动作寄生于对象生命周期** | `CREATE TABLE IF NOT EXISTS evidence` **只存在于** `EvidenceStore.initSchema()`（src/evidence/evidence-store.ts 行 20-63），只由构造函数（行 17）调用。全仓**没有**独立的 schema 注册/迁移入口包含 evidence DDL：`grep -rn "CREATE TABLE.*evidence" src/ scripts/` → 仅 `evidence-store.ts:22` 一处（另 `:39` 是 FTS 虚表） | `grep -c` = 1 |
| **L-b 生产构造点为零（且唯一候选点是条件性的）** | `new EvidenceStore` 在 `src/ ` **零命中**（E2，8 处全在 tests/）。唯一在生产可达的构造点来自 #527 的保留作业：`new EvidenceStore(db)` 在**行 183**，但 `runEvidenceRetention` 在 `policy.windowMs === null` 时**行 174-180 提前 return**（默认 `permanent` 正是此分支）→ 即使 #527 合入，默认配置下**仍不构造、仍不建表** | `grep` 0（src/ ）；#527 行 174-180 早退 |
| **L-c 写入侧全线 null 注入** | 两处生产装配点把 `evidenceCollector` 与 `corroborationEngine` 硬编码 `null`：src/routes/diagnosis.ts 行 358（D489，2026-08-29 引入）、src/routes/conversations.ts 行 283（D590，2026-09-08 引入）。唯一已编码的采集调用点 src/agent/conversation-engine.ts 行 625-629 因此**永不执行** | E3 `grep` = 2 |

**一句话根因**：**DDL 的可达性 = 对象构造的可达性 = 路由注入的可达性**——三层都是"条件性"的，而三层条件在生产**同时不成立**。这是 M3（机制建成未接线）的一个更隐蔽变体：**连建表都不在启动不变量的位置上**。

> **对派单二选一的正面回答**：「没人建表」与「建了没调用」都对一半——**DDL 写了但没人执行**（L-a/L-b）+ **调用链写了但注入为 null**（L-c）。因此修复必须**同时**解掉三层：表 → 启动路径无条件建；构造 → 装配点唯一；调用 → 注入真实对象。**只解任一层都会留下空心**（例如只解 L-b：表存在但零写入 → 仍是"无物可溯"）。

### 4.4 缺陷分节（代码审计，行号基线 cff43d6f）

#### A. `expires_at` 是死列——零写入方，且与删除谓词口径冲突（P0）

- `Evidence.expiresAt?: string`（src/evidence/types.ts 行 23）声明存在；`add()` 读它（`evidence-store.ts:74`：`evidence.expiresAt || null`）。
- **全仓零赋值**（E4）：没有任何代码路径构造过 `expiresAt` → 恒 `NULL`。
- **更严重的是口径冲突**：唯一的时间判据 `expireOld(maxAgeMs)`（`evidence-store.ts:121-127`）用的是
  `DELETE FROM evidence WHERE collected_at < ?`——**根本不读 `expires_at`**。于是"过期"有两个互相独立的候选定义（滚动窗口 vs 策略快照），而**两个都没在生产生效**（前者零调用方，后者零写入方）。
- 佐证：D725 spec §4.2 已独立记录同一事实（"含 `expires_at` 列，但**无任何写入方设过它**"）。

#### B. 报告与证据之间零字段、零装配（P0）

- `DiagnosisReport`（src/l3/synova-diagnosis-engine.ts 行 277-306）无 evidence 字段（E5：该文件 grep `evidence` 零命中）。
- 报告落库走 `diagnosis_checkpoints(phase=5)`：src/routes/diagnosis.ts 行 596-608 → `SessionStore.saveDiagnosisCheckpoint`（src/store/session-store.ts 行 546-559）；DDL 在 `session-store.ts:266`。读回走 `GET /api/diagnosis/consult/:consultId/report`（`diagnosis.ts:783`）。
- **结论**：报告"可溯源"目前**没有承载字段**——不是查不到，是**从未写入**。

#### C. 死变量 `evidenceSummary`——即使证据存在也进不了诊断（P0，假接线的典型形态）

src/agent/diagnosis-launcher.ts 行 129-148（声明 + 赋值，全仓零读取；`if` 块 130-148）：

```ts
let evidenceSummary = '';                                   // 行 129
if (this.ctx.evidenceCollector && this.ctx.corroborationEngine) {
  const allEvidence = this.ctx.evidenceCollector.query({ orgId: teamId, limit: 50 });
  if (allEvidence.length > 0) {
    evidenceSummary = allEvidence.map(e => `[${e.type}|conf:${e.confidence}] ...`).join('\n'); // 行 134
    // 矛盾检测…
  }
}
// 本块结束（行 148）之后：evidenceSummary 再无任何引用 → 死变量
```

全仓 grep `evidenceSummary` = **4 处**：`expert-dispatcher.ts:328/333`（另一条链路的同名局部变量）与 `diagnosis-launcher.ts:129/134`（**只写不读**）。→ 修好注入后若不同时修这里，仍会得到"证据进了内存、没进诊断"的假绿。

#### D. 专家层 `evidenceRefs` 校验生产未接线（P1，登记为跨线）

- 产出：LLM 输出 schema 要求 `evidenceRefs`（`expert-output-schema.ts:18`），`expert-dispatcher.ts:394` 透传。
- 校验：`QualityFirewall` check 1（`quality-firewall.ts:52-58`）用 `queryNodes('Evidence', { id: ref })` 查**本体图**——而本体图 `Evidence` 节点 **0 行**（E6）。
- 接线实况：`graphStoreForFirewall` 只在 `enableAutonomyWithGraph()`（`expert-dispatcher.ts:162`）被赋值，其唯一调用方是 `SubAgentCoordinator.enableExpertAutonomy`（src/orchestrator/subagent-coordinator.ts 行 73-76）——而该类**生产零实例化**（`grep -rn "new SubAgentCoordinator" src/ ` → 0）。→ 生产 firewall 恒 null，**证据引用零校验**。
- 附带：`subagent-coordinator.ts:85-86` `dispatch()` 在 `evidence.length === 0` 时直接 `return []`（**静默返回空**，无降级标记）。

#### E. 哨兵路径合成证据从不落库 + 类型作弊（P1，登记为跨线）

src/sentinel/runner.ts 行 685-695 从 `signal.sources` 合成内存 Evidence（id = `sentinel-<signalId>-<i>`），`:725` 以 `evidenceItems as unknown as Evidence[]` 传入 `runExpert`。

- 合成 id 在任何存储中都不存在 → 即使 firewall 接线了也会全部判 `evidence_not_found`。
- `as unknown as` 属铁律 38 / CT-46 零容忍形态（V5.2.7 扩展）。
- **本批不动**（跨线，§6），但**必须登记**——否则"证据已接线"的错觉会继续存在。

#### F. 次要：`add()` 注释与实现不符（P2）

`evidence-store.ts:65` 注释写 "(deduplicate by source+type+content hash)"，实现是 `INSERT OR REPLACE`（主键 `id`），无内容哈希、无去重（id 由 `ev_<base36时间>_<随机4位>` 生成，`index.ts:35`）。→ 同内容重复采集会产生多行。**建议**：注释与行为对齐（要么实现去重、要么改注释）；本批只需在引用侧容忍重复（引用按 `evidence_id` 幂等）。

### 4.5 既有消费方盘点（派单要求 ④）

| 消费方 | 读什么 | 现状 |
|---|---|---|
| `EvidenceStore`（src/evidence/evidence-store.ts ） | 被 `query/search/countByType/expireOld` 读自己写的 `evidence` 表 | 表不存在；`expireOld` main 零调用方（#527 上是唯一调用方） |
| `EvidenceCollector`（src/evidence/index.ts 行 18-49） | 无（它是写方） | 生产零实例化 |
| `CorroborationEngine`（src/evidence/index.ts 行 53-160） | `store.query()` | 生产零实例化（`detectContradictions` 仅测试触达） |
| `diagnosis-launcher.ts:130-141` | `collector.query({orgId, limit:50})` | 被 `null` 短路；读到后进死变量 |
| `conversation-engine.ts:625-629` | 无（写方调用点） | 被 `null` 短路 |
| `ExposeReport`/`GET report`（`diagnosis.ts:783`） | `diagnosis_checkpoints.partial_report` | 报告里无证据字段 |
| **`scripts/product-lines/evidence-writer.py`** | **不读任何诊断证据**；写 `docs/synova/product-lines/evidence/*.json`（`--out-dir` 默认值在行 104） | 活系统；**同名异物**（工程验收证据 schema=1） |
| **product-lines 状态机**（`scripts/product-lines/calc-progress.py:77-83`） | 读上述 JSON 目录（`glob("*.json")`）→ 计算验收点状态 | 与诊断证据零交集；**本 spec 不动它**，仅在文档层消歧（§6） |

---

## 5. What We Build

### 5.1 写集 (0 修改 + 4 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D727-evidence-chain-20260913.md | 新建 | 本文件（spec 本体） |
| docs/synova/coordination/编码指令-D728-证据链接线-Mac-20260913.md | 新建 | D728 编码 session 启动指令（dev-doc-delivery 规范；实施归 Mac 线，见 §5.9） |
| task-state/D727.json | 新建 | spec 段回填 + status=spec_done（D382 状态机；注：D732 派单分支已建同路径登记壳，合并时按并集解决） |
| .claude/task-briefs/2026-09-13-D727-证据层数据流-spec.md | 新建 | 本任务 brief（Gate 0） |

> **写集口径（诚实声明，防 overclaim）**：本表是**本 spec 自身的交付面**（全部在写集核验的 SKIP 前缀内：`docs/` 、`task-state/` 、`.claude/`），**不含任何实现文件**——实现写集见 §5.2（D728 承接）。spec 期跑 `check-dev-doc-write-set.sh` 时 4 个"新建"文件在交付瞬间均存在，无预期内漂移。

### 5.2 D728 实施写集（交接口径，不属本任务写集）

| 文件 | 操作 | 用途 |
|---|---|---|
| src/evidence/ | 修改 | DDL 单一事实源导出；`expires_at` 派生；`collectFromInterview` 结果对象；引用写入/查询 API |
| src/deploy/bootstrap.ts | 修改（装配点） | Phase 1 无条件构造 evidence 三件套 + `BootstrapServices` 暴露 + 降级标记 |
| `evidence-retention.ts`（l3 目录，#527 引入） | 修改 | 时间谓词收敛到 `expires_at`（§5.5 决策 1） |
| `tests/evidence/` | 新建 | L1 契约测试 + L2a 端到端链路测试 + L2b/L2c |

> ⚠️ 上表**只是派单原文的写集**，它**不足以完成派单自己的验收 ②**——实测缺口见 §5.3。

### 5.3 实施缺口（D728 需扩写集：6 个文件，请 CTO 裁决）

**为什么必须扩**：派单 §二 验收 ② 要求「一条诊断报告能溯源到 ≥1 条原始证据」。证据对象构造出来后，**消费端仍然全是 `null`**——不改下面 6 处，D728 交付的将是"表存在 + 零写入 + 报告零引用"的第三次空心（M3 复发）。

| # | 文件 | 改动性质 | 不改的后果 |
|---|---|---|---|
| 1 | src/server.ts | 注入：`app.locals.evidence = { collector, corroboration }`（对齐既有 `app.locals.sessionStore` 行 264 范式） | 路由拿不到对象 → 无处注入 |
| 2 | src/routes/diagnosis.ts | 接线：行 358 `evidenceCollector: null` → 注入真实对象 | consult 链路证据不可用 |
| 3 | src/routes/conversations.ts | 接线：行 283 同上 | **访谈链路（最小闭环的触发点）永不写入** |
| 4 | src/agent/conversation-engine.ts | 消费降级结果（行 625-629 检查 `{degraded}` → `log.warn`，铁律 31） | 写失败静默（铁律 11 违规） |
| 5 | src/agent/diagnosis-launcher.ts | provenance 装配 + 引用落库 + 修死变量（行 129/134） | 报告无溯源字段，验收 ② 不可能达成 |
| 6 | src/agent/engine-context.ts | 新增注入结构类型（1 个 interface，避免 L1→L4 引用） | 路由只能用 `as` 硬转（铁律 38 风险） |

> **可选附件（P1，建议随 D728 一起扩）**：`scripts/ci/verify-d728.sh` 自证脚本（D703 证据命令机器化 W-1 的仓库惯例）。现状：CI 的 `Replay changed dev-doc evidence commands` 步骤只在**非 docs-only PR** 触发（`.github/workflows/ci.yml:39` `docs_only != 'true'`），且缺脚本只发 `::warning` 不阻断；D727 本 PR 为 docs-only（docs/ + task-state/ + .claude/）→ 本步骤不适用，故本 spec 不交付该脚本（避免写集外夹带）。D728 若扩写集，建议同步交付，把 §10-DS6-DS11 的命令升级为 CI 实跑。

**建议裁决**：**方案 A —— 扩写集，一个 PR 做完**。理由：6 处全是"装配点/接线点"（替换 `null`、挂字段、加 1 个类型），单处改动量 ≤ 10 行，风险远低于拆包；且不扩写集就只能交付半成品（违反铁律 1 垂直切片与铁律 7 Done 标准）。备选方案 B（拆 D728a 机制 / D728b 接线）会产生"表存在但零写入"的中间态——正是本次要根治的形态，**不推荐**。

### 5.4 必答② — 采集→落库契约（最小闭环 + 谁触发）

**最小闭环（一条线走通，7 步）**：

```
[触发 T1] GA 访谈一轮：POST /api/conversations（L1）
   ↓ L1 routes/conversations.ts 从 app.locals.evidence 取对象 → 注入 EngineContext（替换 null）
   ↓ L2 ConversationEngine.processMessage → Phase 0（既有调用点 conversation-engine.ts:625-629，**无需改逻辑**）
   ↓ EvidenceCollector.collectFromInterview(orgId, sessionId, [userInput])（L3/L4 边界，DI 注入）
   ↓ EvidenceStore.add() → INSERT INTO evidence（含 expires_at 派生）
   ↓ 结果对象 {written, skipped, degraded, errorCode?} 回到 L2 → degraded 则 log.warn（铁律 31）
[触发 T2] GA 发起诊断：POST /api/diagnosis/consult（L1）
   ↓ 注入 EngineContext（替换 null → 同上）
   ↓ L2 DiagnosisLauncher.startDiagnosis：
       ① 读证据进诊断输入（修死变量，禁止"读了不用"）
       ② runConsultation 返回后挂 report.provenance{evidenceRefs, degraded}
       ③ 写引用关系（ref_type='report', ref_id=reportId）
   ↓ 报告落 diagnosis_checkpoints(phase=5)（既有通道 diagnosis.ts:596-608）
[查询 T3] GET /api/diagnosis/consult/:consultId/report（既有路由 :783）→ provenance 可读
[门禁 T4] D725 保留作业读引用关系判"已蒸馏"（§5.7）
```

**契约（铁律 47 契约头）**：

```ts
/**
 * @input — orgId（组织，必填非空）/ sessionId（诊断会话，必填非空）/ userMessages（原始访谈输入，切 2000 字）
 *           注入项 opts.retention：{ windowMs: number | null }（windowMs=null 表示永久；缺省 = 永久）
 * @output — { written: number; skipped: number; degraded: boolean; errorCode?: string }
 *           written = 落库成功的证据行数；skipped = 被策略/校验跳过的条数（如空白输入）
 * @degraded — ① 证据层未装配（collector=null）→ 调用方不得调用（守卫），报告 provenance.degraded=true；
 *             ② store.add 抛错（DB 不可写/表缺失）→ log.warn + 返回 degraded:true + errorCode='EVIDENCE_WRITE_FAILED'
 *                **绝不向对话主循环抛错**（GA 访谈不能因证据写失败中断）；
 *             ③ 保留策略不可判定 → expires_at 写 NULL（永久）+ degraded:true + errorCode='EVIDENCE_RETENTION_UNRESOLVED'
 * @invariant — 证据一经写入，内容不可变（无 UPDATE 路径）；id 冲突走 INSERT OR REPLACE 语义
 */
```

**触发者清单（谁触发）**：

| 触发 | 触发者 | 现状 | 本批 |
|---|---|---|---|
| T1 访谈逐轮采集 | GA（人）→ `POST /api/conversations` | 代码在，注入为 null | ✅ **最小闭环 = T1 + T2 + T3** |
| T2 诊断读证据 + 挂引用 | GA（人）→ `POST /api/diagnosis/consult` | 读点存在但死变量 / 无引用写入 | ✅ |
| T3 溯源查询 | GA / K3 / 运维 | 路由在，报告无字段 | ✅ |
| T4 保留判定读引用 | D725 保留作业（cron） | 引用表尚未有写入方 | 接口对齐（§5.7），D725 线实施 |
| T5 文档/连接器采集（`source='document'/'connector'`） | 数据摄取服务 | 无该路径 | ❌ **本批不做**（§6） |
| T6 哨兵合成证据落库 | sentinel runner | 内存合成 | ❌ **本批不做**（§6，跨线） |

**禁止事项（防假闭环）**：
- ❌ 禁止"报告挂了 refs 但证据从未进入诊断输入"（假溯源）。**硬规则**：写入 provenance 的每条 ref，其证据内容必须出现在本次诊断的输入载荷中（§5.6 规则 3 + §7 L2b 用例）。
- ❌ 禁止无证据时把 `provenance` 留空或省略字段冒充"无需证据"——必须 `evidenceRefs: []` + `degraded: true/ reason` 显式可辨。

### 5.5 必答③ — `expires_at` 契约（谁写 / 写失败怎么办）

**语义定义（本 spec 确权）**：`expires_at` = **该条证据在写入时刻所属保留策略下的最早可释放时刻**（策略快照）。`NULL` = 永久（默认，对应 D725 的 `permanent`）。

| 问题 | 契约 |
|---|---|
| **谁写** | **唯一写入方 = 采集路径**：`EvidenceCollector` 在构造 Evidence 时用注入的保留策略派生 `expiresAt = windowMs === null ? undefined : new Date(Date.parse(collectedAt) + windowMs).toISOString()`。**禁止**：消费方 / 清理方 / 路由 / 前端 / 测试以外的任何位置写它；**禁止**两处派生逻辑（单点）。 |
| **为什么是写入快照而不是清理时滚动计算** | ① AWS/GCP 生命周期语义（策略变更不追溯改写历史对象）；② 审计需要回答"这条证据当时被判为多久"；③ 滚动计算会让"同一行在不同策略版本下的命运"不可复现（K3 无法复核）。 |
| **写失败 / 不可判定怎么办** | **fail-closed 于删除方向 + fail-soft 于采集方向**（两轴分离，这是本问的核心答案）：<br>· 策略缺失/非法、时钟异常、`windowMs ≤ 0` → **写 `NULL`**（永久保留）+ `log.warn` + `degraded:true` + `errorCode='EVIDENCE_RETENTION_UNRESOLVED'`；<br>· **证据行本身照常入库**（丢证据 = 直接摧毁"可溯源"，比"多留一份数据"严重得多）；<br>· 最坏后果 = **该释放的没释放**（数据多留），**绝不是误删**。 |
| **它是删除的充分条件吗** | **不是**。释放一条证据需要同时满足：① 时间窗口已过（`expires_at IS NOT NULL AND expires_at <= now`）；② D725 蒸馏判定（存在引用）；③ D725 双键门显式开启。任一不可判定 → **不删**。 |
| **与现有 `expireOld` 的口径冲突** | **裁决：`expires_at` 是唯一时间判据；`collected_at` 退化为审计字段。** 依据：表当前**零行**（零迁移成本），而两个候选谓词并存会让后续读者无法判断谁说了算（§4.4-A）。实施动作落在 D728 写集内的 `evidence-retention.ts`（把谓词由 `collected_at < ?` 改为 `expires_at IS NOT NULL AND expires_at <= ?`，并把窗口计算从清理时改为写入时）——**该文件同时是 D725 线对象，须在同批次串行内收敛**（§5.7 接口点 3）。 |

### 5.6 必答④ — 溯源链契约（怎么物理证明「一条报告能溯源到证据」）

**数据流（四段可断点）**：

```
原始输入（GA 原话）──采集──▶ evidence 行（唯一事实源）
诊断输入 ◀──注入─────┘（证据内容必须进输入，否则假溯源）
报告 ──provenance.evidenceRefs──▶ 引用关系行（wasDerivedFrom）
引用关系行 ──join──▶ evidence 行（可解析 = 存在且未失效）
```

**字段契约**：

```ts
/** 报告 provenance（由 L2 装配，挂在 report 对象上，随 diagnosis_checkpoints.partial_report 落库） */
interface EvidenceProvenance {
  /** 本次诊断输入中真实使用过的证据 id（非空 = 可溯源；空 + degraded=true = 诚实降级） */
  evidenceRefs: string[];
  /** 证据层是否降级（未装配 / 写失败 / 查询失败） */
  degraded: boolean;
  /** degraded 时的原因码：EVIDENCE_STORE_UNAVAILABLE | EVIDENCE_QUERY_FAILED | NO_EVIDENCE */
  reason?: string;
  /** 装配时刻（ISO 8601） */
  assembledAt: string;
}
/** 引用关系（复用 D725 的 evidence_refs 表，不在本 spec 内重复建表） */
// evidence_refs(id, evidence_id, ref_layer, ref_id, created_at)
// ref_layer ∈ {'report','expert_finding','ticket','fact','knowledge'}；ref_id = 上层对象 id（报告场景 = reportId）
```

**六条完整性规则**：

1. **引用必须可解析**：写引用时校验 `evidence_id` 存在；不存在 → **拒绝写入** + `log.warn` + degraded（悬空引用禁止入库）。
2. **引用与内容一致**：`provenance.evidenceRefs` 中的每个 id 必须出现在**本次诊断输入载荷**里（防止"挂了一堆无关证据"）。
3. **报告级最小闭环**：不要求每条结论逐条引用（本批 descope，§6），但**必须**做到"报告 → 至少一条原始证据可解析"。
4. **不级联删**：证据被生命周期释放时，引用行**保留**（否则「被引用过」这一事实自我湮灭，D725 判据失去历史）。溯源查询对已释放证据返回 **`released`**（tombstone）状态，**不得静默返回空**。
5. **幂等**：同一 `(evidence_id, ref_layer, ref_id)` 重复写入 = 更新 `created_at`，不产生重复行（唯一键）。
6. **降级可辨**：`degraded=true` 时 `reason` 必填；`degraded=false` 且 `evidenceRefs=[]` **只允许**出现在 `reason='NO_EVIDENCE'` 且本次输入确实零证据的场景（否则视为假绿）。

**物理证明（K3/运维可原样重放的三段查询 + 两条必红）**：

```bash
RID=<reportId>; DB=data/synova.db

# 段① 引用非空（报告 → 引用关系）
sqlite3 "$DB" "SELECT COUNT(*) FROM evidence_ref WHERE ref_layer='report' AND ref_id='$RID';"        # 期望 ≥1

# 段② 逐条可解析（引用 → 证据行）
sqlite3 -header "$DB" "SELECT e.id, e.source, e.source_id, e.type, substr(e.content,1,60) AS content_head,
                              e.collected_at, COALESCE(e.expires_at,'(permanent)') AS expires_at
                       FROM evidence_ref r JOIN evidence e ON e.id = r.evidence_id
                       WHERE r.ref_layer='report' AND r.ref_id='$RID';"                              # 期望 ≥1 行

# 段③ 内容一致（证据 = GA 原始输入的子串）
sqlite3 "$DB" "SELECT COUNT(*) FROM evidence e JOIN evidence_ref r ON r.evidence_id=e.id
               WHERE r.ref_id='$RID' AND instr('<提交时的原话>', substr(e.content,1,40)) > 0;"        # 期望 ≥1

# 段④ 报告侧（外部接口，与库内一致）
curl -s "localhost:3000/api/diagnosis/consult/$RID/report" | python3 -c \
  "import json,sys; p=json.load(sys.stdin)['report']['provenance']; print(len(p['evidenceRefs']), p['degraded'])" # 期望 ≥1 False
```

```bash
# 反向验证 R1（悬空引用必红）：插入指向不存在证据的引用 → 溯源查询必须非零退出
sqlite3 "$DB" "INSERT INTO evidence_ref(id,evidence_id,ref_layer,ref_id,created_at)
               VALUES('evr_neg','ev_does_not_exist','report','$RID',datetime('now'));"
sqlite3 "$DB" "SELECT COUNT(*) FROM evidence_ref r LEFT JOIN evidence e ON e.id=r.evidence_id
               WHERE r.ref_id='$RID' AND e.id IS NULL;" | grep -qx 0 || { echo "RED: 悬空引用未被拦截"; exit 1; }

# 反向验证 R2（注入回退必红）：把 routes 注入点改回 null → 重跑一次 consult →
#   report.provenance.evidenceRefs 为空 且 段① 计数为 0（证明"接线"是唯一因果，不是库里的存量数据）
```

> **验收口径**：R2 必须在实现期**真的做一次**（改回 null → 跑 → 观察红 → 改回 → 观察绿），并把两次原始输出贴进 D728 报告（S-3：生产调用点真实传递，测试调用不计）。

### 5.7 与 D725 的边界（接口点，逐条与 D725 spec 对齐）

| # | 接口点 | D725 侧（管"能不能删"） | D727 侧（管"怎么来 / 怎么留痕"） | 协调要求 |
|---|---|---|---|---|
| 1 | **引用表 `evidence_refs`** | 建表 + `recordDistillationRef()` / `queryDistillationRefs()` / `purgeDistilled()`（D725 §5.1 已认领 src/evidence/evidence-store.ts ） | **不重复建表**；定义**谁写**（消费侧：报告/专家/工单）、**值域**（`ref_layer`）、**完整性规则**（§5.6 六条）、**tombstone 语义** | 若 D725 先合：D728 复用其 API；若 D728 先合：D725 按本 spec 的值域实现查询 |
| 2 | **「蒸馏完成」的判据来源** | 判据 = `queryDistillationRefs(evidenceId).length ≥ 1`（创始人裁定①：「已被更高层引用过」） | 提供该事实的**唯一生产者**：报告装配时写 `ref_layer='report'` | 两侧必须对「引用 = 蒸馏证据」达成同一语义：**写引用 ≠ 删除**；D727 只写引用，绝不删 |
| 3 | **时间谓词口径** | `expireOld(maxAgeMs)` 当前按 `collected_at`（#527 行 183-184） | `expires_at` = 策略快照（§5.5） | **裁决：单口径 `expires_at`**（表零行，零迁移成本）。改动落在 `evidence-retention.ts`（D728 写集内）。D725 的双键门/蒸馏门**不变**，只是时间条件的来源改为 `expires_at` |
| 4 | **降级契约形态** | 失败 → `degraded=true` + `errorCode` + **不删** | 失败 → `provenance.degraded=true` + `reason` + **不假装有证据** | 同一形态（log + degraded + 错误码），两侧各自持有自己的失败面 |

> **不重叠声明**：本 spec **不定义**任何删除触发条件、不定义保留分级表、不定义双键门——这些是 D725 的唯一权威（D725 §5.2/§5.4）。本 spec **不修改** D725 的任何判据，只新增"引用从哪来"。

### 5.8 决策参考（S-12，本任务决策点）

| # | 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|---|
| 1 | `expires_at` 语义 | A 保持死列 / B 写入时刻策略快照 / C 清理时滚动计算 | 第一性原理（一个概念一个定义）+ 业界（S3/GCS 对象级生命周期）+ Anthropic（可复核） | **B**。C 会让同一行在不同策略版本下命运不可复现；A 留死列（铁律 37 邻近）且与 `collected_at` 双口径。**表零行 → 现在改零成本** |
| 2 | 表如何"永远存在" | A bootstrap 装配点无条件构造 / B 注册进 `schema-migration.ts`（SCHEMA_VERSION 2→3） | 第一性原理（schema 是启动不变量）+ 最少机制 + 写集约束 | **A**（本批）；**B 列为 P1 待办**。理由：A 已在 D728 写集内且把可达性变成无条件；B 更规范但需扩 src/store/ 两个文件，且**两条建表路径 = 双源**（双数据源教训）→ 二选一，不并行 |
| 3 | 证据进入诊断的方式 | A 修死变量（把证据作为 `concerns` 的前置上下文传入引擎输入）/ B 只挂 provenance 不改进输入 | 第一性原理（溯源的本质 = 因果可达）+ 反假绿 | **A**。B 会把"报告有 refs"变成纯装饰（假溯源）。A 的最小形态 = 把证据文本块拼进 `runConsultation` 的输入载荷（`concerns` 前缀），并可在测试中断言输入含证据内容 |
| 4 | 报告级 vs 结论级引用 | A 报告级（本批）/ B 逐条结论引用（需 LLM 逐条引用） | 最少机制 + 诚实（能力边界） | **A**，B 显式 descope（§6）。报告级**已经能**满足派单验收 ④ 与 D725 的"被引用过"判据 |
| 5 | 溯源验证的载体 | A 文档化 sqlite3 三段查询 + 必红双向 / B 新增 `scripts/evidence/` 工具脚本 | 写集约束 + K3 可重放性 | **A**（本批，零新文件）；B 列为 P1（复用性更好，但扩写集） |

> **收敛检查**：五处决策的第一性原理与业界/Anthropic 基线一致指向同一结论（唯一事实源 + 无条件可达 + 引用可解析 + 显式降级），无分歧。**参考：第一性原理 + Anthropic 工程基线 + 业界实证（W3C PROV / OpenLineage / S3 生命周期）+ 结论：如上表。**

### 5.9 实现顺序（Mac 线 D728）

> **归属说明**：派单 §一 交付项 2 原写「若实施归 Win，则出指令；归 Mac 则写明」。**派单 §二 已定 D728 = Mac 编码**，故本 spec 随附 **Mac 线编码指令**（`docs/synova/coordination/编码指令-D728-证据链接线-Mac-20260913.md`），不另出 Win 指令。

```
Step 0 前置核验（缺一不开工）
        git fetch --all && git pull --ff-only → 重核 §4.1 全部行号
        核 #527 是否已合（evidence-retention.ts 是否存在）→ #527 未合则 D728 无法改谓词，需 CTO 裁决
Step 1 red：先在 tests/evidence/ 写 L1+L2a 用例（对当前 main 必须失败：表不存在 / 注入为 null / 无 provenance）
Step 2 表与数据面：EvidenceStore DDL 单一事实源 + expires_at 派生 + 引用写入/查询 API
Step 3 装配：bootstrap Phase 1 构造三件套（失败 → addDegraded，不 fatal）+ BootstrapServices 暴露
Step 4 注入：server.ts app.locals.evidence → 两处路由替换 null → engine-context 注入类型
Step 5 消费：launcher 修死变量（证据进输入）+ 报告 provenance + 引用落库
Step 6 谓词收敛：evidence-retention.ts 时间谓词切 expires_at（与 D725 线串行确认）
Step 7 green + 反向验证 R1/R2（§5.6）+ 贴 sqlite3 原始输出
Step 8 接线自证：grep 生产调用点（§8）+ 写集对账 + task-state 回填 impl 段
```

---

## 6. What We Don't Do

| 不做 | 文件路径 | 原因 |
|---|---|---|
| 不写实现代码 | 任何 src/ | 本任务 = spec（派单红线）；实现归 D728/Mac |
| 不改审计脚本 | `scripts/audit/**` | K3 红线（违反 = 事故） |
| 不改 CODEOWNERS | `.github/CODEOWNERS` | 派单红线 |
| 哨兵合成证据落库 | src/sentinel/runner.ts | 跨线改造（L3 洞察线）；本批只登记第 3 路分裂（§4.4-E）。需另立任务 |
| 专家 `evidenceRefs` 校验接线 | src/l3/expert-dispatcher.ts 、src/l3/quality-firewall.ts 、src/l3/expert-output-schema.ts | L3 洞察线域；且生产 firewall 依赖 `SubAgentCoordinator`（零实例化）——是独立的多点接线问题 |
| 本体 `Evidence` 节点写入 | src/l4/graph-bridge.ts | 第 4 路分裂的处置（本体 vs 关系表的唯一事实源之争）需架构决策，不在本批 |
| 逐条结论级引用 | src/l3/synova-diagnosis-engine-impl.ts | 需 LLM 逐条引用能力，属下一阶段（§5.8 决策 4） |
| 工程验收证据体系改造 | `scripts/product-lines/evidence-writer.py`、`scripts/product-lines/calc-progress.py` | 第 5 路同名异物是**另一个域**的活系统；本 spec 只在文档层消歧（不改代码） |
| 迁移注册 | src/store/schema-migration.ts 、src/store/migrations/ | P1 待办（§5.8 决策 2）；本批用 bootstrap 装配点，避免双建表路径 |
| 保留分级 / 删除判据 / 双键门 | `evidence-retention.ts` 的判据部分 | D725 唯一权威（§5.7）——本批只动时间谓词的**来源** |
| agent_memory / 知识层 | src/l4/agent-memory-store.ts 、src/l3/pkb-lifecycle.ts | 他人域；本 spec 只读引用其"版本链/逻辑过期"语义作对照 |

---

## 7. Test Requirements

> 铁律 48：每层测试必须有 `expect()` 断言，覆盖 正常 / 降级 / 边界 三路径。测试文件命名：`*.test.ts`（单元）/ `*.integration.test.ts`（集成）。

### L1 单元契约（模块级）

| # | 用例 | 断言（expect） |
|---|---|---|
| L1-1 | `evidence` 表在**未显式建表**的 DB 上经由生产装配路径存在 | `sqlite_master` 查到 `evidence` + `evidence_fts`；索引 ≥3 |
| L1-2 | `collectFromInterview` 正常路径 | 返回 `{written: N, skipped: 0, degraded: false}`；表内行数 = N；`collected_at` 非空 |
| L1-3 | `expires_at` 派生（策略 = 180d） | `expiresAt` 非空且 ≈ `collected_at + 180d`（容差 1s） |
| L1-4 | `expires_at` 派生（策略 = permanent） | `expiresAt === undefined` → 库内 `NULL` |
| L1-5 | 引用写入 → 查询 | `recordRefs(reportId, [ev1, ev2])` 后：refs 计数 = 2；重复写入幂等（仍 = 2，`created_at` 更新） |
| L1-6 | 悬空引用被拒绝 | `recordRefs(reportId, ['ev_not_exist'])` → 返回 degraded/拒绝 + `log.warn`（不落行） |
| L1-7 | 报告 provenance 形状 | `assembleProvenance(...)` 返回 `{evidenceRefs, degraded, assembledAt}`；空证据 → `degraded=true, reason='NO_EVIDENCE'` |

### L2a 接线验证（真实调用链，**测试调用不计 —— S-3**）

| # | 验证 | 方式 |
|---|---|---|
| L2a-1 | 生产构造点存在 | `grep -rn "new EvidenceStore" src/ ` → 命中 src/deploy/bootstrap.ts （≥1）；`src/ ` 外零命中 |
| L2a-2 | 注入点不再为 null | `grep -rn "evidenceCollector: null" src/routes/ ` → **0**；`grep -rn "app.locals.evidence" src/server.ts ` → ≥1 |
| L2a-3 | **端到端链路**（集成测试，真 express + 真 better-sqlite3） | 见下方"集成用例" |
| L2a-4 | 报告落库通道未绕过 | `diagnosis_checkpoints` phase=5 行的 `partial_report` 含 `provenance.evidenceRefs` |

**集成用例（`tests/evidence/` 下新建，harness 对齐 `tests/routes/diagnosis-report-persistence.test.ts`：`vi.mock` 确定性引擎 + 假 provider + 真路由 + `:memory:` DB）**：

| # | 步骤 | 断言 |
|---|---|---|
| I-1 | 注入真 EvidenceCollector → 调 `collectFromInterview(orgId, sid, ['我们客户集中度过高…'])` → 发起 consult（确定性引擎 stub） | `evidence` 行 ≥1；`evidence_ref` 行 ≥1；`report.provenance.evidenceRefs.length ≥ 1`；`degraded === false` |
| I-2 | 从 `diagnosis_checkpoints` 读回报告 | `partial_report.provenance.evidenceRefs` 与内存一致（落库不丢字段） |
| I-3 | 逐条解析 | 每个 ref 在 `evidence` 表存在；`instr(输入载荷, substr(content,1,40)) > 0`（**规则 2**：内容确实进了诊断输入） |
| I-4 | 未注入（`app.locals.evidence` 缺省） | 报告 `provenance.degraded === true` 且 `evidenceRefs.length === 0`；**不得**出现 `degraded:false` + 空 refs（假绿） |

> ⚠️ 集成测试若只能通过 mock 引擎验证，则**不构成**生产接线证明——L2a 的最终证据是 §5.6 的 **R2 反向验证**（改回 null → 真跑 → 红）。

### L2b 降级路径（red 必须覆盖失败模式，非仅 happy path —— S-5）

| # | 失败模式 | 期望（红→绿） |
|---|---|---|
| L2b-1 | **注入点回退 `null`**（劫持/回归） | 证据零写入 + `provenance.degraded=true` + 段①计数 0 → 溯源查询**非零退出** |
| L2b-2 | **悬空引用**（伪造 ref 行） | 溯源查询检出悬空 → **非零退出**（R1） |
| L2b-3 | **DB 不可写**（表被删 / 只读） | `collectFromInterview` 返回 `degraded:true, errorCode='EVIDENCE_WRITE_FAILED'`；**对话主循环不抛出**；`log.warn` 命中 |
| L2b-4 | **保留策略非法**（`windowMs=-1` / 解析失败） | `expiresAt = NULL`（永久）+ `degraded:true` + `errorCode='EVIDENCE_RETENTION_UNRESOLVED'`；**证据仍入库** |
| L2b-5 | **证据已释放（tombstone）** | ref 行保留；溯源查询对已删证据返回 `released` 状态，**不静默省略** |

### L2c 边界

| # | 边界 | 期望 |
|---|---|---|
| L2c-1 | 超长输入（>2000 字） | 截断到 2000（与既有 `index.ts:39` 一致），不报错 |
| L2c-2 | 空白/纯空格输入 | `skipped` 计数 1，不写入垃圾证据行 |
| L2c-3 | 同 org 大量证据（>50） | 装配侧 limit 生效（对齐既有 `limit: 50`），`evidenceRefs` 有界且可解析 |
| L2c-4 | 同内容重复采集 | 允许出现多行（§4.4-F 已知）；引用按 `evidence_id` 幂等，不产生重复引用行 |
| L2c-5 | `orgId` 为空 / 未装配 sessionId | 不写脏数据（拒绝 + degraded），不抛错 |

---

## 8. Wiring Verification

> 铁律 0-2/4/5：新能力必须在**生产调用点**真实传递；测试调用不计（S-3）。下表每一行都必须有 `grep` 实证。

| 变更 | 生产调用点（文件:行，基线 cff43d6f） | 验证命令 |
|---|---|---|
| EvidenceStore 构造（表存在性） | src/deploy/bootstrap.ts Phase 1（1c 之后；`bootstrap.ts:714+`） | `grep -rn "new EvidenceStore" src/ ` → 仅 bootstrap（≥1 命中，tests/ 不计） |
| 三件套注入路由 | src/server.ts 行 264-265 邻域（`app.locals.evidence`） | `grep -n "app.locals.evidence" src/server.ts ` → ≥1 |
| 注入点（诊断链路） | src/routes/diagnosis.ts 行 358（替换 `evidenceCollector: null`） | `grep -n "evidenceCollector" src/routes/diagnosis.ts ` → 非 null 表达式 |
| 注入点（访谈链路 = 写入口） | src/routes/conversations.ts 行 283（替换 `evidenceCollector: null`） | `grep -rn "evidenceCollector: null" src/ ` → **0** |
| 采集调用（写） | src/agent/conversation-engine.ts 行 625-629（既有，无需改逻辑） | `grep -n "collectFromInterview" src/ ` → conversations 链路可达；`grep -rn "collectFromInterview" src/ --include=*.ts` 命中 conversation-engine.ts |
| 证据进诊断输入 + provenance + 引用落库 | src/agent/diagnosis-launcher.ts 行 129/134（死变量处）与行 175（`runConsultation` 调用后） | `grep -n "evidenceSummary" src/agent/diagnosis-launcher.ts ` → 出现**读取**处（读取数 > 赋值数）；`grep -n "provenance" src/agent/diagnosis-launcher.ts ` → ≥1 |
| 报告读回（查询） | src/routes/diagnosis.ts 行 783 GET report（既有，零改动） | 集成用例 I-2 + 段④ curl |
| 保留判定读引用（D725） | 保留作业（#527 引入，cron `30 3 * * *`） | `grep -rn "queryDistillationRefs" src/ ` → ≥1（D725 线交付） |
| **反向（禁 dead）** | 全仓不得再出现第二处 `new EvidenceStore(...)`（防双源） | `grep -rn "new EvidenceStore" src/ \| wc -l` → **1** |

> **接线成立的判据**：`app.locals.evidence` 有值 → 路由注入 → Phase 0 落库 → 报告挂 refs，四段任一段为"空值/兜底分支"即视为未接线（不认 grep 引用数，只认 R2 反向验证的红/绿）。

---

## 9. Architecture Layer

| 环节 | 层 | 说明 |
|---|---|---|
| 触发入口（HTTP 路由） | **L1 交互**（src/routes/ ） | 只做装配注入（读 `app.locals`），**不构造 L4 对象**（`check-architecture.sh` 的 `L1→L4` 规则把 `/evidence/` 列为禁止路径） |
| 采集触发与编排 | **L2 编排**（src/agent/conversation-engine.ts 、src/agent/diagnosis-launcher.ts ） | 通过 `EngineContext`（DI 注入接口）调用；`engine-context.ts` 是**设计内的 L2↔L4 桥接例外**（`check-architecture.sh:42-43` 注释原文） |
| 证据消费与引用装配 | **L3 洞察**（src/l3/ 报告/专家链） | D725 的 `evidence-retention.ts` 在 L3 编排保留；L3 经 L4 接口取数（`evidence-retention.ts` 头注原文：本文件零 `db.prepare/exec`） |
| 证据数据面 | **L4 本体**（src/evidence/ ） | `EvidenceStore` 是数据面的唯一入口；DDL/查询/引用完整性都在此层 |
| 表 | **L5 存储**（SQLite） | L4 持有句柄，L5 不含业务判断 |
| 组合根 | **L0**（src/deploy/bootstrap.ts + src/server.ts ） | 唯一装配点：构造 → 注入 `app.locals` |

**边界规则**：路由（L1）不得 `import` `/evidence/`；L2 通过注入的结构类型访问（`engine-context.ts`）；L3 不碰 `db.prepare`（沿用 D717 已确立形态）。**为什么是本层**：证据"怎么来"由采集触发点决定（L2），"怎么留痕"由数据面 + 引用关系决定（L4），两者之间的契约即本 spec 的交付。

---

## 10. Completion Standard

> DS 与本文一一对应，禁重编号 / 跳号 / 静默缺项（S-10）。**本 spec 自身（D727）的完成标准 = DS1-DS5**；**D728 实施期的完成标准 = DS6-DS14**。

**D727（spec 交付，本任务）**
1. **DS1**：`bash scripts/control-tower/dev-doc-gatekeeper.sh <本 spec>` → **exit 0**（C1-C6 全过）
2. **DS2**：`devdoc_writeset.py --extract <本 spec>` → `status=ok`，条目数 = 4（§5.1 写集表）
3. **DS3**：必答四问在文内可定位且各有唯一答案：①→§4.3；②→§5.4；③→§5.5；④→§5.6（grep 四问编号命中）
4. **DS4**：§4 每条现状结论附命令 + 原始输出（E1-E6），**零"凭记忆"声称**
5. **DS5**：§5.7 与 D725 的接口点 ≥4 条且互不重叠；§5.3 写集缺口（6 文件）已显式上报 CTO

**D728（实施期，本 spec 的验收对象）**
6. **DS6**：`sqlite3 data/synova.db ".tables" | grep -ci evidence` → **≥1**（真表存在；贴输出）
7. **DS7**：一次真实 consult 后 `evidence` 表行数 **≥1**（贴 `SELECT id, source, type, substr(content,1,40), collected_at, expires_at FROM evidence;`）
8. **DS8**：同次 consult 后 `evidence_ref` 中 `ref_layer='report'` 行 **≥1**（贴 SQL）
9. **DS9**：`GET /api/diagnosis/consult/:consultId/report` 返回 `provenance.evidenceRefs.length ≥ 1` 且 `degraded=false`（贴 curl + JSON）
10. **DS10**：**反向验证 R2**（注入点回退 null → 红；改回 → 绿）两次原始输出均贴出
11. **DS11**：**反向验证 R1**（悬空引用被拦截，查询非零退出）原始输出贴出
12. **DS12**：零静默降级——所有新增 catch 有 `log.warn/error` + degraded/errorCode（铁律 11/24/31）；`as any` / `as never` / `as unknown as` 零新增（铁律 38）
13. **DS13**：接线自证——§8 表逐行 grep 实证（含 `grep -rn "new EvidenceStore" src/ | wc -l` = 1）
14. **DS14**：`bash scripts/workflow/check-dev-doc-write-set.sh` 对账零漂移（实施写集 vs `git diff`）+ task-state/D728.json 回填 impl 段

> **可证伪点（三条，全部为红/绿二分）**：① 注入回退 null → `evidenceRefs` 恒空（§5.6 R2）；② 悬空引用 → 溯源查询 exit≠0（§5.6 R1）；③ 证据内容未进入诊断输入 → I-3 断言失败（假溯源判定）。

---

## 11. Auth Doc References

| 引用 | 路径 | 用途 |
|---|---|---|
| 派单（本任务来源） | docs/synova/coordination/派单-第三批-D727-D731-20260913.md | §一 交付/必答/写集/红线；§八补 CTO 复核证据 |
| D725 spec（边界权威） | docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D725-d660-data-lifecycle-20260913.md | 蒸馏完成定义 / 引用表认领 / 五层阶梯 / 双键门 |
| 产品北星 | .claude/PRODUCT-BRIEF.md | §一 / §二 / §三 / §六 P0 |
| 铁律 | AGENTS.md 、 CLAUDE.md | 0-2 / 4 / 5 / 7 / 11 / 24 / 31 / 32 / 37 / 38 / 39 / 47 / 48 / 49 |
| 决策框架 | docs/synova/coordination/DECISION-REFERENCE.md | §5.8 决策四步 |
| 参考范例（D381 写前必读） | docs/plans/codex/implementation/SYNOVA-IMPL-D352-resolver硬化-20260813.md | 结构骨架（写集/权威/缺陷/red-green/决策/DS/自检） |
| 证据数据面 | src/evidence/evidence-store.ts 、 src/evidence/index.ts 、 src/evidence/types.ts | §4.4-A/F 审计对象 |
| 注入与消费点 | src/routes/diagnosis.ts 、 src/routes/conversations.ts 、 src/agent/conversation-engine.ts 、 src/agent/diagnosis-launcher.ts 、 src/agent/engine-context.ts | §4.4-C / §5.3 缺口 / §8 接线 |
| 报告与落库 | src/l3/synova-diagnosis-engine.ts 、 src/routes/diagnosis.ts 、 src/store/session-store.ts | §4.4-B（DiagnosisReport 形状 / GET report / checkpoint） |
| 专家证据引用链（只读） | src/l3/expert-output-schema.ts 、 src/l3/expert-dispatcher.ts 、 src/l3/quality-firewall.ts | §4.4-D（第 2 路分裂） |
| 哨兵合成证据（只读） | src/sentinel/runner.ts 、 src/orchestrator/subagent-coordinator.ts | §4.4-D/E（第 3 路分裂 + 零实例化） |
| 装配范式 | src/deploy/bootstrap.ts 、 src/server.ts | 组合根 / `app.locals` 范式 |
| 组织架构规则 | scripts/check-architecture.sh | L1→L4 禁止 `/evidence/`；L2↔L4 桥接例外 |
| 工程验收证据（同名异物，只读） | scripts/product-lines/evidence-writer.py 、 scripts/product-lines/calc-progress.py | §4.2 第 5 路消歧 |
| 历史先例 | .claude/task-briefs/2026-08-18-D430-a2-evidence-wiring.md 、 memory/notes/archived/dual-source-fraud.md | §1 权威⑤ / 双数据源教训 |
| task-state | task-state/D727.json | 本任务登记（D382 状态机） |

---

## 12. 自检清单

- [x] 必答①（表不存在的根因）**已答**：三层根因 + 每层物理证据（§4.3），并正面回答"没人建表 vs 建了没调用"
- [x] 必答②（写入最小闭环 / 谁触发）**已答**：T1-T6 触发表 + 7 步闭环 + 契约头（§5.4）
- [x] 必答③（`expires_at` 谁写 / 失败怎么办）**已答**：唯一写入方 + fail-closed 于删除 / fail-soft 于采集 + 冲突裁决（§5.5）
- [x] 必答④（物理证明可溯源）**已答**：四段可断点 + 六条完整性规则 + 三段查询 + R1/R2 必红（§5.6）
- [x] 派单要求 ④（消费方盘点）**已答**：§4.2 + §4.5（含 `evidence-writer.py` / product-lines 状态机）
- [x] 与 D725 边界**已答**：4 个接口点，含不重叠声明（§5.7）
- [x] 声称即证据：E1-E6 全部附命令 + 输出；行号在 base cff43d6f 上逐条 grep 复核（不凭记忆）
- [x] 写集表存在且格式合规（`### 5.1 写集 (0 修改 + 4 新建)` + 紧邻表头，D381 格式契约）
- [x] 实施缺口已显式上报（§5.3，6 文件，附建议裁决 A/B 与不推荐理由）
- [x] 决策参考已记录（§5.8，5 个决策点走四步收敛，S-12）
- [x] 未写实现代码；未碰 scripts/audit/；未碰 .github/CODEOWNERS（红线自检）
- [x] 已知限界诚实声明：报告级引用（非逐条结论）；第 2-4 路分裂仅登记不修；迁移注册列为 P1
- [x] 跨线边界声明：本批对 src/sentinel/ 、src/l3/ 、src/l4/ 只读
