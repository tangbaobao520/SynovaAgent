---
north-star:
  服务用户: GA（Growth Advisor，前身 FDE）——桌面端（electron-renderer）的日常操作者。痛点：产品独有能力（主动触达/五循环/Action闭环/GA协同）散落在左栏各处或无一目了然的入口，GA 想"点一下就看到该能力的现状"却找不到干净的导航位。
  服务场景: GA 打开 Synova 桌面端，在左栏顶部想快速定位/查看任一产品独有能力。
  模块终态: 左栏顶部 = Codex 风格"一行一个导航项"的产品独有能力主导航（4 能力项 + 数字角标 + 通用导航），无折叠卡片边框；点击任一能力项 → 右栏联动展示该能力详情的**真实数据**；再点同一项 → 回默认三标签；GA 协同项按 userRole 置灰/占位。
  对齐北星: .claude/PRODUCT-BRIEF.md §四（L1 交互层，桌面端为品牌表层）+ §五（桌面端切片 A/B/C 已闭环，"能开/能用"）；本任务把产品独有能力的**可导航性**补齐到品牌表层。
  完成标准: （入口）左栏 cap 导航项可点 →（处理）selectedCap 状态机切换 + 3 能力真实接口消费 + 权限门控 →（结果）右栏展示真实数据/GA 占位；再点同一项回默认三标签。可验证（§7 L1 测试 + §8 接线 grep + §10 验收 8 条）。
  当前进度: 现状 = 左栏仅 ICON_ITEMS emoji 图标条 + 无能力位；右栏 resolveView 三标签，无 selectedCap；app-store 无 selectedCap；lucide-react 未装；3 能力 backend 接口已存在（只读消费），GA 校准接口不存在（占位）。本 spec 从设计规格 v1 出发，修正与真实接口的偏差。
---

# SYNOVA-IMPL-DSH-D538: 前端交互实现 — 左栏 Codex 风格（产品独有能力导航）

> 归属: DeepSeek Harness（DSH）· dev doc | 2026-08-27
> 状态: dev doc（只读交付物，不改任何代码） | slice: `frontend-leftbar`
> 优先级: P1（桌面端品牌表层增强，非阻塞链路） | 依赖: electron-renderer 既有组件 + 3 个 backend 接口（已存在只读）
> 并行: 无（D537 控制塔 / D536 部署，领域不重叠；同一模块同一时间仅本角色认领——TASK-ROUTING v4）
> 执行方: 🛠 编码 session（electron-renderer/，Mac DSH 线）按本 spec 实现 + 组件测试 + task-state/D538 回填
> 上游输入: 设计规格 v1（Win 侧 Codex 推送，创始人确认）`docs/synova/coordination/SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1.md` + 派单 `docs/synova/coordination/派单-D538-前端左栏Codex-20260826.md`

> ⚠️ **本 spec 相对设计规格 v1 的关键修正**（已对真实 backend 逐接口核验，见 §4.2/§5）：① 主动触达真实路径是 **`GET /api/sentinel/signals`**（派单误写 `GET /api/signals`，少了 `/sentinel` 前缀）；② 五循环是 **6 个**（loop-1..6），非设计所称"5 循环"，前端必须**按 `loops.length` 动态渲染**，勿硬编码 5 或 6；③ Action 实响应形状无 `targetMetric/currentValue/tolerance/deadline/responsibleRole`，按真实 shape（title/description/status/priority/owner）渲染；④ GA 校准接口不存在 → 置灰/结构占位，不伪造。**形状不一致一律以真实接口为准（本次派单红线）。**

---

## 1. Authority Doc Verification

**权威引用 ①（本任务定义 + 创始人确认方向）** — [设计规格 v1](.wt-D537/docs/synova/coordination/SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1.md) §一：

> 左栏顶部 = **产品独有能力主导航**，采用 Codex 那种"一行一个导航项"的干净样式，**不要折叠卡片（accordion）**。

**权威引用 ②（写集与接口红线）** — [派单 D538](docs/synova/coordination/派单-D538-前端左栏Codex-20260826.md)（路线：MAIN_WriteSet）：

> - **可碰**：electron-renderer/src/components/LeftPanel.tsx、RightPanel.tsx、electron-renderer/src/stores/app-store.ts、electron-renderer/src/styles/global.css、electron-renderer/package.json（lucide-react）
> - **不碰**：src/（后端——3 能力接口已存在只读消费，不改后端）、scripts/audit/；GA 校准接口不存在 → 前端 GA 项置灰/结构占位，不伪造
> - **图标规范**（设计规格 §五，硬约束）：Lucide 线性 stroke 图标、16px、单色 currentColor、**无 emoji 无彩色填充**；`as any` 零容忍（铁律 38）

**权威引用 ③（质量/接线/契约）** — [AGENTS.md](/Users/wane/SynovaAgent/AGENTS.md) 铁律：

> - **铁律 0-2** 测试先行 + 接线验收——Step 5 WIRE CHECK 硬门禁：`grep -rn "新函数名" src/` 零结果 = 未完成。
> - **铁律 24** catch 必须 `log.error/warn`（不能空吞）+ 显示错误 UI；**铁律 31** 降级信号传播，前端展示。
> - **铁律 38** `as any` 零容忍；**铁律 48** 测试不可为空壳，必须有 `expect()`。
> - **铁律 39** 五层架构边界：L1 交互不触 L3/L4/L5（本任务为 L1 纯前端，改 electron-renderer 不触 backend，天然合规）。

---

