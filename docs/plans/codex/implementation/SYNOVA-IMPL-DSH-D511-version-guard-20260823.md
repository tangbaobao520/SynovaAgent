---
north-star:
  服务用户: 编码 session + CTO（控制塔维护者）——痛点：门禁行为变更不 bump 版本靠创始人指出才发现（V4.8.0 后 D467/D501/D503/D506/D507/D508 六批未 bump，CT-42 教训第二次违反），版本管理靠记忆无物理强制
  服务场景: 编码 session 改 scripts/control-tower/ 或门禁脚本（scripts/pre-commit-check.sh/scripts/workflow/scripts/install-hooks.sh）→ pre-commit 必须看到同 commit 的 VERSION.md bump，否则提交被硬阻断——"bump 与代码同 commit"从规范条文变成物理强制
  模块终态: 版本守卫门禁（V4.9.1）——改门禁不 bump = 提交失败（fail-closed）；纯文档/非门禁文件零打扰（不误拦）；逃生舱 SYNO_SKIP_VERSION_GUARD 显式降级（记 degraded-events.log）；D511 自身提交吃自己的药（带 V4.9.1 bump 通过）
  对齐北星: 版本管理规范-控制塔.md §四待办（CT 队列："pre-commit 增加版本守卫——改 scripts/control-tower/ 或门禁脚本且 VERSION.md 无 bump → 硬阻断（物理强制，不靠自觉）"）+ AGENTS.md 铁律 35（自动化优先：能写 check-*.sh 的不靠 review）+ 控制塔减负精神（不打扰纯文档/非门禁提交）
  完成标准: ①模拟"改门禁不 bump"被拦（tests/control-tower/version-guard.test.sh 可复现，red→green）②D511 自身提交带 V4.9.1 bump 通过（吃自己的药）③纯文档/非门禁文件提交零打扰（不误拦）④逃生舱降级显式记录
  当前进度: 规范已建（2026-08-23，创始人触发）+ VERSION.md 已补 V4.9.0（D506/D507/D508 批次）；但"待办: pre-commit 版本守卫"零实现（无 check-version-guard.sh，pre-commit 13 组无版本检查）
---

<!--
  SYNOVA-IMPL-DSH-D511: 版本守卫门禁（控制塔 V4.9.1 候选）
  状态: dev doc | 2026-08-23 | 优先级 P1（CT-42 教训第二次违反，创始人指出）
  权威文档: 版本管理规范-控制塔.md（§四待办）+ 审计发现台账 CT-42 + VERSION.md（V4.9.0 格式基准）+ AGENTS.md 铁律 35 + 并行派单 97f85b20
  依赖: 无（独立门禁机制）
  并行: 与 D510（electron/）零领地重叠；与 D512（golden-scenarios）零重叠——D511 只碰 scripts/ 门禁 + tests/control-tower + VERSION.md
-->

# SYNOVA-IMPL-DSH-D511: 版本守卫门禁

> 一句话问题: 控制塔版本 bump 靠记忆无物理强制——V4.8.0（08-15）之后 D467 挪 CI、D501 as-any 排除、D503 G12 时区、D506/D507/D508 批次共**六批门禁行为变更全部未 bump**（git log 实测：5848de18/43a2c61a/223efb05 commit 均无 VERSION.md 变更），CT-42 教训第二次违反，靠创始人指出才发现。版本管理规范 §四已把"pre-commit 版本守卫"列为待办（CT 队列），本任务机器化：**改门禁不 bump = 提交失败**。

## 1. Authority Doc Verification

**来源**: [版本管理规范-控制塔.md](docs/synova/coordination/版本管理规范-控制塔.md)（2026-08-23 建立，§一/§四）

