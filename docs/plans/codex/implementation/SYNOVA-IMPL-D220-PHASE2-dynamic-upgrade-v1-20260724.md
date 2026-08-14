# SynovaAgent -- D220-PHASE2 Founder Cockpit 动态升级 实施方案 v1.0

> 2026-07-24 | 权威文档 #17 Ch7 §五 + 附录 A v2.0
> **将 --serve 模式从 location.reload() 全页刷新升级为局部 DOM 更新 + 附录 A 17 门禁状态面板**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/generate-dashboard.py` 存在（D220+D220-FIX 已交付），`docs/synova/research/创始人控制塔系统-20260722/SYNOVA-RESEARCH-附录A-产品完整性门禁判定标准-v2-0-20260724.md` 存在
- [x] Get-Content 读取：Ch7 §五 — "前端局部刷新四个区域（不需要整页重载）。如果某个信号文件读取失败，该卡片显示信号文件不存在——不影响其他卡片刷新。网络中断时，页面保留上次成功的数据，静默等待下次刷新。" 附录 A §三 — `check-gates-v2.py` 输出 `.codex/signals/gate-status.json`，含 17 门禁 pass/partial/fail 状态 + 依赖链降级记录
- [x] Select-String 验证：D220 当前 JS — `location.reload()`（L401）全页刷新 + 重复 `<script>` 块（L340-341）。D220-FIX 追加了网守/红信号交互但 JS 重复 bug 使交互失效
- [x] 引用 — Ch7 §五验收标准 3："--serve 模式下每 5 分钟自动刷新数据，局部更新不影响当前浏览位置"

---

## 问题根因

D220 的 `--serve` 模式使用 `location.reload()` 全页刷新——Ch7 §五明确要求"局部更新四个区域"。D220-FIX 追加了网守/红信号交互 JS 但在 f-string 中重复了一次——两个完全相同的 `<script>` 块导致 click handler 注册两遍，toggle 在同一个事件循环内创建后立即隐藏，交互全部失效。附录 A 的 17 门禁状态完全没有在仪表盘中展示。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — Founder Cockpit 动态升级。修复 JS 重复 bug → 将 serve 模式 JS 从 `location.reload()` 重构为 fetch JSON → 局部 DOM 更新 5 个区域 → 新增附录 A 17 门禁状态面板 → 保持降级逻辑。

### Q1：调研
- Ch7 §五验收标准 3+4+8：局部刷新、单信号降级不影响其他、信号缺失诚实标注
- 附录 A §三-四：`check-gates-v2.py` → `.codex/signals/gate-status.json` → 仪表盘展示 17 门禁状态
- D220 当前问题：(a) 重复 `<script>` 块 L340-341 (b) `location.reload()` L401 (c) `import re as _re220` L74 冗余 (d) `has_brief` 子串匹配 L72 (e) 无门禁状态面板 (f) 分层标签是硬编码字符串

### Q2：范围
- 最小：(A) 删除重复 `<script>` 块 (B) 重写 serve 模式 JS：`fetch /api/dashboard-data` → JSON → 独立更新 5 个区域 (C) 新增门禁状态面板（从 gate-status.json 读取） (D) 修复 `has_brief` 子串匹配 → D# 正则 (E) 删除冗余 import (F) 分层标签改为数据驱动
- 不做：不修改静态模式（仍生成自包含 HTML）、不修改 Python 数据采集逻辑（仅追加 `read_gate_status()`）

### Q3：验收
- 入口：`python generate-dashboard.py --serve` → `localhost:8899` → 浏览器打开 → 5 分钟后自动局部更新
- 交互：5 分钟后 JS fetch `/api/dashboard-data` → 更新文档进度条、RDC 流水线、信号卡片、阻断清单、门禁面板——页面不闪烁，滚动位置保持
- 结果：任一区域 fetch 失败 → 该区域保持上次数据 + console.warn → 其他区域正常更新

### Q4：契约与测试
- @input：`/api/dashboard-data` JSON（含 signals/gates/authDocs/rdcPipeline/audit/blocks）
- @output：5 个 DOM 区域局部更新 + 门禁面板渲染
- @degraded：单区域更新失败 → 该区域保留旧数据 + warn → 其他区域正常
- 测试：局部更新不闪烁(1) + 单区域降级(1) + 门禁面板渲染(1) + 网守交互正常(1) + 红信号交互正常(1) = 5 tests

---

## 构建内容

### 1. 修复 generate-dashboard.py — 删除重复 JS 块（约 L340-341）

f-string 中第二个重复的 `<script>document.addEventListener(...)</script>` 块整行删除。

### 2. 修复 generate-dashboard.py — RDC `has_brief` 精确匹配（L72）

```python
# 修复前
has_brief = any(name in str(b) for b in briefs_dir.iterdir())

