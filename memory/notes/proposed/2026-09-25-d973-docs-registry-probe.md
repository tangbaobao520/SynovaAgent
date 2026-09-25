---
状态: proposed
日期: 2026-09-25
决策: 文档登记判定面收窄为「authority + coordination/CTO-* + 号段水位 + product-lines/evidence」四面，匹配语义由「整文本子串」升级为「解析真实 path 值（精确/目录前缀/通配）」，并落三态对账探针 docs-registry-probe.sh 常驻校验。
理由: ① 全仓 tracked .md/.yaml 有 2188 份，全量登记既不现实也不承载治理语义 —— 台账自述定位是「治理锚点」，故面必须收窄到台账真能拥有的最小有义面；② 子串匹配是假绿源：实证 `docs/synova/product-lines/evidence/README.md` 因台账里 D:/ 遗留条目的 "README.md" 子串被误判为已登记，且把某条 path 改坏也检不出来（探针恒绿）；③ 登记门禁只在提交路径上查「untracked/staged 新增」，无暂存时恒输出「检查 0 个文档」，存量未登记永远不可见 —— 需一个不依赖提交时机的常驻对账。
---

# D973 文档登记对账：口径收窄 + 匹配语义升级

任务: D973（task-state/D973.json，状态 in_progress）

## 背景（实测，非转述）

1. `docs/authority/DOCS-REGISTRY.yaml` 原有 **39** 条 `path`，而全仓 tracked `.md/.yaml` 有 **2188** 份
   ⇒ 「未登记 = 0」在任一宽口径下都不成立，必须先把口径写清。
2. 登记门禁 `scripts/doc-system/doc-registry-gate.sh:41-43` 的扫描面 =
   **untracked 新增 ∪ staged 新增**；工作树干净时输出「检查 0 个文档」⇒ 存量缺口不可见。
3. 台账本身**不是合法 YAML**：`:118` `note: "…（E:\ClawOrg-BOX 时代的目录规范）"` 的双引号里
   `\C` 是 unknown escape（ruby/js-yaml 双解析器一致报错）。门禁用整文本子串匹配，故一直未暴露。
4. 子串匹配会造成**双向误判**：把 `evidence/README.md` 误判为已登记（命中 D:/ 遗留条目里的
   `README.md` 子串），同时把 `pat.h` 改坏也检不出来（D973 改坏即红首轮实证：探针恒 exit 0）。

## 决策

1. **判定面 v1（四面）**：`docs/authority/**`（除 chronicle-drafts，与门禁 EXCLUDE 一致）
   ∪ `docs/synova/coordination/CTO-*.md` ∪ `docs/synova/coordination/号段水位.md`
   ∪ `docs/synova/product-lines/evidence/**`。选它的理由 = **最小有义面**：
   台账自述是「治理锚点台账」，锚点住在 authority（权威层）与 coordination（协同层），
   证据回执住在 evidence（M5 强制落点）；其余技术/审计/计划面或已被门禁 EXCLUDE，或不承载治理语义。
2. **匹配语义 = 解析真实 `path` 值**，三种声明语义：精确路径 / 目录前缀（尾 `/`）/ 通配（含 `*`，按 basename）。
   **不保留整文本子串匹配**（假绿源，见背景 4）。
3. **三态 exit**：0 一致 / 1 DRIFT（有未登记）/ 2 fail-closed（台账缺失、面内零文档、非 git、无 Python）。
4. **修台账 YAML 合法性**（`:118` 改单引号）——否则 判据⑤ `yaml.safe_load` 永不通过。

## 实施结果

- 登记清零：面内 41 份文档，未登记 0（新增 30 条：DOC-0119..DOC-0148）。
- 台账 YAML 由「非法」修到可解析（js-yaml `documents = 69`；PyYAML 本机未安装，见交付回执遗留项）。
- 探针 + 配对测试 22 项（正常/降级/边界/反子串误判/接线）。

## 未决 / 需上游处置

- **本机无 PyYAML** ⇒ 卡面判据⑤ 的原始命令跑不通；已改用 `node + js-yaml` 作为等价解析器并登记该偏差。
- **D974/D972 的新 `.md`**（`号段水位.md` 与两份 evidence 回执）在本分支不存在；
  其登记已前瞻写入本卡台账（`号段水位.md`）或需按分支各自登记，**合并顺序影响 CI 是否变红**（已报队长）。
- **门禁 vs M5/M6 的摩擦**：M5 要求每任务落 evidence 回执，而 D2 登记门禁要求每个新增 `.md` 登记
  ⇒ 每次交付都必须顺带改 `DOCS-REGISTRY.yaml`。本卡已把 evidence 面纳入判定面使其可见，但该摩擦本身待队长/CTO 决策。

## 参考

参考：第一性原理（台账能拥有的最小有义面 + 判据必须真读声明，不能是文本出现即算）+
控制塔三态退出码模式（ctrl-tower-change 模式 1）+ 登记门禁既有 EXCLUDE 口径（不另立标准）+
D973 改坏即红首轮证伪（子串匹配恒绿）实测 + 结论。
