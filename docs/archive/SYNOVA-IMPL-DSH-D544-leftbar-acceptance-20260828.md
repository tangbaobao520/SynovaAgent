---
north-star:
  服务用户: GA（Growth Advisor）——桌面端（electron-renderer）操作者；以及 CTO/创始人——需要左栏能力导航这块已完工的 910 行实现**从孤儿分支安全落进 main**，而不是烂在分支上被后续演进掩埋。
  服务场景: D538 已在 feat/d538-frontend-leftbar 实现左栏 Codex 风格能力导航（tip ee960a18），但从未合并；本 spec 由编码 session 拿去执行验收核验与合并准备。
  模块终态: feat/d538-frontend-leftbar 的实现经 8 条可证伪验收逐条核验（含缺口小修）→ PR → CI 全绿 → 合并进 main；左栏能力导航成为桌面端品牌表层的正式能力，task-state/D538 闭环。
  对齐北星: .claude/PRODUCT-BRIEF.md §二（FDE/GA 是直接用户）+ §四（L1 交互层）；桌面端品牌表层立项晚于该 brief（AGENTS.md/CLAUDE.md V5.1.1 2026-08-25「桌面端 8 验证点已闭环」），属 brief §六「前端 UI 是伪需求」结论已被桌面端线事实取代的部分——以北星锚定块的「服务用户/场景」为准，不做产品范围扩张。
  完成标准: （入口）编码 session 按本 spec 章1 实跑测试全绿 →（处理）章2 八条验收逐条标注 + 章3 接线断言 + 章5 缺口分级处置 →（结果）PR 建立且 CI check-runs 全绿（npm audit 黄灯标注），交 CTO 点合并。可验证：DS1-DS7（§11）。
  当前进度: D538 impl_done（躺分支）；D544 = 本验收 spec（2026-08-28 dev doc 交付）；编码执行与合并未开始。分支 7 ahead / 113 behind origin/main，唯一合并冲突面 = task-state/D538.json（已实测）。
---

# SYNOVA-IMPL-DSH-D544: 左栏 Codex 风格验收 Spec — D538 分支验收与合并准备

> 归属: DeepSeek Harness（DSH）· dev doc | 2026-08-28 | slice: `leftbar-acceptance`
> 优先级: P0（910 行实现躺分支 = 孤儿风险；CTO 台账 D538 impl_note「验收合并列下一片首任务」）
> 执行方: 🛠 编码 session——拿到本 spec 即可执行验收与合并准备，目标零二次提问；完成后交 CTO 复验点合并
> 上游输入: 设计规格 v1 §六（验收标准唯一权威，原文见 §1）/ 派单 D544 / D538 impl spec（契约权威）
> 写集约束（派单）: spec 的 Q2 声明（编码执行写集）= electron-renderer/、tests/electron/；排除 = src/, scripts/audit/, pre-commit-check.sh, ci.yml（ASCII 分隔为门禁 C2 路径提取兼容，内容同派单原文）
> 红线: 本 spec 只写验收与合并流程，不代写实现；`scripts/audit/` 永不碰；禁 `git stash`（铁律 0-3）；禁直推 main（铁律 0-2/门禁 0-2）

---

## 1. Authority Doc Verification

**权威 ① — 设计规格 v1 §六（验收标准唯一权威，8 条原文全文引用，不转述）**
来源: `docs/synova/coordination/SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1.md` §六（Win 侧 Codex 推送，创始人确认）。⚠️ 该文件在 main 与分支 tip 均已被清理，现行可读副本: `.wt-D537/docs/synova/coordination/` 与 `.wt-D538-impl/docs/synova/coordination/`；或从 git 历史提取: `git show "b0755d8b:docs/synova/coordination/SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1.md"`。原文:

> ## 六、验收标准（实现者 Done 判据，可证伪）
>
> 1. **左栏**：产品独有能力位出现在搜索之下、最近对话/工作区之上，4 个能力导航项一行一个，无折叠卡片边框。
> 2. **图标风格**：所有图标为 **Lucide 线性 SVG**（stroke、16px、单色 currentColor），**无任何 emoji**。能力项对应 Radar/RefreshCw/ListChecks/Users；通用导航 MessageSquare/Ticket/Settings；折叠 ChevronRight。
> 3. **右栏联动**：点击"主动触达"→ 右栏显示信号 Story 列表；点击"五循环状态"→ 显示 5 循环状态灯；点击"Action 闭环"→ 显示行动项；点击"GA 协同"→ 显示 GA 校准面板。
> 4. **取消选中**：再点同一能力项 → 右栏回到"行动/报告/工单"三标签。
> 5. **GA 权限**：非 GA 角色看不到/置灰"GA 协同"。
> 6. **折叠态**：左栏收起后为 Lucide 线性图标条（Radar/RefreshCw/ListChecks/Users），点击图标右栏联动。
> 7. **代码质量**：`as any` = 0；新导出有调用方（铁律 0-2 接线）；异常有 log + degraded（铁律 24+31）；测试有 expect（铁律 48）。
> 8. **术语**：界面无 "FDE"，统一 "GA"。

> ⚠️ #3 两处与生产事实的偏差（D538 impl spec §4.2 已实测修正，核验时按修正口径，见 §6 注记）: ①「5 循环」实为 **6 个 loop**（src/loops/loop-trigger-config.ts 实测），前端按 `loops.length` 动态渲染，禁硬编码；②「GA 校准面板」的后端接口不存在 → 实现为**结构占位不发 fetch**（派单红线: 不伪造）。

