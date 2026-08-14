<!--
  SYNOVA-IMPL-D271: V3 P2 Views 4+5 — workflow_graph.py + agent_health.py
  状态: dev doc | 2026-07-30
  权威文档: 权威17-工程规格-v1-0-20260729.md §五 Phase 2
  依赖: D267 (dependency-graph.json) D260 (View 1参考) D261 (View 2/3参考)
  并行: D272, D273 — 零共享文件
-->

# D271: V3 P2 Views 4+5 — 工作流图 + Agent 链路健康

> Self-diagnosis system Phase 2 completion. Two new view modules for the control tower dashboard.

---

## 1. 权威文档引用

**来源**: [权威文档17-工程规格-v1-0-20260729.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-工程规格-v1-0-20260729.md) §五

> Phase 2: views/*.py(5 个视图模块) + generate-dashboard.py 路由改造

> 视图四 workflow_graph.py: 工作流图 — 读依赖图JSON，生成HTML片段
> 视图五 agent_health.py: Agent链路健康 — 读pipeline/sentinel信号，三行摘要

**来源**: [预期状态模型 v3.1](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-预期状态模型-v3-1-20260729.md)

> V3 P2 Views 4+5 (workflow graph + agent health) — P2, 待构建
> 6 位专家并行工作——用户看不到谁在做,谁完成了,谁出错了

## 2. 代码审计——现状

### 2.1 已完成的基础设施

| 组件 | 文件 | 状态 |
|------|------|:---:|
| View 1 (流水线健康) | `scripts/control-tower/views/pipeline_health.py` | ✅ D260 |
| View 2 (PM仪表盘) | `scripts/control-tower/views/pm_dashboard.py` | ✅ D261 |
| View 3 (完成度) | `scripts/control-tower/views/completion.py` | ✅ D261 |
| View 1-3 路由 | `scripts/control-tower/generate-dashboard.py:37-38 import render_pm` | ✅ |
| 依赖图数据 | `D267 self-diagnosis.py` 构建 `dependency-graph.json` (419节点) | ⚠️ D267 仅内存构建,未持久化到文件——D271 需确保 View 4 实现时 dependency-graph.json 可读 |
| 门禁数据 | `.codex/signals/gate-status.json` — 17门禁状态 | ✅ |
| 哨兵数据 | `.codex/signals/gate-status.json` Gate 4-7 兜底 (sentinel.json 不存在) | ⚠️ |

### 2.2 View 1 参考模式 (pipeline_health.py ~80行)

```
输入: .codex/checkpoints/ 下的 JSON 文件 (4个检查点)
输出: 三行 HTML 摘要 (green/yellow/red)
降级: JSON 文件不存在 → status='unknown'
调用: generate-dashboard.py 导入后调用 render() 函数
契约: @input JSON文件 → @output HTML片段 → @degraded unknown
```

**关键约定**: 每个 view 文件暴露一个 render 函数,命名约定: `render_{name}()` (如 render_health, render_pm, render_completion)，被 generate-dashboard.py 导入后调用。

### 2.3 缺失内容

| 视图 | 功能 | 输入 | 输出 |
|------|------|------|------|
| View 4 | 工作流图 — 依赖关系可视化 | `.codex/dependency-graph.json` (419节点邻接表) | HTML mermaid/pre 图块 |
| View 5 | Agent链路健康 — 6专家状态 | gate-status.json Gate 5+12 | HTML 三行表格 (专家名/状态/最近诊断) |

## 3. 实现方案

### 3.1 写集（2个文件）

```
scripts/control-tower/views/workflow_graph.py  — 新建 ~100行 Python
scripts/control-tower/views/agent_health.py     — 新建 ~80行 Python
```

### 3.2 View 4: workflow_graph.py

**功能**: 读取 dependency-graph.json (419节点邻接表)，生成工作流依赖图 HTML 片段。

**输入**: `.codex/dependency-graph.json` (D267 自建依赖图，格式 `{nodes: {file: [deps...]}}`)

**输出**: HTML 片段 — mermaid flowchart 或纯文本邻接表（mermaid不可用时的降级）

**判定逻辑**:
- 依赖图存在 + 节点 > 100: `healthy` (绿色)
- 依赖图存在 + 节点 1-100: `degraded` (黄色，图可能不完整)
- 依赖图不存在: `unknown` (灰色)

**降级**: dependency-graph.json 不存在 → 返回 "依赖图未构建，请运行 self-diagnosis.py"

**参考实现**: `views/pipeline_health.py` — 读JSON→判状态→渲染HTML的函数签名模式

### 3.3 View 5: agent_health.py

**功能**: 读取 gate-status.json 的 Gate 5(专家诊断) 和 Gate 12(循环)，展示6位专家并行工作状态。

**输入**: `.codex/signals/gate-status.json`

**输出**: HTML 三行表格 — 每行对应一个专家组 (核心层3位 / 扩展层2位 / P0激活模板2位)，显示状态（active/idle/error）

**判定逻辑**:
- Gate 5 pass + Gate 12 pass: `healthy`
- 任一 partial: `degraded`
- 任一 fail: `critical`

**降级**: gate-status.json 不存在 → "门禁数据缺失"

### 3.4 文件结构约定（与 View 1 一致）

```python
def render_workflow() -> str:
    """返回 HTML 片段字符串。"""
    pass

def get_status() -> dict:
    """返回 {status: healthy|degraded|critical|unknown, reason: str}。"""
    pass
```

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | Python 内容验证 | 2 | 1) workflow_graph.render_workflow() 返回非空字符串 2) agent_health.render_agent() 返回含 table 标签 |
| L2a | Python 集成 | 2 | 1) dependency-graph.json 存在→healthy 2) gate-status.json 存在→正确聚合 |

测试文件: `tests/control-tower/test_views_45.py`

## 5. 接线要求

| 新 export | 调用方 | 确认方式 |
|-----------|--------|---------|
| `workflow_graph.render_workflow()` | `generate-dashboard.py` — import + 路由分发 | grep `workflow_graph` in generate-dashboard.py |
| `agent_health.render_agent()` | `generate-dashboard.py` — import + 路由分发 | grep `agent_health` in generate-dashboard.py |

generate-dashboard.py 已预存 `_HAS_VIEWS` 标志（L35-40），两个新模块加入 try/except ImportError 即可。

## 6. 完成标准

| # | 标准 | 验证 |
|---|------|------|
| 1 | workflow_graph.py 输出非空 HTML | Python 运行 |
| 2 | agent_health.py 输出含 6 专家状态 | Python 运行 |
| 3 | dependency-graph.json 缺失→降级 unknown | 删除文件后运行 |
| 4 | gate-status.json 缺失→降级 | 删除文件后运行 |
| 5 | generate-dashboard.py 成功导入两个新模块 | `python generate-dashboard.py --help` |
| 6 | CI 推送成功（纯 Python，tsc 不涉及） | CI |

## 7. 自检清单（铁律 0-5）

- [x] 已读权威文档原文（工程规格 §五 40+ 行 + V3-FINAL 方案）
- [x] 已引用测试权威规范（L1/L2a）
- [x] 已写接线要求（generate-dashboard.py 导入 + 路由）
- [x] 已验证 dependency-graph.json 构建方式（D267 self-diagnosis.py build_depgraph()）
- [x] 已验证 View 1 参考模板（pipeline_health.py 80行）
- [x] 不是凭记忆
- [x] 不用 --no-verify
