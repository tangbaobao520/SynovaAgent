# SynovaAgent -- D229 Windows 启动脚本 实施方案 v1.0

> 2026-07-26 | D228 将 package.json 从 bash 回退到 npx tsx——恢复了 Windows 兼容但跳过了 agent-start.sh 的 3 步启动流程
> **创建 agent-start.bat — Windows 原生 3 步启动。零 bash 依赖。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/agent-start.sh` 存在（D217，bash 脚本，3 步启动），`scripts/control-tower/env_validator.py` 存在（D211，validate 命令），`scripts/run-contract-gate.ts` 存在（D217，契约门禁 CLI）
- [x] Get-Content 读取：agent-start.sh L1-94 — 3 步流程（env validate → contract gate → write-lock init → exec server）。D228 `package.json:13` — `"dev": "npx tsx src/index.ts"`（跳过 bootstrap）
- [x] Select-String 验证：D211 env_validator.py `validate` 命令退出码 0=PASS / 1=FAIL。D217 run-contract-gate.ts L1-46 — `#!/usr/bin/env npx tsx` shebang + `ContractGate.validateAll()` 调用
- [x] 引用 — Ch6 §6.2："Agent 启动入口 (npm run dev / tsx src/index.ts) → validate-env.sh → 加载 contract.json → Agent 正常启动"

---

## 问题根因

D217 建的 `agent-start.sh` 是 bash 脚本——Windows 上 `bash` 不在 PATH。D228 把 `package.json` 的 dev 脚本从 `bash scripts/agent-start.sh` 回退到 `npx tsx src/index.ts`——修复了启动，但跳过了 3 步 bootstrap（环境验证/契约门禁/写入锁）。Gate 0（产品启动自检）因此判定为 partial——系统可以启动，但 bootstrap 流程不完整。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 部署层 — Windows 启动脚本。创建 `scripts/agent-start.bat`——与 agent-start.sh 完全等价的 Windows 原生脚本，无 bash 依赖。package.json 的 `"dev"` 脚本改为调用 agent-start.bat。

### Q1：调研
- agent-start.sh 3 步：Step 1 `bash scripts/validate-env.sh` → Step 2 `npx tsx scripts/run-contract-gate.ts` → Step 3 `mkdir -p .write-locks` → `exec npx tsx src/index.ts`
- env_validator.py：纯 Python，Windows 上直接可用（`python scripts/control-tower/env_validator.py validate`）
- run-contract-gate.ts：`#!/usr/bin/env npx tsx` shebang，Windows 上 `npx tsx` 可用
- mkdir：Windows 上 `mkdir` 命令可用
- package.json D228 已改为 `"npx tsx src/index.ts"`

### Q2：范围
- 最小：`scripts/agent-start.bat`（~50 行，Windows CMD 脚本）+ 修改 `package.json` `"dev"` 脚本
- 不做：不修改 agent-start.sh（Linux/Mac 保留）、不修改 D211/D217 组件代码

### Q3：验收
- 入口：`npm run dev` → 调用 agent-start.bat → 3 步全部执行 → 启动服务器
- 交互：Step 1 环境验证 fail → 拒绝启动 + 提示运行 snapshot
- 结果：Windows 上 Gate 0 的 bootstrap 检查可通过（env validation + contract gate + write lock 全部执行）

### Q4：契约与测试
- @input：无（自动检测环境）
- @output：服务器进程或错误退出码
- @degraded：env_validator.py 不存在 → 跳过 Step 1 + 告警；run-contract-gate.ts 不存在 → 跳过 Step 2 + 告警
- 测试：3 步全部通过(1) + 环境 fail 拒绝启动(1) + 降级跳过(1) = 3 tests

---

## 构建内容

### 1. scripts/agent-start.bat（新建，约 50 行）

```batch
@echo off
echo ========================================
echo   SynovaAgent Windows 启动中...
echo ========================================
echo.
echo [1/3] 环境验证...
python scripts/control-tower/env_validator.py validate
if %ERRORLEVEL% NEQ 0 (
    echo   [FAIL] 环境验证未通过
    exit /b 1
)
echo   [PASS] 环境验证通过
echo.
echo [2/3] 契约门禁...
if exist ".codex\contracts\*.json" (
    npx tsx scripts/run-contract-gate.ts
    if %ERRORLEVEL% NEQ 0 (
        echo   [FAIL] 契约门禁未通过
        exit /b 1
    )
    echo   [PASS] 契约门禁通过
) else (
    echo   [SKIP] 无待验契约
)
echo.
echo [3/3] 写入锁准备...
if not exist ".write-locks" mkdir ".write-locks"
echo   [OK] .write-locks\ 就绪
echo.
echo 启动完成，进入主循环...
npx tsx src/index.ts
```

### 2. 修改 package.json — dev 脚本

`"dev": "npx tsx src/index.ts"` → `"dev": "scripts\\agent-start.bat"`

---

## 不做什么

- 不修改 agent-start.sh（Linux/Mac 保留）
- 不修改 env_validator.py / run-contract-gate.ts
- 不修改 D228 的其他变更

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- agent-start.bat 3 步全部通过 → 服务器启动
- env_validator validate fail → 退出码 1 + "环境验证未通过"
- run-contract-gate.ts 不存在 → SKIP + degraded 告警
- 3 个测试

---

## 完成标准

```
[ ] scripts/agent-start.bat: 3 步启动流程（env→contract→lock→server）
[ ] package.json dev: "scripts\\agent-start.bat"
[ ] Step 1 env fail → exit /b 1
[ ] Step 2 无契约 → SKIP
[ ] 降级: env_validator.py 不存在 → SKIP
[ ] npm run dev 在 Windows 上正常启动
[ ] ≥3 个测试
```
