<!--
  SYNOVA-IMPL-D316: 控制塔 V4.6.0 修复 — incident-loop 跨平台 + version.log + 推送积压
  状态: dev doc | 2026-08-05 | 优先级 P1 (D314 审计发现)
  权威文档: SYNOVA-DESIGN-控制塔V4.6-独立化 §2.1.5/§2.7 + AGENTS.md 铁律 0-3/24/31/48
  来源: D314/D315 审计 (2026-08-05, Codex 逐行) — 3 个真实问题
  依赖: 无 (修复 D314 遗留)
  并行: 无 (控制塔组件, 与业务开发隔离)
-->

# D316: 控制塔 V4.6.0 修复 — incident-loop 跨平台 + version.log + 推送积压

> 一句话问题: D314 声称"验收全过"但实测 3 处不符——① incident-loop verify() 在 Windows 上恒 degraded（学习闭环不可用）；② 日志实际 4 件缺 version.log；③ D313-D315 共 4 提交未推送（CI 从未跑过）。

## 1. 权威文档引用

**来源**: [SYNOVA-DESIGN-控制塔V4.6-独立化 §2.1.5/§2.7](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\strategy\SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md)

> 日志五件套（runtime/gate/incident/degraded-events/version）；version.log 与 VERSION.md 同步，每次 bump 追加；fail-open 绝不静默。