## 2. Problem Statement（对齐北星锚定块）

产品独有能力（主动触达/五循环/Action闭环/GA协同）是 Synova 区别于普通 ChatBot 的核心，但桌面端左栏**缺一个"产品独有能力"的统一导航位**：现状左栏只有 emoji 图标条（🔍💬📁🔔）+ 搜索/最近对话/工作区/GA 客户列表，无一目了然的"4 能力"入口。GA 想点一下看到"主动触达有哪些信号 / 五循环现在跑得怎样 / 有哪些行动项"，需要先知道该去哪里、再切内容区——链路破碎。

本任务在左栏**顶部（搜索之下、最近对话/工作区之上）**插入 Codex 风格的产品独有能力主导航（4 项一行一个、Lucide 线性图标、数字角标、无折叠卡片），点击 → **右栏联动**展示该能力详情的真实数据；再点同一项 → 回右栏默认三标签。让"产品独有能力"从"藏在内容区"变成"顶栏即达"。

---

## 3. Q0-Q4

### 3.0 Q0 项目拼图 + 文件审计

- **拼图**：本任务在 L1 交互层（electron-renderer 桌面端品牌表层）。该层已有 LeftPanel/RightPanel/app-store 基线（切片 A/B/C 已闭环）。本任务在此基础上**新增/扩展**，不替换整层。
- **文件审计**：
  - `LeftPanel.tsx`：现状 ICON_ITEMS emoji 图标条（L11-16）+ 折叠态（L4 `open?open:closed`）+ 内容区（L74-140）。**无能力位** → 需在内容区插入 cap 导航组。
  - `RightPanel.tsx`：现状 `resolveView`（L9-16）按 role+wsId 出视图；GAWorkspaceTabs（L173-367）三标签；`apiFetch`（L134-146）用 `getApiBase`。**无 selectedCap** → 需在视图层加 selectedCap 分派。
  - `app-store.ts`：`userRole`(L38) / `currentReportId`(L52) 存在；**无 selectedCap** → 需新增。
  - `lib/api.ts`：`getApiBase()` 已存在（L26），右栏详情复用。
  - `lucide-react`：**未装**（package.json L11-16 无）→ `npm i lucide-react`。
- **决策**：后端 3 接口已存在（只读消费，不改）；GA 校准接口不存在（置灰/占位，不伪造）。无冲突，直接扩展。

### 3.1 Q1 调研（业界最佳实践 / 顶级团队 / memory 教训）

a) **业界最佳实践**：Codex（OpenAI）左栏主导航 = "一行一个导航项"的干净列，线性 stroke 单色图标 + 简洁数字角标，无 accordion 折叠卡。对标样式而非功能。

b) **顶级团队做法**：DSH 用 **Slot 机制**做 UI 扩展（`dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`），我们部署的 `@synova/dsh-dashboards/lib/client.js` 有 sidebar/nav 组织。**借鉴"导航项组织 + 图标规范"理念，不引代码**（Electron renderer 无 Slot 机制，技术栈不同）。图标库 `lucide-react`（开源 MIT，对标 Codex 线性风格）。

c) **memory/ 教训（本任务相关的历史教训）**：
- **接线失败 4 次**（铁律 0-2）：组件通过单元测试但从未被生产调用。→ 本 spec §8 强制列出**每个新 export 的生产调用点**并 grep 断言。
- **静默降级**（铁律 11/24/31）：catch 空吞或只 console 无 degraded。→ 每个 fetch catch 必须 `console.warn/error` + `degraded` 标志 + 错误 UI。
- **as any 47 次**（铁律 38）：→ 用 `unknown` + 类型守卫 / 内联类型，零 as any。
- **可伪装的接口**（铁律接口审计）：声称接口存在但实际路径错误（D316：dev doc"实测"2 处不实）。→ 本任务 3 接口**逐个 read 源码核验真实路径/形状**（§4.2），不凭派单/设计规格的"建议形状"。
- **撞车**（铁律 0-5）：同一模块同一时间仅一个角色认领。TASK-ROUTING v4 确认 electron-renderer/ 归 Mac DSH 线；D537/D536 领域不重叠。

### 3.2 Q2 范围（做什么 / 不做什么）

**做什么**（最小闭环：入口→交互→结果）：
- 左栏 cap 导航组（4 能力 + 数字角标 + 通用导航）插入搜索之下、最近对话/工作区之上；Lucide 线性图标，无 emoji。
- 右栏 `selectedCap` 状态机（null/reach/loops/action/ga）+ 各能力详情（真实数据渲染）。
- app-store 新增 `selectedCap` + `setSelectedCap` + GA 权限逻辑。
- 3 能力真实接口只读消费（reach/loops/action）+ GA 占位（不伪造）。
- 折叠态（44px 图标条）Lucide 化，点击联动。
- 组件测试（纯逻辑 L1：状态机 + 权限 + 数据映射）。
- `npm i lucide-react`。

**不做什么**（含文件路径，铁律 Q2 排除项）：
- ❌ **不改 `src/`（后端）任何文件**——`src/routes/sentinel.ts`、`src/routes/loops.ts`、`src/routes/actions-api.ts` 等 3 接口**只读消费**，不改后端（派单红线：backend 已存在只读）。
- ❌ **不碰 `scripts/audit/`**（K3 专属，红线）。
- ❌ **不新增 GA 校准接口**——`/api/ga/calibration` 不存在，前端置灰/结构占位，**不伪造一个假接口**（派单红线 + 铁律 8 禁 Mock/TODO 到交付）。
- ❌ **不改 `App.tsx` / `TitleBar.tsx` / 其它 renderer 组件**——能力导航放 LeftPanel 内，右栏分派放 RightPanel 内，均读 store，无需改父组件。
- ❌ **不做后端数据接入的"真实驱动"之外的结构**——3 接口已存在，只接数据；不 refactor 后端。
- ❌ **不引入重 DOM 渲染测试基建**（jsdom + @testing-library/react + renderer vitest config）——见 §7.4，descope 并说明理由。
- ❌ **不改 vitest.config.ts（根）**——不在写集，纯逻辑测试走根 vitest node env。