**权威 ② — 派单 D544（本任务定义 + 写集约束）**: 本任务写集 = electron-renderer/ + tests/electron/；排除 = src/, scripts/audit/, pre-commit-check.sh, ci.yml + 5 章节要求。

**权威 ③ — D538 impl spec** `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D538-frontend-leftbar-codex-20260827.md`: 实现契约权威（§4.2 真实接口形状 / §5.1 写集 / §7.1 L1 测试契约 / §8 Wiring Verification）。验收发现与契约冲突时，以「真实接口形状 + 本 spec §6 修正口径」为准。

**权威 ④ — AGENTS.md 铁律**: 0-2（测试先行+接线验收+PR 合并）/ 0-3（禁 stash）/ 24+31（异常 log+degraded）/ 38（as any=0）/ 48（测试非空壳）。

---

## 2. Problem Statement

左栏前端实现（10 文件，910 插入行）躺在 `feat/d538-frontend-leftbar` 从未合并——不合并 = 实现随 main 演进逐步腐烂（已落后 113 commit），且 GA 在桌面端始终看不到「产品独有能力」导航。合并前必须回答三件事: ① 实现是否真的满足设计 §六 8 条可证伪验收（不能只凭交付声明——D316 教训）；② 测试与类型检查在真实环境实跑是否绿（electron-renderer 无 node_modules，从未在本机实跑过完整链路）；③ 合并会不会炸（与 main 的冲突面、CI 门禁、重复提交）。本 spec 把三件事变成编码 session 可执行、CTO 可复验的 runbook。

---

## 3. Q0-Q4

### 3.1 Q0 项目拼图 + 文件审计

- **拼图**: L1 交互层（electron-renderer 桌面端品牌表层）。D538 在既有 LeftPanel/RightPanel/app-store 基线上扩展出能力导航；本任务不改架构位，只做验收 + 缺口小修 + 合并。
- **文件审计（2026-08-28 实测，分支 tip ee960a18）**: D538 切片真实增量 = 10 文件 910 插入 / 65 删除——electron-renderer/src/components/LeftPanel.tsx (+179 改)、electron-renderer/src/components/RightPanel.tsx (+246)、electron-renderer/src/stores/capability.ts (新建 102 行，纯逻辑零依赖)、electron-renderer/src/stores/app-store.ts (+8: selectedCap/setSelectedCap)、electron-renderer/src/styles/global.css (+192: `.cap-*` 类 L435-604)、electron-renderer/package.json (+1: lucide-react ^1.34.0，lock 解析至 1.34.0)、electron-renderer/package-lock.json (-49 重生成)、tests/electron/capability.test.ts (新建 170 行) + 噪音 .claude/bypass.log (+3)、task-state/D538.json (+25 回填)。
- **环境审计**: electron-renderer/node_modules 在主工作树**缺失**（实测 ABSENT）；`.wt-D538-impl` 工作树检出目标分支且 renderer node_modules 在（可作实测参照）；主工作树根 node_modules 有 vitest 4.1.8。分支当前被 `.wt-D538-impl` 占用检出——git 不允许同分支双检出，编码 session 须按 §5 步骤 0 建新分支。

### 3.2 Q1 调研（memory/历史教训）

- **D316**: dev doc「实测」2 处不实——本 spec 全部声称当场跑命令留痕（测试实跑 23/23、tsc exit 0、patch-id 判重均为 2026-08-28 真实执行）。
- **接线失败 4 次（铁律 0-2）+ S-3**: 组件过单测但无生产调用——章3 用 grep 断言生产调用点，测试调用不计。
- **D334/0-2**: main 只进 PR，禁直推；开工前 `git fetch --all`，禁止 behind 状态开工（分支 behind 113 → 合并流程章4 强制先并 main）。
- **D382 撞车**: 任务号已由 alloc-task-id 登记（task-state/D544.json，updated_by=alloc-task-id）；编码 session 不另开编号，完成后回填 D544.json。
- **铁律 0-3 禁 stash**: 工作区隔离一律用 `git worktree add`。

### 3.3 Q2 范围（做什么 / 不做什么）

**做什么**: ① 章1 测试实跑（renderer npm ci + tsc + 根 vitest 靶向测试）；② 章2 八条验收逐条核验与标注；③ 章5 小项缺口直修（已知 1 项: LeftPanel 3 个存量 emoji）；④ 章4 合并准备（并 main 解冲突 → 新分支 push → PR → CI check-runs 确认）→ 交 CTO。

**编码执行写集（本 spec 的 Q2 声明，派单口径）**: 允许写入的区域只有下表 2 个目录。本 spec 自身零代码写入（0 修改 + 0 新建），写集表登记的是**编码 session 的执行范围**:

### 3.3.1 写集 (0 修改 + 0 新建；编码执行写集 = 2 目录)

| 文件 | 操作 | 说明 |
|---|---|---|
| electron-renderer/ | 编码·验收期修复 | 允许编码 session 写入的全部生产代码区域（D538 已实现文件 + 章5 小项修复；含 package.json/lock） |
| tests/electron/ | 编码·测试 | 允许编码 session 写入的测试区域（capability.test.ts 修补或新增用例） |

**不做什么（含文件路径，铁律 Q2 排除项）**:
- ❌ 不改 src/ 后端任何文件（3 接口只读消费；后端归其他线）
- ❌ 不碰 `scripts/audit/`（K3 专属红线）
- ❌ 不改 `scripts/pre-commit-check.sh`、`.github/workflows/ci.yml`（门禁与 CI 归控制塔线；CI 红了先查根因，不越权修）
- ❌ 不为「显示 GA 校准面板」（验收#3 字面）伪造 `/api/ga/calibration`——接口不存在，占位即正确实现（D538 派单红线 + 铁律 8）
- ❌ 不把 RightPanel 存量 37 处 emoji（D527 遗留 Section 标题）纳入本次修复——范围外（§9 大项预登记）
- ❌ 不引入 DOM 渲染测试基建（jsdom/@testing-library）——D538 §7.4 显式 descope，需要则另立任务

