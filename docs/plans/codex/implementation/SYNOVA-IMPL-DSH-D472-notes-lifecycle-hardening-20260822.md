---
north-star:
  服务用户: 开发线全体（CTO/DSH/Claude/Codex）+ 未来实现者——D395-a 已建四态目录，但"proposed→implemented 迁移"只靠自觉，proposed 堆积即腐化
  服务场景: 决策 Note 写完 proposal 后无人强制迁移——proposed/ 堆积"提议了但没落地"的僵尸条目；hook 注入读全目录，archived/rejected 的旧教训也注入进新任务上下文（噪音 + 误导）
  模块终态: memory/notes/ 四态闭环：新决策写 proposed → 实现落地必须 git mv 到 implemented（物理门禁强制）→ 过时归档 archived / 否决 rejected；hook 注入只读 proposed+implemented（活教训），archived/rejected 零注入——决策可沉淀、可检索、不腐化
  对齐北星: PRODUCT-BRIEF.md §七「我犯过的错」（跳过程序/硬编码/不检查数据源 = 决策不沉淀）+ §八.3「决策建议——读取 memory/ 历史教训」——把"教训注入"从"读全目录"升级为"读活态"
  完成标准: 入口 PreToolUse hook 注入 → 处理 只读 proposed+implemented 态 Note → 结果 archived/rejected 零注入 + proposed 超龄迁移被门禁拦截（grep 可查）
  当前进度: D395-a 已交付四态目录+四字段头+commit-msg 引用门禁；D406 已修 check-lessons-learned 改向 proposed/。缺口：① hook 读全目录无四态过滤（archived 教训注入）② proposed→implemented 迁移无物理门禁（靠自觉）③ lessons 字段与 README 四字段头契约不一致
---

<!--
  SYNOVA-IMPL-DSH-D472: Agent Notes 四态铁律结构化（Stage1 D2，借鉴 B4）
  状态: dev doc | 2026-08-22 | 优先级 P1（Stage1 序 2）
  权威文档: 派发 Stage1-派发-devdoc-20260821.md Spec 2 + 施工图 DOC-0114 §5.3/§6 + 借鉴清单 B4 + K3 咨询 §4.2（D395-a 锚点）
  依赖: D395-a（四态目录已建）/ D406（lessons 改向 proposed）——本任务在其上补"迁移门禁 + 注入过滤 + 字段契约对齐"
  并行: 与 D474（D3 snapshot，原 D470 改号）/ D473（D4 guard）零文件交集（memory/notes/ + scripts/hooks/ + scripts/check-lessons-learned.sh + pre-commit-check.sh 组 6 区域）；D471（D1）涉及 src/store 属 Win 区域，本任务不碰
-->

# SYNOVA-IMPL-DSH-D472: Agent Notes 四态铁律结构化

> 一句话问题: D395-a 建好了四态目录和 Note 引用门禁，但**生命周期是断的**——① `hook-check-memory.sh` 用 `find "$MEMORY_DIR" -name "*.md"` 读整个 memory/ 目录，archived/ 里的旧教训照样注入新任务上下文（M7 噪音 + 误导）；② proposed→implemented 迁移只有 README 一行字（"状态迁移 = git mv"），无物理门禁，proposed/ 堆积"提议了没落地"的僵尸条目；③ `check-lessons-learned.sh` 写 10 字段头，README 契约是 4 字段头，两套字段并跑 = 漂移。借鉴 DSH `.agents/notes` 四态（B4）的"实现落地必须迁移"纪律，把生命周期补成闭环。

## 1. Authority Doc Verification

**来源**: [Stage1 派发文档](docs/synova/coordination/Stage1-派发-devdoc-20260821.md)（Spec 2 / D2）

> Spec 2：D2 Agent Notes 四态（借鉴 B4）。落地对象 `memory/notes/`（四态目录已存在）+ 铁律结构化；补缺口 S5-3（每次诊断沉淀）；验收：四态结构 + 铁律强制（proposed→implemented 迁移规则）。归属治理层，Mac DSH（已有 D395-a 雏形，spec 需对齐现状不重复造）。

