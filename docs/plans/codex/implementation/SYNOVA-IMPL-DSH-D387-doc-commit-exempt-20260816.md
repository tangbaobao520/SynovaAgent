---
north-star:
  服务用户: 开发者/CTO/审计线（直接用户：跨机同步纯文档提交时不被代码门禁误拦）；FDE/企业主（最终受益：Synova 迭代不停摆，诊断能力持续交付）
  服务场景: 开发者（Mac DSH / Win Claude / Codex / K3）提交纯文档——dev doc、task brief、审计报告、memory、task-state——跨机器同步时，pre-commit 识别"纯文档提交"而只做 Secrets 扫描，不跑 12 组面向代码的门禁
  模块终态: pre-commit 门禁按提交内容分流——纯文档提交秒过（仅 Secrets 扫描），任何代码/配置文件混入即全量 13 组硬阻断；判定 fail-closed（判定失败 = 走全量），无后门
  对齐北星: PRODUCT-BRIEF.md §八「Loop Engineering 需要成为什么」——门禁是防 --no-verify 绕过的根基，门禁误杀是绕过的根因（V4.5.1"pre-commit 超时 → --no-verify 泛滥"同构）
  完成标准: 入口 git commit 纯文档 → 处理 DOC_ONLY 判定（is_doc_only 文档白名单）→ 结果（a）输出"纯文档提交 (CT-34)"豁免标记（b）Secrets 仍全量扫描（c）混合提交/配置文件提交全量 13 组（d）测试 12 用例全绿
  当前进度: 纯文档与代码同跑 13 组 → 组 6 时间戳顺序（/tmp/.synova-before-brief）+ G12b brief 可解析性确定误拦（D362 文档拉平 2026-08-14 + D366 审计登记 2026-08-15 反复卡，台账 CT-34 实证）
---

<!--
  SYNOVA-IMPL-DSH-D387: 文档提交豁免门禁（CT-34）— 纯文档只跑 Secrets，12 组代码门禁豁免
  状态: dev doc | 2026-08-16 | 优先级 P1（创始人 2026-08-16 决策 + 台账 CT-34 排期）
  权威文档: 审计发现台账-DSH-CTO.md CT-34 条 + D366 审计报告 + D362 文档拉平 + D312 secrets 实证 + D370 注入缝惯例 + D328 fail-closed
  依赖: 无（D384 impl_done 在途，写集不重叠）；D373（CT-31/32/33）为后续任务，不依赖本任务
  并行: 无（独占 scripts/pre-commit-check.sh 门禁域）
-->

# SYNOVA-IMPL-DSH-D387: 文档提交豁免门禁（CT-34）

> 一句话问题: 纯文档提交（dev doc / task brief / 审计报告 / memory / task-state）被 13 组**面向代码**的 pre-commit 门禁误拦——实证卡点：①组 6 时间戳顺序检查（`/tmp/.synova-before-brief` 残留）不区分文档/代码，文档提交被硬阻断（D362 文档拉平 2026-08-14 + D366 审计登记 2026-08-15 反复卡）；②G12b brief 可解析性对**暂存中的 brief 自身**触发（鸡生蛋——写 brief 的第一版提交被自己的门禁拦）；③task brief/Q2 范围/测试/接线/架构/契约对纯文档无意义却全量执行。门禁误杀 = --no-verify 的根因（V4.5.1 教训同构）→ 门禁链失效。

## 1. Authority Doc Verification

**来源**: [审计发现台账-DSH-CTO.md CT-34](docs/synova/coordination/审计发现台账-DSH-CTO.md:87)（创始人 2026-08-16 决策）

> 文档（docs/、.claude/task-briefs/、memory/ 等）提交仅为跨机器（Mac/未来同事）同步信息，不应与代码同跑 13 组严格门禁。现状卡点（实证）：①组 6 时间戳顺序（before-brief 残留）不区分文档/代码，文档提交被误拦（D362 文档拉平 + D366 审计登记反复卡）；②G12b brief 可解析性对暂存 brief 触发；③task brief/Q2 范围/测试/接线/架构/契约对纯文档无意义。豁免：12 组（task brief + Q2 范围 + 时间戳 + 测试 + 接线 + 架构 + 契约 + 类型 + 文件驱动 + CP3 + scope + 技能）；保留：**Secrets 扫描**（文档同样泄密，D312 settings.json token 实证）。文档"真实性"不靠 pre-commit，靠 K3 审计兜底（声称 vs 事实复核）。归属：门禁脚本 scripts/pre-commit-check.sh 是 DSH 地盘，由 DSH 实现

**来源**: [K3 D366 审计报告](docs/synova/audit-reports/2026-08-15-D366.md)（P2-5 + 组 12 分析）

> G12 skip_re 豁免 `docs/` → 文档类越界提交对 scope 门禁天然不可见；brief 头部"分支"字段从不与 `git branch --show-current` 对账——字段是死文本。（注：分支对账为 CT-33，本任务不做；此条证明 **G12 本就豁免 docs/，纯文档豁免 G12 无门禁损失**）

**来源**: [AGENTS.md 铁律 35](AGENTS.md)（自动化优先）

