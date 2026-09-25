# D968 证据 —— 统一哨兵注册为单入口（栈式两支 PR）

> 全部数字为**命令原始输出逐字粘贴**（禁手写）。组装方式：脚本读取当日实跑输出内联。
> 任务 D968 ｜ 执行 sentinel-coder-b ｜ 独立复核 sentinel-verifier（task-4）
> **PR-A 分支** `feat/D968a-sentinel-single-registry` ｜ **base = `feat/D967b-sentinel-alert-stats` @ `80045321`**
> **PR-B** `feat/D968b-*`（win 域，**base = PR-A**，栈式）｜ 写集 = 两 PR 并集（见 task-state/D968.json）

---

## 0. 栈式结构声明（必读：PR-A 单独不绿是**联合验收点**，非事故）

| 项 | 内容 |
|---|---|
| PR-A（mac 域） | `src/sentinel/adapters/**`（裁 5 件）、`src/sentinel/builtins.ts`、`src/sentinel/runner.ts`、`tests/sentinel/**` |
| PR-B（win 域，base = PR-A） | `src/agent/synova-agent.ts`（去路径1 调用点）、`tests/integration/knowledge-feedback.integration.test.ts`（换断言）｜**hygiene 可选、默认不动**：`src/init/file-driven-loaders.ts`、`tests/integration/wiring-integration.test.ts` |

**两条栈式硬约束（CTO 已批，逐条留痕）**：
1. **PR-A 必须保留 `registerBuiltinSentinels` export**（改 no-op + `log.warn`）：其调用点 `src/agent/synova-agent.ts:78-79` 属 win 域、归 PR-B 移除；若 PR-A 直接删 export，PR-A 单独 `TS2305` 编译不过。⇒ 本 export 是**有意的过渡态**，**不是遗留死代码**。
2. **PR-A 单独看必红**：`tests/integration/knowledge-feedback.integration.test.ts` 的 2 条断言硬编码 adapters/ 存在性 ⇒ 裁撤后必红。该文件的修改属 **PR-B**（win），不在 PR-A 写集。**两支 PR 的证据都须声明这一点。**

**PR-B 预期失败的原始输出（PR-A 树上实跑）**：

```text
     × adapters 目录存在 >= 3 个哨兵文件 3ms
     × registerBuiltinSentinels 日志显示扫描到 4 个文件 4ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/integration/knowledge-feedback.integration.test.ts > Gate 4: sentinel registration > adapters 目录存在 >= 3 个哨兵文件
 FAIL  tests/integration/knowledge-feedback.integration.test.ts > Gate 4: sentinel registration > registerBuiltinSentinels 日志显示扫描到 4 个文件
 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 25 passed (27)
```

⇒ 2 红**正是那两条**硬编码断言，非意外崩；⇒ `wiring-integration.test.ts` **16/16 绿** ⇒ PR-B **不必改它**。

## 1. 基线与环境

```bash
$ git rev-parse HEAD ; git rev-parse --abbrev-ref HEAD ; git diff --stat origin/feat/D967b-sentinel-alert-stats..HEAD
```

```text
80045321fe1194e10ef8810065e9a8116ca3a796
feat/D968a-sentinel-single-registry
--- 与 D967b 齐平检查（应为空）---
[end]
```

## 2. PR-A 变更集

```bash
$ git status --porcelain | sort ; echo --- ; git diff HEAD --stat
```

```text
 M src/sentinel/builtins.ts
 M src/sentinel/runner.ts
 M tests/sentinel/builtins.test.ts
 M tests/sentinel/durationms-regression.test.ts
?? .claude/task-briefs/2026-09-25-D968-sentinel-single-registry.md
?? tests/sentinel/registry-single-entry.test.ts
?? tests/sentinel/self-check-h1-cross-source.test.ts
D  src/sentinel/adapters/cash-flow-sentinel.ts
D  src/sentinel/adapters/cpc-sentinel.ts
D  src/sentinel/adapters/goal-alignment-sentinel.ts
D  src/sentinel/adapters/helpers.ts
D  src/sentinel/adapters/integration-health-sentinel.ts
D  tests/sentinel/adapters/cpc-sentinel.test.ts
--- diff --stat ---
 src/sentinel/adapters/cash-flow-sentinel.ts        | 167 ---------------------
 src/sentinel/adapters/cpc-sentinel.ts              |  84 -----------
 src/sentinel/adapters/goal-alignment-sentinel.ts   |  56 -------
 src/sentinel/adapters/helpers.ts                   | 106 -------------
 .../adapters/integration-health-sentinel.ts        |  99 ------------
 src/sentinel/builtins.ts                           | 114 +++++++-------
 src/sentinel/runner.ts                             |  16 +-
 tests/sentinel/adapters/cpc-sentinel.test.ts       |  15 --
 tests/sentinel/builtins.test.ts                    | 120 +++++++++++----
 tests/sentinel/durationms-regression.test.ts       |  70 ++++++++-
 10 files changed, 223 insertions(+), 624 deletions(-)
```

