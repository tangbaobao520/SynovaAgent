---
north-star:
  服务用户: Mac DSH 线开发线程（每天跨机同步文档的协作底座）+ Win Claude 线（跨机文档同步同样受益）+ 创始人（审计报告/协调文档能顺利入库，不再被门禁误拦）
  服务场景: 纯文档提交（docs/、.claude/task-briefs/、memory/ 等）时，pre-commit 不再用代码门禁（task brief/时间戳/测试/接线/架构/契约等 12 组）拦截——文档提交只有跨机同步信息这一目的，不产生代码质量风险；但 Secrets 扫描保留（文档同样泄密）
  模块终态: `scripts/pre-commit-check.sh` 能识别"纯文档提交"，自动豁免 12 组代码向门禁、只跑 Secrets 扫描——文档提交 <10s 直过，代码提交全门禁不变；D362 文档拉平 / D366 审计登记类卡点从根上消失
  对齐北星: PRODUCT-BRIEF.md §四「无限扩展」协作底座 + 台账 CT-34「文档提交豁免严格门禁」（创始人 2026-08-16 决策）
  完成标准: 纯文档提交（仅 .md/.html/docs/ 文件）→ pre-commit 只输出 Secrets 扫描 + 直过；混合提交（含代码文件）→ 12 组全跑；文档含 secret → 仍被拦
  当前进度: 未开始（dev doc 撰写中）。现状：pre-commit-check.sh 13 组无条件全跑，`/tmp/.synova-before-brief` 残留 + G12b brief 可解析性 + 组 1 硬编码数据（.html 扫描）三处对纯文档误拦，D362/D366 反复卡实证
---

<!--
  SYNOVA-IMPL-DSH-D382: 文档提交豁免严格门禁（只保留 Secrets 扫描）
  状态: dev doc | 2026-08-16 | 优先级 P0（台账 CT-34，创始人决策，D362/D366 反复卡实证）
  权威文档: AUDIT-FINDINGS-LEDGER L85（CT-34 创始人决策）+ D382 派活 brief + AGENTS.md 铁律 24/31/38/47/48
  依赖: 无（纯 pre-commit-check.sh 改造，不依赖其他任务落地）
  并行: 无（独占 scripts/pre-commit-check.sh；与 D381 写集（dev-doc-gatekeeper.sh/devdoc_writeset.py）不重叠）
-->

# SYNOVA-IMPL-DSH-D382: 文档提交豁免严格门禁（只保留 Secrets 扫描）

> 一句话问题: `scripts/pre-commit-check.sh` 的 13 组门禁**无条件全跑**，不区分"代码提交"与"纯文档提交"。纯文档提交（docs/ 同步、task brief 登记、审计报告入库）被 3 处代码向门禁误拦：①组 6 时间戳顺序检查（`/tmp/.synova-before-brief` 残留，L537-545 **在 STAGED_SRC 守卫之外**无条件硬阻断）；②G12b brief 可解析性（L921-926 对暂存 brief 触发）；③组 1b 硬编码数据（L226-236 扫描 .html）。另有 2 处"无条件执行但非误拦"：组 7b validate-expert-config（L607，不看暂存内容，纯文档也跑——专家配置断裂时文档提交被连带拦）；组 9/10 因 `.codex/contracts/` 空目录 + `CHANGED_FILES` 幽灵变量**当前不触发**（守卫仍加，防未来误拦）。D362 文档拉平 + D366 审计登记反复卡门禁为实证。创始人 2026-08-16 决策（台账 CT-34）：**文档提交豁免 12 组，只保留 Secrets 扫描**。

## 1. Authority Doc Verification

**来源**: [AUDIT-FINDINGS-LEDGER.md L85](docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md)（CT-34 创始人决策 2026-08-16）

