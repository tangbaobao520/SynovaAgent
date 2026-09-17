# 审计复核任务书 — 线 10 资本循环

> 生成: 2026-09-17 | 触发: D803 交付备料（**手工按 gen-k3-task.py 输出契约撰写**——自动触发条件「线 verified==total 且 k3_gate=pending」尚未满足：10-8 本身就是要复核的点，见下「为何 A7 空跑」）
> 红线说明: 本任务书只提供材料与问题清单；审什么、怎么算过，由审计员定夺。**Harness 不编写审计标准。**
> 数据源: docs/synova/project/ledger.json（D795 账本，读产品证据 + golden-scenarios 证据两处）+ docs/synova/product-lines/product-lines.yaml + docs/synova/project/26线-V1验收标准-草案v0.1-20260917.md §线10
> 交付分支: `feat/d803-capital-cycle-v1`（5 切片 + 证据，commit 见 §交付 commit 清单）

## 为何 A7 空跑（诚实说明，非隐瞒）

`bash scripts/product-lines/refresh-all.sh` 的 A7 环节（`gen-k3-task.py`）本次输出「无待复核线（正常空跑）」，原因有二，**二者都不是本卡可以自行修改的门禁**：

1. **A7 读的是 `product-progress.json`（calc-progress 视图），不是 `ledger.json`（D795 视图）**。本卡验收口径（派单 §三「目标：ledger.json 中线10 v1_passed == v1_total == 6」）锚在账本视图上。
2. calc-progress 的 A1 惰性失效规则（`calc-progress.py:106-129`）：证据只有 `date`（无 `at` 时间戳）时按 `date + T00:00:00` 比较——**同日对线 modules（`src/connectors/` `src/l4/` `extensions/sentinels/` `src/l3/`）的任何提交，都会把当日证据判为 stale**。本卡当天改了 `extensions/sentinels/`，故 calc-progress 视图里 10-1/10-3/10-6 当日为 `stale` 而非绿。D+1 重跑（DS11 口径）后证据日期晚于提交日期，自动转绿。

**当前真实账本状态（物理输出，2026-09-17 实测）**：

```
ledger.json → v1_total=125 v1_passed=25 verified=13 delivery=20.0% freshness={'green': 18, 'yellow': 1, 'red': 6}
线 10: v1_total 6  v1_passed 5  v1_verified 2
   10-1 scenario ok=True  age=0 fresh=green
   10-2 test     ok=True  age=0 fresh=green
   10-3 scenario ok=True  age=0 fresh=green
   10-4 test     ok=True  age=0 fresh=green
   10-6 scenario ok=True  age=0 fresh=green
   10-8 k3       ok=False age=None fresh=None      ← 待审计员执行
```

## 这条线到 100% 的定义（产品承诺）

> 老板能接财务数据，系统自动产出现金流/成本/利润的持续监测与告警，每条结论可回溯证据

## V1 六条断言逐点材料（全部 git 跟踪，可复核可重跑）

| ID | 判定式 | 类型 | 复跑命令 | 证据路径 | 实测 quote 摘要 |
|---|---|---|---|---|---|
| 10-1 | ERP 财务数据上传 → Financial 节点 | scenario | `bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh` | `scripts/golden-scenarios/evidence/GS-03-2026-09-17.json` | `erp-upload-ok pass` / `financial-node-created pass`（sqlite `graph_nodes` type='Financial' 且 `json_extract(props,'$.cash')=30000`，cell cnt≥1） |
| 10-2 | 属性契约对齐（cashBalance↔cash） | test | `node_modules/.bin/vitest run tests/contract/l4-contract.test.ts` | `docs/synova/product-lines/evidence/test-2026-09-17.json` | `vitest 套件全绿`；读侧消费契约 describe 4 断言（含 static closure + revenue-health 运行时 + 现金链挪用 runtime 断言） |
| 10-3 | 哨兵 manifest 挂载、阈值真实触发 | scenario | `bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh` | `scripts/golden-scenarios/evidence/GS-03-2026-09-17.json` | `cash-runway-critical-triggered pass` + `threshold-provenance pass`（响应含「低于critical阈值6个月」← 值 6 来自 `extensions/sentinels/cash-runway/manifest.json` thresholds） |
| 10-4 | 现金流跑道计算正确（filter bug 修复） | test | `node_modules/.bin/vitest run tests/sentinels/cash-runway/` | `docs/synova/product-lines/evidence/test-2026-09-17.json` | `vitest 套件全绿`（30 用例，含存在性守卫 12 红→绿 + pickPresentNumber 原语 4 用例） |
| 10-6 | 无数据不误报 critical（降级诚实） | scenario | `bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh` | `scripts/golden-scenarios/evidence/GS-03-2026-09-17.json` | `no-data-degraded-warning pass`（空库响应含「现金流数据不完整」）+ `no-data-no-critical pass`（notContains「现金流危急」）+ `no-false-critical-zero-runway pass` |
| 10-8 | 审计员全链路复核（100% 门槛） | k3 | **K3 执行** | K3 报告 → `parse-k3-report.py` → `redeem-progress.py` | 待产 |