### 3.3 Q3 验收（入口 → 交互 → 结果，逐条可证伪，即 §10 验收 8 条）

- **入口**：桌面端打开，左栏顶部"产品独有能力"导航组可见（搜索之下、最近对话/工作区之上）。
- **交互**：点击能力项 → 右栏联动详情；再点同一项 → 回默认三标签；GA 项置灰（非 ga 角色）。
- **结果**：reach/loops/action 详情渲染**真实接口数据**；GA 详情占位（ga 角色显示"待后端接入"结构占位）。

### 3.4 Q4 契约与测试（铁律 47/48，写代码前定义）

**新模块/新契约**：
- `electron-renderer/src/stores/capability.ts`（新建，纯逻辑）：
  - `@input` — `current: SelectedCap`, `next: CapabilityId`, `role: string`
  - `@output` — 状态机/权限/标签/元数据
  - `@degraded` — 无（纯函数，不 IO）
  - `@error` — 不抛
- `app-store` 新增 `selectedCap` + `setSelectedCap`：
  - `setSelectedCap(cap: SelectedCap)`: `set({ selectedCap: cap })`
- `RightPanel` 各详情组件（reach/loops/action/ga）：
  - `@input` — 无 props（读 store + fetch）
  - `@output` — 真实数据渲染 / GA 占位
  - `@degraded` — fetch 失败 → `console.warn` + `degraded: true` + 错误 UI（降级提示条）
  - `@error` — `apiFetch` 返回 null（不抛，走 degraded UI）
- `LeftPanel` 角标计数：
  - `@input` — 3 接口返回
  - `@output` — 角标数字 + 红/橙/绿
  - `@degraded` — 接口失败 → 角标隐藏 + `console.warn`（不渲染假数字）

**测试怎么验证**（§7 展开）：L1 纯逻辑单测（状态机 toggleCap 三态切换；canAccessCap 权限矩阵；CAPABILITY_IDS 完整性；badge 色映射；detail 数据映射），node env，无 DOM 依赖。**red→green**：先写测试（现状未实现必失败）→ 实现 → 全绿。接线用 §8 grep 断言生产调用点。**全 DOM 渲染测试 descope（§7.4）。**

---

## 4. Current State（现状，逐条 grep/read 实测）

> 每条声称均当场 grep/read 验证，无自报项（claim-verifier 纪律）。

### 4.1 组件现状

| 文件 | 实测位置 | 现状 | 与设计规格差异 |
|---|---|---|---|
| `electron-renderer/src/components/LeftPanel.tsx` | L11-16 `ICON_ITEMS` = `[{icon:'🔍'...}]` emoji；L4 `open?open:closed`；L74-140 内容区 | 顶部 emoji 图标条，无能力位 | ① emoji 非 Lucide；② 无"产品独有能力"组；③ 折叠态为 emoji 条 |
| `electron-renderer/src/components/RightPanel.tsx` | L9-16 `resolveView`；L173 `GAWorkspaceTabs`；L134 `apiFetch` | 按 role+wsId 出视图；三标签 | 无 `selectedCap`，无能力详情分派 |
| `electron-renderer/src/stores/app-store.ts` | L38 `userRole`；L52 `currentReportId`；L87 `create(...)` | 有 userRole/currentReportId，**无 selectedCap** | 需新增 |
| `electron-renderer/src/styles/global.css` | L8-20 token；L399-428 `.panel-item/.panel-item.active` | 有 token 体系 | 无 `.cap-*` 样式；active 用 `rgba(108,92,231,0.15)` 紫而非蓝 |
| `electron-renderer/package.json` | L11-16 deps | 有 react/zustand，**无 lucide-react** | 需 `npm i lucide-react` |

> **token 修正**：设计规格 §五 引用的 `var(--bg-layer-2)` / `var(--label-primary)` / `var(--label-secondary)` / `var(--fg2)` / `var(--blue)` 在 `global.css` **均不存在**（实测仅 `--bg --panel --border --text --dim --accent(#6c5ce7) --accent2 --red --green --orange --cyan --input`）。**统一用现有 token**：hover=`var(--border)`、正常文字=`var(--text)`、dim=`var(--dim)`、选中=`var(--accent2)`/active 底 `rgba(108,92,231,0.15)`、禁用=`var(--dim)`。色标红/橙/绿用 `--red/--orange/--green`。**勿硬编码颜色到无 token 的地方**（派单红线）。

### 4.2 真实接口形状（读 `src/routes/` 实际返回，非设计 §4.2 建议形状）

> ⚠️ 下表为**逐接口 read 源码得出的真实契约**；设计 §4.2 建议形状仅供参考，**不一致以本表为准**。