> **CT-34** | **文档提交豁免严格门禁（只保留 Secrets 扫描）**：文档（docs/、.claude/task-briefs/、memory/ 等）提交仅为跨机器（Mac/未来同事）同步信息，不应与代码同跑 13 组严格门禁。现状卡点（实证）：①组 6 时间戳顺序（before-brief 残留）不区分文档/代码，文档提交被误拦（D362 文档拉平 + D366 审计登记反复卡）；②G12b brief 可解析性对暂存 brief 触发；③task brief/Q2 范围/测试/接线/架构/契约对纯文档无意义。豁免：12 组（task brief + Q2 范围 + 时间戳 + 测试 + 接线 + 架构 + 契约 + 类型 + 文件驱动 + CP3 + scope + 技能）；保留：**Secrets 扫描**（文档同样泄密，D312 settings.json token 实证）。文档"真实性"不靠 pre-commit，靠 K3 审计兜底（声称 vs 事实复核）。归属：门禁脚本 scripts/pre-commit-check.sh 是 DSH 地盘，由 DSH 实现 | 2026-08-16 创始人决策 + D362/D366 文档提交反复卡门禁实证 | 🔧 DSH 排期（新 D#） |

**来源**: [AGENTS.md 铁律](AGENTS.md)（24 catch 必须 log / 31 降级信号 / 38 as any 零容忍 / 47 契约优先 / 48 测试非空壳）

> 铁律 35: 自动化优先——能写 check-*.sh 的不靠 review。铁律 0-2: 接线验收。

**来源**: [D328 门禁三态教训](docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md L11)

> exit 0 = 通过；exit 1 = 业务阻断；exit 2 = 检查执行失败（绝不与通过混同）。fail-open 是 M1 模式。

## 2. Problem Statement

纯文档提交（跨机同步信息）被代码向门禁误拦，具体三处（grep 实测）：

1. **组 6 时间戳顺序**（`scripts/pre-commit-check.sh:537-545`）：`/tmp/.synova-before-brief` 文件存在即 `hard_check` 硬阻断。该文件是 PreToolUse 钩子（`hook-block-write.sh`）在"代码先于 brief 写入"时留下的证据——**与文档提交无关**，但文档提交同样被拦。D362 文档拉平反复卡实证。
2. **G12b brief 可解析性**（`scripts/pre-commit-check.sh:921-926`）：`check-brief-parseable.sh "$BRIEF"` 对暂存 brief 触发，`BRIEF` 来自 `resolve-commit-brief.sh "$STAGED_ALL"`——纯文档提交暂存 task brief 时被要求满足 6 字段解析，但"登记一个 brief"本身不该被"brief 必须可解析"拦。
3. **组 1 硬编码数据**（`scripts/pre-commit-check.sh:226-236`）：`STAGED_HTML` 包含 `.html` 文件时扫描 `'marketing'|'sales'|'研发部'|'市场部'` 等——docs/ 下的 .html 交付物（如设计文档）会被误判硬编码业务数据。

另：组 6 Task Brief 主体（L507 `if [ -n "$STAGED_SRC" ]`）已天然豁免纯文档（STAGED_SRC 只含代码路径），但时间戳检查（L537-545）在 `if` 之外无条件执行——**这是最主要的误拦点**。

## 3. Q0-Q4

### Q0 — 项目拼图 + 文件审计

**a) 项目拼图**: 本任务在控制塔门禁层（`scripts/pre-commit-check.sh`，DSH 地盘）。pre-commit 13 组是代码质量门禁，文档提交的"质量"不靠 pre-commit 把关（CT-34 原文：文档"真实性"靠 K3 审计兜底）。目标 = 区分提交类型，纯文档走轻量路径。

**b) 文件审计**（grep/read 实测，2026-08-16）:
- `scripts/pre-commit-check.sh`（992 行）— 13 组门禁入口，唯一被 `.git/hooks/pre-commit` + `scripts/control-tower/synova-commit` 调用的检查体
- `.git/hooks/pre-commit` L4: `bash "$ROOT/scripts/pre-commit-check.sh"` — 入口确认
- `scripts/control-tower/synova-commit` L35: `PRE_COMMIT="${SYNO_PRE_COMMIT:-.../pre-commit-check.sh}"` — 二入口确认（同一脚本，无第二套检查体）
- `scripts/workflow/hook-block-write.sh` L346-355: PreToolUse 只拦 `.(ts|tsx|json)$` + `/(src|extensions|tests|packages)/` — **不拦文档写入**，本任务无需动 hook 层
- `scripts/workflow/check-brief-parseable.sh` — G12b 调用的解析检查
- `scripts/workflow/resolve-commit-brief.sh` — 从 STAGED_ALL 认领 brief

