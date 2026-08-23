---
north-star:
  服务用户: K3 审计员（复审只看三点：commit message / 交付声明 / 实际产物一致 + DS11 DESCOPE 显式 + 25/25 不回归）+ 创始人（Merge 决策依据）——痛点：D504 的 commit message 声称"electron-builder --dir 实测产出 release/mac/SynovaAgent.app"，实际是静态 grep 断言 + 无 release/ 产物——审计无法区分"真实交付"与"声称"，信任建立的前提是诚实声明（S3-5 自诊断可信度同源）
  服务场景: K3 复审 D504 返修——读到 commit message / 交付声明 / task-state note / GS-01 断言，四方必须指向同一事实；"实测/产物/物理证据"类声称必须带可 grep 的 artifact 路径，"未做"必须显式 DESCOPE
  模块终态: D504 交付声明可信——声称=事实可机器校验（M2 防线强化到 commit message 层）；未做项显式 DESCOPE（M7）；执行证据链闭合（M4）；D504 从 CONDITIONAL PASS 转复审通过并入 main
  对齐北星: PRODUCT-BRIEF.md §七「我犯过的错——在写代码模式下工作」的工程侧映射（诚实交付是产品信任的地基）+ D382 审计闭环铁律（K3 结论可核）+ K3 报告 L4 缺口收割（M2/M4/M7/M8 强化既有防线，零新机制）
  完成标准: K3 复审三点全过——①commit message / 交付声明 / 实际产物三方一致（grep 可验）②DS11 显式 DESCOPE（或实测完成）③electron 测试 25/25 + GS-01 语义不倒退
  当前进度: D504 = CONDITIONAL PASS（K3 2026-08-23）；F1/F2 P1 + F3/F4/F5 P2；D504 代码在 feat/d504-impl（5f08f82b）未合 main；本任务基于 feat/d504-impl 出返修分支
---

<!--
  SYNOVA-IMPL-DSH-D510: D504 Electron 审计返修（F1/F2 P1 + F3/F4/F5 P2）
  状态: dev doc | 2026-08-23 | 优先级 P1（D504 合并阻塞项）
  权威文档: K3 审计报告 docs/synova/audit-reports/2026-08-23-D504-D505.md（223efb05）+ D510 派单 79df2466 + D382 审计闭环铁律 + AGENTS.md 铁律 0-2/11/24/31/47/48
  依赖: D504 实现（feat/d504-impl 5f08f82b，未合 main）——本分支基于它
  并行: 无（独占 feat/d510-audit-remediation；改 D504 交付声明面）
-->

# SYNOVA-IMPL-DSH-D510: D504 Electron 审计返修

> 一句话问题: D504 交付的**声称与事实不一致**——commit message 称「electron-builder --dir 实测产出 release/mac/SynovaAgent.app（DS4 物理证据）」，但 task-state note 诚实写「DS4 受限（~/.electron-gyp 沙箱拒写）→ CI 执行 → GS-01 替代」，commit 内无 release/ 产物，GS-01 的 L1-1 断言实为 `grep -q extraResources` 静态检查。三方矛盾 = M2 声称 vs 事实，D504 被 K3 判 CONDITIONAL PASS，合并被阻塞。本任务让 D504 的交付声明恢复可信（F1/F2 P1 + F3/F4/F5 P2），D382 铁律：另起 FIX 任务，禁改 D504 原分支历史。

## 1. Authority Doc Verification

**来源**: [K3 审计报告](docs/synova/audit-reports/2026-08-23-D504-D505.md)（合入 main 223efb05，F1/F2 全文）

> F1（P1·M2）DS4 声称矛盾：commit message 称「electron-builder --dir 实测产出 release/mac/SynovaAgent.app（DS4 物理证据）」，但 task-state note 称「DS4 受限→CI 执行→GS-01 替代」，且 commit 无 release/ 产物；GS-01 的 L1-1 断言实为静态 grep 配置检查（run.sh `grep -q extraResources`），非真实打包。| F2（P1·M7）DS11 未完成：spec DS11（本地 dmg 产出+安装+双击实测）未做，note「留待 founder-demo」，commit message 未标注 DS11 状态。| F3（P2·M4）pre-commit 门禁处置不明：bypass.log 仅 BLOCKED 无 PASS。| F4（P2·M7）注释漂移：backend-spawn.cjs L12 + main.cjs L123 仍写 dist/index.js，代码实为 dist/src/index.js。| F5（P2·M2）commit message 测试数「契约 10」 vs 实际 backend-spawn 8 用例。

