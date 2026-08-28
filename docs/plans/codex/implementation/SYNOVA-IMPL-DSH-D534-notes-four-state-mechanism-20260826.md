---
north-star:
  服务用户: 开发线全体（CTO/DSH/Claude/Codex——每个"踩过坑才写进 memory/"的教训，以及 LOOP-ENGINEERING 的决策传统）+ 未来的实现者（接任务时能查到"这个领域我们裁过什么、为什么"）
  服务场景: D395-a 建好四态目录、D472 补了迁移门禁，但"非平凡变更是否写 Note"仍靠自觉——改治理脚本/铁律/核心行为可以不写 Note 直接提交，决策沉淀在关键变更上失效；四态迁移语义（proposed→implemented 门槛 / implemented→archived 触发 / rejected 语义）只有 README 一行"git mv"文字，无完整规则
  模块终态: memory/notes/ 四态闭环完整：① 非平凡变更（治理脚本/铁律/规则文档）commit 必须引用 Note（物理门禁，D395-a 触发面扩展）② 四态迁移语义完整文档化（proposed→implemented 门槛 = 落地可验证 / implemented→archived 触发 = 被替代或超期 / rejected = 否决留痕）③ AGENTS.md 铁律速览引用 Notes（合并而非替代）④ 存量规整后无僵尸（D472 Note 迁入 implemented/）——决策可沉淀、可检索、不腐化
  对齐北星: PRODUCT-BRIEF.md §七「我犯过的错」（跳过程序/硬编码/不检查数据源 = 决策不沉淀）+ §八.3「决策建议——读取 memory/ 历史教训」——把"教训注入"从"读活态"升级为"非平凡变更强制沉淀"
  完成标准: 入口 改 scripts/control-tower/ 或 scripts/workflow/ 或 AGENTS.md 的 commit → 处理 commit-msg 门禁检查 Note 引用 → 结果 未引用 Note → 硬阻断（grep 可查）+ 存量 proposed 僵尸清零（D472 Note 已迁移）
  当前进度: D395-a（2026-08-17）已交付四态目录+四字段头+commit-msg 引用门禁（仅 control-tower/orchestrator）；D472（2026-08-22）已交付迁移门禁（check-notes-lifecycle.sh）+ hook 注入过滤 + 字段契约对齐。缺口：① 非平凡变更强制 Note 的触发面只覆盖 control-tower/orchestrator ② 四态迁移语义未完整文档化 ③ AGENTS.md 未引用 Notes ④ proposed/ 存在 D472 僵尸 Note（D472 audited 但 Note 未迁移）
---

