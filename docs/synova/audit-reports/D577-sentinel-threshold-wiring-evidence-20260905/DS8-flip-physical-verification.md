# D577 哨兵阈值配置真实挂载 — DS8 物理验证 evidence（flip 测试）

> 任务: D577 | 日期: 2026-09-05 | 分支: feat/d577-sentinel-threshold-wiring（基线 origin/main 436e216d + spec docs 提交 6c854ecc）
> 运行环境: macOS（本地），vitest 4.1.8。flip 测试独占运行（`D577_FLIP_TEST=1`），无并行 vitest。
> 本文件记录: 改盘 manifest → findings 变化 → 恢复 的物理可复现证据（7-2/8-1/10-3 的 8-1 核心证据）。

## 测试文件

`tests/sentinel/threshold-manifest-flip.test.ts`（D577 新建）:

- 步骤 1 基线: 盘上现值 churn_rate.critical=0.2 → 经 `registerLoadedSentinels()` + registry check（fixture churnRate=0.25）→ `e4-churn-crit` 存在。
- 步骤 2 flip: 改盘 0.2→0.9（保持原文件换行风格）→ `clearSentinelCache()` + 重注册 → `e4-churn-crit` 消失、`e4-churn-warn` 保留。
- 步骤 3 恢复: 回写原始字节 → `clearSentinelCache()` + 重注册 → `e4-churn-crit` 回归（恢复后断言；else-if 互斥链下 warn 档不触发，与 T2 基线一致）。
- 安全: afterEach 无条件回写原始字节 + `clearSentinelCache()` + `destroySentinelRegistry()`（try/finally 等价）。
- red 基线 = 实现前改盘后 critical 不消失（配置死代码语义）。

## RED（实现前，2026-09-05 11:37:03 本地）

命令与输出:

```
$ D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts
 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  11:37:03
AssertionError: expected true to be false // Object.is equality
  （flip 后 e4-churn-crit 仍存在 → aggregate 硬编码 0.2 忽略 manifest → 死配置语义证明）
```

## GREEN（实现后，共 3 次运行，幂等）

```
$ D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts
```

| 运行 | Start at（本地） | 结果 |
|---|---|---|
| #1 | 11:53:05 | Test Files 1 passed (1) / Tests 1 passed (1) / Duration 638ms |
| #2 | 12:05:19 | Test Files 1 passed (1) / Tests 1 passed (1) / Duration 631ms |
| #3 | 12:05:20 | Test Files 1 passed (1) / Tests 1 passed (1) / Duration 566ms |

三次连续运行结果一致（幂等可复现）；每次运行后 manifest.json 均自动恢复原始字节。

## 盘面恢复证明（K3 可独立复核）

```
$ git status --short -- extensions/sentinels/customer-demand-shift/manifest.json
（空 = 无改动；CRLF 原始字节回写）
$ python3 -c "import json; print(json.load(open('extensions/sentinels/customer-demand-shift/manifest.json'))['thresholds']['churn_rate'])"
{'warning': 0.1, 'critical': 0.2}
```

## 复跑指引（审计员）

```
D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts   # 独占运行，禁止混入全量并行
git status --short -- extensions/sentinels/customer-demand-shift/manifest.json   # 期望空
```
