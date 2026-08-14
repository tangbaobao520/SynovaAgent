# SynovaAgent -- D201-Phase2 网守补全 (Gatekeeper L8/L9 + sub-components) 实施方案 v1.0

> 2026-07-23 | 权威文档 #17 第二章 Ch2 §2.3 L8-L9 + §4.2-4.4 + §7.3
> **控制塔 Phase 2 — D201 当前仅 1/11 完成。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/synova-commit` 存在（8355B），`AGENTS.md` 铁律 0-5 存在（23 项已知错误清单）
- [x] Get-Content 读取：Ch2 §2.3 L8 — 数据源 `.codex/settings/gatekeeper/contract.json`，硬阻断，grep 验证函数签名。Ch2 §2.3 L9 — 数据源 `known-error-patterns.json`，硬阻断（仅 auto_detectable:true），23 项模式扫描。Ch2 §4.2 — 健康缓存机制（30s 有效期）。Ch2 §4.3 — 降级模式行为表（5 场景）。Ch2 §7.3 — 文件结构总览（3 脚本 + 6 数据文件 + 2 新增门禁）
- [x] Select-String 验证：`synova-commit` 现有 L1-L7 检查（as_any/empty_catch/secrets/new_file_test/new_export_wiring/compute_test/sentinel_test），L8/L9 不存在
- [x] 引用 — Ch2 §1.2："唯一的物理阻断点有逃生舱，且该逃生舱已被实际使用"

---

## 问题根因

D201 synova-commit 仅交付了 wrapper 脚本（1/11）。Ch2 §7.3 定义了完整网守系统：3 脚本 + 6 数据文件 + L8/L9 两项新增硬阻断。没有 L8，跨 Agent 契约一致性无人验证。没有 L9，23 项已知错误模式无法在 commit 前自动拦截。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 网守补全。在现有 synova-commit 基础上增加 L8/L9 检查 + 健康缓存 + 错误模式 JSON + 指令注入脚本 + 降级事件日志。

### Q1：调研
- 现有 synova-commit：L1-L7（as_any, empty_catch, secrets, new_file_test, new_export_wiring, compute_test, sentinel_test）。全部通过 pre-commit-check.sh
- L8 新增：从 `contract.json` 读取模块声明 → grep 验证每个 export 函数在代码库中存在 → 不通过硬阻断
- L9 新增：从 `known-error-patterns.json` 读取可自动检测的模式 → 对暂存文件逐行 grep → 命中硬阻断
- Ch2 §4.3 降级行为：contract.json 缺失 → 黄灯跳过 L8 / known-error-patterns.json 缺失 → 黄灯跳过 L9 / 网守崩溃 → 红灯 fail-open
- Ch2 §7.3 文件结构：`scripts/gatekeeper/inject-commit-instruction.sh`（SessionStart hook）、`generate-error-patterns.sh`（从 AGENTS.md 生成 JSON）、6 个 `.codex/settings/gatekeeper/` 数据文件

### Q2：范围
- 最小：(A) 在 synova-commit 中追加 L8 和 L9 检查函数；(B) 创建 `known-error-patterns.json`（从 AGENTS.md Iron Law 0-5 23 项清单提取可 grep 的模式）；(C) 创建 `inject-commit-instruction.sh`（SessionStart hook 注入）；(D) 创建健康缓存机制；(E) 仪表盘信号写入
- 不做：不修改现有 L1-L7 逻辑、不修改 pre-commit-check.sh

### Q3：验收
- 入口：`git synova-commit --task-id D201-P2 --agent test --message "test L8/L9"`
- 交互：L8 检查 → 读取 contract.json → grep 验证函数存在；L9 检查 → 读取 known-error-patterns.json → 扫描暂存文件
- 结果：L8/L9 不通过 → 硬阻断 + 仪表盘红色信号；数据源缺失 → 黄灯跳过 + 日志

### Q4：契约与测试
- @input：暂存区文件列表 + contract.json + known-error-patterns.json
- @output：PASS/FAIL per check + 仪表盘信号文件
- @degraded：contract.json 缺失 → L8 skip + degraded；known-error-patterns.json 缺失 → L9 skip + degraded
- 测试：L8 contract 一致(1) + L8 contract 不一致(1) + L9 模式命中(1) + L9 无命中(1) + 降级跳过(2) = 6 tests

---

## 构建内容

### 1. 修改 scripts/control-tower/synova-commit — 追加 L8/L9 检查函数

在现有 L1-L7 检查之后、`exec git commit` 之前，追加：

```bash
# L8: 跨 Agent 契约一致性
check_l8_contract_consistency() {
  local contract="$GATEKEEPER_STORE/contract.json"
  if [[ ! -f "$contract" ]]; then
    echo "L8: SKIP — contract.json 缺失 (仪表盘黄色信号)"
    write_dashboard_signal "YELLOW" "gatekeeper_partial" "contract_json_missing"
    return 0
  fi
  # 逐条 grep 验证 contract 中的函数签名
  # 使用 jq 解析 modules[].exports[].name → grep -rn "function NAME\|export function NAME" src/
  # 不通过 → echo "L8: FAIL" + exit 1
}