### 3.4 Q3 验收（入口 → 处理 → 结果）

- **入口**: 编码 session 在新 worktree 检出分支代码，跑章1 步骤。
- **处理**: 章1 全绿 → 章2 逐条标注 → 章3 断言 → 章5 小项修复 → 章4 合并流程。
- **结果**: PR 存在且 CI check-runs（除 npm audit 黄灯外）全绿 + 8 条验收标注表 + 缺口清单，交 CTO 复验合并。

### 3.5 Q4 契约与测试

契约已存在且不改: electron-renderer/src/stores/capability.ts 纯逻辑契约（toggleCap 三态 / canAccessCap fail-closed / badgeColorFor 降级 null / loopStatusColor 未知兜底灰，JSDoc 完整——D538 impl spec §7.1 定义）。测试 = `tests/electron/capability.test.ts` 170 行 23 用例（7 个 describe，含正常/降级/边界/未知兜底）。本 spec 的「测试」= 章1 实跑已有测试 + 章2 核验方法，不新造契约。

---

## 4. Current State（2026-08-28 实测，全部当场执行）

### 4.1 分支拓扑与提交

| 事实 | 实测值 | 证据 |
|---|---|---|
| 分支 tip | ee960a18 | `git log origin/feat/d538-frontend-leftbar -1` |
| vs origin/main | **7 ahead / 113 behind**，merge-base 4008d118（PR #228 合并点） | `git rev-list --left-right --count origin/main...origin/feat/d538-frontend-leftbar` |
| D538 实现提交 | d2b183a1 与 16123bbd 为**同一补丁重复提交**（patch-id 同为 0fa372f5…，`git show <sha> \| git patch-id --stable` 实测）；另 5 个 = bypass.log×3 + task-state 回填 + merge commit | git log + patch-id |
| 与 main 冲突面 | **仅 task-state/D538.json**（双侧都改过: main 侧 CTO 2026-08-28 版含 impl_note，分支侧 deepseek-harness 版含 spec.doc/design 字段；impl.files 八文件清单两侧一致）；electron-renderer/ 与 tests/electron/ 在 main 侧零变更 = 代码零冲突 | `git diff 4008d118..origin/main --stat -- electron-renderer tests/electron`（空） |

### 4.2 已实测绿项（本机 2026-08-28，在 .wt-D538-impl 执行）

| 检查 | 命令 | 实测结果 |
|---|---|---|
| L1 纯逻辑测试 | `vitest run tests/electron/capability.test.ts` | **Test Files 1 passed (1)，Tests 23 passed (23)**，vitest 4.1.8，144ms |
| renderer 类型检查 | `cd electron-renderer && npx tsc --noEmit --incremental false` | **exit 0，零输出** |
| `as any` | `git grep -n "as any" origin/feat/d538-frontend-leftbar -- electron-renderer tests/electron` | **零结果** |
| 术语 FDE | `git grep -n "FDE" origin/feat/d538-frontend-leftbar -- electron-renderer/src` | **零结果** |
| lucide-react | branch package-lock.json | `"resolved": "https://registry.npmjs.org/lucide-react/-/lucide-react-1.34.0.tgz"`（版本真实存在，lock 自洽） |

### 4.3 已实测缺口/风险项

| 项 | 实测 | 归级（章5） |
|---|---|---|
| LeftPanel 存量 emoji ×3 | L217 `💬`（对话列表）/ L230 `📁`（工作区列表）/ L253 `🏢`（客户列表）——均为 panel-item-icon，非能力导航位 | 小项（DS3 直修） |
| RightPanel 存量 emoji ×37 | D527 遗留 Section 标题（📊🏢🔄🚨📄✅📋 等），D538 写集未要求清理 | 大项预登记（不阻塞合并） |
| loops 接口需 JWT | `src/routes/loops.ts (L80)` `router.get('/api/loops/status', jwtAuthMiddleware, …)`；renderer 的 apiFetch（RightPanel.tsx L138-150）**不带任何 token**；src/middleware/auth.ts 无 JWT_SECRET 时降级 devMode 放行 | 桌面本地（无 JWT_SECRET）正常；若启用 JWT_SECRET 则 loops 详情恒降级条——属正确降级（铁律 24/31），登记不阻塞 |
| 设计文档被清理 | main/分支 tip 均无该文件；可读副本在 `.wt-D537`/`.wt-D538-impl`，git 历史 b0755d8b | 文档事实（引用路径见 §1/§12） |
| electron-renderer 无 node_modules | 主工作树实测 ABSENT | 章1 步骤 1 解决 |

### 4.4 CI 现状（`.github/workflows/ci.yml`，179 行实测）

9 个 check-run: `TypeScript + Lint + Iron Laws`（quality，SYNO_CI=1 strict）/ `Vitest (1/2)` + `Vitest (2/2)`（matrix）/ `Architecture Check` / `Control Tower Gate Tests (U7c 兜底)` / `Integration Contract Check` / `Checker Review (maker/checker)` / `npm audit`（**continue-on-error: true**，2026-08-16 创始人豁免台账，黄灯不阻断）/ `Golden Case F1 Gate`。CI 的 quality job 跑全量 vitest——合并测试权威在 CI，不在本地。

---

## 5. 章 1 · Test Requirements — 测试实跑（npm install → npm test）

