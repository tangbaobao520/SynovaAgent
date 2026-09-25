# D975 补 `ownership.yaml` 哨兵域规则（2 条）— 交付证据

| 项 | 值 |
|---|---|
| **任务** | task-6（D975）— 补 `ownership.yaml` 哨兵域规则，解 D965/D967/D968 跨域锁 |
| **执行者** | `sentinel-coder-a`（编码；自验不兼任） |
| **卡号来源** | **D975**（Mac 段，**人工按 `号段水位.md` 取号**；**未走 `alloc-task-id.sh`** —— 实测该脚本 dry-run 给 **D1008**（Win 段），与分段口径冲突） |
| **工作树/分支** | `.synova-wt-D975` ｜ `docs/D975-ownership-sentinel-domain` |
| **基线** | `origin/main` = `ef2997466677324b94d7b2921a5b3de0b7ad57d3`（开工时实测 fetch） |
| **批准** | CTO 2026-09-25 批准立卡；**改规则 ⇒ 必须 K3 复审** |
| **改号记录** | 原 **D969** → **D975**。依据（队长实测）：`D969` 号已被 CTO 并行批次**两处占用** —— 分支 `feat/d969-daily-cto-board-paired-test`（卡 `daily-cto-board 配对测试…D969-FIX`）与分支 `fix/d969-merge-blockers-root`（卡 `P0 三件合并阻塞根治…`）；CTO 批次 D970–D974 亦已占完。**同一批提交搬支**（新分支 `docs/D975-ownership-sentinel-domain`，内容不变），旧分支 `docs/D969-ownership-sentinel-domain` 已删除（我方分支、未开 PR）。**规则内容与位置一字未动**，仅注释自指改号。 |

## 0. 效力声明（防误读）

- 本件只出 **`自验结论`** / **`可提请独立审计`**，**不含「审计通过」**。**改规则类变更的通过性归 K3 复审 + CTO 收件闸**。
- 本件由**编码者**撰写，**不是独立验证**。
- 全部数字为**命令原始输出**（随件入库 `results/`），无手写。

## 1. 唯一改动：`ownership.yaml` **纯追加 12 行**（0 删改）

```
$ git diff --stat
 docs/synova/coordination/ownership.yaml | 12 ++++++++++++
 1 file changed, 12 insertions(+)
```