**c) 决策**: 第一性原理——门禁的价值在"拦代码质量问题"，文档提交没有代码质量风险，拦了就是噪音 → 噪音导致门禁被绕过（V3.7 教训）。收敛：按 CT-34 决策执行豁免。**豁免必须 fail-closed + 白名单精确**（§Q4 契约），防"文档目录藏代码文件"绕过（M1 防再犯）。

### Q1 — 调研 / 决策链

**a) 业界最佳实践**: Anthropic 工程基线——门禁按"变更类型"分级（docs-only CI 跳过测试/构建是标准做法：GitHub Actions 的 `paths-ignore: ['docs/**']`、pre-commit 的 `files:` 正则过滤）。核心模式 = **按暂存文件集合判定提交类型，类型决定检查子集**。

**b) 顶级团队做法**: Google/Meta 的 presubmit 均有 docs-only 快速通道；关键防绕过点 = 判定必须基于**全部暂存文件**（只要含一个代码文件 → 全门禁），不能只看"是否有文档"。

**c) memory/ 教训**: M1 fail-open 静默失效（D328）——豁免逻辑**绝不能**变成"判定失败就跳过检查"；判定失败必须 fail-closed（当不确定是不是纯文档 → 按代码提交全跑）。S-5 测试必须覆盖失败模式（劫持/绕过），非仅 happy path。

**决策参考系**: 参考 Anthropic（docs-only 分级）+ 第一性原理（门禁语义 = 拦代码问题）+ memory（M1 fail-open 教训）。结论：**fail-closed 豁免**——只有"全部暂存文件都是文档"才豁免，判定失败/含任一代码文件 → 13 组全跑。

### Q2 — 范围（正确的最简方案）

**做什么**（每文件一行）：
- `scripts/pre-commit-check.sh` — 新增"纯文档提交"判定 + 豁免分支（核心改造，见 §5）
- `tests/control-tower/precommit-doc-exempt.test.sh` — 新建：三路径测试（red→green，见 §7）

**不做什么**（含文件路径）：
- 不改 `scripts/workflow/hook-block-write.sh`（PreToolUse 已天然不拦文档，无需动）
- 不改 `scripts/control-tower/synova-commit`（它调用同一 pre-commit-check.sh，改造自动生效）
- 不改 `scripts/workflow/check-brief-parseable.sh` / `resolve-commit-brief.sh`（豁免在调用方 pre-commit-check.sh 做）
- 不改 `scripts/audit/`（K3 红线）
- 不建新的"文档质量门禁"（CT-34 明说文档真实性靠 K3 审计兜底，不靠 pre-commit）

### Q3 — 验收（入口 → 交互 → 结果）

- **入口**: `git commit` 或 `synova-commit` 触发 `scripts/pre-commit-check.sh`
- **处理**: 脚本先判定 `DOC_ONLY`（全部暂存文件是文档）→ 是：只跑 Secrets（组 3）+ 输出"纯文档提交豁免"标记；否：13 组全跑（现状不变）
- **结果**: 纯文档提交 exit 0（无 task brief / 无 /tmp 残留阻断 / 无 .html 硬编码误报）；混合提交行为与现状完全一致；文档含 secret → exit 1（Secrets 保留）

### Q4 — 契约与测试

