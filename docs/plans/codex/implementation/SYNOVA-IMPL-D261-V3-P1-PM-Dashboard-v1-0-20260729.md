<!-- SYNOVA-IMPL-D261 v1.0 | 2026-07-29 | V3 Phase 2 P1 — PM仪表盘+完成度 -->
# SynovaAgent -- D261 V3 P1 PM仪表盘+系统完成度（视图2+3）v1.0
> V3 §二-§三: 条件分组门禁, 六条件判定引擎, 版本化快照

## V3 权威文档引用
> §2.2 视图2用户看到: 四个条件(A/B/C/D)分别的完成百分比+剩余任务列表
> §2.3 task brief 模板新增 #CRITERIA 必填字段
> §3.2 六条件判定引擎: 代码存在/接线完整/测试存在/路径可达/依赖可用/无已知缺陷
> §3.3 版本化快照: .codex/snapshots/{timestamp}/, 30天每日+90天每周+归档
> §6.1 视图架构: 每个视图独立Python模块, generate-dashboard.py 只做路由

## 代码验证
- check-gates-v2.py: `write_report()` 直接写 .codex/signals/gate-status.json, 无快照目录, 无条件分组 ❌
- generate-dashboard.py: `render_html()` 内联全部 7 区域, 无 views/* 模块导入 ❌
- emit-signal.py: 当前字段: component/status/reason/p0/p1/p2, 无 completion_score ❌
- scripts/control-tower/views/ 目录不存在 ❌

## Q0-Q4
Q0: 17 门禁平铺列表→按条件分组进度条。六条件判定每个任务的实际完成度。版本化快照看不到趋势。
Q2: 做——check-gates-v2.py 快照写入 snapshots/{timestamp}/ + 门禁按条件分组; 新建 completion-engine.py 六条件判定; 新建 views/pm_dashboard.py + views/completion.py; generate-dashboard.py 改为导入 views/* 路由; emit-signal.py 新增 completion_score; 新建 snapshot-cleanup.sh 生命周期管理; 新建 .codex/snapshots/ 目录。不做——视图4/5(归 P2)。
Q3: check-gates-v2.py 运行→写 snapshots/{ts}/gate-status.json+completion-scores.json→generate-dashboard.py 导入 pm_dashboard.render() + completion.render()→HTML
Q4: Python 语法检查 + 快照目录创建。L1 手动×4。

## 改动 (4 修改 + 5 新文件)

### 1. scripts/audit/check-gates-v2.py — 快照+条件分组 (~30行)
`write_report()` 改为:
```python
snapshot_dir = f'.codex/snapshots/{datetime.now().isoformat()}/'
os.makedirs(snapshot_dir, exist_ok=True)
write_json(f'{snapshot_dir}/gate-status.json', report)
# 新增: 门禁按条件分组
criteria_groups = {'A':[], 'B':[], 'C':[], 'D':[]}
for gate in report['gates']:
    criteria_groups[gate.get('criteria','?')].append(gate)
```

### 2. scripts/audit/completion-engine.py — **新建** (~80行)
六条件判定: 代码存在(Test-Path), 接线完整(grep 调用方), 测试存在(Test-Path .test.ts), 路径可达(import 链验证), 依赖可用(node_modules), 无已知缺陷(known-error-patterns.json 匹配)
输出 completion-scores.json

### 3. scripts/control-tower/views/pm_dashboard.py — **新建** (~60行)
`render_pm(data)` → HTML: 四条件进度条(A/B/C/D), 每个条件的剩余任务列表

### 4. scripts/control-tower/views/completion.py — **新建** (~70行)
`render_completion(data)` → HTML: 时间轴滑块, 六条件雷达图, 30天趋势线

### 5. scripts/control-tower/generate-dashboard.py — 视图路由重构 (~20行)
`render_html()` 改为:
```python
from views.pipeline_health import render_health
from views.pm_dashboard import render_pm
from views.completion import render_completion
# ... 导入+路由
```
原有 7 区域渲染代码保留但用 `if not views_available` fallback。

### 6. scripts/control-tower/emit-signal.py — Schema扩展 (~5行)
追加可选字段: `completion_score`, `deviation_list`

### 7. scripts/cron/snapshot-cleanup.sh — **新建** (~20行)
30天每日保留, 90天每周保留, 归档(date -d "90 days ago")

### 8. .codex/snapshots/ — 新建目录

## 测试 (L1 手动×4)
| # | 测试 | 验证 |
|---|------|------|
| 1 | python check-gates-v2.py → snapshots/{ts}/ 目录+文件存在 | 执行+检查 |
| 2 | python completion-engine.py 导入成功 | 语法 |
| 3 | python views/pm_dashboard.py + views/completion.py 导入成功 | 语法 |
| 4 | bash snapshot-cleanup.sh -n 语法通过 | 语法 |

## 完成标准
PM 仪表盘四条件进度条+完成度时间轴可渲染。generate-dashboard.py views/* 路由重构。快照目录版本化。全部语法通过。