> §一 铁律 1: 任何控制塔行为变更必须 bump 版本（PATCH 起步；新机制/新门禁组 = MINOR）。铁律 2: **bump 与代码同 commit**（VERSION.md + version.log + 改动代码一个提交）。铁律 3: tag 跟随（合并 main 后打 V<x.y.z>）。铁律 4: 一处定义三处同步（VERSION.md 人类可读 + version.log 机器可读 + git tag）。| §二 什么算"行为变更": 门禁判定逻辑变化 PATCH/MINOR；新增机制/门禁组 MINOR；bug 修复不改语义（注释/文案）可不 bump；工作流脚本行为变化 PATCH 起步。| §四 历史检讨: **待办（CT 队列）: pre-commit 增加版本守卫——改 scripts/control-tower/ 或门禁脚本且 VERSION.md 无 bump → 硬阻断（物理强制，不靠自觉）**。

**来源**: [审计发现台账](docs/synova/coordination/审计发现台账-DSH-CTO.md)（CT-42）

> CT-42 仪表盘完整性专项……① CI 状态入仪表盘（CT-39 并入）……（版本 bump 纪律：D506/D507/D508 三批门禁改版未升版本号——创始人指出，CT-42 教训第二次违反）。

**来源**: [VERSION.md](.codex/control-tower/VERSION.md)（V4.9.0 条目，格式基准）

> ## V4.9.0 (2026-08-23) — D506/D507/D508 批次……## V4.8.0 (2026-08-15) — D307 批次……（版本只增不减；最新版本 = 首个 `## Vx.y.z (date)` 标题）

**来源**: [AGENTS.md](AGENTS.md) 铁律 35 + [D331](docs/synova/audit-reports/2026-08-13-D331.md)（fail-closed 教训）

> 铁律 35: 自动化优先——能写 check-*.sh 的不靠 review。D331: "检查没跑 ≠ 检查通过"——守卫自身失败必须 fail-closed（逃生舱显式记录，不静默跳过）。

## 2. Problem Statement

控制塔版本管理三处断裂（实测，2026-08-23）：
1. **六批未 bump**：V4.8.0 后 D467（5848de18 挪 CI）、D501（43a2c61a as-any 排除）、D503（223efb05 G12 时区）、D506/D507/D508（V4.9.0 批次）的门禁行为变更 commit 均无 VERSION.md 变更——git log 实测 `git show <commit> --name-only | grep VERSION.md` = 0。
2. **规范§四待办零实现**：无 check-version-guard.sh；pre-commit-check.sh 13 组无任何版本检查（grep 实测：`VERSION|version` 在 pre-commit 中仅文档注释，无守卫逻辑）。
3. **bump 靠记忆**：规范§四原文"根因：bump 靠记忆无物理强制"。

## 3. Q0-Q4

### 3.1 Q0 定位 — 项目拼图 + 文件审计

**a) 项目拼图**: 控制塔基础设施（门禁体系）。pre-commit 现有 13 组（组 1-13），本任务加**组 14 版本守卫**——不改任何既有组判定逻辑（派单约束）。检测面 = 门禁相关文件暂存 + VERSION.md 无同 commit 变更 → 拦。

**b) 文件审计**（grep 实测，2026-08-23）:
| 文件 | 现状 | 复用/扩展/新建 |
|------|------|------|
| scripts/pre-commit-check.sh | 13 组结构；STAGED_ALL（L183）；DOC_ONLY 早退（L189，纯文档豁免）；收尾 exit 1（L1177） | 修改（组 14 接线，放 DOC_ONLY 之后） |
| scripts/control-tower/ | 无 check-version-guard.sh | 新建守卫脚本 |
| .codex/control-tower/VERSION.md | V4.9.0 为最新（`## V4.9.0 (date)` 标题格式） | 修改（V4.9.1 条目，吃自己的药） |
| .codex/control-tower/version.log | 文件不存在（运行态，control_tower_log.py 生成） | 追加（V4.9.1 行，control_tower_log.py version 命令） |
| tests/control-tower/ | 40+ 测试（.test.sh 模式：set -uo pipefail + ok/no 计数 + SYNO_ 注入缝） | 新建 version-guard.test.sh |
| scripts/check-secrets.sh 等 | 门禁辅助脚本 | 只读（检测面成员） |

**c) 决策**: 组 14 独立脚本 + pre-commit 接线（不改 13 组）；白名单 = DOC_ONLY 早退天然豁免 + 非门禁文件不触发。