## 3. Done① —— adapters/ 逐件裁定（每条附实测依据）

### 3.1 清点与标注（开工前实测）

```text
cash-flow-sentinel.ts             @state: real（**无 @deprecated**）← 真哨兵 ｜ @deprecated 出现次数 = 0
cpc-sentinel.ts                   @deprecated（1）
goal-alignment-sentinel.ts        @deprecated（1）
integration-health-sentinel.ts    @deprecated（1）
helpers.ts                        @state: real，**无 -sentinel 后缀**（工具函数）
```
⇒ 规格 §三「5 个旧版哨兵，**全部 @deprecated**」**不成立**（实测仅 3 个）。

### 3.2 裁定 + 依据

| 件 | 裁定 | 依据（实测） |
|---|---|---|
| cpc / goal-alignment / integration-health | **裁剪** | `@deprecated`；导出名全仓引用数 **0** |
| `cash-flow-sentinel.ts` | **裁剪** | description 明写「现金流**预测/跑道/应收逾期**」，与文件驱动的 `extensions/sentinels/cash-runway/`（「监控**现金跑道与应收逾期**风险」，同 expert 域 `fundamental-efficiency`、同 P0、同 `requiredDataSources: sog_graph`）**同子领域重复**；且**生产上从未生效**（路径1 键名不匹配 ⇒ registered: 0）、**无任何静态 importer**；「迁移为文件驱动」会新增目录 ⇒ 触**禁令 3** |
| `helpers.ts` | **随裁剪** | importer 为上述 4 件；删后 `discoverTeams`/`swapDbForContext`/`checkTeam` 引用数 **0** ⇒ 保留即违**铁律 37** |

**零引用回执（铁律 37 的物理证明）**：

```text
cpcSentinel                    引用数=0
goalAlignmentSentinel          引用数=0
integrationHealthSentinel      引用数=0
cashFlowSentinel               引用数=0
helpers                        引用数=20
discoverTeams                  引用数=1
swapDbForContext               引用数=0
checkTeam                      引用数=0
```

### 3.3 🔴 为何**关停**而非**修复**（院方禁令 4 的实证；CTO 明令禁止修键名推导）

**明令**：CTO 2026-09-25 裁定 —— **禁止修改 `filenameToExportKey()`**（修它 = 激活院方禁令 4 点名的「第二套哨兵」）。本卡处置：**随路径1 整体删除**，未修改其逻辑。

**改动前实况（`git checkout 80045321 -- src/sentinel/builtins.ts` 复现，跑完已还原）**：

```text
{"level":50,..."filename":"cash-flow-sentinel.ts","key":"cashFlow","msg":"[builtins] cash-flow-sentinel.ts 未导出哨兵对象 (key=cashFlow)"}
{"level":50,..."filename":"cpc-sentinel.ts","key":"cpc","msg":"[builtins] cpc-sentinel.ts 未导出哨兵对象 (key=cpc)"}
{"level":50,..."filename":"goal-alignment-sentinel.ts","key":"goalAlignment","msg":"[builtins] goal-alignment-sentinel.ts 未导出哨兵对象 (key=goalAlignment)"}
{"level":50,..."filename":"integration-health-sentinel.ts","key":"integrationHealth","msg":"[builtins] integration-health-sentinel.ts 未导出哨兵对象 (key=integrationHealth)"}
{"level":30,..."registered":0,"total":0,"cronCount":0,"scanned":4,"msg":"[builtins] 哨兵自动注册完成"}
registerBuiltinSentinels() 返回值 = undefined （签名 Promise<void> ⇒ undefined 是设计内）
路径1 实际注册数 = 0
路径1 注册名单 = 
路径2 manifest 数 = 45
⇒ 旧 builtins.test.ts 的 for 循环遍历 registry.list() 长度 = 0 ⇒ 循环体执行次数 = 0
```

