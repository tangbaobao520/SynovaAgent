---
状态: implemented
日期: 2026-09-13
决策: D726 四项——① graphbridge-wiring 真红判为「测试替身契约漂移」，同路径暴露真产品缺陷（upsertFromHONA 生产恒降级）并上报；② calc-progress machine 段对齐 k3 段语义（显式 fail 优先 + (date, at) tiebreaker），结论不再由文件名字典序决定；③ evidence-writer 产证文件名加机器维度（修双机撞车）；④ alloc 骨架 #CRITERIA 补回归网（含反向验证）+ 清理 D721-D740 存量残留
理由: 四项同族——「门禁/工具链看起来正常，实际由巧合而非语义决定」。② 与 D718 是同一根因（稳定排序=字典序）在另一处复发：`max(key=date)` 同分取列表中首个，而列表来自 `sorted(glob('*.json'))` = 文件名字典序，实测 1-4 的 failed 只因 'D' < 's'。① 的断言红则暴露了「接线测试自搭两端、无法区分接线断裂与下游降级」——本单把 afterRun 打点写成断言。③ 的 `-n` 只在本地目录递增，双机同日同类必撞名。
---

## 任务

D726（P1）— 清单「问题总账 §一（K3-P1-1 / K3-P1-3 / CTO-3）+ D717 回传（N1/N2）」。
写集: `scripts/product-lines/`、`scripts/control-tower/alloc-task-id.sh`、`tests/**`；不改 `scripts/audit/`。

## 决策 1：① 判「测试期望漂移」为红因 + 「产品缺陷」为同路径掩盖的真债

**打点判据（任务要求）**：`afterRun` **仍被调用**——实测 1 次，payload 正确
（`total=2, completed=1, failed=1, degraded=['broken']`）。故接线完好，红不在接线。

**红的物理成因**：`tests/l3/graphbridge-wiring.test.ts` 的替身 `createNodes` 转发时丢掉 props
（旧写法 `this.createNode(n.type)`）。而 `createGraphBridge` 在构造时**改写** `store.createNode`
（`src/l4/graph-bridge.ts:81`），改写过的那版解引用 `props.observed_at`（:90）→ TypeError →
`upsertFromHONA` 降级 → `graphNodes` 恒 0。**替身违反 GraphStore 接口契约，属测试期望漂移。**

**同路径暴露的真缺陷（实测）**：生产适配器 `SqliteGraphStore`（`src/server.ts:261` 注入
`app.locals.graphStore`）**没有 `createNodes` 方法** → `upsertFromHONA` 生产恒降级
（实测 `errors[0] = "upsertFromHONA: store.createNodes is not a function"`，`nodesCreated=0`）。
叠加 `src/agent/diagnosis-launcher.ts:235`「HONA 哨兵已删除 — 跳过」→ 该路径读不到数据源，
**双死**（铁律 37 dead code 类）。修复须动 `src/` = 本任务写集外 → 只判定 + 上报，不越界改。

**修法（写集内）**：替身补 props 转发（恢复断言原意）+ 把 afterRun 打点写成断言
（`observed.calls===1` + payload 全等）——这才是「接线仍活」的物理证明；另补一条
「store 缺方法时必须显式 degraded + 具名错误」的降级诚实契约用例（铁律 24/31）。

## 决策 2：② machine 段对齐 k3 段语义（不做「窗口放宽」式的换汤不换药）

**缺陷（物理复现）**：`status_for_point` 的 k3 段是 `any(fail) → rejected` + `max(passes, key=(date, at))`；
machine 段是 `max(machine, key=date)` 后判 fail —— 同分时 `max` 返回列表中**首个**最大元素，
而列表顺序来自 `load_evidence_records` 的 `sorted(glob("*.json"))` = **文件名字典序**。
真实数据实证（验收点 1-4，2026-09-13）：`D713-published-artifact-20260913.json`(fail) 与
`scenario-2026-09-13-1.json`(pass) 同日 → 旧实现取到 fail **只因 'D' < 's'**。
（该结论恰好正确，但机制是巧合——换个文件名就会翻转。）

**修法**：machine 段改为 ① `any(fail) → failed`（与 k3 一票否决同构，保守）② 无 fail 时
`max(machine, key=(date, at))` 决定新鲜度判定。**同时补 `superseded_by` 过滤**——k3 分桶有、
machine 分桶没有；缺失时「fail 优先」会把一条已被取代的旧 fail **永久钉死**（无法翻案）。
实测该补丁对当前数据零影响（`superseded_by` 仅出现在 2 条 k3 裁决上），是安全对齐。

**行为保持性证明**：改前后对真实数据各算一次 `product-progress.json` → **状态差异 0 条**
（总进度 1% → 1%，verified 合计 1 → 1）。

**反向验证**：把新测试放在 origin/main 的 calc-progress 上跑 → 4 条新用例红
（其中 `test_machine_same_date_conflict_is_filename_permutation_invariant` 直接把
「字典序大的是 pass」的排列喂进去 → 旧实现给 `pending_k3`，证明字典序确实在决胜）。

## 决策 3：③ 产证文件名加机器维度（不在 `-n` 上打补丁）