### 3.2 Q1 调研 — 业界最佳实践 / Anthropic 决策链 / memory 教训

**业界最佳实践**:
- **SemVer 机器守卫**: 业界标准（semver.org + CI 工具如 semantic-release）——版本 bump 是 CI/pre-commit 物理检查，不靠开发者记忆。本项目形态 = pre-commit 检查"门禁文件变更 ⟹ VERSION.md 同 commit 变更"。
- **fail-closed 守卫**: 守卫自身失败（无法解析 VERSION.md）→ 拦（不静默放行）——D331 教训"检查没跑 ≠ 检查通过"。逃生舱必须显式（记 degraded-events.log，铁律 11 静默降级禁止）。
- **Anthropic 基线**: 最小机制（独立脚本 + 一行接线）；机器可验契约（测试三路径）；不打扰（纯文档豁免走 DOC_ONLY 既有机制）。

**memory/ 教训**:
- CT-42（第二次违反）: bump 靠记忆必漏——物理强制是唯一解（规范§四原文）。
- D331（fail-closed）: 守卫自身失败不能静默通过——逃生舱要记日志。
- D508（提交减负）: 门禁增加要注意"减负"——守卫只拦门禁文件变更，纯文档/普通代码零打扰。

**收敛**: 检测面（门禁文件）+ 检查（VERSION.md 同 commit）+ 逃生舱（显式降级）+ 纯文档豁免（DOC_ONLY）。**参考：Anthropic（fail-closed + 最小机制）+ DeepSeek（反内卷：只拦真门禁变更，不打扰普通提交）+ 第一性原理（版本可信 = bump 可机器验证）**。

### 3.3 Q2 范围 — 正确的最简方案

**做什么**（对应写集 §5.1）:
1. 新建 `scripts/control-tower/check-version-guard.sh`——检测面匹配 + VERSION.md 同 commit 检查 + 逃生舱 + 三态退出
2. `scripts/pre-commit-check.sh` 组 14 接线（放 DOC_ONLY 早退之后、既有组之后）
3. `VERSION.md` V4.9.1 条目（同 commit，吃自己的药）+ version.log 追加
4. `tests/control-tower/version-guard.test.sh`（red→green 三路径）

**不做什么**（详见 §6）: 不改 13 组判定逻辑；不自动改版本号（只检测+提示级别）；不做 MAJOR 判定；不动 git tag 流程（合并后 CTO 打）。

### 3.4 Q3 验收 — 入口 → 交互 → 结果

- **入口**: 编码 session 改 `scripts/control-tower/check-version-guard.sh`（新脚本）→ pre-commit 组 14
- **交互**: 模拟"改门禁不 bump"（暂存门禁文件无 VERSION.md）→ 组 14 硬阻断；同 commit 带 bump → 放行
- **结果**: `tests/control-tower/version-guard.test.sh` 全过 + D511 自身提交（改 pre-commit-check.sh + VERSION.md V4.9.1）通过——吃自己的药

### 3.5 Q4 契约与测试（铁律 47/48 — 写代码前定义）

**check-version-guard.sh 契约**:
```
@input  （环境）: STAGED_ALL 或 git diff --cached --name-only（暂存文件清单）
        GATE_FILES_RE: ^(scripts/control-tower/|scripts/pre-commit-check\.sh|scripts/workflow/|scripts/install-hooks\.sh|scripts/hooks/|scripts/check-.*\.sh)
        VERSION_MD: .codex/control-tower/VERSION.md
        SYNO_SKIP_VERSION_GUARD: 逃生舱（=1 跳过 + 记 degraded-events.log）
@output exit 0 = 通过（无门禁文件变更 / VERSION.md 同 commit 变更 / 逃生舱）
        exit 1 = 硬阻断（门禁文件变更且 VERSION.md 无同 commit 变更）
        exit 2 = 守卫自身降级（VERSION.md 无法解析 → fail-closed 拦 + 提示——D331）
@degraded — 逃生舱启用 → 记 degraded-events.log（铁律 11 不静默）；VERSION.md 解析失败 → exit 2 显式
@error    — 无（纯 shell，全捕获）
```

