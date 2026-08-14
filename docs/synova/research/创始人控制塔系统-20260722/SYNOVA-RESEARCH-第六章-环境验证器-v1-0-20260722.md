<!--
  Synova 创始人控制塔系统 | 第六章：环境验证器
  版本: v1.0 | 日期: 2026-07-22 | 作者: Synova 研究组
  定位: 架构设计文档——定义环境快照的版本管理与启动前自动校验机制，防止"在我机器上能跑"问题
  前置输入: AGENTS.md 铁律 35 (自动化优先), 已知错误 #13 (中文乱码/PowerShell 管道截断 UTF-8), 已知错误 #18 (python3 vs python)
  与前后章节关系: 第五章(外部审计器)验证产出质量 → 第六章(本设计)保证运行环境一致 → 第一章/第二章提供基础架构
-->

# 第六章：环境验证器 (Environment Validator)

> env-snapshot.json 随仓库版本管理 → Agent 启动前自动校验 → 不一致拒绝启动 + 输出差异清单 → 快照更新由创始人手动触发
> 2026-07-22 | 基于 AGENTS.md v4.4.5 铁律 35, 已知错误 #13/#18

---

## 1. 问题定义

### 1.1 核心矛盾

Agent 运行环境的不一致直接导致"在我机器上能跑"问题。历史上：

- **已知错误 #13**: PowerShell 管道截断 UTF-8 输出 → 中文乱码，因为机器编码设置不是 UTF-8
- **已知错误 #18**: pre-commit hook 中写 `python3`，但 Windows 机器上只有 `python` → hook 超时被绕过

这些问题在"一台机器上工作正常，换到另一台机器上崩溃"的场景下尤其隐蔽。创始人可能在不同机器上运行 Agent，或者 CI 环境的工具版本在无人察觉的情况下升级。

**核心主张**: 环境不是一个隐式假设。它必须被显式定义、版本管理、启动前自动校验。快照随仓库一起 commit——这意味着环境定义是有变更历史的。

### 1.2 设计目标

| 目标 | 描述 | 对应铁律 |
|------|------|----------|
| 显式定义 | 环境参数写入 env-snapshot.json，随仓库版本管理 | 铁律 35 (自动化优先) |
| 启动前校验 | Agent 每次启动前执行 validate-env.sh，对比实际环境 vs 快照 | 铁律 35 |
| 拒绝启动 | 环境不一致 → 拒绝启动 + 输出差异清单，不允许在错误环境中运行 | 铁律 31 (降级信号传播) |
| 手动更新 | 快照更新由创始人手动触发（修改 env-snapshot.json + git commit），防止自动更新导致"意外锁定" | 铁律 0 (协作对齐前置) |
| 版本追踪 | 环境变更与代码变更关联——git blame 可以查看到谁/何时/为什么修改了环境要求 | 铁律 34 (Feature Branch 强制) |

---

## 2. env-snapshot.json 定义

### 2.1 Schema

```typescript
// src/env/env-snapshot-schema.ts

interface ToolVersion {
  /** 工具名称 */
  name: string;
  /** 最低版本 (semver) */
  minVersion: string;
  /** 推荐版本 (semver) */
  recommendedVersion: string;
  /** 是否需要严格匹配 (true = 必须精确匹配 recommendedVersion) */
  strictMatch: boolean;
  /** 检查命令 (如 "node --version") */
  checkCommand: string;
  /** 版本提取正则 (从 checkCommand 输出中提取版本号) */
  versionRegex: string;
}

interface EncodingSettings {
  /** 终端编码 */
  terminalEncoding: 'UTF-8' | 'UTF-16' | 'GBK' | 'GB2312';
  /** PowerShell 输出编码 */
  powershellEncoding: 'UTF-8' | 'UTF-16' | 'ASCII';
  /** 默认文件编码 */
  fileEncoding: 'UTF-8' | 'UTF-8-BOM' | 'UTF-16';
  /** Git 配置编码 */
  gitEncoding: 'UTF-8' | 'UTF-16';
}

interface EnvVariable {
  /** 变量名 */
  name: string;
  /** 是否必须存在 */
  required: boolean;
  /** 预期值 (可选，null = 不检查值只检查存在) */
  expectedValue?: string;
  /** 变量用途说明 */
  description: string;
}

interface EnvironmentSnapshot {
  /** Schema 版本 */
  schemaVersion: '1.0.0';
  /** 快照更新时间 (ISO 8601) */
  updatedAt: string;
  /** 更新者 */
  updatedBy: string;
  /** 说明本次变更原因 */
  changeDescription: string;

  /** 操作系统要求 */
  os: {
    /** 允许的操作系统列表 */
    allowed: Array<'linux' | 'darwin' | 'win32'>;
    /** 内核最低版本 (win32 时忽略) */
    kernelMinVersion?: string;
  };

  /** 工具版本要求 */
  tools: ToolVersion[];
  /** 编码设置 */
  encoding: EncodingSettings;
  /** 关键环境变量 */
  envVars: EnvVariable[];
}
```

### 2.2 实际示例

```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-07-22T10:00:00+08:00",
  "updatedBy": "founder",
  "changeDescription": "升级 Node.js 到 22.x LTS，锁定 PowerShell 编码为 UTF-8",

  "os": {
    "allowed": ["linux", "darwin", "win32"],
    "kernelMinVersion": null
  },

  "tools": [
    {
      "name": "node",
      "minVersion": "20.0.0",
      "recommendedVersion": "22.12.0",
      "strictMatch": false,
      "checkCommand": "node --version",
      "versionRegex": "v?(\\d+\\.\\d+\\.\\d+)"
    },
    {
      "name": "python",
      "minVersion": "3.10.0",
      "recommendedVersion": "3.12.0",
      "strictMatch": false,
      "checkCommand": "python --version",
      "versionRegex": "Python (\\d+\\.\\d+\\.\\d+)"
    },
    {
      "name": "powershell",
      "minVersion": "7.2.0",
      "recommendedVersion": "7.4.0",
      "strictMatch": false,
      "checkCommand": "pwsh --version",
      "versionRegex": "PowerShell (\\d+\\.\\d+\\.\\d+)"
    },
    {
      "name": "git",
      "minVersion": "2.40.0",
      "recommendedVersion": "2.47.0",
      "strictMatch": false,
      "checkCommand": "git --version",
      "versionRegex": "git version (\\d+\\.\\d+\\.\\d+)"
    },
    {
      "name": "bash",
      "minVersion": "5.0.0",
      "recommendedVersion": "5.2.0",
      "strictMatch": false,
      "checkCommand": "bash --version",
      "versionRegex": "GNU bash, version (\\d+\\.\\d+\\.\\d+)"
    },
    {
      "name": "npm",
      "minVersion": "10.0.0",
      "recommendedVersion": "10.9.0",
      "strictMatch": false,
      "checkCommand": "npm --version",
      "versionRegex": "^(\\d+\\.\\d+\\.\\d+)"
    },
    {
      "name": "jq",
      "minVersion": "1.6",
      "recommendedVersion": "1.7.1",
      "strictMatch": false,
      "checkCommand": "jq --version",
      "versionRegex": "jq-(\\d+\\.\\d+)"
    },
    {
      "name": "sha256sum",
      "minVersion": "0.0.0",
      "recommendedVersion": "8.32",
      "strictMatch": false,
      "checkCommand": "sha256sum --version",
      "versionRegex": "GNU coreutils (\\d+\\.\\d+)"
    }
  ],

  "encoding": {
    "terminalEncoding": "UTF-8",
    "powershellEncoding": "UTF-8",
    "fileEncoding": "UTF-8",
    "gitEncoding": "UTF-8"
  },

  "envVars": [
    {
      "name": "CODEX_HOME",
      "required": true,
      "expectedValue": null,
      "description": "Codex 安装根目录"
    },
    {
      "name": "CODEX_AGENT_ID",
      "required": true,
      "expectedValue": null,
      "description": "当前运行的 Agent 标识符"
    },
    {
      "name": "LANG",
      "required": false,
      "expectedValue": "en_US.UTF-8",
      "description": "系统语言/编码设置 (Linux/macOS)"
    },
    {
      "name": "PYTHONIOENCODING",
      "required": false,
      "expectedValue": "utf-8",
      "description": "Python 标准输出编码"
    },
    {
      "name": "NODE_OPTIONS",
      "required": false,
      "expectedValue": null,
      "description": "Node.js 运行时选项 (如 --max-old-space-size)"
    }
  ]
}
```

### 2.3 存储位置

```
<REPO_ROOT>/env-snapshot.json
```

随仓库根目录一起版本管理。每次环境变更都有 git 记录。`git log -- env-snapshot.json` 可以追踪环境变更历史。

---

## 3. validate-env.sh

### 3.1 校验流程

```bash
#!/bin/bash
# scripts/validate-env.sh — Agent 启动前环境校验
# 调用: bash scripts/validate-env.sh [--strict]

set -e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SNAPSHOT="$ROOT/env-snapshot.json"
STRICT_MODE=false
VIOLATIONS=0
WARNINGS=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

# 解析参数
[ "$1" = "--strict" ] && STRICT_MODE=true

echo "=== Synova Environment Validator ==="
echo "Snapshot: $SNAPSHOT"
echo "Strict mode: $STRICT_MODE"
echo ""

# ---- 检查 1: 快照文件存在 ----
if [ ! -f "$SNAPSHOT" ]; then
  echo -e "${RED}[FATAL] env-snapshot.json 不存在${RESET}"
  echo "请确保仓库根目录有 env-snapshot.json 文件"
  exit 1
fi

# ---- 检查 2: 快照 JSON 合法 ----
if ! jq empty "$SNAPSHOT" 2>/dev/null; then
  echo -e "${RED}[FATAL] env-snapshot.json 格式错误 (非合法 JSON)${RESET}"
  exit 1
fi

# ---- 检查 3: Schema 版本匹配 ----
SCHEMA_VER=$(jq -r '.schemaVersion' "$SNAPSHOT")
if [ "$SCHEMA_VER" != "1.0.0" ]; then
  echo -e "${RED}[FATAL] Unsupported schema version: $SCHEMA_VER (expected 1.0.0)${RESET}"
  exit 1
fi

# ---- 检查 4: 操作系统 ----
CURRENT_OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$CURRENT_OS" in
  linux*)   CURRENT_OS="linux" ;;
  darwin*)  CURRENT_OS="darwin" ;;
  mingw*|msys*|cygwin*) CURRENT_OS="win32" ;;
esac

ALLOWED_OS=$(jq -r '.os.allowed | join(",")' "$SNAPSHOT")
if ! echo "$ALLOWED_OS" | grep -q "$CURRENT_OS"; then
  echo -e "${RED}[FAIL] OS: $CURRENT_OS 不在允许列表中 ($ALLOWED_OS)${RESET}"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "${GREEN}[PASS] OS: $CURRENT_OS${RESET}"
fi

# ---- 检查 5: 工具版本 ----
TOOL_COUNT=$(jq '.tools | length' "$SNAPSHOT")
for i in $(seq 0 $((TOOL_COUNT - 1))); do
  TOOL_NAME=$(jq -r ".tools[$i].name" "$SNAPSHOT")
  CHECK_CMD=$(jq -r ".tools[$i].checkCommand" "$SNAPSHOT")
  VERSION_REGEX=$(jq -r ".tools[$i].versionRegex" "$SNAPSHOT")
  MIN_VER=$(jq -r ".tools[$i].minVersion" "$SNAPSHOT")
  REC_VER=$(jq -r ".tools[$i].recommendedVersion" "$SNAPSHOT")
  STRICT=$(jq -r ".tools[$i].strictMatch" "$SNAPSHOT")

  # 检查工具是否存在
  TOOL_BIN=$(echo "$CHECK_CMD" | awk '{print $1}')
  if ! command -v "$TOOL_BIN" &>/dev/null; then
    echo -e "${RED}[FAIL] $TOOL_NAME: 命令 '$TOOL_BIN' 不存在${RESET}"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  # 获取版本号
  VERSION_OUTPUT=$($CHECK_CMD 2>&1 || echo "")
  ACTUAL_VER=$(echo "$VERSION_OUTPUT" | grep -oE "$VERSION_REGEX" | head -1 || echo "")

  if [ -z "$ACTUAL_VER" ]; then
    echo -e "${RED}[FAIL] $TOOL_NAME: 无法从输出中提取版本号 (输出: $VERSION_OUTPUT)${RESET}"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  # 版本比较 (简化: 仅比较 major.minor.patch)
  compare_versions() {
    echo "$1" "$2" | awk '{
      split($1, a, ".");
      split($2, b, ".");
      for (i = 1; i <= 3; i++) {
        if (a[i] + 0 < b[i] + 0) { print -1; exit; }
        if (a[i] + 0 > b[i] + 0) { print 1; exit; }
      }
      print 0;
    }'
  }

  CMP=$(compare_versions "$ACTUAL_VER" "$MIN_VER")
  if [ "$CMP" = "-1" ]; then
    echo -e "${RED}[FAIL] $TOOL_NAME: actual=$ACTUAL_VER < min=$MIN_VER${RESET}"
    VIOLATIONS=$((VIOLATIONS + 1))
  else
    echo -e "${GREEN}[PASS] $TOOL_NAME: $ACTUAL_VER (>= $MIN_VER)${RESET}"

    # 严格模式: 精确匹配推荐版本
    if $STRICT_MODE && [ "$STRICT" = "true" ]; then
      if [ "$ACTUAL_VER" != "$REC_VER" ]; then
        echo -e "${RED}[FAIL] $TOOL_NAME: strict mode requires exact $REC_VER, got $ACTUAL_VER${RESET}"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    fi

    # 非严格模式: 低于推荐版本只是 warning
    if [ "$ACTUAL_VER" != "$REC_VER" ] && [ "$STRICT" != "true" ]; then
      CMP_REC=$(compare_versions "$ACTUAL_VER" "$REC_VER")
      if [ "$CMP_REC" = "-1" ]; then
        echo -e "  ${YELLOW}[WARN] $TOOL_NAME: 低于推荐版本 ($ACTUAL_VER < $REC_VER)${RESET}"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  fi
done

# ---- 检查 6: 编码设置 ----
# PowerShell 编码检查 (Windows 环境)
if [ "$CURRENT_OS" = "win32" ]; then
  PS_ENCODING=$(pwsh -NoProfile -Command '[System.Console]::OutputEncoding.WebName' 2>/dev/null || echo "unknown")
  EXPECTED_PS_ENC=$(jq -r '.encoding.powershellEncoding | ascii_downcase' "$SNAPSHOT")
  if [ "$PS_ENCODING" != "$EXPECTED_PS_ENC" ] && [ "$PS_ENCODING" != "unknown" ]; then
    echo -e "${YELLOW}[WARN] PowerShell 输出编码: actual=$PS_ENCODING, expected=$EXPECTED_PS_ENC${RESET}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "${GREEN}[PASS] PowerShell encoding: $EXPECTED_PS_ENC${RESET}"
  fi
fi

# Git 编码检查
GIT_ENCODING=$(git config --get i18n.commitEncoding 2>/dev/null || echo "unknown")
EXPECTED_GIT_ENC=$(jq -r '.encoding.gitEncoding' "$SNAPSHOT")
if [ "$GIT_ENCODING" != "$EXPECTED_GIT_ENC" ] && [ "$GIT_ENCODING" != "unknown" ]; then
  echo -e "${YELLOW}[WARN] Git 编码: actual=$GIT_ENCODING, expected=$EXPECTED_GIT_ENC${RESET}"
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}[PASS] Git encoding: $EXPECTED_GIT_ENC${RESET}"
fi

# ---- 检查 7: 环境变量 ----
VAR_COUNT=$(jq '.envVars | length' "$SNAPSHOT")
for i in $(seq 0 $((VAR_COUNT - 1))); do
  VAR_NAME=$(jq -r ".envVars[$i].name" "$SNAPSHOT")
  VAR_REQUIRED=$(jq -r ".envVars[$i].required" "$SNAPSHOT")
  VAR_EXPECTED=$(jq -r ".envVars[$i].expectedValue // empty" "$SNAPSHOT")

  ACTUAL_VALUE="${!VAR_NAME}"

  if [ -z "$ACTUAL_VALUE" ]; then
    if [ "$VAR_REQUIRED" = "true" ]; then
      echo -e "${RED}[FAIL] 环境变量 $VAR_NAME: 未设置 (required)${RESET}"
      VIOLATIONS=$((VIOLATIONS + 1))
    else
      echo -e "  ${YELLOW}[WARN] 环境变量 $VAR_NAME: 未设置 (optional)${RESET}"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    if [ -n "$VAR_EXPECTED" ] && [ "$ACTUAL_VALUE" != "$VAR_EXPECTED" ]; then
      echo -e "${YELLOW}[WARN] 环境变量 $VAR_NAME: actual=$ACTUAL_VALUE, expected=$VAR_EXPECTED${RESET}"
      WARNINGS=$((WARNINGS + 1))
    else
      echo -e "${GREEN}[PASS] 环境变量 $VAR_NAME${RESET}"
    fi
  fi
done

# ---- 结果汇总 ----
echo ""
echo "======================================"
if [ $VIOLATIONS -gt 0 ]; then
  echo -e "${RED}环境校验失败: $VIOLATIONS 项错误, $WARNINGS 项警告${RESET}"
  echo ""
  echo "差异清单:"
  echo "  请检查上述 [FAIL] 项，对照 env-snapshot.json 修正环境配置"
  echo "  如需更新环境要求，请联系创始人修改 env-snapshot.json 并 git commit"
  echo ""
  echo "常见修复:"
  echo "  - Node.js 版本不匹配: nvm install 22.12.0 && nvm use 22.12.0"
  echo "  - PowerShell 编码: [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8"
  echo "  - 环境变量缺失: export CODEX_HOME=/path/to/codex"
  exit 1
else
  echo -e "${GREEN}环境校验通过${RESET}"
  if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}$WARNINGS 项警告 (不影响运行)${RESET}"
  fi
  exit 0
fi
```