⇒ 路径1 实测 **scanned: 4, registered: 0** = **空转但已上膛**：4 个推导键（cashFlow/cpc/goalAlignment/integrationHealth）与实际导出（均以 `Sentinel` 结尾）全部对不上 ⇒ 只需 1 行即可激活 3–4 个 ⇒ **禁令 4 的前提成立，故必须关停而非修复**。
⇒ 另：规格 §三「registerBuiltinSentinels() 返回 undefined（**未定因**，探针不足）」为**伪异常** —— 其签名即 `Promise<void>`，恒 resolve undefined。

## 4. Done② —— 加载数 = 目录数（加载器语义口径，与 43/45 无关）

```bash
$ npx vitest run tests/sentinel/registry-single-entry.test.ts
```

```text
 ✓ tests/sentinel/registry-single-entry.test.ts (7 tests) 492ms
     ✓ 十环④下半: 注册数 = 加载数（errors 为空），且 registry.count() 一致  462ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

覆盖（7 用例）：正常路径（动态等式 + errors 空 + 前置 >0）｜反例 A（朴素顶层口径偏大）｜反例 B（递归口径 = 语义数 + _extinct 退役件 + 根级 extension-manifest，**全推导式**）｜十环④下半（注册数 = 加载数）。
🆕 反例 B 派生发现：`extensions/sentinels/manifest.json` 是**根级 extension-manifest**（`$schema=extension-manifest-v1`，非哨兵 manifest）；loader 只扫目录 ⇒ 不参与加载，但会被递归数进来（当前递归口径 = **58**，离 43/45 都远）。

## 5. Done③ —— 注入缝 cache 陷阱（判别性 + 自动反证 + 双红证）

**判别性断言**：夹具根 **1 个目录 ⇒ 加载数必须 = 1**（而非主目录数）。**自动反证**：不 `clearSentinelCache()` ⇒ 拿回主目录加载数。

### 5.1 红证 ①：去掉 clear（并预热缓存复现危险路径）

```text

 RUN  v4.1.8 /Users/wane/SynovaAgent/.synova-wt-D968

 ❯ tests/sentinel/registry-single-entry.test.ts (7 tests | 1 failed) 618ms
     ✓ 正常路径: 加载数 === 加载器语义目录数，且 errors 为空 16ms
     ✓ 反例 A（假红防线）: 朴素顶层目录口径 ≠ 加载数 —— 差值 = 被跳过的 shared/_* 目录数 5ms
     ✓ 反例 B（假红防线）: 递归数 manifest ≠ 加载数 —— 差值 = _extinct 退役件 + 根级 extension manifest 16ms
     ✓ 十环④下半: 注册数 = 加载数（errors 为空），且 registry.count() 一致  562ms
     × 判别性: 夹具根 1 个目录 ⇒ 加载数必须 = 1（而非主目录数） 9ms
     ✓ 自动反证: 不 clear 缓存 ⇒ 拿回主目录加载数（「env 后设即生效」为假） 6ms
     ✓ 边界: 夹具根不存在 ⇒ degraded 且有 errors（不静默返回空集合当"通过"） 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/sentinel/registry-single-entry.test.ts > D968 Done③ — 注入缝 cache 陷阱（判别性断言 + 自动反证） > 判别性: 夹具根 1 个目录 ⇒ 加载数必须 = 1（而非主目录数）
AssertionError: expected [ Array(45) ] to have a length of 1 but got 45

- Expected
+ Received

- 1
+ 45

 ❯ tests/sentinel/registry-single-entry.test.ts:188:23
    186|     const { sentinels, errors } = loadSentinels();
    187|
    188|     expect(sentinels).toHaveLength(1);
       |                       ^
    189|     expect(sentinels[0].manifest.name).toBe(FIXTURE_SENTINEL_NAME);
    190|     expect(errors).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
   Start at  00:08:25
   Duration  848ms (transform 502ms, setup 0ms, import 102ms, tests 618ms, environment 0ms)
