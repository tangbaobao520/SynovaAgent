<!--
  SYNOVA-IMPL-D320: 仪表盘 git 化生成器 v1 — gen-task-board.py 渲染 DASHBOARD-CN/EN
  状态: dev doc | 2026-08-08 | 优先级 P1 (核心; 双机看板权威源)
  权威文档: D220 生成器契约 + D296 数据真实性 + 双机规划 (2026-08-08)
  依赖: 无强依赖（D319 tag 可选增强；D321 notes 在此之后读）
  并行: D318/D319 写集零交集（D320: scripts/control-tower/gen-task-board.py + docs/synova/DASHBOARD*.md + docs/synova/coverage/；D318: install-hooks/setup；D319: synova-commit/pre-push/VERSION.md）；**版本编排由 D319 独占（批次统一 V4.7.0）**；version.log 为 gitignore 运行时产物无 git 冲突
-->

# D320: 仪表盘 git 化生成器 v1

> 一句话问题: DASHBOARD-CN/EN 靠 Codex 人工维护——不是 git 的投影，双机双写会冲突，且"任务状态"没有以 git 为唯一权威。本任务把仪表盘变成"git 状态 + 文件事实 + 薄手动层"的渲染产物。

## 1. 权威文档引用

**来源**: [generate-dashboard.py D220 契约](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\generate-dashboard.py)

> @input — .codex/signals/ + DASHBOARD.md + docs/plans/ + .claude/task-briefs/；@degraded — 信号缺失 -> 诚实标注。

**来源**: [D296 数据真实性](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\strategy\SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md)

> 数据源缺/过期 → 视图 degraded + 原因；统一 schema；不造假 0。

**来源**: 双机规划 (2026-08-08)：仪表盘 = git 投影 + 薄手动层；生成器幂等、只增不删手动区。

## 2. 代码审计——现状 (2026-08-08 实测)

### 2.1 缺陷 A (P0): 仪表盘人工维护，非 git 权威

[DASHBOARD-CN.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD-CN.md) / [DASHBOARD.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD.md) 由 Codex 手工编辑（含"事故恢复区"两次被并行 session 回滚的历史）。任务状态（已完成/待办/优先级）没有单一机器事实源；双机并行后两边同时维护必冲突。

### 2.2 现状：已有生成器骨架但只出 HTML 创始人视图

[generate-dashboard.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\generate-dashboard.py) 已有：
- `derive_rdc_pipeline()`（L60 起）：读 **git log -30** + dev docs + briefs，但只算 `committed` 布尔，且仅 30 条（全历史 D# 提取缺失）
- `read_component_signals/read_audit_summary/read_gate_status/read_env_status/read_latest_completion/freshness_check`（D296 新鲜度门禁）
- views/ 模块（pm_dashboard/completion/workflow_graph/agent_health/pipeline_health）——HTML 视图

→ 结论：数据采集骨架可复用，但**输出是 HTML 创始人驾驶舱，不是 DASHBOARD.md 任务看板**；且无 override 手动层、无幂等、无 CI 状态入表。

### 2.3 数据源事实（实测）

- `git log --grep="D[0-9]"`：271/1125 提交带 D#（可提取任务→提交映射）
- dev doc 头部 HTML 注释：`状态: dev doc | 日期 | 优先级`（可解析）
- task briefs：`.claude/task-briefs/`（D# 可匹配）
- VERSION.md：`## V4.x.y (date) — title`；version.log：JSON 追加流
- CI：`gh run list --branch feat/prompt-architecture` 可读（实测可用）；每 run 关联提交
- audit 基线：`audit-check.py --full` → 3 PASS/886 WARN/439 FAIL

## 3. 实现方案

### 3.1 写集 (2 修改 + 3 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/control-tower/gen-task-board.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\gen-task-board.py) | 新建 | 渲染 DASHBOARD-CN.md/DASHBOARD.md（Markdown 任务看板，非 HTML）；数据源=git log 全历史 D# + dev docs 头 + briefs + VERSION/version.log + gh CI + audit；幂等 + 手动区原样保留 + degraded 标注 |
| [docs/synova/coverage/board-override.yaml](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\coverage\board-override.yaml) | 新建 | 手动薄层：优先级/决策/待办/blocked（生成器只读；git 无法表达的事实唯一入口） |
| [tests/control-tower/gen-task-board.test.py](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\gen-task-board.test.py) | 新建 | 生成器测试（≥5 断言，见 §4） |
| [docs/synova/DASHBOARD-CN.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD-CN.md) | 修改 | 首次运行：插入 `<!-- MANUAL:START -->...<!-- MANUAL:END -->` 标记（事故恢复区/历史/待办迁入 override 的保留区），自动区由生成器渲染 |
| [docs/synova/DASHBOARD.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\DASHBOARD.md) | 修改 | 同 CN（EN 版同步） |

### 3.2 生成器数据契约

**输出结构**（DASHBOARD-CN.md / DASHBOARD.md 同构，`--lang en` 切换）：