| 能力 | 真实路径 | 挂载/认证 | 真实响应形状（实测） | 设计 §4.2 偏差 |
|---|---|---|---|---|
| 主动触达 reach | **`GET /api/sentinel/signals`** | `sentinel.ts:46` `router.get('/signals')`，`server.ts:342` 挂 `/api/sentinel` | `{ ok, total, criticalCount, warningCount, signals: AggregatedSignal[] }`；`AggregatedSignal={id,severity:'critical'\|'warning'\|'info',title,sources:[{sentinelId,sentinelName,finding:SentinelFinding}],entities:string[],recommendedExperts:string[],aggregatedAt,degraded}`；`SentinelFinding={id,severity:'emergency'\|'critical'\|'warning'\|'info',title,description,evidence:string[],suggestion,detectedAt,relatedNodeId?,status?}` | 派单写 `GET /api/signals`（少`/sentinel`）；设计写 `GET /api/signals/top?persona=ga`（错）。**无 `persona_match/time_decay/edge/narrative/actions[]`** |
| 五循环 loops | `GET /api/loops/status` | `loops.ts:80` `router.get('/api/loops/status', jwtAuthMiddleware)`，`server.ts:356` 挂根 | `{ ok, loops:[{loopId,loopName,status,executionCount,lastExecution:{status,startedAt,completedAt?,durationMs}\|null,scales:[{name,triggerType,period,status,nextAt}]}], degraded }`；**6 个 loop**（loop-1..6） | 设计 §3.2"官方 5 循环" -> **实为 6**；设计字段 `name/lastRun/nextRun/recentFinding` -> 实为 `loopId/loopName/status/executionCount/lastExecution/scales` |
| Action 闭环 action | `GET /api/actions` | `actions-api.ts:54` `router.get('/api/actions')`，`server.ts:320` 挂根 | `{ ok, actions:[{id,workspaceId,title,description,status:'pending'\|'confirmed'\|'executing'\|'completed'\|'rejected',priority:'critical'\|'high'\|'medium'\|'low',owner?,createdAt,updatedAt}] }` | 设计 §3.2 字段 `responsibleRole/targetMetric/currentValue/targetValue/tolerance/deadline` -> **实为 title/description/status/priority/owner** |
| GA 协同 ga | **不存在** `/api/ga/calibration` | 实测仅 `/api/ga/clients`、`/api/ga/switch/:orgId`、`/api/ga/annotations*`（ga-admin.ts:66 / ga-annotations.ts:70,147,221） | 无接口 | 设计 §4.2 `GET /api/ga/calibration/pending` -> **不存在**，置灰/结构占位 |

**6 个 loop 名称**（`src/loops/loop-trigger-config.ts` 实测）：`loop-1 Enterprise Diagnosis` / `loop-2 Department Navigation` / `loop-3 GA Evolution` / `loop-4 System Self-Check` / `loop-5 Knowledge Accumulation` / `loop-6 Overflow Monitor`。**前端渲染 `loops.length`，勿硬编码 5 或 6。**

**loop `status` 值**（`src/agent/main-agent.ts` 实测）：`'completed'` / `'failed'` / `'degraded'` / `'pending'`。状态灯映射（防御式，未知值兜底灰）：`completed→绿(--green)`、`failed→红(--red)`、`degraded→橙(--orange)`、`pending/其它→灰(--dim)`。

---

## 5. What We Build（每个产出物 + 文件路径）

> 写集（标"修改/新建"）。**交互层 L1，纯前端，不触 backend。**

### 5.1 写集 (5 修改 + 2 新建)
| 文件 | 操作 | 说明 |
|---|---|---|
| electron-renderer/src/stores/capability.ts | 新建 | **纯逻辑**（零 zustand/react/lucide 依赖，可 node 单测）：`SelectedCap`/`CapabilityId` 类型、`CAPABILITY_IDS`、`toggleCap`、`canAccessCap`、`capabilityLabel`、`badgeColorFor`、`loopStatusColor`。供 store + 左右栏消费。**不 import 任何 React/lucide 组件**（图标映射留在组件层，保纯可测）。 |
| electron-renderer/src/stores/app-store.ts | 修改 | 从 `capability.ts` import 类型；新增 `selectedCap: SelectedCap`（默认 null）+ `setSelectedCap(cap): void`；接 `canAccessCap` 到 GA 项可见逻辑。 |
| electron-renderer/src/components/LeftPanel.tsx | 修改 | ① 顶部 `ICON_ITEMS` emoji → Lucide（Search/MessageSquare/Folder/Bell）；② 内容区**搜索之下、最近对话/工作区之上**插入 `.cap-section`（产品独有能力）：4 个 `.cap-item`（reach/loops/action/ga），Lucide 图标（Radar/RefreshCw/ListChecks/Users）+ 数字角标 + GA 项 ChevronRight；③ `onClick` → `setSelectedCap(toggleCap(selectedCap, id))`，GA 项按 `canAccessCap` 置灰；④ 角标计数在挂载时拉 3 接口（失败 → 隐藏 + console.warn）；⑤ 折叠态 44px 图标条 Lucide 化，点击联动。 |
| electron-renderer/src/components/RightPanel.tsx | 修改 | ① 读 `selectedCap`；② `selectedCap !== null` → 渲染对应详情组件（`ReachDetail`/`LoopsDetail`/`ActionDetail`/`GaDetail`），**覆盖** resolveView 默认视图；`selectedCap === null` → 原 resolveView 三标签不变；③ 详情组件 fetch 真实接口（apiFetch + getApiBase），GA 详情**不发 fetch**，纯结构占位。 |
| electron-renderer/src/styles/global.css | 修改 | 新增 `.cap-section/.cap-section-title/.cap-item(.hover)(.active)(.disabled)/.cap-badge/.cap-chev/.cap-ico`，对齐现有 token（§4.1 token 修正），勿硬编码颜色。 |
| electron-renderer/package.json | 修改 | `dependencies` + `"lucide-react"`（版本号按 npm 最新稳定，`^0.x`）。 |
| tests/electron/capability.test.ts | 新建 | L1 纯逻辑测试（node env，零 DOM/zustand/lucide）：`toggleCap` 三态、`canAccessCap` 权限矩阵、`CAPABILITY_IDS` 完整性、`loopStatusColor`/`badgeColorFor` 映射（normal/degraded/边界/未知兜底）。含 expect，非空壳（铁律 48）。 |