```diff
@@ -58,6 +58,18 @@ rules:
   - glob: "tests/sentinel/**"
     owner: mac
     source: "TASK-ROUTING.md §31（哨兵体系核心=Mac，其测试随域）"
+  # D975 补漏（CTO 2026-09-25 批准立卡）：哨兵**本体目录**此前落 extensions/** = win，
+  # 与 TASK-ROUTING.md L31「哨兵体系核心 = Mac」相悖 ⇒ 任何真实哨兵改动必然跨域
+  # （D734 ② 必红），且按域拆 PR 会留下 src/sentinel/types.ts 指向已移动路径的 TS2307 中间态。
+  # 位置要求: 必须在本文件 L41 `extensions/**` 之后（注释自述「后匹配者胜出」）。
+  - glob: "extensions/sentinels/**"
+    owner: "mac"
+    source: "补漏: TASK-ROUTING.md L31 哨兵体系核心（本体目录 manifest/aggregate/computes）；此前无规则 ⇒ 落 extensions/** = win"
+  # D975 同源补漏：单复数不一致（tests/sentinel/** 有规则 = mac，tests/sentinels/** 无规则 = win 兜底）
+  # ⇒ 同一批哨兵测试因目录名单复数而分属两域。
+  - glob: "tests/sentinels/**"
+    owner: "mac"
+    source: "补漏: TASK-ROUTING.md §31 哨兵体系核心=Mac，其测试随域（单复数不一致导致分属两域）"
   - glob: "src/cron/**"
```

- **位置合规**：新 2 条紧跟既有 `tests/sentinel/**`（L58-60）之后 ⇒ 位于 `extensions/**`（**L41**）之后，满足文件自述的「后匹配者胜出」。
- **零删改**：`12 insertions(+), 0 deletions(-)`（`results/ownership-diff.txt` 全文）。

## 2. Done 逐条（命令 + 原始输出）

### Done 1/2 — 改坏即红（双向）

**① 加规则前（基线 `origin/main` 版 ownership.yaml）→ 必须红**

```
$ check-ownership.py --yaml <origin/main 基线> <D965 45 文件>
win  extensions/sentinels/_extinct/sentinel-forecast-accuracy/aggregate.ts
win  extensions/sentinels/_extinct/sentinel-forecast-accuracy/manifest.json
win  extensions/sentinels/_extinct/sentinel-pricing-strategy/aggregate.ts
win  extensions/sentinels/_extinct/sentinel-pricing-strategy/manifest.json
mac  src/sentinel/types.ts
mac  tests/control-tower/check-sentinel-type-net.test.sh
mac  tests/sentinel/d752-type-net-gate.integration.test.ts
mac  tests/sentinel/path-dependency-sentinel.test.ts
win  tests/sentinels/shared/d62-me-sentinels.test.ts

❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win'] —— 单个 PR 只许一个域（无归属 0，域判定豁免 36）
```

**② 加规则后 → 必须绿**

```
$ check-ownership.py --yaml <D975 加规则后> <D965 45 文件>
mac  extensions/sentinels/_extinct/sentinel-forecast-accuracy/aggregate.ts
mac  extensions/sentinels/_extinct/sentinel-forecast-accuracy/manifest.json
mac  extensions/sentinels/_extinct/sentinel-pricing-strategy/aggregate.ts
mac  extensions/sentinels/_extinct/sentinel-pricing-strategy/manifest.json
mac  src/sentinel/types.ts
mac  tests/control-tower/check-sentinel-type-net.test.sh
mac  tests/sentinel/d752-type-net-gate.integration.test.ts
mac  tests/sentinel/path-dependency-sentinel.test.ts
mac  tests/sentinels/shared/d62-me-sentinels.test.ts

✅ PASS 9 个文件同域: mac（无归属 0，域判定豁免 36）
```

**③ 字面「撤掉 → 加回」**（在真实工作树上做，非仅 `--yaml` 对照）：

```
$ git checkout -- docs/synova/coordination/ownership.yaml     # 撤掉 2 条
$ git diff --stat                                            # 空 = 已回基线
$ grep -c "extensions/sentinels\|tests/sentinels" docs/synova/coordination/ownership.yaml
0                                                            # 规则确已不存在
$ check-ownership.py <D965 45 文件>
❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win']（同上 5 个 win 文件）   # ← 红侧复现

$ cp <备份> docs/synova/coordination/ownership.yaml             # 加回
$ git diff --stat
 docs/synova/coordination/ownership.yaml | 12 ++++++++++++
$ check-ownership.py <D965 45 文件>
✅ PASS 9 个文件同域: mac（无归属 0，域判定豁免 36）              # ← 绿侧复现
```

⇒ **规则确为负载项（load-bearing）**：撤掉则跨域复现，加回则单域。原始输出：`results/d965-before-rules.txt`、`results/d965-after-rules.txt`、`results/kill-red.txt`。

### Done 3 — D965 分支 PR 预算 ①②③ 全绿

```
$ cp <D975 规则> docs/synova/coordination/ownership.yaml   # 在 D965 工作树内做可逆实验
$ bash scripts/control-tower/check-pr-budget.sh
── PR 预算门禁（D734）: 基线=origin/main 上限=12 文件 / 落后阈值=20 ──
  ℹ️  D860 治理产物豁免: 33 件不计预算（brief/卡/Note/规格/自验证据，代码文件仍计数）
  ✅ ① 变更文件数 12 ≤ 上限 12
  ✅ ② 变更单域: ✅ PASS 9 个文件同域: mac（无归属 0，域判定豁免 3）
  ✅ ③ 落后 origin/main 1 个提交 ≤ 20
✅ PASS PR 预算内（12 文件）
$ git checkout -- docs/synova/coordination/ownership.yaml   # 已还原（D965 不得改此文件）
```

⇒ **D965 的 CI 唯一红项（D734 ②）由本卡解掉**。原始输出：`results/budget-d965-with-rules.txt`。
> 诚实登记：③ 显示**落后 1 个提交**（`origin/main` 在 D965 提交后前进到 `ef299746`）。阈值 20 内不阻断；D965 分支需在开 PR 前刷新（队长已指示"只把分支保持最新"，不在本卡范围）。

### Done 4 — 回归对照（零副作用证明）

同一**代表路径集**（17 条）分别用「基线 ownership.yaml」与「加规则后 ownership.yaml」跑 `check-ownership.py --yaml`，逐路径对照：

| 域变化 | 基线 → 加规则后 | 路径 |
|---|---|---|
| **不变** | mac → mac | `src/sentinel/types.ts`、`src/sentinel/runner.ts`、`src/sentinel/baseline-store.ts` |
| **不变** | mac → mac | `tests/sentinel/foo.test.ts` |
| **变更（设计内）** | win → mac | `tests/sentinels/shared/foo.test.ts` |
| **变更（设计内）** | win → mac | `extensions/sentinels/cost-health/manifest.json`、`extensions/sentinels/cost-health/aggregate.ts` |
| **不变** | win → win | `extensions/industries/x.json`、`extensions/expert/host.yaml` |
| **不变** | win → win | `packages/logger/src/index.ts` |
| **不变** | win → win | `src/store/measurements.ts`、`src/init/file-driven-loaders.ts`、`src/agent/synova-agent.ts`、`tests/store/x.test.ts` |
| **不变** | mac → mac | `docs/synova/coordination/ownership.yaml` |

⇒ **14 条不变 / 3 条按设计变更，且变更者恰好是 `extensions/sentinels/**` 与 `tests/sentinels/**` 两个目标路径族**；`extensions/**` 其它路径（`industries/`、`expert/`）**归属不变**。原始输出：`results/regression-raw.txt`。

## 3. 新发现（**前提不成立，已上报**）：D967 的跨域锁**未被本卡解开**

队长口径原为「D967 的跨域 **将由 task-6 的规则修好后消失**」。**实测不成立**：

```
$ check-ownership.py <D967 预期写集>          # 已含本卡 2 条新规则
win  src/store/measurements.ts
win  src/store/migrations/002-graph-triples-rebuild.ts
win  src/store/schema-migration.ts
win  src/agent/post-diagnosis-processor.ts
win  src/agent/synova-agent.ts
win  tests/store/measurements.test.ts
mac  src/sentinel/baseline-store.ts
mac  src/sentinel/runner.ts
mac  src/agent/sentinel-health-service.ts
mac  tests/sentinel/measurements.test.ts

❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win']（无归属 0，域判定豁免 2）
```

⇒ D967 的跨域来自**另一处规则缺口**：`src/store/**`（`**` 兜底 = win）、`src/agent/post-diagnosis-processor.ts`（win）、`src/agent/synova-agent.ts`（win）、`tests/store/**`（win）**×** `src/sentinel/**`（mac）、`src/agent/sentinel-health-service.ts`（mac）。**本卡 red line = 只追加 2 条规则**，故**未擅自为 D967 追加规则**，已上报待 CTO 裁定（补规则 / 改卡拆法）。原始输出：`results/d967-still-crossdomain.txt`。

## 4. 自检 5 问（本卡为规则文件，非代码）

1. **接线检查**：本卡**不改任何代码、不新增 export**。接线面 = 规则消费者：`check-ownership.py`（`--yaml` 默认指向本文件）、`check-pr-budget.sh`（D734 ② 调前述脚本）——**两者均已在 §2-Done3 实跑验证读取到新规则并改变判定** ✅
2. **异常处理**：无 catch / 无运行时逻辑。**未新增静默降级**；脚本侧降级路径未触碰 ✅
3. **类型安全**：无代码产出；`git diff` 仅 12 行 YAML 追加，`as any/as never/as unknown as` 恒为 0 ✅
4. **测试质量**：规则变更的等价断言 = **改坏即红双向**（§2-Done1/2：撤 → ❌ 复现 / 加回 → ✅）+ **零副作用回归对照**（§2-Done4：14 不变 / 3 设计内变更）。判据全部为**运行时实跑**，无 grep 型静态判据 ✅
5. **残留清理**：无死代码、无旧引用；`git diff` **0 deletions**；工作树内可逆实验已 `git checkout` 还原（`git status` 空）✅

## 5. 未清项（诚实登记）

1. **D967 跨域未解**（§3）——需 CTO 裁定，本卡不扩范围。
2. **D975 未写入 `号段水位.md`**（红线：属 CTO 域）——由队长上报 CTO 更新水位表。
3. **`alloc-task-id.sh` 不感知分段**：实测 dry-run 对本卡给出 **D1008（Win 段）**，而正确号是 **D975（Mac 段）**。⇒ 该脚本的"分段感知"缺口建议立卡（与 CTO 本人踩坑同源）。
4. **D965 分支落后 `origin/main` 1 个提交**（阈值内不阻断），开 PR 前需刷新。
5. **本卡未跑全量 vitest / tsc**：改动为纯 YAML 规则文件，无代码路径；已跑的等价判据见 §2。若复核员/K3 要求，可另申请重型令牌。
6. **规则变更的域语义**：本卡只解决"哨兵体系"两处缺口；**归属规则的整体口径**（如 `src/store/**` 是否应随哨兵线）**不在本卡判定范围**，需 CTO/K3 判断。

## 6. 复现步骤

```bash
cd /Users/wane/SynovaAgent/.synova-wt-D975
# 1) 改动形态（纯追加）
git diff --stat && git diff

# 2) 红侧：撤掉 2 条规则
git checkout -- docs/synova/coordination/ownership.yaml
python3 scripts/control-tower/check-ownership.py $(cat docs/synova/product-lines/evidence/D975-ownership-sentinel-domain/results/d965-files.txt | tr '\n' ' ')   # ❌ 跨域

# 3) 绿侧：加回
#   （重新应用本卡 diff / git checkout docs/D975-ownership-sentinel-domain -- <file>）
python3 scripts/control-tower/check-ownership.py $(cat docs/synova/product-lines/evidence/D975-ownership-sentinel-domain/results/d965-files.txt | tr '\n' ' ')   # ✅ 单域 mac

# 4) 回归对照（基线版先导出到 /tmp）
git show origin/main:docs/synova/coordination/ownership.yaml > /tmp/ownership-baseline.yaml
python3 scripts/control-tower/check-ownership.py --yaml /tmp/ownership-baseline.yaml <代表路径集>
python3 scripts/control-tower/check-ownership.py --yaml docs/synova/coordination/ownership.yaml <代表路径集>

# 5) D965 分支预算（需先把规则复制进 D965 工作树，跑完还原）
```

> `D965 45 文件` 表生成：`git -C .synova-wt-D965 diff --name-only origin/main...HEAD`

## 7. 证据清单（随件入库）

| 路径 | 内容 |
|---|---|
| `results/ownership-diff.txt` | `git diff --stat` + 全文（12 insertions / 0 deletions） |
| `results/d965-before-rules.txt` | 基线规则下 D965 45 文件表 → **❌ 跨域** |
| `results/d965-after-rules.txt` | 加规则后 → **✅ PASS 单域 mac** |
| `results/kill-red.txt` | 「撤掉 2 条规则」步骤留痕（grep 命中 0） |
| `results/regression-raw.txt` | 代表路径集 基线 vs 加规则后 两次完整输出 |
| `results/d967-still-crossdomain.txt` | **D967 仍跨域**（新发现，已上报） |
