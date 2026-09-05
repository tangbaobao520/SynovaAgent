# finding.id 消费方 grep 复核 + 43 文件去时间戳清单（DS1 + DS7，铁律 9）

> 2026-09-06 | 分支 feat/d580-ticket-slice | 行号 = 编码后工作树现值（基线 7afbb23f 原值见 spec §4.2；
> runner.ts 行号漂移 = 本任务新增代码所致，漂移原因逐条标注）。

## 1. 修改前污染面实测（red 依据）

```
$ grep -rln 'getTime()\|Date.now()' extensions/sentinels/*/aggregate.ts | wc -l
43
$ ls extensions/sentinels/*/aggregate.ts | wc -l
44
```

唯一无时间戳命中: revenue-health（id 形态 `rev_conc_critical` 等稳定 id，先行先例）。
id 模板时间戳插值形态普查（修改前，按出现频次）:

| 形态 | 次数 | 说明 |
|---|---|---|
| ``-${now.getTime()}`` | 173 | 41 个文件，id 模板内 |
| ``-${Date.now()}`` | 4 | cash-runway L100（`cr-error-`）+ key-person-risk 3 处（`kpr-dc-crit-`/`kpr-dc-warn-`/`kpr-error-`） |
| ``-${start}``（start = Date.now()） | 5 | sentinel-forecast-accuracy 3 + sentinel-pricing-strategy 2 — **同一不稳定 id 类**（时间戳插值经局部变量间接），spec §5.1 两个代表形态的补充形态，同规则去后缀 |
| 非 id 行命中 | 4 | forecast-accuracy L19/L37、pricing-strategy L20/L36 — `const start = Date.now()`（计时）与 `durationMs: Date.now() - start`，**非 id 行，保留**（DS1 口径: 仅剩非 id 行命中） |

## 2. §4.2 七项消费方逐项复核（修改后现值）

| # | 消费方 | 位置（编码后现值） | 稳定键影响 | 处置实测 |
|---|---|---|---|---|
| 1 | 事件重放投影索引 | runner.ts **L984** `findingById.set(finding.id, finding)` | 同 id 后轮覆盖前轮（最新胜出）— 语义正确 | 无需改 ✓ |
| 2 | finding_transition 重放 | runner.ts **L996** `findingById.get(findingId)` | 稳定 id 后跨轮可命中（现状跨轮 miss → log.warn 跳过）| 改善，无需改 ✓ |
| 3 | migrateFindingStatus | runner.ts **L1026** `if (f.id !== findingId) continue` | 同上 | 无需改 ✓ |
| 4 | 工单 signal_id 关联 | runner.ts **L749**（expert: `ticket-${signalId}-${expertType}`）/ **L787**（auto: `ticket-${signal.id}-auto`）；signal id 源 = signal-aggregator.ts **L144** `sig_${entity}` | signal_id 从不含 finding.id → 零影响，无迁移（裁决 4） | 无需改 ✓ |
| 5 | 卡片级 action | routes/sentinel.ts L135+（POST /alerts/:id/action → interactive-card.ts，findingFinder 未注入） | 卡片级与工单级两交互面并存 | 无需改 ✓ |
| 6 | 内存伪工单 id | sentinel-service.ts **L323** `` `${sentinelId}_${f.id}` ``（deriveTicketsFromMemory 兜底 helper 内） | 8-2 后该派生从主读路径降为**降级路径唯一引用点**（表空/读失败 fallback） | 随 A 项降级保留 ✓ |
| 7 | 既有测试断言 | threshold-injection.test.ts **L134**、threshold-manifest-flip.test.ts **L50-51** | `startsWith('e4-churn-crit-')` 尾横杠断言在去后缀后必破 | 已去尾横杠修复 ✓（red-green-evidence.md §3） |

误报排除复核（spec §4.2 注）: tests/skill/d66-manifests、tests/ci/golden-case-checker、tests/phase4-ecosystem、
tests/l3/e2e-report-adapter 命中为 'phase4-'/'e2e' 子串误命中，非 finding.id 消费方（逐个 open 核实）。

## 3. 修改后逐文件 grep -c 归零表（DS1 物理证明）