> 复审门槛: D504 的 F1/F2（P1）修复后复审——DS4 需在 CI 产出真实 release/ unpacked 产物证据，或 commit message 降级为「静态配置断言」；DS11 显式 descope 或补 dmg 实测。

**来源**: [D510 派单](docs/synova/coordination/派单-devdoc-D510-20260823.md)（CTO，79df2466）

> 写集约束: 改动面最小——GS-01 断言注释/task-state/交付声明——**不改 electron/*.cjs 逻辑**（25/25 测试不回归是底线）。electron-builder 实跑若选，仅加 scripts/ 辅助脚本不改主进程。验收（K3 复审只看三点）: ①commit message / 交付声明 / 实际产物三方一致 ②DS11 显式 DESCOPE（或实测完成）③electron 测试 25/25 + GS-01 语义不倒退。

**来源**: [D382 审计闭环铁律](task-state/README.md) + [AGENTS.md](AGENTS.md) 铁律 0-2/11/24/31/47/48

> K3 审计出问题 → 一律另起修复任务（FIX D#），禁止直接改原任务。否则证据链混淆——原任务已交付+标记完成，写集已 close；塞回修复 = 污染原交付证据。

## 2. Problem Statement

D504（Electron 桌面端一体化）被 K3 判 CONDITIONAL PASS，两个 P1 阻塞合并：

1. **F1（P1·M2 声称 vs 事实）**：DS4「打包实测」在 commit message 被声称完成，实际未实跑（环境受限），task-state note 已诚实降级但 **commit message 没同步**——三方（message/note/产物）不一致。K3 L4 缺口收割：commit message 的"实测/物理证据"类字眼无机器校验（写集表/DS 有，commit message 没有）。
2. **F2（P1·M7 descope 未标注）**：DS11（dmg+安装+双击实测）未做且未显式 DESCOPE——"留待 founder-demo"只写在 note，交付声明表无记录。

外加三个 P2（F3 门禁证据断裂 / F4 注释漂移 / F5 测试数夸大），一并修。

**根因（K3 L4）**：M2/M4/M7 三个既有模式类在 **commit message 层**无防线——声称的"实测/产物"没有任何机器可 grep 的 artifact 支撑。本任务强化既有防线（不新增机制）：声称必须带 artifact 路径，未做必须显式 DESCOPE。

## 3. Q0-Q4

### 3.1 Q0 定位 — 项目拼图 + 文件审计

**a) 项目拼图**: D504 的交付可信度返修（非新功能）。触及：D504 交付声明面（commit message / task-state / GS-01 注释 / 交付报告）+ 3 处注释（零逻辑）。代码面零改动——D504 的 25/25 测试是底线。

**b) 文件审计**（grep 实测，2026-08-23，feat/d504-impl @ 5f08f82b）:
| 文件 | 现状 | 复用/扩展/新建 |
|------|------|------|
| electron/backend-spawn.cjs | 156 行；L12 注释「prod: node dist/index.js」漂移（代码 L59-62 实为 dist/src/index.js） | 修改（F4 注释） |
| electron/main.cjs | L123 注释同款漂移 | 修改（F4 注释） |
| build-synova.cjs | L42 注释「prod spawn: node dist/index.js」同款漂移 | 修改（F4 注释） |
| scripts/golden-scenarios/GS-01-first-diagnosis/run.sh | 5.5 段断言① L1-1 打包配置 = `grep -q extraResources` 静态检查（K3 判非真实打包） | 修改（F1 注释标注） |
| task-state/D504.json | note 已诚实写 DS4 受限 + DS11 留待 founder-demo；audit=CONDITIONAL_PASS（K3 回填） | 修改（三方一致声明 + DS11 DESCOPE 行） |
| .claude/task-briefs/2026-08-23-D504-electron-desktop-impl.md | D504 交付报告（U4 声明在 spec §10 DS 列表 + note） | 不修改（原任务证据链）；D510 交付报告新建 |
| task-state/D510.json | 壳（claimed，alloc-task-id 建） | 修改（spec 段 → spec_done） |
| tests/electron/backend-spawn.test.ts | 8 用例（契约三路径） | 只读（25/25 回归） |
| tests/electron/desktop-build.test.ts | 15 静态断言 | 只读（25/25 回归） |

**c) 决策**: 返修基于 feat/d504-impl（代码继承），D510 独立 commit——不 rewrite D504 历史（D382）。零新 export、零逻辑改动。

### 3.2 Q1 调研 — 业界最佳实践 / Anthropic 决策链 / memory 教训

**业界最佳实践**:
- **声称-证据绑定（M2 防线）**：可观测性行业"监控的监控"与 K3 建议同源——任何"实测/产物"声称必须附带可复现 artifact（路径 + 校验和），无 artifact 的声称 = 静态断言（措辞降级）。K3 报告 L4 原文：「commit message 的'实测/产物/物理证据'类字眼应强制附带 artifact 路径，且该路径须在 git diff 中可 grep（否则降级为'静态断言'措辞）」。
- **DESCOPE 显式化（M7 防线）**：S-10（D331 审计教训）——"禁止重编号/跳号/静默缺项，缺项显式 descope"已是 spec 层规则，D510 把它下沉到交付声明表（U4）：每行 `DS# | DESCope | 原因 | 何时补 | 谁参与`。
- **Anthropic 基线**：fail-closed（声称无证据 = 降级措辞，不默认通过）+ 机器可验契约（三方一致性 grep 可验）+ 最小机制（只改声明面，零逻辑）。

**memory/ 教训**:
- D331（bypass.log 对账）: 执行证据链必须闭合——本任务提交**必须经 synova-commit**（写 COMMITTED 到 bypass.log），不再出现"BLOCKED 无 PASS"悬空（F3）。
- D316（claim-verifier）: "声称完成"必须物理证明——D504 的 DS4 正是反面教材：配置了 electron-builder ≠ 跑出了产物。
- D451（补记机制）: 提交 hash 必须用真实完整值（本线程 D504/D505 提交时编造 hash 的教训）——返修 commit 走 synova-commit 自动记录。

**收敛**: F1 路线 = 环境判据（能实跑就实跑留 artifact；不能就降级措辞）；F2 = U4 DESCOPE 表 + founder-demo checklist；F3 = synova-commit 证据链；F4/F5 = 措辞/注释对齐。**参考：Anthropic（fail-closed 声称 + 机器可验）+ DeepSeek（最少机制——零逻辑改动）+ 第一性原理（交付可信 = 声称可核）**。

### 3.3 Q2 范围 — 正确的最简方案

**做什么**（对应写集 §5.1）:
1. F1: GS-01 断言①注释加「静态检查非打包验证」标注（降级路线）；或加 release/ 产物断言（实跑路线）——按 §5.2 判据二选一
2. F2: 交付报告 U4 DESCOPE 表（DS11 行）+ founder-demo checklist（4 步人测表）
3. F3: 交付报告补「pre-commit 门禁处置」段 + 本任务提交经 synova-commit
4. F4: 3 处注释 dist/index.js → dist/src/index.js（零逻辑）
5. F5: commit message 测试数口径统一（8+15+2=25）
6. task-state/D504.json note 更新（三方一致声明）+ D510.json spec_done

**不做什么**（详见 §6）: 不改 electron/*.cjs 逻辑；不重打包/不重跑 electron-builder（除非实跑路线）；不改 D504 原分支历史；不动 D505 相关文件（F6 分支卫生归 D505 PR 处理）。

### 3.4 Q3 验收 — 入口 → 交互 → 结果

- **入口**: 编码 session 执行本 spec 写集 → commit（synova-commit）
- **交互**: K3 复审三点机器判定（grep commit message / 交付报告 / task-state / GS-01 注释一致性）+ tests/electron/ 25/25 + GS-01 exit 0
- **结果**: D504 复审通过 → CTO 合并 feat/d510-audit-remediation（含 D504 代码）→ main 上 D504+D510 完成

### 3.5 Q4 契约与测试（铁律 47/48 — 写代码前定义）

**三方一致性契约**（本任务核心机器契约）:
```
@invariant 1: commit message 中的"实测/产物/物理证据"字样 ⟹ 对应 artifact 路径在 git diff 中可 grep
@invariant 2: task-state note 与 commit message 对同一 DS 的判定一致（同措辞：实测 / 静态断言 / DESCOPE）
@invariant 3: GS-01 断言注释标注断言性质（静态检查 vs 真实打包），与 commit message 措辞一致
@degraded   — 环境受限无法实跑 → 措辞降级为「静态配置断言 + 无头契约验证」，不声称实测（fail-closed）
@error      — 无（纯文档/注释变更 + 测试回归）
```

**测试三路径**: L1 回归（25/25 不回归，铁律 48）/ L2a 一致性 grep（三方措辞一致）/ L2c 边界（DESCOPE 表完整行）。

## 4. Current State — 代码审计（2026-08-23 grep/read 实测，feat/d504-impl @ 5f08f82b）

### 4.1 缺陷 A（P1·M2）: DS4 声称矛盾——commit message vs task-state vs 产物三方不一致

- [commit 5f08f82b message](commit 5f08f82b): 「build-synova.cjs: ... **electron-builder --dir 实测产出 release/mac/SynovaAgent.app（DS4 物理证据）**」
- [task-state/D504.json note](task-state/D504.json): 「DS4 electron-builder --dir 受限说明——@electron/rebuild 尝试在 ~/.electron-gyp 重编译 bcrypt（工作区外写入被沙箱拒 + 主仓 node_modules 共享只读），CI 环境（可写 HOME）执行该验证；本地机器判定以 GS-01 断言组替代」
- commit 内无 `release/` 产物（grep 实测：5f08f82b 22 文件无一在 release/）
- [GS-01 run.sh 5.5 段断言①](scripts/golden-scenarios/GS-01-first-diagnosis/run.sh): `grep -q "electron/backend-spawn.cjs" build-synova.cjs && grep -q "dist/renderer" ... && grep -q "extraResources" ...`——静态配置检查，非真实打包
- **结论**: message 声称"实测"，note 诚实"受限"，产物"无"——M2 声称 vs 事实。

### 4.2 缺陷 B（P1·M7）: DS11 未完成且未标 DESCOPE

[task-state note](task-state/D504.json): 「DS11 dmg 手装实测留待 founder-demo」——只写在 note；commit message 与交付声明表（U4）均未标注 DESCOPE。M7 文档-实现漂移。

### 4.3 缺陷 C（P2·M4）: pre-commit 门禁处置证据断裂

[bypass.log](.claude/bypass.log): 「BLOCKED pre-commit FAIL(D504, 05:52:15)」后**无 COMMITTED PASS 亦无 possible-bypass**——commit 5f08f82b（06:24）如何过门禁不可验证（K3 L3-1）。

### 4.4 缺陷 D（P2·M7）: 注释漂移 3 处（dist/index.js vs dist/src/index.js）

| 位置 | 注释现状 | 代码事实 |
|------|------|------|
| [backend-spawn.cjs L12](electron/backend-spawn.cjs:12) | `prod: node dist/index.js` | L59-62 `{ bin: 'node', args: ['dist/src/index.js'] }` |
| [main.cjs L123](electron/main.cjs:123) | `prod: node dist/index.js + SYNOVA_DB_PATH=userData` | ensureBackend 实际传 prod 命令（同上） |
| [build-synova.cjs L42](build-synova.cjs:42) | `prod spawn: node dist/index.js` | extraResources from dist（含 dist/src/index.js） |

### 4.5 缺陷 E（P2·M2）: commit message 测试数夸大

[commit message](commit 5f08f82b): 「tests/electron/ 25/25（**契约 10** 三路径 + 静态断言 15）」——实际 [backend-spawn.test.ts](tests/electron/backend-spawn.test.ts) = **8 用例**（spec 要求 ≥8 达标，仅数字夸大）。口径统一为实际数。

### 4.6 接线现状（真实调用方，grep 实测）

| 符号 | 位置 | 说明 |
|------|------|------|
| `ensureBackend` | electron/backend-spawn.cjs:1-156 | 仅改注释（F4），逻辑不动 |
| GS-01 断言组 5.5 段 | run.sh L97-128 | 断言①加性质标注（F1） |
| task-state/D504.json note | task-state/D504.json | 更新为三方一致声明（F1/F2） |
| electron-builder `--dir` | electron/package.json pack:dir 脚本 | 实跑路线唯一动作点（可执行但环境受限） |

## 5. What We Build

### 5.1 写集 (5 修改 + 3 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/golden-scenarios/GS-01-first-diagnosis/run.sh](scripts/golden-scenarios/GS-01-first-diagnosis/run.sh) | 修改 | F1: 断言①（L1-1 打包配置）注释加「⚠️ 静态检查非打包验证——真实打包产物验证见 founder-demo/CI」（降级路线）；或升级为检查 release/ 产物存在（实跑路线，§5.2 判据） |
| [electron/backend-spawn.cjs](electron/backend-spawn.cjs) | 修改 | F4: L12 注释 `prod: node dist/index.js` → `prod: node dist/src/index.js`（tsc 产物入口，L59 已实现）——仅注释 |
| [electron/main.cjs](electron/main.cjs) | 修改 | F4: L123 注释同款修正——仅注释 |
| [build-synova.cjs](build-synova.cjs) | 修改 | F4: L42 注释同款修正——仅注释 |
| [task-state/D504.json](task-state/D504.json) | 修改 | F1/F2: note 补「三方一致声明」（DS4=静态断言+无头契约 / DS11=DESCOPE）+ audit 字段保持 K3 回填 |
| [.claude/task-briefs/2026-08-23-D510-d504-audit-fix.md](.claude/task-briefs/2026-08-23-D510-d504-audit-fix.md) | 新建 | D510 交付报告：U4 DESCOPE 表 + F3 门禁处置段 + F5 口径说明 + founder-demo checklist（模板见 §5.2） |
| [scripts/electron/build-dir-check.sh](scripts/electron/build-dir-check.sh) | 新建（实跑路线） | `electron-builder --dir` 产物断言：release/ 存在 + ls/du + md5 落 evidence——若环境可实跑才建（§5.2 判据） |
| [docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D510-d504-audit-remediation-20260823.md](docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D510-d504-audit-remediation-20260823.md) | 新建 | 本 dev doc |
| [task-state/D510.json](task-state/D510.json) | 修改 | spec 段 + status → spec_done（流程产物） |

### 5.2 修复模式（编码 session 实现蓝图）

**F1 路线选择判据（二选一，编码 session 开工第一件事）**:

```
判据: 能否实跑 `npx electron-builder --dir`？
  ├─ 可（~/.electron-gyp 可写 + node_modules 可写 + 网络可达 electron 二进制）
  │   → 实跑路线: 跑 pack:dir → release/mac*/SynovaAgent.app 产物
  │     · ls -la + du -sh + md5 三行证据写入 evidence/（不入 git，体积）
  │     · commit message 写「实测产出」+ artifact 路径（可 grep）
  │     · GS-01 断言①升级: 检查 release/ 产物目录存在（本地跑；CI 跳过条件: 无产物构建能力）
  └─ 否（沙箱/权限/网络受限——D504 已证实 ~/.electron-gyp 拒写）
      → 诚实降级路线（本任务默认预期）:
      · commit message 用下方模板（措辞降级为「静态配置断言 + 无头契约验证」）
      · GS-01 断言①注释加「⚠️ 静态检查非打包验证」标注
      · 真实打包验证 descope 至 founder-demo/CI（F2 表）