>electron-renderer 无 node_modules（§4.3），以下步骤从零开始。所有命令在**新 worktree**执行（步骤 0）。

**步骤 0 — 工作区准备（禁 stash，铁律 0-3）**:

```bash
git fetch --all
# .wt-D538-impl 已占用 feat/d538-frontend-leftbar，禁止同分支双检出 → 建验收分支（worktree 置仓库根内，沿用 .wt-* 惯例，沙箱/权限友好）:
git worktree add -b feat/d544-leftbar-acceptance .wt-d544 origin/feat/d538-frontend-leftbar
cd .wt-d544
```

**步骤 1 — renderer 依赖安装（npm install 步骤，含 lockfile 一致性校验）**:

```bash
cd electron-renderer && npm ci && cd ..
```
预期: `added ~N packages`，无 EUSAGE 锁文件不一致报错（lock 已含 lucide-react 1.34.0）。若 npm registry 不可达 → 网络重试/镜像，属环境项。

**步骤 2 — renderer 类型检查（UI 层编译级证据）**:

```bash
cd electron-renderer && npx tsc --noEmit --incremental false && cd ..
```
预期: **exit 0 零输出**（2026-08-28 在 .wt-D538-impl 实测）。这证明 LeftPanel/RightPanel/capability 与 lucide-react 导入全部类型成立。

**步骤 3 — 根 vitest 靶向测试（先 `npm ci` 装根依赖，或复用主树 node_modules）**:

```bash
npm ci          # 根目录，一次性；或跳过并改用主树二进制（见下）
npx vitest run tests/electron/capability.test.ts
```
预期输出（2026-08-28 实测原文）:

```
 RUN  v4.1.8
 ✓ tests/electron/capability.test.ts (23 tests) 6ms
 Test Files  1 passed (1)
      Tests  23 passed (23)
   Duration  144ms (transform 31ms, setup 0ms, import 40ms, tests 6ms, environment 0ms)
```
轻量替代（不装根依赖）: `cd .wt-d544 && /Users/wane/SynovaAgent/node_modules/.bin/vitest run tests/electron/capability.test.ts`（主树 vitest 二进制 + 向上解析 node_modules，2026-08-28 实测可行）。

**步骤 4 — 全量测试归 CI**: 本地全量 `npm test` 可选；合并判据以 PR CI `Vitest (1/2)`+`(2/2)` 全绿为准（铁律 36 由 CI 权威执行）。

**红时修复清单模板**（命中即按行处置，处置后重跑步骤 1-3）:

| # | 症状 | 根因假设 | 处置 | 归级 |
|---|---|---|---|---|
| R1 | 步骤1 `npm ci` EUSAGE lock out of sync | package.json ↔ lock 漂移 | `npm install` 重生成 lock 后重跑（lock 变更在写集内） | 小项 |
| R2 | 步骤1 lucide-react 404/网络错 | registry 不可达 | 重试/换镜像；确认 lock 内 1.34.0 未被篡改 | 环境项 |
| R3 | 步骤2 tsc 报错 ≤10 处 | 类型/导入笔误 | 按报错逐条修（禁 `as any`，铁律 38） | 小项 |
| R4 | 步骤2 tsc 报错 >10 处或需改 capability.ts 契约 | 实现与 D538 §7.1 契约结构性偏离 | **停手**，附报错全文报 CTO | 大项 |
| R5 | 步骤3 23 用例部分失败 | capability.ts 行为漂移 | 对照 D538 §7.1 契约修**实现**（不是改测试凑绿；改测试须附契约依据） | 小项 |
| R6 | 步骤3 用例全红 | 测试文件或导入路径被改坏 | `git diff origin/feat/d538-frontend-leftbar -- tests/electron/` 查是谁改的 | 小项/大项视改动面 |
| R7 | 全量 vitest 出现与本切片无关的红 | main 侧存量问题 | **不修**（写集外），记录测试名交 CTO/CI 权威裁决 | 大项 |

---

## 6. 章 2 · 8 条验收核验表（设计 §六 原文 → 核验方法 → 证据标准 → 标注）

**标注格式（每条必须产出一行）**: `验收N: 通过|部分|未实现 — 证据`。证据 = 逻辑层给**测试名**（tests/electron/capability.test.ts 内 describe/it 名）或 grep 命令+结果；UI 层给**组件 JSX file:line**。行号基于分支 tip ee960a18 的实现（本 spec 已逐行核对，见 §4.2）。