```
$ for f in extensions/sentinels/*/aggregate.ts; do c=$(grep -c 'getTime()\|Date.now()' "$f"); echo "$c $f"; done | sort
```

**全量 44 文件 → 42 文件 0 命中，2 文件各 2 命中（非 id 计时行）**:

| 文件 | 残留命中 | 行内容（非 id 行） |
|---|---|---|
| sentinel-forecast-accuracy/aggregate.ts | 2 | L19 `const start = Date.now();`（计时起点）、L37 `durationMs: Date.now() - start`（耗时计算） |
| sentinel-pricing-strategy/aggregate.ts | 2 | L20 `const start = Date.now();`、L36 `durationMs: Date.now() - start` |

其余 42 文件（42×0 = 全零，grep -c 输出归档 /tmp/d580/perfile-grep.txt，抽样）:

```
0 agent-deployment-maturity   0 ai-ecosystem-fit        0 ai-investment-return     0 api-coverage
0 business-model-coherence    0 capital-health          0 cash-runway              0 channel-capacity
0 competitive-moat            0 competitive-position    0 customer-demand-shift    0 data-health
0 environment-rent-dependency 0 explore-exploit-balance 0 financing-constraint     0 growth-quality
0 human-agent-boundary        0 incentive-alignment     0 info-distortion          0 internal-transaction-cost
0 key-person-risk             0 knowledge-accessibility 0 make-or-buy              0 margin-health
0 moat-dependency             0 network-power           0 niche-breadth            0 niche-squeeze
0 opportunity-window          0 org-repairability       0 power-rigidity           0 process-ai-readiness
0 resource-misallocation      0 routine-diffusion       0 routine-mutation         0 revenue-health
0 software-health             0 strategy-capability-fit 0 talent-density           0 time-penetration
0 unit-economics              0 value-capture
```

**id 行触碰纪律物理证明**（"每文件其他行零触碰"）: `git diff -U0 extensions/sentinels/` 全部 364 行
`-/+` 行对（182 对）经逐对校验 — 删除行剥离时间戳后缀模式 `-\$\{(now\.getTime\(\)|Date\.now\(\)|start)\}` 后
与新增行**逐字符相等**，非 id 行改动 = 0（脚本输出留存 red-green-evidence.md 同级校验记录）。

## 4. _extinct 4 文件偏差说明（DS10 显式偏差，非静默）

spec §5.1 写集行 "extensions/sentinels/ — 43 个 aggregate 文件" 基于单层 glob
`extensions/sentinels/*/aggregate.ts` 的 grep 普查。编码期 finding-id-stability.test.ts（spec 自身规定的
import.meta.glob 全扫 + 双跑断言）物理暴露盲区: **2 个单层 aggregate 委托 _extinct 子哨兵并合并其 findings**:

```
$ grep -rln "_extinct" extensions/sentinels/*/aggregate.ts
extensions/sentinels/competitive-moat/aggregate.ts      → _extinct/competitive-moat-perceptual + _extinct/competitive-moat-structural
extensions/sentinels/competitive-position/aggregate.ts  → _extinct/competitive-dynamics + _extinct/market-lifecycle
```

这 4 个 _extinct 子文件是**生产可达路径**（check() 内 `await import('../_extinct/...')`，子检查失败仅 catch
降级不阻断），其 id 行时间戳（i4-crit-`$(...)`/i3-*/e3-*/e1-*）会持续进入生产 finding 流 → N14 残留。不修则
spec §7 red→green 表的 finding-id-stability「双跑同 id」物理不可 green（red 实证: /tmp 归档
red-finding-id2.log.txt 前置 43 文件修复后仍红，失败点 = competitive-moat 探针[empty]）。

处置: 4 文件仅 id 生成行去时间戳（13 行对，同 id-line-only 纪律校验通过）；其余 8 个 _extinct 文件
（adaptation-velocity、capital-efficiency、capital-structure、capital-turnover、connector-coverage、
cost-health、profit-health、structural-change）**零触碰**（无生产可达路径，全仓无 import，审计参考件）。
已登记 task-state/D580.json impl 段 deviation 域 + 完成报告。