**来源**: [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§5.3 自进化 E2 前置 + §3 🟡 搬走）

> 铁律 + memory/ + task-brief 体系 → DSH Agent Notes 四态（proposed/implemented/archived/rejected）。三个接缝在 Stage 1 就建好，E2/E3 将来直接插上。

**来源**: [第六章借鉴清单 B4](docs/synova/research/Harness研究与Synova战略再定位-20260816/第六章-借鉴清单与走出自己的特色-20260816.md)（6.1 表 B4 行）

> Agent Notes 四态记忆（proposed/implemented/archived/rejected）——知识沉淀结构化——补 S5-3 的"每次诊断沉淀"。落地方式：Synova 的 memory/ + 铁律 → 结构化四态。

**来源**: [D395-a dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D395a-notes-four-state-20260816.md)（§4.5 决策 D：commit-msg hook 查 commit message）

> 门禁落点决策：commit-msg hook 查 commit message（pre-commit 无法读到最终 message）。本任务沿袭此落点，新增的"迁移门禁"挂 pre-commit 组 6 区域（物理检查目录状态，不依赖 message）。

**来源**: [AGENTS.md 铁律](AGENTS.md)（35 自动化优先 / 48 测试非空壳 / 0-2 测试先行）

> 铁律 35: 能变 check-*.sh 的不靠 review。迁移门禁 = 把"靠自觉 git mv"变成"物理 grep 检查"。

## 2. Problem Statement

C 线 S5-3（知识沉淀）当前是 ✅ 保持态（每次诊断沉淀），但开发组织侧的四态生命周期有 3 个断点，直接导致"沉淀了但腐化"：

1. **注入污染（M7 噪音）**：`scripts/hooks/hook-check-memory.sh:21` 定义 `MEMORY_DIR="$ROOT/memory"`，`:58` `find "$MEMORY_DIR" -name "*.md"` 扫全目录——包括 `memory/notes/archived/`（20 个旧教训）和 `rejected/`。这些是**历史/否决**决策，注入到当前任务上下文 = 把"已过时的教训"当"现行教训"用。
2. **迁移无门禁（僵尸 proposed）**：`memory/notes/README.md:16-18` 写了"状态迁移 = git mv 换目录"，但**没有任何脚本检查** proposed/ 里是否有"实现已落地但没迁移"的条目。`memory/notes/proposed/` 现状 3 个文件（2026-08-17 两条 + 2026-08-18 一条），其中 `2026-08-17-test-d406.md` 是测试残留（`desc` 占位），无人清理——proposed 堆积即腐化。
3. **字段契约分裂**：README 四字段头契约是 `状态/日期/决策/理由`（`memory/notes/README.md:22-30`），但 `check-lessons-learned.sh:46-55` 写的是 `status/date/name/class/constraint/expected/severity/occurrences/first_seen/description` 十字段英文头——两套 schema 并跑，README 的"状态字段与目录一致"对账对不上英文头文件。

对齐北星：PRODUCT-BRIEF §七（我的错=跳过程序/不检查数据源——教训要能注入才能防再犯）+ §八.3（决策建议读取 memory/ 教训）。注入污染的后果是**把旧的过时教训当现行教训**，直接破坏"防再犯"机制的可信度。

## 3. Current State（2026-08-22 grep/read 实测）

### 3.1 已存在（D395-a/D406 交付，复用不重造）

| 资产 | 位置 | 状态 |
|------|------|------|
| 四态目录 | `memory/notes/{proposed,implemented,archived,rejected}/` | ✅ 存在（implemented 24 条 / proposed 3 条 / archived 20 条 / rejected 空） |
| 四字段头契约 | `memory/notes/README.md:22-30` | ✅ 存在（状态/日期/决策/理由） |
| git mv 迁移规则 | `memory/notes/README.md:16-18` | ⚠️ 有文字无门禁 |
| Note 引用门禁 | `scripts/commit-msg-check.sh:111-146` | ✅ 改 control-tower/orchestrator 的 commit 须引用 Note（D395-a） |
| lessons 写入通道 | `scripts/check-lessons-learned.sh:46-55` | ⚠️ 已改向 proposed/（D406）但字段为英文十字段 |

### 3.2 缺陷 A（P1）: hook 注入读全目录，archived/rejected 零过滤

`scripts/hooks/hook-check-memory.sh:21` + `:58`（grep 实测）：

```bash
MEMORY_DIR="$ROOT/memory"
...
done < <(find "$MEMORY_DIR" -name "*.md" -type f 2>/dev/null || true)
```

`find memory/ -name "*.md"` 递归扫到 `memory/notes/archived/2026-08-*.md`（20 个旧教训）+ `rejected/`（如有）。注入逻辑无四态过滤——archived 的"历史决策"和 proposed/implemented 的"现行决策"一起进上下文。K3 咨询 §4.2 原文"archived/rejected 不注入"（D395-a dev doc §4 用例 8 的语义）未落地。

### 3.3 缺陷 B（P1）: proposed→implemented 迁移无物理门禁

`memory/notes/README.md:16-18` 只有规则文字；全仓 grep 无任何脚本检查 `proposed/` 滞留（`grep -rn "proposed.*implemented\|implemented.*proposed" scripts/` 仅命中 check-lessons-learned 写入路径与 generate-task-brief 模板字段）。proposed/ 现状 3 文件含 1 条测试残留（`2026-08-17-test-d406.md`，`desc` 占位）——无门禁 = 僵尸条目永不清零。

### 3.4 缺陷 C（P2）: 字段契约分裂

README 契约：`状态/日期/决策/理由`（中文四字段，`memory/notes/README.md:22-30`）；check-lessons-learned 写入：`status/date/name/class/constraint/expected/severity/occurrences/first_seen/description`（英文十字段，`scripts/check-lessons-learned.sh:46-55`）。README 的"状态字段与目录名一致（门禁可 grep 对账）"对英文头文件失效——两套 schema 无法统一 grep。

## 4. What We Build

### 4.1 写集 (4 修改 + 3 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/hooks/hook-check-memory.sh](scripts/hooks/hook-check-memory.sh) | 修改 | 注入四态过滤：只读 `memory/notes/proposed/` + `memory/notes/implemented/`；archived/rejected/README.md/MEMORY.md 零注入（缺陷 A） |
| [scripts/check-lessons-learned.sh](scripts/check-lessons-learned.sh) | 修改 | 写入头对齐 README 四字段契约：头字段改为 `状态/日期/决策/理由` + 保留 `name/class/constraint/expected/severity/occurrences/first_seen/description` 扩展字段（兼容已有 4 条 proposed Note 的解析——改头不改扩展，缺陷 C） |
| [scripts/control-tower/check-notes-lifecycle.sh](scripts/control-tower/check-notes-lifecycle.sh) | 新建 | 迁移门禁：扫 `proposed/` 中实现已落地但未迁移的僵尸条目（判定规则见 §4.3），输出清理清单 + exit 1 阻断（缺陷 B） |
| [scripts/pre-commit-check.sh](scripts/pre-commit-check.sh) | 修改 | 组 6（Task Brief）区域追加调用 `check-notes-lifecycle.sh`（条件触发：memory/notes/proposed/ 有变更时跑，其余跳过 <1s；缺陷 B 接线） |
| [tests/control-tower/check-notes-lifecycle.test.sh](tests/control-tower/check-notes-lifecycle.test.sh) | 新建 | 迁移门禁 + 字段契约测试（U7/CT-40 配对：门禁脚本 ↔ 同名测试，≥10 用例，见 §5） |
| [tests/control-tower/hook-check-memory.test.sh](tests/control-tower/hook-check-memory.test.sh) | 新建 | hook 注入过滤测试（U7/CT-40 配对：hook 脚本 ↔ 同名测试：archived 零注入 + implemented 注入 + 无 brief 跳过） |
| [memory/notes/README.md](memory/notes/README.md) | 修改 | 补"迁移门禁"小节：proposed 落地后必须 git mv 的强制说明 + 门禁命令 + 字段契约统一说明（对齐 check-lessons-learned 扩展字段） |

### 4.2 修复模式

**hook 注入过滤（替换 L21 的 MEMORY_DIR 指向 + L58 find 范围）**:

```bash
# 只读活态: proposed + implemented；archived/rejected/索引零注入（K3 §4.2 "archived/rejected 不注入"）
MEMORY_DIR="$ROOT/memory/notes"
# L58 改为:
done < <(find "$MEMORY_DIR/proposed" "$MEMORY_DIR/implemented" -name "*.md" -type f 2>/dev/null || true)
```

**迁移门禁 check-notes-lifecycle.sh（新建，契约三态）**:

```bash
# 契约:
#   @input  — 无参数；扫描 $ROOT/memory/notes/proposed/
#   @output — 僵尸 proposed 清单（实现已落地但未 git mv）+ 修复指引
#   @exit   — 0 = 无僵尸 / 1 = 有僵尸（阻断，需 git mv 或删除后重提）
#   @degraded — 目录不可读 → exit 2 + stderr（铁律 11 显式降级，不静默）
#   @error  — 非 UTF-8 / 无读权限 → .code + stderr
# 僵尸判定（2026-08-22 修正——兼容现有 Note 双格式头）:
#   ① 提取 D#：优先中文头 "任务: DXXX" / "相关 D#: DXXX"；
#      兼容英文头（check-lessons-learned 写入）: name:/class:/description: 中匹配 D\d+（如
#      "name: D406 lessons-learned 通道改向" → D406；"class: D406_M7" → D406）
#   ② 判定：提取到 D# 且 task-state/D#.json 存在且 status ∈ {impl_done, spec_done}（实现已落地）
#      → 判定"实现已落地，提案未迁移"→ 列僵尸清单
#   ③ 其余（无 D# 引用 / D# 未 impl/未 spec）→ 视为真实进行中提议，不阻断（放行）
#   实测锚点：memory/notes/proposed/2026-08-17-d406-lessons-channel.md 头含
#   "name: D406 lessons-learned 通道改向" + task-state/D406.json status=impl_done
#   → 该 Note 是僵尸（应 git mv 到 implemented/）——本规则的真实命中样例
```

**字段契约统一（check-lessons-learned.sh 头模板，改头字段保留扩展）**:

```markdown
---
状态: proposed            # ← README 契约字段（原 status:）
日期: ${TODAY}            # ← 原 date:
决策: ${NAME}             # ← 原 name:（一句话决策）
理由: ${DESCRIPTION}      # ← 原 description:（为什么这样决策）
# 扩展字段（check-lessons-learned 专用，保留兼容）:
name: ${NAME}
class: ${CLASS}
constraint: "${CONSTRAINT}"
expected: ${EXPECTED}
severity: warn
occurrences: 1
first_seen: ${TODAY}
---
```

### 4.3 不做的事

| 不做 | 原因 |
|------|------|
| 改 commit-msg-check.sh 的 Note 引用门禁 | D395-a 已交付且审计过，本任务不碰 |
| 自动 git mv（脚本代做迁移） | 迁移是**人的决策**（提案是否落地/否决），脚本只检查+阻断，不替人判断 |
| 迁移 archived/rejected 的 20 个旧教训内容 | D395-a 已归档，正文不改（保留可追溯） |
| 给非 memory/notes/ 的 commit 加迁移门禁 | 门禁只在 proposed/ 有变更时触发（条件跳过 <1s） |
| 改 generate-task-brief.py Q1d 字段 | D395-a 已交付，本任务不碰 |
| 清理 `2026-08-17-test-d406.md` 测试残留 | 那是 D406 的测试产物，归属 D406 线；本任务门禁会暴露它，由实现者顺手归档（标注，不强制） |

## 5. Test Requirements（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建 `tests/control-tower/check-notes-lifecycle.test.sh`，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| L1 注入过滤：archived/ 下 Note 不注入（构造 memory/notes/archived/X.md 含关键词 → hook 输出不含它） | hook 读全目录 → 注入 | 零注入 |
| L1 注入过滤：implemented/ 下 Note 正常注入 | 全目录读（含 archived） | 只读 proposed+implemented，implemented 命中 |
| L1 迁移门禁：构造 proposed/ 含中文 `任务: DXXX` + task-state/DXXX.json impl_done → exit 1 + 清单点名 | 无脚本 | exit 1 + 点名 |
| L1 迁移门禁：**英文头兼容**——`name: D406 lessons-learned 通道改向` + task-state/D406.json impl_done → exit 1 + 点名（现有 Note 真实格式，2026-08-22 修正） | 无脚本 | exit 1 + 点名 |
| L1 迁移门禁：proposed/ 无 D# 引用 → exit 0（真实提议放行，不误杀） | 无脚本 | exit 0 |
| L1 迁移门禁：proposed/ 空 → exit 0（边界） | 无脚本 | exit 0 |
| L1 迁移门禁：task-state/ 不可读 → exit 2 degraded（不静默 pass） | 无脚本 | exit 2 + stderr |
| L1 字段契约：check-lessons-learned 新写 Note 头含 `状态:` 且与目录一致 | 写 status: 英文头 | 含 `状态: proposed` + 扩展字段保留 |
| L1 字段契约：旧英文头 Note 仍可被 grep 解析（`status:` 兼容） | — | 兼容（回归） |
| L1 回归：commit-msg Note 引用门禁不受影响（改 control-tower 文件 + message 含 memory/notes/ → exit 0） | — | 全绿 |
| L2a 接线：pre-commit 组 6 区域真实调用 check-notes-lifecycle.sh（proposed 有变更时） | 无调用 | grep 命中调用行 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | bash 单元 | ≥10 | 上述 10 用例（正常/降级/边界/注入过滤/字段契约/回归） |
| L2a | 接线 | 1 | pre-commit-check.sh 真实调用 check-notes-lifecycle.sh |

## 6. Wiring Verification

| 新 export/函数 | 生产调用点 | 确认方式 |
|---------------|-----------|---------|
| hook-check-memory.sh 四态过滤 | PreToolUse hook 生产路径（settings.json 挂载） | `grep -n "proposed\|implemented" scripts/hooks/hook-check-memory.sh` 命中 find 范围（非仅注释） |
| check-notes-lifecycle.sh | pre-commit-check.sh 组 6 区域 | `grep -n "check-notes-lifecycle" scripts/pre-commit-check.sh` 命中调用行 |
| check-lessons-learned.sh 四字段头 | PreToolUse hook 教训注入路径 + 手动调用 | `grep -n "^状态:\|^日期:\|^决策:\|^理由:" scripts/check-lessons-learned.sh` 命中模板 |

> 生产调用点必须（S-3）：check-notes-lifecycle 被 pre-commit 真实调用（测试调用不计）；hook 过滤在生产 hook 路径生效。

## 7. Test Requirements（契约明细，铁律 47/48）

### 7.1 L1 单元契约 — notes-lifecycle.test.sh（≥10 用例）

- 正常路径：implemented Note 注入；无僵尸 exit 0
- 降级路径：task-state 不可读 → exit 2 + degraded 显式（不静默 pass）
- 边界条件：空 proposed / 无 D# 引用的提议 / 旧英文头兼容
- 失败模式覆盖（S-5）：archived 注入（broken 过滤）/ 僵尸漏检（broken 门禁）/ 字段对账失败（broken 契约）

### 7.2 L2a 接线契约

- pre-commit-check.sh 组 6 区域在 proposed/ 有变更时调用 check-notes-lifecycle.sh（grep 断言）
- 条件跳过：无 memory/notes/proposed/ 变更 → 软过（保持 pre-commit <10s，V4.5.1 性能纪律）

### 7.3 L2b 降级契约

- check-notes-lifecycle.sh 目录不可读 → exit 2 + stderr "degraded: <原因>"（铁律 11/24，不静默）
- pre-commit 调用失败 → 显式告警不静默吞（铁律 31 降级信号传播）

### 7.4 L2c 边界契约

- proposed/ 空目录 → exit 0（无僵尸）
- 僵尸判定保守 + 双格式兼容：D# 提取命中（中文 `任务:`/`相关 D#:` 或英文 `name:/class:/description:` 中的 D\d+）且 task-state 该 D# ∈ {impl_done, spec_done} 双条件命中才阻断——无 D# 引用或 D# 未完成的提议永远放行（不误杀真实进行中决策）
- 真实锚点：`2026-08-17-d406-lessons-channel.md`（`name: D406 ...` + D406 impl_done）应被判僵尸——现有数据即命中样例

## 8. Architecture Layer

**L0（工程治理/开发侧）+ hooks 注入层**。依据：
- `memory/notes/` 是治理资产（施工图 §3 🟡 搬走"铁律 + memory/ + task-brief 体系"），不属于 L1-L5 任何一层
- `hook-check-memory.sh` 是 PreToolUse 注入点（开发侧工具链）
- `check-notes-lifecycle.sh` 挂 pre-commit 组 6 区域（控制塔门禁体系，`scripts/control-tower/` 归 Mac DSH）
- 不触碰 src/ L1-L5 任何业务代码（src/store 属 Win，D471 范畴）

## 9. Completion Standard（DS 与 dev doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. DS1: `tests/control-tower/check-notes-lifecycle.test.sh` 全过（≥10 用例；red 已证——archived 注入在修复前命中）
2. DS2: hook-check-memory.sh 只读 `memory/notes/proposed/ + implemented/`——`grep -n "proposed\|implemented" scripts/hooks/hook-check-memory.sh` 命中 find 范围
3. DS3: 迁移门禁——构造 proposed 僵尸（中文 `任务: DXXX` + task-state impl_done）→ `bash scripts/control-tower/check-notes-lifecycle.sh` exit 1 + 清单点名
4. DS4: 迁移门禁放行——无 D# 引用 proposed → exit 0（不误杀真实提议）
5. DS5: 迁移门禁降级——task-state 不可读 → exit 2 + stderr degraded（铁律 11/24）
6. DS6: 字段契约——`grep -n "^状态:" scripts/check-lessons-learned.sh` 命中模板；新写 Note 头含 状态/日期/决策/理由
7. DS7: 旧英文头兼容——`status:` 头 Note 仍可被 lessons 去重逻辑解析（回归）
8. DS8: **英文头僵尸命中——`name: D406 lessons-learned 通道改向`（现有真实 Note）→ exit 1 + 点名（2026-08-22 修正：双格式 D# 提取）**
9. DS9: 接线——`grep -n "check-notes-lifecycle" scripts/pre-commit-check.sh` 命中生产调用（测试调用不计，S-3）
10. DS10: 零回归——`bash scripts/control-tower/baseline-check.sh` 无新增失败；pre-commit 13 组全过（含新增调用后 <10s）
11. DS11: 写集一致——`git diff --name-only HEAD^` 与 §4.1 写集一致，无越界文件
12. DS12: 完成报告含决策记录（§4.2 三处模式选择的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS12 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项。

## 10. Auth Doc References

- [Stage1 派发文档](docs/synova/coordination/Stage1-派发-devdoc-20260821.md)（Spec 2 / D2）
- [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§5.3 / §6 Stage 1）
- [第六章借鉴清单 B4](docs/synova/research/Harness研究与Synova战略再定位-20260816/第六章-借鉴清单与走出自己的特色-20260816.md)
- [D395-a dev doc](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D395a-notes-four-state-20260816.md)
- [memory/notes/README.md](memory/notes/README.md)
- [D406 task-state](task-state/D406.json)
- AGENTS.md 铁律 0-2/11/24/31/35/48

## 11. 自检清单

- [x] hook-check-memory.sh 全目录读取实测（L21 MEMORY_DIR + L58 find，grep 实证）
- [x] 迁移门禁缺失实测（全仓 grep 无 proposed→implemented 检查脚本）
- [x] 字段契约分裂实测（README 四字段 vs check-lessons-learned 十字段，read 实证）
- [x] D395-a/D406 已交付资产盘点（复用不重造：四态目录/commit-msg 门禁/Q1d 字段）
- [x] 僵尸判定保守设计（双格式 D# 提取 + 双条件命中才阻断，不误杀真实提议——**2026-08-22 修正：兼容英文头 name:/class:/description: 的 D\d+，真实锚点 D406 Note**）
- [x] 测试 red→green 覆盖失败模式（S-5：archived 注入/僵尸漏检/字段对账）
- [x] DS 与 dev doc 一一对应（DS1-DS12）；写集表标题紧跟表头（D381 格式契约）
- [x] 与 D474（原 D470）/D473/D471 写集零交集（并行安全，S-7/S-8）
- [x] 不是凭记忆；不用 --no-verify

## 12. 复核修复记录（2026-08-22 impl 后独立复核，commit f157dedd）

> 创始人要求交付后批判性复核。复核发现 1 个真实问题并修复（K3 可核）:

1. **CT-34 纯文档豁免绕过迁移门禁（高严重度）**：`memory/notes/proposed/*.md` 命中纯文档白名单（`memory/.*\.md`），只改 Note 文件的提交（新建/修改决策 Note——D472 门禁的核心场景）走 CT-34 早退分支 exit 0，迁移门禁被豁免绕过。修复：CT-34 早退分支内（secrets 通过后）补跑 `check-notes-lifecycle.sh`（`NOTES_TOUCHED_DOC` 条件，<1s 不破坏秒过性能）。实测：模拟纯文档提交 + proposed 僵尸 → 硬阻断（修复前静默 exit 0）。
2. **死变量清理（低）**：`check-notes-lifecycle.sh` 未使用变量 `DEGRADED` 删除（铁律 37）。

> 撞车记录（2026-08-22）：D469 号原被 Win 线 8-21 提交的事件溯源 dev doc（SYNOVA-IMPL-D469-session-event-sourcing）占用且未登记 task-state；本任务取号时分配器发 D469 造成撞号。处理：D469 号留给 Win 文档，本任务改号 D472（分配器重取）；D1 事件溯源由 D471 承接并标注取代 D469 草稿（见 D471 dev doc）。
