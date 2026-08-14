# SynovaAgent -- D211 环境验证器 (Environment Validator) 实施方案 v1.0

> 2026-07-22 | 权威文档 #17 第六章：环境验证器
> **控制塔 5 组件并行部署 — 第 4/5 项。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：权威文档 #17 Ch6 文件存在（22KB）
- [x] Get-Content 读取：Ch6 §2.1 env-snapshot.json Schema — 4 节（system/node/python/git）共 20+ 字段
- [x] Select-String 验证：Ch6 §3.1 校验流程 — 7 步（node --version / npm ls / python --version / git --version / tsc --version / 编码检测 / hook 完整性）
- [x] 引用 — Ch6 §1.1："这些问题的根因是运行环境差了一个字符：python3 vs python，UTF-8 vs GBK，bash vs PowerShell"

---

## 问题根因

已知错误 #13（中文乱码 — PowerShell 管道截断 UTF-8）和 #18（pre-commit 超时 — python3 vs python）都是环境不一致导致。环境验证器生成 `env-snapshot.json`，每次 Agent 启动前自动校验 7 项环境指标，不一致时输出差异清单并拒绝启动。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 环境验证器。Python CLI 工具：snapshot 命令生成环境快照 → validate 命令对比当前环境与快照 → 不一致时输出差异清单 + 退出码 1。

### Q1：调研
- Ch6 §2.1：env-snapshot.json 4 节 20+ 字段（system.os / node.version / python.path / git.version / encoding / hooks_present）
- Ch6 §3.1：7 步校验流程 — node --version → npm ls → python --version → git --version → tsc --version → 编码检测 → hook 完整性
- Ch6 §4：快照更新由创始人手动触发（`--update` 标志）
- Ch6 §5：失败模式 — 快照过时 → 警告但允许 / JSON 损坏 → 拒绝 / 工具超时 → 跳过单项

### Q2：范围
- 最小：`env-validator.py` — `snapshot` 命令 + `validate` 命令 + `--update` 标志
- 不做：不修改 AGENTS.md 的环境要求、不修改 CI pipeline

### Q3：验收
- 入口：`python env-validator.py snapshot` → 生成 `env-snapshot.json`
- 交互：`python env-validator.py validate` → 对比当前环境 → 输出 PASS/FAIL 清单
- 结果：环境不一致时退出码 1 + 差异清单；一致时退出码 0

### Q4：契约与测试
- @input：无（自动检测当前环境）
- @output：`env-snapshot.json` 或验证报告
- @degraded：工具不可用 → 跳过单项 + degraded warning
- 测试：snapshot 生成(1) + validate 一致(1) + validate 不一致(1) + 降级(1) = 4 tests

---

## 构建内容

### 1. scripts/control-tower/env-validator.py（新建，约 150 行）

```python
class EnvValidator:
  SNAPSHOT_PATH = ".codex/env-snapshot.json"

  snapshot() -> dict
    # 采集 7 项环境指标:
    #   system: os.name, platform.release, encoding
    #   node: subprocess ['node', '--version']
    #   npm: subprocess ['npm', 'ls', '--depth=0']
    #   python: sys.version, sys.executable
    #   git: subprocess ['git', '--version']
    #   typescript: subprocess ['npx', 'tsc', '--version']
    #   hooks: 检测 .git/hooks/pre-commit 存在性

  validate() -> ValidationReport
    # 加载 env-snapshot.json → 逐项对比当前环境
    # 输出差异清单 (field / expected / actual / severity)

  update() -> None
    # snapshot + 覆盖 env-snapshot.json
```

### 2. scripts/control-tower/env-snapshot.json（由 snapshot 命令生成）

```json
{
  "version": "1.0",
  "created_at": "2026-07-22T...",
  "system": { "os": "Windows", "encoding": "utf-8" },
  "node": { "version": "v22.x", "npm_version": "10.x" },
  "python": { "version": "3.13.x", "executable": "python" },
  "git": { "version": "2.4x" },
  "typescript": { "version": "5.x" },
  "hooks": { "pre_commit": true, "post_commit": true }
}
```

---

## 不做什么

- 不自动更新快照（仅创始人通过 `--update` 触发）
- 不修改 AGENTS.md 环境要求
- 不实现 CI 集成（先本地验证）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `snapshot()` 生成有效 JSON → 包含 4 节 7+ 字段
- `validate()` 环境一致 → PASS + 退出码 0
- `validate()` node 版本不匹配 → FAIL + 差异详情
- 工具不可用（如 npm 不存在）→ 跳过单项 + degraded
- 4 个测试

### L2a：接线测试
- env-validator.py 可独立运行
- snapshot 输出到 `.codex/env-snapshot.json`（与 Ch6 §2.3 指定路径一致）

---

## 接线验证（铁律 4）

| 组件 | 触发方式 | 验证方式 |
|------|------|------|
| env-validator.py snapshot | 创始人手工运行 | `python env-validator.py snapshot --help` |
| env-validator.py validate | Agent 启动前 / session-start hook | `python env-validator.py validate --help` |
| env-snapshot.json | env-validator.py 读写 | Test-Path .codex/env-snapshot.json |

---

## 完成标准

```
[ ] env-validator.py: snapshot 命令（7 项采集）
[ ] env-validator.py: validate 命令（逐项对比 + 差异清单）
[ ] env-snapshot.json 自动生成并存在
[ ] 降级：工具不可用 → 跳过单项 + degraded
[ ] ≥4 个测试
[ ] python env-validator.py --help 退出码 0
```

---

## 权威文档引用

- 权威文档 #17 第六章：环境验证器 — §2 Schema 定义 / §3 校验流程 / §4 快照更新 / §5 失败模式
- AGENTS.md Iron Law 0-5 错误 #13（中文乱码）、#18（python3 vs python）
- AGENTS.md 铁律 35（自动化优先）
