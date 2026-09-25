# Task Brief — D969 补 ownership.yaml 哨兵域规则（2 条）

#CRITERIA: A

## 写集

> D749 机器块 = 写集**单一事实源**。

| 文件 | task/builtin（理由） |
| --- | --- |
| `docs/synova/coordination/ownership.yaml` | task（**唯一被改的规则文件**：追加 2 条 mac 例外规则） |
| `task-state/D969.json` | task（本卡） |
| `.claude/task-briefs/2026-09-25-D969-ownership-sentinel-domain.md` | task（本 brief） |
| `docs/synova/product-lines/evidence/D969-ownership-sentinel-domain-evidence.md` | task（主证据） |
| `docs/synova/product-lines/evidence/D969-ownership-sentinel-domain/**` | task（原始输出 results/） |
| `.claude/bypass.log` | builtin（post-commit hook 运行期追加证据账本） |

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图

L0 控制塔治理面（**规则文件**，非代码）。`docs/synova/coordination/ownership.yaml` 是 `check-ownership.py` / `check-pr-budget.sh`（D734）的**域归属单一事实源**；错误归属会让整类卡在 CI 上**必然跨域红**。本卡不新增机制，只**补 2 条缺失规则**。

### b) 文件审计（实测，非推断）
- `extensions/**` → **win**（L41，source TASK-ROUTING.md L38）
- `src/sentinel/**` → **mac**（L55）；`tests/sentinel/**` → **mac**（L58）
- **`extensions/sentinels/**` 全文件无规则** ⇒ 落 `extensions/**` = **win**
- **`tests/sentinels/**`（复数）无规则** ⇒ 落 `**` 兜底 = **win**（而单数 `tests/sentinel/**` = mac）
- 实测后果（官方校验器，`results/d965-before-rules.txt`）：D965 的 45 文件表 → **❌ FAIL 跨域 mac+win**，win 侧恰 5 个文件（哨兵**本体目录** 4 + 复数测试 1）。
- 结构性后果：哨兵**本体**（`extensions/sentinels/**`）与**加载器/类型网/测试**（`src/sentinel/**`、`tests/sentinel/**`）分属两域 ⇒ **任何真实哨兵改动都必然跨域**；且按域拆 PR 会留下 `src/sentinel/types.ts` 指向已移动路径的 `TS2307` 中间态 ⇒ **结构上拆不掉**。
- 影响面：**D965**（已交付，CI 仅剩此红）＋ **D967** ＋ **D968**。

### c) 决策

按 CTO 批准立卡**仅追加 2 条规则**（不重构、不合并既有规则），位置放在既有 `tests/sentinel/**` 之后（满足"必须在 `extensions/**` 之后"的顺序要求）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- **第一性原理**：归属规则的判据是**语义边界**（"哨兵体系"），不是**目录名字面**。`extensions/sentinels/**` 是哨兵体系的**本体**，却因"住在 `extensions/` 下"而被判给 win —— 这是**规则按路径字面推不出意图**的经典错配。修法是让规则显式表达意图，而非让每张卡去绕。
- **Anthropic 工程基线**：规则变更必须**可判别**（撤掉即红 / 加回即绿）+ **零副作用**（回归对照证明只有目标路径族改变）。
- **memory 历史教训**：
  - **D382 编号撞车 / D339 分散取号**：本卡取号**未走 `alloc-task-id.sh`**（该脚本只递增全局最大号、不感知分段，实测 dry-run 给 D1008=Win 段）——按队长裁定用 **D969（Mac 段水位 +1）**，并在卡面写明取号来源。
  - **D335/D334 多机同步**：分支基于**开工时最新** `origin/main`（`ef299746`，非卡片里的过期值）。
  - **D965 本批教训**（我上一张卡）：`STAGED_SRC` 为空仍打 ✅ 的空洞绿 ⇒ 本卡全部判据都用**显式指定的文件表**（`--files`/位置参数）跑，不依赖"从 git 状态推导出的集合"。
- **决策参考系**：参考 Anthropic/第一性原理 + 结论 = 「补规则让规则表达语义意图；变更必须零副作用并经回归对照证明」。

## Q2: 范围 — 正确的最简方案

做什么：
- `docs/synova/coordination/ownership.yaml` — **仅追加 2 条**：
  - `extensions/sentinels/**` → `owner: mac`（source 写明：补漏，本体目录此前落 `extensions/**` = win，与 TASK-ROUTING.md L31「哨兵体系核心 = Mac」相悖）
  - `tests/sentinels/**` → `owner: mac`（source 写明：单复数不一致导致同一批哨兵测试分属两域）
  - 位置：紧跟既有 `tests/sentinel/**` 之后 ⇒ 位于 `extensions/**`（L41）之后，满足「后匹配者胜出」
- `task-state/D969.json`、本 brief、evidence md + results/**（交付三件套）

不做什么（含文件路径）：
- **不改** `docs/synova/coordination/号段水位.md`（CTO 域；由队长上报 CTO 更新）
- **不改** `scripts/control-tower/**` 任何脚本（含 `check-ownership.py`、`check-pr-budget.sh`）
- **不调** `--max-files` 上限（红线：超了拆 PR，不开口子）
- **不修** `docs/authority/DOCS-REGISTRY.yaml`（同文件已有在制写者 D973；本卡与其零交集）
- **不为** D967/D968 顺手追加规则（本卡 red line = 只 2 条；D967 的跨域来自**另一处**缺口，已实测并上报，不擅自扩大）
- 不改 `scripts/audit/**`、`docs/synova/audit-reports/**`、`ci.yml`、`pre-commit-check.sh`

## Q3: 验收 — 入口 → 交互 → 结果

入口：`python3 scripts/control-tower/check-ownership.py <文件表>` / `bash scripts/control-tower/check-pr-budget.sh`（CI 的 D734 门禁即调后者）。
处理：`ownership.yaml` 规则按**后匹配者胜出**解析 → 生效规则决定每个文件的域 → 汇总判定「单域/跨域」。
结果：D965 的 45 文件表由 **❌ 跨域 mac+win** 变为 **✅ PASS 9 个文件同域 mac**；D965 分支的 PR 预算 **①②③ 全绿**。

## 架构层: L0 控制塔治理（规则文件层）

## Done 标准

- [ ] verify: `python3 scripts/control-tower/check-ownership.py <D965 45 文件>` → `✅ PASS … 同域: mac`（加规则后）
- [ ] verify: 撤掉 2 条规则重跑 → `❌ FAIL 跨域: ['mac','win']`（改坏即红，红侧原始输出入证）
- [ ] verify: 加回 → `✅ PASS`（绿侧原始输出入证）
- [ ] verify: `bash scripts/control-tower/check-pr-budget.sh`（D965 分支 + 本卡规则）→ `✅① 12≤12 ✅② 单域 mac ✅③ 落后 ≤20` → `PASS PR 预算内`
- [ ] verify: 回归对照 `check-ownership.py --yaml <基线> vs --yaml <加规则后>` 同一代表路径集 → 仅 `extensions/sentinels/**`、`tests/sentinels/**` 两族变更，其余归属不变
- [ ] verify: `git diff --stat` → `1 file changed, 12 insertions(+), 0 deletions(-)`（纯追加）