> 能变 tsc/oxlint/ESLint 规则的不靠文档，能写 check-*.sh 的不靠 review。——门禁误杀是 --no-verify 泛滥的根因，豁免误杀是门禁链自保的一环。

**来源**: [AGENTS.md 铁律 24/31](AGENTS.md) + [D328 三态退出码](docs/synova/coordination/审计发现台账-DSH-CTO.md:13)

> 铁律 24/31: catch 必须有 log + degraded，降级信号传播；D328: exit 0=通过 / 1=业务阻断 / 2=检查执行失败（fail-closed）——豁免判定必须 fail-closed：**判定本身失败 → 走全量 13 组，绝不静默放行**。

**来源**: [D312 settings.json token 实证](docs/synova/coordination/审计发现台账-DSH-CTO.md:87) + [D370 secrets-env-exempt 测试惯例](tests/control-tower/secrets-env-exempt.test.sh:1)

> Secrets 是唯一保留项——文档同样泄密（D312: .claude/settings.json 真实 token 泄漏）；check-secrets.sh 已有 `SYNO_SECRETS_ROOT` 注入缝（D370 测试惯例），本任务沿用同款注入缝模式。

**来源**: [D313 M3b / D381](scripts/workflow/check-dev-doc-write-set.sh:1)

> 写集验证 G12c 触发条件 = 暂存含 `docs/plans/codex/implementation/SYNOVA-IMPL-*.md`；`(b) 变更命中`检查（L116-122）要求声明文件在 git diff HEAD/--cached 中——**spec 纯文档提交时实现文件未改 → 必然漂移 → G12c 必须随组 12 豁免（否则 spec 提交被自己拦死），写集对账的时机在实现提交**（实现文件 + dev doc 同提交时全量路径 G12c 物理验证）。

## 2. Problem Statement

要解决的问题：**纯文档提交被面向代码的 pre-commit 门禁误拦**，导致：
1. **时间黑洞/死锁**：文档拉平、审计登记等纯文档批量提交被组 6 时间戳检查（`/tmp/.synova-before-brief` 残留）硬阻断，要求 `rm` 证据文件 + `git checkout -- .` 回滚——文档提交被迫等待/绕过（D362 2026-08-14 文档拉平死锁 + D366 2026-08-15 审计登记反复卡，台账 CT-34 实证）。
2. **鸡生蛋**：G12b brief 可解析性检查对**暂存中的 task brief 自身**触发——写 brief 的第一版提交（纯 .md）被自己的门禁拦（`check-brief-parseable.sh "$BRIEF"`，pre-commit-check.sh:922）。
3. **文档当代码扫**：组 1b 硬编码扫描把 docs/ 下 `.html` 当代码（L226-236）；组 7b validate-expert-config 无条件执行（L607）——专家配置断裂时文档提交被连带拦。
4. **门禁链失效风险**：误杀 = --no-verify 的根因（V4.5.1: "pre-commit 实测 122s → 被迫 --no-verify，成为绕过控制塔的根因"同构）。文档提交频繁失败 → 开发者用 --no-verify → bypass.log 记录 → GATEKEEPER 硬阻断 → 更卡。

对齐北星锚定块：这是工程质量系统（PRODUCT-BRIEF §八 Loop Engineering）的自保修复——门禁要拦得住代码问题，就不能误杀文档同步；否则门禁自己被绕过，产品迭代停摆，最终伤害企业主的诊断服务连续性。

## 3. Q0-Q4（task-start 四问）

### 3.1 写集 (1 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/pre-commit-check.sh](scripts/pre-commit-check.sh) | 修改 | ①GIT_CACHED_* 四行改测试注入缝（`SYNO_GIT_CACHED_*` 覆盖，默认真实 git，fail-closed）②新增 `is_doc_only()` 判定函数 + `DOC_PREFIX_RE` 文档白名单正则（L118 后）+ STAGED_ALL 定义提前 ③纯文档早退分支（仅 Secrets 扫描，置于 par_start 前）④移除原 L189 STAGED_ALL 重复定义 |
| [tests/control-tower/doc-commit-exempt.test.sh](tests/control-tower/doc-commit-exempt.test.sh) | 新建 | CT-34 豁免机制测试（12 用例：正常/降级/边界/接线，red→green，见 §7） |

> 版本编排：本任务不触碰 VERSION.md / version.log / git tag（门禁行为变更，非版本号变更；版本号由 CTO 批次统一管理）。