| # | 设计 §六 原文（引用） | 层 | 核验方法 | 证据标准 | 2026-08-28 预判 |
|---|---|---|---|---|---|
| 1 | 左栏：产品独有能力位出现在搜索之下、最近对话/工作区之上，4 个能力导航项一行一个，无折叠卡片边框 | UI | JSX 位置核验: LeftPanel.tsx 搜索块 L158-163 → `.cap-section` L166-194（4 项 `CAPABILITY_IDS.map` L168，一行一项）→ 最近对话 L214 之后；「无折叠卡片边框」= global.css `.cap-item` L450-466 `border: none` + `background: transparent`（L455-456，2026-08-28 实读） | file:line + 容器/截图目视 | 通过（实读） |
| 2 | 图标风格：所有图标为 Lucide 线性 SVG（stroke、16px、单色 currentColor），无任何 emoji。能力项 Radar/RefreshCw/ListChecks/Users；通用导航 MessageSquare/Ticket/Settings；折叠 ChevronRight | UI | ① lucide import: LeftPanel.tsx L11（全量图标单一 import）；② 16px/stroke2: L149/L184/L288；③ emoji grep（见下） | grep + file:line | **部分→小修后通过**: 顶部条/能力导航/通用导航/折叠条已全 Lucide（L17-22/L25-30/L197-211/L273-293），但 LeftPanel 存量列表图标 L217 `💬`/L230 `📁`/L253 `🏢` 仍是 emoji → 执行 DS3 修复后改判「通过」 |
| 3 | 右栏联动：点"主动触达"→信号 Story 列表；"五循环状态"→5 循环状态灯；"Action 闭环"→行动项；"GA 协同"→GA 校准面板 | UI+逻辑 | 分派: RightPanel.tsx `CAP_DETAIL_VIEW` L643-648 + `selectedCap ?` 分支 L670-671；ReachDetail fetch L466 / LoopsDetail L533 / ActionDetail L600 / GaDetail **无 fetch** L633-640。核验口径见下注①② | file:line + 运行截图（含降级条样本） | 通过（按修正口径；#3 原文「GA 校准面板」以占位为正确态） |
| 4 | 取消选中：再点同一能力项 → 右栏回到"行动/报告/工单"三标签 | 逻辑+UI | 测试名: `toggleCap 状态机（正常路径）› 再点同一项 → 取消选中回到默认（null）`（capability.test.ts L40-42）；UI: LeftPanel handleCapClick L121-127（toggleCap）+ RightPanel L670 `selectedCap ?` 三元 → null 时回 resolveView 默认视图（L11-18）。核验口径注④: 设计原文「三标签」为设计时口径，现默认视图 = resolveView 结果（GA 角色选工作区时为 GAWorkspaceTabs 四标签 L229-301，含 D527 增加的诊断报告 tab）——以「回到 selectedCap=null 的默认视图」为准 | 测试绿 + file:line | 通过（按注④口径） |
| 5 | GA 权限：非 GA 角色看不到/置灰"GA 协同" | 逻辑+UI | 测试名: `canAccessCap 权限矩阵`（L53-74，admin/manager/staff/liaison×ga 均 false）+ `canAccessCap 边界（未知角色）`（L78-86 fail-closed）；UI: LeftPanel disabled 判定 L172 → class L179 + `aria-disabled` L181 + tooltip「仅 GA 可用」L182，点击 pre-check L122-125 | 测试名绿 + file:line | 通过（置灰口径，D538 决策记录在案） |
| 6 | 折叠态：左栏收起后为 Lucide 线性图标条（Radar/RefreshCw/ListChecks/Users），点击图标右栏联动 | UI | LeftPanel.tsx `!open` 分支 L273-293（collapsedCaps L138 四能力 + CAP_ICON 渲染 L277-288 + onClick handleCapClick L286）+ global.css `.cap-collapsed` L536-555 | file:line + 折叠态截图 | 通过 |
| 7 | 代码质量：as any=0；新导出有调用方（铁律 0-2）；异常有 log+degraded（铁律 24+31）；测试有 expect（铁律 48） | 逻辑 | ① `git grep -n "as any" -- electron-renderer tests/electron` = 0（已实测）；② 新 export 生产调用方 = 章3 断言表；③ 降级: apiFetch console.warn L147 + 角标 catch L81/L94/L107 + 详情降级条 L482/L546/L613；④ 23 用例全含 expect（步骤 3 绿即证） | grep + 测试绿 + file:line | 通过（含 DS3 修复后复跑） |
| 8 | 术语：界面无 "FDE"，统一 "GA" | 逻辑 | `git grep -n "FDE" -- electron-renderer/src` = 0（已实测零结果）；另有 describe `capabilityLabel 契约`（capability.test.ts L106-124，L114 断言 label 不含 "FDE"）双保险 | grep 零结果 | 通过 |

**注①（验收#3「5 循环」口径修正）**: 生产事实 = 6 个 loop（src/loops/loop-trigger-config.ts — D538 impl spec §4.2 实测在案）。核验标准 = `LoopsDetail` 按 `data.loops.map`（L549）动态渲染、数量等于接口返回，且源码无硬编码 `5`/`6` 循环数。「显示 5 循环状态灯」中的 5 是设计时的数据误设，不构成失败项。若渲染数量 ≠ 接口 `loops.length` → 未实现。
**注②（验收#3「GA 校准面板」口径修正）**: `/api/ga/calibration` 后端不存在（D538 §4.2 实测仅 `/api/ga/clients`、`/api/ga/switch/:orgId`、`/api/ga/annotations*`）。核验标准 = GaDetail（L633-640）渲染三空子块 + 「后端校准接口待接入」提示 + **零 fetch**（grep 断言见章3）。伪造接口 = 未实现 + 违铁律 8。
**注③（#3 手测预期）**: 桌面本地（未设 JWT_SECRET）三接口返回真实数据；若设了 JWT_SECRET，loops 详情显示「⚠ 降级：循环状态不可用」= **正确降级**（jwtAuth 拦截 + 铁律 24/31 链路），判「通过（降级路径）」并登记，不算失败。
**注④（#4「三标签」口径）**: 设计原文「行动/报告/工单」三标签为设计时口径；现实现默认视图 = `resolveView(role, wsId)`（RightPanel L11-18/L674-679），GA 角色选中工作区时为 GAWorkspaceTabs 四标签（L229-301：行动跟踪/哨兵数据/落地模式/诊断报告，第 4 个为 D527 增加）。核验标准 = 取消选中后回到 `selectedCap === null` 的**默认视图**（与进入能力导航前一致），不苛求标签数量。

---

## 7. 章 3 · Wiring Verification — 接口接线核对清单

> S-3 纪律: 测试调用不计，以下全部为**生产代码调用点**。每条给 grep 命令与期望（在验收 worktree 内执行）。