**V1 外（backlog，本卡不做，复核时请勿计入）**：10-5 告警→工单→推送 / 10-7 报告含资本结论。

## ⚠️ K3 出 verdict 的硬要求（缺一即 100% 封顶 99）

`calc-progress.py:34` 契约 + `calc-progress.py` 线级门：

> 线 100% 门槛: verified==total 且无 k3 线级复核（record_type=k3, **acceptance_point="line:<id>"**, pass）
> → 进度封顶 99 + k3_gate="待审计员全量复核"

因此 K3 报告**必须同时产出两类记录**，缺任一类都拿不到 100%：

1. **点级 verdicts**：`10-1` `10-2` `10-3` `10-4` `10-6` `10-8`（各 pass/fail）。10-5/10-7 为 V1 外，请在报告中**显式标注「V1 外」**而不是留空——静默缺项会被判漏项。
2. **线级复核**：`acceptance_point="line:10"`, `verdict=pass`（无此条 → 进度封顶 99）。

复核方式由审计员定；本任务书只提供材料与问题清单。

## 复核问题清单（供审计员参考，不构成审计标准）

1. 抽查 ≥1 个「已验证」验收点：证据文件是否真实存在？独立重跑后是否仍成立？（GS-03 需 better-sqlite3 ABI 对齐，临时库经 `SYNOVA_DB_PATH` 隔离，禁碰 `data/synova.db`）
2. `financial-node-created` 是否只认 DB 物理行（而非 HTTP 响应自述）？真空结果与查询失败是否被区分（K3 P0-3 fail-open 教训）？
3. 负向断言是否真的会红？建议独立复现四条反向：注释 `src/sentinel/sentinel-loader.ts:211` 挂载行 / `erp-standard.json` 的 `cash`→`cashBalance` / 现金链加回 `total_revenue` / 删 GS-03 证据任一 verdict。
4. 线进度与各验收点状态加总是否一致？`ledger.json` 的 `v1_passed=5` 是否可复现（生成器：`scripts/project/gen-project-board.py`，D795）？
5. 证据是否在有效期内？相关代码变更后证据是否已失效待重跑？
6. 是否存在为凑 6/6 而放宽断言或改判分的痕迹？（红线：`scripts/product-lines/calc-progress.py` 零提交）

## 交付 commit 清单（写集自证）

```
fix(D803): 切片② 读侧属性契约守卫 + revenue-health 断裂修复（10-2）
fix(D803): 切片③ 跑道/逾期字段语义修复——存在性守卫+删除 total_revenue 挪用（10-4）
test(D803): 切片① manifest 挂载回归守卫——threshold-provenance 断言 + evidence_map 10-3
test(D803): 切片④ GS-03 负向相位 + 线10 证据落点（10-1/10-3/10-6）
test(D803): 切片⑤ 10-2 绑定 test:l4-contract + A2 机器证据落盘
```

`git diff --name-only origin/main...HEAD` 实现类 = spec §10.1 写集 10 文件，零偏差；`scripts/audit/**` 0、`scripts/product-lines/calc-progress.py` 0、`src/**` 0。

## 结论栏（审计员填写）

- 10-1: ____  10-2: ____  10-3: ____  10-4: ____  10-6: ____  10-8: ____
- 10-5: V1 外   10-7: V1 外
- 线级复核 `line:10`: ____
- 备注:
