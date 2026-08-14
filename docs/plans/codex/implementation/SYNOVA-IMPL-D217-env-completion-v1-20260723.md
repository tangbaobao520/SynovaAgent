# SynovaAgent -- D217 环境验证器补全 (Env Validator Completion) 实施方案 v1.0

> 2026-07-23 | 权威文档 #17 第六章 Ch6 §6-8
> **控制塔 Phase 3 — Ch6 当前 1/4 完成。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/env_validator.py` 存在（D211，9 检查项 CLI），`.codex/env-snapshot.json` 存在（D211 snapshot 生成），`package.json` 存在
- [x] Get-Content 读取：Ch6 §6.1 启动流程图 — Step 1 validate-env.sh → Step 2 contract gate → Step 3 write-lock init → Step 4 Agent 启动。Ch6 §6.2 完整 `agent-start.sh` 脚本（Line 604-625）。Ch6 §8 文件清单 — 6 文件（env-snapshot.json 已存在 / validate-env.sh / agent-start.sh / env-snapshot-schema.ts / .gitattributes / package.json 修改）
- [x] Select-String 验证：D211 env-validator.py 提供 `snapshot` + `validate` 命令（已验证）；package.json `"dev"` 脚本当前为 `"tsx src/index.ts"`
- [x] 引用 — Ch6 §1.1："这些问题的根因是运行环境差了一个字符：python3 vs python，UTF-8 vs GBK，bash vs PowerShell"

---

## 问题根因

D211 env-validator.py 实现了环境校验的 CLI 工具（snapshot + validate），但 Ch6 定义了完整的启动集成链：validate-env.sh（bash hook）→ agent-start.sh（统一启动入口）→ package.json 修改（dev 脚本切换）。当前 agent-start.sh、validate-env.sh、env-snapshot-schema.ts 全部缺失。环境校验需要人工运行 CLI——没有在 Agent 启动前自动执行。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 环境验证器补全。创建 validate-env.sh（调用 D211 env-validator.py）→ 创建 agent-start.sh（3 步启动：环境校验 → 契约门禁 → 写入锁准备 → Agent 启动）→ 创建 TypeScript Schema → 修改 package.json。

### Q1：调研
- D211 env-validator.py：提供 `snapshot` 和 `validate` 两个 CLI 命令；`validate` 返回 OK（退出码 0）或 FAIL（退出码 1）
- Ch6 §6.2：agent-start.sh 完整实现已给出（Line 604-625）：3 步流程 + `exec node dist/index.js`
- Ch6 §6.1 启动流程图：validate-env → contract gate（如适用）→ write-lock init → Agent 启动
- Ch6 §8 文件清单：6 文件（2 已存在 / 4 新建或修改）

### Q2：范围
- 最小：`scripts/validate-env.sh`（bash 包装，调用 `python env_validator.py validate`）+ `scripts/agent-start.sh`（3 步启动）+ `src/env/env-snapshot-schema.ts`（TypeScript 类型）+ 修改 `package.json` `"dev"` 脚本
- 不做：不修改 D211 env-validator.py、不修改 D215 contract-gate.ts（已经存在，agent-start.sh 调用它）

### Q3：验收
- 入口：`npm run dev` → 执行 `agent-start.sh` → validate-env → contract gate → Agent 启动
- 交互：环境不一致 → validate-env 退出码 1 → agent-start.sh 拒绝启动 + 输出差异清单
- 结果：环境一致 → 全部 3 步通过 → Agent 正常启动

### Q4：契约与测试
- @input：当前运行环境
- @output：启动成功或失败 + 差异清单
- @degraded：env-validator.py 不可用 → agent-start.sh 跳过校验 + 告警（不阻断启动）
- 测试：完整启动(1) + 环境失败拒绝(1) + env-validator 缺失降级(1) + schema 类型验证(1) = 4 tests

---

## 构建内容

### 1. scripts/validate-env.sh（新建，约 20 行）

```bash
#!/bin/bash
# 启动前环境校验 — 调用 D211 env-validator.py
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$SCRIPT_DIR/control-tower/env_validator.py"

if [ ! -f "$VALIDATOR" ]; then
  echo "[WARN] env-validator.py 不存在 — 跳过环境校验 (degraded)"
  exit 0
fi

python "$VALIDATOR" validate
```

### 2. scripts/agent-start.sh（新建，约 50 行）

```bash
#!/bin/bash
# Agent 统一启动入口 — Ch6 §6.2
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Synova Agent 启动中..."

