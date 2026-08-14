# SynovaAgent -- D220 创始人全局仪表盘 (Founder Cockpit) 实施方案 v1.0

> 2026-07-23 | 权威文档 #17 第七章 Ch7 — 创始人全局仪表盘
> **D213 互补组件。双模式——静态 HTML 按需生成 + --serve HTTP 服务实时刷新。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/control-tower/signal-emitter.ts` 存在（D214，6 组件统一信号格式），`scripts/audit/audit-rules.sh` 存在（D216，审计数据源），`app/control-tower.html` 存在（D213，互补组件）
- [x] Get-Content 读取：Ch7 §二 数据流 — D214 完成前降级为直读原始路径（`.codex/settings/gatekeeper/.dashboard-signal` 管道 / `.codex/settings/injections/` 目录 / `.codex/settings/env-snapshot.json`）。Ch7 §五 技术实现 — 双模式：静态 `generate-dashboard.py` → HTML / 服务 `--serve` → `localhost:8899` + 5 分钟 JS 轮询
- [x] Select-String 验证：Ch7 §七 验收标准 13 条 — 静态模式(1) / serve 模式(2) / 5min刷新(3) / 单信号降级(4) / 15文档状态(5) / RDC流水线(6) / 6维雷达(7) / 信号缺失标注(8) / 指标分层(9) / Agent趋势Phase2(10) / 自检行(11) / 红信号展开(12) / 网守展开(13)
- [x] 引用 — Ch7 §一："D213=值班监控屏（实时轮询），Ch7=创始人驾驶舱（本地双模式）。三者互补，不替代。"

---

## 问题根因

D213 是快速健康检查（6 组件状态 + 阻断清单），但缺少深度项目视图——15 份权威文档完成状态、R/D/C 流水线、六维健康雷达（含注射成功率/拦截率/确认率/冲突次数等衍生指标）、Agent 可靠性趋势。Ch7 补全这层视图，生成可双击打开的静态 HTML 或本地 HTTP 服务持续刷新。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 创始人深度驾驶舱。Python CLI 脚本 `generate-dashboard.py`（~350 行）→ 读取 6 组件信号 + 项目元数据 → 渲染自包含 HTML。双模式：静态生成 → 双击打开；`--serve` → 本地 HTTP 服务 `localhost:8899` + JS 5 分钟轮询。

### Q1：调研
- D214 signal-emitter.ts：6 组件信号统一存储 `.codex/signals/{component}.json`（JSON 格式：status/timestamp/reason/p0_count/p1_count/p2_count）
- D201-Phase2 gatekeeper：`.dashboard-signal` 管道格式（`COLOR|component|timestamp|reason`）——已有，D213 兼容
- D216 audit-rules.sh：审计结果 `.codex/audit/audit-result.json`（findings[] + summary）
- D211 env-validator.py：`.codex/env-snapshot.json`（7 节 9 字段环境快照）
- DASHBOARD.md：15 份权威文档完成状态 + D# 任务列表
- `.codex/task-briefs/` 目录 + `docs/plans/codex/implementation/` 目录 → R/D/C 流水线推导

### Q2：范围
- 最小：`scripts/control-tower/generate-dashboard.py`（Python CLI，~350 行）→ 静态模式生成 HTML / `--serve` 启动本地 HTTP + JS 轮询
- 不做：不修改 D213、不修改 D214、不新建数据源（全部从已有文件推导）

### Q3：验收
- 静态模式：`python generate-dashboard.py` → 输出 `app/synova-founder-dashboard-{timestamp}.html` → 双击打开显示完整仪表盘
- 服务模式：`python generate-dashboard.py --serve` → `localhost:8899` → 浏览器打开 → 每 5 分钟 JS 自动刷新
- 信号缺失：5/6 信号源当前缺失（D214 刚上线，各组件尚未接入）→ 诚实标注"信号文件不存在"

### Q4：契约与测试
- @input：`.codex/signals/` + `.codex/audit/` + `DASHBOARD.md` + `docs/plans/codex/implementation/` + `.codex/task-briefs/`
- @output：自包含 HTML 文件（静态模式）或 HTTP 响应 JSON（服务模式 `/api/dashboard-data`）
- @degraded：信号文件缺失 → 对应卡片显示"信号文件不存在" + 不影响其他卡片
- 测试：静态 HTML 生成(2) + serve 启动(1) + 信号降级(1) + RDC 推导(1) = 5 tests

---

## 构建内容

### 1. scripts/control-tower/generate-dashboard.py（新建，约 350 行）

```python
class DashboardGenerator:
  # ── 数据采集 ──
  def scan_auth_docs() -> list[DocStatus]        # 15 份文档完成/进行中/未开始
  def derive_rdc_pipeline() -> list[TaskRDC]     # .codex/task-briefs/ + docs/plans/ + git log
  def read_component_signals() -> list[Signal]   # .codex/signals/ (D214) 或降级直读原始路径
  def read_audit_summary() -> AuditSummary       # .codex/audit/audit-result.json
  def read_env_status() -> EnvStatus             # .codex/env-snapshot.json

  # ── 渲染 ──
  def render_html(data: DashboardData) -> str    # 自包含 HTML

  # ── 双模式 ──
  def generate_static(output_path: str) -> None  # 静态模式：生成 HTML 文件
  def serve(port: int = 8899) -> None            # 服务模式：HTTP server + /api/dashboard-data