**测试三路径（red→green）**: 拦（门禁文件无 bump）/ 放行（同 commit 带 bump）/ 跳过（纯文档、非门禁文件、逃生舱）。

## 4. Current State — 代码审计（2026-08-23 grep/read 实测）

### 4.1 缺陷 A（P0）: 门禁行为变更无版本守卫——六批未 bump 实证

git log 实测（2026-08-23）: `git show 5848de18 --name-only`（D467 挪 CI）、`git show 43a2c61a --name-only`（D501 as-any）、`git show 223efb05 --name-only`（D503 G12 时区）——**均无 .codex/control-tower/VERSION.md 变更**（`grep -c VERSION.md` = 0）。V4.9.0（D506/D507/D508）是创始人指出后补 bump。规范§四原文: "bump 靠记忆无物理强制"。

### 4.2 缺陷 B（P0）: 规范§四待办零实现

[pre-commit-check.sh](scripts/pre-commit-check.sh): grep `VERSION|version` 仅注释/echo 文案，无守卫调用；scripts/control-tower/ 无 check-version-guard.sh。13 组结构: 组 1-13（L304-1146），收尾 L1177 `exit 1`。**组 14 位置 = DOC_ONLY 早退（L189）之后 + 既有组之后**。

### 4.3 现状接线（grep 实测，供组 14 复用）

| 符号 | 位置 | 说明 |
|------|------|------|
| `STAGED_ALL` | pre-commit-check.sh L183 | `git diff --cached --name-only --diff-filter=ACMR`（含 .sh 门禁文件）——守卫检测面输入 |
| `DOC_ONLY` | pre-commit-check.sh L184-189 | 纯文档早退（CT-34）——守卫放 DOC_ONLY 之后则纯文档天然不触发 ✅ |
| `hard_check` | pre-commit-check.sh 各处 | 组失败计入 exit 1（L1177）——组 14 复用同款（标题不带分母——避免改 13 处既有标题） |
| `degraded-events.log` | .codex/control-tower/degraded-events.log | 逃生舱记录目标（既有机制） |
| VERSION.md 最新版本 | .codex/control-tower/VERSION.md | 首个 `## Vx.y.z (date)` 标题 = 最新 |

## 5. What We Build

### 5.1 写集 (3 修改 + 3 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/control-tower/check-version-guard.sh](scripts/control-tower/check-version-guard.sh) | 新建 | 版本守卫：检测面匹配 + VERSION.md 同 commit 检查 + 逃生舱 + 三态退出（契约 §3.5）。纯 bash 无外部依赖 |
| [scripts/pre-commit-check.sh](scripts/pre-commit-check.sh) | 修改 | 组 14 接线：DOC_ONLY 早退之后调用 check-version-guard.sh；`exit 2`（守卫降级）→ hard_check 显式提示；**同 commit 必须带 VERSION.md V4.9.1 bump（吃自己的药——本文件修改本身触发守卫）** |
| [.codex/control-tower/VERSION.md](.codex/control-tower/VERSION.md) | 修改 | 顶部插 **V4.9.1 条目**（格式对齐 V4.9.0：`## V4.9.1 (2026-08-23) — D511 版本守卫门禁` + 变更明细 + 验证 + 作者） |
| [.codex/control-tower/version.log](.codex/control-tower/version.log) | 修改 | 追加 V4.9.1 行（`control_tower_log.py version --version 4.9.1 --changes "D511 版本守卫门禁"`；若文件不存在则创建） |
| [tests/control-tower/version-guard.test.sh](tests/control-tower/version-guard.test.sh) | 新建 | 守卫测试：拦/放行/跳过/逃生舱/接线（≥7 用例，见 §7） |
| [docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D511-version-guard-20260823.md](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D511-version-guard-20260823.md) | 新建 | 本 dev doc |

### 5.2 修复模式（编码 session 实现蓝图）

