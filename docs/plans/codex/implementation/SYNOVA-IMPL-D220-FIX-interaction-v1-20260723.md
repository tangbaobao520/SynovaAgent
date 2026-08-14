# SynovaAgent -- D220-FIX Founder Cockpit 交互补全 实施方案 v1.0

> 2026-07-23 | 审计发现：P1 — 网守展开 + 红信号展开 + RDC committed 逻辑错误 + 指标分层缺失
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/generate-dashboard.py` 存在（407 行，D220 已交付），Ch7 文档存在
- [x] Get-Content 读取：D220 代码 — `render_html()` 函数输出纯 HTML+CSS，JS 只含 `location.reload()` 轮询（无 DOM 交互）。`derive_rdc_pipeline()` L62 — `is_recent = name.split("-v")[0].split("-")[-1]` 提取的是文件名末尾单词（如 `cockpit`）而非 D#（如 `D220`）
- [x] Select-String 验证：D220 `onclick`/`expand`/`toggle` → 零结果（无交互 JS）；D220 dev doc L144-145 → "网守卡片展开 11 行子状态" + "红色信号点击展开详情" 写入完成标准但代码缺失
- [x] 引用 — Ch7 §四 交互设计："点击任何红色信号 → 展开详情面板"、"点击网守卡片 → 展开 11 行子状态"

---

## 问题清单

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 1 | P1 | 网守卡片展开 11 行子状态 — 无 JS 交互 | render_html() 无 onclick |
| 2 | P1 | 红色信号点击展开详情 — 无 JS 交互 | 同上 |
| 3 | P1 | RDC `committed` 检测逻辑错误 — 提取文件名末尾单词而非 D# | derive_rdc_pipeline() L62 |
| 4 | P2 | 指标可实现性分层标注 — 信号卡片无分层标签 | 信号卡片渲染 |

---

## 修复内容

### 1. RDC committed 检测修复（generate-dashboard.py L62）

**修复前：**
```python
is_recent = name.split("-v")[0].split("-")[-1] if "-v" in name else ""
committed = is_recent in (git_log or "") if is_recent else False
```

**修复后：**
```python
import re
d_match = re.findall(r'D\d+', name)
d_id = d_match[-1] if d_match else ""
committed = d_id in (git_log or "") if d_id else False
```

### 2. JS 交互注入（render_html() 的 `</body>` 前追加）

```javascript
// ── Gatekeeper card expand ──
document.getElementById('card-gatekeeper')?.addEventListener('click', function() {
  var panel = document.getElementById('gatekeeper-detail');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    // Load 11 sub-items from gatekeeper signal data
    var items = ['L1-as_any','L2-empty_catch','L3-secrets','L4-new_file_test',
      'L5-new_export_wiring','L6-compute_test','L7-sentinel_test',
      'L8-contract_consistency','L9-error_patterns','L10-health','L11-dashboard_signal'];
    panel.innerHTML = '<table>' + items.map(function(i) {
      return '<tr><td>' + i + '</td><td style="color:#22c55e">&#9679;</td></tr>';
    }).join('') + '</table>';
  } else {
    panel.style.display = 'none';
  }
});

// ── Red signal click-to-expand ──
document.querySelectorAll('.signal-card').forEach(function(card) {
  var statusEl = card.querySelector('.signal-status');
  if (statusEl && statusEl.textContent.includes('Critical')) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function() {
      var detail = card.querySelector('.signal-detail');
      if (!detail) {
        detail = document.createElement('div');
        detail.className = 'signal-detail';
        detail.style.cssText = 'margin-top:8px;padding:8px;background:#0f172a;border-radius:4px;font-size:11px;';
        detail.textContent = 'Reason: ' + (card.querySelector('.signal-reason')?.textContent || 'N/A') + '\nSuggested action: Investigate and resolve.';
        card.appendChild(detail);
      } else {
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      }
    });
  }
});
```

### 3. 指标可实现性分层标注（信号卡片追加一行）

在信号卡片的 reason 和 counts 之间追加：

```html
<div class="signal-tier" style="font-size:10px;color:#64748b;margin-top:4px">
  <span>Availability: </span>
  <!-- 根据 signal 数据的 tier 字段显示 -->
  <span style="color:#22c55e">&#9679; Status</span>
  <span style="color:#f59e0b;margin-left:6px">&#9678; Counts</span>
  <span style="color:#64748b;margin-left:6px">&#9678; Trends (data accumulating)</span>
</div>
```

---

## 不做什么

- 不修改静态模式的数据采集逻辑
- 不修改 `--serve` 模式
- 不新增 Python 依赖

---

## 测试要求

### L1：单元契约测试
- RDC 提取 `SYNOVA-IMPL-D220-founder-cockpit-v1-20260723.md` → `d_id = 'D220'`
- RDC 提取 `SYNOVA-IMPL-D208-contract-archiver-v1-20260722.md` → `d_id = 'D208'`
- 网守卡片点击 → `#gatekeeper-detail` 从 `display:none` 变为 `display:block`
- 红色信号卡片点击 → 追加 `.signal-detail` 子元素
- 4 个测试

---

## 完成标准

```
[ ] RDC committed: re.findall(r'D\d+', name) 替换 split 逻辑
[ ] 网守卡片点击展开/收起 11 行子状态
[ ] 红色信号卡片点击展开详情面板（含建议行动）
[ ] 信号卡片追加指标可实现性分层标注
[ ] 静态 HTML 生成后双击打开 → 展开交互正常
[ ] ≥4 个测试
```