```

### 5.2 红证 ②：去掉 env 注入

```text

 RUN  v4.1.8 /Users/wane/SynovaAgent/.synova-wt-D968

 ❯ tests/sentinel/registry-single-entry.test.ts (7 tests | 1 failed) 765ms
     ✓ 正常路径: 加载数 === 加载器语义目录数，且 errors 为空 6ms
     ✓ 反例 A（假红防线）: 朴素顶层目录口径 ≠ 加载数 —— 差值 = 被跳过的 shared/_* 目录数 3ms
     ✓ 反例 B（假红防线）: 递归数 manifest ≠ 加载数 —— 差值 = _extinct 退役件 + 根级 extension manifest 10ms
     ✓ 十环④下半: 注册数 = 加载数（errors 为空），且 registry.count() 一致  726ms
     × 判别性: 夹具根 1 个目录 ⇒ 加载数必须 = 1（而非主目录数） 12ms
     ✓ 自动反证: 不 clear 缓存 ⇒ 拿回主目录加载数（「env 后设即生效」为假） 5ms
     ✓ 边界: 夹具根不存在 ⇒ degraded 且有 errors（不静默返回空集合当"通过"） 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/sentinel/registry-single-entry.test.ts > D968 Done③ — 注入缝 cache 陷阱（判别性断言 + 自动反证） > 判别性: 夹具根 1 个目录 ⇒ 加载数必须 = 1（而非主目录数）
AssertionError: expected [ Array(45) ] to have a length of 1 but got 45

- Expected
+ Received

- 1
+ 45

 ❯ tests/sentinel/registry-single-entry.test.ts:188:23
    186|     const { sentinels, errors } = loadSentinels();
    187|
    188|     expect(sentinels).toHaveLength(1);
       |                       ^
    189|     expect(sentinels[0].manifest.name).toBe(FIXTURE_SENTINEL_NAME);
    190|     expect(errors).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
   Start at  00:08:26
   Duration  1.01s (transform 646ms, setup 0ms, import 100ms, tests 765ms, environment 0ms)
```

### 5.3 红证清理 + 还原后绿侧

```text
[INJECTED-RED 残留]
0
[还原后全绿]
 Test Files  34 passed | 1 skipped (35)
      Tests  247 passed | 1 skipped (248)
```

## 6. B2 —— 路径3 去掉后 H1 跨源语义保留（判别性夹具 + 红证）

**改动**（`src/sentinel/runner.ts` 的 `collectHealthState`）：去掉 `clearSentinelCache()` + 运行期重扫，改为**只读路径2 启动时发布的加载数快照**。**`expectedCount` 仍是磁盘 manifest 源**，与 `registryCount`（注册表源）**保持跨源**。

```text
 ✓ tests/sentinel/self-check-h1-cross-source.test.ts (4 tests) 12ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

**判别力**：用真实加载管线造「磁盘 2 个 manifest、只注册成功 1 个」的漂移 ⇒ 跨源 `{1,2}` **H1 必告警**；同源 `{1,1}` **H1 静默**（检测力归零）。

### 6.1 红证 ③：把快照改成同源（registry.count()）⇒ 断言必须变红

```text

 RUN  v4.1.8 /Users/wane/SynovaAgent/.synova-wt-D968

 ❯ tests/sentinel/self-check-h1-cross-source.test.ts (4 tests | 1 failed) 25ms
     ✓ 夹具自证: 真实管线里 2 个 manifest 只有 1 个注册成功（磁盘源 ≠ 注册源） 16ms
     × ✅ 跨源: {registryCount:1, expectedCount:2} ⇒ H1 **必须告警**（漂移检出） 5ms
     ✓ 🔴 反证（同源 = 检测力归零）: {registryCount:1, expectedCount:1} ⇒ H1 **静默** 1ms
     ✓ 边界: 全未注册 {0, 2} ⇒ H1 critical（loader 全挂，fail-loud） 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/sentinel/self-check-h1-cross-source.test.ts > D968 B2 — H1 跨源判别性夹具（保留跨源语义，禁 ratio ≡ 1） > ✅ 跨源: {registryCount:1, expectedCount:2} ⇒ H1 **必须告警**（漂移检出）
AssertionError: expected 0 to be greater than 0
 ❯ tests/sentinel/self-check-h1-cross-source.test.ts:134:24
    132|     // INJECTED-RED-C: 同源
    133|     const ids = h1Findings(baseState({ registryCount: 1, expectedCount…
    134|     expect(ids.length).toBeGreaterThan(0);
       |                        ^
    135|     expect(ids.some((id) => id.startsWith('self-check-H1-'))).toBe(tru…
    136|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  00:08:28
   Duration  375ms (transform 92ms, setup 0ms, import 138ms, tests 25ms, environment 0ms)
```

