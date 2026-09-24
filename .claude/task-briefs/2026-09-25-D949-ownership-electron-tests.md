# Task Brief — D949 P0-a+ 治理：tests/electron/** + tests/ga-collab-*.test.ts → mac

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
治理/门禁面（ownership 域判定表），不动 src/**、不动渲染层产品代码。触发：CTO 2026-09-24 放行（R1 裁定，覆盖 D948 派单 §四 P0-a 原案）。
文件审计：`docs/synova/coordination/ownership.yaml` 现行 `rules:` 无 `tests/electron/**`、无 `tests/ga-collab-*.test.ts` 规则 → 二者落 `**` 兜底判 win；而被测主体 `electron/**`（表内 mac）+ `electron-renderer/**`（表内 mac）均 mac。实测：`python scripts/control-tower/check-ownership.py tests/electron/d948-identity-chain.test.ts tests/ga-collab-logic.test.ts tests/ga-collab-ui.test.ts` → 三件全 `win`。
**补登记动机**：D949 写入 `docs/synova/coordination/ownership.yaml` + `.github/CODEOWNERS` 的既有认领 brief 是 `2026-09-24-D935-M1-ownership-presets-域修正.md`（实测 claims=2）→ `commit-msg-check.sh` 的 D328「提交声明(D949)与暂存文件归属(D935)不一致」硬阻断（exit 1，`synova-commit --check` 实测）。本 brief 即该门禁要求的认领凭据（认领制 D296 / D328），非新增交付面。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
参考：第一性原理（测试是源码的从属物，域归属应跟随被测主体而非测试所在目录）+ 仓库实证（同族先例：`tests/sentinel/**`→mac「哨兵体系核心=Mac，其测试随域」、`tests/doc-system/**`→mac「测试随门禁归属」、`tests/project/**`→mac「测试随被测工具归属」、`tests/control-tower/**`→mac）。
历史：D782（tests/doc-system 落兜底误判 win）/ D806（tests/project）/ D914（三类文档）——同一表缺口族，本次是第四例；D948 侦察实测「P0-a 原案（仅 `tests/electron/**`）不足以放行切片 B」。
决策参考系：参考：Anthropic/第一性原理 + 结论=规则用 glob 覆盖族而非逐文件列名（CTO R1 原话：「只写一件下张卡还会撞」）。

## Q2: 范围 — 正确的最简方案
做什么（逐条精确路径）：
- docs/synova/coordination/ownership.yaml — `rules:` 内新增两条 mac 规则：`tests/electron/**` 与 `tests/ga-collab-*.test.ts`，落点置于 `electron-renderer/**` 之后（即 `**` 兜底行之后，表语义「按顺序求值，最后匹配者胜出」）
- .github/CODEOWNERS — 由 `python scripts/control-tower/check-ownership.py --emit-codeowners` **整文件重跑**（测试 §7 逐字节 drift 断言；禁止手改）
- task-state/D949.json — 本卡状态（域豁免）
- .claude/task-briefs/2026-09-25-D949-ownership-electron-tests.md — 本 brief（认领凭据，D328 依据）

不做什么（含文件路径）：
- 不改 tests/control-tower/check-ownership.test.sh — 先跑后判：改后实测 58/58 绿，断言无需随规则更新（§8 只固定断言 5 条既有显式规则，§7 为 CODEOWNERS 逐字节 drift）
- 不改 scripts/control-tower/check-ownership.py — 解析算法 / `resolve_owner` 语义 / 兜底语义一律不动
- 不改 scripts/audit/check-gates-v2.py — K3 红线（审计脚本其他角色禁碰）
- 不改 vitest.config.ts — D948 切片 B 领地，与本卡零重叠
- 不改 electron-renderer/src/lib/api.ts — D948 切片 B 领地，与本卡零重叠

另：本卡**不新增** `domain_neutral` 豁免（P0-b 方案已被否：打补丁不治病）；`ownership.yaml` 的 `**` 兜底与 `default: true` 保持原样。

## 写集
| 文件 | 类别（理由） |
| --- | --- |
| `docs/synova/coordination/ownership.yaml` | task（新增两条 mac 规则） |
| `.github/CODEOWNERS` | task（--emit-codeowners 重跑产物） |
| `task-state/D949.json` | task（本卡状态，域豁免） |
| `.claude/task-briefs/2026-09-25-D949-ownership-electron-tests.md` | task（本 brief，认领凭据） |

## Q3: 验收 — 入口 → 交互 → 结果
入口：`python scripts/control-tower/check-ownership.py <文件...>`（单域判定）；`bash tests/control-tower/check-ownership.test.sh`（治理金测试）
处理：ownership.yaml 新增两条 mac 规则 → `--emit-codeowners` 重跑 CODEOWNERS → 逐判据复跑域判定与金测试
结果：D948 切片 B 的 8 文件写集判 `✅ PASS 8 个文件同域: mac`；治理金测试 `✅ 全部通过: 58 项` / EXIT=0；CODEOWNERS 仅 +2 行

## 架构层
治理/门禁（docs/synova/coordination + .github + tests/control-tower；不触五层依赖图）

## Done 标准
- [ ] 切片 B 8 文件写集判同域 mac — verify: `python scripts/control-tower/check-ownership.py electron-renderer/src/stores/auth-session.ts electron-renderer/src/stores/ga-collab.ts electron-renderer/src/components/RightPanel.tsx electron-renderer/src/components/LoginPanel.tsx electron-renderer/src/lib/api.ts electron-renderer/src/stores/app-store.ts tests/electron/d948-identity-chain.test.ts tests/ga-collab-logic.test.ts` → exit 0 且含「PASS 8 个文件同域: mac」
- [ ] 治理金测试全绿 — verify: `bash tests/control-tower/check-ownership.test.sh` → `✅ 全部通过: 58 项` 且 EXIT=0
- [ ] CODEOWNERS 与 `--emit-codeowners` 逐字节一致（drift 门禁 §7 在上一项内覆盖）
- [ ] `tests/electron/` 13 件连带改判 mac（CTO 2026-09-24 已批准）
- [ ] 判别性：删掉两条新规则后同一命令必红（改坏即红，证明判据真读数据）— verify: 沙箱副本删两条规则 → `python scripts/control-tower/check-ownership.py <8 文件> --yaml <mutant>` → exit 1 且含「跨域」