**check-version-guard.sh 核心逻辑**:

```bash
#!/bin/bash
# check-version-guard.sh — 版本守卫（D511，V4.9.1）
# 契约: 门禁文件变更 ⟹ VERSION.md 同 commit bump，否则 exit 1（fail-closed）
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION_MD="$ROOT/.codex/control-tower/VERSION.md"
DEGRADED_LOG="$ROOT/.codex/control-tower/degraded-events.log"
# 检测面: 门禁相关文件（与规范§一 4 一致）
GATE_FILES_RE='^(scripts/control-tower/|scripts/pre-commit-check\.sh|scripts/workflow/|scripts/install-hooks\.sh|scripts/hooks/|scripts/check-[^/]+\.sh)'

# 逃生舱（显式降级，铁律 11 不静默）
if [ "${SYNO_SKIP_VERSION_GUARD:-}" = "1" ]; then
  echo "⚠ 版本守卫跳过（SYNO_SKIP_VERSION_GUARD=1）— 记 degraded-events.log"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) version-guard skip by env SYNO_SKIP_VERSION_GUARD" >> "$DEGRADED_LOG" 2>/dev/null || true
  exit 0
fi

# 1. 暂存文件清单（注入缝: SYNO_STAGED_FILES 测试用）
STAGED="${SYNO_STAGED_FILES:-$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)}"
# 2. 门禁文件命中检测
GATE_HITS=$(echo "$STAGED" | grep -E "$GATE_FILES_RE" | grep -v '^scripts/control-tower/check-version-guard\.sh$' || true)  # 守卫自身新文件豁免? 否——见下
[ -z "$GATE_HITS" ] && { echo "✅ 无门禁文件变更 — 跳过"; exit 0; }
# 3. VERSION.md 同 commit 变更检查
if echo "$STAGED" | grep -q '^\.codex/control-tower/VERSION\.md$'; then
  echo "✅ 门禁变更带 VERSION.md bump — 通过"; exit 0
fi
# 4. fail-closed: 门禁变更无 bump → 硬阻断
echo "❌ 版本守卫: 门禁文件变更必须同 commit bump VERSION.md（规范§一铁律 2）"
echo "   变更文件: $(echo "$GATE_HITS" | tr '\n' ' ')"
echo "   bump 指引: ①VERSION.md 顶部插 ## Vx.y.z 条目（新增门禁组=MINOR，判定逻辑改=PATCH）②version.log 追加"
echo "   （注释/文案类改动也需 bump 或走 SYNO_SKIP_VERSION_GUARD=1 逃生舱——宁紧勿松，CT-42 教训）"
exit 1
```

**pre-commit 组 14 接线（DOC_ONLY 早退之后）**:

```bash
# 组 14: 版本守卫（D511）——门禁文件变更须同 commit bump VERSION.md
VERSION_GUARD_OUT=$(bash "$ROOT/scripts/control-tower/check-version-guard.sh" 2>&1 || true)
case "$VERSION_GUARD_OUT" in
  *"版本守卫: 门禁文件变更必须"*) hard_check "组 14: 版本守卫 — 门禁变更未 bump VERSION.md" "$VERSION_GUARD_OUT" ;;
  *"fail-closed"*|*"无法解析"*) hard_check "组 14: 版本守卫降级（fail-closed，D331）" "$VERSION_GUARD_OUT" ;;
  *) soft_pass "组 14: 版本守卫" ;;
esac
```

> ⚠️ **吃自己的药**：本任务修改 `scripts/pre-commit-check.sh`（门禁文件）本身触发守卫 → **VERSION.md 的 V4.9.1 条目必须与代码同 commit**（规范§一铁律 2）——这是验收项，也是守卫正确性的自证。

**bump 级别判定（提示性，非阻断）**: 守卫只检测"有没有 bump"；级别由 VERSION.md 条目内容体现——新增门禁组（组 14）= MINOR → 建议 V4.9.0 → **V4.9.1**？否——新增门禁组按规范§二 = **MINOR**（第二位）→ 应为 **V4.10.0**？规范§二: "新增机制/组件/门禁组（如 --check、worktree 门禁）MINOR"。V4.9.0 后新增组 14 = MINOR → **V4.10.0**。

