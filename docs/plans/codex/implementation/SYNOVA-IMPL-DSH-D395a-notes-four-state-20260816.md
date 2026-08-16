---
north-star:
  服务用户: 开发线全体（CTO/DSH/Claude/Codex——每个"踩过坑才写进 memory/"的教训，以及 LOOP-ENGINEERING 的决策传统，从非结构化文件堆变成可检索、不腐化的四态知识库）+ 未来的实现者（接任务时能查到"这个领域我们裁过什么、为什么"）
  服务场景: 20 个 memory/ 教训文件 + LOOP-ENGINEERING-CHANGELOG 决策传统平铺无结构——新决策写不写、写哪、改不改，全凭自觉。本模块把决策沉淀改造为四态结构（proposed/implemented/archived/rejected），状态迁移 = git mv，物理门禁逼"改控制塔/编排器的决策必须引用 Note"
  模块终态: `memory/notes/{四态}/YYYY-MM-DD-<主题>.md` 四态知识库 + 每条 Note 四字段头（状态/日期/决策/理由）+ pre-commit 门禁对「改 scripts/control-tower/ 或 src/orchestrator/ 的 commit」强制引用 Note 路径——决策可沉淀、可检索、不腐化（强化 M7 防线）
  对齐北星: PRODUCT-BRIEF.md §七「我犯过的错」+ §八.3「决策建议——读取 memory/ 历史教训」——把教训从"写了就忘"变成"物理门禁逼着沉淀 + 可检索"
  完成标准: 入口 四态目录存在 + 旧 20 文件 git mv 归档 → 处理 新决策按四字段头写 Note → 结果 pre-commit 对 control-tower/orchestrator 改动未引用 Note → 阻断（grep 可查）
  当前进度: memory/ 20 个非结构化教训文件平铺（bash32-compat/dual-source-fraud/plan-actual-closure 等），无四态目录，无 Note 引用门禁（K3 咨询 §4.2 拆分后 a 版 1 天）
---

<!--
  SYNOVA-IMPL-DSH-D395a: Agent Notes 四态（开发组织版）— memory/notes/{四态} + 四字段头 + Note 引用门禁
  状态: dev doc | 2026-08-16 | 优先级 P1-现在就做（K3 战略咨询 §4.2 拆分）
  权威文档: K3 战略咨询 2026-08-16-D394-D398-strategy-consult.md §4.2（神/形似神不似/验收锚点，已落 task-state/D395.json）+ AGENTS.md 铁律 35（自动化优先）+ 台账 M7 文档-实现漂移
  依赖: 无（D395-b 产品版取消独立并入 D398，本任务只做开发组织版）
  并行: 无（独占 memory/notes/ + generate-task-brief.py + pre-commit-check.sh 门禁；与 D396/D394/D402 写集零重叠，见 §3.3）
-->

# SYNOVA-IMPL-DSH-D395a: Agent Notes 四态（开发组织版）

> 一句话问题: 20 个 memory/ 教训文件 + LOOP-ENGINEERING-CHANGELOG 决策传统**平铺无结构**——新决策写不写 Note、写进哪个目录、事后改不改，全凭自觉。K3 咨询 §4.2 判定：改造为四态结构 + 四字段头 + 物理门禁，让"开发组织的决策可沉淀、可检索、不腐化"（强化 M7 文档-实现漂移防线）。形似神不似预警：目录建了、旧文件归档了，但新决策不写 Note → 三个月后又是非结构化——防法是物理门禁，不靠自觉。

## 1. 权威文档引用

**来源**: [K3 战略咨询](docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md)（§4.2，锚点已落 [task-state/D395.json](task-state/D395.json)）

> D395-a 开发组织 Notes 四态（memory/notes/{proposed,implemented,archived,rejected}，强化 M7）。**神**：开发组织的决策可沉淀、可检索、不腐化——命中已有 M 类，不新增机制类。**形似神不似预警**：目录建了、20 个旧文件归档了，但新决策不写 Note → 三个月后又是非结构化。防法：pre-commit 对「改 scripts/control-tower/ 或 src/orchestrator/ 的 commit」要求 commit message 引用 Note 路径（物理门禁，不靠自觉）。

**来源**: [审计发现台账](docs/synova/coordination/审计发现台账-DSH-CTO.md)（M7 模式）