**来源**: [AGENTS.md 铁律 24/31](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 每个 catch 有 log + degraded；降级信号传播。

## 2. 代码审计——现状 (2026-08-05 实测)

### 2.1 缺陷 A: incident-loop.py verify() Windows 跨平台 bug 🔴 P1

[incident-loop.py L148](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\incident-loop.py:148) 硬编码:

```python
r = subprocess.run(
    ["bash", str(REPO_ROOT / "scripts/hooks/hook-git-detect.sh")],
    ...)
```

**实测**: Windows PATH 仅含 `C:\Program Files\Git\cmd`（无 bash.exe，bash 在 `bin\` 与 `usr\bin\`）→ `subprocess.run(["bash",...])` 抛 `WinError 2` → verify() 捕获异常返回 `{"status":"degraded"}` 而非 `{"status":"closed"}`。

**影响**: 学习闭环的"verify 闭环成功"功能在 Windows 上不可用；`incident-loop.test.sh` 实测 **6/7 稳定失败**（非偶发，3 次重跑均失败）。

**同类先例**: baseline-check.sh 已用 Python 路径归一修复同类问题；golden-case-checker.ts 同款。本缺陷是漏网。

### 2.2 缺陷 B: version.log 缺失 🟡 P1

`logs/` 目录实测 4 件: runtime/gate/incident/degraded-events——**缺 version.log**。

- [control_tower_log.py L94](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\control_tower_log.py:94) `log_version()` 已实现
- VERSION.md 有 `## V4.6.0 (2026-08-04)` 首发记录，但**未执行** `control_tower_log.py version --version 4.6.0 ...`
- 违反 §2.7 "五件套 + version.log 与 VERSION.md 同步"

### 2.3 缺陷 C: D313-D315 共 4 提交未推送 🔴

```
本地: 624281f(D313) → c5d8d15(D314) → 63b6529(D315) → 6a5eb01(D315b)  [ahead 4]
远程: origin/feat/prompt-architecture 停在 e9b7e1c(D312)
```

CI 从未为 D313-D315 运行。D314 报告未声称推送，但交付必须落库。

### 2.4 附带: P2-1 hook-git-detect 测试隔离（顺带修复，低风险）

D312 审计发现 hook-git-detect.test.sh 中断后首次运行可能 1 失败——建议加 `trap 'rm -f WINDOW_FILE session-locked' EXIT` + 失败汇总输出测试名。

## 3. 实现方案

### 3.1 写集
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/control-tower/incident-loop.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\incident-loop.py) | 修改 | verify() bash 解析：`_find_bash()`（`shutil.which("bash")` → fallback `C:\Program Files\Git\bin\bash.exe` → Git\usr\bin → None → degraded fail-open）+ `_bash_env()` 自包含环境（Git bins + sys.executable 目录 + WindowsApps，hook 依赖 bash/cat/python3 显式可达） |
| [scripts/control-tower/attach.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\attach.py) | 修改 | **审计补漏（原 dev doc 遗漏）**：`_run_parseable` 同款硬编码 `["bash",` — 同款 `_find_bash` + `_bash_env` |
| [.codex/control-tower/logs/version.log](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\logs\version.log) | 新建 | ① 补写 4.6.0 首发（`control_tower_log.py version --version 4.6.0 --changes "D311-D314 独立化首发" --incident "INC-20260802-stash"`）；② 追加 4.6.1（D316 修复，`--version 4.6.1 --changes "D316 incident-loop 跨平台 + version.log 补写"`） |
| [.codex/control-tower/VERSION.md](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\VERSION.md) | 修改 | 增加 **V4.6.1** 条目（D316 修复）——**注意: 路径是 .codex/control-tower/，不是 scripts/control-tower/** |
| tests/control-tower/incident-loop.test.sh | 修改 | 新增受限 PATH 断言（修复前 red degraded → 修复后 green closed，确定性环境测试）+ 保留原 7 断言 |
| tests/control-tower/hook-git-detect.test.sh | 修改 | P2-1: EXIT trap 清窗 + 失败输出测试名 |
| git 推送 | 操作 | 推送 624281f + c5d8d15 + 63b6529 + 6a5eb01 + D316 修复提交 |

### 3.2 修复模式（incident-loop.py verify）

```python
import os
import shutil

def _find_bash() -> str | None:
    """解析 bash 路径 — Windows PATH 无 bash.exe（Git\cmd 只有 git），须显式查找。"""
    found = shutil.which("bash")
    if found:
        return found
    for cand in (r"C:\Program Files\Git\bin\bash.exe",
                 r"C:\Program Files\Git\usr\bin\bash.exe"):
        if os.path.exists(cand):
            return cand
    return None

# verify() 内:
bash = _find_bash()
if bash is None:
    return {"status": "degraded", "case": case_id,
            "reason": "bash 不可用 — 无法执行门禁验证 (fail-open)"}
r = subprocess.run([bash, str(REPO_ROOT / "scripts/hooks/hook-git-detect.sh")], ...)
```

> 注意: 文件顶部已有 `import os`（L30），只需补充 `import shutil`。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 改 hook-git-detect.sh 本体 | 非本缺陷根因 |
| 处理 D309/D310 清理 | 独立任务（收尾行），不在本修复范围 |
| 常驻 daemon | 设计稿明确延后到产品化阶段 |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 先修改/确认 `incident-loop.test.sh`——当前 Windows 环境 6/7（verify closed 断言失败）。修复前必须能复现失败。

**第二步（green）**: 修复 incident-loop.py 后，`incident-loop.test.sh` → **7/7**（含 closed 断言 + degraded 兜底断言）。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | shell 单元 | 7 | incident-loop 全部（修复前 red → 修复后 green） |
| L1 | shell 单元 | 13 | hook-git-detect（P2-1 EXIT trap 后仍 13/13） |
| L2 | 手工验证 | 1 | `logs/` 目录 5 件套齐全（含 version.log，内容含 V4.6.0） |
| L2 | git 验证 | 1 | 推送后 `git log origin/feat/prompt-architecture..HEAD` 为空 |

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| _find_bash() | incident-loop.py 内被 verify() 调用；grep 确认无其他硬编码 `["bash",` |
| version.log | `control_tower_log.py version` 执行后 logs/ 含 version.log（5 件套） |
| 推送 | 推送后远程含 624281f/c5d8d15/63b6529/6a5eb01/D316 |

## 6. 完成标准

1. DS1: `incident-loop.test.sh` → 7/7（Windows 环境实测）
2. DS2: verify() 无硬编码 `["bash",`（grep 0 结果；改用 _find_bash）
3. DS3: `logs/` 五件套齐全（runtime/gate/incident/degraded-events/version）
4. DS4: version.log 内容含 4.6.0（首发补写）+ 4.6.1（D316 修复）两条，与 VERSION.md 同步
5. DS5: 4 个积压提交 + D316 修复全部推送；`origin/feat/prompt-architecture..HEAD` 为空
6. DS6: CI 对 D313-D316 首次运行——本任务相关 job PASS（预存 npm audit/Architecture 除外，D309/D310 未排期）
7. DS7: hook-git-detect.test.sh 仍 13/13 + EXIT trap 生效（中断后重跑仍绿）
8. DS8: 全量审计 `audit-check.py --full` 与基线一致（439 FAIL 不变）；as any=0；12 组 pre-commit 全过；无 --no-verify
9. DS9: **版本 bump 至 V4.6.1**（PATCH——bug 修复；版本规则: 任何门禁/工具行为变化必须 bump）；VERSION.md + version.log 均记录 V4.6.1

## 7. 自检清单

- [x] incident-loop.py L148 硬编码 ["bash", 实测确认（WinError 2 复现）
- [x] Windows PATH 确认：仅 Git\cmd，无 bash.exe
- [x] logs/ 实测 4 件，缺 version.log；log_version() 已实现（L94）
- [x] VERSION.md 有 V4.6.0 首发记录但 version.log 未生成
- [x] git ahead 4 确认（624281f/c5d8d15/63b6529/6a5eb01）
- [x] incident-loop.test.sh 6/7 稳定失败（3 次重跑），非偶发
- [x] 测试优先：先复现 red → 修复 → green
- [x] 不是凭记忆
- [x] 不用 --no-verify