**契约**（铁律 47）:
```
@is_doc_only_commit 判定契约
  @input  — STAGED_ALL（git diff --cached --name-only，全暂存文件，换行分隔）
  @output — 0 = 纯文档提交（全部文件 ∈ 文档集合）；1 = 非纯文档（含任一代码文件）
  @fail-closed — 判定逻辑异常（如空输入/不可解析）→ 按 1 处理（全门禁），绝不跳过检查（M1 防再犯）
  @error  — 不产生异常路径；判定是纯 bash 字符串匹配
@文档文件集合（目录前缀 + 扩展名双约束，任一命中即文档）
  docs/*.md|docs/*.html|docs/*.txt  |  .claude/task-briefs/*.md|*.html  |  memory/*.md|*.html  |  根级 .md/.html（无 / 前缀）
  ❌ 排除: .claude/skills/、.dsh/skills/（行为配置，D370 独立契约）、docs/ 下 .json/.ts（防藏代码）、任何非 .md/.html/.txt
@豁免组（12 组，CT-34 原文）
  task brief(组6) + Q2范围/scope(组12) + 时间戳(组6内) + 测试(组2) + 接线(组4)
  + 架构(组5) + 契约(组9) + 类型(组1) + 文件驱动(组8) + CP3(组10) + 技能(组13)
@保留组（1 组）
  Secrets(组3) — 文档同样泄密（D312 实证），永不豁免
@技能组的特殊处理
  CT-34 豁免清单含"技能"，但技能文件（.claude/skills/|.dsh/skills/）本身不在文档白名单：
  纯文档提交（docs/ 等）时 SKILL_FILES_STAGED 为空 → 组 13 天然不触发（豁免自动满足）；
  技能文件提交 → DOC_ONLY=0 → 组 13 照跑（D370 技能同步契约不被绕过）。两层语义都满足 CT-34。
```

**测试三路径**（铁律 48）:
1. 正常路径: 纯文档提交（docs/a.md）→ 豁免 → exit 0，输出含"文档"标记
2. 降级路径: 混合提交（docs/a.md + src/b.ts）→ 全门禁（fail-closed，同现状）
3. 边界条件: 空暂存 / 只有 .gitignore / 文档含 secret（仍拦）/ 非文档扩展名（.json/.ts 在 docs/ 下 → 不豁免）

## 4. Current State（grep/read 验证）

| 文件 | 现状 |
|------|------|
| `scripts/pre-commit-check.sh:537-545` | 组 6 时间戳检查：`if [ -f "$BEFORE_BRIEF_EVI" ]` → `hard_check` **无条件执行**（在 `if [ -n "$STAGED_SRC" ]` 之外）→ 纯文档提交被 /tmp 残留误拦 ⚠️ |
| `scripts/pre-commit-check.sh:921-926` | G12b: `check-brief-parseable.sh "$BRIEF"` 无条件跑，`BRIEF` 由 STAGED_ALL 解析 → 暂存 brief 被自身解析性检查拦 ⚠️ |
| `scripts/pre-commit-check.sh:226-236` | 组 1b: `STAGED_HTML=$(echo "$STAGED_ALL" \| grep -E '\.(html\|ts)$')` → docs/ 下 .html 被扫硬编码部门名 ⚠️ |
| `scripts/pre-commit-check.sh:507` | 组 6 Task Brief 主体 `if [ -n "$STAGED_SRC" ]` → STAGED_SRC 只含代码路径，纯文档天然跳过 ✅ |
| `scripts/pre-commit-check.sh:348-349` | 组 3 Secrets: `par_collect secrets "$PAR_SECRETS"` → 全工作区扫描（check-secrets.sh），与暂存类型无关 → **保留** ✅ |
| `scripts/pre-commit-check.sh:143-151` | 8 个慢脚本 par_start 并行启动（含 secrets）→ 豁免分支需在 par_start **之前**判定（L118 后），避免 7 个非 secrets 进程白跑 |
| `scripts/pre-commit-check.sh:607` | 组 7b: `validate-expert-config.sh` **无条件执行**（不看暂存内容）→ 专家配置断裂时文档提交被连带拦 ⚠️（豁免后跳过） |
| `scripts/pre-commit-check.sh:691-718` | 组 9 契约门禁：`.codex/contracts/` **当前为空目录**（`ls -A` 无输出）→ `if [ -d ... ] && [ "$(ls -A ...)" ]` 为假 → **当前不触发**（守卫仍加，防未来有契约时误拦） |
| `scripts/pre-commit-check.sh:725` | 组 10 CP3: `BRIEF_FILE=$(echo "$CHANGED_FILES" ...)` — **`CHANGED_FILES` 是幽灵变量**（全脚本从未赋值，grep 实测 0 处赋值）→ 组 10 条件区域检查**当前不触发**（既存缺陷，不在本任务修复范围；守卫仍加防未来修复后误拦） |
| `scripts/pre-commit-check.sh:943-946` | 组 13 技能同步：`SKILL_FILES_STAGED` 匹配 `.claude/skills/|.dsh/skills/` → 技能文件提交时触发。**技能文件不是"纯文档"**（是行为配置，D370 有独立同步契约）→ 不在文档白名单，技能提交保持全门禁 |
| `scripts/workflow/hook-block-write.sh:346-355` | PreToolUse 只拦 `.(ts|tsx|json)$` + src/extensions/tests/packages → 文档写入不被拦 ✅（无需动） |
| `scripts/control-tower/synova-commit:35` | `SYNO_PRE_COMMIT` 注入缝 → 测试可用（同 check-dev-doc-write-set 的 SYNO_DEV_DOC 模式） |