> 说明：`capability.ts` + `capability.test.ts` 是派单"组件测试"与"可测纯逻辑"的落地。把状态机/权限/数据映射抽为纯函数（Anthropic：隔离可测逻辑；避免 Renderer 无 zustand/jsdom 导致不可测）。图标/React 组件映射留在组件层（`LeftPanel`/`RightPanel`），不混入纯逻辑，保前后端边界干净。

### 5.2 能力导航组结构（LeftPanel）

```
┌─ left-panel-content（搜索之下插入）───────────────────┐
│  <div class="cap-section">                            │
│    <div class="cap-section-title">产品独有能力</div>   │
│    <button class="cap-item" data-cap="reach">  <Radar/> 主动触达 <span class="cap-badge">2</span></button>   │
│    <button class="cap-item" data-cap="loops">  <RefreshCw/> 五循环状态 <span class="cap-badge">1</span></button> │
│    <button class="cap-item" data-cap="action"> <ListChecks/> Action 闭环 <span class="cap-badge">2</span></button> │
│    <button class="cap-item" data-cap="ga">      <Users/> GA 协同     <span class="cap-chev">›</span></button>  │
│  </div>                                              │
│  <div class="cap-section">…通用导航（对话/工单/设置）…</div> │
│  …（其后为 最近对话 / 工作区 / GA 客户列表，现状不变）…   │
└──────────────────────────────────────────────────────┘
```

- **Lucide 图标映射**（组件层 import，`size={16} strokeWidth={2}`，`currentColor`）：`Radar`→reach、`RefreshCw`→loops、`ListChecks`→action、`Users`→ga、`MessageSquare`→对话、`Ticket`→工单、`Settings`→设置、`ChevronRight`→收起示意。
- **数字角标**（`.cap-badge`，简洁数字，红/橙/绿）：reach = `signals.criticalCount`(红>0)/`warningCount`(橙>0)/绿；loops = 非 completed 数量（含 failed→红 / degraded→橙）；action = pending+executing 数量（含 critical/high priority→红）。接口失败 → 隐藏角标 + `console.warn`（不渲染假数字，铁律 8/24）。
- **GA 项**：`canAccessCap(userRole,'ga')` 为 false → `.cap-item.disabled`（`--dim`、`pointer-events:none`、`aria-disabled`、tooltip"仅 GA 可用"），**不改隐藏**（产品导航应显示完整能力集，权限是访问控制而非可见性；Codex 风格常见灰色项）。ga 角色 → 可点 + ChevronRight。
- **通用导航**（对话/工单/设置）：`setActiveSection`，现状已有"最近对话"；工单/设置若无内容区，渲染最小 empty 占位（不伪造后端数据）。

### 5.3 右栏 `selectedCap` 状态机（RightPanel）

```
selectedCap ∈ { null, reach, loops, action, ga }

selectedCap === null  → 右栏渲染 resolveView(role, wsId) 结果（＝现状默认，含 GAWorkspaceTabs 三标签）
selectedCap === reach → <ReachDetail/>  ← fetch GET /api/sentinel/signals
selectedCap === loops → <LoopsDetail/>  ← fetch GET /api/loops/status（注意 jwtAuth；失败 degraded 提示）
selectedCap === action→ <ActionDetail/> ← fetch GET /api/actions
selectedCap === ga    → <GaDetail/>     ← **不发 fetch**；结构占位（诊断校准/手动注入/反馈效用 三 empty 子块 + "待后端接入"）
```

- **行为**：`onClick` 能力项 → `setSelectedCap(toggleCap(selectedCap, id))`；再点同一项 → `toggleCap` 返回 null → 右栏回默认。
- **权限**：`canAccessCap` 在 LeftPanel 置灰 GA 项；ga 角色点击 GA → 占位详情。
- **详情组件数据渲染**（真实 shape）：
  - `ReachDetail`：`signals[].severity` 色标 + `signals[].title`（如"N 个哨兵同时指向: X"）+ `entities[]` + `recommendedExperts[]` + `sources[].finding.{title,description,suggestion}` 展开为 Story 卡；`degraded` → 顶部降级提示条。
  - `LoopsDetail`：`loops[]` 每行 `loopName` + 状态灯（§4.2 `loopStatusColor`）+ `executionCount` + `lastExecution.status/startedAt/durationMs` + `scales[].{name,nextAt}`。
  - `ActionDetail`：`actions[]` 每行 `title` + `status` + `priority` + `owner` + `description` + `updatedAt`。
  - `GaDetail`：三空子块 + "GA 人机协同（仅 GA 可见）· 后端校准接口待接入"——**不发 fetch**。

### 5.4 折叠态（44px 图标条，设计 §2.3 + 验收 #6）

