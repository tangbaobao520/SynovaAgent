<!--
  SYNOVA-IMPL-D328: commit 声明-内容一致性门禁 — 消息 D# 必须 == 暂存文件认领 brief 的 D#
  状态: dev doc | 2026-08-10 | 优先级 P0 (D320 劫持事故根因 RC-1)
  权威文档: AGENTS.md 铁律 0-2/35 + D296 认领制 + D311 staging-guard + D320 劫持复盘
  依赖: 无 (独立; 修复 D320 劫持直接通道)
  并行: D329 写集互斥（D328: scripts/commit-msg-check.sh + tests/control-tower/commit-msg-consistency.test.sh；D329: synova-commit + staging_guard.py + session_registry.py + resolve-commit-brief.sh + VERSION.md）— 零交集；版本编排 V4.7.1 由 D329 独占
-->

# D328: commit 声明-内容一致性门禁

> 一句话问题: 2026-08-10 D320 劫持——`chore(D318)` 提交把 D320 的 8 个文件一起带走，G12（文件∈认领 brief 范围）与 commit-msg（仅格式校验）全部放行。根因: **没有任何物理检查把"提交消息声明的 D#"与"暂存文件实际归属的 brief D#"绑定**。

## 1. 权威文档引用

**来源**: [AGENTS.md 铁律 0-2/35](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 测试先行 + 接线验收；自动化优先——能写 check-*.sh 的不靠 review。

**来源**: [D296 认领制](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\strategy\SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md)

> 每个文件由认领它的 brief 判定；跨 session 污染根治。

## 2. 代码审计——现状 (2026-08-10 实测)

### 2.1 缺陷 A (P0): 提交声明与内容归属无一致性校验

**实测**（D320 劫持提交 c576e2b，标题 `chore(D318): 双机身份与 hooks 可移植`，内容含 D320 的 8 个文件）：

1. [pre-commit-check.sh G12](D:\novis-backup-20260526\Novis\synova-agent\scripts\pre-commit-check.sh:820)：只验证"staged 文件 ∈ ≥1 个今日 brief 的 Q2 范围"——D320 文件被 D320 brief 认领 → **通过**。G12 不读提交消息，不知道提交者声明的是 D318。
2. [commit-msg-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\commit-msg-check.sh)：仅校验 Conventional Commits 格式（`type(scope): subject`，scope 自由文本）+ issue 引用建议（warning 不阻断）——**无任何 D# 一致性比对**。
3. 结论：`chore(D318): ...` 提交 D320 文件，两道门禁全过——劫持通道敞开。

### 2.2 现状确认

- [resolve-commit-brief.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh)：输入暂存文件列表 → 输出认领 brief 路径（认领制，D296）；brief 文件名含 D#（如 `D320-dashboard-gitify.md`）。
- commit-msg-check.sh 接收 `$1` = 提交消息文件；hook 运行时暂存区仍在（`git diff --cached` 可用）。
- 既有豁免先例：commit-msg-check.sh 已对 `Merge / Revert` exit 0。

## 3. 实现方案

### 3.1 写集 (1 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/commit-msg-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\commit-msg-check.sh) | 修改 | 格式校验后追加 D# 一致性检查：解析消息 scope D# + 用 resolve-commit-brief.sh 取暂存文件认领 brief 的 D# → 两者都存在且不一致 → 硬阻断（exit 1 + 明确提示）；消息无 D# 但认领 brief 有 D# → 硬阻断；Merge/Revert/无暂存文件/认领 brief 无 D# → 跳过（fail-open） |
| [tests/control-tower/commit-msg-consistency.test.sh](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\commit-msg-consistency.test.sh) | 新建 | 一致性门禁测试（≥5 用例，见 §4；**真实劫持场景 = red 基准**） |

> 版本: V4.7.1 批次由 D329 独占 VERSION.md（本任务不碰）。

### 3.2 修复模式（commit-msg-check.sh 追加）

> 最终实现回填（D329 折入 PYBIN + D330 三态修复，2026-08-12）——本片段为提交时真实代码；此前的裸 `python3` 参考代码已废弃。

```bash
# ── D328: 提交声明-内容一致性（防并行劫持）──
# 消息 scope D#（chore(D318): → D318）vs 暂存文件真实认领 brief 的 D#
MSG_DID=$(head -1 "$1" 2>/dev/null | grep -oE '\(D[0-9]+\)' | head -1 | tr -d '()') || true # swallow-ok: 消息文件异常时声明为空 → fail-open 不误伤
STAGED_LIST=$(git diff --cached --name-only 2>/dev/null || true)
if [ -n "$STAGED_LIST" ]; then
  MSG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"          # D317 自包含
  MSG_DIR_W="$(cygpath -w "$MSG_DIR" 2>/dev/null || echo "$MSG_DIR")" # Windows/MSYS 边界
  # D329 折入 PYBIN: python3→python→py 跨平台回退; D330 加可用性验证 —
  # command -v 只验存在性, Windows Store stub/损坏 shim 存在但执行即败
  PYBIN=""
  for _c in python3 python py; do
    if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then
      PYBIN="$_c"
      break
    fi
  done
  if [ -z "$PYBIN" ]; then
    echo -e "${YELLOW}⚠ D328 一致性检查跳过: python 不可用或损坏（fail-open 显式提示，不静默）${RESET}"
  fi
  # D330: resolver 失败（broken-shim 下其内部 PYBIN 无可用性验证 → exit 1）
  # 捕获 rc — 失败且无 brief → 显式 degraded 提示（dev doc §4: 提示+跳过可追溯）
  CLAIM_RC=0
  CLAIM_BRIEF=$(bash "$MSG_DIR/workflow/resolve-commit-brief.sh" "$STAGED_LIST" 2>/dev/null | head -1) || CLAIM_RC=$? # swallow-ok: resolver 失败 → degraded 提示
  if [ -n "$CLAIM_BRIEF" ] && [ -f "$CLAIM_BRIEF" ] && [ -n "$PYBIN" ]; then
    # 防假阳性: 仅当 resolver 返回的 brief 真实认领了 ≥1 个暂存文件才比较 D#；
    # 走最终回退（无真实认领）时跳过——未认领场景由 G12 兜底阻断。
    # D330 三态: 0=无真实认领(跳过) / 1=有真实认领(比较 D#) / rc≠0=degraded(显式)
    GENUINE_RC=0
    GENUINE=$(echo "$STAGED_LIST" | "$PYBIN" -c "
import re, sys
sys.path.insert(0, r'$MSG_DIR_W/control-tower')
from brief_parser import parse_q2, match_path
staged = [s for s in sys.stdin.read().split('\n') if s.strip()]
text = open(r'$CLAIM_BRIEF', encoding='utf-8', errors='replace').read()
inc = parse_q2(text).get('include', [])
print(1 if any(match_path(s, p) for s in staged for p in inc) else 0)
" 2>/dev/null) || GENUINE_RC=$? # swallow-ok: 执行失败 → 三态 degraded 显式提示
    if [ "$GENUINE_RC" != 0 ]; then
      echo -e "${YELLOW}⚠ D328 一致性检查 degraded: GENUINE 判定执行失败 (rc=$GENUINE_RC)，本次跳过${RESET}"
    elif [ "$GENUINE" = "1" ]; then
      CLAIM_DID=$(basename "$CLAIM_BRIEF" .md | grep -oE 'D[0-9]+' | head -1 || true)
      if [ -n "$CLAIM_DID" ] && { [ -z "$MSG_DID" ] || [ "$CLAIM_DID" != "$MSG_DID" ]; }; then
        echo -e "${RED}❌ D328: 提交声明(${MSG_DID:-无})与暂存文件归属($CLAIM_DID)不一致 — 疑似并行劫持${RESET}"
        echo "   认领 brief: $CLAIM_BRIEF"
        echo "   请确认提交的是本任务文件，或拆分暂存区后再提交"
        exit 1
      fi
    fi
  elif [ "$CLAIM_RC" != 0 ]; then
    echo -e "${YELLOW}⚠ D328 一致性检查 degraded: 认领 brief 解析失败（resolver rc=$CLAIM_RC），本次跳过${RESET}"
  fi
fi
```

> 说明：仅当 resolver 返回的 brief **真实认领**了暂存文件（Q2 include 命中）才比较 D#——避免"最终回退选中无关 brief"导致的假阳性误伤。消息 D# 与认领 D# 不一致 = 提交者声明与内容脱钩（劫持特征）→ 物理阻断。
>
> **降级显式化（D330，KIMI K3 P1-1）**：`|| echo 0` 曾把"检查未执行"与"检查通过=无真实认领"压缩成同一个 0（铁律 24/31 违规）——现为三态：输出 0 = 无真实认领（G12 兜底）；输出 1 = 有真实认领（比较 D#）；执行失败 rc≠0 = 显式 degraded 提示（fail-open 可追溯，绝不静默）。
>
> **跨天边界**：resolve-commit-brief 只认"今日 mtime"的 brief（D296 语义）——跨天提交时 brief 不在今日候选，检查走跳过路径（不误伤），但劫持检测也随之失效；跨天需 `touch` brief 或重跑 task-start（D296 既有教训）。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 改 G12 本体 | G12 职责是范围校验，D# 一致性归 commit-msg（有消息上下文） |
| 处理 staging-guard 时序盲区 | D329 独立任务（session 身份 + 认领制判定） |
| 历史劫持提交重写 | 已推送历史不重写；D328 起防新劫持 |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 新建 `tests/control-tower/commit-msg-consistency.test.sh`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| **真实劫持场景**：临时 repo + D320 风格 brief（认领 gen-task-board.py）+ 暂存该文件 + 消息 `chore(D318): 测试` → 断言 exit 1 | 当前 exit 0（放行=劫持复现）→ 断言失败 | exit 1 硬阻断 |
| 一致场景：消息 `chore(D320): ...` + D320 文件 → exit 0 | 已过 | 不变 |
| 消息无 D#（`chore: 无 scope`）+ 认领 brief 有 D# → exit 1 | 当前 exit 0 | exit 1 |
| Merge 提交 → 跳过 exit 0 | 已过 | 不变 |
| 认领 brief 无 D#（basename 无 D 号）→ fail-open 跳过 | 已过 | 不变 |
| **无真实认领（resolver 回退到无关 brief）→ 跳过不误伤** | 当前无检查恒 exit 0（red 断言 exit 0 通过=平凡） | exit 0 且不比较（防假阳性） |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | shell 单元（新建） | ≥5 | 上述 5 用例（正常/降级/边界/劫持/豁免） |
| L1 | 真实回归 | 1 | 临时 repo：stage c576e2b 的 8 个文件 + 消息 `chore(D318): ...` → exit 1（证明能拦住同类事故；c576e2b 已提交不可直接复现，须临时 repo 构造） |

> 临时 repo 用 `mktemp -d` + `git init` + 今日 mtime 的 brief（resolve-commit-brief 按 mtime 找今日 brief）；commit-msg-check.sh 以 `bash scripts/commit-msg-check.sh <msg文件>` 单测（先 `git add` 构造暂存态）。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| commit-msg hook 执行新检查 | `.git/hooks/commit-msg` 调用 commit-msg-check.sh（现有）；真实提交消息与暂存文件不一致时被拒 |
| resolve-commit-brief 复用 | grep 确认 commit-msg-check.sh 调用 resolve-commit-brief.sh |
| 豁免路径 | Merge/Revert/无暂存/无 D# 不误伤（测试覆盖） |

## 6. 完成标准

1. DS1: `tests/control-tower/commit-msg-consistency.test.sh` 全过（≥5 用例；**真实劫持场景修复前 exit 0 → 修复后 exit 1 已证**）
2. DS2: 临时 repo stage c576e2b 的 8 个文件 + `chore(D318)` 消息 → 新门禁 exit 1（同类劫持被物理拦截）
3. DS3: 一致提交（消息 D# == 认领 brief D#）不被误伤（测试 + 真实提交回归）
4. DS4: Merge/无 D# 测试覆盖 + Revert/无暂存手动实测（D330 已补两用例，声称与覆盖一致）
5. DS5: 版本由 D329 批次 V4.7.1 覆盖（本任务不碰 VERSION.md）
6. DS6: 全量审计 `python scripts/audit/audit-check.py --full` 与基线一致（439 FAIL）+ as any=0
7. DS7: 真实提交环境 12 组 pre-commit 全过、无 --no-verify、`git diff --name-only` 与写集一致

## 7. 自检清单

- [x] c576e2b 劫持提交实测（标题 D318 / 内容 D320 8 文件）
- [x] G12 只验范围、commit-msg 只验格式——无一致性校验实测确认
- [x] resolve-commit-brief 输入输出契约实测确认（暂存文件 → 认领 brief）
- [x] commit-msg hook 时机：暂存区仍在（`git diff --cached` 可用）确认
- [x] 测试优先：真实劫持场景 = red 基准（§4 表）
- [x] 不是凭记忆
- [x] 不用 --no-verify