# L9: 已知错误模式自动扫描
check_l9_error_patterns() {
  local patterns="$GATEKEEPER_STORE/known-error-patterns.json"
  if [[ ! -f "$patterns" ]]; then
    echo "L9: SKIP — known-error-patterns.json 缺失 (仪表盘黄色信号)"
    write_dashboard_signal "YELLOW" "gatekeeper_partial" "error_patterns_missing"
    return 0
  fi
  # 从 patterns JSON 读取 auto_detectable:true 的模式 → 对暂存文件逐行 grep
  # 命中 → echo "L9: FAIL — 检测到已知错误模式: {pattern_id}" + exit 1
}
```

### 2. scripts/control-tower/known-error-patterns.json（新建，约 60 行）

从 AGENTS.md Iron Law 0-5 23 项清单中提取 6 项可 grep 的模式：

```json
[
  {"id": "P01", "pattern": "from\"", "description": "from\" spacing error (missing space before quote)", "auto_detectable": true},
  {"id": "P02", "pattern": "\\bas any\\b", "description": "as any type assertion", "auto_detectable": true},
  {"id": "P03", "pattern": "expertType.*=.*['\"]unknown['\"]", "description": "expertType=unknown hardcoded (D8d bug)", "auto_detectable": true},
  {"id": "P04", "pattern": "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}", "description": "empty catch block (no log.warn)", "auto_detectable": true},
  {"id": "P05", "pattern": "@deprecated", "description": "deprecated marker without migration plan", "auto_detectable": true},
  {"id": "P06", "pattern": "TODO|FIXME|HACK", "description": "TODO/FIXME/HACK left in delivery code", "auto_detectable": true}
]
```

其余 17 项为非可自动检测（需语义理解），标记 `auto_detectable: false` 但保留在 JSON 中供审计器（D202）使用。

### 3. scripts/control-tower/inject-commit-instruction.sh（新建，约 30 行）

SessionStart hook 注入——在 Agent 开始工作前将 synova-commit 用法注入上下文：

```bash
#!/bin/bash
# 输出 synova-commit 用法指令，由 SessionStart hook 注入到 Agent system prompt
cat << 'INSTRUCTION'
[SYNOVA] Commit via gatekeeper. Use:
  git synova-commit --task-id <D#> --agent <name> --message "<msg>"
Direct 'git commit' without synova-commit wrapper will be detected and logged.
INSTRUCTION
```

### 4. 仪表盘信号写入函数

```bash
write_dashboard_signal() {
  local color="$1" component="$2" reason="$3"
  local signal_file="$GATEKEEPER_STORE/.dashboard-signal"
  echo "${color}|${component}|$(date -u +%Y-%m-%dT%H:%M:%SZ)|${reason}" > "$signal_file"
}
```

### 5. 健康缓存 + 降级事件日志

- `.codex/settings/gatekeeper/.health-check`：每次 synova-commit 调用时写入 Unix timestamp；30s 内复用缓存
- `.codex/settings/gatekeeper/degraded-events.log`：每次降级事件追加一行 JSON

---

## 不做什么

- 不修改现有 L1-L7 逻辑（pre-commit-check.sh 保持独立）
- 不自动生成 contract.json（由 D208/D215 产生）
- 不在 inject-commit-instruction.sh 中修改 AGENTS.md

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- L8：contract 中的函数在代码库中存在 → PASS
- L8：contract 中的函数不存在 → FAIL + 硬阻断
- L9：暂存文件包含 `as any` → FAIL + 硬阻断
- L9：暂存文件不包含已知错误模式 → PASS
- contract.json 缺失 → L8 SKIP + degraded（不阻断）
- known-error-patterns.json 缺失 → L9 SKIP + degraded（不阻断）
- 6 个测试

### L2a：接线测试
- synova-commit 包含 L8/L9 检查函数（grep "check_l8\|check_l9"）
- inject-commit-instruction.sh 可独立运行
- known-error-patterns.json JSON 格式正确（python -m json.tool 验证）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| check_l8_contract_consistency | synova-commit L1-L9 检查序列 | grep "check_l8" scripts/control-tower/synova-commit |
| check_l9_error_patterns | synova-commit L1-L9 检查序列 | grep "check_l9" scripts/control-tower/synova-commit |
| inject-commit-instruction.sh | SessionStart hook | bash -n 语法检查 |
| known-error-patterns.json | synova-commit L9 + D202 external-auditor | python -m json.tool 验证 |

---

## 完成标准

```
[ ] synova-commit: L8 函数实现（contract.json → grep 验证）
[ ] synova-commit: L9 函数实现（known-error-patterns.json → 逐行扫描）
[ ] known-error-patterns.json: 23 项清单（6 项 auto_detectable + 17 项标记）
[ ] inject-commit-instruction.sh: SessionStart hook 注入脚本
[ ] write_dashboard_signal: 管道格式写入 .dashboard-signal
[ ] 健康缓存: .health-check 30s TTL
[ ] 降级日志: degraded-events.log 追加
[ ] 降级: contract.json 缺失 → SKIP + 黄灯
[ ] 降级: error-patterns.json 缺失 → SKIP + 黄灯
[ ] ≥6 个测试
```

---

## 权威文档引用

- 权威文档 #17 第二章：校验网守 — §2.3 L8/L9 / §4.2-4.4 健康检查+降级 / §7.3 文件结构总览
- AGENTS.md Iron Law 0-5：23 项已知错误清单（L9 数据源）
- D201 dev doc：[SYNOVA-IMPL-D201-gatekeeper-synova-commit-v1-20260722.md](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D201-gatekeeper-synova-commit-v1-20260722.md)