### 3.2 校验结果输出示例

**失败时**:

```
=== Synova Environment Validator ===
Snapshot: /repo/env-snapshot.json
Strict mode: false

[PASS] OS: win32
[PASS] node: v22.12.0 (>= 20.0.0)
[PASS] python: Python 3.12.4 (>= 3.10.0)
[FAIL] powershell: actual=5.1.22621 < min=7.2.0
[PASS] git: git version 2.47.0 (>= 2.40.0)
[FAIL] bash: 命令 'bash' 不存在
[WARN] PowerShell 输出编码: actual=us-ascii, expected=utf-8
[PASS] Git encoding: UTF-8
[FAIL] 环境变量 CODEX_HOME: 未设置 (required)

======================================
环境校验失败: 3 项错误, 1 项警告

差异清单:
  请检查上述 [FAIL] 项，对照 env-snapshot.json 修正环境配置
  如需更新环境要求，请联系创始人修改 env-snapshot.json 并 git commit
```

---

## 4. 快照更新流程

### 4.1 更新触发

快照更新**只能由创始人手动触发**——不存在任何自动更新快照的机制。设计原因：如果 Agent 可以自动更新快照，那么任何环境问题都会"被自动视为正常"——快照失去了作为标准的价值。

```
创始人发现需要更新环境
        │
        ▼
  手动编辑 env-snapshot.json
        │
        ▼
  git add env-snapshot.json
  git commit -m "env: upgrade Node.js to 22.x LTS, add jq dependency"
        │
        ▼
  git push
        │
        ▼
  下次 Agent 启动时
  validate-env.sh 自动加载最新快照
  新环境要求生效
```