```

**7 个仪表盘区域：**
1. 顶部信号条 — 15 文档状态 + 活跃任务数 + 最近审计 P0/P1 + 趋势箭头
2. 左栏流水线 — 每个活跃任务一行 R/D/C 三阶段信号灯
3. 右栏六维雷达 — 6 组件健康信号（含指标分层标注）
4. 底部 Agent 可靠性趋势 — Phase 2 标注"数据积累中(N/10)"
5. 24h 审计摘要 — 来自 D216 `audit-result.json`
6. P0/P1 活跃阻断 — 红色信号下钻
7. 最近完成 — 从 DASHBOARD.md 提取

**关键交互（HTML 内嵌 JS）：**
- 网守卡片展开 → 11 行子状态（L1-L9 + health + dashboard-signal）
- 红色信号点击 → 展开详情面板
- P0 计数点击 → 下钻到具体清单
- 5 分钟轮询（仅 `--serve` 模式）→ 局部刷新 4 区域
- 仪表盘自检行 → 快照时间戳 + 6/6 信号检查

### 2. HTML 模板（嵌入 Python 脚本，约 200 行）

- 深色主题，CSS 内嵌
- 4 区域网格布局
- JavaScript 内嵌：5 分钟定时器 + fetch `/api/dashboard-data` + 局部 DOM 更新
- 降级逻辑：fetch 失败 → 保留上次数据 + 静默等待下次刷新

---

## 不做什么

- 不修改 D213 control-tower.html（互补，不替代）
- 不修改 D214 signal-emitter.ts（已有统一信号格式）
- 不新建数据源（全部从已有文件和目录推导）
- 不实现 WebSocket 实时推送（MVP：轮询）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `generate-dashboard.py` 静态模式 → 输出有效 HTML 文件
- HTML 包含 7 个区域（15 文档条 / RDC 流水线 / 6 维雷达 / Agent 趋势 / 审计摘要 / 阻断清单 / 最近完成）
- 所有 6 个信号文件缺失 → 6 张卡片均显示"信号文件不存在"（不崩溃）
- `--serve` 模式 → `localhost:8899` 可访问
- R/D/C 推导：有 brief 无 dev doc → R 完成 D 未完成 C 未完成
- 5 个测试，每测试 ≥3 expect()

### L2a：接线测试
- `python generate-dashboard.py --help` 退出码 0
- `python generate-dashboard.py --serve` 启动后 `curl localhost:8899` 返回 200

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| generate-dashboard.py | 开发者手工运行 | `python generate-dashboard.py --help` |
| 静态 HTML | 浏览器双击打开 | Test-Path + 文件大小 > 0 |
| `/api/dashboard-data` | HTML 内 JS fetch | `curl localhost:8899/api/dashboard-data` |

---

## 完成标准

```
[ ] generate-dashboard.py: 静态模式生成自包含 HTML
[ ] generate-dashboard.py: --serve 模式启动 localhost:8899
[ ] HTML 7 个区域全部渲染
[ ] 15 文档状态条（从 DASHBOARD.md 提取）
[ ] R/D/C 流水线（从 .codex/task-briefs/ + docs/plans/ + git log 推导）
[ ] 6 维健康雷达（从 D214 .codex/signals/ 读取，降级直读原始路径）
[ ] 网守卡片展开 11 行子状态
[ ] 红色信号点击展开详情
[ ] Agent 可靠性趋势 Phase 2 标注
[ ] 仪表盘自检行（快照时间戳 + 信号计数）
[ ] 5 分钟 JS 轮询（serve 模式）
[ ] 单信号降级不影响其他卡片
[ ] 信号缺失诚实标注"信号文件不存在"
[ ] 指标可实现性分层标注
[ ] ≥5 个测试
```

---

## 权威文档引用

- 权威文档 #17 第七章：创始人全局仪表盘 — 全部 7 节
- D213 control-tower.html（互补组件）
- D214 signal-emitter.ts（信号格式定义）
- D216 audit-rules.sh（审计数据源）
- D211 env-validator.py（环境数据源）
- DASHBOARD.md（15 文档状态 + 任务列表）
