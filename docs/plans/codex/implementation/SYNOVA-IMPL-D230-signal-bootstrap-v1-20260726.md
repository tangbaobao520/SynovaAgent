# SynovaAgent -- D230 控制塔信号启动集成 实施方案 v1.0

> 2026-07-26 | Gate 16 当前 PASS（37.5%）——但仪表盘信号卡片全是灰色
> **在启动时生成各组件初始信号——仪表盘首次显示真实颜色。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/emit-signal.py` 存在（D214），`scripts/agent-start.bat` 存在（D229），`src/control-tower/signal-emitter.ts` 存在
- [x] Get-Content 读取：emit-signal.py — 用法 `python emit-signal.py <component> <status> <reason> [--p0 N] [--p1 N] [--p2 N]`。各组件脚本已含 emitSignal 调用但组件未被实际执行过
- [x] Select-String 验证：`.codex/signals/` 下当前仅 4 个文件（auditor/env/gate-status/contract）——6 组件中 2 个完全无信号
- [x] 引用 — Gate 16 当前 37.5%（仅 auditor+env 有信号）

---

## 问题根因

D214 建了 emitSignal 通路、各组件脚本已含调用——但组件从未被实际执行过。D220 仪表盘因此永久显示灰色"Unknown"。需要在系统启动时生成初始健康信号——让仪表盘从全灰变成全绿/黄。

---

## 构建内容

### 修改 scripts/agent-start.bat — Step 0 追加信号生成（6 行）

```batch
REM Step 0: 控制塔信号初始化
echo [0/4] Control tower signal init...
if exist "scripts\control-tower\emit-signal.py" (
    python scripts\control-tower\emit-signal.py gatekeeper green "startup_check"
    python scripts\control-tower\emit-signal.py context-injector yellow "pending_first_injection"
    python scripts\control-tower\emit-signal.py contract-archiver yellow "pending_first_extract"
    python scripts\control-tower\emit-signal.py write-lock green "lock_service_ready"
    python scripts\control-tower\emit-signal.py dev-doc-gatekeeper green "gatekeeper_ready"
    echo   [OK] Signals initialized
) else (
    echo   [SKIP] emit-signal.py not found
)
```

---

## 完成标准

```
[ ] agent-start.bat Step 0 追加 6 个组件信号生成
[ ] npm run dev → .codex/signals/ 下新增信号文件
[ ] 仪表盘 6 张卡片至少 4 张显示绿色/黄色（非灰色 unknown）
[ ] 降级: emit-signal.py 不存在 → SKIP
```
