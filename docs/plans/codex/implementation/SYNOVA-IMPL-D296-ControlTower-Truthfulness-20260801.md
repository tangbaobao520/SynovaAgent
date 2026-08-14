<!--
  SYNOVA-IMPL-D296: 控制塔数据真实性与完成度引擎修复
  状态: dev doc | 2026-08-01 | 优先级 P0 (盛和塾 8 月演示前必须恢复)
  权威文档: 权威文档17-自诊断系统 v3.1 §三 + 控制塔 Ch5 + D260/D261/D267 dev docs
  来源: 研究 session 转交 (SYNOVA-IMPL-控制塔数据真实性与完成度引擎修复-20260801) — Codex 逐项复核确认
  依赖: 无
  并行: D291 (src/ 无关), D286/D292 (packages/src 无关) — 零共享文件
-->

# D296: 控制塔数据真实性与完成度引擎修复

## 1. 权威文档引用

**来源**: [权威文档17-预期状态模型-v3-1-20260729.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-预期状态模型-v3-1-20260729.md) §三.2

> 原文 L144: "C 结论有用 | 未知 | 从未用真实数据验证过——只能等第一个客户上线"
> 归纳（本任务依据）: 控制塔是"项目的自诊断系统"——完成度数字必须反映真实代码状态，数字失真比没有控制塔更危险（会产生错误决策）。