### 4.2 变更日志示例

```
$ git log --oneline -- env-snapshot.json

a1b2c3d env: add jq dependency for audit JSON parsing
e4f5g6h env: upgrade Node.js to 22.x LTS
i7j8k9l env: lock PowerShell encoding to UTF-8 (fix garble issue #13)
m0n1o2p env: initial environment snapshot
```

### 4.3 回滚

如果新快照导致 Agent 启动失败（例如新快照要求的工具版本在 CI 环境中不可用），创始人可以：

```
git revert <commit-hash>    # 回滚到上一个快照版本
git push
```

下次启动时 Agent 加载回滚后的快照。

---

## 5. 失败模式

### 5.1 快照过时 + 工具版本不兼容

**场景**: 某台机器上自动升级了 Node.js 到 24.x，但 env-snapshot.json 仍要求 22.x。

**处理**:
1. Agent 启动时 validate-env.sh 检测到实际版本 (24.x) != 快照 (22.x)
2. `WARN`: "node: 高于推荐版本 22.12.0 (got 24.1.0)"（非严格模式，不阻断）
3. Agent 正常启动，但日志中记录版本偏差
4. 创始人可决定: (a) 降级回 22.x 或 (b) 更新快照到 24.x

如果开启了 `--strict` 模式（生产环境推荐）:
1. `FAIL`: node 不匹配，拒绝启动
2. 创始人必须在启动前手动更新快照

