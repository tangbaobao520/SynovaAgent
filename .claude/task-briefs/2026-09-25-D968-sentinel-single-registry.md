# Task Brief: D968 统一哨兵注册为单入口（栈式两支 PR）

> 生成: 2026-09-25 | 分支 PR-A: `feat/D968a-sentinel-single-registry`（**base = `feat/D967b-sentinel-alert-stats` @ `80045321`**）
> 规划 PR-B: `feat/D968b-*`（win 域，**base = PR-A**，栈式）
> 工作树: `.synova-wt-D968` | 认领: sentinel-coder-b | 独立复核: sentinel-verifier（task-4）
> as any: 0 | 任务号推断: `DID_RE=[Dd]\d+` ⇒ `D968a` 正确解析为 **D968**

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图

本任务在 **L3 洞察层**（`src/sentinel/**`）与 **L2 编排接线**（`src/init/**`、`src/agent/synova-agent.ts`）交界，
目标是规格 `SYNOVA-哨兵体系-最终版-v1-20260925.md` **§三「注册体系统一为单入口」**与**十环④**。

规格 §三冻结的**三条注册路径**（原文）：
```
路径1: builtins.ts → 扫 src/sentinel/adapters/*-sentinel.ts
路径2: file-driven-loaders.ts → 扫 extensions/sentinels/*/manifest.json（主力）
路径3: runner.ts → 运行时再次 loadSentinels()（冗余）
⇒ 同一哨兵可能被注册两次；「三重注册入口需要统一为文件驱动模式」
```

### b) 文件审计（全部开工前实测，非记忆）

```
src/sentinel/adapters/           5 个文件：3 个 @deprecated（cpc / goal-alignment / integration-health）
                                 + cash-flow-sentinel.ts（@state: real，真哨兵）
                                 + helpers.ts（工具函数，无 -sentinel 后缀，被 cash-flow import）
src/sentinel/builtins.ts         路径1 实现：filenameToExportKey() + readdirSync 扫 adapters/
src/sentinel/runner.ts           路径3：`:426-428` clearSentinelCache() + loadSentinels() → self-check.expectedCount
src/init/file-driven-loaders.ts  路径2：loadSentinels() + registerLoadedSentinels()
src/agent/synova-agent.ts:78-79  路径1 调用点（await registerBuiltinSentinels()）— **win 域**
tests/sentinel/**                mac 域（含 d751 夹具、registry.test.ts、adapters/cpc-sentinel.test.ts）
tests/integration/**             **win 域**（wiring-integration / knowledge-feedback 调用或断言语义路径1）
```

### c) 决策

- 已有覆盖 → **复用**：路径2 即唯一入口，已 45 加载 / 0 error（实测）；`SENTINELS_FIXTURE_DIR`（D751 注入缝）复用作 Done③ 证明手段。
- 无覆盖 → **新建**：`tests/sentinel/registry-single-entry.test.ts`（Done②③ 判据，原无任何断言）。
- 冲突 → **取消**：D968 不与 D965（`extensions/sentinels/**`）、D967（`src/store/**`）重叠；`runner.ts` 与 D967 严格串行（本卡 base 已含 D967b）。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策参考系
参考：第一性原理 + 本仓实测。**结论**：判据一律动态取数；「单入口」的验收必须能**只加目录不改代码**。

### b) memory / 历史教训
- **院方禁令 4**：「不要顺手修注册 bug 就宣布'第二套哨兵活了'（修 1 行能让键名对上 3 个）」——
  本卡实测**该禁令前提成立**：`filenameToExportKey()` 剥掉 `-sentinel.ts` 后**从不拼回 `Sentinel` 后缀**
  ⇒ 路径1 现为 `scanned: 4 / registered: 0`（**空转但已上膛**），加 1 个后缀即可激活 3–4 个。
- **D966 工艺发现**：方法层"看起来对"≠真读到 ⇒ 判据必须落在可证伪处。
- **铁律 37**：Dead code 入仓库即违规 ⇒ 裁剪需删文件，不能只"不调用"。

### c) 执行约束
- 重型验证串行；生产库只读；ACK 逐次向队长申请；D708 `write_set` 逐文件精确。

## Q2: 范围 — 正确的最简方案

做什么（PR-A，mac 域）：
- src/sentinel/adapters/cpc-sentinel.ts
- src/sentinel/adapters/goal-alignment-sentinel.ts
- src/sentinel/adapters/integration-health-sentinel.ts
- src/sentinel/builtins.ts
- src/sentinel/runner.ts
- tests/sentinel/registry-single-entry.test.ts
- tests/sentinel/self-check-h1-cross-source.test.ts
- tests/sentinel/builtins.test.ts
- tests/sentinel/adapters/cpc-sentinel.test.ts
- tests/sentinel/durationms-regression.test.ts

做什么（PR-B，win 域，base = PR-A）：
- src/init/file-driven-loaders.ts
- src/agent/synova-agent.ts
- tests/integration/wiring-integration.test.ts
- tests/integration/knowledge-feedback.integration.test.ts

不做什么（含文件路径）：
- 不改 `extensions/sentinels/**`（D965 域）；不新增任何哨兵（禁令 3）
- 不"修 1 行键名"救活路径1（禁令 4）
- 不改 `scripts/audit/**`、`docs/synova/audit-reports/**`、`.github/workflows/ci.yml`、
  `scripts/pre-commit-check.sh`、`scripts/control-tower/**`
- 不改 `data/synova.db`（只读）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`npx vitest run tests/sentinel/registry-single-entry.test.ts` 与 `…/d751-new-sentinel-e2e.test.ts`（真实管线三环）
处理：加载器语义推导目录数 → 加载数等式 → 注册数等式 → 夹具注入缝（**必须 clearSentinelCache**）→ 1 目录判别性
结果：`docs/synova/product-lines/evidence/D968-sentinel-single-registry-evidence.md`（原始输出 + 改坏即红）

## 架构层: L3（哨兵域）+ L2 接线（PR-B）— PR-A 单 mac 域，PR-B 单 win 域

## Done 标准
1. adapters/ 逐件裁定（3 裁 + cash-flow/helpers 各自裁定并写明依据），消费点清理 + grep 零引用
2. `loadSentinels()` 加载数 = 加载器语义目录数（动态等式，与 45/43 无关）+ 两条反例防线
3. 十环④下半：注册数 = 加载数（补断言）
4. `SENTINELS_FIXTURE_DIR` 夹具根 1 目录 ⇒ 加载数 = 1（判别性）+ 去掉 clear/去掉 env 双红证
5. 至少一条穿生产入口的"只加目录不改代码"证明（D751 三环：发现/路由/派发）
6. 全部硬编码哨兵数改动态取数