# 步骤 1: 环境验证
echo "[1/3] 环境验证..."
bash "$ROOT/scripts/validate-env.sh" || {
  echo "环境验证未通过，Agent 拒绝启动"
  exit 1
}
echo ""

# 步骤 2: 契约门禁 (如有)
echo "[2/3] 契约门禁..."
if [ -f "$ROOT/.codex/contracts" ]; then
  npx tsx "$ROOT/scripts/run-contract-gate.ts" || {
    echo "契约门禁未通过，Agent 拒绝启动"
    exit 1
  }
else
  echo "  无下游契约，跳过"
fi
echo ""

# 步骤 3: 初始化写入锁
echo "[3/3] 写入锁准备..."
mkdir -p "$ROOT/.write-locks"
echo "  写入锁就绪"
echo ""

echo "Agent 启动完成，进入主循环..."
exec npx tsx "$ROOT/src/index.ts"
```

### 3. scripts/run-contract-gate.ts（新建，约 15 行）

> ⚠️ D215 contract-gate.ts 是纯 import 模块，无 CLI 入口。此包装脚本提供可执行入口供 agent-start.sh Step 2 调用。

```typescript
#!/usr/bin/env npx tsx
import { ContractGate } from "../src/contract/contract-gate";
import { ContractStore } from "../src/contract/contract-store";

const gate = new ContractGate(new ContractStore());
const result = await gate.validateAll();
if (!result.pass && !result.degraded) {
  console.error("Contract gate validation failed:", result.failures);
  process.exit(1);
}
console.log("Contract gate validation passed:", result);
```

### 4. src/env/env-snapshot-schema.ts（新建，约 30 行）

```typescript
export interface EnvironmentSnapshot {
  version: string;
  created_at: string;
  system: { os: string; release: string; encoding: string };
  node: { version: string; npm_version: string };
  python: { version: string; executable: string };
  git: { version: string };
  typescript: { version: string };
  hooks: { pre_commit: boolean; post_commit: boolean };
}
```

### 4. package.json 修改（1 行）

`"dev": "tsx src/index.ts"` → `"dev": "bash scripts/agent-start.sh"`

---

## 不做什么

- 不修改 D211 env-validator.py（validate 命令已存在）
- 不修改 D215 contract-gate.ts（已经存在，agent-start.sh 调用它）
- 不修改 .gitattributes（后续 D219 统一处理）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `agent-start.sh` 环境一致 → 3 步通过 → Agent 启动
- `agent-start.sh` 环境不一致 → validate-env FAIL → 拒绝启动 + 差异清单
- `agent-start.sh` env-validator.py 缺失 → 跳过校验 + degraded 警告 + 继续启动
- `env-snapshot-schema.ts` 类型覆盖 D211 snapshot JSON 全部 7 个节
- 4 个测试

### L2a：接线测试
- `package.json` `"dev"` 脚本指向 `agent-start.sh`（grep "agent-start" package.json）
- `validate-env.sh` 调用 `env_validator.py validate`（grep "env_validator" scripts/validate-env.sh）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| validate-env.sh | agent-start.sh Step 1 | grep "validate-env" scripts/agent-start.sh |
| agent-start.sh | package.json "dev" script | grep "agent-start" package.json |
| env-snapshot-schema.ts | IDE / 文档引用 | tsc --noEmit（类型定义不产生 JS） |

---

## 完成标准

```
[ ] scripts/validate-env.sh: 调用 env_validator.py validate
[ ] scripts/run-contract-gate.ts: CLI wrapper for contract-gate.ts（import + validateAll）
[ ] scripts/agent-start.sh: 3 步启动流程
[ ] src/env/env-snapshot-schema.ts: TypeScript 接口定义
[ ] package.json: "dev" → "bash scripts/agent-start.sh"
[ ] validate-env.sh 降级: env_validator.py 缺失 → 跳过 + 告警
[ ] agent-start.sh 降级: 无契约 → 跳过 Step 2
[ ] ≥4 个测试
```

---

## 权威文档引用

- 权威文档 #17 第六章：环境验证器 — §6.1 启动流程图 / §6.2 启动脚本集成 / §7 测试规范 / §8 文件清单 (行 666-671)
- D211 env-validator.py（已有 CLI 工具）
- D215 contract-gate.ts（契约门禁引擎，agent-start.sh Step 2 调用）
- D209 write-lock.py（写入锁，agent-start.sh Step 3 初始化）
- AGENTS.md Iron Law 0-5 错误 #13（中文乱码）、#18（python3 vs python）