## 7. ③ 空壳假绿修复（tests/sentinel/builtins.test.ts）—— 改前/改后对照

### 7.1 改前（旧版，`git checkout 80045321 -- tests/sentinel/builtins.test.ts` 实跑）

```text
✓ registerBuiltinSentinels > Given 注册后 → 每个哨兵有唯一 ID 和有效类别 121ms
✓ registerBuiltinSentinels > Given 两次调用 registerBuiltinSentinels → 覆盖旧哨兵不抛异常 1ms
Test Files  1 passed (1) ｜ Tests  2 passed (2)

但 registry.list() 长度 = 0 ⇒ for 循环体执行次数 = 0 ⇒ **0 条断言真的跑过**；第二用例只断言 count() >= 0 ⇒ 恒真。
```

### 7.2 改后（A/B/C 三类真实断言）

```text
 ✓ tests/sentinel/builtins.test.ts (3 tests) 5ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
- **A no-op**：空注册表 + 调用 ⇒ 注册数仍 0（前置断言证明 0 非空集合巧合，并断言扫描源目录**已不存在**）
- **B 不扰动**：已注册 2 个 ⇒ 调用后仍 2（不清空不替换）
- **C 幂等**：两次调用 + 计数恒 0，并**以一次真实注册反向确认接口可写**

## 8. tsc —— PR-A 单独编译校验（栈式硬约束；令牌经队长批准）

```bash
$ npx tsc --noEmit --pretty false   # CI 同款白名单过滤后判定
```

```text
[全部错误数]
28
[过滤 CI 白名单后]
0
[错误文件分布]
   4 extensions/sentinels/_extinct/competitive-moat-structural/aggregate.ts
   3 extensions/sentinels/_extinct/market-lifecycle/aggregate.ts
   3 extensions/sentinels/_extinct/competitive-dynamics/aggregate.ts
   3 extensions/sentinels/_extinct/adaptation-velocity/aggregate.ts
   2 src/server.ts
   2 extensions/sentinels/_extinct/structural-change/aggregate.ts
   2 extensions/sentinels/_extinct/connector-coverage/aggregate.ts
   2 extensions/sentinels/_extinct/competitive-moat-perceptual/aggregate.ts
   2 extensions/sentinels/_extinct/capital-turnover/aggregate.ts
   2 extensions/sentinels/_extinct/capital-structure/aggregate.ts
   2 extensions/sentinels/_extinct/capital-efficiency/aggregate.ts
   1 src/connectors/ima.ts
```

⇒ 我的改动文件**零类型错误**；CI 白名单过滤后 = **0** ⇒ PR-A 在 CI 的 tsc 步骤通过。

## 9. 🆕 写集外发现：scripts/check-deprecated-mapping.sh 是**预先存在的恒真门禁**（非本批裁撤所致）

**CTO 定性，我独立复现（两条并列）**：

```text
--- 队长实测 ---
grep -qL ... | wc -l  =  0
--- 我（本卡）复现：临时 checkout 基线 adapters/ 后实跑 ---
grep -qL ... | wc -l  =  0
grep -L  ...          =  src/sentinel/adapters/cash-flow-sentinel.ts
grep -c @deprecated 各文件:
  cash-flow-sentinel.ts          = 0
  cpc-sentinel.ts                = 1
  goal-alignment-sentinel.ts     = 1
  integration-health-sentinel.ts = 1