> ⚠️ 修正: 派单标题写"V4.9.1 候选"，但规范§二明确新增门禁组 = MINOR（第二位）→ 正确版本应为 **V4.10.0**。spec 以规范为准（派单的"V4.9.1"是 PATCH 口径，低估了新增门禁组的级别）。**决策: bump 到 V4.10.0**（编码 session 按 V4.10.0 写 VERSION.md 条目；若 CTO 坚持 V4.9.1 以 CTO 为准，spec 记录分歧）。

### 5.3 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| bump 级别 | A V4.9.1（派单标题 PATCH）/ B V4.10.0（新增门禁组=MINOR，规范§二） | 规范§二原文（"新增机制/组件/门禁组 MINOR"）+ 第一性原理（新增组 14 是中升级非微调） | **B V4.10.0**——规范权威高于派单标题；编码 session 若 CTO 已派 V4.9.1 则记录分歧后随 CTO |
| 白名单（注释/文案豁免） | A 任何门禁文件变更都要求 bump / B 注释/文案豁免（解析 diff 非注释行） | CT-42 教训（宁紧勿松，漏 bump 是事故根因）+ 最少机制（解析非注释行复杂易误判） | **A 全拦 + 逃生舱**——注释/文案改动也 bump（PATCH 起步，成本极低）或走逃生舱；物理判定简单可靠 |
| 守卫形态 | A 独立 check-version-guard.sh + 组 14 接线 / B 内联进 pre-commit | 铁律 35（check-*.sh 独立可测）+ 测试配对（tests/control-tower/ 可直测脚本） | **A**——独立脚本可单测，组 14 只做接线 |
| 逃生舱 | A SYNO_SKIP_VERSION_GUARD=1 / B 无逃生舱 | 既有惯例（SYNO_ALLOW_MAIN_PUSH 等）+ 铁律 11（显式降级） | **A**——紧急修复可跳过但必须记 degraded-events.log（不静默） |

> 收敛检查：四决策点双参考系指向一致（除 bump 级别 A/B 有派单标题 vs 规范冲突——以规范为准并记录分歧）。**参考：Anthropic（fail-closed + 可测）+ DeepSeek（最少机制）+ 第一性原理（版本可信 = bump 可机器验证）**。

### 5.4 编码 session 实现时需再确认的项

1. **bump 级别**：V4.10.0（MINOR，规范§二）vs V4.9.1（派单标题）——以 CTO 最终口径为准；spec 推荐 V4.10.0 并记录分歧（§5.3）。
2. **守卫自身文件豁免**：check-version-guard.sh 新建时其自身是否算"门禁文件变更"——新建脚本本身无需 bump（无行为变更），但 pre-commit-check.sh 接线**是**行为变更 → 必须 bump。编码 session 确认：`grep -v check-version-guard.sh` 豁免自身的必要性（建议豁免新建自身，避免死锁：第一次提交守卫脚本时必须先有 VERSION.md 变更？——守卫第一次跑时检查的是"本次暂存"：新建 check-version-guard.sh + 改 pre-commit + VERSION.md 同 commit → 全过。无需豁免自身）。
3. **version.log 入库策略**：version.log 实测不在 gitignore（`git check-ignore` = NOT-IGNORED）但文件不存在——编码 session 决定随 commit 入库（推荐，机器可读证据链）还是保持运行态（control_tower_log.py 生成）。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 不改 13 组既有判定逻辑 | 派单约束（"不动既有 13 组判定逻辑"）——组 14 只新增 |
| 不自动改版本号（不写 VERSION.md 内容） | 守卫只检测"有没有 bump"；版本号/级别/明细由编码 session 按规范写（§5.2 指引） |
| 不做 MAJOR 判定 | 大改版（架构重构/产品化）是产品决策，非机械可判 |
| 不动 git tag 流程 | tag 合并 main 后 CTO 打（规范§一铁律 3），非 pre-commit 职责 |
| 不改 D510/D512 领地（electron/、golden-scenarios/、workflows/） | 并行派单声明（D511 零重叠） |
| 不豁免注释/文案改动（全拦 + 逃生舱） | 决策 §5.3 A——物理判定简单可靠，宁紧勿松（CT-42） |