```

**降级路线 commit message 模板（可直接粘贴，F1+F2+F5 一体）**:

```
docs(D510): D504 审计返修 F1/F2 —— 交付声明诚实化（声称=事实）

- F1 DS4 修正: electron-builder --dir 未实跑（~/.electron-gyp 工作区外写入受限，
  node_modules 共享只读）——commit message 与 task-state 统一为「静态配置断言 +
  无头 spawn 契约验证」（GS-01 断言组 4 条 + tests/electron/desktop-build 15 静态断言），
  真实打包产物验证 descope 至 founder-demo/CI（无 release/ 产物是本任务声明的事实）
- F2 DS11 DESCOPE: dmg 产出+安装+双击实测需真实桌面环境，founder-demo checklist
  已定义（交付报告 §DESCOPE 表），K3 复审见该表
- F4: 注释 dist/index.js → dist/src/index.js（3 处，零逻辑，25/25 不回归）
- F5: 测试数口径统一——backend-spawn 8 + desktop-build 15 + auto-update 2 = 25
- 门禁: 本提交经 synova-commit（bypass.log COMMITTED 证据闭合，F3）
```

**F2 DESCOPE 规范（U4 交付声明表格式）**:

```
| DS# | 判定 | 原因 | 何时补 | 谁参与 |
|-----|------|------|--------|--------|
| DS4 | DESCope（实测→静态断言） | ~/.electron-gyp 工作区外写入受限 + node_modules 只读，electron-builder 无法本机实跑 | founder-demo 或 CI（可写 HOME runner） | 编码 session + CTO |
| DS11 | DESCope | dmg 产出+安装+双击需真实桌面会话，沙箱无 GUI | founder 参与时（checklist 见下） | founder + 编码 session |
```

**founder-demo checklist（DS11 补做路径，4 步人测表）**:

```
□ 1. dmg 产出: npm run pack:mac（electron/ 目录）→ release/SynovaAgent-*-mac.dmg 存在
□ 2. 安装: 双击 dmg → 拖入 Applications → 启动 SynovaAgent
□ 3. 服务自启: 开窗后 60s 内 healthz 转绿（托盘图标 + 对话框可用），无需手动起服务
□ 4. 首诊: WelcomeScreen 发起对话 → consult SSE 流式 → 报告可达（GET /api/sentinel/reports 200）
   · 每步记录: 通过/失败 + 截图或日志摘录 → evidence/founder-demo-D504-<date>.md 入库
