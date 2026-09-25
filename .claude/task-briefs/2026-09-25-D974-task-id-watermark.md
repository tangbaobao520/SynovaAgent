# Task Brief: D974 号段水位（先实测后发号 + 实测反查生成 + 对账探针）

> 生成: 2026-09-25 | 分支: docs/d974-task-id-watermark | 基于 origin/main 25e081ce
> 卡片: task-state/D974.json | 执行: coder-b（并行 CTO 小队）
> #CRITERIA: A

## Q0: 定位

### a) 项目拼图
控制塔治理面（非产品码）。三处缺口的交汇点：
- 号段水位此前**无 main 内单一事实源**（同名文件仅存在于 7 条未合并分支，无法被任何门禁读取）；
- 取号器 `scripts/control-tower/alloc-task-id.sh` 的占用表读取面 = 本地 `task-state/` ∪ `origin/main`（其自身注释 :32-37 自陈 ls-remote 不喂号表），而 `origin/main` 的 task-state 只到 D964；
- 无任何机制把「水位落后于现实」变成物理信号 ⇒ 撞号靠人眼。

本卡产出：① 一份**实测反查生成**的水位文件；② 一个三态 fail-closed 的对账探针；③ 取号器缺陷的实测登记（不改其实现）。

### b) 文件审计（实测，非转述）
```
docs/synova/coordination/号段水位.md                    — ❌ main 不存在 ⇒ 本卡新建
scripts/control-tower/probes/                           — ❌ 目录不存在 ⇒ 本卡新建目录 + 首探针
scripts/control-tower/daily-cto-board.sh                — ✅ 存在（D1008 单写者，本卡禁改）
scripts/control-tower/alloc-task-id.sh                  — ✅ 存在 456 行（本卡只登记缺陷，禁改）
tests/control-tower/task-id-watermark-probe.test.sh     — ❌ 新建（U7/CT-40 配对）
```
同名水位文件实测已存在于 7 条已推分支（`chore/d964-p4-docs-b2-2`、`chore/d964-p4-docs-batch2-1`、
`chore/d965-d968-declarations`、`chore/d965-d968-declarations-v2`、`docs/D965-D968-coordination-cards`、
`docs/d943-cto-a-items`、`tmp-d942`），4 条分支 blob 同为 `4b4829950670` ⇒ **合并期 add/add 冲突成立**。
处置：本文件采用「生成段 + MANUAL 标记段（HTML 注释形式，起止标记 MANUAL:BEGIN 与 MANUAL:END 各一行）」结构，使冲突可机械消解（队长已批准）。

### c) 决策
- 不新建第二个号表（复用既有文件名，避免双源漂移）；
- 判定面 = 面 A（全 refs）∪ 面 C（当前工作树）——只扫 refs 会漏「正在途中的占号」（本批即此场景）；
- 探针**不依赖** daily-cto-board.sh，可独立复跑（三条对账机制要求）。
- 参考：第一性原理（水位必须能从物理事实反查，不能是手写常数）+ 控制塔三态模式（ctrl-tower-change 模式 1）
  + D382/D1004 撞号两次实证 + 结论：**判定面取保守超集，生成段由实测产出，人写内容只进 MANUAL 段**。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 实测取号 → ② 写探针（三态）→ ③ 写配对测试（正常/降级/边界）→ ④ 由实测 `--emit` 生成水位文件 → ⑤ 改坏即红验证
引用：铁律 47（契约优先，探针头块已写 @input/@output/@exit/@degraded）、铁律 48（测试非空壳，21 项断言）、
铁律 24/31（降级显式不静默）、铁律 0-2（接线：探针落 `probes/*-probe.sh` 发现面，由 D1008 通用 runner 调用）。

### b) 执行约束
- rule: "水位文件声明值必须等于实测上确界"
  verify: bash scripts/control-tower/probes/task-id-watermark-probe.sh
- rule: "探针三态：0 一致 / 1 DRIFT / 2 fail-closed"
  verify: bash tests/control-tower/task-id-watermark-probe.test.sh
- rule: "测试非空壳（有断言且覆盖三路径）"
  verify: grep -c "assert_" tests/control-tower/task-id-watermark-probe.test.sh

## Q2: 范围

**做什么：**
- docs/synova/coordination/号段水位.md（新建；由 `--emit` 实测生成）
- scripts/control-tower/probes/task-id-watermark-probe.sh（新建；三态对账探针）
- tests/control-tower/task-id-watermark-probe.test.sh（新建；U7/CT-40 配对测试）
- memory/notes/proposed/2026-09-25-d974-task-id-watermark-probe.md（新建；决策 Note）
- task-state/D974.json（新建；本卡登记）
- docs/synova/product-lines/evidence/D974-watermark-20260925.md（新建；M6 交付回执 —— 必须列入写集，否则 D708 判夹带）

**不做什么：**
- 不改 scripts/control-tower/alloc-task-id.sh （取号器缺陷只登记不修，属另卡）
- 不改 scripts/control-tower/daily-cto-board.sh （D1008 单写者，已排他）
- 不改 .github/workflows/ci.yml （D1010 写集）
- 不改 docs/authority/DOCS-REGISTRY.yaml （D1012 写集）
- 不改 tests/control-tower/check-ownership.test.sh （D1011 写集）
- 不改 scripts/audit/** （K3 域，红线）
- 不擅自改本批号映射（分段约定冲突已升级队长/CTO 裁决）

## Q3: 验收

入口: `bash scripts/control-tower/probes/task-id-watermark-probe.sh`
交互: 扫面 A/B/C 各 tip 的 `task-state/` → 与水位文件声明行比对 → 打印各面数字与余量
结果: exit 0 一致 / exit 1 DRIFT（含点名）/ exit 2 fail-closed；D1008 通用 runner 自动发现并显式报警

## 架构层: 基础设施

## Done 标准
- [x] verify: bash scripts/control-tower/probes/task-id-watermark-probe.sh （真实仓库 exit 0，水位=实测）
- [x] verify: bash tests/control-tower/task-id-watermark-probe.test.sh （27 项断言全绿 exit 0；含 ⑫ 本水位号段 / ⑬ 作废号段 两组判别性对照）
- [x] verify: SYNO_TEST_ARM=1 SYNO_CT_STAGED="scripts/control-tower/probes/task-id-watermark-probe.sh" bash scripts/control-tower/ct-test-gate.sh （SYNC-OK exit 0）
- [x] verify: grep -cE '^声明水位: D[0-9]+$' docs/synova/coordination/号段水位.md （机器判定位存在）
- [x] verify: bash scripts/workflow/check-brief-parseable.sh .claude/task-briefs/2026-09-25-D974-task-id-watermark.md （brief 可解析）
- 改坏即红（证据见交付回执，非 Done 判据）：打掉 DRIFT 判据①（判别性夹具）后测试必红（3 项失败）；恢复后 21/21 绿，注入标记在被改文件内计数为 0
