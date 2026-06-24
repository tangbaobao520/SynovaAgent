# Loop Engineering v3.0 — 完整部署手册

> **目标读者**: 另一个 Claude 实例（需独立完成部署，不依赖本文档外的任何上下文）
> **最后更新**: 2026-06-18
> **验证状态**: ✅ 已在 SynovaAgent `feat/prompt-architecture` 分支上完整运行

---

## 一、设计哲学

v2.5 有 38 项 pre-commit + 12 脚本 + 3 次 tsc/vitest 重跑，导致 `--no-verify` 泛滥——被绕过的门禁 = 没有门禁。

v3.0 **只设 5 项物理阻断**（全 <5s），其他交给 agent 自检和 PostToolUse 自动化。越少越会被执行。

### 执法架构: 五层精简

```
📋 任务启动 (人工)   →  task-start.sh — 3 问翻译意图→规格
🧠 写前注入 (自动)    →  hook-check-memory.sh — 历史教训
🔒 写前门禁 (自动)    →  hook-block-write.sh — task brief 7字段质量
🛡️ 写前阻断 (自动)    →  hook-enforce-v25.sh — loop-state 物理阻断
✍️ 写后验证 (自动)    →  verify-incremental.sh — L1 oxlint → L2 tsc → L3 vitest → L4 接线
🔴 提交阻断 (自动)    →  pre-commit 5 项 — 全部 <5s
🚀 推送阻断 (自动)    →  pre-push 1 项 — secrets 终扫
```

| 时机 | 脚本 | 阻断 | 耗时 |
|------|------|------|------|
| PreToolUse | hook-check-memory.sh (教训注入) | 不阻断 | <1s |
| PreToolUse | hook-block-write.sh (task brief 字段) | 🔴 阻断 | <1s |
| PreToolUse | hook-enforce-v25.sh (loop-state) | 🔴 阻断 | <1s |
| PostToolUse | verify-incremental.sh (L1→L4) | 🔴 阻断 | 5-30s |
| pre-commit | pre-commit-check.sh (5 项) | 🔴 阻断 | <5s |
| pre-push | pre-push-check.sh (secrets 终扫) | 🔴 阻断 | <3s |

---

## 二、文件清单（13 个文件，需全部创建）

### 2.1 目录结构

```
项目根目录/
├── .claude/
│   ├── settings.local.json          ← Claude Code hooks 配置（下面有完整内容）
│   ├── agents/
│   │   └── architecture-auditor.md   ← 架构审计员 Agent 定义
│   └── task-briefs/                  ← task brief 存放目录（自动创建）
├── .git/hooks/
│   ├── pre-commit                    ← → scripts/pre-commit-check.sh
│   ├── pre-push                      ← → scripts/pre-push-check.sh
│   ├── commit-msg                    ← → scripts/commit-msg-check.sh
│   └── post-commit                   ← → scripts/workflow/decide-next.sh
├── scripts/
│   ├── check-secrets.sh              ← secrets 扫描（pre-commit + pre-push 共用）
│   ├── commit-msg-check.sh           ← Conventional Commits 格式强制
│   ├── pre-commit-check.sh           ← 5 项硬阻断（主门禁）
│   ├── pre-push-check.sh             ← secrets 终扫（最后防线）
│   └── workflow/
│       ├── task-start.sh             ← 任务启动（3 问 → task brief）
│       ├── generate-task-brief.py    ← task brief 模板生成
│       ├── hook-check-memory.sh      ← memory/ 历史教训注入（实际在 scripts/hooks/）
│       ├── hook-block-write.sh       ← task brief 质量门禁
│       ├── hook-enforce-v25.sh       ← loop-state 物理阻断（实际在 scripts/hooks/）
│       ├── verify-incremental.sh     ← PostToolUse 4 层增量验证
│       ├── decide-next.sh            ← post-commit 决策建议
│       ├── check-boundaries-incremental.sh ← 增量架构边界检查
│       ├── check-spec.sh             ← SPEC 文档存在性检查
│       ├── check-test-first.sh       ← 测试先行检查
│       ├── check-dataflow-alignment.sh ← 数据流一致性检查
│       ├── run-auditor.sh            ← 架构审计员包装脚本
│       ├── wire-check.sh             ← 接线完整性检查
│       ├── checkpoint-design.sh      ← 设计节点检查
│       ├── checkpoint-impl.sh        ← 实现节点检查
│       ├── checkpoint-deploy.sh      ← 部署后验证
│       └── checkpoint-runtime.sh     ← 运行时检查
├── scripts/hooks/
│   ├── hook-check-memory.sh          ← 实际位置（settings.local.json 引用此路径）
│   └── hook-enforce-v25.sh            ← 实际位置（settings.local.json 引用此路径）
└── memory/                           ← 项目记忆目录（存放历史教训 .md 文件）
```

> ⚠️ **路径注意**: `hook-check-memory.sh` 和 `hook-enforce-v25.sh` 实际存放在 `scripts/hooks/`，
> settings.local.json 引用 `scripts/hooks/` 路径。CLAUDE.md 写的是 `scripts/workflow/`——文档不一致但不影响功能。

---

## 三、核心文件完整内容

### 3.1 `.claude/settings.local.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/workflow/verify-incremental.sh",
            "statusMessage": "验证改动..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/hooks/hook-check-memory.sh",
            "statusMessage": "注入历史教训..."
          },
          {
            "type": "command",
            "command": "bash scripts/workflow/hook-block-write.sh"
          },
          {
            "type": "command",
            "command": "bash scripts/hooks/hook-enforce-v25.sh",
            "statusMessage": "验证 v2.5 合规..."
          }
        ]
      }
    ]
  }
}
```

> **说明**: `permissions.allow` 数组省略——根据项目实际需求配置 Bash/Read/WebFetch 权限。

### 3.2 `scripts/workflow/task-start.sh`

```bash
#!/bin/bash
# Loop Engineering v3.0 — 任务启动 (Task Start)
# 用法: bash scripts/workflow/task-start.sh "你的任务描述"
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TASK_DESC="${*:-未命名任务}"
TASK_SLUG=$(echo "$TASK_DESC" | head -c 40 | tr ' ' '-' | tr -cd 'a-zA-Z0-9-')
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
BRIEF_FILE="$ROOT/.claude/task-briefs/${TIMESTAMP}-${TASK_SLUG}.md"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Loop Engineering v3.0 — 任务启动${RESET}"
echo -e "${CYAN}  先想清楚，再动手。${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  任务: ${TASK_DESC}"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 自动健康检查
echo -e "${CYAN}📊 代码库快照${RESET}"
cd "$ROOT"

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
AS_ANY=$(grep -rn "as any" src/ --include="*.ts" 2>/dev/null | grep -v "\.test\." | grep -v "node_modules" | wc -l | tr -d ' ') || AS_ANY=0
echo "  分支: ${BRANCH}  |  as any: ${AS_ANY}"

if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo -e "  ${RED}⚠ 当前在 ${BRANCH} 分支！铁律 34: 禁止直接在 main 上 commit。${RESET}"
  echo "  请先: git checkout -b feat/<任务名>"
fi