## 5. What We Build（产出物 + 路径）

### 5.1 写集 (1 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/pre-commit-check.sh](scripts/pre-commit-check.sh) | 修改 | 新增 DOC_ONLY 判定 + 豁免分支（见 §5.2） |
| [tests/control-tower/precommit-doc-exempt.test.sh](tests/control-tower/precommit-doc-exempt.test.sh) | 新建 | 三路径测试（见 §7） |

### 5.2 修复模式（pre-commit-check.sh 改造）

**改造点 1：DOC_ONLY 判定（必须放在 L118 `STAGED` 计算之后、L143 `par_start` 之前——否则 8 个慢脚本已启动，白跑 7 个）**

```bash
# ═══ D382: 纯文档提交判定 — 文档提交豁免 12 组，只保留 Secrets ═══
# CT-34 创始人决策（2026-08-16）：文档（docs/、.claude/task-briefs/、memory/ 等）
# 提交仅为跨机同步信息，不产生代码质量风险；Secrets 保留（文档同样泄密）。
# fail-closed：判定异常或含任一非文档文件 → DOC_ONLY=0（13 组全跑，M1 防再犯）。
# 白名单精确性：只认 .md/.html/.txt 扩展名 + docs/|.claude/task-briefs/|memory/ 前缀或根级；
#   .claude/skills/、.dsh/skills/ 是行为配置（D370 独立契约），不豁免；docs/ 下 .json/.ts 不豁免（防藏代码绕过）。
# ⚠️ 判定输入用 GIT_CACHED_ALL_NAMES（L114 已计算，par_start 之前可用）——
#    STAGED_ALL（L189）在 par_start 之后才计算，不可用作此处输入。
DOC_ONLY=1
if [ -z "$GIT_CACHED_ALL_NAMES" ]; then
  DOC_ONLY=0   # 空暂存 → 不豁免（无意义提交也走全门禁，保守）
else
  while IFS= read -r _docf; do
    [ -z "$_docf" ] && continue
    # 文档白名单：目录前缀 + 扩展名双重约束，缺一不可
    case "$_docf" in
      docs/*.md|docs/*.html|docs/*.txt|.claude/task-briefs/*.md|.claude/task-briefs/*.html|memory/*.md|memory/*.html) ;;
      *.md|*.html)  # 根级（无 / 前缀）单文件也视为文档
        case "$_docf" in */*) DOC_ONLY=0; break ;; *) ;; esac ;;
      *)
        DOC_ONLY=0
        break
        ;;
    esac
  done <<< "$GIT_CACHED_ALL_NAMES"
fi
```

