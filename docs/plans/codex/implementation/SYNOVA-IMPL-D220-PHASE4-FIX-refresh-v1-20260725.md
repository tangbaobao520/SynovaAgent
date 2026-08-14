# SynovaAgent -- D220-PHASE4-FIX 轮询退化修复 实施方案 v1.0

> 2026-07-25 | 审计发现：5 分钟 JS 轮询仅更新状态栏+文档进度条——信号卡片/门禁/阻断/RDC 不刷新
> **全部修复在 generate-dashboard.py 一个文件。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/generate-dashboard.py` 存在（D220-PHASE4 已交付）
- [x] Get-Content 读取：Ch7 §五 (L178-180) — "前端局部刷新四个区域（顶部信号条、左栏流水线、右栏健康雷达、底部可靠性趋势）"
- [x] Select-String 验证：当前 `refreshDashboard()` L348-364 — 仅更新 `status-bar` innerHTML + `.card-bar` width。未更新 signal cards、gate panel、blocks、RDC rows
- [x] 引用 — Ch7 §五验收标准 3："每 5 分钟自动刷新数据，局部更新不影响当前浏览位置"

---

## 问题清单

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| P1 | JS 轮询仅刷新状态栏+文档进度条——信号/门禁/阻断/RDC 不刷新 | L348-364 | `refreshDashboard()` 追加 4 个区域更新 |
| P2 | `derive_rdc_pipeline()` 调用两次 | L166, L168 | 提取为局部变量复用 |
| P3 | L1-L11 标签不匹配网守实际 L1-L9 检查 | L218-228 | 修正为 Ch2 §2.3 定义 |
| P3 | `has_brief = False` 连续赋值两次 | L79, L81 | 删除冗余行 |

---

## 修复内容

### 1. 扩展 `refreshDashboard()` — 追加 4 个区域更新（L348-364）

当前：
```javascript
sb.innerHTML = '...信号计数...';
bar.style.width = '...docs...%';
```

修复后：
```javascript
// 状态栏
sb.innerHTML = '<span style=color:' + (n>=6?'#22c55e':'#f59e0b') + '>● 控制塔仪表盘: ' + (n>=6?'[OK] 正常':'[WARN] 降级') + ' — ' + n + '/6 信号有效';

// 文档进度条
var bar = document.querySelector('.card-bar');
if (bar) bar.style.width = (docs.length ? Math.round(docs.filter(function(x){return x.exists}).length/docs.length*100) : 0) + '%';

// 信号卡片 — 重建所有 signal-card 的 status/reason/tier
updateSignalCards(d);

// 门禁面板 — 重建 gate-grid 内容
updateGatePanel(d);

// 阻断清单 — 重建 block-row 列表
updateBlocksList(d);

// RDC 流水线 — 重建 rdc-row 列表
updateRdcPipeline(d);
```

每个 `update*` 函数独立 try/catch——单区域失败不影响其他。实现从 `d.signals` / `d.gates` / `d.rdcPipeline` 提取数据 → 构建 HTML → 替换对应 DOM 元素 innerHTML。网守/红信号交互在 `updateSignalCards` 后重新绑定。

### 2. 缓存 `derive_rdc_pipeline()` 结果（L166-168）

```python
# 修复前
"rdcPipeline": derive_rdc_pipeline(),
"activeTasks": count_active_tasks(derive_rdc_pipeline()),

# 修复后
rdc = derive_rdc_pipeline()
return { ... "rdcPipeline": rdc, "activeTasks": count_active_tasks(rdc), ... }
```

### 3. 修正 L1-L11 标签（L218-228）

```javascript
var items = [
  ['L1-as_any', 'PASS'],
  ['L2-empty_catch', 'PASS'],
  ['L3-secrets', 'PASS'],
  ['L4-new_file_test', 'PASS'],
  ['L5-export_wiring', 'PASS'],
  ['L6-compute_test', 'PASS'],
  ['L7-sentinel_test', 'PASS'],
  ['L8-contract_consistency', 'PASS'],
  ['L9-error_patterns', 'PASS'],
  ['L10-health', 'PASS'],
  ['L11-dashboard_signal', 'PASS'],
];
```

这 11 项匹配 Ch2 §2.3 定义的 L1-L9 检查 + health + dashboard-signal。

### 4. 删除冗余 `has_brief = False`（L81）

删除 L81 行——L79 已初始化为 False。

---

## 不做什么

- 不修改静态模式、不修改 Python 数据采集逻辑、不修改 serve 模式端点

---

## 完成标准

```
[ ] refreshDashboard() 追加 updateSignalCards + updateGatePanel + updateBlocksList + updateRdcPipeline
[ ] 每个 update* 函数独立 try/catch
[ ] 网守/红信号交互在 signal cards 重建后重新绑定
[ ] derive_rdc_pipeline() 仅调用一次（局部变量缓存）
[ ] L1-L11 标签匹配 Ch2 §2.3
[ ] 删除冗余 has_brief = False
[ ] ≥3 个测试：refresh 信号更新(1) + refresh 门禁更新(1) + 单区域降级(1)
```