`evidence-writer.py` 原文件名 `<type>-<date>[-n]`，`-n` 只在**本地目录**内递增 →
Mac 与 Win 同日跑同类型场景各自产出 `<type>-<date>.json` → 合并时同名相撞。
修法：文件名 `<type>-<date>-<machine>[-n]` + 记录内落 `machine` 字段。
- 机器标识三级回退：显式 `--machine` > 环境变量 `SYNO_MACHINE` > 平台推断（darwin→mac / windows→win / linux→linux）
- 归一化 + 非法 fail-closed（`///`、空、中文 → exit 2，**不静默回退**平台值，铁律 11）
- **保留 `<type>-<date>*` 前缀**：既有 glob（`scenario-2026-09-13*.json` 等 verify 命令）与
  `calc-progress.py` 的 `glob("*.json")` 零影响
- 端到端实测：`refresh-all.sh` → `run-machine-evidence.sh` → writer 全链已产出
  `test-2026-09-13-mac.json`（机器字段实测落盘）

## 决策 4：④ 骨架硬字段补回归网（骨架本身已正确）

**实测**：alloc 骨架第 210 行已含 `#CRITERIA: A`，且骨架能过 `check-brief-parseable`（exit 0）。
即「补 #CRITERIA」这一项**在代码上已成立**——缺的是**没有任何测试钉住它**：改坏 heredoc
无人知（D718 实证：骨架填实后该字段丢失 → `brief_parser.parse_criteria`=None →
brief 无法被 resolver 最终回退选中）。
修法：alloc-task-id.test.sh §9 断言「骨架含 #CRITERIA + brief_parser 可取 + 骨架过 brief 契约门」
+ **反向验证**（剥掉该字段必须红）。另在 alloc 的 heredoc 上方加「不可删」注释锚。

**两处测试自身缺陷（本单自修）**：
1. §9 初版复用共享 `$TMP_DIR/task-briefs`（跨运行残留）→ 断言命中**上次运行**的旧文件 = 假绿；
   且对共享固定路径 `rm -rf` 会误删并发 session 的文件。改为本段专属 `mktemp -d` 做新分配。
2. `$CRIT（` / `$PARSED（` 未加花括号 → 见下「存量债」。

**残留清理**：`.claude/task-briefs/` 下 D721-D740 共 **20 份未跟踪骨架**（mtime 14:47:37–14:47:46，
**早于** D718 守卫提交 14:55:50 → 属修复前历史残留，非守卫失效）。按「认领: <agent> +
<本任务在哪一层> + D333 决策四步」三重判据精确识别后删除（留 md5 清单），
**未触碰** D720（CTO 真实 brief）与 D725-D660（他人真实 spec）。

## 执行期额外发现（本单登记，未修/已修分列）

1. **【已修·写集内】`LC_ALL=C.UTF-8` 下 `$VAR（` 被 bash 3.2 解析为变量名**：
   `scripts/control-tower/alloc-task-id.sh:247` `$BRIEF_FILE（` 在 ct-test-gate 导出的 locale 下
   报 `unbound variable`（污染 stderr）。改为 `${BRIEF_FILE}`。
   **物理判据**：`LC_ALL=C.UTF-8 bash -c 'A=1; echo "$A（x）"'` → `A?: unbound variable`；
   默认 locale 与 `LC_ALL=C` 均正常 → 仅 C.UTF-8 + bash 3.2(macOS) 触发。
2. **【未修·写集外】同类全仓扫描命中 45 处**（`$VAR` 紧跟非 ASCII 且未加花括号）：
   写集内 16 处、其中 15 处在他人 `tests/control-tower/*.test.sh`（多为断言**失败分支**的消息，
   平时不执行 → 潜伏：真失败时会被 `unbound variable` 覆盖真实原因）。
   建议机制级防线（归 CTO 域）：加 `check-unbraced-vars.sh` 扫描器，而非逐处打补丁。
3. **【未修·写集外，已在本单触发】`product-lines.test.py` 测试有副作用**：
   `TestRefreshAll` 直接 subprocess 跑 `refresh-all.sh` → 改写了 3 个**跟踪**产物
   （`product-progress.json/html`）+ 写入证据目录（3 份 `test-2026-09-13*.json`）。
   本单已全部还原/删除并留证。与 backlog #464/D657「测试零副作用」同族。
4. **【未修·写集外】该套件从未接入 CI**（`.github/workflows/ci.yml` 的密封清单无它）→
   本单 ②③ 的回归网同样不会在 CI 跑；且套件存量 2 红
   （`test_real_repo_capital_line_zero_of_eight` / `test_range_expansion_and_mapping`，
   与 backlog 记录一致，非本单引入——已用 origin/main 基线代码复跑证明）。

## 反向验证（每项独立证明，缺一不可）

- ① 替身修好前该用例红（`expected +0 to be 1`）；修好后 4/4 绿
- ② 新测试放在 origin/main 代码上 → 4 条红；放回本单代码 → 全绿；真实数据状态差异 0 条
- ③ 旧代码路径无机器维度；新代码 mac/win 两机同日 → 两个不同文件名（且记录内 machine 字段正确）
- ④ 剥掉 SKEL 的 `#CRITERIA` → §9 三条断言红（工具曾实测）；还原 → 20/20 绿
- ④ 真仓残留 20 份 → 0 份；`.claude/task-briefs/` D720/D725-spec 完好未动