if [ "${AS_ANY:-0}" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠ 仓库中有 ${AS_ANY} 处 as any，建议先清理${RESET}"
fi
echo ""

# 3 个问题
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}  请在 task brief 中回答以下 3 个问题后再开始写代码${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

echo -e "${YELLOW}Q1: 调研 — 这件事以前怎么做的？${RESET}"
echo "  a) 业界最佳实践"
echo "  b) 顶级团队怎么做"
echo "  c) memory/ 里我们犯过的错"
echo ""

echo -e "${YELLOW}Q2: 范围 — 最简方案是什么？${RESET}"
echo "  最小可行实现是什么？什么可以不做？MVP 边界在哪？"
echo ""

echo -e "${YELLOW}Q3: 验收 — 做完后用户能看到什么？${RESET}"
echo "  入口 → 交互 → 结果，三环节各是什么？"
echo ""

echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

# 生成 Task Brief
mkdir -p "$(dirname "$BRIEF_FILE")"
BRIEF_FILE="$BRIEF_FILE" TASK_DESC="$TASK_DESC" BRANCH="$BRANCH" AS_ANY="$AS_ANY" python3 "$ROOT/scripts/workflow/generate-task-brief.py"

echo -e "${GREEN}✅ Task Brief 已生成: .claude/task-briefs/${TIMESTAMP}-${TASK_SLUG}.md${RESET}"
echo ""
echo "  填写 Q1/Q2/Q3 和 Done 标准后，开始写代码。"
echo "  pre-commit 会在提交时物理检查 task brief 是否存在。"
echo ""
exit 0
```

### 3.3 `scripts/workflow/generate-task-brief.py`

```python
#!/usr/bin/env python3
"""Loop Engineering v3.0 — 生成 task brief (7 字段 + 代码库快照)."""
import os
from datetime import datetime

brief_file = os.environ.get('BRIEF_FILE', '.claude/task-briefs/brief.md')
task = os.environ.get('TASK_DESC', '未命名任务')
branch = os.environ.get('BRANCH', 'main')
as_any = os.environ.get('AS_ANY', '0').strip()
now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

# ⚠️ 以下模板中的占位符需替换为项目实际值
content = f"""# Task Brief: {task}

> 生成: {now} | 分支: {branch} | as any: {as_any}

## 项目身份（每次重读）

- [填写项目名称] = [一句话定位]
  核心问题：[这个系统要回答什么问题？]
- [Agent/ChatBot/CLI/Web 等定位说明]
- 架构层级：[如: L1(交互)→L2(编排)→L3(洞察)→L4(本体)→L5(存储)]
- [N] 位专家: [列出专家名称]
- 完整数据流: [简要描述]

## Q1: 调研 — 这件事以前怎么做的？

### a) 业界最佳实践
<!-- 你的训练数据里，这类问题有什么已知的设计模式、库、架构方案？ -->

### b) 顶级团队怎么做
<!-- 顶级工程团队拿到这个任务，会怎么分解？先做什么、后做什么？ -->

### c) 我们犯过的错
<!-- 在 memory/ 里搜索相关关键词。我们以前做过类似的事吗？犯过什么错？ -->

## Q2: 范围 — 最简方案是什么？

<!-- 最小可行实现是什么？什么可以不做？MVP 边界在哪里？ -->

## Q3: 验收 — 做完后用户能看到什么？

<!-- 入口 → 交互 → 结果，三环节各是什么？ -->

## 本任务在哪一层
<!-- L1/L2/L3/L4/L5？触及哪几层？有没有跨层风险？ -->

## 文档引用
<!-- 全量对齐手册哪些章节和本任务相关？引用具体节号。 -->

## 接口审计
<!-- 本任务调用的关键函数签名（从代码 grep 来的，不凭记忆） -->
<!-- 格式: 文件名:函数名(参数) → 返回类型 -->

## 数据流
<!-- 输入来自哪里 → 经过哪些文件/函数 → 输出到哪里 -->

## Done 标准
- [ ] 入口可触达:
- [ ] 链路走通:
- [ ] 结果可见:
"""

os.makedirs(os.path.dirname(brief_file), exist_ok=True)
with open(brief_file, 'w', encoding='utf-8') as f:
    f.write(content)
print('done: ' + brief_file)
```

> ⚠️ **部署时修改**: 模板中的"项目身份"部分需替换为目标项目的实际名称、定位、架构层数、专家列表。

### 3.4 `scripts/hooks/hook-check-memory.sh`

```bash
#!/bin/bash
# PreToolUse Hook: 从 memory/ 中提取与当前任务相关的历史教训
# 挂在 PreToolUse hook (AI 写代码前自动触发)
# 不阻断 (信息注入型, 非门禁型)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MEMORY_DIR="$ROOT/memory"
TODAY=$(date +%Y-%m-%d)

# 1. 找到当前 task brief
BRIEF=$(find "$ROOT/.claude/task-briefs/" -name "${TODAY}*" 2>/dev/null | head -1)
if [ -z "$BRIEF" ]; then
  echo "[hook-check-memory] 无今日 task brief, 跳过教训注入"
  exit 0
fi

# 2. 从 task brief 提取关键词
KEYWORDS=$(grep -oE '[一-鿿]{2,8}|expert|feishu|memory|sentinel|bridge|connector|graph|store|phase|pipeline|\b[A-Z][a-z]+[A-Z]\w*' "$BRIEF" 2>/dev/null \
  | sort -u | head -30 || true)

if [ -z "$KEYWORDS" ]; then
  echo "[hook-check-memory] task brief 无有效关键词, 跳过"
  exit 0
fi

# 3. 检查 memory/ 是否有匹配关键词的教训
MATCHED_MEMORIES=""
while IFS= read -r memfile; do
  [ -z "$memfile" ] && continue
  [ ! -f "$memfile" ] && continue
  basename=$(basename "$memfile")
  if echo "$basename" | grep -qE '^MEMORY\.md$|^project-state'; then continue; fi

  while IFS= read -r kw; do
    [ -z "$kw" ] && continue
    [ ${#kw} -lt 2 ] && continue
    if grep -qi "$kw" "$memfile" 2>/dev/null; then
      MATCHED_MEMORIES="${MATCHED_MEMORIES}${memfile}"$'\n'
      break
    fi
  done <<< "$KEYWORDS"
done < <(find "$MEMORY_DIR" -name "*.md" -type f 2>/dev/null || true)

MATCHED_MEMORIES=$(echo "$MATCHED_MEMORIES" | sort -u | grep -v '^$' || true)

if [ -z "$MATCHED_MEMORIES" ]; then
  echo "[hook-check-memory] 无匹配教训"
  exit 0
fi

# 4. 输出教训摘要
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  错误预防: memory/ 中匹配的历史教训                          ║"
echo "╠══════════════════════════════════════════════════════════════╣"

while IFS= read -r memfile; do
  [ -z "$memfile" ] && continue
  name=$(basename "$memfile" .md)
  why=$(grep -A1 "^\*\*Why:\*\*" "$memfile" 2>/dev/null | head -2 | tr '\n' ' ' || true)
  how=$(grep -A1 "^\*\*How to apply:\*\*" "$memfile" 2>/dev/null | head -2 | tr '\n' ' ' || true)

  echo "║"
  echo "║  📋 ${name}"
  if [ -n "$why" ]; then
    echo "║     Why: ${why:0:120}"
  fi
  if [ -n "$how" ]; then
    echo "║     How: ${how:0:120}"
  fi
done <<< "$MATCHED_MEMORIES"

echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

MATCH_COUNT=$(echo "$MATCHED_MEMORIES" | grep -c . 2>/dev/null) || MATCH_COUNT=0
echo "[hook-check-memory] 注入 ${MATCH_COUNT} 条相关教训到上下文"
exit 0
```

### 3.5 `scripts/workflow/hook-block-write.sh`

完整内容见项目文件 `scripts/workflow/hook-block-write.sh`（175 行）。

**核心功能**:
1. 从 stdin JSON 读取 `tool_input.file_path`
2. 例外放行: `.claude/task-briefs/`、`scripts/workflow/hook-*`
3. **7 字段质量检查**（全部非空 = 硬阻断）:
   - 项目身份（必须含指定关键词）
   - Q1 调研（非空 + >10 字符）
   - Q2 范围（非空 + >5 字符）
   - Q3 验收（非空 + >5 字符）
   - 架构层级（必须含 L1-L5）
   - 文档引用（非空 + >5 字符）
   - 接口审计（非空 + >5 字符）
4. **接口真实性反向验证**: 解析 "接口审计" 区域中的 `文件名:函数名` → grep 确认函数真实存在
5. **层级确认**: 文件路径 vs task brief 声明的层级是否匹配（允许相邻层）

> ⚠️ **部署时修改**: 步骤 1 中的"项目身份"关键词匹配需要替换为目标项目的核心定位词。
> 步骤 8 中的目录→层级映射需匹配目标项目的目录结构。

### 3.6 `scripts/hooks/hook-enforce-v25.sh`

```bash
#!/bin/bash
# PreToolUse 物理强制: 上一轮验证未通过 → 禁止写代码
# .claude/loop-state.json 存在 = 上一轮验证失败 → 物理阻断 Write
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATE_FILE="$ROOT/.claude/loop-state.json"

RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

INPUT=$(cat 2>/dev/null || echo '{}')
FILE=$(echo "$INPUT" | python3 -c "
import json,sys
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', data)
    fp = ti.get('file_path', '') if isinstance(ti, dict) else ''
    print(fp)
except:
    print('')
" 2>/dev/null)

# 例外放行
if echo "$FILE" | grep -qE '\.claude/(task-briefs|settings|plans|specs|worktrees|loop-state)/'; then
  exit 0
fi
if echo "$FILE" | grep -qE 'scripts/(hooks|workflow)/hook-'; then
  exit 0
fi

# 物理强制检查
if [ -f "$STATE_FILE" ]; then
  ITER=$(python3 -c "
import json
try:
    d=json.load(open('$STATE_FILE'))
    print(d.get('iteration', '?'))
except:
    print('?')
" 2>/dev/null || echo "?")

  MAX=$(python3 -c "
import json
try:
    d=json.load(open('$STATE_FILE'))
    print(d.get('maxIterations', '?'))
except:
    print('?')
" 2>/dev/null || echo "?")

  echo ""
  echo -e "${RED}⛔ 物理阻断 — 上一轮验证未通过，禁止写代码${RESET}"
  echo ""
  echo -e "${YELLOW}  原因:${RESET}  verify-incremental.sh 上一轮退出非零"
  echo -e "${YELLOW}  本轮:${RESET}  $ITER / $MAX"
  echo -e "${YELLOW}  文件:${RESET}  $FILE"
  echo ""
  echo "  修复步骤:"
  echo "    1. 查看上面 verify-incremental.sh 的输出，定位失败原因"
  echo "    2. 修复代码"
  echo "    3. 手动运行验证: bash scripts/workflow/verify-incremental.sh"
  echo "    4. 验证通过后，再重新 Write"
  echo ""
  echo -e "${CYAN}  提示: 如果已达上限 ($ITER/$MAX)，请人工介入${RESET}"
  echo ""
  exit 1
fi

exit 0
```

### 3.7 `scripts/workflow/verify-incremental.sh`

```bash
#!/bin/bash
# verify-incremental.sh — PostToolUse 分层增量验证
#
# L1: oxlint 语法检查 (< 1s, 改动文件)
# L2: tsc --noEmit --incremental (利用 .tsbuildinfo 缓存, 5-15s)
# L3: vitest run --changed (仅匹配的测试文件, 5-30s)
# L4: 接线审计 + 暗默失败 + 架构边界
#
# exit 0 = 全部通过 (清除循环计数)
# exit 1 = 验证失败 (AI 在同一会话内看到输出并修正)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

# ═══ 1. 循环计数 ═══
STATE_FILE="$ROOT/.claude/loop-state.json"
MAX=5
if [ -f "$STATE_FILE" ]; then
  ITER=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('iteration',0))" 2>/dev/null || echo 0)
  ITER=$((ITER + 1))
else
  ITER=1
fi

if [ "$ITER" -gt "$MAX" ]; then
  echo -e "${RED}[LOOP] 已达最大循环次数 $MAX，停止自动修正。请人工介入。${RESET}"
  rm -f "$STATE_FILE"
  exit 0
fi

python3 -c "
import json
json.dump({'iteration': $ITER, 'maxIterations': $MAX, 'lastRun': '$(date -u +%Y-%m-%dT%H:%M:%SZ)'}, open('$STATE_FILE', 'w'))
" 2>/dev/null

echo -e "${CYAN}[VERIFY $ITER/$MAX] 分层增量验证开始...${RESET}"
CHANGED_SRC=$(git diff --name-only 2>/dev/null | grep '\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)

# ═══ L1: oxlint 语法检查 ═══
if [ -n "$CHANGED_SRC" ]; then
  echo -e "${CYAN}[L1] oxlint 语法检查...${RESET}"
  OXLINT_AVAILABLE=$(which oxlint 2>/dev/null || echo "")
  if [ -n "$OXLINT_AVAILABLE" ]; then
    OXLINT_FILES=$(echo "$CHANGED_SRC" | tr '\n' ' ')
    if npx oxlint $OXLINT_FILES --silent 2>&1; then
      echo -e "${GREEN}  L1 语法: 通过${RESET}"
    else
      echo -e "${RED}[FAIL] L1 语法检查失败 — 请修正语法错误${RESET}"
      exit 1
    fi
  else
    echo -e "${YELLOW}  L1 语法: oxlint 未安装, 跳过 (建议: npm install -D oxlint)${RESET}"
  fi
fi

# ═══ L2: tsc --noEmit --incremental ═══
if [ -n "$CHANGED_SRC" ]; then
  echo -e "${CYAN}[L2] tsc 类型检查 (incremental)...${RESET}"
  if npx tsc --noEmit --incremental 2>&1 | grep -E "^src/|^tests/" | head -20; then
    TSC_ERRORS=$(npx tsc --noEmit --incremental 2>&1 | grep -cE "^src/|^tests/" || echo 0)
    if [ "${TSC_ERRORS:-0}" -gt 0 ]; then
      echo -e "${RED}[FAIL] L2 类型检查: ${TSC_ERRORS} 个错误${RESET}"
      exit 1
    fi
  fi
  echo -e "${GREEN}  L2 类型: 通过${RESET}"
fi

# ═══ L3: vitest run --changed (增量测试) ═══
if [ -n "$CHANGED_SRC" ]; then
  TEST_FILES=""
  while IFS= read -r src; do
    [ -z "$src" ] && continue
    test_file=$(echo "$src" | sed 's|^src/|tests/|; s|\.ts$|.test.ts|')
    if [ -f "$test_file" ]; then
      TEST_FILES="$TEST_FILES $test_file"
    fi
  done <<< "$CHANGED_SRC"

  if [ -n "$TEST_FILES" ]; then
    echo -e "${CYAN}[L3] vitest ($(echo $TEST_FILES | wc -w) test files)...${RESET}"
    if npx vitest run $TEST_FILES 2>&1; then
      echo -e "${GREEN}  L3 测试: 通过${RESET}"
    else
      echo -e "${RED}[FAIL] L3 测试失败 — 请修正后重新保存文件${RESET}"
      exit 1
    fi
  fi
fi

# ═══ L4: 综合门禁 (接线 + 架构 + 暗默失败 + 用户可见) ═══
echo -e "${CYAN}[L4] 综合门禁...${RESET}"

# L4a. 接线审计 (新文件 export 验证)
NEW_FILES=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
if [ -n "$NEW_FILES" ]; then
  UNWIRED=""
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      if echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated'; then continue; fi
      # ⚠️ 入口文件列表需匹配目标项目
      WIRED=$(grep -rn "\b${name}\b" src/server.ts src/index.ts src/cli.ts src/agent/ src/routes/ src/sentinel/builtins.ts --include="*.ts" 2>/dev/null | grep -v "export.*${name}" | grep -v "import.*${name}" | grep -v "$file" | head -1 || true)
      if [ -z "$WIRED" ]; then
        UNWIRED="${UNWIRED}  ${file}: export ${name} — 未在生产入口中接线\n"
      fi
    done
  done <<< "$NEW_FILES"
  if [ -n "$UNWIRED" ]; then
    echo -e "${RED}[FAIL] 接线审计失败:${RESET}"
    echo -e "$UNWIRED"
    exit 1
  fi
fi

# L4b. 增量架构边界
CHANGED_SRC2=$(git diff --name-only 2>/dev/null | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
if [ -n "$CHANGED_SRC2" ]; then
  if bash "$ROOT/scripts/workflow/check-boundaries-incremental.sh" 2>&1; then
    :
  else
    echo -e "${RED}[FAIL] 架构边界违规${RESET}"
    exit 1
  fi
fi

# L4c. 暗默失败检查
TS_DIFF=$(git diff -- '*.ts' '*.tsx' 2>/dev/null || true)
if [ -n "$TS_DIFF" ]; then
  NEW_CATCHES=$(echo "$TS_DIFF" | grep "^\+.*catch\s*(" 2>/dev/null || true)
  NEW_CATCHES=$(echo "$NEW_CATCHES" | grep -v "catch.*log\.\|catch.*logger\|catch.*throw\|catch.*degraded" || true)
  if [ -n "$NEW_CATCHES" ]; then
    SILENT=""
    while IFS= read -r catch_line; do
      [ -z "$catch_line" ] && continue
      AFTER=$(echo "$TS_DIFF" | grep -A3 "$catch_line" | tail -3)
      if ! echo "$AFTER" | grep -qE "log\.|logger\.|console\.|throw |return.*degraded"; then
        SILENT="${SILENT}  ${catch_line}\n"
      fi
    done <<< "$NEW_CATCHES"
    if [ -n "$SILENT" ]; then
      echo -e "${RED}[FAIL] 暗默失败: 新增 catch 无 log:${RESET}"
      echo -e "$SILENT"
      exit 1
    fi
  fi
fi

# ═══ 全部通过 → 清除循环状态 ═══
rm -f "$STATE_FILE"
echo -e "${GREEN}[PASS] 增量验证全部通过 — 循环计数已重置${RESET}"
echo ""
echo "如果修改了接口签名，请更新 task brief 的接口审计字段。"
exit 0
```

> ⚠️ **部署时修改**: L4a 接线审计中的入口文件列表 (`src/server.ts src/index.ts src/cli.ts src/agent/ src/routes/ src/sentinel/builtins.ts`) 需替换为目标项目的实际入口文件。

### 3.8 `scripts/pre-commit-check.sh`

```bash
#!/bin/bash
# Loop Engineering v3.0 — pre-commit 物理阻断 (5 项, 全部 <1s)
#
# 5 项硬阻断:
#   1. as any = 0
#   2. empty catch → log
#   3. secrets 扫描
#   4. 新文件 → 有测试
#   5. 新 export → 有调用方
set +e

HARD_FAIL=0
RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'

hard_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${RED}❌ ${name}: ${count} 处  [硬阻断]${RESET}"
    echo "$matches" | while read -r line; do echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
  fi
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep '\.ts$' | grep -v node_modules || true)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Loop Engineering v3.0 — pre-commit (5 项)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. as any = 0
M=$(grep -rn 'as any\b' src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "\.d\.ts" || true)
hard_check "铁律 38: as any 零容忍" "$M"

# 2. empty catch → log
EMPTY=""
if [ -n "$STAGED" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    CATCHES=$(grep -n "catch\s*{" "$file" 2>/dev/null || true)
    if [ -n "$CATCHES" ]; then
      while IFS= read -r cline; do
        linenum=$(echo "$cline" | cut -d: -f1)
        ctx=$(sed -n "${linenum},$((linenum + 2))p" "$file" 2>/dev/null || echo "")
        if ! echo "$ctx" | grep -qE "log\.|logger\.|console\.|/\*|//"; then
          EMPTY="${EMPTY}${file}:${linenum}: 空 catch (无 log)\n"
        fi
      done <<< "$CATCHES"
    fi
  done <<< "$STAGED"
fi
hard_check "铁律 24+31: empty catch 无 log" "${EMPTY:-}"

# 3. secrets 扫描
bash "$ROOT/scripts/check-secrets.sh"
[ $? -ne 0 ] && HARD_FAIL=$((HARD_FAIL + 1))

# 4. 新文件 → 有测试
NEW_IMPL=$(git diff --cached --name-only --diff-filter=A 2>/dev/null \
  | grep "^src/" | grep "\.ts$" | grep -v "\.test\." | grep -v "\.d\.ts" \
  | grep -v "types\.ts$\|index\.ts$\|helpers\.ts$" || true)
MISSING_TEST=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r impl; do
    [ -z "$impl" ] && continue
    test_path=$(echo "$impl" | sed 's|^src/|tests/|; s|\.ts$|.test.ts|')
    if ! git diff --cached --name-only 2>/dev/null | grep -q "^${test_path}$"; then
      if [ ! -f "$test_path" ]; then
        MISSING_TEST="${MISSING_TEST}${impl} → 缺少 ${test_path}\n"
      fi
    fi
  done <<< "$NEW_IMPL"
fi
hard_check "新文件配对: impl 必须同 commit 有 test" "${MISSING_TEST:-}"

# 5. 新 export → 有调用方
UNWIRED=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated' && continue
      # ⚠️ 入口文件列表需匹配目标项目
      WIRED=$(grep -rn "\b${name}\b" src/server.ts src/index.ts src/agent/ src/routes/ src/sentinel/builtins.ts --include="*.ts" 2>/dev/null \
        | grep -v "export.*${name}" | grep -v "$file" | head -1 || true)
      if [ -z "$WIRED" ]; then
        UNWIRED="${UNWIRED}${file}: export ${name} — 未在生产入口中接线\n"
      fi
    done
  done <<< "$NEW_IMPL"
fi
hard_check "接线审计: 新 export 必须有调用方" "${UNWIRED:-}"

echo ""
if [ "$HARD_FAIL" -gt 0 ]; then
  echo -e "  ${RED}❌ ${HARD_FAIL} 项未通过 — 提交已拒绝${RESET}"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}✅ 5/5 全部通过${RESET}"
  echo ""
  exit 0
fi
```

### 3.9 `scripts/pre-push-check.sh`

```bash
#!/bin/bash
# Loop Engineering v3.0 — pre-push (1 道门: secrets 终扫)
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Loop Engineering v3.0 — pre-push (secrets 终扫)"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo -e "${CYAN}── secrets 终扫 (最后防线) ───────────────────────────${RESET}"
bash "$SCRIPT_DIR/check-secrets.sh" || {
  echo ""
  echo -e "  ${RED}❌ secrets 扫描未通过 — 推送已拒绝${RESET}"
  echo "  API key 一旦推到 GitHub, 轮换成本极高。请修复后重试。"
  exit 1
}

echo ""
echo -e "  ${GREEN}✅ secrets 终扫通过 — 允许推送${RESET}"
echo ""
exit 0
```

### 3.10 `scripts/check-secrets.sh`

完整内容见项目文件 `scripts/check-secrets.sh`（164 行）。

**核心检查**:
1. 全工作区扫描（不限于暂存区）
2. `.claude/` 目录专项扫描
3. `.env` 意外暂存检查
4. `.gitignore` 必须含 `.env`
5. 源码硬编码密钥扫描
6. 本地 `.env` 真实 Key 检测

> ⚠️ **部署时修改**: 排除列表中的模型名称和平台标识需根据目标项目使用的 LLM 提供商调整。

### 3.11 `scripts/workflow/check-boundaries-incremental.sh`

```bash
#!/bin/bash
# check-boundaries-incremental.sh — 增量架构边界检查
# 只检查本次 git diff 中的 .ts 文件是否有跨层引用
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'

CHANGED_FILES=$(git diff --name-only 2>/dev/null | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

VIOLATIONS=0

while IFS= read -r file; do
  [ -z "$file" ] && continue
  [ ! -f "$file" ] && continue

  IMPORTS=$(grep "^import\|from" "$file" 2>/dev/null | grep -v "import type" || true)
  if [ -z "$IMPORTS" ]; then continue; fi

  case "$file" in
    # ⚠️ 以下目录/层级映射需匹配目标项目的架构
    src/routes/*|src/tui/*|src/l1*/*)
      if echo "$IMPORTS" | grep -qE "from '\.\./(l3|l4|l5)/|from '\.\./store/|from '\.\./sentinel/" 2>/dev/null; then
        MATCH=$(echo "$IMPORTS" | grep -E "from '\.\./(l3|l4|l5)/|from '\.\./store/|from '\.\./sentinel/")
        echo -e "${RED}[L1→L3/L4/L5] $file 跨层引用:${RESET}"
        echo "  $MATCH"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
      ;;

    src/agent/*|src/orchestrator/*|src/l2*/*)
      # 桥接服务豁免
      if echo "$file" | grep -qE "bridge-service|knowledge-bridge|review-service|sentinel-health-service|sentinel-service"; then
        continue
      fi
      if echo "$IMPORTS" | grep -qE "from '\.\./(l4|l5)/|from '\.\./store/" 2>/dev/null; then
        MATCH=$(echo "$IMPORTS" | grep -E "from '\.\./(l4|l5)/|from '\.\./store/")
        echo -e "${RED}[L2→L4/L5] $file 跨层引用:${RESET}"
        echo "  $MATCH"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
      ;;

    src/l3/*|src/sentinel/*)
      if echo "$IMPORTS" | grep -qE "from '\.\./routes/|from '\.\./store/" 2>/dev/null; then
        MATCH=$(echo "$IMPORTS" | grep -E "from '\.\./routes/|from '\.\./store/")
        echo -e "${RED}[L3→L1/L5] $file 跨层引用:${RESET}"
        echo "  $MATCH"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
      ;;
  esac
done <<< "$CHANGED_FILES"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "发现 ${VIOLATIONS} 处跨层引用。请重构。"
  exit 1
fi

exit 0
```

> ⚠️ **部署时修改**: case 分支中的目录路径和桥接服务名称需匹配目标项目的实际架构。

### 3.12 `.git/hooks/pre-commit`

```bash
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-commit-check.sh"
```

### 3.13 `.git/hooks/pre-push`

```bash
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-push-check.sh"
```

### 3.14 `.git/hooks/commit-msg`

```bash
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/commit-msg-check.sh" "$1"
```

### 3.15 `.git/hooks/post-commit`

```bash
#!/bin/bash
# post-commit — 每次提交后自动运行决策流程
bash "$(git rev-parse --show-toplevel)/scripts/workflow/decide-next.sh"
```

### 3.16 `.claude/agents/architecture-auditor.md`

```markdown
---
name: architecture-auditor
description: 严格审计代码是否符合架构约束、接口真实性、数据流完整性
model: [目标项目使用的模型]
---

# 审计员指令

你是架构审计员。你的唯一任务是验证，不修改代码。

## 审计清单

1. **接口真实性** — 读取 task brief 接口审计字段，grep 验证每个函数签名真实存在
2. **架构边界** — 检查本次 diff 是否有跨层引用
3. **数据流完整性** — task brief 数据流中每个箭头对应的函数调用链真实存在
4. **信号消费** — 如涉及信号聚合，确认输出被下游消费

## 输出格式

每个审计项: [PASS/FAIL] 说明
如果任何一项 FAIL: 在输出末尾写 `AUDIT_FAILED=true`
```

---

## 四、部署步骤

### Step 1: 创建目录结构

```bash
mkdir -p scripts/workflow
mkdir -p scripts/hooks
mkdir -p .claude/agents
mkdir -p .claude/task-briefs
mkdir -p memory
```

### Step 2: 写入所有脚本文件

按第三章的完整内容，逐一创建 10 个脚本文件 + 4 个 hook 文件 + 1 个 agent 文件。

```bash
# 赋予执行权限
chmod +x scripts/workflow/*.sh
chmod +x scripts/hooks/*.sh
chmod +x scripts/pre-commit-check.sh
chmod +x scripts/pre-push-check.sh
chmod +x scripts/check-secrets.sh
chmod +x scripts/commit-msg-check.sh
chmod +x .git/hooks/*
```

### Step 3: 修改项目特定配置

以下文件中包含项目特定路径/名称，必须替换：

| 文件 | 需替换的内容 |
|------|------------|
| `generate-task-brief.py` | 项目身份模板（项目名称、定位、架构层数、专家列表） |
| `hook-block-write.sh` | 项目身份关键词（第50行附近的 grep 关键词）、目录→层级映射（case 分支） |
| `verify-incremental.sh` | 入口文件列表（L4a 和 L4d 中的 `src/server.ts src/index.ts ...`） |
| `pre-commit-check.sh` | 入口文件列表（第5项检查中的 `src/server.ts src/index.ts ...`） |
| `check-boundaries-incremental.sh` | case 分支中的目录路径、桥接服务名称 |
| `check-secrets.sh` | LLM 模型名称排除列表 |
| `architecture-auditor.md` | model 字段 |
| `decide-next.sh` | 专家列表和架构描述 |

### Step 4: 验证安装

```bash
# 1. 语法检查（全部应输出 OK）
for f in \
  scripts/workflow/task-start.sh \
  scripts/workflow/generate-task-brief.py \
  scripts/hooks/hook-check-memory.sh \
  scripts/workflow/hook-block-write.sh \
  scripts/hooks/hook-enforce-v25.sh \
  scripts/workflow/verify-incremental.sh \
  scripts/pre-commit-check.sh \
  scripts/pre-push-check.sh \
  scripts/check-secrets.sh \
  scripts/workflow/check-boundaries-incremental.sh \
  scripts/workflow/decide-next.sh; do
  if [ -f "$f" ]; then
    bash -n "$f" 2>&1 && echo "$f: OK" || echo "$f: SYNTAX ERROR"
  else
    echo "$f: MISSING"
  fi
done

# 2. 确认 hooks 配置存在
cat .claude/settings.local.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('PreToolUse hooks:', len(d.get('hooks',{}).get('PreToolUse',[]))); print('PostToolUse hooks:', len(d.get('hooks',{}).get('PostToolUse',[])))"

# 3. 确认 git hooks 接线
for hook in pre-commit pre-push commit-msg post-commit; do
  if [ -x ".git/hooks/$hook" ]; then
    echo ".git/hooks/$hook: ✅"
  else
    echo ".git/hooks/$hook: ❌ MISSING"
  fi
done

# 4. 跑一次 verify-incremental.sh（无改动时应该 PASS）
bash scripts/workflow/verify-incremental.sh
```

### Step 5: 安装 oxlint（可选，但推荐）

```bash
npm install -D oxlint
```

---

## 五、日常使用流程

```
1. 开始新任务:
   bash scripts/workflow/task-start.sh "你的任务描述"
   → 编辑生成的 .claude/task-briefs/YYYY-MM-DD-HHMM-xxx.md
   → 填写 Q1/Q2/Q3 和 Done 标准

2. 写代码:
   → PreToolUse hook 自动触发: 教训注入 + task brief 质量门禁 + loop-state 阻断
   → 写文件后 PostToolUse hook 自动触发: L1→L2→L3→L4 验证
   → 验证失败 → AI 在同一会话看到输出 → 自动修正 → 最多 5 轮

3. 提交:
   git add ... && git commit -m "feat(xxx): 描述"
   → pre-commit 5 项自动运行
   → post-commit 自动建议下一步

4. 推送:
   git push
   → pre-push secrets 终扫
```

---

## 六、循环计数机制

`.claude/loop-state.json` 由 verify-incremental.sh 自动管理：

- **首次失败**: 创建文件 `{"iteration": 1, "maxIterations": 5}`
- **后续失败**: iteration +1
- **达到 5 轮**: 打印失败报告，删除状态文件，停止自动修正
- **验证通过**: 删除状态文件，计数重置
- **PreToolUse 阻断**: hook-enforce-v25.sh 检查此文件，存在 → 拒绝 Write

---

## 七、Agent 自检 5 问（配合 CLAUDE.md）

Loop Engineering v3.0 的 bash 门禁只覆盖 **bash 能做的事**。以下检查由 agent 自我执行：

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？
3. 类型安全: as any = 0？
4. 测试覆盖: 测试有 expect() 断言？（不是空壳）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

建议在项目的 CLAUDE.md 中加入这 5 问。

---

## 八、Windows 兼容性

- pre-commit 仅含 grep（<5s），不含 tsc/vitest（已由 PostToolUse 跑）
- 严禁 `taskkill //IM node.exe` — 会杀死所有 Node 进程
- `--no-verify` 在 v3.0 下不应再需要（pre-commit <5s）
- bash 脚本使用 POSIX 语法，依赖 Git Bash 或 WSL

---

## 九、架构决策记录（ADR）

| 决策 | 原因 |
|------|------|
| PostToolUse 同步模式 | asyncRewake 行为不稳定 |
| tsc/vitest 只在 PostToolUse 跑一次 | pre-commit 和 pre-push 不重复 |
| pre-push 只做 secrets 终扫 | 其他检查已在 pre-commit + PostToolUse 完成 |
| agent 自检替代 bash 语义检查 | bash grep 误报率高（如 `'community'` 被识别为硬编码凭证） |
| 5 项而非 38 项 | `--no-verify` 泛滥——被绕过的门禁 = 没有门禁 |

---

## 十、故障排查

| 症状 | 原因 | 解决 |
|------|------|------|
| `⛔ 物理阻断 — 上一轮验证未通过` | loop-state.json 残留 | 手动 `rm .claude/loop-state.json` 或运行 `verify-incremental.sh` 通过 |
| `⛔ 无今日 task brief` | 未运行 task-start.sh | `bash scripts/workflow/task-start.sh "任务"` |
| `[L1] oxlint 未安装, 跳过` | oxlint 未安装 | `npm install -D oxlint` |
| `[FAIL] L4 接线审计失败` | 新 export 未在入口文件中引用 | 在入口文件中 import 并调用新函数 |
| pre-commit 卡住 >30s | vitest 全量跑（不应发生） | 确认 pre-commit-check.sh 不含 tsc/vitest |