**来源**: [AGENTS.md 铁律24+31](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律24: "有 log.error/warn（不能空吞）" / "返回 degraded: true（后端）或显示错误 UI（前端）"
> 铁律31: "每个可独立失败的模块必须返回 degraded 标记，调用方检查，前端展示。"
> 本任务延伸要求: 数据缺失场景禁止产出正常格式的假完成度数据（如 completion-engine 空运行输出 0 分）——必须带 degraded:true + 原因。

**来源**: [D267 dev doc](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D267-SelfDiagnosis-CLI-v1-0-20260729.md) — self-diagnosis.py 六条件判定
**来源**: [D261 dev doc](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D261-V3-P1-PM-Dashboard-v1-0-20260729.md) — completion-engine.py 完成度引擎

> 一句话问题: 控制塔显示的不是真实信息——13 个信号文件工作区被删（HEAD 可恢复），完成度引擎把 63 个任务全判 0.167 分，消费者视图读到 0%。

## 2. 代码审计——现状 (2026-08-01 实测)

### 2.1 故障A: 信号文件工作区缺失 (13 个)

**实测证据**:

```
git ls-tree HEAD .codex/signals/ --name-only   → 13 个文件全部存在 (可恢复)
工作区 .codex/signals/                          → 仅剩 2 个: .json (152B, component="") + sentinel.json (247B)
git status --short                              → 13 个 " D .codex/signals/*.json" (未提交删除)
```

| 生成方 | 位置 | 说明 |
|--------|------|------|
| check-gates-v2.py | [L36](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\check-gates-v2.py:36) `DEFAULT_OUTPUT = .codex/signals/gate-status.json` | 每次运行生成 gate-status.json |
| emit-signal.py | [main](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\emit-signal.py) | D214 共享信号 CLI, 写 {component}.json |

**根因**: 信号文件是运行时生成物却入库跟踪 + 工作区被删 → "git 有、磁盘无"中间态。恢复 ≠ git checkout，正确做法是重新生成 + 制定生成物入库策略。

### 2.2 故障B: 完成度引擎批量误判 (63 任务全 0.167)

**实测**: `.codex/snapshots/20260730T085724Z/completion-scores.json` — systemScore=0.167, code_exists pass 0/63 (0%), 63/63 条 reason 全为 "未找到 D# 对应源文件", srcFile 全空 (63/63)。**63 条结果仅 52 个唯一任务** — 详见 B3/B5。

**代码根因** ([self-diagnosis.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\self-diagnosis.py)):

| # | 缺陷 | 位置 | 影响 |
|---|------|------|------|
| B1 | find_source_file 只按文件名含 d_id 匹配 | [L89](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\self-diagnosis.py:89) | 真实源文件按功能命名 (department-memory-store.ts 不含 "d284") → 几乎全失败 |
| B2 | list_task_briefs 不解析"文件审计"字段 | [L65](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\self-diagnosis.py:65) | task brief 已声明 D#→源文件映射 (如 2026-07-31-auto.md), 引擎不用 |
| B3 | d_id 正则 `D\d+` 取文件名所有匹配的**最后一个**, 且不支持后缀字母 | [L65](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\self-diagnosis.py:65) | D8a-D8f → 全归并为 D8 (**快照中 D8 出现 6 次**); "D1D3D5" 型文件名取末位 D5 → 错配 |
| B4 | wiring 检查用 `grep -rn` 子进程 | evaluate_task() | Windows 无 grep → 降级 (D290 已修 audit-check.py 同类问题, self-diagnosis 未同步) |
| B5 | 同名 D# 多个 brief 文件未去重 | [L65](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\self-diagnosis.py:65) | D53/D5/D49/D57/D69/D51 各重复 2 次 (旧+新 brief 并存); 63 条结果仅 52 个唯一任务 |

### 2.3 故障C: 两套完成度引擎并存、schema 冲突

| 引擎 | 出处 | schema 关键字段 |
|------|------|----------------|
| self-diagnosis.py | D267 | systemScore / completionByCriteria{code_exists,...} / results[].d_id / srcFile |
| completion-engine.py | D261 | overallScore / completionByCriteria{A,B,C,D} / dimensionScores / activeGates |

**冲突链**:

1. 两引擎都写 `snapshots/{ts}/completion-scores.json` → 互相覆盖
2. 消费者 [views/completion.py L30](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\views\completion.py:30) 只读 `overallScore` → self-diagnosis 输出后视图取默认值 0 → **仪表盘显示假 0%**
3. [completion-engine.py L377](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\completion-engine.py:377): 缺 gate-status.json 时打印 "空运行" 但**仍输出正常格式 0 分数据** (无 degraded)
4. 附加: [views/completion.py L42-45](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\views\completion.py:42): 快照目录名 `20260729T144548Z` 用 `%Y-%m-%dT%H:%M:%S` 解析 → ValueError → epoch=0 → 时间轴排序失效

### 2.4 附带缺口 (实测修正研究文档)

| 缺口 | 研究文档说法 | 实测修正 |
|------|------------|---------|
| dependency-graph.json | "未持久化 (D267 仅内存构建)" | 磁盘有 47KB 陈旧文件 (07-30 16:57), 当前**无任何脚本写入** (grep 仅 views/workflow_graph.py 读取) → 视图4 数据陈旧 |
| checkpoints | "目录为空 (D260 未触发)" | 非空: cp3-commit-check.json (07-31 19:21Z pass, pre-commit 写入); **cp1/cp2 (D260 视图数据) 未生成** |

## 3. 实现方案

### 3.1 写集总览

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/audit/self-diagnosis.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\self-diagnosis.py) | 修改 | B1-B5 修复 + 输出统一 schema |
| [scripts/audit/completion-engine.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\audit\completion-engine.py) | 修改 | 输出统一 schema + 缺数据 degraded |
| scripts/audit/completion_schema.py | 新建 | 统一契约 (铁律47): SCHEMA 常量 + `validate_completion_schema()` 无依赖校验器 |
| [scripts/control-tower/views/completion.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\views\completion.py) | 修改 | 适配统一 schema + 时间解析修复 |
| [scripts/control-tower/generate-dashboard.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\generate-dashboard.py) | 修改 | 数据新鲜度门禁 (L3-1) |
| .gitignore / .gitattributes | 修改 | 信号+快照生成物策略 (L3-2) |
| tests/control-tower/test_control_tower_truthfulness.py | 新建 | 7 个测试 (见 §4) |

**不碰**: src/ 业务代码、views/ 模块化结构、generate-dashboard.py 路由、check-gates-v2.py (已正确)。