## 7. Test Requirements

### 7.1 L1 单元契约（tests/control-tower/version-guard.test.sh，新建）

red→green 对照表（铁律 0-2：测试先行，守卫未实现前用例必须失败）：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| 暂存门禁文件（scripts/control-tower/x.sh）无 VERSION.md → exit 1 拦 | 无守卫脚本 → 文件不存在编译失败 | 组 14 硬阻断 |
| 同 commit 门禁文件 + VERSION.md → exit 0 放行 | 同上 | bump 同 commit 通过 |
| 纯文档（docs/）→ 跳过（DOC_ONLY 早退，守卫不触发） | 同上 | 零打扰 |
| 非门禁文件（src/xxx.ts）→ 跳过 | 同上 | 不误拦普通代码 |
| 逃生舱 SYNO_SKIP_VERSION_GUARD=1 → exit 0 + degraded-events.log 记录 | 同上 | 显式降级不静默 |
| VERSION.md 缺失/不可解析 → exit 2 fail-closed（D331） | 同上 | 守卫自身失败不静默放行 |
| 接线: 组 14 真实调用 check-version-guard.sh（grep pre-commit-check.sh） | 同上 | 铁律 0-2 WIRE CHECK |

### 7.2 L2a 接线（pre-commit 组 14）

- `grep -n "check-version-guard" scripts/pre-commit-check.sh` 非零（组 14 调用存在——铁律 0-2）
- 组 14 位于 DOC_ONLY 早退（L189）之后（纯文档不触发，边界正确）

### 7.3 L2b 降级

- SYNO_SKIP_VERSION_GUARD=1 → 跳过 + degraded-events.log 追加行（grep 断言）
- VERSION.md 解析失败 → exit 2 + 显式提示（fail-closed，D331 不静默）

### 7.4 L2c 边界

- 守卫自身新建（check-version-guard.sh 首次暂存）不误拦（自身无行为变更）
- 检测面边界: scripts/hooks/、scripts/check-*.sh 命中；scripts/product-lines/、scripts/golden-scenarios/、scripts/backup/ 不命中（非门禁）
- 修改 VERSION.md 但无门禁文件 → 不触发守卫（不要求成对反向）

### 7.5 场景级（吃自己的药）

D511 编码 session 提交（改 pre-commit-check.sh + VERSION.md V4.10.0/4.9.1）→ pre-commit 全过——守卫自证（验收项 2）。

## 8. Wiring Verification

| 新 export / 变更 | 生产调用点（真实传递，测试调用不计） | grep 验证 |
|------|------|------|
| `check-version-guard.sh`（新建） | [pre-commit-check.sh](scripts/pre-commit-check.sh) 组 14（DOC_ONLY 之后） | `grep -n "check-version-guard" scripts/pre-commit-check.sh` 非零 |
| 组 14 hard_check 分支 | pre-commit-check.sh 收尾（L1177 exit 1 汇总） | 组 14 失败计入 exit 1（grep hard_check 计数含组 14） |
| VERSION.md bump | 同 commit（D511 自身提交） | `git show <commit> --name-only` 含 VERSION.md |
| 逃生舱 | degraded-events.log（既有机制） | 测试断言日志追加 |

> ⚠️ 铁律 0-2 WIRE CHECK 是硬门禁：`grep -rn "check-version-guard" scripts/pre-commit-check.sh` — 零结果 = 未完成。测试调用不计。

## 9. Architecture Layer