> M7 文档-实现漂移（dev doc 未回填/声称未实现）。本任务用"决策可沉淀 + 物理门禁"强化 M7 防线，命中已有 M 类，不新增机制类（K3 明令）。

**来源**: [AGENTS.md 铁律](AGENTS.md)（35 自动化优先）

> 铁律 35: 能变规则的不靠文档，能写 check-*.sh 的不靠 review。Note 引用门禁 = 把"靠自觉写 Note"变成"物理 grep 检查"。

## 2. 代码审计——现状（2026-08-16 grep/read 实测）

### 2.1 现状 A: memory/ 20 个非结构化教训文件平铺

[memory/](memory/) 目录实测 20 个 `.md` 文件（`bash32-compat` / `dual-source-fraud` / `plan-actual-closure` / `grep-semantic-overreach` / `stub-implementation-pattern` 等），**无 `memory/notes/` 子目录**（`ls memory/notes/` → No such file）。文件无统一头部结构，主题/日期/状态混杂在文件名与正文里。

### 2.2 现状 B: 决策传统散落在 LOOP-ENGINEERING-CHANGELOG + brief Q1c

决策参考系记录在 [generate-task-brief.py L109-116](scripts/workflow/generate-task-brief.py:109)（Q1c 决策参考系）与 [LOOP-ENGINEERING-CHANGELOG.md](LOOP-ENGINEERING-CHANGELOG.md)——但**无独立的 Note 载体**，决策写完即沉在 brief/CHANGELOG 里，不可检索、无状态（proposed/implemented/rejected 无法区分）。

### 2.3 现状 C: 无 Note 引用门禁

[pre-commit-check.sh](scripts/pre-commit-check.sh) 组 6（Task Brief）只查 6 核心字段（Q0/Q1/Q2/Q3/架构层/Done）存在性，**无「改 control-tower/orchestrator 必须引用 Note」检查**（grep 实测组 6 无 memory/notes/ 相关断言）。

## 3. 实现方案