# 修复后
d_match = re.findall(r"D\d+", name)
d_id = d_match[-1] if d_match else ""
has_brief = any(d_id in str(b) for b in briefs_dir.iterdir()) if d_id else False
```

### 3. 删除冗余 import（L74）

删除 `import re as _re220`——L23 已有全局 `import re`。所有地方直接用 `re.findall()`。

### 4. 重写 serve 模式 JS — 局部 DOM 更新（替换 L399-405 的 `location.reload()`）

```javascript
// 5 分钟局部刷新（不重载页面）
async function refreshDashboard() {
  try {
    const r = await fetch('/api/dashboard-data');
    if (!r.ok) return; // 静默降级
    const data = await r.json();

    // 区域 1: 文档进度条
    updateDocsBar(data);
    // 区域 2: Pipeline 进度条
    updatePipelineBar(data);
    // 区域 3: 信号卡片（保留交互状态）
    updateSignalCards(data);
    // 区域 4: 阻断清单 + 最近提交
    updateBlocksAndRecent(data);
    // 区域 5: 门禁状态面板
    updateGatePanel(data);
    // 状态栏时间戳
    updateStatusBar(data);
  } catch(e) {
    // 静默降级——保留上次数据
    console.warn('Dashboard refresh failed, keeping last data:', e);
  }
}
setInterval(refreshDashboard, 300000);
```

每个 `update*` 函数独立 try/catch——单区域失败不影响其他区域。

### 5. 新增 `read_gate_status()` — 门禁状态数据采集（追加到 Python 数据采集区）

```python
def read_gate_status() -> Dict[str, Any]:
    gate_path = PROJECT_ROOT / ".codex/signals/gate-status.json"
    if gate_path.exists():
        try:
            return json.loads(gate_path.read_text(encoding="utf-8"))
        except:
            pass
    return {"gates": [], "summary": {"passed": 0, "partial": 0, "failed": 0}}
```

### 6. 新增门禁状态面板渲染（追加到 `render_html()`）

```html
<div class="card card-full">
  <h2>17 Product Gates — <span style="color:#22c55e">{passed}</span> Pass / <span style="color:#f59e0b">{partial}</span> Partial / <span style="color:#ef4444">{failed}</span> Fail</h2>
  <div class="gate-grid">
    <!-- 每个门禁一行: 维度标签 | 门禁名称 | 状态色圆点 | 条件详情 -->
  </div>
</div>
```

### 7. 分层标签数据驱动（替换 L193 硬编码字符串）

```python
# 根据信号数据生成动态分层标签
tier_parts = []
if st != "unknown": tier_parts.append('<span style="color:#22c55e">Status: Available</span>')
else: tier_parts.append('<span style="color:#64748b">Status: No Signal</span>')
p_counts = sig.get("p0", 0) + sig.get("p1", 0) + sig.get("p2", 0)
if p_counts > 0: tier_parts.append('<span style="color:#f59e0b;margin-left:6px">Counts: ' + str(p_counts) + '</span>')
else: tier_parts.append('<span style="color:#64748b;margin-left:6px">Counts: N/A</span>')
tier_parts.append('<span style="color:#64748b;margin-left:6px">Trends: Data Accumulating</span>')
tier_html = ''.join(tier_parts)
```

---

## 不做什么

- 不修改静态模式（仍生成自包含 HTML，双击打开可用）
- 不修改 `/api/dashboard-data` 端点逻辑
- 不对 `check-gates-v2.py` 做任何修改（附录 A 脚本独立运行）
- 不新增 Python 依赖

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- serve JS fetch 成功 → 5 个区域全部更新（DOM 变化可检测）
- serve JS fetch 失败 → 所有区域保留旧数据 + console.warn
- 单区域更新失败（mock 一个 update 函数抛异常）→ 其他 4 区域正常更新
- 门禁面板渲染 6 pass / 7 partial / 4 fail → 3 色计数正确
- 网守卡片点击 → gk-detail toggle 正常（非双击失效）
- 5 个测试，每测试 ≥3 expect()

### L2a：接线测试
- `generate-dashboard.py` f-string 中仅 1 个 `<script>` 块（非重复）
- `read_gate_status()` 函数存在且被 `collect_dashboard_data()` 调用

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| `/api/dashboard-data` JSON | serve JS fetch | curl localhost:8899/api/dashboard-data |
| `read_gate_status()` | `collect_dashboard_data()` → `render_html()` | grep "gate_status" generate-dashboard.py |
| 局部 DOM 更新 JS | serve 模式 HTML `<script>` | grep "refreshDashboard" generate-dashboard.py |

---

## 完成标准

```
[ ] 重复 <script> 块已删除（f-string 中仅 1 个）
[ ] RDC has_brief 使用 re.findall(r"D\d+") 精确匹配
[ ] 删除冗余 import re as _re220
[ ] serve JS: fetch /api/dashboard-data → 5 区域独立局部更新
[ ] 单区域更新失败不影响其他区域
[ ] 网络中断 → 静默保留上次数据
[ ] 门禁状态面板: 17 行 pass/partial/fail 三色渲染
[ ] read_gate_status() 函数 + 集成到 collect_dashboard_data()
[ ] 分层标签数据驱动（Status/Counts/Trends 根据 signal 数据动态生成）
[ ] 网守卡片点击交互正常（非双击失效）
[ ] 红信号卡片点击交互正常
[ ] ≥5 个测试
```

---

## 权威文档引用

- 权威文档 #17 Ch7 §五 — serve 模式局部刷新 + 降级保护 (行 178-184)
- 权威文档 #17 附录 A v2.0 — 17 门禁自动判定 + gate-status.json 输出 (§三-四)
- D220 dev doc + D220-FIX dev doc
- AGENTS.md 铁律 0-3（写开发文档前必须阅读权威文档原文）