**基础设施（控制塔门禁层）**。理由：
- check-version-guard.sh 在 scripts/control-tower/（门禁脚本区，Mac DSH 领地）——纯 bash 无跨层。
- pre-commit-check.sh 组 14 是门禁执行链的一部分（与组 1-13 同层），不改判定逻辑只新增守卫。
- 不涉及 src/（L1-L5 代码零触碰）、不涉及 extensions/、不产生跨层依赖。
- 按 TASK-ROUTING §一: scripts/control-tower/ + 门禁脚本归 Mac DSH ✅ 纯领地。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. **DS1**: `scripts/control-tower/check-version-guard.sh` 交付——检测面匹配 + VERSION.md 同 commit 检查 + 逃生舱 + 三态退出（契约 §3.5 全字段）
2. **DS2**: `tests/control-tower/version-guard.test.sh` 全过（≥7 用例，§7.1 表，red 已证）
3. **DS3**: pre-commit 组 14 接线——DOC_ONLY 之后调用守卫，exit 2 → hard_check 显式（grep 断言，§8）
4. **DS4**: 模拟"改门禁不 bump"被拦——测试用例复现（§7.1 第一行 red→green）——验收项 1
5. **DS5**: D511 自身提交带 VERSION.md bump 通过（V4.10.0 或 CTO 口径）——吃自己的药，验收项 2
6. **DS6**: version.log 追加 V4.10.0/4.9.1 行（control_tower_log.py version 命令或等价）
7. **DS7**: 纯文档/非门禁文件提交零打扰（DOC_ONLY 早退天然豁免，测试断言）——验收项 3
8. **DS8**: 逃生舱 SYNO_SKIP_VERSION_GUARD=1 → 跳过 + degraded-events.log 记录（测试断言）——验收项 4
9. **DS9**: 全量 vitest + tests/control-tower/ 全部现有测试不回归 + `as any`=0 + 12 组 pre-commit 全过（含组 14）+ 无 --no-verify + `git diff --name-only` 与写集一致
10. **DS10**: 推送 + 分支 feat/d511-version-guard + CI 绿 + `git log origin/feat/d511-version-guard..HEAD` 为空
11. **DS11**: 完成报告含**决策记录**（§5.3 四决策点 + bump 级别分歧 V4.10.0 vs V4.9.1 的记录，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项（S-10）。
> 显式 descope：git tag V4.10.0（合并 main 后 CTO 打，规范§一铁律 3）；MAJOR 版本判定（产品决策）。

## 11. Auth Doc References

| 引用 | 路径 |
|------|------|
| 版本管理规范（§一/§二/§四待办） | docs/synova/coordination/版本管理规范-控制塔.md |
| VERSION.md（V4.9.0 条目格式基准） | .codex/control-tower/VERSION.md |
| CT-42 台账（第二次违反） | docs/synova/coordination/审计发现台账-DSH-CTO.md |
| D331 fail-closed 教训 | docs/synova/audit-reports/2026-08-13-D331.md |
| 铁律 35（自动化优先）+ 铁律 11（静默降级禁止） | AGENTS.md |
| 并行派单（D511/D512/D510 零重叠声明） | docs/synova/coordination/派单-并行-D511-D512-20260823.md（97f85b20） |
| 事故史实证（D467/D501/D503 commit 无 VERSION.md） | git commit 5848de18 / 43a2c61a / 223efb05 |

## 12. 自检清单

- [x] 规范§四待办原文 + 铁律 1-4 逐条核实
- [x] 事故史 git log 实证（D467/D501/D503 commit 均无 VERSION.md 变更）
- [x] pre-commit 13 组结构 + DOC_ONLY 早退位置（L184-189）+ 收尾 exit 1（L1177）实测
- [x] version.log gitignore 状态实测（NOT-IGNORED，文件不存在——§5.4 项 3）
- [x] 检测面文件清单与 TASK-ROUTING 领地一致（scripts/control-tower 归 Mac DSH）
- [x] 决策参考已记录（§5.3，S-12）：四决策点 + bump 级别分歧显式记录
- [x] 派单约束遵守（不改 13 组；吃自己的药）
- [x] 测试先行 red→green（§7.1 表，7 用例）
- [x] 编码 session 待确认项显式列出（§5.4，bump 级别/version.log/自身豁免）
- [x] 不是凭记忆