### 3.2 L1 立即恢复 (演示前, 半天)

| # | 动作 | 执行 | 验收 |
|---|------|------|------|
| 1.1 | 重新生成 gate-status.json | `python scripts/audit/check-gates-v2.py` | 文件存在, 时间戳=当前, 17 门禁真实判定 |
| 1.2 | 重新生成完成度快照 | `python scripts/audit/self-diagnosis.py` (L2 修复后) | 无批量 "未找到源文件" |
| 1.3 | 重建组件信号 | 重跑 control-tower 组件脚本 (D214 emit-signal) | signals/ 各组件信号完整且时间戳新鲜 |
| 1.4 | 验证 5 视图 | 打开 /cockpit | V1-V5 无空数据、无假百分比 |

### 3.3 L2 引擎修复 (1 天)

**2.1 find_source_file 双通道**

```
通道1 (优先): 解析 task brief "文件审计"字段 → D#→源文件映射
通道2 (降级): 现有文件名匹配 + degraded_reason="brief 无映射, 文件名匹配"
```

**2.2 统一 schema (completion_schema.py v1)** — 契约优先 (铁律47):

新建 `scripts/audit/completion_schema.py`: `SCHEMA` 常量 (JSON Schema draft-07 结构: required 字段 + 类型约束) + `validate_completion_schema(doc) -> list[str]` 无依赖校验器 (jsonschema 未安装, 不引入外部依赖)。输出文档形态:

```json
{
  "schemaVersion": 1,
  "generator": "self-diagnosis.py",
  "systemScore": 0.0,
  "totalTasks": 0,
  "completionByCriteria": {
    "code_exists": {"pass": 0, "total": 0, "pct": 0.0},
    "wiring_complete": {"pass": 0, "total": 0, "pct": 0.0},
    "test_exists": {"pass": 0, "total": 0, "pct": 0.0},
    "path_reachable": {"pass": 0, "total": 0, "pct": 0.0},
    "dependencies_ok": {"pass": 0, "total": 0, "pct": 0.0},
    "no_defects": {"pass": 0, "total": 0, "pct": 0.0}
  },
  "degraded": false,
  "degradedReason": "",
  "generatedAt": "2026-08-01T00:00:00Z",
  "results": []
}
```

required 字段: schemaVersion / generator / systemScore / totalTasks / completionByCriteria / degraded / degradedReason / generatedAt / results。唯一生成方: self-diagnosis.py 为任务级完成度唯一生成方; completion-engine.py 保留单文件判定 (`--target`), 输出同一 schema。视图只消费统一 schema。

**2.3 completion-engine 缺数据降级**: 缺 gate-status.json → `{"schemaVersion":1, "degraded":true, "degradedReason":"gate-status.json missing", ...}` + exit 0, 禁止正常格式假数据。

**2.4 附加修复**: B3 正则改 `D\d+[a-z]?` 且取首个语义完整匹配; B5 按 D# 去重 (同名 D# 多 brief 只保留最新文件); B4 改 Python 原生扫描 (复用 audit-check.py grep_in_files 模式); views 时间解析改 `%Y%m%dT%H%M%SZ` (L42-45)。

### 3.4 L3 防再犯 (1-2 天)

| # | 机制 | 实现 | 验收 |
|---|------|------|------|
| 3.1 | 数据新鲜度门禁 | generate-dashboard.py 渲染前校验: 数据源存在 + mtime<24h, 否则视图显示 degraded + 原因 | 模拟删 gate-status.json → V2/V3 显示 degraded 而非旧数字 |
| 3.2 | 生成物策略 (方案A) | 信号+快照不入 git (.gitignore), 提供统一重生成命令; 提交记录 13 个信号删除 | 仓库无 "git 跟踪但工作区被删" 信号文件 |
| 3.3 | 测量自检红灯 | self-diagnosis 输出全 0 / 全 0.167 或 signals 全空 → 控制塔红灯 + 原因 | 空数据场景亮红灯 (模拟测试) |
| 3.4 | dependency-graph 持久化 | self-diagnosis build_depgraph() 结果写 .codex/dependency-graph.json | 视图4 有新数据 (非 07-30 陈旧) |
| 3.5 | checkpoints cp1/cp2 | generate-dashboard 或 self-diagnosis 触发 D260 checkpoint 写入 | checkpoints 目录含 cp1/cp2 新鲜文件 |