### 3.2 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| "纯文档提交"判定方式 | A 扩展名判定（无代码扩展名即文档）/ B 路径白名单判定（全部文件在文档路径内） | Anthropic（fail-closed：误放行代价 >> 误拦代价——白名单更保守，非白名单路径一律全量）+ DeepSeek（最少机制：一个正则） | **B**——目录 + 扩展名双约束（docs/ 下仅 *.md/*.html/*.txt；`.claude/settings.json` 等配置文件天然不在白名单 → 全量，D312 教训） |
| docs/ 等目录是否整体豁免 | A 目录前缀整体豁免 / B 目录 + 扩展名双约束 | Anthropic（安全边际：防"docs/ 下藏 .json/.ts 代码文件"绕过豁免）+ D382 草案 Q4 契约（"docs/ 下 .json/.ts 防藏代码"） | **B**——目录前缀 + 扩展名白名单双约束；白名单外任何文件 → 全量 |
| 技能文件（.claude/skills/、.dsh/skills/）是否进白名单 | A 进白名单（技能提交豁免组 13）/ B 不进白名单（技能提交全门禁） | Anthropic（契约完整性：D370 技能同步契约不能被豁免绕过）+ D382 草案 Q4（"技能文件是行为配置，D370 独立契约"） | **B**——技能提交 → 非纯文档 → 组 13 漂移检查照跑；纯文档提交时 SKILL_FILES_STAGED 为空天然不触发（CT-34 豁免清单"技能"由此自动满足，两层语义兼顾） |
| 豁免范围 | A 完全照创始人清单（12 组全豁免）/ B 额外保留 G12c 写集验证 | 第一性原理：G12c 的 `(b) 变更命中`（check-dev-doc-write-set.sh:116-122）要求声明文件在 git diff 中——spec 纯文档提交时实现文件未改 → **必然漂移 → 保留 G12c = spec 提交被自己拦死**；写集对账的正确时机在实现提交（实现文件+dev doc 同提交时全量路径 G12c 物理验证，D383 P1-1 防漂移不失效） | **A**——早退分支仅 Secrets；G12c 保留在**全量路径**（混合提交含 dev doc 时仍查），spec 阶段靠 gatekeeper C6（写集表存在性）+ 实现阶段 G12c 物理验证 |
| 早退分支放置 | A par_start 前早退 / B 组 3 后早退 | Anthropic（最少机制）+ 性能（V4.5.1: 8 个外部脚本并行 ~26s——纯文档提交不应触发） | **A**——早退置于 par_start（L120）之前，纯文档提交零 par 启动、秒过 |
| 判定逻辑形态 | A 内联代码 / B 提取为 `is_doc_only()` 函数 | Anthropic（测试可验证性：today-by-name.test.sh 先例——sed 提取函数体 + eval 单测，零真实 git 操作、零全量 13 组跑动、确定性；内联代码无法提取）+ D316 教训（环境依赖测试：T1 断言 exit 0 受真实 bypass.log 影响 → 端到端只断言标记，不豁免场景用函数单测） | **B**——判定函数化：不豁免场景（T3/T6/T10/T12）函数单测（快、确定），早退端到端（T1/T2/T4/T5/T7）注入缝跑真实脚本早退路径（仅 secrets，快） |
| GATEKEEPER bypass 阻断（L99-111） | A 早退前保留 / B 随豁免跳过 | Anthropic（安全边际：--no-verify 滥用是门禁链失效根因，与暂存内容无关） | **A**——保留，早退分支在 bypass 阻断之后、GIT_CACHED 之后 |

> 收敛检查：七决策点均单参考系收敛，无分歧。**参考：Anthropic + DeepSeek（第一性原理）**。其中"豁免范围 A"是对创始人清单的精确化（创始人豁免"对纯文档无意义"的门禁；G12c 在 spec 阶段必然误拦，且写集对账时机在实现阶段——不违背决策本意，K3 可核）。

### 3.3 验收（Q3：入口 → 处理 → 结果）

- **入口**：`git commit` 纯文档暂存集（docs/、.claude/task-briefs/、memory/、task-state/、根级 *.md 等）→ pre-commit hook → `scripts/pre-commit-check.sh`
- **处理**：GIT_CACHED 注入缝读取暂存集 → `is_doc_only()` 判定（文档白名单正则）→ 早退分支（仅 Secrets 扫描）
- **结果**：
  - (a) 输出 `纯文档提交 (CT-34/D387): 豁免 12 组 — 仅 Secrets 扫描` 豁免标记
  - (b) Secrets 仍全量扫描（含工作区，D312 实证）
  - (c) 混合提交 / 配置文件提交（.claude/settings.json 等）→ 无豁免标记 → 全量 13 组
  - (d) `tests/control-tower/doc-commit-exempt.test.sh` 12 用例全绿（red 已证）

## 4. Current State（2026-08-16 grep/read 实测）

### 4.1 缺陷 A（P1）: 组 6 时间戳顺序检查不区分文档/代码

[pre-commit-check.sh L537-545](scripts/pre-commit-check.sh:537)：

```bash
BEFORE_BRIEF_EVI="/tmp/.synova-before-brief"
BEFORE_BRIEF_MSG=""
if [ -f "$BEFORE_BRIEF_EVI" ]; then
  EVI_CONTENT=$(head -5 "$BEFORE_BRIEF_EVI" 2>/dev/null)
  BEFORE_BRIEF_MSG="代码在 brief 填写前已写入:\n${EVI_CONTENT}\n解决方法: rm ${BEFORE_BRIEF_EVI} && git checkout -- . && bash scripts/workflow/task-start.sh"
fi
hard_check "时间戳顺序: brief 必须早于代码写入" "${BEFORE_BRIEF_MSG:-}"
```

