---
north-star:
  服务用户: 编码 session（Claude Code / DSH 编码线程）——照 dev doc 写测试必须绿，不能照旧契约写出红测试
  服务场景: K3 切片 A 审计发现 D518 dev doc §2/§5.1/§7 仍写旧 prod 契约 `node dist/src/index.js`，而实现实为 `dist/backend.mjs` + 包内 Electron node 模式——文档是"最后一个过时副本"
  模块终态: D518 dev doc 的 prod 契约描述与 origin/main 实现完全一致（buildCommand('prod') = process.execPath + dist/backend.mjs + ELECTRON_RUN_AS_NODE=1 注入）；照 dev doc §7 写测试不会红
  对齐北星: PRODUCT-BRIEF §二（FDE 零 Node 前提——prod 必须包内 Electron node 模式跑 bundle）
  完成标准: grep `node dist/src/index.js` 于 D518 dev doc 零结果；grep `dist/backend.mjs` 覆盖 §2/§5.1/§7；与 backend-spawn.cjs:70/172 实测一致
  当前进度: D518 dev doc 三处已回填（commit 532aaa41）；本 dev doc 为 D524 独立规格（FIX 任务自含），task-state/D524.json impl 回填（77bdaa8c）
---

<!--
  SYNOVA-IMPL-DSH-D524: D518 dev doc prod 契约漂移返修（K3 C2 条件项）
  状态: dev doc | 2026-08-25 | 优先级 P1 | slice: L1-A
  权威: K3 切片 A 审计 P1-1（docs/synova/audit-reports/2026-08-25-D517-D519.md）+ 派单-D524-devdoc-fix-20260825.md + AGENTS.md 铁律 0-2/4
  依赖: D518 实现已在 main（7c040315 + 0a4d2962，PR #166 合入）——本任务只修 dev doc 描述，不碰实现
  并行: 无（dev doc 单文件独占；编码指令随本 spec 交付）
-->

# D524: D518 dev doc prod 契约返修（M7 漂移闭环）

> 一句话问题: D518 dev doc 三处仍写旧 prod 契约 `node dist/src/index.js`，实现实为 `dist/backend.mjs` + 包内 Electron node 模式（backend-spawn.cjs:70/172）——**照 dev doc §7 写测试现在会红**（文档是最后一个过时副本）。

## 1. Authority Doc Verification

- **派单**: `docs/synova/coordination/派单-D524-devdoc-fix-20260825.md`（CTO，K3 C2 条件项）+ `docs/synova/coordination/派单-C1C2-遗留闭环-20260825.md`（C2 段）
- **审计依据**: `docs/synova/audit-reports/2026-08-25-D517-D519.md` P1-1（"照 dev doc §7 写测试现在会红"，M7 文档-实现漂移，归因 devdoc）
- **实现事实源**: `electron/backend-spawn.cjs`（origin/main）——buildCommand('prod') = `{ bin: process.execPath, args: ['dist/backend.mjs'] }`（实测 :70）；ensureBackend prod 分支 `env.ELECTRON_RUN_AS_NODE = '1'`（实测 :172）；测试断言 `prod.bin === process.execPath` + `prod.args === ['dist/backend.mjs']`（实测 tests/electron/backend-spawn.test.ts:234-235）
- **铁律**: AGENTS.md 铁律 0-2（spec→test→impl→wire，spec 必须与实现同契约）/ 铁律 4（入口→交互→结果，dev doc 即入口）/ S-2（声称=实现+验收，禁 overclaim）

## 2. Problem Statement

D518 dev doc（SYNOVA-IMPL-DSH-D518-single-entry-20260824.md）三处仍写旧 prod 契约：

| 位置 | 旧契约（返修前） | 实现实为（origin/main 实测） |
|------|-----------------|------------------------------|
| §2（:32） | `node dist/src/index.js` | `dist/backend.mjs` + 包内 Electron node 模式 |
| §5.1（:55-58） | 同上（buildCommand prod 锁 `node dist/src/index.js`） | `{ bin: process.execPath, args: ['dist/backend.mjs'] }`（backend-spawn.cjs:70）+ `ELECTRON_RUN_AS_NODE=1` 注入（:172） |
| §7（:76） | 测试断言 `buildCommand('prod') === node dist/src/index.js` | 测试断言 `prod.args === ['dist/backend.mjs']`（backend-spawn.test.ts:235） |

**后果**：照 dev doc §7 写测试会红——文档是"最后一个过时副本"（brief Q2、task-state evidence、build-synova.cjs 头注释、runbook 均已同步新契约，漂移被约束在 dev doc 单文件内）。本任务=回填三处 + 全文档旧契约清零 + 验证可复现。

## 3. Q0-Q4