```

**根因**：`grep -q` **不写任何 stdout** ⇒ 管道给 `wc -l` 恒得 **0** ⇒ `UNDOCUMENTED` 恒 0 ⇒ 门禁**永远报 ✅**。
**关键**：在 **adapters/ 仍存在**的基线树上该门禁**已经恒报 ✅**，而 `cash-flow-sentinel.ts` 明明 `@deprecated` 计数 = 0 ⇒ **预先存在的恒真门禁**，**不是本批裁撤导致退化**。
**处置**：属 **win 域**（`scripts/`），扩写集必然跨域 ⇒ **不动**，登记为**本批派生待立卡**。

## 10. 对卡面的修正（实测与描述不符，逐条登记）

| 原卡/规格措辞 | 实测 | 处置 |
|---|---|---|
| 规格 §三「adapters/ 5 个旧版哨兵，**全部 @deprecated**」 | 仅 **3** 个 `@deprecated`；`cash-flow` 为 `@state: real`；`helpers` 非哨兵 | 已按队长改卡执行（3 裁 + 2 逐件裁定） |
| 规格 §三「registerBuiltinSentinels() 返回 undefined（**未定因**）」 | **伪异常**：签名 `Promise<void>` | 登记 |
| 原卡「去 runner 冗余」+ PR-B 列 `file-driven-loaders.ts` | **冗余全在 `runner.ts`**（路径3）；`file-driven-loaders.ts` **本来就是唯一入口**，无冗余可删 | PR-B 默认不动该文件 |
| 原卡 PR-B 含 `wiring-integration.test.ts` | 该文件 no-op 后 **16/16 通过**，不必改 | 降为 hygiene 可选 |

## 11. 自检 5 问

1. **接线检查**：路径1 关停后**唯一入口 = 路径2**（`src/init/file-driven-loaders.ts` → `registerLoadedSentinels()`）；由 Done②③ 与 D751 三环测试（发现/路由/派发，真实管线）证明。`registerBuiltinSentinels` export 保留是**栈式编译约束**（见 §0/§3.3），非死代码。
2. **异常处理**：`runner.ts` 的 `loadSentinels()` 失败仍 `log.warn` + 保守取 0（fail-closed 不误报 H1），未新增空 catch；`builtins.ts` no-op 无失败路径；`log.warn` 使过渡态**可见不静默**（铁律 11）。
3. **类型安全**：`as any` / `as never` / `as unknown as` = **0**（新增测试仅用内联类型断言 + `unknown` + 类型守卫）。
4. **测试质量**：新增 11 个 `it`（registry-single-entry 7 + self-check-h1 4），改写 3 个；覆盖正常/降级/边界/反例/金丝雀；三条**改坏即红**均贴原始输出。
5. **残留清理**：`INJECTED-RED` = 0；`src/sentinel/adapters/` 与 `tests/sentinel/adapters/` 已删除且零引用；未留空目录；未改 `.claude/bypass.log`。

## 12. 未清项

1. **预先存在的恒真门禁** `scripts/check-deprecated-mapping.sh`（§9）—— win 域，待立卡。
2. **`runner.ts` 自检改用启动快照的代价**（CTO 已裁定的权衡，如实登记）：自检不再感知「启动后才恢复的 loader」；启动期快照为 0 时 H1 因 `expectedCount > 0` 门控被跳过（fail-closed 不误报）。
3. **PR-B 未开工**（win 域）：`src/agent/synova-agent.ts` 去调用点 + `knowledge-feedback` 换断言；PR-A 单独 2 红属联合验收点。
4. **加载数在 PR-A 内不变**（45）：本卡只关停路径1/路径3，不改文件驱动哨兵集合 ⇒ 与 D965 的 45→43 无耦合。
5. **D969 规则窗口**：PR-A 只碰 `src/sentinel/**` + `tests/sentinel/**`（均 mac）⇒ 单域，不受规则窗口影响（交付时点 `origin/main` 仍**未含** D9xx 补的 ownership 规则——实测 `ownership.yaml` 仅有 `src/sentinel/**`(L55) 与 `tests/sentinel/**`(L58)）。

---

# 附：PR-B（win 域，**base = PR-A**）证据

> 分支 `feat/D968b-win-single-entry` ｜ base = `feat/D968a-sentinel-single-registry` @ `16c49cea`
> 严格必需 **2 个文件**（`hygiene 可选默认不动` 项未动，见 §0）

## B.1 改动与依据

| 文件 | 改动 | 依据 |
|---|---|---|
| `src/agent/synova-agent.ts` | 去掉 `registerBuiltinSentinels()` 调用点（原 :78-79）+ 旧注释，改为说明「路径1 已关停、唯一入口 = 路径2」 | 关停路径1 的实现侧在 PR-A；**调用侧属 win 域**，须 PR-B 收 |
| `tests/integration/knowledge-feedback.integration.test.ts` | Gate 4 两条断言**换向**：原「adapters 目存在 >= 3 个 `-sentinel.ts` 且含 `goal-alignment-sentinel.ts`」+「日志显示扫描到 4 个文件」⇒ 改为「路径1 源目录已删除」+「文件驱动单入口：加载数 = 目录数（动态取数）」 | 原断言**方向与新架构相反**（它在断言第二套哨兵存在）；且硬编码 45/43 违 Done⑤ |

## B.2 行为中性论证（移除调用点为何不改变运行期注册结果）

```bash
$ npx vitest run tests/integration/knowledge-feedback.integration.test.ts tests/integration/wiring-integration.test.ts
```

```text
 ✓ tests/integration/knowledge-feedback.integration.test.ts (11 tests) 35ms
 ✓ tests/integration/wiring-integration.test.ts (16 tests) 188ms
 Test Files  2 passed (2)
      Tests  27 passed (27)
```

（PR-A 树上同两文件为 **2 红**；PR-A + PR-B 叠加后 **全绿** ⇒ 栈式联合验收点闭合）

**路径2 确实在生产启动链上**（实测）：`src/server.ts:86` 委托 `Bootstrap` → `src/deploy/bootstrap.ts` **Phase 3b** 调用 `initFileDrivenLoaders()` → `registerLoadedSentinels()`。
⇒ 去掉 `synova-agent.ts` 的路径1 调用后，哨兵仍由路径2 注册；且路径1 原本实测 `registered: 0` ⇒ **行为中性**。

**🆕 附带发现（登记，未动）**：`src/server.ts:15` `import { initFileDrivenLoaders } from './init/file-driven-loaders';` —— 该 import **全文 0 次调用**（`grep -c "initFileDrivenLoaders()" src/server.ts` = 0），真正的调用在 Bootstrap Phase 3b ⇒ **未使用的死 import**。属 `src/server.ts`（win），**不在 PR-B 写集** ⇒ 未动，登记待立卡。

## B.3 PR-B 变更集

```text
$ git status --porcelain
```

```text
 M src/agent/synova-agent.ts
 M tests/integration/knowledge-feedback.integration.test.ts
```

## B.4 回归

```text
$ npx vitest run tests/sentinel/          # PR-B 不碰 sentinel 域，仅作无波及确认
 Test Files  34 passed | 1 skipped (35)
      Tests  247 passed | 1 skipped (248)
```

## B.5 未清项（PR-B）

1. **未重跑 `tsc --noEmit`**：重型令牌为 PR-A 申请并已交回；PR-B 的 `src/` 改动为**纯删除**（去掉一个动态 import + 注释），**未新增任何类型面** ⇒ 类型风险判为极低。如需我复跑，请再给令牌。
2. `src/server.ts:15` 死 import（见 B.2）—— win 域、非写集，待立卡。
3. `src/init/file-driven-loaders.ts`、`tests/integration/wiring-integration.test.ts` 按裁定**默认不动**（hygiene 可选）。

---

# 附：§C 口径更正与上游裁定（提交后回填，含原表述保留）

## C.1 🔧 更正：D2 登记门禁**不是 CI 红**——本地会拦、CI 空扫集恒过

> **原表述（保留留痕，已作废）**：「PR-A 的 D2 会让 CI 硬红；四份 evidence 未登记 ⇒ 批级阻断。」

**更正后（本卡独立实跑复现，与队长实跑一致）**：
D2 的扫描集 = **untracked 的 `.md/.yaml`** + **staged 新增（`--diff-filter=A`）的 `.md/.yaml`**（`doc-registry-gate.sh` 的 `while read` 输入来自 `{ git ls-files --others --exclude-standard; git diff --cached --name-only --diff-filter=A; }`）。
⇒ **CI checkout 后两者皆空 ⇒ 空扫集 ⇒ 恒过**。本地看到红，是**本地暂存态**所致，**不等于 CI 红**。

**实跑（PR-A 工作树，已提交、`git status --porcelain` = 0，即 CI 口径）**：
```text
$ git ls-files --others --exclude-standard | grep -E '\.(md|yaml)$' | wc -l   →  0
$ git diff --cached --name-only --diff-filter=A | grep -E '\.(md|yaml)$' | wc -l   →  0
$ bash scripts/doc-system/doc-registry-gate.sh
  ── 汇总: 检查 0 个文档，0 个未登记 ──
  ✅ 登记门禁通过          [exit=0]
```
另：该 evidence md 在 PR-A 提交后**已被 git 跟踪** ⇒ D2「只拦新不拦旧」⇒ 永不再命中。

**⇒ 结论改写**：D2 的登记与否是**治理一致性问题（要不要补登 DOCS-REGISTRY）**，**不是阻断项**。
CTO 已裁定：给 `docs/synova/product-lines/evidence/**` **加排除规则**（属 CTO 单写者域，本卡不动）。

## C.2 🔧 D734 的定性（CTO 已裁定由 CTO 修调用方）

**判定**：两支 PR 在 CI 上看到的 `18 文件 > 12 / 跨域` 是**栈式伪影**，非本卡贡献。**证据**：
`pre-commit-check.sh:1516` 调 `check-pr-budget.sh --quiet`，**base 死取 `origin/main`**（脚本支持 `--base` 但调用方不传，亦无 env 覆写）。

**两个口径对照（同一份改动，原始输出并列）**：
```text
# 口径 A —— 门禁实际使用（base = origin/main，含下栈 D967b 的改动）
❌ ① 变更文件数 18 > 上限 12 —— 拆 PR（禁调高上限）
❌ ② 变更跨域 —— 一个 PR 只许一个域（D733 ownership.yaml）
   win  .claude/plan.json / src/agent/post-diagnosis-processor.ts / src/store/** …
   mac  src/sentinel/baseline-store.ts / src/sentinel/runner.ts …

# 口径 B —— 本卡真实 PR base
#   PR-A：--base origin/feat/D967b-sentinel-alert-stats
  ✅ ① 变更文件数 7 ≤ 上限 12      ✅ ② 变更单域: PASS 6 个文件同域: mac   ✅ ③ 落后 0
  ✅ PASS PR 预算内（7 文件）
#   PR-B：base = PR-A ⇒ 2 个业务文件，均 win
  ✅ PASS 2 个文件同域: win（无归属 0，域判定豁免 0）
```
**CTO 裁定**：`pre-commit-check.sh:1516` 改为传 `--base "${SYNO_PR_BASE:-origin/main}"`，CI 侧导出 `SYNO_PR_BASE=origin/$GITHUB_BASE_REF` ⇒ 栈式 PR-B 的 base 恰为 PR-A 分支。**属 CTO 单写者域，本卡不动。**

## C.3 生产级证据（本卡"单入口"结论的最强支撑，队长点名要求写明）

**路径2（`initFileDrivenLoaders`）确实在生产启动链上**：
```text
src/server.ts:86   import { Bootstrap } from './deploy/bootstrap';
src/deploy/bootstrap.ts   Phase 3b:
      const { initFileDrivenLoaders } = await import('../init/file-driven-loaders');
      await initFileDrivenLoaders();            ⇒ file-driven-loaders.ts → loadSentinels() + registerLoadedSentinels()
```
⇒ **「唯一入口 = 文件驱动」在生产路径成立**；去掉 `synova-agent.ts` 的路径1 调用点是**行为中性**
（路径1 原本实测 `registered: 0`，见 §3.3）。

**反向登记（未动，属 win、非写集）**：`src/server.ts:15` 的
`import { initFileDrivenLoaders } from './init/file-driven-loaders';` 全文 **0 次调用**
（`grep -c "initFileDrivenLoaders()" src/server.ts` = 0）⇒ **未使用的死 import**；真正调用在 Bootstrap Phase 3b。待立卡。