### 7.1 三接口前端调用点 ↔ 后端挂载（已实测对照 origin/main）

| 接口 | 前端调用点（grep 期望命中） | 后端事实（origin/main） | 认证 |
|---|---|---|---|
| `GET /api/sentinel/signals` | LeftPanel.tsx L73（角标 fetch）+ RightPanel.tsx L466（ReachDetail fetch）→ `grep -rn "api/sentinel/signals" electron-renderer/src` = **4 行命中**（2 fetch L73/L466 + 2 注释 L72/L457；2026-08-28 实测） | `src/routes/sentinel.ts (L46)` `router.get('/signals', …)`；挂载 `src/server.ts (L341-342)` `app.use('/api/sentinel', …)` | 无 |
| `GET /api/loops/status` | LeftPanel.tsx L83（角标 fetch）+ RightPanel.tsx L533（LoopsDetail fetch）→ `grep -rn "api/loops/status" electron-renderer/src` = **4 行命中**（2 fetch L83/L533 + 2 注释 L82/L524；实测） | `src/routes/loops.ts (L80)` `router.get('/api/loops/status', jwtAuthMiddleware, …)`；挂载 `src/server.ts (L356)` `app.use(loopRoutes)` | jwtAuth（devMode 降级见注③） |
| `GET /api/actions` | LeftPanel.tsx L96（角标 fetch）+ RightPanel.tsx L600（ActionDetail fetch）→ `grep -rn "api/actions" electron-renderer/src` = **4 行命中**（2 fetch L96/L600 + 2 注释 L95/L591；实测） | `src/routes/actions-api.ts (L54)` `router.get('/api/actions', …)`；挂载 `src/server.ts (L320)` `app.use(actionsApiRoutes)` | 无 |

### 7.2 状态机/权限/详情生产接线（防「组件过测试但无人调用」）

| 断言 | 命令 | 期望 |
|---|---|---|
| selectedCap 两端接通 | `grep -rn "selectedCap" electron-renderer/src/components` | LeftPanel（写 L48-49/L126）+ RightPanel（读 L656/L670）均有 |
| store 契约消费 | `grep -rn "stores/capability" electron-renderer/src` | app-store.ts（type import）+ LeftPanel.tsx L14 + RightPanel.tsx L7 = ≥3 |
| toggleCap 生产调用 | `grep -rn "toggleCap" electron-renderer/src --include=*.tsx` | LeftPanel L126/L286（onClick 路径），非仅测试 |
| canAccessCap 生产调用 | `grep -rn "canAccessCap" electron-renderer/src --include=*.tsx` | LeftPanel L122/L172/L278 |
| GA 不伪造接口 | `grep -rn "api/ga/calibration" electron-renderer/src` | **零结果**（命中 = 违铁律 8，判未实现） |
| lucide 到组件 | `grep -rn "from 'lucide-react'" electron-renderer/src` | LeftPanel.tsx L11 |
| 样式到达节点 | `grep -c "cap-" electron-renderer/src/styles/global.css` + `grep -rn "cap-section\|cap-item" electron-renderer/src/components` | CSS 类定义（L435-604）与 JSX class 引用同时命中 |

### 7.3 GA 置灰渲染分支核验方法（验收#5 的 UI 证据链）

1. 逻辑: 测试名 `canAccessCap 权限矩阵`（步骤 3 已绿）。
2. 渲染: LeftPanel.tsx L172 `disabled = !canAccessCap(userRole, cap)` → L179 className 追加 ` disabled` → L181 `aria-disabled` → L182 `title='仅 GA 可用'`；CSS 置灰 = global.css `.cap-item.disabled`（L477）。
3. 行为兜底: L121-125 `handleCapClick` 对无权点击二次拦截（fail-closed，console.warn）。
4. 手测: app-store 默认 `userRole: 'admin'`（app-store.ts L98 实测）→ 打开桌面端 GA 项应为灰；临时改 role 为 'ga' → 可点进入 GaDetail 占位。

---

## 8. 章 4 · 合并流程（merge 分支方案 + CI check-runs 确认，本地绿不算）

**前置门槛**: 章1 全绿 + 章2 八条已标注（允许「部分」附缺口清单）+ 章3 断言全命中 + DS3 小项已修。

1. **并 main 解冲突**（分支 behind 113，禁 behind 状态开工——铁律 0-1/0-2）:
   ```bash
   git fetch origin
   git merge origin/main        # 在 feat/d544-leftbar-acceptance 上
   ```
   实测冲突面**仅一个文件**: `task-state/D538.json`（§4.1）。解法: **取 origin/main 侧**（CTO 2026-08-28 权威账本，含 impl_note），不删 impl_note；分支侧多出的 spec.doc/design 两字段可选并回。`git add task-state/D538.json && git commit`（merge 提交，commit-msg 对 MERGE_HEAD 豁免）。
2. **push**（pre-push 门禁 0-5 自动执行: 门禁0 D334 多机同步 + 0-2 禁直推 main / 门禁1 secrets 终扫 / 门禁2 golden-case F1 / 门禁3 改基检查 / 门禁4 工作区中间态警告 / 门禁5 并行声明，另有 vitest --changed + D331 tag 对账）:
   ```bash
   git push -u origin feat/d544-leftbar-acceptance
   ```
   ⚠️ push 成功后按 AGENTS.md 提醒运行 `bash scripts/workflow/checkpoint-deploy.sh [服务器URL]`。