**Q0 拼图**: L1 交互层 Electron 引导的 dev doc 返修。不改任何实现（electron/、tests/ 均已验证，K3 物理复跑通过）。扩展 D518 dev doc 的契约描述。
**Q1 调研**: 业界=文档-代码双源真理：以磁盘事实为唯一契约源（D504 F4 教训：注释漂移被 K3 抓）；Anthropic=可验证文档（机器可 grep 的契约，非 prose）；开源实证=Electron 官方 `app.isPackaged` + 包内二进制 node 模式（FDE 零 Node 前提）。**参考: 磁盘事实为准 + grep 物理验证 + 第一性原理（dev doc 契约 = 实现的镜像，镜像必须逐字一致）+ 结论：三处回填 + 全文档 grep 清零 + 行号标注实测值。**
**Q2 范围**: 做什么——§2/§5.1/§7 回填新契约（含 ELECTRON_RUN_AS_NODE=1 注入说明、行号 :70/:172 实测）、§7 断言规范同步（prod.args === ['dist/backend.mjs']）、其他章节旧契约引用一并回填（§1 审计基线注记、§4 缺口②、§10 DS3）。不做什么——不改 electron/、tests/、scripts/audit/（写集红线）；不重写 D518 dev doc 结构（11 节骨架与 gatekeeper 要求保持）。
**Q3 验收**: 入口=派单 C2 验证命令；处理=grep 旧契约清零 + grep 新契约落位 + gatekeeper；结果=派单两项验证物理通过 + dev-doc-gatekeeper exit 0。
**Q4 契约与测试**: 见 §7。

## 4. Current State（2026-08-25 实测，origin/main 6afff275）

- `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D518-single-entry-20260824.md`（返修前）: §2（:32）`prod: ensureBackend spawn node dist/src/index.js`；§5.1（:55-58）写集表 buildCommand prod = `node dist/src/index.js` + 测试断言同旧；§7（:76）`buildCommand('prod') === node dist/src/index.js`；另有 §1（:27）审计基线 F4 描述、§4（:48）缺口②、§10（:105）DS3 含旧契约引用（全部待回填）。
- `electron/backend-spawn.cjs`（origin/main，实现事实源）: `buildCommand(mode)` prod 分支 `{ bin: process.execPath, args: ['dist/backend.mjs'] }`（:70，注释说明 D518 prod 运行时修复三重阻塞：ESM 无扩展名 import / asar 内依赖不可达 / 原生模块 ABI 不匹配）；`ensureBackend` prod 模式注入 `env.ELECTRON_RUN_AS_NODE = '1'`（:172）+ `SYNOVA_DB_PATH`（:174，src/config.ts:90 消费）。
- `tests/electron/backend-spawn.test.ts`（origin/main）: :234 `expect(prod.bin).toBe(process.execPath)`；:235 `expect(prod.args).toEqual(['dist/backend.mjs'])`；:239 F4 回归用例（注释零裸 dist/index.js 残留）。
- `docs/synova/runbooks/desktop-dev-prod.md`（origin/main）: 已同步新契约（"spawn 包内 Electron 二进制（node 模式）跑 dist/backend.mjs，ELECTRON_RUN_AS_NODE=1 注入"）。
- 缺口: 仅 D518 dev doc 单文件未同步（K3 P1-1 实锤）。

## 5. What We Build

### 5.1 写集 (1 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D518-single-entry-20260824.md | 修改 | ①§2（:32）prod 契约改 `dist/backend.mjs` + 包内 Electron node 模式（ELECTRON_RUN_AS_NODE=1，backend-spawn.cjs:70/172 实测）；②§5.1 写集表四行回填（main.cjs F4 注释→dist/backend.mjs；backend-spawn.cjs 行改述 D518 三项 prod 运行时修复；tests 行断言 prod.bin===process.execPath + prod.args===['dist/backend.mjs']；runbook 行 spawn 描述同新契约）；③§7（:76）断言规范同步 `prod.args === ['dist/backend.mjs']`；④顺带回填 §1 审计基线注记（演进说明）、§4 缺口②、§10 DS3（全部为 dist/backend.mjs）——已提交 532aaa41 |
| task-state/D524.json | 修改 | impl 段回填（commit 532aaa41 + 77bdaa8c、evidence: grep 清零 + 三处回填 + gatekeeper exit 0）——已提交 77bdaa8c |

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 改 electron/（backend-spawn.cjs、main.cjs） | 实现已验证（K3 物理复跑通过），写集红线 |
| 改 tests/（backend-spawn.test.ts） | 测试已按新契约断言（:234-235），写集红线 |
| 改 scripts/audit/ | K3 专属，审计红线 |
| 重写 D518 dev doc 章节结构 | 11 节骨架 + gatekeeper C1-C6 要求保持 |
| 改 D518 dev doc front-matter | 北星锚定不动（纯契约描述回填） |