```

**F3 门禁处置段（交付报告固定段落模板）**:

```
## pre-commit 门禁处置
- 本任务提交: synova-commit --task-id D510（bypass.log COMMITTED 证据，可 grep）
- D504 原提交 5f08f82b 的 BLOCKED 后处置: [自查结论——若当时走了豁免/降级路径，此处写明；
  若无法追溯，声明「证据缺失，以本任务 COMMITTED 证据为准」——诚实标注（K3 F3 复审点）]
```

**F5 口径统一**: commit message / 交付报告中的测试数为**实际跑出的数字**：backend-spawn 8 + desktop-build 15 + auto-update 2 = 25（以 vitest 输出为准，禁止估算）。

### 5.3 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| F1 路线 | A 实跑 electron-builder --dir（留 artifact）/ B 诚实降级（措辞降级 + DESCOPE） | K3 L4（声称必须带 artifact 路径）+ Anthropic（fail-closed：无证据不声称）+ 环境事实（~/.electron-gyp 拒写已实证） | **判据驱动**——环境可实跑选 A，不可选 B（默认 B，与 D504 同沙箱环境）；两条路线都满足"声称=事实" |
| F4 是否修 | A 修 3 处注释 / B 不动（K3 只列 P2） | 派单"改动面最小"与"声称=事实"精神（F1 同族）+ 零逻辑风险 | **A**——注释是声称的一部分，修正零逻辑风险，25/25 不回归；含 build-synova.cjs:42（K3 未列，同款漂移） |
| 交付声明载体 | A 改 D504 交付报告（.claude/task-briefs/2026-08-23-D504-*.md）/ B 新建 D510 交付报告 | D382（禁改原任务证据链，塞回修复污染原交付） | **B**——D510 独立交付报告（含 DESCOPE 表 + 门禁处置段 + checklist），D504 报告保持原样（K3 可对比） |
| 分支基线 | A 基于 main（无 D504 代码）/ B 基于 feat/d504-impl | D504 代码未合 main，返修对象在 feat/d504-impl | **B**——feat/d510-audit-remediation 基于 feat/d504-impl，PR 合 main 时 D504+D510 一起 |

> 收敛检查：四决策点双参考系指向一致，无分歧。**参考：Anthropic（fail-closed 声称 + 机器可验）+ DeepSeek（最少机制）+ 第一性原理（交付可信 = 声称可核）**。

### 5.4 编码 session 实现时需再确认的项（dev-doc 未知留接口）

1. **F1 路线实测**：开工先跑一次 `npx electron-builder --dir`（或 `npm run pack:dir`，electron/ 目录），5 分钟内失败（~/.electron-gyp 拒写）→ 确认降级路线；成功 → 实跑路线（§5.2 判据）。
2. **F3 追溯**：D504 原提交 BLOCKED 后处置路径——编码 session 自查（git reflog / 会话记录），查不到就诚实声明证据缺失（模板已给）。
3. **D505 的 F6（分支卫生）**：归 D505 PR 处理（用干净版 4fc2183a），本任务不碰——如发现 main 上 D505 合并分支有 D506 混入，提醒 CTO 走 D506 独立 PR。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 不改 electron/*.cjs 逻辑（backend-spawn/main 的 spawn 行为、renderer 接线） | 派单写集约束 + 25/25 测试不回归底线；F4 只改注释 |
| 不重打包 electron-builder 除非实跑路线成立 | 环境受限已实证（~/.electron-gyp 拒写）；降级路线零打包动作 |
| 不改 D504 原分支历史 / 不改 D504 交付报告（.claude/task-briefs/2026-08-23-D504-*.md） | D382 铁律：审计问题另起 FIX 任务，禁改原任务证据链 |
| 不修 F6（D505 分支卫生） | 归 D505 PR（用干净版 4fc2183a），本任务不碰 src/sentinel/ 等 D505 文件 |
| 不修 F7（renderer 108 个 tsc 存量） | 存量债务（main 基线，Q2 排除不重构 renderer UI），非本任务 |
| 不改 GS-01 断言逻辑（只加注释/条件标注） | 断言①是"静态检查"这一事实本身不变，变的是**标注与声明**（声称=事实） |
| 不新增免疫细胞/门禁脚本 | K3 L4 结论：零新 M 类，只强化既有防线（本任务即强化实例） |

## 7. Test Requirements

### 7.1 L1 回归（不新增测试——写集零逻辑改动）

| 用例 | 判定 |
|------|------|
| tests/electron/ 全过 | `npx vitest run tests/electron/` = **25/25**（backend-spawn 8 + desktop-build 15 + auto-update 2）——F4 注释改动零逻辑，必须不回归（铁律 48 回归确认） |
| GS-01 场景 | `bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh` exit 0——断言语义不倒退（只加注释/标注） |

### 7.2 L2a 一致性接线（本任务核心——机器可 grep 的三方一致）

| 断言 | grep 验证 |
|------|------|
| commit message 含降级措辞（「静态配置断言」或「实测产出」+ artifact 路径） | `git log -1 --format=%B | grep -E "静态配置断言|实测产出"` 非零 |
| task-state note 与 commit message 同措辞（DS4 判定一致） | `grep "静态配置断言\|实测" task-state/D504.json` 与 message 语义一致 |
| GS-01 断言①注释标注「静态检查非打包验证」（降级路线） | `grep "静态检查非打包验证" scripts/golden-scenarios/GS-01-first-diagnosis/run.sh` 非零 |
| F4 注释修正 | `grep -c "dist/index.js" electron/backend-spawn.cjs electron/main.cjs build-synova.cjs` = 0（注释不再有裸 dist/index.js） |

### 7.3 L2b 降级

- 环境不可实跑 → 措辞降级（不声称实测）——fail-closed（K3 L4：无 artifact 不声称）
- 门禁：提交经 synova-commit（bypass.log COMMITTED 可 grep——F3 闭合）

### 7.4 L2c 边界

- DESCOPE 表完整性：U4 表含 DS4 与 DS11 两行（缺一行 = 声明不完整）
- 测试数口径：交付报告数字 = vitest 实际输出（8+15+2=25，非估算）
- 降级路线下 release/ 产物确实不存在（`ls release/` 空或目录不存在——声明与事实一致）

### 7.5 场景级

GS-01 保持 exit 0（断言语义不倒退）；无新场景（返修不引入新场景面）。

## 8. Wiring Verification

本任务**无新 export、无新代码逻辑**——接线验证 = 声明一致性（声称↔事实，K3 复审三点）：

| 变更 | 验证方式 |
|------|------|
| run.sh 断言①标注（F1） | `grep -n "静态检查非打包验证\|release" scripts/golden-scenarios/GS-01-first-diagnosis/run.sh` 非零（标注存在） |
| task-state/D504.json note（F1/F2） | `grep -n "DESCOPE\|静态配置断言" task-state/D504.json` 非零 |
| F4 注释修正 | `grep -n "dist/src/index.js" electron/backend-spawn.cjs electron/main.cjs build-synova.cjs` 非零（注释与代码一致） |
| 交付报告（F2/F3/F5） | 文件存在 + U4 DESCOPE 表 2 行 + 门禁处置段（grep "pre-commit 门禁处置\|DESCOPE" .claude/task-briefs/2026-08-23-D510-*.md） |
| 提交证据链（F3） | `.claude/bypass.log` 含本次 COMMITTED 记录（synova-commit 写入，HASH 匹配） |

> ⚠️ 铁律 0-2 WIRE CHECK 精神：本任务无新函数，但"声称↔事实"的每一条都要 grep 物理验证（K3 复审只看三点，全部机器可验）。测试调用不计。

## 9. Architecture Layer

**L1 交互层（Electron 载体）+ 基础设施（交付声明/证据链层）**。理由：
- F4 修改对象 electron/*.cjs = L1 交互层文件，但**只改注释**（JSDoc 契约文本对齐实现），零逻辑、零跨层。
- F1/F2/F3/F5 修改对象 = 交付声明面（GS-01 场景脚本 / task-state / 交付报告 / commit message）——属"声称可信度"基础设施，不触代码架构。
- 不新增 src/ 文件、不新增 import、不产生跨层依赖。架构边界检查应零变化（回归确认）。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. **DS1**: F1 路线定案——降级路线（默认）：commit message 用 §5.2 模板，措辞「静态配置断言 + 无头契约验证」，**不出现「实测产出」字样**；实跑路线（环境允许）：release/ 产物 + ls/du/md5 证据落 evidence + artifact 路径在 commit message 中可 grep
2. **DS2**: GS-01 断言①注释标注断言性质（降级：加「静态检查非打包验证」；实跑：升级 release/ 产物检查）——grep 断言（§8）
3. **DS3**: task-state/D504.json note 与 commit message 措辞一致（DS4 判定：静态断言 / DS11 判定：DESCOPE）——grep 断言
4. **DS4**: F2——D510 交付报告 U4 DESCOPE 表含 **DS4 + DS11 两行**（格式：DS# | DESCope | 原因 | 何时补 | 谁参与）
5. **DS5**: founder-demo checklist 定义（4 步入测表，§5.2）——交付报告内可 grep
6. **DS6**: F3——交付报告「pre-commit 门禁处置」段（含 D504 原提交 BLOCKED 处置自查结论或诚实声明证据缺失）+ 本任务提交经 synova-commit（bypass.log COMMITTED 记录，HASH 匹配）
7. **DS7**: F4——3 处注释修正（backend-spawn.cjs:12 / main.cjs:123 / build-synova.cjs:42）`dist/index.js` → `dist/src/index.js`，注释与代码一致（grep 断言）
8. **DS8**: F5——commit message 与交付报告测试数口径 = **实际数字**（backend-spawn 8 + desktop-build 15 + auto-update 2 = 25，以 vitest 输出为准）
9. **DS9**: tests/electron/ **25/25 回归**（F4 注释改动零逻辑不回归）+ GS-01 exit 0 语义不倒退
10. **DS10**: task-state/D510.json spec 段回填（spec_done + spec.commit）
11. **DS11**: 全量 vitest 通过 + `as any`=0 + 12 组 pre-commit 全过 + 无 --no-verify + `git diff --name-only` 与写集一致（零越界：不碰 src/sentinel、src/cron、D505 文件）
12. **DS12**: 推送 + 分支 feat/d510-audit-remediation 基于 feat/d504-impl（D504 代码继承）+ CI 绿 + `git log origin/feat/d510-audit-remediation..HEAD` 为空
13. **DS13**: 完成报告含**决策记录**（§5.3 四决策点参考系与结论，S-12）+ F1 路线实测结果（跑 pack:dir 的成败记录）——K3 可核

> 交付声明必须覆盖以上 DS1-DS13 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项（S-10）。
> 显式 descope：DS11 的 dmg 实测（原 spec DS11）= founder-demo checklist 补做路径（DS5 定义），本任务不实际安装双击（无真实桌面）。

## 11. Auth Doc References

| 引用 | 路径 |
|------|------|
| K3 审计报告（F1-F7 全文 + L4 缺口收割） | docs/synova/audit-reports/2026-08-23-D504-D505.md（223efb05） |
| D510 派单（CTO，写集约束 + 验收三点） | docs/synova/coordination/派单-devdoc-D510-20260823.md（79df2466） |
| D504 实现 commit（声称矛盾对象） | git commit 5f08f82b（feat/d504-impl） |
| D504 task-state（K3 回填 audit） | task-state/D504.json |
| D382 审计闭环铁律（另起 FIX 任务） | task-state/README.md |
| D504 原 spec（DS4/DS11 完成标准原文） | docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D504-electron-desktop-integration-20260823.md（§10） |
| 铁律（0-2/11/24/31/47/48 + S-10 descope） | AGENTS.md |
| GS-01 场景（断言①静态检查位置） | scripts/golden-scenarios/GS-01-first-diagnosis/run.sh（5.5 段） |

## 12. 自检清单

- [x] K3 F1-F7 全文阅读 + L4 缺口收割理解（M2/M4/M7 强化，零新机制）
- [x] 三方矛盾事实链逐条 grep 实测（commit message / task-state note / release/ 无产物 / GS-01 静态 grep）
- [x] F4 三处注释位置实测（backend-spawn.cjs:12 / main.cjs:123 / build-synova.cjs:42）
- [x] F5 测试数实测（backend-spawn 8 用例，非"契约 10"）
- [x] 派单写集约束遵守（零 electron/*.cjs 逻辑改动；25/25 底线）
- [x] 决策参考已记录（§5.3，S-12）：四决策点均走双参考系且收敛
- [x] DS 与 dev doc 一一对应（DS1-13，S-10）；无 phantom 声称（S-11）
- [x] commit message 模板可直接粘贴（§5.2）——降级路线默认预期（与 D504 同沙箱环境）
- [x] D382 铁律：D504 原分支历史/交付报告不动（§6）
- [x] 不是凭记忆