> 注：`STAGED_ALL`（L189）与 `GIT_CACHED_ALL_NAMES`（L114）同源，仅差 node_modules 过滤（`grep -v node_modules`）。判定点在 L118-L143 之间，用 `GIT_CACHED_ALL_NAMES` 即够（暂存区不含 node_modules 已由 gitignore 保证）。

**改造点 2：par_start 条件化 + 豁免分支（DOC_ONLY 包裹非 Secrets 组）**

- **par_start（L143-151）**: `if [ "$DOC_ONLY" -eq 1 ]; then ( par_start secrets check-secrets.sh ) & PAR_SECRETS=$!; else ...8 个全启动...; fi` — 纯文档时只启动 secrets，其余 7 个不启动（省时 + 无孤儿进程）
- 组 1b（L226）: `if [ "$DOC_ONLY" -eq 0 ] && [ -n "$STAGED_HTML" ]` — 文档提交跳过硬编码扫描
- 组 2/4/5/7/8/9/10: `if [ "$DOC_ONLY" -eq 0 ]` 包裹（这些组本就基于 STAGED_SRC/STAGED，纯文档时大多为空，但显式守卫防 .html/.json 误入 + 防未来 contracts/CHANGED_FILES 修复后误拦）
- 组 6: 时间戳检查 `if [ "$DOC_ONLY" -eq 0 ] && [ -f "$BEFORE_BRIEF_EVI" ]` — **关键修复点**；Task Brief 主体已有 STAGED_SRC 守卫，纯文档天然跳过
- 组 7b（L607）: `if [ "$DOC_ONLY" -eq 0 ] && bash validate-expert-config.sh` — 文档提交跳过专家配置校验（不看暂存内容，纯文档跑它纯属浪费 + 连带误拦）
- 组 12: G12 主体本就 skip 文档（skip_re），G12b 加 `if [ "$DOC_ONLY" -eq 0 ]` 守卫
- 组 13: 技能文件（.claude/skills/|.dsh/skills/）不在文档白名单 → 技能提交 DOC_ONLY=0 → 组 13 照跑（D370 同步契约不绕过）✅
- **组 3 Secrets: 无条件保留**（不包裹）

**改造点 3：输出标记（可观测性）**

```bash
if [ "$DOC_ONLY" -eq 1 ]; then
  echo -e "${YELLOW}── 纯文档提交（D382 豁免 12 组，仅 Secrets 扫描）──${RESET}"
fi
```

## 6. What We Don't Do（明确排除 + 文件路径）

| 排除项 | 文件 | 归属 |
|--------|------|------|
| hook 层改造（PreToolUse 已天然不拦文档） | `scripts/workflow/hook-block-write.sh` | 不做 |
| synova-commit 改造（同一脚本，自动生效） | `scripts/control-tower/synova-commit` | 不做 |
| 文档质量门禁（CT-34: 靠 K3 审计兜底） | 任何新脚本 | 不做 |
| `.claude/skills/` 豁免 | `.claude/skills/*` | 不豁免（技能同步组 13 保持现状——技能是行为配置非纯文档，且 D370 有独立同步契约） |
| 审计脚本 | `scripts/audit/` | 永不碰（K3 红线） |
| .json/.ts 在 docs/ 下 | `docs/**/*.json` 等 | 不豁免（扩展名白名单只认 .md/.html/.txt，防绕过） |

**关键决策记录（§4.5 同源）**:
| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| 豁免判定基准 | A 全部暂存文件 / B 只看是否有文档 | 防绕过（含 1 个代码文件 = 全门禁） | **A**——全量判定，fail-closed |
| 文档扩展名白名单 | A .md/.html/.txt / B 任意扩展名（目录判定） | 防把代码藏 docs/ 下绕过 | **A**——白名单 + 目录双重约束 |
| .claude/skills/ 是否豁免 | A 豁免（属文档）/ B 不豁免 | 技能文件是**行为配置**（D370 独立同步契约 + sync-dsh-skills.sh），非纯文档；豁免=绕过技能漂移检查 | **B**——技能提交保持全门禁 |
| 豁免实现 | A 各组加 if 守卫 / B 整体 if 包裹 13 组 | 最小 diff + 组 3 无条件保留 + par_start 需条件化 | **A**——逐组守卫，Secrets 裸露在外，par_start 按 DOC_ONLY 条件启动 |
| 组 9/10 守卫 | A 加（防未来）/ B 不加（当前不触发） | 契约门禁/CP3 是"声明 vs 暂存"类，未来 contracts 非空或 CHANGED_FILES 修复后文档提交会被误拦 | **A**——守卫加上，防未来回归（M1 防再犯） |

