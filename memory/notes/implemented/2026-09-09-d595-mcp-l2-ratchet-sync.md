# D595 MCP 哨兵簇 L2 化 — CT-64 棘轮基线同步决策（implemented）

> 日期: 2026-09-09 | 任务: D595 | 提出者: DSH 编码 session（glm-5.3-flash）
> 状态: implemented（随 feat/d595-mcp-auth 同 commit 落地；K3 审计 D595 时覆盖本决策）

## 背景

CT-64（PR #441，2026-09-08 合入）建立 L1 跨层违规棘轮：
`tests/architecture/l1-cross-layer-baseline.txt`（file=count 粒度，68 处存量）
+ `tests/architecture/check-architecture-gate.test.ts`（EXPECTED_68 逐行 file:line 钉死 +
基线总数断言 toBe(68)）。

D595 spec（编写于同一日）§5.1 声明写集时包含了 graphstore-unify.test.ts 的棘轮同步
（"计数 11→10，否则实现必红"），但未包含 CT-64 的两个新文件——PR #441 合入晚于 spec
写集定稿（D524 教训"上游合入必漂移"的变体：**上游合入的棘轮会钉死下游要修的行**）。

## 冲突

D595 DS3 要求修复 mcp/index.ts 哨兵簇 6 处跨层违规（:123/:138/:156/:169/:140/:141）。
不同步 CT-64 棘轮的后果（二者物理必居其一）：
1. gate test EXPECTED_68 钉线落空 → tests/architecture 红 → 违反 DS9 零新失败（铁律 36）；
2. D601 存量 4 处（:193/:203/:231/:236）随处理器原样迁移至 tool-definitions.ts 后，
   基线无该文件条目 → file=count 实际>基线 → SYNO_CI=1 exit 1 → CI 硬阻断。

## 决策

随 D595 同步棘轮（与 spec 已明示的 graphstore-unify 同类"非 red 用例，随修复同步的
棘轮基线更新"）：

1. `l1-cross-layer-baseline.txt`：mcp/index.ts 三段计数移除（L1→L3 ×4 真修；
   L1→L4 ×2 = 1 真修 + 1 迁移；L1→L5 ×4 = 1 真修 + 3 迁移），tool-definitions.ts
   承接迁移计数（L1→L4 1 + L1→L5 3）。**68 → 62**（基线自身治理语义"每修复一处须
   同步下调本文件对应计数；全部清零后本文件删除"的首次执行）。
2. `check-architecture-gate.test.ts`：EXPECTED_68 → EXPECTED_62（6 死引脚删除 +
   4 迁移引脚改指 tool-definitions.ts 现行号）+ 总数断言 toBe(68→62)。
3. 顺手修正 gate test 中 3 个已被 D599 合并打红的 diagnosis.ts 钉线
   （:161→:207、:215→:261、:505→:561——main @ 373adf10 上该测试已红，非 D595 引入）。

## 参考系

第一性原理（棘轮的语义是"存量只减不增"，修复方下调计数是其定义的一部分，而非越权）+
CT-64 基线文件头注释（同步下调是治理顺序的显式要求）+ D286 先例（graphstore 棘轮随修复
同步 12→11→10）。收敛：无分歧。

## 落地证据

- 基线总数 62：`grep -E "=\d+$" tests/architecture/l1-cross-layer-baseline.txt | awk -F= '{s+=$2} END {print s}'`
- gate test 绿：`npx vitest run tests/architecture/check-architecture-gate.test.ts`
- CI 等价：`SYNO_CI=1 SYNO_DIFF_BASE=origin/main bash scripts/pre-commit-check.sh` exit 0