### 3.1 写集 (2 修改 + 6 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [memory/notes/README.md](memory/notes/README.md) | 新建 | 四态规范 + 四字段头契约（状态/日期/决策/理由）+ git mv 迁移规则 |
| [memory/notes/proposed/](memory/notes/proposed/) | 新建 | 提议态目录（含 .gitkeep） |
| [memory/notes/implemented/](memory/notes/implemented/) | 新建 | 已实现态目录（含 .gitkeep） |
| [memory/notes/archived/](memory/notes/archived/) | 新建 | 归档态目录——收容 20 个旧 memory/*.md（git mv） |
| [memory/notes/rejected/](memory/notes/rejected/) | 新建 | 否决态目录（含 .gitkeep） |
| [scripts/workflow/generate-task-brief.py](scripts/workflow/generate-task-brief.py) | 修改 | Q1 增加「### d) 相关 Note 引用」字段（占位 `memory/notes/...`，K3 §4.2 L217） |
| [scripts/commit-msg-check.sh](scripts/commit-msg-check.sh) | 修改 | Note 引用门禁（K3 §4.2 L219"commit message 引用 Note 路径"）：改 scripts/control-tower/ 或 src/orchestrator/ 的 commit → commit message 须含 `memory/notes/` 引用 + 引用的 Note 文件真实存在，否则阻断 |
| [tests/control-tower/notes-four-state.test.sh](tests/control-tower/notes-four-state.test.sh) | 新建 | 门禁测试（≥8 用例，见 §4） |

> 20 个旧 memory/*.md 经 `git mv` 归档到 `memory/notes/archived/`（验收锚点"旧文件归档"），不删不改内容，仅迁移位置。

### 3.2 修复模式

**Note 四字段头契约（README.md 固化）**:

```markdown
---
状态: proposed | implemented | archived | rejected
日期: YYYY-MM-DD
决策: <一句话决策>
理由: <为什么这样决策，可多行>
---

<正文：决策上下文 / 触发场景 / 相关 D# / 参考系>
```

**状态迁移 = `git mv` 换目录**（proposed → implemented → archived；或 → rejected）。四态目录名即状态，头字段"状态"与所在目录一致（门禁可 grep 对账）。

**Q1 新增「相关 Note 引用」字段（generate-task-brief.py）**:

```
### d) 相关 Note 引用
- [ ] memory/notes/<四态>/YYYY-MM-DD-<主题>.md（本任务决策沉淀到哪条 Note；无则新建 proposed）
```

**Note 引用门禁（两层，忠实 K3 §4.2 原文）**:

**层 1 — Q1「相关 Note 引用」字段（brief 层，K3 L217）**: 非平凡 brief 的 Q1 增加字段，grep 物理检查引用的 Note 文件真实存在。

**层 2 — commit message 引用 Note 路径（commit 层，K3 L219）**:

```bash
# commit-msg-check.sh 追加: 触发条件 = 本次 commit 改动命中 scripts/control-tower/ 或 src/orchestrator/
# （从 commit 的暂存文件集判定）
# 1. commit message 须含 memory/notes/ 路径引用（grep 物理检查）
# 2. 引用的 Note 文件真实存在（grep -q 该文件路径）
# 任一不满足 → 阻断 commit（exit 1），提示"改 control-tower/orchestrator 的 commit 必须引用 Note"
```

> 条件跳过保持 <1s（ctrl-tower-change 模式 3）：无 control-tower/orchestrator 变更 → 软过，不跑 grep。
> 注：K3 原文写"pre-commit"，但 commit message 在 commit-msg 阶段才最终确定，故物理落点在 commit-msg hook（见 §4.5 门禁落点决策）。

### 3.3 不做的事

| 不做 | 文件 | 归属 |
|------|------|------|
| D395-b 产品版 Notes（客户会话变记忆） | — | **并入 D398**（先看记忆长什么样，K3 定） |
| 改造 LOOP-ENGINEERING-CHANGELOG 本体 | `LOOP-ENGINEERING-CHANGELOG.md` | 保留为历史决策流水；新决策走 Note，不迁移 CHANGELOG |
| 删/改 20 个旧 memory/*.md 内容 | `memory/*.md` | 只 `git mv` 归档，不改正文（保留可追溯） |
| 给非 control-tower/orchestrator 的 commit 加 Note 门禁 | — | 门禁只覆盖"决策密集区"（K3 防法原文），不扩散到全部 commit |
| 改 task-start.sh 本体的 Q1 结构 | `scripts/workflow/task-start.sh` | 只在 generate-task-brief.py 模板加字段（brief 生成入口） |

## 4. 测试要求（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建 `tests/control-tower/notes-four-state.test.sh`，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| 四态目录存在（proposed/implemented/archived/rejected） | 目录不存在 | 四目录存在 |
| 旧 20 文件已归档（memory/*.md 零残留，全在 archived/） | 20 文件平铺 memory/ | memory/ 下仅 notes/ |
| 四字段头校验：新 Note 含 状态/日期/决策/理由 四字段 | 无校验 | 四字段齐全 |
| 状态迁移 = git mv（头字段"状态"与目录名一致） | 无对账 | 一致 |
| 门禁触发：改 control-tower/orchestrator 的 commit + commit message 无 Note 引用 → 阻断（exit 1） | 无门禁 | 阻断 |
| 门禁放行：同上 + commit message 含 memory/notes/ 引用 → 放行（exit 0） | 无门禁 | 放行 |
| Note 文件存在检查：commit message 引用**不存在**的 Note 路径 → 阻断（K3 L217"grep 检查 Note 文件存在"） | 无门禁 | 阻断 |
| 门禁不触发：改 src/l3/ 文件（非 control-tower/orchestrator）→ 不要求 Note | 无门禁 | 跳过（软过） |
| generate-task-brief.py 模板含「### d) 相关 Note 引用」字段 | 无字段 | 字段存在 |
| 回归：commit-msg 原有 Conventional Commits 格式检查不回归 | — | 全绿 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | bash 单元 | ≥10 | 上述 10 用例（正常/降级/边界/门禁触发与放行/Note 存在/回归） |
| L2a | 接线 | 1 | commit-msg-check.sh 真实调用 Note 引用检查 |

## 4.5 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| 状态迁移机制 | A 改文件头字段 / B `git mv` 换目录 | K3 原文"状态迁移 = git mv 换目录" + 第一性原理（目录名即状态，grep 可验，无需解析文件） | **B**——git mv，目录名即状态 |
| Note 载体 | A 复用 LOOP-ENGINEERING-CHANGELOG / B 独立 memory/notes/ 目录 | K3 原文"memory/notes/{四态}" + 第一性原理（CHANGELOG 是流水，Note 是决策条目，两者粒度不同） | **B**——独立四态目录 |
| 门禁范围 | A 全部 commit 强制 Note / B 只 control-tower/orchestrator | K3 防法原文"改 scripts/control-tower/ 或 src/orchestrator/ 的 commit" + Anthropic（最少机制，不扩散噪音） | **B**——只决策密集区 |
| 门禁落点 | A commit-msg hook（查 commit message）/ B pre-commit 组 6（查 brief） | K3 原文"commit message 引用 Note 路径"（§4.2 L219）+ 第一性原理（commit message 在 commit-msg 阶段才最终确定，pre-commit 无法读到） | **A**——commit-msg hook 查 commit message |

> 收敛检查：四决策点两参考系指向同一答案（git mv + 独立目录 + 决策密集区 + commit-msg 查 commit message），无分歧。**参考：Anthropic + 第一性原理**。

## 5. Wiring Verification（接线要求）

| 变更 | 验证 |
|------|------|
| Note 引用门禁被 commit-msg 调用 | `grep -n "memory/notes/" scripts/commit-msg-check.sh` 命中检查行（非仅注释） |
| generate-task-brief.py Q1d 字段 | `grep -n "相关 Note 引用" scripts/workflow/generate-task-brief.py` 命中模板字段 |
| 四态目录落位 | `ls memory/notes/` 含 proposed/implemented/archived/rejected + README.md |
| 旧文件归档 | `ls memory/*.md` 零输出（全在 memory/notes/archived/）；`ls memory/notes/archived/*.md | wc -l` = 20 |
| 门禁触发/放行 | `tests/control-tower/notes-four-state.test.sh` 断言（commit message 无 Note → exit 1；含 Note → exit 0；引用不存在 Note → exit 1） |
| 生产调用点（commit-msg hook） | `grep -rn "commit-msg-check.sh" .git/hooks/commit-msg scripts/` 命中 hook 调用 + Note 检查在 commit-msg-check.sh 内 |

## 6. 完成标准（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. DS1: `tests/control-tower/notes-four-state.test.sh` 全过（≥10 用例；red 已证）
2. DS2: `memory/notes/{proposed,implemented,archived,rejected}` 四目录 + README.md 存在
3. DS3: 旧 20 个 memory/*.md 经 `git mv` 归档到 archived/（`ls memory/*.md` 零输出，archived/ 计 20）
4. DS4: 四字段头契约固化（README.md 含 状态/日期/决策/理由 四字段模板 + git mv 迁移规则）
5. DS5: generate-task-brief.py Q1 含「### d) 相关 Note 引用」字段（`grep -n` 命中）
6. DS6: 门禁触发——改 scripts/control-tower/ 或 src/orchestrator/ 的 commit + commit message 无 Note 引用 → 阻断（exit 1）
7. DS7: 门禁放行——同上 + commit message 含 memory/notes/ 引用 + Note 文件存在 → 放行（exit 0）
8. DS8: Note 文件存在检查——commit message 引用不存在的 Note 路径 → 阻断（K3 L217"grep 物理检查 Note 文件存在"）
9. DS9: 形似神不似防线——门禁是**物理 grep**（不靠自觉），且只覆盖 control-tower/orchestrator（决策密集区），非空壳
10. DS10: 全量审计基线一致 + 无 `--no-verify` + `git diff --name-only` 与写集（§3.1）一致
11. DS11: 完成报告须含**决策记录**（§4.5 四决策点的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；**禁止重编号/跳号/静默缺项**（S-10，D331 审计教训）。

## 7. 自检清单

- [x] K3 咨询 §4.2 神/形似神不似/验收锚点核实（task-state/D395.json 已落；门禁两层 = Q1 字段 L217 + commit message 引用 L219）
- [x] memory/ 20 文件 + 无 notes/ 子目录现场核实（ls 实测）
- [x] commit-msg-check.sh 无 Note 检查现场核实（grep 实测）
- [x] src/orchestrator/ 目录存在性核实（grep 实测，门禁触发路径真实存在）
- [x] 决策参考已记录（§4.5，S-12）：四决策点均走双参考系且收敛
- [x] D395-b 显式排除（§3.3，并入 D398，K3 切片遵守）
- [x] DS 与 dev doc 一一对应（DS1-DS11，S-10）；写集表标题紧跟表头（D381 格式契约）
- [x] 门禁条件跳过保持 <1s（ctrl-tower-change 模式 3，无相关变更软过）
- [x] 不是凭记忆
- [x] 不用 --no-verify