> 收敛检查：五决策点参考系指向同一答案。**参考：Anthropic（docs-only 分级）+ 第一性原理（门禁语义）+ memory（M1 fail-open）**。

## 7. Test Requirements（测试优先 — 铁律 0-2/48，red→green）

**测试文件**: `tests/control-tower/precommit-doc-exempt.test.sh`

**第一步（red）**: 用例在修复前必须失败（修复前纯文档提交被时间戳/G12b/硬编码误拦）：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| 纯文档提交（docs/a.md + /tmp/.synova-before-brief 残留）→ exit 0 | 时间戳硬阻断 exit 1 | 豁免 exit 0 |
| 纯文档提交（仅 docs/a.html，含 'marketing' 词）→ exit 0 | 组 1b 硬编码误拦 | 豁免 exit 0 |
| 纯文档提交（docs/a.md + .claude/task-briefs/D382-*.md 暂存）→ exit 0 | G12b 解析检查触发 | 豁免 exit 0 |
| 混合提交（docs/a.md + src/b.ts）→ 全门禁照跑 | （现状已如此） | 保持 fail-closed exit 1（无 brief） |
| 纯文档提交 + 文档含 secret 字符串（sk-xxx）→ exit 1 | 被 secrets 拦（组 3 保留） | **仍被拦**（保留项验证） |
| 边界：空暂存 / 仅 .gitignore → 不豁免 | — | DOC_ONLY=0，走全门禁 |
| 边界：docs/ 下 .json 文件 → 不豁免（扩展名白名单） | — | DOC_ONLY=0 |
| **fail-closed 反例：docs/ 下藏代码文件（docs/x.ts）→ 不豁免** | — | DOC_ONLY=0，全门禁（M1 防绕过） |
| **fail-closed 反例：.claude/skills/SKILL.md 提交 → 不豁免（组 13 照跑）** | — | DOC_ONLY=0，技能同步检查执行（D370 不绕过） |
| **组 7b：专家配置断裂时纯文档提交 → exit 0（豁免后不连带拦）** | 配置断裂 → 文档提交 exit 1 | 豁免 exit 0 |

**测试注入缝**: 复用 `SYNO_PRE_COMMIT`（synova-commit L35 已有）+ 新增 `SYNO_STAGED_ALL`（测试注入 STAGED_ALL 模拟，参考 check-dev-doc-write-set 的 `SYNO_DEV_DOC` 模式）。

**第二步（green）**: 修复后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | bash 单元 | ≥10 | 上述 10 用例（正常/降级/边界/fail-closed×2/secrets 保留/组 7b 豁免） |
| L2 | 接线 | 1 | pre-commit-check.sh 内 DOC_ONLY 判定被组 1-13 消费 |

## 8. Wiring Verification

| 变更 | 验证 |
|------|------|
| DOC_ONLY 变量被消费 | `grep -n "DOC_ONLY" scripts/pre-commit-check.sh` 命中 ≥6 处（判定 + par_start 条件 + 组 1b/6 时间戳/G12b/组 7b 守卫） |
| 生产调用点 | `grep -rn "pre-commit-check.sh" .git/hooks/pre-commit scripts/control-tower/synova-commit` 命中 2 处（真实提交入口） |
| 测试接线 | `grep -n "SYNO_STAGED_ALL" scripts/pre-commit-check.sh tests/control-tower/precommit-doc-exempt.test.sh` 双命中 |
| Secrets 未被豁免 | `grep -n "par_collect secrets" scripts/pre-commit-check.sh` 存在且在 DOC_ONLY 守卫之外 |
| 时间戳守卫（关键修复点） | `grep -n "BEFORE_BRIEF_EVI" scripts/pre-commit-check.sh` 处含 `DOC_ONLY` 条件 |
| 技能组不绕过 | `grep -n "SKILL_FILES_STAGED" scripts/pre-commit-check.sh` 处无 DOC_ONLY 守卫（技能提交照跑） |