折叠态（`--left-panel-collapsed: 44px`，`App.tsx` L70 `leftW=leftPanelOpen?...:44`）左栏只显示 44px 图标条。现状为 emoji；本任务：折叠态渲染 **4 能力 Lucide 图标**（Radar/RefreshCw/ListChecks/Users，16px currentColor），点击 → `setSelectedCap(toggleCap(selectedCap, id))` → 右栏联动（且左栏可从折叠态点开后看展开导航）。通用导航图标（对话/工单/设置）同理 Lucide 化。

### 5.5 图标硬约束（派单/设计 §五）

- Lucide 线性 stroke（默认 stroke=2）、`size={16}`、单色 `currentColor`；**无 emoji、无彩色填充**。
- 图标列 `.cap-ico` 定宽 16px，`color: currentColor`（继承文字色）。
- `as any`=0（铁律 38）；异常 `console.warn/error` + degraded（铁律 24/31）。

---

## 6. What We Don't Do（明确排除，含文件路径）

| 不做 | 原因 |
|---|---|
| 改 `src/`（后端）任何文件：`src/routes/sentinel.ts`、`src/routes/loops.ts`、`src/routes/actions-api.ts` | 3 接口已存在，只读消费（派单红线）；后端归属其它线 |
| 新增 `GET /api/ga/calibration` 或任何 GA 校准伪接口 | 接口不存在；**不伪造**（铁律 8 禁 Mock/TODO 到交付 + 派单红线） |
| 碰 `scripts/audit/` | K3 专属，红线 |
| 改 `App.tsx` / `TitleBar.tsx` / 其它 renderer 组件 | 能力导航在 LeftPanel 内、分派在 RightPanel 内，均读 store，父组件无需改 |
| 引入 DOM 渲染测试基建（jsdom + @testing-library/react + renderer vitest config） | 见 §7.4：本任务以**纯逻辑测试** + 接线 grep + 验收物理断言覆盖；DOM 渲染测试需较大基建，显式 descope |
| 改根 `vitest.config.ts` | 不在写集；纯逻辑测试走根 vitest node env（include `./tests/**/*.test.ts`） |

---

## 7. Test Requirements

> 铁律 0-2（spec→test→impl→wire）/ 48（expect 非空壳）/ 47（契约优先）。三层覆盖（L1 单元 / L2a 接线 / L2b 降级 / L2c 边界）。

### 7.1 L1 单元契约（纯逻辑，node env）

测试文件 `tests/electron/capability.test.ts`，从 `electron-renderer/src/stores/capability.ts` import 纯函数。**red→green 先写后实现**：

| 用例 | 输入 | expect（断言） | 覆盖 |
|---|---|---|---|
| toggleCap 从 null 选中 | `toggleCap(null,'reach')` | `'reach'` | 正常路径 |
| toggleCap 再点同一项→取消 | `toggleCap('reach','reach')` | `null` | 取消选中（验收 #4） |
| toggleCap 切换另一项 | `toggleCap('reach','loops')` | `'loops'` | 状态机切换 |
| canAccessCap ga→ga | `('ga','ga')` | `true` | 权限放行 |
| canAccessCap non-ga→ga | `('admin','ga')`,`('manager','ga')`,`('staff','ga')` | 均 `false` | 权限门控（验收 #5） |
| canAccessCap non-ga→非ga | `('staff','reach')` | `true` | 非 ga 能力对所有人可见 |
| CAPABILITY_IDS 完整性 | `CAPABILITY_IDS` | 含 `['reach','loops','action','ga']` | 4 能力齐全 |
| loopStatusColor 映射 | `'completed'/'failed'/'degraded'/'pending'/'weird'` | 绿/红/橙/灰/灰 | 状态灯 + 未知兜底（L2c 边界） |
| badgeColorFor 映射 | critical>0/warning>0/0 | 红/橙/绿 | 角标色（L2c 边界） |
| badgeColorFor 降级 | 传入 degraded 或 null | `null`（隐藏） | 降级（L2b） |

### 7.2 L2a 接线（新 export 生产调用点，物理 grep 断言）

| 新 export | 生产调用点（须 grep 到） | 断言语义 |
|---|---|---|
| `toggleCap` | `electron-renderer/src/components/LeftPanel.tsx`（onClick） | 有能力导航触发 |
| `canAccessCap` | `LeftPanel.tsx`（GA 项置灰判断） | 权限到达 UI |
| `capabilityLabel`/`CAPABILITY_IDS` | `LeftPanel.tsx`（渲染导航） | 能力集到达 UI |
| `selectedCap`/`setSelectedCap` | `LeftPanel.tsx`（写）+ `RightPanel.tsx`（读） | 状态机两端接通 |
| `.cap-*` 类 | `electron-renderer/src/styles/global.css` + `LeftPanel.tsx` class 引用 | 样式到达节点 |
| 3 详情组件 `ReachDetail/LoopsDetail/ActionDetail/GaDetail` | `RightPanel.tsx`（selectedCap 分派） | 详情接线（生产，非测试） |

### 7.3 L2b 降级（铁律 24/31）

| 场景 | 要求 |
|---|---|
| `GET /api/sentinel/signals` 失败/非 200 | `console.warn` + 详情降级提示条 + 角标隐藏；不渲染假 Story |
| `GET /api/loops/status` 失败/非 200 | `console.warn` + '降级：循环状态不可用'；`degraded:true` 传播显示 |
| `GET /api/actions` 失败/非 200 | `console.warn` + 降级提示；**不静默吞** |
| 角标拉取失败 | 隐藏角标 + `console.warn`（不显示"0"假计数） |
| `resolveView` 返回非预期字符串 | 兜底渲染空态（现状已有 readonly 兜底） |

