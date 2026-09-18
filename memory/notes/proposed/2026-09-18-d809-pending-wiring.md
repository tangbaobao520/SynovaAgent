---
状态: proposed
日期: 2026-09-18
决策: 26 线 V1 台账引入**第四种判据态 `pending_wiring`**——断言「证据」列写 `pending_wiring` = 该点的点亮**已撤回、等接线完成**；派生器（`gen-project-board.py`）对它 **fail-closed**：永不与任何证据配对、不计 `v1_passed`/`v1_verified`/保鲜，显式归类为 `pending_k3`（断言级 `status` + `lines[].pending_k3` + `totals.pending_k3`）。接线完成后把证据列改回真实证据类型（如 `test`）即自动恢复计分——撤回**不是删除历史证据**，是判据源的可回滚标记。
理由: 假绿（绿灯亮了但能力没接线）不是「数字算错」，是**判据源里没有『已交付但未接线』这一态**。D808 已诊断出看板只读「证据 × 验收点」绑定、**不读代码存在性**（`docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md` §11.2）。因此撤回只能落在判据源上：20-3/20-5/22-1 三点证据列原为 `test`，而 `test` 类存量证据已有 13 份（2026-08-17 至 09-18，含 `test-2026-08-17.json`、`k3-2026-09-02-productlines.json`、`D806-borrow-cards-20260918.json`）→ 无论代码是否接线，看板恒亮。若只改证据文件，则等于**篡改历史记录**且不可回滚；若只改派生器硬编码三个 id，则判据不可见、不可审计、下一点漏账。故取第三路：判据源加**非证据 kind** + 派生器 fail-closed 归类。
---

## 落地

- **判据源（D809）**: `docs/synova/project/26线-V1验收标准-v0.2-20260917.md` 附录 A 三条证据列 `test` → `pending_wiring`（20-3 / 20-5 / 22-1）+ 附录 A 头注同步 + 附录 B 记新哈希 `df11b86c`（D806 落库态 `97288654` 留档）。§〇–§六 冻结件**逐字节未动**（签字哈希 `c11841e6` 复现）。
- **派生器（D809）**: `scripts/project/gen-project-board.py` 新增 `PENDING_WIRING_KIND` / `PENDING_WIRING_STATUS` + 断言三态 `passed`/`pending_k3`/`pending`；契约写进文件头 `@contract`（铁律 47）。
- **读数**: `ledger.json` `v1_passed` **25 → 22**、`v1_verified` 13 → 11、`freshness.green` 18 → 15、`delivery_pct` 19.5% → 17.2%、`pending_k3` = 3（分母 128 不变，backlog 36 不变）。
- **反向可复原**: 三点接线完成后证据列改回 `test` → 下一轮派生自动回到 25（测试组⑧夹具内实测 1↔2 翻转）。
- **不动的东西**: 存量证据记录（含 `D806-borrow-cards-20260918.json`，它自己的 `note` 已写明「该点已由既有 test 证据计分，本条为 M2 绑定不虚增」）一律不改；`calc-progress.py` / `product-lines.yaml` / 看板插件零改动。

## 依据（本单独立复现的物理事实，非转述派单）

- 派单依据: CTO【编码 session A｜假绿回退】+ K3 2026-09-18 D808 审计 P0「B-02/B-05/B-06 未接线」。
- 独立复核 ①: `git grep -n "callWithResilience\|streamWithRetry" origin/main -- src/` → 除 `src/llm/retry-middleware.ts` 自述与 `src/llm/types.ts` 注释外**零调用方** = B-02 韧性中间件未接线（铁律 4/5 同型：测试绿但无人调用）。
- 独立复核 ②: `git grep -n "invariant" origin/main -- src/` → 无任何不变量注册表文件 = 22-1 所要求的 `dsh-invariants` 范式未见落地。
- 独立复核 ③（如实分列，不掩盖差异）: 20-3 / 20-5 的**组件层**有生产调用点（`src/agent/conversation-engine.ts:48,596,752` 调 `ContextCompaction`；`src/llm/retry-middleware.ts:25` 引 `timeout`），但其 **M3 锚点仍是 Win 旧路径**（`D:/deepseek-harness/packages/...`），正是 D808 §11.3 ③ 具名的 4 文件之一 → 按派单判「未接线」，撤回成立；恢复条件 = 卡 3（锚点按 M3 重写）落地后把证据列改回 `test`。
- 结构性佐证: 判分器只看「证据 kind ↔ record_type」配对（`gen-project-board.py` 判定段），**不读代码存在性** → 不改判据源，任何代码层修复都不会反映到读数上。

## 参考

- 判据源: `docs/synova/project/26线-V1验收标准-v0.2-20260917.md`（§〇 M1–M5 + 附录 A 128 条机器源）
- 上游诊断: `docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md` §11（G3 物理化）+ §12（落点归属）
- 前序决策: `memory/notes/proposed/2026-09-18-d806-ledger-dsh-alignment.md`（本单一处**修正**它的④证据列映射：`test` 名单去掉 20-3/20-5/22-1；其余条目不变）
- 状态词表复用: `dsh/plugins/synova-dashboards/lib/client.js:104` 已有 `pending_k3: "待K3"`——本单沿用该词，不另造
- 决策参考系（D333）: 第一性原理（判据源缺态 → 补态，而非补文档）+ Anthropic 工程基线（fail-closed + 机器可验 + 派生只读）→ **收敛**：判据源加非证据 kind，派生器归类计数，反向可回滚。
- 遗留（转下一单，非本单范围）: ① 看板前端仍只渲染 `a.ok`（✓/✗），`status=pending_k3` 尚未在 UI 上显示为「待接线」——`dsh/plugins/synova-dashboards/**` 当值另一 session（主工作区 `feat/d782-doc-truth-wiring` 暂存区已含 `lib/client.js`），本单按撞车回避物理不碰，需 CTO 另派卡；② 另一条判分链（`product-lines.yaml` → `calc-progress.py` → `product-progress.json`）不读 V1 断言表，本次撤回**不影响它**，20-5/22-1 在那条链上的读数需单独裁决；③ `docs/synova/project/产品完成标准-可视版-20260917.html` 仍是 v0.1 期静态快照（分母 125），其注文自称「由 gen-project-board.py 每日自动重生成」但**无任何生成器/工作流引用它** → 陈旧快照，另立卡。