<!--
  SYNOVA-IMPL-DSH-D534: Agent Notes 四态机制补全（Stage1-D2 续，借鉴 DSH .agents/notes 四态）
  状态: dev doc | 2026-08-26 | 优先级 P1（Stage1 序 2 续）
  权威文档: 派单 Stage1续-D534-D535-20260825.md + 施工图 DOC-0114 §3.3/§5.3 + D395-a/D472 dev doc + DSH state.d.ts（范式借鉴）
  依赖: D395-a（四态目录+引用门禁）/ D472（迁移门禁+注入过滤）——本任务在其上补"非平凡强制 + 迁移语义 + 铁律合并 + 存量规整"
  并行: D535（guard）独立——D534 写集 memory/notes/ + commit-msg-check.sh + AGENTS.md，D535 写集 scripts/control-tower/incident-loop.py + synova-commit + 新文档，零文件交集；⚠️ D533（CI）可碰 tests/control-tower/*.test.sh（renormalize）——D534 新建测试同目录，标注共享资源（S-7/S-8）
-->

# SYNOVA-IMPL-DSH-D534: Agent Notes 四态机制补全

> 一句话问题: D395-a/D472 把四态目录、迁移门禁、注入过滤都建好了，但**"非平凡变更强制写 Note"仍是半套**——D395-a 的 commit-msg 门禁只对 `scripts/control-tower/` + `src/orchestrator/` 触发，改 `scripts/workflow/`（任务卡模板/决策脚本）、`scripts/hooks/`（注入/阻断）、`AGENTS.md`（铁律本身）这些同样承载决策的地方**不用引用 Note**；四态迁移语义在 README 只有一行"git mv 换目录"，没有"什么算落地、什么触发归档"的完整规则；`proposed/` 里还躺着 D472 自己的僵尸 Note（D472 已 audited，Note 未迁入 implemented/）。借鉴 DSH `.agents/notes` 的"状态机 + 迁移语义"（state.d.ts 的版本化状态 + README 引用的 `notes/implemented/architecture/YYYY-MM-DD-*.md` 路径纪律），把机制补全为闭环。

## 1. Authority Doc Verification

**来源**: [派单 Stage1续-D534-D535-20260825.md](docs/synova/coordination/派单-Stage1续-D534-D535-20260825.md)（D534 节）

> **目标**：memory/ 从"四态目录存在"→"非平凡变更强制带 Note + 四态迁移语义 + 与铁律体系合并"——知识可沉淀、可归档、不腐化。
> **spec 必答题**：① 现状盘点（implemented 31/proposed 3——archived/rejected 是否空？现有 Note 格式/命名/task-brief 关联）② 四态语义定义（proposed→implemented 门槛？implemented→archived 触发？非平凡变更强制 Note 的门禁落点）③ DSH 范式借鉴（读 state.d.ts，借鉴"状态机+迁移语义"理念自研，不引代码）④ 与铁律合并（AGENTS.md 铁律速览引用 Notes）⑤ 存量迁移（31 implemented + 3 proposed 规整）
> **验收**：非平凡变更无 Note → 门禁拦（物理）；四态迁移规则文档化；存量 notes 规整后分布合理（archived/rejected 有实际内容）

**来源**: [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§3.3 🟡 搬走 + §5.3 自进化 E2 前置）

> 铁律 + memory/ + task-brief 体系 → DSH Agent Notes 四态（proposed/implemented/archived/rejected）。三个接缝在 Stage 1 就建好，E2/E3 将来直接插上。

**来源**: [D395-a dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D395a-notes-four-state-20260816.md)（§3.1 写集 + §4.5 决策 D）

> 门禁落点决策：commit-msg hook 查 commit message（pre-commit 无法读到最终 message）。触发面 = `scripts/control-tower/` + `src/orchestrator/`（决策密集区）。

**来源**: [D472 dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D472-notes-lifecycle-hardening-20260822.md)（§4.1 写集 + §4.3 不做）

> 已交付：hook 只读活态 / check-notes-lifecycle.sh 迁移门禁（proposed 僵尸）/ 字段契约统一 / pre-commit 组 6 接线。不做：自动 git mv（迁移是人的决策）、改 commit-msg-check.sh 引用门禁（D395-a 已交付不碰）。

**来源**: [DSH dsh-agent-instructions/lib/types/state.d.ts](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-instructions/lib/types/state.d.ts)（范式借鉴，不引代码）

> `InstructionVersionState { path, version, digest, trimmedDigest }`——每个状态条目带版本与摘要，变更走显式 transition（set/delete）。DSH 各包 README 引用 `.agents/notes/implemented/architecture/YYYY-MM-DD-*.md`（如 dsh-tool-call-timeout-policy lib/index.js:11 引用 `2026-07-29-package-regrouping.md`）——**实现落地必须迁入 implemented/ 的路径纪律**。借鉴"状态机 + 迁移语义"理念自研，不引代码（Stage 3 前零 DSH 依赖红线）。

**来源**: [AGENTS.md 铁律](AGENTS.md)（35 自动化优先 / 0-2 测试先行 / 48 测试非空壳）

> 铁律 35: 能变 check-*.sh 的不靠 review。非平凡变更强制 Note = 把"靠自觉写 Note"变成"物理 grep 检查"。

## 2. Problem Statement

C 线 S5-3（知识沉淀结构化）已到 D472 闭环的一半，剩 4 个断点：

1. **非平凡变更强制 Note 触发面太窄（M7 防线半套）**：`scripts/commit-msg-check.sh:127` 触发面 `CT_ORCH_TOUCHED=$(echo "$STAGED_LIST" | grep -E '^(scripts/control-tower/|src/orchestrator/)' || true)`——只有控制塔 + 编排器两个决策密集区。但**治理脚本区**（`scripts/workflow/`：task-start/check-brief-parseable 等决策载体；`scripts/hooks/`：注入/阻断逻辑）、**铁律本体**（`AGENTS.md`/`CLAUDE.md`）同样是"改了就改变开发行为"的非平凡变更——改了它们不写 Note = 决策变更无沉淀。D472 dev doc §4.3 明令"不改 commit-msg-check.sh 引用门禁"，但那是针对 D472 自身范围；D534 在 D472 之上扩展触发面（阶段化推进，不违反）。
2. **四态迁移语义未文档化（README 只有一行）**：`memory/notes/README.md:16-18` 只有"状态迁移 = git mv 换目录"。缺：proposed→implemented 的**门槛**（什么算"落地"——task-state 状态？commit 存在？）、implemented→archived 的**触发**（被替代/超期不活跃？）、rejected 的**语义**（否决留痕，防重蹈）。无规则 = 迁移全凭个人理解。
3. **AGENTS.md 铁律速览未引用 Notes**：AGENTS.md 铁律速览（0-48 条）只字未提 memory/notes/——铁律是"开发行为宪法"，Notes 是"决策记录"，两者未合并（施工图 §3.3 明令"与铁律体系合并而非推翻"）。
4. **存量僵尸未清零**：`memory/notes/proposed/2026-08-22-d472-notes-lifecycle.md` 头状态 `状态: proposed`，但 D472 已 `audited`（task-state/D472.json）——实现已落地，Note 未迁入 implemented/。check-notes-lifecycle.sh 提取不到它的 D#（头无 `任务: DXXX`/英文头 name:/class: 带 D#，extract_d_id 双模式均不命中）→ 漏网僵尸。

对齐北星：PRODUCT-BRIEF §七（我的错=跳过程序/不检查数据源——教训要能注入才能防再犯）+ §八.3（决策建议读取 memory/ 教训）。非平凡变更不强制 Note = 最重要的决策反而最不沉淀——直接破坏"防再犯"机制。

## 3. Current State（2026-08-26 grep/read 实测）

### 3.1 已存在（D395-a/D472 交付，复用不重造）

| 资产 | 位置 | 状态 |
|------|------|------|
| 四态目录 | `memory/notes/{proposed,implemented,archived,rejected}/` | ✅ implemented 31 / proposed 3 / archived 21 / rejected 0（ls 实测） |
| 四字段头契约 | `memory/notes/README.md:22-30` | ✅ 状态/日期/决策/理由 |
| git mv 迁移规则 | `memory/notes/README.md:16-18` | ⚠️ 有文字无完整语义 |
| Note 引用门禁 | `scripts/commit-msg-check.sh:119-155` | ✅ D395-a 交付（触发面 control-tower/orchestrator） |
| 迁移门禁 | `scripts/control-tower/check-notes-lifecycle.sh` | ✅ D472 交付（proposed 僵尸判定，双格式 D# 提取） |
| 注入过滤 | `scripts/hooks/hook-check-memory.sh:21-59` | ✅ D472 交付（只读 proposed+implemented） |
| 纯文档豁免补跑 | `scripts/pre-commit-check.sh:291-299` | ✅ D472 复核修复（CT-34 早退分支内补跑迁移门禁） |
| 门禁测试 | `tests/control-tower/check-notes-lifecycle.test.sh` + `notes-four-state.test.sh` + `hook-check-memory.test.sh` | ✅ 已交付 |

### 3.2 缺陷 A（P1）: 非平凡变更强制 Note 触发面过窄

`scripts/commit-msg-check.sh:127`（grep 实测）：

```bash
CT_ORCH_TOUCHED=$(echo "$STAGED_LIST" | grep -E '^(scripts/control-tower/|src/orchestrator/)' || true)
```

只覆盖 control-tower + orchestrator。以下非平凡变更**不触发**（实测 grep 验证触发面正则）：
- `scripts/workflow/`（task-start.sh / check-brief-parseable.sh / resolve-commit-brief.sh——决策与流程载体）
- `scripts/hooks/`（hook-block-write.sh / hook-check-memory.sh——行为阻断与注入）
- `AGENTS.md` / `CLAUDE.md`（铁律与角色行为宪法）
- `memory/notes/README.md`（四态规则本身）

### 3.3 缺陷 B（P1）: 四态迁移语义未文档化

`memory/notes/README.md:16-18` 原文：

```markdown
**状态迁移 = `git mv` 换目录**（K3 §4.2 原文）。目录名即状态，头字段「状态」与所在目录一致，物理 grep 可对账，不靠解析文件内容。
```

无：proposed→implemented 门槛（task-state 状态 ∈ {impl_done, audited}？commit 存在？）、implemented→archived 触发（被新 Note 替代？超期不活跃？）、rejected 语义（否决后保留理由，防重蹈）。README 全文 grep 无"门槛/触发/归档/否决"语义定义。

### 3.4 缺陷 C（P2）: AGENTS.md 铁律速览未引用 Notes

AGENTS.md 全文 grep `memory/notes` 零命中；`memory/` 仅 Q1 调研模板一行（"c) memory/ 里我们犯过的错"，AGENTS.md:214）。铁律速览（顶部"每次工作前必读"）与 Notes 体系完全脱节——开发者在铁律里看不到"决策要写 Note"的指引。

### 3.5 缺陷 D（P2）: 存量僵尸（D472 Note 未迁移）

`memory/notes/proposed/2026-08-22-d472-notes-lifecycle.md` 头状态 `状态: proposed`（read 实测 L3），但 `task-state/D472.json` status=`audited`（read 实测）。check-notes-lifecycle.sh 的 extract_d_id（:52-60）双模式（中文 `任务: DXXX`/`相关 D#: DXXX` + 英文 `^(name|class|description):` 的 D\d+）对该 Note 均不命中（其头为中文四字段 状态/日期/决策/理由，正文提及 D395/D406/D472 但不含 `任务: DXXX` 模式）→ 僵尸漏网。D472 迁移门禁交付时该 Note 是"进行中提议"（D472 未完成），D472 完成后未回迁——存量规整的典型对象。

## 4. What We Build

### 4.1 写集 (4 修改 + 1 新建 + 1 迁移)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/commit-msg-check.sh](scripts/commit-msg-check.sh) | 修改 | 缺陷 A：D395-a 触发面扩展——`CT_ORCH_TOUCHED` 正则从 `^(scripts/control-tower/|src/orchestrator/)` 扩展为治理脚本区 + 规则文档区（见 §4.2 修复模式）；提示文案同步更新 |
| [memory/notes/README.md](memory/notes/README.md) | 修改 | 缺陷 B：补"四态迁移语义"完整节——proposed→implemented 门槛 / implemented→archived 触发 / rejected 语义 / 非平凡变更定义（见 §4.3） |
| [AGENTS.md](AGENTS.md) | 修改 | 缺陷 C：铁律速览"每次工作前必读"区追加 Notes 引用行（合并而非替代，见 §4.4） |
| [memory/notes/implemented/2026-08-22-d472-notes-lifecycle.md](memory/notes/implemented/2026-08-22-d472-notes-lifecycle.md) | 迁移 | 缺陷 D：`git mv` proposed→implemented + 头字段 `状态: implemented`（D472 audited = 落地，存量规整） |
| [tests/control-tower/commit-msg-note-mandatory.test.sh](tests/control-tower/commit-msg-note-mandatory.test.sh) | 新建 | 触发面扩展测试（U7/CT-40 配对：commit-msg-check.sh ↔ 同名测试；≥8 用例见 §5；⚠️ 与 D533 renormalize 共享 tests/control-tower/ 目录，S-7/S-8 标注） |
| [docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D534-notes-four-state-mechanism-20260826.md](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D534-notes-four-state-mechanism-20260826.md) | 新建 | 本 spec（dev doc） |

### 4.2 修复模式 A — commit-msg-check.sh 触发面扩展（L127 替换）

```bash
# D534: 非平凡变更定义 = 治理脚本区 + 规则文档区（D395-a 仅 control-tower/orchestrator，
# 扩展补 scripts/workflow/ + scripts/hooks/ + 铁律/规则文档——决策密集区全覆盖）
# 排除测试文件（*.test.sh 是测试产物，不承载决策）与纯文档（docs/ 前缀）
CT_ORCH_TOUCHED=$(echo "$STAGED_LIST" | grep -E '^(scripts/(control-tower|workflow|hooks)/|src/orchestrator/|AGENTS\.md$|CLAUDE\.md$|memory/notes/README\.md$)' | grep -vE '\.test\.sh$' || true)
```

**语义**：非平凡变更 = ① 控制塔/工作流/hooks 治理脚本（改行为与流程）② src/orchestrator（D395-a 原有）③ AGENTS.md/CLAUDE.md（铁律与角色宪法）④ memory/notes/README.md（四态规则本身）。排除 `*.test.sh`（测试产物，非决策）。**不扩 src/ 其余区域**（产品核心区有自己的 D# 流程与 brief 体系，见 §6 不做——防跨线负担，S-12 记录）。

**接线**：触发面变量名 `CT_ORCH_TOUCHED` 保持（避免 D395-a 测试依赖断裂——`tests/control-tower/commit-msg-consistency.test.sh` 可能断言该名）；仅改正则 + 提示文案（"治理脚本区"措辞更新）。

### 4.3 修复模式 B — README 四态迁移语义（memory/notes/README.md 新增节）

```markdown
## 四态迁移语义（D534 补全，2026-08-26）

| 迁移 | 门槛/触发 | 判定（物理可验证） |
|------|-----------|-------------------|
| proposed → implemented | 决策**落地**：task-state 对应 D# 状态 ∈ {impl_done, audited}（实现已提交+审计通过），或决策被采纳执行 | `task-state/D#.json` grep status + 头字段 `状态: implemented` 与目录一致 |
| implemented → archived | 决策被**替代**（新 Note 明确取代）或**超期不活跃**（>60 天无 commit 引用，人工判定） | git mv + 头字段 `状态: archived`；被替代时新 Note 引用旧 Note 路径 |
| proposed → rejected | 提案被**否决**（评审/实践否决） | git mv + 头字段 `状态: rejected` + 理由节保留否决原因（防重蹈） |
| rejected → 恢复 | 决策被重新采纳 | git mv 回 proposed/ 重新走流程（极少见，留规则） |

**非平凡变更定义**（D534）：改 `scripts/{control-tower,workflow,hooks}/`、`src/orchestrator/`、`AGENTS.md`/`CLAUDE.md`、`memory/notes/README.md` 的 commit 必须引用 Note（commit-msg 物理门禁，见 scripts/commit-msg-check.sh）。测试文件（*.test.sh）与纯文档（docs/）不属非平凡。
```

### 4.4 修复模式 C — AGENTS.md 铁律引用（合并而非替代）

在 AGENTS.md 顶部"⚠️ 每次工作前必读 — 铁律速览"块尾追加一行（不修改任何现有铁律条目）：

```markdown
**铁律 49（D534 新增）. 决策必须沉淀。** 非平凡变更（治理脚本/铁律/规则文档）的 commit 必须引用 memory/notes/ 四态 Note（commit-msg 物理门禁）；新决策写 proposed/，落地 git mv 到 implemented/，否决 rejected/，过时 archived/。规范见 `memory/notes/README.md`。
```

> 注意：铁律速览编号现有 0-48 有跳号（如缺 3/6/10 等），新条目用 49 不与现有冲突（grep 实测 AGENTS.md 无"铁律 49"）。**不修改任何现有铁律条目**（施工图"合并而非推翻"）。

### 4.5 修复模式 D — 存量规整（git mv + 头字段）

```bash
git mv memory/notes/proposed/2026-08-22-d472-notes-lifecycle.md memory/notes/implemented/2026-08-22-d472-notes-lifecycle.md
# 编辑头字段: `状态: proposed` → `状态: implemented`（与目录一致，门禁可对账）
```

proposed/ 其余 2 文件保留：`2026-08-18-tool-cordis-preset-mutex-*.md`（无 D# 的真实提议，放行）+ `MEMORY.md`（索引，check-notes-lifecycle.sh:68 跳过逻辑）。

### 4.6 不做的事

| 不做 | 原因 |
|------|------|
| 扩触发面到 src/ 全部 | 产品核心区有 D#+brief 体系（D328/G12），强制 Note 会跨线负担（Win Claude 区）；非平凡聚焦治理层（S-12 决策记录） |
| 自动 git mv（脚本代做迁移） | D472 原则：迁移是**人的决策**（提案是否落地/否决），脚本只检查+阻断 |
| 改 check-notes-lifecycle.sh 僵尸判定 | 该门禁 D472 已交付+audited；D534 不重复改（存量僵尸用 git mv 手动规整，不扩提取逻辑——D472 Note 无 D# 头是历史格式，人工迁移即可） |
| 改 pre-commit-check.sh / 新增门禁组 | 非平凡强制已由 commit-msg hook 承载（D395-a 落点），pre-commit 组 6 已有 check-notes-lifecycle 接线；不新增门禁组（派单防膨胀） |
| 改 rejected/ 语义之外的 rejected 存量 | rejected 目录当前为空（0 文件）——尚无否决案例，语义文档化即可，不造存量 |
| 改 archived/ 21 个旧文件正文 | D395-a 已归档，正文不改（保留可追溯） |
| 修改现有铁律条目内容 | 施工图"合并而非替代"，只追加引用行 |

## 5. Test Requirements（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建 `tests/control-tower/commit-msg-note-mandatory.test.sh`，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| L1 触发面：暂存 `scripts/workflow/task-start.sh` + message 无 Note → exit 1（阻断） | 触发面不含 workflow → 放行 | 触发 → 阻断 |
| L1 触发面：暂存 `scripts/hooks/hook-block-write.sh` + message 无 Note → exit 1 | 不含 hooks → 放行 | 阻断 |
| L1 触发面：暂存 `AGENTS.md` + message 无 Note → exit 1 | 不含 AGENTS.md → 放行 | 阻断 |
| L1 触发面：暂存 `memory/notes/README.md` + message 无 Note → exit 1 | 不含 README → 放行 | 阻断 |
| L1 回归：暂存 `scripts/control-tower/staging_guard.py` + message 无 Note → exit 1 | 原触发面（已拦） | 仍拦（回归） |
| L1 排除：暂存 `scripts/workflow/test-helper.test.sh`（.test.sh）+ message 无 Note → exit 0（放行） | — | 放行（测试产物不强制） |
| L1 排除：暂存 `docs/synova/coordination/xxx.md` + message 无 Note → exit 0 | — | 放行（纯文档） |
| L1 通过：暂存 `scripts/workflow/task-start.sh` + message 含 `memory/notes/implemented/2026-08-17-d406-lessons-channel.md` → exit 0 + 文件存在校验过 | — | 通过 |
| L1 降级：message 含 memory/notes/ 但引用的 Note 文件不存在 → exit 1（D395-a 已有逻辑回归） | — | 仍拦（回归） |
| L1 边界：无暂存文件 → exit 0（跳过） | — | 跳过（回归） |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | bash 单元 | ≥10 | 上述 10 用例（触发面扩展 4 + 回归 3 + 排除 2 + 降级/边界 2——含失败模式 S-5：触发面漏配/broken 正则/Note 文件缺失） |
| L2a | 接线 | 1 | commit-msg-check.sh 生产触发面 grep 断言（见 §6） |

## 6. Wiring Verification

| 新 export/函数 | 生产调用点 | 确认方式 |
|---------------|-----------|---------|
| commit-msg-check.sh 扩展触发面 | .git/hooks/commit-msg → scripts/commit-msg-check.sh（生产路径） | `grep -n "workflow|hooks" scripts/commit-msg-check.sh` 命中触发面正则（非仅注释） |
| AGENTS.md 铁律 49 | AGENTS.md 铁律速览区（SessionStart/PreToolUse 注入路径） | `grep -n "铁律 49" AGENTS.md` 命中 |
| README 迁移语义节 | memory/notes/README.md（开发者查规范入口） | `grep -n "四态迁移语义" memory/notes/README.md` 命中 |

> 生产调用点必须（S-3）：commit-msg-check.sh 由 git commit-msg hook 真实调用（`grep -rn "commit-msg-check" .git/hooks/ scripts/ 配置处`——hook 由 `npm run hooks:install` 安装，settings.json/package.json 引用）；测试调用不计。

## 7. Test Requirements（契约明细，铁律 47/48）

### 7.1 L1 单元契约 — commit-msg-note-mandatory.test.sh（≥10 用例）

- 正常路径：workflow/hooks/AGENTS.md/README 触发 → 无 Note 阻断；有 Note + 文件存在 → 通过
- 降级路径：Note 引用文件不存在 → exit 1（D395-a 逻辑回归）；resolver python 不可用 → fail-open 显式提示（commit-msg-check.sh:78-80 现有逻辑回归）
- 边界条件：`.test.sh` 排除 / docs/ 排除 / 空暂存跳过
- 失败模式覆盖（S-5）：触发面漏配（workflow 不触发 = red）/ 正则误伤（.test.sh 被拦 = red）/ Note 缺失（引用不存在的文件 = red）

### 7.2 L2a 接线契约

- commit-msg-check.sh 触发面正则含 `scripts/(control-tower|workflow|hooks)/` + `AGENTS\.md`（grep 断言）
- commit-msg hook 生产安装路径引用 commit-msg-check.sh（grep 断言）

### 7.3 L2b 降级契约

- message 含 memory/notes/ 但引用文件不存在 → exit 1 + 点名文件（D395-a :145-151 现有逻辑）
- 非平凡变更 + python 不可用 → resolver fail-open 显式提示（不静默，铁律 24/31）

### 7.4 L2c 边界契约

- 空暂存 → exit 0（D395-a :57 现有逻辑）
- `.test.sh` 文件 → 放行（测试产物非决策）
- merge 提交（MERGE_HEAD）→ 跳过（commit-msg-check.sh:10-13 D513 现有逻辑，回归）

## 8. Architecture Layer

**L0（工程治理/开发侧）+ hooks 注入层**。依据：
- `memory/notes/` 是治理资产（施工图 §3.3 🟡 搬走"铁律 + memory/ + task-brief 体系"），不属于 L1-L5 任何一层
- `commit-msg-check.sh` 是 git commit-msg hook（开发侧工具链）
- `AGENTS.md` 是开发行为宪法（开发侧）
- 不触碰 src/ L1-L5 任何业务代码（src/orchestrator 仅触发面正则引用，不改该目录文件）

## 9. Completion Standard（DS 与 dev doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. DS1: `tests/control-tower/commit-msg-note-mandatory.test.sh` 全过（≥10 用例；red 已证——workflow 触发在修复前放行）
2. DS2: 触发面扩展——`grep -n "control-tower|workflow|hooks" scripts/commit-msg-check.sh` 命中触发面正则（非仅注释）
3. DS3: workflow 触发实测——构造暂存 `scripts/workflow/task-start.sh` + message 无 Note → commit-msg-check exit 1
4. DS4: AGENTS.md/CLAUDE.md/README 触发——同法实测 exit 1
5. DS5: `.test.sh` 排除——暂存 `scripts/workflow/xxx.test.sh` + 无 Note → exit 0（不误伤测试产物）
6. DS6: 回归——control-tower 触发仍拦（D395-a 行为不变）；D513 merge 跳过不变
7. DS7: README 四态迁移语义节存在——`grep -n "四态迁移语义\|非平凡变更定义" memory/notes/README.md` 命中（含门槛/触发/rejected 三态表格）
8. DS8: AGENTS.md 铁律 49——`grep -n "铁律 49" AGENTS.md` 命中；现有铁律条目零修改（`git diff AGENTS.md` 仅追加行）
9. DS9: 存量规整——`ls memory/notes/implemented/ | grep d472` 命中；`grep -c "状态: proposed" memory/notes/proposed/*.md` 仅剩 1（tool-cordis，真实提议）+ MEMORY.md 索引
10. DS10: 零回归——`bash scripts/control-tower/baseline-check.sh` 无新增失败；commit-msg 相关既有测试（commit-msg-consistency / notes-four-state）全绿
11. DS11: 写集一致——`git diff --name-only HEAD^` 与 §4.1 写集一致，无越界文件
12. DS12: 无绕过——pre-commit 13 组全过、bypass.log 无 `--no-verify`；提交走 synova-commit（禁 git stash，铁律 0-3）
13. DS13: 完成报告含决策记录（§4.6 触发面范围/迁移语义/铁律 49 编号的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS13 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项。

## 10. Auth Doc References

- [派单 Stage1续](docs/synova/coordination/派单-Stage1续-D534-D535-20260825.md)（D534 节：必答题/验收/写集约束）
- [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§3.3 / §5.3）
- [D395-a dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D395a-notes-four-state-20260816.md)（§4.5 决策 D）
- [D472 dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D472-notes-lifecycle-hardening-20260822.md)（§4.1/§4.3）
- [dsh-agent-instructions state.d.ts](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-instructions/lib/types/state.d.ts)（范式借鉴：状态机+迁移语义，不引代码）
- [memory/notes/README.md](memory/notes/README.md) / [commit-msg-check.sh](scripts/commit-msg-check.sh) / [check-notes-lifecycle.sh](scripts/control-tower/check-notes-lifecycle.sh) / [hook-check-memory.sh](scripts/hooks/hook-check-memory.sh)
- AGENTS.md 铁律 0-2/11/24/31/35/48
- TASK-ROUTING.md §四（Stage 1 归 Mac DSH）+ §一（scripts/control-tower 归 DSH）

## 11. 自检清单

- [x] commit-msg-check.sh 触发面实测（:127 正则仅 control-tower/orchestrator，grep 实证）
- [x] README 迁移语义缺失实测（:16-18 仅一行 git mv，全文 grep 无门槛/触发/归档语义）
- [x] AGENTS.md 无 Notes 引用实测（grep memory/notes 零命中；铁律速览无 49 号）
- [x] 存量僵尸实测（proposed/2026-08-22-d472-notes-lifecycle.md 头 proposed + D472 audited；extract_d_id 双模式不命中 → 漏网）
- [x] D472 dev doc §4.3"不改 commit-msg 引用门禁"核对——D534 是后续任务扩展触发面（阶段化推进，非 D472 范围违反）
- [x] 测试 red→green 覆盖失败模式（S-5：触发面漏配/正则误伤/Note 缺失）
- [x] 决策参考已记录（§4.6 触发面范围/迁移语义/铁律编号，S-12）
- [x] DS 与 dev doc 一一对应（DS1-DS13）；写集表标题紧跟表头（D381 格式契约）
- [x] 与 D535 写集零交集；⚠️ tests/control-tower/ 与 D533（renormalize）共享目录已标注（S-7/S-8）
- [x] 不是凭记忆；不用 --no-verify