### 7.4 排除 L2c/DOM 渲染测试（显式 descope + 理由）

**不写** React 组件挂载渲染快照/交互测试（无 jsdom/无 testing-library/无 renderer vitest config，且 `npm i` 在 main tree 尚未装 zustand/jsdom）。理由：引入 jsdom + @testing-library/react + renderer vitest 配置 + 头图是**另一个基建任务**，超出本 slice 写集（派单红线"可碰"5 文件 + 纯逻辑测试）。**替代**：① 纯逻辑测试覆盖状态机/权限/数据映射（L1）；② 接线 grep 覆盖"联动/接线"（L2a）；③ §10 验收物理断言（设计规格 §六 8 条）+ 手动截图/容器运行核对。若 CTO/创始人要求组件级 DOM 测试，另起 FIX/基建任务（本 spec 不伪称覆盖）。

---

## 8. Wiring Verification

> 标题固定 `Wiring Verification`（D381 gatekeeper C4）。每个"新 export → 生产调用点"须 grep 实测，禁凭架构文档推断（D381 接线纪律——实测教训：描述调用方与真实调用方不一致）。

| 变更 | 验证命令（物理） | 期望 |
|---|---|---|
| `capability.ts` 被 store 消费 | `grep -rn "from '../stores/capability'\|stores/capability" electron-renderer/src --include=*.ts*` | ≥2（app-store + 组件） |
| `selectedCap`|`setSelectedCap` 在组件生产调用 | `grep -rn "selectedCap\|setSelectedCap" electron-renderer/src/components --include=*.tsx` | LeftPanel(写) + RightPanel(读) 均有 |
| `toggleCap` 生产调用 | `grep -rn "toggleCap" electron-renderer/src --include=*.tsx` | LeftPanel onClick |
| `canAccessCap` 生产调用 | `grep -rn "canAccessCap" electron-renderer/src --include=*.tsx` | LeftPanel GA 项置灰 |
| reach 接真数据 | `grep -rn "api/sentinel/signals" electron-renderer/src --include=*.tsx` | ReachDetail fetch |
| loops 接真数据 | `grep -rn "api/loops/status" electron-renderer/src --include=*.tsx` | LoopsDetail fetch |
| action 接真数据 | `grep -rn "api/actions" electron-renderer/src --include=*.tsx` | ActionDetail fetch |
| GA 无 fetch（不伪造） | `grep -rn "api/ga/calibration" electron-renderer/src --include=*.tsx` | **零结果**（严禁伪造伪接口） |
| lucide 图标 | `grep -rn "lucide-react" electron-renderer/package.json` + `grep -rn "from 'lucide-react'" electron-renderer/src --include=*.tsx` | dep 存在 + 组件 import |

> **zero-wiring 反例（禁）**：`toggleCap`/`SelectedCap` 类型只被 `capability.test.ts` 引用而无生产调用 = 接线失败（铁律 0-2）。上线前 grep 确认每个新 export 至少 1 个**生产**调用点（测试调用不计，S-3）。

---

## 9. Architecture Layer

**L1（交互层，electron-renderer）**。理由：
- 改动全部在 `electron-renderer/`（桌面端品牌表层），是 L1 交互层 UI，不触 backend。
- 3 能力接口消费走 `fetch(getApiBase()+path)` → L1 通过 HTTP 调用 L1 对外 API（routes），**不直接触 L3/L4/L5**（铁律 39 合规——L1 通过 L2 HTTP API 拿数据，前端不 import 后端模块）。
- 纯逻辑 `capability.ts` 是 L1 内部状态契约，五层边界内。
- 架构门禁 `check-architecture.sh`：本任务改 electron-renderer，不涉及 src/ 五层跨层；无 src/ 改动，天然通过。

---

## 10. Completion Standard（可验证，入口→交互→结果）

> 设计规格 §六 8 条 + 派单接线断言，逐条给可证伪判据（K3 可核，非声称）。

1. **左栏能力位**：cap-section 出现在搜索之下、最近对话/工作区之上；4 能力一项一行；无折叠卡片边框。→ 目视 + 容器截图；DOM class 断言 `.cap-section`/`.cap-item` 存在。
2. **图标风格**：全部 Lucide 线性 SVG（16px currentColor），React.render 无 emoji；能力 Radar/RefreshCw/ListChecks/Users，通用 MessageSquare/Ticket/Settings，折叠 ChevronRight。→ grep 源码无 emoji（🔍💬📁🔔 等已删）+ lucide-react import 断言。
3. **右栏联动（真数据）**：点"主动触达"→ 渲染 `GET /api/sentinel/signals` 真实 signals（severity/title/entities/sources[].finding）；"五循环"→ `GET /api/loops/status` 真实 loops（loopName/status 灯）；"Action"→ `GET /api/actions` 真实 actions；"GA"→ **占位不伪造**。→ 接线 grep + 每条 fetch 有真实接口 URL（§8）+ degraded 处理有 console.warn。
4. **取消选中**：再点同一项 → 右栏回默认三标签。→ `toggleCap` 单测 `('reach','reach')→null` + 点击行为（React 状态）。
5. **GA 权限**：非 ga 角色（admin/staff）GA 项置灰（`.cap-item.disabled`，不可点）；ga 角色可点。→ `canAccessCap` 单测权限矩阵 + 置灰 class 断言。
6. **折叠态**：44px 图标条 Lucide 化（Radar/RefreshCw/ListChecks/Users），点击右栏联动。→ grep 折叠态渲染 Lucide 图标 + onClick setSelectedCap。
7. **代码质量**：`as any`=0（grep 零结果）；新 export 有生产调用方（§8）；异常 console.warn/error + degraded；测试 expect 断言（§7）。→ grep + 测试运行 + tsc。
8. **术语**：界面无 "FDE"，统一 "GA"。→ grep `electron-renderer/src` 无孤立 "FDE" 字符串（注释/展示）。