3. **开 PR**（本机无 gh CLI——实测 `which gh` 为空；走 GitHub Web）: 仓库 github.com/tangbaobao520/SynovaAgent → Compare & pull request → base `main` ← compare `feat/d544-leftbar-acceptance`。PR 描述必须附: 章2 八条标注行 + 缺口清单 + DS1-DS7 状态 + 步骤 2/3 实测输出。
4. **CI check-runs 确认（唯一合并判据，本地绿不算）**: PR 页 Checks 页签 9 项（§4.4 清单）——除 `npm audit` 黄灯（continue-on-error，创始人豁免在案）外**全部绿**才算过；任一红 → 按 CI 日志定位: 切片内 → 章5 小项修后 push 重跑；切片外（如主红/门禁误伤）→ 大项停手报 CTO。合并前若 main 又前进: 重跑步骤 1（merge 最新 main）再等 CI。
5. **合并**: CTO 复验（8 条标注 + CI 全绿 + 缺口清单可接受）后点 **Merge**（merge commit，保留分支历史——项目惯例，commit-msg MERGE_HEAD 豁免即为此设）。合并后: 可删 `feat/d544-leftbar-acceptance` 与 `feat/d538-frontend-leftbar`（grep 远端零 PR 引用后）；回填 task-state（D544 impl 段 + status；D538 由 CTO 闭环）。

---

## 9. 章 5 · 缺口分级（小项编码直修 / 大项停手报 CTO）

**小项判定（全部满足才直修）**: 改动 ≤20 行 且 单文件 且 不改 capability.ts 对外契约/接口形状/公共 CSS token 且 不新增依赖 且 修复在写集（electron-renderer/ + tests/electron/）内 且 有章1 测试或 grep 可闭环验证。**直修后必须重跑章1 步骤 2-3 + 相关章3 断言。**

**大项判定（任一命中即停手）**: 需要改 src/ 或写集外任何文件（含 `scripts/pre-commit-check.sh`、`.github/workflows/ci.yml`、`scripts/audit/`——后者永禁）/ 契约或接口形状变更 / 新依赖或测试基建 / CI 红但根因在切片外 / 验收 N 结构性无法满足 / 产品口径或方向问题。**停手报告格式**: 任务号 D544 + 验收 N/断言名 + 证据（命令+输出）+ 根因假设 + 可选项 + 建议，交 CTO。

**2026-08-28 预登记清单**:

| 项 | 分级 | 处置 |
|---|---|---|
| LeftPanel L217/L230/L253 emoji（💬 📁 🏢 三处列表图标） | **小项 = DS3** | 直修: 💬→`MessageSquare`、📁→`Folder`、🏢→`Building2`（lucide，16px currentColor，span 保留 className="panel-item-icon"）；修后 grep 逐字符（macOS BSD grep 无 -P，用 `perl -CSD -ne 'print if /[\x{1F300}-\x{1FAFF}\x{2700}-\x{27BF}\x{FE0F}]/'`）LeftPanel emoji = 0 → 验收#2 改判通过 |
| RightPanel 37 处存量 emoji（D527 遗留 Section 标题） | 大项（范围外） | 不阻塞合并；建议另立清理任务（属 D527 视觉债，非本切片验收项） |
| loops 接口 jwtAuth × renderer 无 token 附着 | 大项（登记） | 桌面本地 devMode 不触发；启用 JWT_SECRET 的部署会恒降级——降级链路正确（铁律 24/31），token 附着机制留待后续任务 |
| DOM 渲染测试基建缺位 | 大项（登记） | D538 §7.4 显式 descope；如 CTO 要求组件级测试另立基建任务 |
| task-state/D538.json 合并冲突 | 流程项（章4 步骤 1） | 按 §8 解法执行，不算代码缺口 |

---

## 10. Architecture Layer

**L1（交互层，electron-renderer）**——本任务零架构位变更: 全部写集在 L1 桌面端品牌表层；3 接口消费走 HTTP（L1→L1 API），不触 L3/L4/L5（铁律 39）；纯逻辑 capability.ts 是 L1 内部状态契约。`check-architecture.sh` 扫 src/ 跨层——本切片零 src/ 改动，天然通过（CI `Architecture Check` job 复核）。

---

## 11. Completion Standard（DS1-DS7，与各章一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1** 章1 实跑: 步骤 1-3 全绿（renderer npm ci 成功 + tsc exit 0 + capability.test.ts 23/23），实测输出贴进 PR 描述。
2. **DS2** 章2: 八条验收逐条产出标注行（验收N: 通过|部分|未实现 — 证据），「部分/未实现」必须挂缺口条目。
3. **DS3** LeftPanel L217/230/253 emoji Lucide 化（§9 小项），修后 emoji grep 零结果，验收#2 复判「通过」。
4. **DS4** 章3: 三接口调用点 grep 命中（2/2/≥2）+ `api/ga/calibration` 零结果 + 状态机/权限生产接线命中。
5. **DS5** 章4: main 已并入（唯一冲突 task-state/D538.json 按 §8 解法）+ 分支已 push + PR 已建 + 9 项 check-runs 状态记录（npm audit 黄灯单独标注）。
6. **DS6** 章5: 缺口分级清单随 PR 提交（小项已修列表 + 大项停手报告或「无」）。
7. **DS7** task-state 回填: `task-state/D544.json` impl 段（验收结果 + PR 链接）+ `status=impl_done`；CTO 合并后闭环。

---

## 12. Auth Doc References