## 9. Architecture Layer

**基础设施（控制塔门禁层，非 L1-L5 业务层）**。`scripts/pre-commit-check.sh` 是 DSH 专属地盘的机器强制门禁。本任务不改任何业务代码，只改门禁判定逻辑——按 TASK-ROUTING v4「门禁脚本 + coordination 文档 = DSH 专属」归属确认。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

```bash
# DS1: DOC_ONLY 判定存在且 fail-closed
grep -n "DOC_ONLY=1" scripts/pre-commit-check.sh && grep -n "DOC_ONLY=0" scripts/pre-commit-check.sh   # 双命中
# DS2: 纯文档提交豁免（时间戳残留不拦）— 手工复现（用真实存在的文档文件，测后 git reset 清理）
touch /tmp/.synova-before-brief && git add docs/synova/coordination/TASK-ROUTING.md && bash scripts/pre-commit-check.sh   # exit 0（豁免）
rm -f /tmp/.synova-before-brief && git reset -q
# DS3: 混合提交 fail-closed — 与现状一致（用真实存在的代码文件，测后 reset）
git add docs/synova/coordination/TASK-ROUTING.md src/index.ts && bash scripts/pre-commit-check.sh   # 与修复前行为一致（无 brief 则 exit 1）
git reset -q
# DS4: Secrets 保留 — 文档含 secret 仍拦
#   （测试用例覆盖，见 DS6）
# DS5: 组 3 无条件执行（不在 DOC_ONLY 守卫内）
grep -n -B2 "par_collect secrets" scripts/pre-commit-check.sh   # 上方无 "if \[ \"\$DOC_ONLY\""
# DS6: 测试全绿
bash tests/control-tower/precommit-doc-exempt.test.sh   # exit 0，≥10 用例，red 已证
# DS7: 接线 — pre-commit-check.sh 被 2 个生产入口调用（grep 命中，非测试）
grep -rn "pre-commit-check.sh" .git/hooks/pre-commit scripts/control-tower/synova-commit   # 2 处
# DS8: as any = 0（无 TS 变更，自然满足）+ bash -n 语法
bash -n scripts/pre-commit-check.sh   # exit 0
# DS9: 全量审计基线一致 + 无 --no-verify + git diff --name-only 与写集（§5.1）一致
git diff --name-only   # 仅 scripts/pre-commit-check.sh + tests/control-tower/precommit-doc-exempt.test.sh
# DS10: 推送 + CI 验证 — git log origin/<branch>..HEAD 为空 + CI job 绿
# DS11: 完成报告含决策记录（§6 五决策点参考系与结论，S-12）——K3 可核
```

> 交付声明必须覆盖 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；**禁止重编号/跳号/静默缺项**（S-10）。

## 11. Auth Doc References

- `.claude/task-briefs/D382-doc-commit-exempt.md`（派活 brief——**待生成**，编码线程开工前由 DSH 主 CTO 派发；本 doc 即其 spec）
- `docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md` L85（CT-34 创始人决策 2026-08-16）
- `scripts/pre-commit-check.sh`（13 组门禁，改造对象）
- `scripts/control-tower/synova-commit` L35（SYNO_PRE_COMMIT 注入缝）
- `scripts/workflow/hook-block-write.sh` L346-355（PreToolUse 不拦文档，无需动）
- `scripts/workflow/check-brief-parseable.sh`（G12b 调用）
- `scripts/workflow/resolve-commit-brief.sh`（brief 认领）
- `.claude/PRODUCT-BRIEF.md` §四（无限扩展协作底座）
- AGENTS.md 铁律 24/31/35/38/47/48