```text
<!-- AUTO:START -->
## 任务状态（git 派生）          ← D# | 提交 | 作者 | 日期 | 推送 | CI | 审计
## 版本历史                      ← VERSION.md + version.log + git tag（D319 后增强）
## CI 状态（gh run）             ← 最近 N 次 run | 任务相关 job 绿/红 | 预存失败标注
## 同步健康（预留）              ← origin..HEAD + status --porcelain（D323 填充）
<!-- AUTO:END -->
<!-- MANUAL:START -->（原 DASHBOARD 手动区，原样保留）
<!-- MANUAL:END -->
```

**数据源规则**：
| 字段 | 来源 | 缺失时 |
|------|------|--------|
| D# → 提交 | `git log --grep="D[0-9]+" --format="%H\|%an\|%ae\|%ad\|%s"` 全历史 | 空表 |
| 任务状态 | dev doc 头（状态/优先级/日期）+ brief 存在 + 提交存在 + origin..HEAD | 逐项 degraded 标注 |
| 版本 | VERSION.md + version.log；D319 后 + `git tag` | 标"版本待 tag" |
| CI | `gh run list --branch feat/prompt-architecture --limit 10` | degraded:"gh 不可用" |
| 审计 | `.codex/audit/audit-result.json`（缺 → 无数据标注） | degraded |
| 手动 | board-override.yaml + `<!-- MANUAL -->` 区 | 保留原样 |

**幂等与只增不删**：
- 自动区内容无变化 → 不写文件（mtime 不变，防每次提交噪音）
- MANUAL 区原样保留（按 marker 提取 → 写回），**生成器绝不修改 marker 之间内容**
- 生成器输出 diff 检查在测试中断言

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 替换 generate-dashboard.py（HTML 驾驶舱） | 两者共存：HTML 是创始人驾驶舱，本任务是 Markdown 任务看板 |
| GitHub Actions 自动触发 | Phase 3（本任务只做生成器 + 手动触发），防噪音先验证 |
| git notes 读取 | D321 独立任务，生成器留接口（读 notes 的 hook 点） |
| 双机同步健康显示 | D323 独立任务（本任务预留段落） |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 新建 `tests/control-tower/gen-task-board.test.py`，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| 临时 repo 构造 2 个 D# 提交 → 输出含 D#/提交哈希/推送状态 | 无生成器 → 文件不存在失败 | 断言命中 |
| MANUAL 区原样保留（marker 间内容） | 同上 | diff 空 |
| 幂等：两次运行输出一致（diff 空） | 同上 | diff 空 |
| CI 缺失 → degraded 标注（不假 0） | 同上 | 含 degraded |
| 空 git 历史 → 空任务表 + 不异常 | 同上 | 空表 + exit 0 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L2 | Python 单元（新建） | ≥5 | 上述 5 用例（正常/降级/边界/幂等/保留） |
| L2 | 集成验证 | 1 | 真实仓库运行 `python gen-task-board.py` 输出与 git log 事实抽查一致 |

> 测试用临时 repo（`mktemp`）+ 注入 git log/gh 假数据；gh 不可用时走 degraded 分支（不依赖网络）。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| gen-task-board.py 可运行 | `python scripts/control-tower/gen-task-board.py` 生成两份 DASHBOARD 且幂等 |
| override 文档化 | board-override.yaml 注释说明用途；README（coverage/）说明"人工只改 override + MANUAL 区" |
| 维护职责切换 | DASHBOARD 顶部标注"由 gen-task-board.py 生成，手动区在 marker 内"；Codex 停止手写自动区 |

## 6. 完成标准

1. DS1: `tests/control-tower/gen-task-board.test.py` 全过（≥5 用例；修复前 red 已证）
2. DS2: 真实仓库运行后 DASHBOARD-CN.md 自动区与 `git log --grep="D[0-9]"` 事实一致（抽查 ≥5 个 D#：提交存在性/推送状态）
3. DS3: MANUAL 区零丢失——生成前后 marker 内内容 diff 为空
4. DS4: 幂等——连续两次运行输出文件内容一致（diff 空）
5. DS5: gh 不可用（注入失败）时输出 degraded 标注，不出现假 0/假绿
6. DS6: 版本由批次统一 **V4.7.0**（D319 编排，本任务不碰 VERSION.md）；运行时 `control_tower_log.py version --version 4.7.0 --changes "D320 仪表盘 git 化"` 追加 version.log（gitignore）
7. DS7: 全量审计 `python scripts/audit/audit-check.py --full` 与基线一致（439 FAIL）+ as any=0
8. DS8: 无 --no-verify、`git diff --name-only` 与写集一致

## 7. 自检清单

- [x] generate-dashboard.py 现状核实（derive_rdc_pipeline 仅 git log -30 + committed 布尔；输出 HTML）
- [x] 271/1125 提交带 D# 实测；dev doc 头注释格式确认；gh run list 可用实测
- [x] DASHBOARD-CN/EN 现有结构（恢复区/表格段）确认；manual marker 方案可落地
- [x] 测试优先：5 用例 red→green 设计（§4 表）
- [x] 不是凭记忆
- [x] 不用 --no-verify