- 设计规格 v1 §六（验收 8 条原文）: `docs/synova/coordination/SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1.md`——现行副本 `.wt-D537/docs/synova/coordination/`、`.wt-D538-impl/docs/synova/coordination/`；git 历史 `b0755d8b`
- 派单 D544（写集约束 + 5 章节要求）: 创始人派单（本 spec 的任务源）
- D538 impl spec: `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D538-frontend-leftbar-codex-20260827.md`（§4.2 接口形状 / §7.1 契约 / §8 接线）
- D538 派单与编码指令: `docs/synova/coordination/派单-D538-前端左栏Codex-20260826.md`、`docs/synova/coordination/编码指令-D538-前端左栏Codex-20260827.md`
- PRODUCT-BRIEF: `.claude/PRODUCT-BRIEF.md`（§二/§四）
- AGENTS.md 铁律: 0-1/0-2/0-3/24/31/38/39/48；MULTI-MACHINE-PR-WORKFLOW（D334）
- 后端事实源（origin/main 只读实测）: `src/routes/sentinel.ts (L46)`、`src/routes/loops.ts (L80)`、`src/routes/actions-api.ts (L54)`、`src/server.ts (L320/L341-342/L356)`、src/loops/loop-trigger-config.ts 、src/middleware/auth.ts
- CI 权威: `.github/workflows/ci.yml`（9 check-runs + npm audit 豁免台账 2026-08-16）

---

## 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 验收#2 emoji 范围口径 | A 按字面全仓 grep（RightPanel 37 处也算）/ B 收窄到设计 §二改造范围（左栏导航域）+ 写集内小修 | 第一性原理（§六判据服务于 §二设计范围）+ 派单写集（electron-renderer/ 可修）+ 事实（D538 写集未含存量清理） | **B+DS3**: LeftPanel（写集内、属左栏域）3 处直修后判通过；RightPanel 存量属 D527 债，登记不阻塞——既忠于原文「左栏无 emoji」又如实分级 |
| 验收#3「5 循环/GA 面板」口径 | A 按字面判未实现 / B 按 D538 §4.2 修正口径 | 生产事实（6 loop、GA 接口不存在）+ 派单红线（形状不一致以真实接口为准）+ D316（以声称为准=造假温床） | **B**——原文引用保留 + 修正注记显式（§6 注①②），核验按修正口径 |
| loops 恒降级（JWT 场景）算不算失败 | A 算 / B 算正确降级登记 | 铁律 24/31（降级信号传播+前端展示=义务已尽）+ 部署事实（桌面本地无 JWT_SECRET） | **B**——显示降级条即符合契约；token 附着机制登记后续任务 |
| 合并前是否把 main 并进验收分支 | A 直接 PR 让 GitHub 判 / B 先 merge origin/main 再 PR | 实测（唯一冲突 D538.json，GitHub 无法自动合并 → A 必卡）+ 铁律 0-1（禁 behind 开工/push） | **B**——本地解冲突可控可验，PR 即净 |
| 重复提交 16123bbd/d2b183a1 处理 | A rebase 去重 / B 保留（merge 时 git 自动按内容合并） | patch-id 实测同补丁 + 禁改写已 push 共享分支历史（D334 禁 force push） | **B 保留**——内容一致零冲突，历史留痕无害 |

> 参考：Anthropic（fail-closed + 物理证据优先）+ 第一性原理（以生产事实为准）+ D333 四步。收敛检查：各决策点参考系一致指向，无分歧。
>
> **门禁盲区登记（2026-08-28 发现，不改门禁——控制塔线专属）**: dev-doc-gatekeeper C2 的路径提取正则前缀表为 `src|extensions|packages|app`，未建模 electron-renderer——文档中任何 `electron-renderer/src/...` 引用会被剥前缀成 `src/...` 到仓库顶层查存在性而必然 MISS；且本机为 BSD grep（无 `-P`），C1/C2 在 macOS 上整体跳过（fail-open 环境行为）。处置: ① 本 spec 的后端 src/ 路径全部按「路径后紧跟空格/ASCII 终止符」书写并经 perl 模拟 C2 提取逐一验证存在（backend 子集全 OK）；② renderer 路径保持真实写法（读者正确性优先），其存在性由本 spec §4.1/§4.2 的 git show/vitest/tsc 实测独立背书；③ 建议控制塔线后续将 electron-renderer 纳入 C2 前缀表。

---

## 自检清单

- [x] 北星 front-matter 已写（PRODUCT-BRIEF §二/§四 + 桌面端时间差显式声明）
- [x] 设计 §六 8 条**原文全文引用**（从 b0755d8b 提取，未转述；两处事实偏差以注记显式化）
- [x] 现状全部实测（§4）: 分支拓扑/重复提交 patch-id/冲突面/23 用例实跑/tsc exit 0/as any=0/FDE=0/emoji 逐行/lucide lock/jwtAuth/CI 9 job——无凭记忆项
- [x] 写集表（§3.3.1）标题符合 D381 契约 + 编码执行写集 = electron-renderer/、tests/electron/（派单口径）+ 排除四项原文
- [x] 章1 含 npm install 步骤（electron-renderer 无 node_modules）+ 实测预期输出 + 红→修复清单模板（R1-R7 分级）
- [x] 章2 每条给核验方法（逻辑=测试名 / UI=JSX file:line）+ 证据标准 + 标注格式
- [x] 章3 三接口调用点逐个 grep 实测（生产调用点，S-3）+ GA 置灰渲染分支核验链
- [x] 章4 merge 方案 + 冲突预解（唯一冲突文件给死解法）+ CI check-runs 逐项列名（本地绿不算）
- [x] 章5 分级标准可操作 + 已知缺口预登记（小 1 / 大 4）
- [x] DS1-DS7 与章节一一对应（S-10）；决策参考（S-12）五决策点收敛
- [x] 本 spec 零代码写入（只写文档）；不碰 scripts/audit/；不用 --no-verify