### 5.2 快照 JSON 损坏

**场景**: 手动编辑 env-snapshot.json 时引入语法错误（缺少逗号、引号不匹配等）。

**处理**:
1. `jq empty env-snapshot.json` → 非零退出码
2. `[FATAL] env-snapshot.json 格式错误`
3. Agent 拒绝启动
4. 创始人修复 JSON 语法 + git commit --amend + git push --force-with-lease

### 5.3 工具检查命令超时

**场景**: `python --version` 无响应（例如 Python 安装损坏、路径配置错误）。

**处理**:
1. timeout 5s 包裹每个 `checkCommand`
2. 超时 → `[FAIL] tool: 命令超时 (5s)`
3. Agent 拒绝启动

---

## 6. 启动时集成

### 6.1 Agent 启动流程

```
Agent 启动入口 (npm run dev / tsx src/index.ts)
        │
        ▼
  ┌─────────────────────────┐
  │ 1. validate-env.sh      │  ← 第六章 环境验证器
  │    - 检查 OS/工具/编码/环境变量 │
  │    - 不一致 → 拒绝启动      │
  └──────────┬──────────────┘
             │ PASS
             ▼
  ┌─────────────────────────┐
  │ 2. 加载 contract.json   │  ← 第三章 契约存档器 (如适用)
  │    - 检查下游契约一致性    │
  │    - 未确认 → 拒绝启动      │
  └──────────┬──────────────┘
             │ PASS
             ▼
  ┌─────────────────────────┐
  │ 3. shouldUseWriteLock() │  ← 第四章 写入锁 (如适用)
  │    - 判断多 Agent 并行    │
  └──────────┬──────────────┘
             │
             ▼
  ┌─────────────────────────┐
  │ 4. Agent 正常启动        │
  └─────────────────────────┘
```

### 6.2 启动脚本集成