该检查**无条件执行**（不判断暂存内容是否为代码）——只要 `/tmp/.synova-before-brief` 残留（PreToolUse hook 在"brief 未填就写代码"时写入），**纯文档提交也被硬阻断**，且修复方案要求 `git checkout -- .` 回滚整个工作区。D362 文档拉平（2026-08-14）与 D366 审计登记（2026-08-15）反复卡此检查（台账 CT-34 实证）。

### 4.2 缺陷 B（P1）: G12b brief 可解析性对暂存 brief 自身触发（鸡生蛋）

[pre-commit-check.sh L921-927](scripts/pre-commit-check.sh:921)：

```bash
BRIEF_PARSEABLE_OUT=$(bash "$ROOT/scripts/workflow/check-brief-parseable.sh" "$BRIEF" 2>&1 || true)
if echo "$BRIEF_PARSEABLE_OUT" | grep -q "❌"; then
  hard_check "G12b: brief 可解析性 (D313 M3)" "$BRIEF_PARSEABLE_OUT"
```

`BRIEF` 来自 `resolve-commit-brief.sh`（L481，基于暂存文件找认领 brief）——**写 task brief 的第一版提交（纯 .claude/task-briefs/*.md 暂存）时，被检查的正是暂存中的 brief 自己**；若该 brief 尚未完整填写（写第一版时通常不完整）→ 自拦。

### 4.3 缺陷 C（P1）: 组 1b 硬编码扫描把 .html 当代码

[pre-commit-check.sh L226-236](scripts/pre-commit-check.sh:226)：

```bash
STAGED_HTML=$(echo "$STAGED_ALL" | grep -E '\.(html|ts)$' | grep -v node_modules | grep -v '\.test\.' || true)
HARDCODE_DATA=""
if [ -n "$STAGED_HTML" ]; then
  for hf in $STAGED_HTML; do
    DEPS=$(grep -n "'marketing'\|'sales'\|'finance'\|'研发部'\|'市场部'\|'销售部'" "$hf" 2>/dev/null | ... )
```

`docs/` 下的 `.html` 文档（如 HTML 报告）被当作代码扫描硬编码部门名——误拦风险（D382 草案 Q4 实证）。早退分支整体跳过组 1-13 → 该误拦自动消除。

### 4.4 缺陷 D（P1）: 组 7b validate-expert-config 无条件执行

[pre-commit-check.sh L607](scripts/pre-commit-check.sh:607)：`bash "$ROOT/scripts/validate-expert-config.sh"` **不看暂存内容无条件执行**——专家配置断裂时纯文档提交被连带拦（非误拦但多跑 + 连带风险）。早退分支跳过组 7 → 自动消除。

### 4.5 既存非触发项（守卫仍加，不在本任务修复）

- **组 9 契约门禁**（L694）：`.codex/contracts/` 当前为空目录（`ls -A` 无输出）→ 当前不触发
- **组 10 CP3**（L725）：`BRIEF_FILE=$(echo "$CHANGED_FILES" ...)` —— `CHANGED_FILES` 是**幽灵变量**（全脚本从未赋值）→ 条件区域检查当前不触发（既存缺陷，CT-33 批次处理）
- **PreToolUse hook-block-write.sh**（L346-355）：只拦 `.(ts|tsx|json)$` + src/extensions/tests/packages → **文档写入不被拦**（本任务无需动 hook 层）

### 4.6 现状已天然豁免的部分（不重复豁免）

- **G12（Q2 范围）**：skip_re 已豁免 `\.claude/|scripts/workflow/|\.codex/|memory/|docs/|\.github/`（[L893](scripts/pre-commit-check.sh:893)）→ 纯文档天然过 G12
- **组 6 brief 存在性/字段检查**：`TASK_BRIEF_MISSING`/`TASK_BRIEF_EMPTY` 仅 `STAGED_SRC`（src/|tests/|packages/|scripts/）非空时触发（[L507](scripts/pre-commit-check.sh:507)）→ 纯文档天然跳过
- **组 1/2/4/5/7/9**：基于代码模式（as any、export、跨层 import、manifest 等）→ 纯文档 diff 无命中，自然 pass
- **check-secrets.sh**：全工作区扫描（非仅暂存区），与提交内容无关 → **必须保留**（D312: 文档同样泄密）

### 4.7 误拦确认实验（red 前置）

构造纯文档暂存集（`git add docs/x.md`）跑当前 pre-commit-check.sh：组 6 时间戳（若 /tmp/.synova-before-brief 存在）与 G12b（若暂存含未完成 brief）硬阻断——此为缺陷 A/B 的复现路径，测试 T1/T2 以此设计（red）。

## 5. What We Build

### 5.1 修改：scripts/pre-commit-check.sh（4 处）

**① GIT_CACHED 注入缝（L113-116）**——测试注入缝，只读，默认真实 git（fail-closed）：

```bash
# D387: 测试注入缝 (只读, 默认真实 git) — SYNO_GIT_CACHED_* 覆盖, 仅测试用
GIT_CACHED_NAMES="${SYNO_GIT_CACHED_NAMES:-$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)}"
GIT_CACHED_ALL_NAMES="${SYNO_GIT_CACHED_ALL_NAMES:-$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)}"
GIT_CACHED_ADDED_NAMES="${SYNO_GIT_CACHED_ADDED_NAMES:-$(git diff --cached --name-only --diff-filter=A 2>/dev/null || true)}"
GIT_CACHED_DIFF="${SYNO_GIT_CACHED_DIFF:-$(git diff --cached 2>/dev/null || true)}"
```

**② DOC_ONLY 判定函数化（L118 `STAGED` 之后）**——`is_doc_only()` 函数 + 白名单正则（**目录 + 扩展名双约束**，吸收 D382 草案 Q4 契约——防"docs/ 下藏 .json/.ts 代码"绕过；技能文件不进白名单——D370 同步契约不被绕过）。**函数化理由**：测试采用 today-by-name.test.sh 模式（sed 提取生产函数体 + eval 单测，零真实 git 操作、零全量 13 组跑动、确定性），内联代码无法提取：

```bash
# ═══ CT-34 (D387): 纯文档提交豁免 — 创始人 2026-08-16 决策 ═══
# 文档(docs/、.claude/task-briefs/、memory/、task-state/、根级 *.md/*.html/*.txt)
# 仅为跨机同步信息, 不与代码同跑 13 组门禁。豁免 12 组, 仅保留 Secrets(D312)。
# 白名单 = 目录 + 扩展名双约束:
#   ✅ docs/ 下仅 *.md|*.html|*.txt; .claude/task-briefs/ 下 *.md; memory/ 下 *.md;
#      task-state/ 下 *.json|*.md(任务登记); 根级 *.md|*.html|*.txt
#   ❌ 排除: .claude/skills/、.dsh/skills/(行为配置, D370 有独立同步契约 → 非纯文档,
#      技能提交保持组 13 全门禁; 纯文档提交时 SKILL_FILES_STAGED 为空天然不触发)
#   ❌ 排除: .codex/(契约/映射配置, 组 9 依赖)、.github/(CI 配置, 非同步信息)、
#      .claude/settings.json(含 token 风险, D312)
# 契约 (铁律 47):
#   @input  — $1: STAGED_ALL（git diff --cached --name-only 全暂存文件, 换行分隔）
#   @output — stdout: 1 = 纯文档提交; 0 = 非纯文档（含任一白名单外文件/空输入）
#   @fail-closed — 正则匹配失败/空输入 → 0（走全量 13 组, 不静默放行, D328）
#   @error  — 无异常路径（纯 bash 字符串匹配）
DOC_PREFIX_RE='^(docs/.*\.(md|html|txt)$|\.claude/task-briefs/.*\.(md|html|txt)$|memory/.*\.(md|html|txt)$|task-state/.*\.(json|md)$|[^/]+\.(md|html|txt)$)'
is_doc_only() {
  local staged="$1"
  [ -z "$staged" ] && { echo 0; return; }   # fail-closed: 空暂存 → 非纯文档路径
  local non_doc
  non_doc=$(echo "$staged" | grep -vE "$DOC_PREFIX_RE" || true)
  if [ -z "$non_doc" ]; then echo 1; else echo 0; fi
}
STAGED_ALL=$(echo "$GIT_CACHED_ALL_NAMES" | grep -v node_modules || true)
DOC_ONLY=$(is_doc_only "$STAGED_ALL")
```

**③ 纯文档早退分支（②之后、par_start L120 之前）**——仅 Secrets：

```bash
if [ "$DOC_ONLY" -eq 1 ]; then
  # ── CT-34 纯文档提交: 仅 Secrets 扫描, 豁免其余 12 组 ──
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  纯文档提交 (CT-34/D387): 豁免 12 组 — 仅 Secrets 扫描"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  if bash "$ROOT/scripts/check-secrets.sh" 2>&1; then
    echo -e "  ${GREEN}✅ Secrets 扫描通过${RESET}"
    echo -e "  ${GREEN}✅ 纯文档提交豁免检查完成 (CT-34)${RESET}"
    exit 0
  else
    echo -e "  ${RED}❌ Secrets 扫描失败 — 提交已拒绝${RESET}"
    exit 1
  fi
fi
```

**④ 移除原 L189 `STAGED_ALL=$(echo "$GIT_CACHED_ALL_NAMES" | grep -v node_modules || true)` 重复定义**（已提前到②）。

### 5.2 新建：tests/control-tower/doc-commit-exempt.test.sh

对齐 secrets-env-exempt.test.sh（mktemp 沙箱 + trap 清理 + pass/fail 计数）与 today-by-name.test.sh（sed 提取生产函数体 + eval 单测）双模式：
- **函数单测**（T3/T6/T10/T12）：sed 提取 `is_doc_only()` 真实函数体 → bash -n 语法自检 → eval 进测试环境 → 输入矩阵断言输出（RED: 提取为空 = 函数未实现）
- **端到端**（T1/T2/T4/T5/T7）：`SYNO_GIT_CACHED_*` 注入缝控制暂存集 + `SYNO_SECRETS_ROOT` 沙箱（无 key / 含假 key 两态）跑真实 `scripts/pre-commit-check.sh` 早退路径，断言输出标记
- **接线/回归**（T8/T9/T11）：grep 生产脚本断言（函数存在、GATEKEEPER 顺序、G12c 不回退）

核心断言见 §7.1 red→green 表。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 不改 check-secrets.sh 逻辑（含退出码） | Secrets 是唯一保留项，D312/D370 已打磨；本任务只复用其既有注入缝 |
| 不改 G12 的 skip_re 豁免表 | G12 已天然豁免 docs/ 等（L893）；改它扩大豁免面 = 放松 scope 门禁 |
| 不豁免 .claude/skills/、.dsh/skills/ | 技能是行为配置，D370 有独立同步契约——技能提交保持组 13 全门禁（防漂移门禁被豁免绕过）；纯文档提交时技能组天然不触发 |
| 不豁免 .codex/（contracts/、criteria-code-map.json 等） | 契约/映射配置，组 9 契约门禁依赖；fail-closed |
| 不豁免 .github/（workflows/*.yml） | CI 配置非同步信息；且不豁免也不会误拦（各检查对 yml 自然跳过） |
| 不豁免 .claude/settings.json（.claude/ 全目录豁免） | 配置文件含 token 风险（D312 实证）；只豁免 .claude/task-briefs/ |
| 不改 hook-block-write.sh | PreToolUse 已天然不拦文档写入（L346-355 只拦 .(ts/tsx/json)$ + 代码目录） |
| 不修组 10 幽灵变量 CHANGED_FILES（L725） | 既存缺陷（当前不触发），CT-33 批次处理；本任务守卫仍加 |
| 不做分支与 brief 对账（CT-33） | 独立任务（K3 D366 P2-5），非本任务根因 |
| 不豁免 tests/、src/、packages/、scripts/ 下任何文件 | 代码/测试/脚本 = 全量 13 组，无后门 |
| 不改动 G12c（dev doc 写集验证）本身逻辑 | 保留在**全量路径**（混合提交含 dev doc 时仍查）；spec 阶段靠 gatekeeper C6 |
| 不新增版本号变更（VERSION.md/version.log/tag） | 门禁行为变更非版本发布，版本由 CTO 批次统一管理 |
| 不改 scripts/audit/ 任何文件 | K3 专属红线，违反 = 事故 |

## 7. Test Requirements

### 7.1 L1 单元契约（tests/control-tower/doc-commit-exempt.test.sh，red→green）

**测试策略**（对齐 today-by-name.test.sh 模式）：`is_doc_only()` 判定函数用 **sed 提取生产函数体 + eval 单测**（零真实 git 操作、零全量 13 组跑动、确定性——不依赖真实仓库状态）；早退分支端到端（Secrets 调用链 + 豁免标记）用 **SYNO_GIT_CACHED_* 注入缝 + SYNO_SECRETS_ROOT 沙箱**跑真实 pre-commit-check.sh 早退路径（仅 secrets，快）；**不豁免场景（T3/T6/T12）只测判定函数不跑全量 13 组**。

| 用例 | 方法 | 修复前（red） | 修复后（green） |
|------|------|------|------|
| T1 纯 docs/ 提交端到端 | 注入 `SYNO_GIT_CACHED_ALL_NAMES=docs/plans/x.md` + `SYNO_SECRETS_ROOT`=空沙箱，跑真实脚本 | 全量 13 组 → 组 6 时间戳/G12b 误拦风险 → 输出无 CT-34 标记 | 输出含 "CT-34" 豁免标记 + Secrets 通过（exit code 受 GATEKEEPER 真实状态影响，只断言标记，见下注） |
| T2 纯 brief 提交端到端 | 注入 `.claude/task-briefs/D387-test.md` | G12b 对暂存 brief 自身触发（鸡生蛋）→ 拦截 | 输出含 "CT-34" 标记（豁免） |
| T3 混合提交（文档+代码）| **函数单测**：`is_doc_only` 输入 `docs/x.md\nsrc/y.ts` | — | 返回 0（不豁免） |
| T4 task-state 提交端到端 | 注入 `task-state/D387.json` | 组 12 G12 拦（不在 Q2 范围，skip_re 不含 task-state/） | 输出含 "CT-34" 标记（豁免，task-state/ 进白名单） |
| T5 根级 md 端到端 | 注入 `README.md` | — | 输出含 "CT-34" 标记（豁免） |
| T6 配置文件提交 | **函数单测**：`is_doc_only` 输入 `.claude/settings.json` | — | 返回 0（不豁免，fail-closed） |
| T7 文档含 secret（降级）| 注入 `docs/x.md` + `SYNO_SECRETS_ROOT`=沙箱含 `sk-` 假 key，跑真实脚本 | — | 输出含 Secrets 扫描失败标记 + 提交拒绝（Secrets 保留，D312） |
| T8 生产接线（wire check）| grep `is_doc_only` scripts/pre-commit-check.sh | 无（函数不存在） | 存在（≥2 处：定义 + 调用） |
| T9 GATEKEEPER 顺序（边界）| grep -n 行号比较 | — | bypass 阻断块行号 < `is_doc_only` 定义行号（绕过审计先于豁免） |
| T10 空暂存集（边界）| **函数单测**：`is_doc_only ""` | — | 返回 0（fail-closed，走全量） |
| T11 全量路径 G12c 保留（回归）| grep `check-dev-doc-write-set.sh` | — | 仍在全量路径（L929-937 区块存在，防 D383 P1-1 写集漂移不回退） |
| T12 技能文件不豁免（边界）| **函数单测**：`is_doc_only` 输入 `.dsh/skills/test/SKILL.md` + `.claude/skills/test/SKILL.md` | — | 返回 0（技能 = 行为配置，D370 组 13 漂移门禁照跑） |

> **T1/T2/T4/T5/T7 端到端断言说明**：GATEKEEPER bypass 阻断（保留项）在早退分支之前，其行为依赖真实 `.claude/bypass.log`——测试**只断言输出含豁免/拒绝标记**（早退分支被执行的物理证据），不硬断言 exit code（避免 D316 环境依赖陷阱）。测试头部检测今日 detected-bypass 记录并输出提示（诊断辅助，不阻断）。
> **T3/T6/T10/T12 用 sed 提取 `is_doc_only` 函数体 eval 进测试环境**（today-by-name.test.sh 模式）——不跑全量 13 组（快、确定性、零真实仓库污染）。

### 7.2 L2a 接线（生产调用链实测）

| 变更 | 生产调用点 | 验证 |
|------|-----------|------|
| `is_doc_only()` 判定 + 早退分支 | `.git/hooks/pre-commit` L4 → `scripts/pre-commit-check.sh`；`scripts/control-tower/synova-commit` L35（SYNO_PRE_COMMIT）；`scripts/install-hooks.sh` L45 | T8 grep 断言 + 本表 grep 实测 |

### 7.3 L2b 降级

- Secrets 扫描失败（含文档泄密）→ exit 1 硬阻断（T7 覆盖）——豁免不放松安全
- 判定正则匹配失败/暂存集含白名单外文件（含 docs/ 下 .json/.ts 藏代码、技能文件、.codex/、.github/、.claude/settings.json）→ DOC_ONLY=0 → 全量 13 组（fail-closed，不静默放行）
- 注入缝未设 → 默认走真实 `git diff --cached`（fail-closed，生产不受影响）

### 7.4 L2c 边界

- 空暂存集（T10）、混合提交（T3）、配置文件（T6）、技能文件（T12）、根级 md（T5）、task-state（T4）、GATEKEEPER 顺序（T9）、G12c 不回退（T11）

## 8. Wiring Verification

| 变更 | 验证 |
|------|------|
| `is_doc_only()` 判定被早退分支消费 | grep 实测：`pre-commit-check.sh` 中 `is_doc_only` 定义 + `DOC_ONLY=$(is_doc_only ...)` 赋值 + `if [ "$DOC_ONLY" -eq 1 ]`（早退分支）——同文件内生产调用（真实传递，非测试） |
| pre-commit-check.sh 被 git hook 调用 | grep 实测：`.git/hooks/pre-commit:4` `bash "$ROOT/scripts/pre-commit-check.sh"`；`scripts/control-tower/synova-commit:35` `PRE_COMMIT="${SYNO_PRE_COMMIT:-.../pre-commit-check.sh}"`；`scripts/install-hooks.sh:45` |
| check-secrets.sh 被早退分支调用 | grep 实测：早退分支 `bash "$ROOT/scripts/check-secrets.sh"`（生产调用，非测试） |
| G12c（check-dev-doc-write-set.sh）保留在全量路径 | grep 实测：`pre-commit-check.sh:931` `check-dev-doc-write-set.sh` 调用块仍在（L929-937） |

## 9. Architecture Layer

**基础设施（控制塔门禁域，非 L1-L5 业务层）**。依据：TASK-ROUTING.md §一模块所有权表——`scripts/control-tower/ + 门禁脚本` 属 Mac DSH（DeepSeek Harness）地盘；本任务改 `scripts/pre-commit-check.sh`（门禁脚本，CODEOWNERS 保护），不触碰任何 src/ 业务代码。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. DS1: `tests/control-tower/doc-commit-exempt.test.sh` 全过（12 用例；red 已证——T1/T2 修复前误拦路径已复现，§4.7）
2. DS2: GIT_CACHED_* 注入缝生效——`SYNO_GIT_CACHED_ALL_NAMES` 注入时暂存集被覆盖（T1 端到端物理证明）
3. DS3: `is_doc_only()` 判定函数——纯文档暂存集 → 1；含任何白名单外文件（含 docs/ 下 .json/.ts、技能文件、.codex/、.github/、.claude/settings.json）→ 0；空输入 → 0 fail-closed（T3/T6/T10/T12 函数单测 + T1/T4/T5 端到端覆盖）
4. DS4: 纯文档早退分支——输出 `纯文档提交 (CT-34/D387): 豁免 12 组` 标记 + 仅跑 Secrets（T1/T2/T4/T5 覆盖）
5. DS5: Secrets 保留——纯文档 + 沙箱含假 key → 提交拒绝标记（T7 覆盖）
6. DS6: 混合提交/配置文件不豁免——`is_doc_only` 返回 0（T3/T6 覆盖）
7. DS7: task-state/ 进白名单——`task-state/*.json` 纯提交豁免（T4 覆盖）
8. DS8: GATEKEEPER bypass 阻断保留在早退之前（T9 覆盖，行号顺序断言）
9. DS9: G12c 写集验证不回退——全量路径 `check-dev-doc-write-set.sh` 调用块仍在（T11 覆盖）
10. DS10: 空暂存集不豁免——`is_doc_only ""` 返回 0（T10 覆盖）
11. DS11: 技能文件提交不豁免——`is_doc_only` 对技能路径返回 0（T12 覆盖；D370 契约不被绕过）
12. DS12: 生产接线——`.git/hooks/pre-commit` + `synova-commit` + `install-hooks.sh` 调用链不变，`is_doc_only` 定义被早退分支消费（T8 + §8 grep 断言）
13. DS13: 真实提交环境 13 组 pre-commit 全过、无 --no-verify、`git diff --name-only` 与写集一致
14. DS14: 完成报告须含决策记录（§3.2 七决策点参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS14 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项（S-10）。

## 11. Auth Doc References

- [审计发现台账-DSH-CTO.md](docs/synova/coordination/审计发现台账-DSH-CTO.md)（CT-34 条 L87；D312/D328/D370 相关条目）
- [K3 D366 审计报告](docs/synova/audit-reports/2026-08-15-D366.md)（P2-5 分支污染 + G12 skip_re 分析）
- [AGENTS.md](AGENTS.md)（铁律 24/31/35；V4.5.1 门禁超时 → --no-verify 教训）
- [TASK-ROUTING.md](docs/synova/coordination/TASK-ROUTING.md)（§一 模块所有权表：门禁脚本 = Mac DSH 地盘）
- [PRODUCT-BRIEF.md](.claude/PRODUCT-BRIEF.md)（§八 Loop Engineering）
- [tests/control-tower/secrets-env-exempt.test.sh](tests/control-tower/secrets-env-exempt.test.sh)（D370 注入缝测试惯例）
- [scripts/workflow/check-dev-doc-write-set.sh](scripts/workflow/check-dev-doc-write-set.sh)（G12c 契约与 (b) 变更命中语义）
- [scripts/control-tower/dev-doc-gatekeeper.sh](scripts/control-tower/dev-doc-gatekeeper.sh)（C6 写集表存在性，spec 阶段写集质量门禁）

## 自检清单

- [x] 创始人决策原文核实（台账 CT-34：豁免 12 组 + 保留 Secrets + 归属 DSH）
- [x] 卡点行号实测（组 6 时间戳 L537-545、G12b L921-927、组 1b .html L226-236、组 7b L607、G12 skip_re L893、check-secrets 全量扫描 L15-16、GIT_CACHED L113-116、STAGED L118、par_start L120、L189 STAGED_ALL、bypass L99-111）
- [x] 生产调用链 grep 实测（.git/hooks/pre-commit:4、synova-commit:35、install-hooks.sh:45）
- [x] 吸收 D382 草案调研（工作区 SYNOVA-IMPL-DSH-D382-doc-commit-exempt-20260816.md——撞车前身，创始人裁决"走分配器拿新号"；其组 1b/7b/幽灵变量 CHANGED_FILES/hook-block-write 发现全部并入本 doc；白名单"目录+扩展名双约束"与"技能不进白名单"按其 Q4 契约采纳）
- [x] 写集对账时机推演（G12c (b) 变更命中 → spec 纯文档必漂移 → 早退分支仅 Secrets，决策 §3.2 记录）
- [x] 测试策略对齐先例（today-by-name.test.sh sed 提取函数体 + eval 单测 → is_doc_only 函数化；secrets-env-exempt.test.sh 沙箱 + SYNO_SECRETS_ROOT 注入）
- [x] 环境依赖陷阱规避（D316：T1/T7 端到端只断言输出标记，不硬断言 exit code——GATEKEEPER 行为依赖真实 bypass.log）
- [x] 白名单正则实战验证（10 应豁免路径全匹配 + 10 应不豁免路径全拒绝，含 docs/secret.ts 防藏代码、技能、.codex/、.github/、settings.json）
- [x] 早退分支代码 bash -n 语法通过 + 模拟运行验证（DOC_ONLY=1 → 早退 → 真实 check-secrets.sh 全链路 → exit 0）
- [x] red 路径已定义（T1/T2 修复前误拦路径，§4.7）
- [x] 决策参考已记录（§3.2，S-12）：七决策点均走参考系且收敛
- [x] DS 与 dev doc 一一对应（DS1-14，S-10）；无 phantom 声称（S-11）
- [x] 写集表格式合规（`### 3.1 写集 (1 修改 + 1 新建)`，标题后直接表头行，D381 格式契约）
- [x] 不是凭记忆
- [x] 不用 --no-verify
