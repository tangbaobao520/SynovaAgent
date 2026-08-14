# SynovaAgent -- D220-PHASE4 仪表盘 Ch7 对齐 实施方案 v1.0

> 2026-07-25 | 审计发现：7 项差距 — 缺失信号卡片 / 缺失活跃任务计数 / 缺失审计趋势 / 缺失自检行 / 网守 L1-L9 展开被替换 / 缺失分层标注
> **全部修复在 generate-dashboard.py 一个文件中。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/generate-dashboard.py` 存在（D220-PHASE3 已交付），Ch7 文档存在，附录 A v2.0 存在
- [x] Get-Content 读取：Ch7 §三 仪表盘布局 — 7 个区域（顶部信号条含 15 文档状态+活跃任务数+审计 P0/P1+趋势箭头 / 左栏 R/D/C 流水线 / 右栏六维健康雷达含指标分层 / 底部 Agent 可靠性趋势 Phase2 / 角落仪表盘自检行）。Ch7 §四 交互 — 网守卡片展开 11 行子状态（L1-L9+health+dashboard-signal）。Ch7 §二 组件列表 — 6 组件：上下文注射器/校验网守/契约存档器/写入锁/外部审计器/环境验证器
- [x] Select-String 验证：D220 `read_component_signals()` 渲染 `context-injector/gatekeeper/external-auditor/contract-archiver/dev-doc-gatekeeper/write-lock` 共 6 张卡片 — 缺 `环境验证器`，多了 `dev-doc-gatekeeper`。D220-FIX 网守 L1-L11 展开在 PHASE3 被替换为组件信号展示
- [x] 引用 — Ch7 §三.5 角落："控制塔仪表盘: 🟢 正常 — 最近快照 X 分钟前生成，6/6 信号有效"

---

## 差距清单

| # | 严重度 | Ch7 要求 | 实际 | 修复 |
|---|--------|---------|------|------|
| 1 | P1 | 环境验证器作为第 6 张信号卡片 | 有 dev-doc-gatekeeper 无 env-validator | 替换组件列表 |
| 2 | P1 | 网守卡片展开→L1-L9 11 子状态 | 被改为显示组件信号列表 | 恢复 D220-FIX L1-L11 |
| 3 | P2 | 活跃任务数在顶部信号条 | 未采集 | 新增 `count_active_tasks()` |
| 4 | P2 | 审计 P0/P1 + 趋势箭头 | 只读了文件未展示 | 增强 `render_html` 审计展示 |
| 5 | P2 | 仪表盘自检行指定格式 | 仅有信号计数 | 改为 Ch7 §三.5 格式 |
| 6 | P2 | 指标可实现性分层标注 | 无 | 追加 🟢/🟡/⚪ 分层标签 |
| 7 | P2 | Agent 可靠性趋势 Phase2 占位 | 无 | 追加 Phase2 占位行 |

---

## 构建内容

### 1. 修复组件列表——替换 dev-doc-gatekeeper → env-validator（render_html L180）

```python
# 修复前
for comp in ["context-injector", "gatekeeper", "external-auditor", "contract-archiver", "dev-doc-gatekeeper", "write-lock"]:

# 修复后（Ch7 §二 定义的 6 组件）
for comp in ["context-injector", "gatekeeper", "external-auditor", "contract-archiver", "write-lock", "env-validator"]:
```

同步更新 `read_component_signals()` 中的 components 列表。

### 2. 恢复网守 L1-L11 展开（render_html JS 部分）

恢复 D220-FIX 的 L1-L11 硬编码列表（L1-as_any 到 L11-dash），替换 PHASE3 引入的组件信号展示。这些值虽然当前是硬编码（网守未执行过），但它展示了网守的内部结构——Ch7 明确要求 11 子项。

### 3. 新增活跃任务计数（collect_dashboard_data）

```python
def count_active_tasks(rdc_pipeline: list) -> int:
    """活跃任务 = RDC 三阶段未全部完成的任务"""
    return sum(1 for item in rdc_pipeline if not item.get("committed"))
```

在 `collect_dashboard_data()` 返回 dict 中追加 `"activeTasks": count_active_tasks(...)`。

### 4. 增强审计展示——P0/P1 计数 + 趋势（render_html）

从 `data["audit"]` 的 findings 中统计 `severity == "high"` → P0 计数 / `severity == "medium"` → P1 计数。在顶部信号条追加一行：
```
审计: P0: 5 / P1: 12 | 趋势: 数据积累中 (需 10+ 次审计)
```

### 5. 仪表盘自检行——Ch7 §三.5 格式（render_html 状态栏）

```html
控制塔仪表盘: 🟢 正常 — 最近快照 {ts}，{signal_count}/6 信号有效
```
如果 signal_count < 6：降级为 `🟡 降级 — 最近快照 {ts}，{signal_count}/6 信号有效（{missing_components} 信号缺失）`

### 6. 指标可实现性分层标注（render_html 信号卡片）

每张信号卡片追加分层标签行：

```html
<span style="color:#22c55e">● 状态</span>
<span style="color:#f59e0b;margin-left:6px">● 计数</span>  
<span style="color:#9ca3af;margin-left:6px">○ 趋势（数据积累中）</span>
```

状态基于 signal.status 动态变化：green→🟢/yellow→🟡/red→🔴/unknown→⚪。

### 7. Agent 可靠性趋势 Phase2 占位（render_html 底部）

```html
<div class="card card-full">
  <h2>Agent 可靠性趋势</h2>
  <div style="color:#9ca3af;font-size:12px">数据积累中 — 需要 10 次以上审计记录后激活 (Phase 2)</div>
</div>
```

---

## 不做什么

- 不修改数据采集逻辑（`read_*` 函数保持不动）
- 不修改 serve 模式 5 分钟轮询逻辑
- 不修改静态模式
- 不新增 Python 依赖

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 6 张信号卡片含 env-validator 而非 dev-doc-gatekeeper
- 网守卡片点击展开 L1-L11（非组件信号）
- 活跃任务计数 = RDC 未全部完成的任务数
- 仪表盘自检行含 "控制塔仪表盘" + 信号计数
- Agent 可靠性趋势 Phase2 占位行
- 5 个测试，每测试 ≥3 expect()

---

## 完成标准

```
[ ] 组件列表: dev-doc-gatekeeper → env-validator
[ ] 网守卡片展开: 恢复 L1-L11 硬编码（非组件信号）
[ ] 活跃任务计数: count_active_tasks() + 顶部信号条展示
[ ] 审计 P0/P1 计数 + 趋势: 从 audit findings 提取
[ ] 自检行: Ch7 §三.5 格式（控制塔仪表盘: 🟢/🟡 + 信号数）
[ ] 分层标注: 🟢状态/🟡计数/⚪趋势 每卡片动态标注
[ ] Agent 可靠性 Phase2 占位行
[ ] ≥5 个测试
```