```bash
#!/bin/bash
# scripts/agent-start.sh — Agent 统一启动入口

set -e

echo "Synova Agent 启动中..."

# 步骤 1: 环境验证
echo "[1/3] 环境验证..."
bash scripts/validate-env.sh
echo ""

# 步骤 2: 契约门禁 (如有下游契约)
echo "[2/3] 契约门禁..."
if [ -f ".codex/contracts/active-contract.json" ]; then
  node dist/contract/contract-gate.js || {
    echo "契约门禁未通过，Agent 拒绝启动"
    exit 1
  }
else
  echo "  无下游契约，跳过"
fi
echo ""

# 步骤 3: 初始化写入锁系统
echo "[3/3] 写入锁准备..."
mkdir -p .codex/locks
echo "  写入锁就绪"
echo ""

echo "Agent 启动完成，进入主循环..."
exec node dist/index.js
```

---

## 7. 测试规范

### Test Requirements

| 测试层 | 类型 | Fixture 数量 | 覆盖场景 |
|--------|------|-------------|----------|
| L1 (单元) | `env-schema.test.ts` | 3 | Schema 校验: 合法快照、缺少必填字段、格式错误的 JSON |
| L1 (单元) | `env-validator.test.ts` | 7 | OS 允许/拒绝、工具版本满足/低于最低/精确匹配严格模式、工具不存在、环境变量缺失(required)/可选缺失(warn)、编码正确/偏差 warn |
| L1 (单元) | `version-compare.test.ts` | 4 | major 比较、minor 比较、patch 比较、非 semver 格式兜底 |
| L2a (集成) | `validate-env.integration.test.ts` | 3 | 全部通过、部分 FAIL 拒绝启动、严格模式 vs 非严格模式差异 |
| L2c (E2E) | `agent-start.e2e.test.ts` | 2 | 完整启动流程: 环境通过→契约通过→Agent 启动 / 环境失败→拒绝启动并输出差异清单 |

### Wiring Verification

| 新 export / 脚本 | 调用方 | 调用方式 |
|------------------|--------|----------|
| `env-snapshot.json` | `scripts/validate-env.sh` | 文件读取 |
| `scripts/validate-env.sh` | `scripts/agent-start.sh` | `bash scripts/validate-env.sh` |
| `scripts/agent-start.sh` | `npm run dev` (package.json) | `"dev": "bash scripts/agent-start.sh"` |
| `EnvSnapshotSchema` (env-snapshot-schema.ts) | `scripts/validate-env.sh` | 仅文档引用，运行时由 jq 消费快照 JSON |

---

## 8. 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `env-snapshot.json` | 新增 | 环境快照定义 (随仓库版本管理) |
| `scripts/validate-env.sh` | 新增 | 启动前环境校验脚本 |
| `scripts/agent-start.sh` | 新增 | Agent 统一启动入口 (集成环境校验+契约门禁) |
| `src/env/env-snapshot-schema.ts` | 新增 | TypeScript 类型定义 (供文档和 IDE 智能提示) |
| `.gitattributes` | 修改 | 添加 `env-snapshot.json text eol=lf` (确保跨平台换行一致) |
| `package.json` | 修改 | `"dev"` 脚本改为 `bash scripts/agent-start.sh` |

---

## 9. 与前后章节关系

本章是"创始人控制塔系统"的最后一道物理防护：

```
第一章 (概念基座)    → 定义什么是控制塔、为什么需要
第二章 (任务拆分器)   → 将复杂任务拆分为 Agent 可执行的单元
第三章 (契约存档器)   → Agent 间接口契约结构化 + 创始人确认
第四章 (写入锁)      → 多 Agent 并行时文件写入安全
第五章 (外部审计器)   → Agent 产出质量独立审计
第六章 (环境验证器)   → 运行环境一致性保证
```

六章共同构成一个闭环：从架构概念 → 任务拆分 → Agent 协作安全 → 产出质量审计 → 运行环境稳定。

---

> 上一章: [第五章：外部审计器](./SYNOVA-RESEARCH-第五章-外部审计器-v1-0-20260722.md) — 基于 23 项已知错误模式的自动化代码审计