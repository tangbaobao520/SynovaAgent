# D579 evidence — 测试 red→green 两轮输出（test-output.md）

> 任务: D579 | 2026-09-06 | 全部命令在 .synova-wt-d579 worktree（feat/d579-k3-verdict-stale）执行。
> K3 可独立重跑；命令原文随每节给出。

## 0. 基线（修改前，origin/main @ 7afbb23f）

```
命令: python3 tests/control-tower/product-lines.test.py
结果: Ran 28 tests — FAILED (failures=3)
  FAIL: test_range_expansion_and_mapping   AssertionError: 10 not found in [4]
  FAIL: test_real_repo_capital_line_zero_of_eight   AssertionError: 2 != 0   (L274)
  FAIL: test_real_page_and_no_jargon       AssertionError: 5 != 0 : 无任务编号术语
```
与 spec §4.3 声明的 3 条既有失败完全一致。本单不修（回归门显式排除）。

## 1. RED 轮 — 两个新测试文件对未修改代码（spec §7 要求的修复前红）

```
命令: python3 tests/control-tower/calc-k3-stale.test.py
结果: Ran 13 tests — FAILED (failures=8)
  FAIL: test_a1_k3_pass_ttl_expired_stale          # k3 pass TTL 过期仍 verified（免疫现场）
  FAIL: test_a2_k3_pass_modules_touched_stale      # modules 变更仍 verified（D556 场景）
  FAIL: test_a5a_k3_only_pass_ttl_expired_stale    # k3_only 出口免疫
  FAIL: test_a6a_invalid_date_pending_with_problem # 日期非法直接 verified 无痕
  FAIL: test_a6b_git_failure_pending_with_problem  # git 失败直接 verified 无痕
  FAIL: test_a6c_missing_mapping_pending_with_problem
  FAIL: test_a7_pairing_boundary_change            # 配对夹具双双 verified
  FAIL: test_a8b_superseded_pass_does_not_rescue   # 被接替记录"抢救"TTL 过期 pass
  （A3/A4/A5b/A5c/A8a 为回归面用例，修复前即绿——符合 spec §7 修复前列）

命令: python3 tests/control-tower/gen-cto-health-batch-report.test.py
结果: Ran 5 tests — FAILED (failures=1, errors=4)
  ERROR: test_b1 / test_b3 / test_b4 / test_b5     # resolve_audit_report 不存在（AttributeError）
  FAIL:  test_b2_dashboard_shows_conditional_pass  # D517/518/519 audit="—" status≠audited
```

## 2. A9 中间红 — 新实现 + 旧夹具（更新 enshrined 夹具前）

```
命令: python3 tests/control-tower/product-lines.test.py（calc/gen 已实现、夹具未更新）
  FAIL: test_six_states            AssertionError: 'stale' != 'verified'   # 1-1 k3 pass 2026-08-13 被 TTL 正确打 stale
  FAIL: test_hundred_percent_gate  AssertionError: 0 != 6                  # 固定日期 6 点 k3 pass 全部转 stale
  （既有 3 条失败保持: '10 not found in [4]' / capital '2 != 5'@L278 / '5 != 0'）
```
证明两处 enshrined 夹具确实锚定在旧免疫行为上，相对日期化是必要更新（D576 mini-yaml 教训:
测试不得依赖墙钟漂移的固定日期）。

## 3. GREEN 轮 — 实现后

```
命令: python3 tests/control-tower/calc-k3-stale.test.py
结果: Ran 13 tests — OK（A1/A2/A3/A4/A5a/A5b/A5c/A6a/A6b/A6c/A7/A8a/A8b 全绿）

命令: python3 tests/control-tower/gen-cto-health-batch-report.test.py
结果: Ran 5 tests — OK（B1-B5 全绿）

命令: python3 tests/control-tower/product-lines.test.py（夹具相对日期化后）
结果: Ran 28 tests — FAILED (failures=3) = 25/28 绿
  FAIL: test_range_expansion_and_mapping   AssertionError: 10 not found in [4]  （既有，不变）
  FAIL: test_real_repo_capital_line_zero_of_eight   AssertionError: 2 != 5      （既有失败，
        断言点 L274→L278 位移: 修复使 L274 首次通过——10-4/10-3 诚实转 stale；期望值 5 为
        真实数据漂移前旧基线，测试仍 FAIL 不修不藏）
  FAIL: test_real_page_and_no_jargon       AssertionError: 5 != 0               （既有，不变）
```

## 4. 回归矩阵（DS6）

| 套件 | 结果 | 判定 |
|---|---|---|
| product-lines.test.py | 25/28（3 既有失败精确保持，见 §3） | ✅ |
| redeem-task-redeem.test.sh | 5 通过 / 0 失败 | ✅ |
| alloc-task-id.test.sh | PASS=13 FAIL=0 | ✅ |
| gen-cto-health.test.sh | PASS=7 FAIL=0 | ✅ |
| gen-cto-health-repro.test.sh | 5 通过 / 2 失败 | ⚠ **HEAD 既有**（未修改 origin/main 主工作区同现同文失败；根因 = _head_tracked_files quotepath 八进制转义 → D445 中文 spec.path 假 phantom，详见 calc-diff.md §5.2；本单写集不修，另立任务） |
| gen-cto-health.py --strict | exit 1（phantom=1，即上述 D445 既有假 phantom；D579 变更零新增 phantom） | ⚠ 同上 |

## 5. B 项仪表盘实跑（DS7）

```
before（旧代码实跑 gen-cto-health.py，实查 CTO-HEALTH.md）:
  | D517 | impl_done | ✅ | ✅ | — |        ← 审计事实隐形（P1-3 现场）
  | D518 | impl_done | ✅ | ✅ | — |
  | D519 | impl_done | ✅ | ✅ | — |

after（新代码实跑）:
  | D517 | audited | ✅ | ✅ | CONDITIONAL_PASS | 
  | D518 | audited | ✅ | ✅ | CONDITIONAL_PASS |
  | D519 | audited | ✅ | ✅ | CONDITIONAL_PASS |
（生成后已 git checkout -- 还原 CTO-HEALTH.md——生成器产物不入本 PR，D576 先例）
```

## 6. 接线验证（spec §8，grep 实测）

```
$ grep -n "freshness_gate" scripts/product-lines/calc-progress.py
  L130  def freshness_gate(evidence_date, line_modules, git_cmd, today, pid, problems):
  L186  gate = freshness_gate(...)   ← k3_only 出口（原 L149 verified 直返处）
  L201  gate = freshness_gate(...)   ← 通用 k3 出口（原 L156 verified 直返处）
$ grep -n "resolve_audit_report" scripts/control-tower/gen-cto-health.py
  L193  def resolve_audit_report(num, audit_dict, audit_dir, is_committed):
  L321  rep_path, _rep_src = resolve_audit_report(...)  ← analyze_task_state 循环内唯一解析入口
$ grep -n "calc-progress" scripts/product-lines/refresh-all.sh
  L48  run "A4 进度计算"   scripts/product-lines/calc-progress.py
  L55  run "A4 进度重算" scripts/product-lines/calc-progress.py   （A6 解析后重算链）
$ grep -n "gen-cto-health" scripts/control-tower/pre-audit-summary.sh
  L48  "U3-artifact-repro|scripts/control-tower/gen-cto-health.py|--strict|生成器产物可复现"
$ ls .github/workflows/product-progress.yml   → 存在（push main + cron 消费 refresh-all）
```