## 7. Test Requirements

**契约（本返修的机器可验断言）**: D518 dev doc 中 prod 契约描述必须与 origin/main 实现逐字一致。

| 层 | 用例 | red 前提 |
|:---|------|------|
| L1 单元 | grep `node dist/src/index.js` 于 D518 dev doc → 零结果 | 任何残留旧契约字面量即红 |
| L1 单元 | grep `dist/backend.mjs` 于 D518 dev doc → 覆盖 §2/§5.1/§7 | 三处任一缺失即红 |
| L1 单元 | grep `prod.args === ['dist/backend.mjs']` → §7 断言规范存在 | §7 断言仍写旧式即红 |
| L2a 接线 | 行号 :70/:172 与 origin/main backend-spawn.cjs 实测一致（`git show origin/main:electron/backend-spawn.cjs`） | 行号凭记忆写错即红 |
| L2b 降级 | gatekeeper 不因回填破坏 C1-C6（exit 0） | 写集表/章节结构被破坏即红 |

**verify 命令（K3 可独立重跑）**:
```bash
DOC=docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D518-single-entry-20260824.md
grep -c "node dist/src/index.js" "$DOC"          # 期望 0
grep -n "dist/backend.mjs" "$DOC" | wc -l          # 期望 ≥3（§2/§5.1/§7 覆盖）
grep -c "ELECTRON_RUN_AS_NODE" "$DOC"              # 期望 ≥1（注入说明）
grep -n "prod.args === \['dist/backend.mjs'\]" "$DOC"  # 期望 §7 断言
git show origin/main:electron/backend-spawn.cjs | sed -n '70p;172p'  # 与 doc 描述一致
bash scripts/control-tower/dev-doc-gatekeeper.sh "$DOC"  # 期望 exit 0
```

## 8. Wiring Verification

| 变更 | 生产调用点（实测方法） |
|------|------|
| D518 dev doc 契约回填 | 消费方=编码 session（照 §7 写测试）+ K3 复审（grep 两项）——无生产代码调用点（文档返修任务，dev doc 即交付物）；接线验证 = 派单验证命令物理复跑（§7 verify 命令） |
| 新契约行号 :70/:172 | `git show origin/main:electron/backend-spawn.cjs` 实测（:70 buildCommand prod / :172 ELECTRON_RUN_AS_NODE）——非凭记忆 |

## 9. Architecture Layer

L1 交互层（dev doc 描述 Electron 引导契约）。文档返修不触代码层——backend-spawn 经 HTTP /api/healthz 探活 L1 API，契约描述与 D518/D504 口径一致，零跨层。

## 10. Completion Standard

1. **DS1**: `grep -c "node dist/src/index.js"` D518 dev doc → **0**（旧契约清零，派单验证命令 1）
2. **DS2**: `grep -n "dist/backend.mjs"` D518 dev doc → 覆盖 **§2/§5.1/§7**（派单验证命令 2，实测 9 处含三节）
3. **DS3**: §7 断言规范 = `prod.args === ['dist/backend.mjs']`（backend-spawn.test.ts:235 实测一致）
4. **DS4**: ELECTRON_RUN_AS_NODE=1 注入说明在 §2/§5.1 出现（backend-spawn.cjs:172 实测）
5. **DS5**: dev-doc-gatekeeper.sh exit 0（C1-C6 ALL PASS）
6. **DS6**: task-state/D524.json impl 段回填（commit + evidence）+ 写集外零改动

> DS1-DS6 逐项标注，禁静默缺项（S-10）。

## 11. Auth Doc References

- docs/synova/coordination/派单-D524-devdoc-fix-20260825.md（CTO 派单，验证命令原文）
- docs/synova/coordination/派单-C1C2-遗留闭环-20260825.md（C2 段，写集约束）
- docs/synova/audit-reports/2026-08-25-D517-D519.md（K3 P1-1，M7 漂移判定）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D518-single-entry-20260824.md（被返修对象）
- electron/backend-spawn.cjs（origin/main :70/:172 实现事实源）
- AGENTS.md（铁律 0-2/4，S-2）

## 12. 自检清单（dev-doc 侧，K3 可核）

- [x] 派单两项验证命令物理复跑：grep 清零（0）+ 三处回填（§2/§5.1/§7 覆盖）
- [x] 行号 :70/:172 读 origin/main 实测（非凭记忆——D381 接线纪律）
- [x] 测试断言同步（prod.args === ['dist/backend.mjs']，test:235 实测）
- [x] 写集 2 条目（D518 dev doc 修改 + task-state 回填）；不碰 electron/、tests/、scripts/audit/
- [x] gatekeeper exit 0（C1-C6）
- [x] 编码指令随 spec 交付（dev-doc-delivery 三件套）
