<!-- SYNOVA-IMPL-D267 v1.0 | 2026-07-29 | 权威17 Phase 1 -->
# SynovaAgent -- D267 self-diagnosis.py CLI v1.0
> 权威17 §二: 研发模式六条件判定 CLI, 产出 completion-scores.json

## 代码验证
- scripts/audit/self-diagnosis.py 不存在 ❌
- gate-status.json ✅, dependency-graph.json ✅, git log ✅, task briefs ✅, tests/ ✅

## Q0-Q4
Q0: 研发模式需要自动判定每个任务的六条件完成度(代码/接线/测试/路径/依赖/缺陷)。
Q2: 做——新建 self-diagnosis.py, 6 条件(§2.3), JSON 输出到 snapshots/{ts}/completion-scores.json。
Q3: python self-diagnosis.py → 读 gate-status + task briefs + git log → 6 条件打分 → 写 snapshots/

## 改动 (self-diagnosis.py 新建, ~200行)

### scripts/audit/self-diagnosis.py
6 条件判定(按权威17 §2.3):
```python
conditions = {
  "code_exists": check_file_exists(task) and check_not_shell(task),  # rg 函数签名 + 4种空壳检测
  "wiring_complete": check_depgraph_inbound(task),                   # 依赖图入边 > 0(排除.test)
  "test_exists": check_expect_count(task) >= 3,                      # rg "expect(" 计数
  "path_reachable": bfs_from_entry(task),                            # 入口节点反向 BFS
  "dependencies_available": check_imports_exist(task),               # Test-Path import 路径
  "no_known_defects": check_deviation_report(task),                  # deviation-report.json 无P0/P1
}
```
输入: gate-status.json, dependency-graph.json, git log 30天, .codex/task-briefs/, tests/
输出: .codex/snapshots/{ISO timestamp}/completion-scores.json

## 测试 (L1×3)
| # | 测试 |
|---|------|
| 1 | python self-diagnosis.py → exit 0 + JSON 输出 |
| 2 | completion-scores.json 含 systemScore + baselineScore + trend |
| 3 | 单个 D# 任务 6 条件完整判定 |

## 完成标准
self-diagnosis.py 可独立运行, 产出 completion-scores.json。