## 4. 测试要求

测试文件: `tests/control-tower/test_control_tower_truthfulness.py` (pytest, 每个测试有 assert)

| # | 测试 | 类型 | 覆盖 |
|---|------|:---:|------|
| T1 | test_brief_mapping_finds_source | 正常 | 解析 brief "文件审计" → 找到 department-memory-store.ts |
| T2 | test_filename_fallback_degraded | 降级 | 无 brief → 文件名匹配 + degraded 标记 |
| T3 | test_d8a_not_collapsed | 边界 | D8a-D8f 各自独立 d_id; 同名 D# 多 brief 去重 (D53/D57 不再 ×2) |
| T4 | test_unified_schema_contract | 契约 | 两引擎输出均通过 validate_completion_schema() 校验 |
| T5 | test_missing_gate_status_degraded | 降级 | 缺 gate-status → completion-engine 输出 degraded:true |
| T6 | test_freshness_gate_degraded | 边界 | 数据缺失/过期 (>24h) → 视图 degraded + 原因 |
| T7 | test_empty_signals_red | 边界 | signals 全空 → 控制塔红灯 + 原因 |

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|----------------|--------|---------|
| parse_brief_file_mapping() | self-diagnosis.py find_source_file | grep parse_brief_file_mapping |
| validate_completion_schema() | 两引擎 main() 输出前 | grep validate_completion_schema |
| freshness_check() | generate-dashboard.py 渲染前 | grep freshness_check |

## 6. 完成标准

1. DS1: gate-status.json 重新生成, 时间戳新鲜, 17 门禁真实判定
2. DS2: self-diagnosis 重跑 code_exists 通过率 ≥90% (当前快照 63 条/52 唯一任务, 修复后以去重任务数为基数), 无 D8 归并、无同名 D# 重复
3. DS3: 唯一 schema + schemaVersion + validate_completion_schema() 接入; grep 确认 completion-scores.json 只有统一生成器写
4. DS4: 新鲜度门禁生效 (T6 通过: 缺数据 → degraded)
5. DS5: 信号生成物策略落地, 无 "git 有、磁盘无" 中间态
6. DS6: 测量自检红灯 (T7 通过)
7. DS7: dependency-graph.json 新时间戳 + checkpoints cp1/cp2 写入
8. DS8: tsc 零错误 | vitest 全量零失败 | 新函数有生产调用方 | as any=0

## 7. 自检清单

- [x] git ls-tree HEAD .codex/signals/ → 13 文件存在; 工作区仅 2 个 (含 152B 空壳 .json)
- [x] 读取 snapshot 20260730T085724Z → systemScore=0.167, code_exists 0/63, 63/63 "未找到源文件", srcFile 全空; 63 条仅 52 个唯一任务 (D8×6, D53/D5/D49/D57/D69/D51×2)
- [x] 读 self-diagnosis.py L65/L89/L137 (list_task_briefs/find_source_file/build_depgraph)
- [x] 读 completion-engine.py L305/L360/L377 (run_all/main/空运行分支)
- [x] 读 views/completion.py L30/L42-45/L69 (只读 overallScore + 时间解析缺陷)
- [x] 读 generate-dashboard.py read_component_signals + L317 组件清单
- [x] 读 emit-signal.py + check-gates-v2.py L36 (DEFAULT_OUTPUT)
- [x] 实测 dependency-graph.json 47KB 陈旧 (07-30), 无写入方; checkpoints cp3 存在, cp1/cp2 缺
- [x] 修正研究文档 2 处: checkpoints 非空、dependency-graph 有陈旧文件
- [x] 不是凭记忆
- [x] 不用 --no-verify