---

## 11. Auth Doc References

- [设计规格 v1（Win 侧 Codex 推送，创始人确认）](.wt-D537/docs/synova/coordination/SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1.md) — 本任务主依据（§六 8 条验收直接引用）
- [派单 D538](docs/synova/coordination/派单-D538-前端左栏Codex-20260826.md) — 写集红线 + 接线修正 + 验收 8 条
- [PRODUCT-BRIEF.md](.claude/PRODUCT-BRIEF.md) — 北星锚定（§四/§五）
- [AGENTS.md 铁律](/Users/wane/SynovaAgent/AGENTS.md) — 0-2 接线 / 8 / 11 / 24 / 31 / 38 / 39 / 47 / 48
- [D352 dev doc 范例](docs/plans/codex/implementation/SYNOVA-IMPL-D352-resolver硬化-20260813.md) — 结构对齐（写集表 / 权威引用带原文 / 缺陷分节 / red→green / 决策参考 / DS 对应 / 自检清单）
- 真实接口源码（只读生产事实）：`src/routes/sentinel.ts:46`、`src/routes/loops.ts:80`、`src/routes/actions-api.ts:54`、`src/server.ts:320/342/356`、`src/agent/sentinel-service.ts:125`、`src/sentinel/signal-aggregator.ts:24`、`src/sentinel/types.ts:41`、`src/loops/loop-trigger-config.ts:57-196`、`src/agent/main-agent.ts:111-316`

---

## 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| GA 项置灰 vs 隐藏 | A 隐藏 / B 置灰禁用 | 第一性原理（产品导航应显示完整能力集，权限=访问控制非可见性）+ Codex 风格（常见灰色项）+ Anthropic（fail-closed：显示 gated，不伪造访问） | **B 置灰禁用**——`.cap-item.disabled` + tooltip"仅 GA 可用"；满足验收 #5"看不到/置灰"（取置灰） |
| 测试范围 | A 纯逻辑单测 / B 加 DOM 渲染测试 | 第一性原理（最小机制；Renderer 主树无 zustand/jsdom，DOM 测试需大基建）+ Anthropic（隔离可测逻辑） | **A**——纯逻辑测试覆盖状态机/权限/数据映射 + 接线 grep + 验收物理断言；DOM 测试 descope（§7.4），另起基建任务 |
| 循环数量硬编码 | A 硬编码 5 / B 动态 loops.length | 第一性原理（数据来自 backend，勿与真实耦合）+ 实测（backend 6 个 loop） | **B 动态 loops.length**——设计"5 循环"是伪信息，前端写死 = 与真实耦合，K3 会抓 |
| badge 数据源 | A 挂载拉 3 接口 / B 点选时拉 | 少机制（一次挂载拉，读小程序）+ 失败降级明确 | **A 挂载拉取计数 + 失败隐藏角标**（角标属左栏导航，需展示现状；点选详情再拉一次，幂等） |
| 接口路径 | A 照派单 `GET /api/signals` / B 照实测 `GET /api/sentinel/signals` | 第一性原理（以生产事实为准；D316 教训：接口可伪装） | **B 实测路径**——派单少了 `/sentinel` 前缀，已修正（§4.2） |

> **参考：Anthropic（fail-closed + 隔离可测 + 契约优先）+ Codex/DSH 理念（导航组织 + 线性图标）+ 第一性原理（以生产事实为准，禁伪造）**。收敛检查：各参考系指向一致，无分歧。

---

## 自检清单

- [x] 北星 front-matter 已写（PRODUCT-BRIEF §四/§五 锚定）
- [x] 3 接口**逐个 read 源码**核验真实路径/形状（§4.2），修正派单 `GET /api/signals`→`/api/sentinel/signals`、设计"5循环"→实 6 循环、Action shape 偏差
- [x] 现状 grep/read 实测（§4.1）：LeftPanel ICON_ITEMS emoji / RightPanel resolveView / app-store 无 selectedCap / lucide-react 未装 / token 无设计所引 --bg-layer-2 等
- [x] GA 校准接口确认不存在（仅 /api/ga/clients|switch|annotations*，无 calibration）→ 占位不伪造（§6 + §8 zero-wiring 断言）
- [x] 写集表（5 修改 + 2 新建）+ 生产调用点（§8，防接线失败）
- [x] 测试 red→green 表（§7.1）+ 降级（§7.3）+ descope 说明（§7.4）
- [x] 决策参考（S-12）：GA 置灰/测试范围/循环数/badge/接口路径 五决策点收敛
- [x] 验收 8 条（设计 §六）+ 接线断言逐条给可证伪判据（§10）
- [x] 术语统一 GA（无 FDE）；as any=0（铁律 38）
- [x] 不是凭记忆 / 不用 --no-verify（本 dev doc 只写文档不写代码）

> **交付边界**：本 dev doc 只写规格（不含实现代码）。编码 session 按 §5 写集实现 + §7 测试 + §10 验收 + task-state/D538 回填；走 DSH 预审 + K3 审计；验收 = 8 条逐条对照（截图/测试断言，非声称）。
