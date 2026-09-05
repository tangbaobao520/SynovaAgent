# D577 — T1-T10 red→green + 回归对账 evidence

> 任务: D577 | 日期: 2026-09-05 | 分支: feat/d577-sentinel-threshold-wiring
> 时间为 2026-09-05 本地时间。所有命令在 worktree 根目录执行。

## 1. red 阶段（实现前，测试先行）

### 1.1 threshold-injection.test.ts（T1-T9）— 11:19:41

```
$ npx vitest run tests/sentinel/threshold-injection.test.ts
 Test Files  1 failed (1)
      Tests  7 failed | 3 passed (10)
```

逐用例 red 原因（与 spec §7 预测一致）:

| 用例 | red 表现 |
|---|---|
| T1 注入生效 | AssertionError: expected true to be false（注入 critical=0.9 仍产 e4-churn-crit — 参数被硬编码忽略） |
| T2 蓝绿 | ✓（spec: "同 T1 red"，T2 本身实现前即绿） |
| T3 fallback | ✓（同上） |
| T4 wrapper 注入 | AssertionError: expected undefined to be truthy（ctx.thresholds 未注入） |
| T7 degraded 传播 | AssertionError: expected undefined to be true（degraded 丢失，缺陷 C） |
| T5/T6/T9 resolveThresholds | TypeError: resolveThresholds is not a function（函数不存在） |
| T8 卫生扫描 | AssertionError: expected [ …(44) ] to deeply equal []（39 判定点 + 守卫行命中） |
| ALLOWLIST 自检 | ✓ |

### 1.2 threshold-manifest-flip.test.ts（DS8）— 11:37:03

```
$ D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts
 Test Files  1 failed (1)      Tests  1 failed (1)
AssertionError: expected true to be false（改盘 0.9 后 critical 不消失 → 死配置语义）
```

## 2. green 阶段（实现后）

### 2.1 threshold-injection.test.ts — 11:49:21

```
$ npx vitest run tests/sentinel/threshold-injection.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)      Duration  715ms
```

T1 注入生效 ✓ / T2 蓝绿（注入 manifest 现值 findings 与无注入逐一相同）✓ / T3 fallback ✓ /
T4 registry 全链路（ctx.thresholds = manifest 基线 + 判定用 manifest 值）✓ / T5 覆写合并 ✓ /
T6 降级三态（JSON.parse 失败 / NaN / 哨兵不存在）✓ / T7 degraded === true ✓ /
T8 卫生零违规（ALLOWLIST 17 条全命中）✓ / T9 双键兼容 ✓

### 2.2 flip（DS8）×3 — 11:53:05 / 12:05:19 / 12:05:20 — 全部 1 passed（幂等，见 DS8 文件）

## 3. 回归对账（T10 + DS10）

### 3.1 全量 tests/sentinel/ + tests/sentinels/（实现后，11:53:58）

```
$ npx vitest run tests/sentinel/ tests/sentinels/
 Test Files  39 failed | 177 passed | 1 skipped (217)
      Tests  794 passed | 1 skipped (795)
```

### 3.2 基线对账（pristine origin/main worktree，11:56:09）

```
$ git worktree add .synova-wt-d577-base origin/main && npx vitest run tests/sentinel/ tests/sentinels/
 Test Files  39 failed | 176 passed (215)
      Tests  784 passed (784)
```

**FAIL 集合 diff = 空**（两次运行的 `FAIL` 文件清单逐行相同）→ 39 个失败文件全部为
pre-existing（`tests/sentinels/*` 引用 `_extinct/` 旧路径 Cannot find module，D358 遗留），
与本任务写集零关联。D577 净增: +2 测试文件、+10 通过测试（794-784）、+1 skipped（flip 无环境变量时跳过）。

### 3.3 D356 既有三文件（T10 指定回归，含在 3.1 运行内全绿）

- tests/sentinel/sentinel-threshold-wiring.test.ts ✓
- tests/sentinel/l3-write-api.test.ts ✓
- tests/sentinel/sentinel-loader.test.ts ✓

## 4. tsc（DS10）

```
$ npx tsc --noEmit        # 实现后
error TS 总数 = 28        # 派单验收 #6: "tsc 28=28 基线"（基线即 28）
```

28 个错误分布文件: extensions/sentinels/_extinct/*（10 文件）、src/connectors/ima.ts、src/server.ts
——**写集 21 文件 + 2 新建测试文件零命中**（错误清单与文件列表见 wiring-and-hygiene-grep-evidence.md §5）。
