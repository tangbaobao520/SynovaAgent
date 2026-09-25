# Task Brief: D973 文档登记清零 + 登记对账探针

> 生成: 2026-09-25 | 分支: docs/d973-docs-registry | base: origin/main `057d8ca0`
> 卡片: task-state/D973.json | 执行: coder-b（并行 CTO 小队）
> #CRITERIA: A

## Q0: 定位

### a) 项目拼图
控制塔治理面（文档台账，非产品码）。台账 `docs/authority/DOCS-REGISTRY.yaml` 是「每份治理文档有身份证」
的单一事实源；门禁 `scripts/doc-system/doc-registry-gate.sh` 只在**提交路径**上查新增文档。
本卡补的是**存量可见性**：不依赖提交时机、可独立复跑的常驻对账。

### b) 文件审计（实测）
```
docs/authority/DOCS-REGISTRY.yaml                        — ✅ 39 条 path；**非法 YAML**（:118 \C unknown escape）
scripts/doc-system/doc-registry-gate.sh                  — ✅ 扫描面 = untracked 新增 ∪ staged 新增（:41-43）
scripts/control-tower/probes/                            — ⚠️ 目录不存在 ⇒ 本卡新建第二个探针
scripts/control-tower/daily-cto-board.sh                 — ✅ 存在（D1008 单写者，本卡禁改）
tests/control-tower/docs-registry-probe.test.sh          — ❌ 新建（U7/CT-40 配对）
```
规模对照：全仓 tracked `.md/.yaml` = 2188；`docs/synova/coordination/**` = 215 ⇒ 全量登记不现实 ⇒ **必须先定口径**。

### c) 决策
判定面收窄为四面 `authority / coordination/CTO-* / 号段水位 / product-lines/evidence`（最小有义面）；
匹配语义从「整文本子串」升级为「解析真实 path 值（精确/目录前缀/通配）」——首轮改坏即红实证子串匹配**恒绿**。
参考：第一性原理（判据必须真读声明）+ 控制塔三态模式 + 登记门禁既有 EXCLUDE（不另立标准）+ 结论。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 定口径 → ② 实测未登记清单 → ③ 逐条登记（id 续编）→ ④ 修 YAML 合法性 → ⑤ 落探针 + 测试 → ⑥ 改坏即红

### b) 执行约束
- rule: "探针在判定面内未登记 = 0 时 exit 0，有未登记 exit 1"
  verify: bash scripts/control-tower/probes/docs-registry-probe.sh
- rule: "台账 YAML 合法"
  verify: node -e "require('js-yaml').load(require('fs').readFileSync('docs/authority/DOCS-REGISTRY.yaml','utf8'))"
- rule: "配对测试非空壳（全覆盖三路径）"
  verify: bash tests/control-tower/docs-registry-probe.test.sh

## Q2: 范围

**做什么：**
- docs/authority/DOCS-REGISTRY.yaml（登记清零 + 修 YAML 非法转义）
- scripts/control-tower/probes/docs-registry-probe.sh（新建；三态对账探针）
- tests/control-tower/docs-registry-probe.test.sh（新建；配对测试）
- memory/notes/proposed/2026-09-25-d973-docs-registry-probe.md（新建；决策 Note）
- .claude/task-briefs/2026-09-25-D973-docs-registry.md（新建）
- task-state/D973.json（新建）
- docs/synova/product-lines/evidence/D973-docs-registry-20260925.md（新建；M6 交付回执 —— 必须列入写集，否则 D708 判夹带）

**不做什么：**
- 不改 scripts/doc-system/doc-registry-gate.sh （门禁本体不在本卡写集）
- 不改 scripts/control-tower/daily-cto-board.sh （D1008 单写者，已排他）
- 不改 scripts/control-tower/probes/task-id-watermark-probe.sh （D974 写集）
- 不改 tests/control-tower/check-ownership.test.sh （D972 写集）
- 不改 scripts/audit/K3-*.sh （K3 域，红线）
- 不改 docs/synova/coordination/号段水位.md （D974 写集）

## Q3: 验收

入口: `bash scripts/control-tower/probes/docs-registry-probe.sh`
交互: 扫判定面 tracked `.md/.yaml` → 与台账声明的 path 集比对（精确/目录前缀/通配）→ 打印未登记清单
结果: exit 0 一致 / exit 1 DRIFT（逐条点名）/ exit 2 fail-closed；daily-cto-board 通用 runner 自动发现

## 架构层: 基础设施

## Done 标准
- [x] verify: bash scripts/control-tower/probes/docs-registry-probe.sh （判定面内未登记 = 0，exit 0）
- [x] verify: bash tests/control-tower/docs-registry-probe.test.sh （25 项断言全绿 exit 0；含 ⑧b/⑧c --list 同码回归守卫）
- [x] verify: node -e "const fs=require('fs'),y=require('js-yaml');y.load(fs.readFileSync('docs/authority/DOCS-REGISTRY.yaml','utf8'))" （YAML 合法 exit 0）
- [x] verify: SYNO_TEST_ARM=1 SYNO_CT_STAGED="scripts/control-tower/probes/docs-registry-probe.sh" bash scripts/control-tower/ct-test-gate.sh （SYNC-OK exit 0）
