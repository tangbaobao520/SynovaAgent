# SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1

> 归属：DeepSeek Harness（DSH）· 交互设计 | 2026-08-26
> 定位：**设计规格文档（只读交付物，不做任何代码改动）**。供实现者据此改 `electron-renderer/`。
> 前置：本设计已与创始人确认 —— 左栏顶部采用 **Codex 主导航风格**（干净的一行导航项），去掉"折叠卡片 accordion"。

---

## 〇、本文档范围与非范围（铁律声明）

**本文档做什么**：把"左栏顶部产品独有能力位 + 右栏联动"的交互设计固化，给实现者一份可直接开工的规格。

**本文档不做什么**：
- ❌ 不改 `electron-renderer/` 任何代码、`.tsx`、`.css`
- ❌ 不新增/修改 `src/` 任何文件
- ❌ 不碰 `scripts/audit/`、`src/server.ts`（红线）
- ❌ 不含后端数据接入的具体实现（只给出建议接口形状，供实现者验证）

**设计依据**（已实读）：Module-1 主动触达引擎 / Module-3 GA人机协同与反馈闭环 / Module-4 Loop循环交互体现 / Module-5 Action闭环设计 / Module-6 报告形态引擎。术语统一：**GA（Growth Advisor）**，已全局替换 FDE→GA（见另文）。

---

## 一、设计结论（创始人口径）

左栏顶部 = **产品独有能力主导航**，采用 Codex 那种"一行一个导航项"的干净样式，**不要折叠卡片（accordion）**。

```
┌─ 左栏顶部：产品独有能力位 ─────────────────────────────┐
│  Synova ▾                    [搜索⌕]                │ ← 品牌行（可下拉）+ 全局搜索（Lucide Search）
│  ───────────────────────────────────────────────    │
│  产品独有能力                                       │
│  [Radar]      主动触达   (2)                        │ ← Linear 图标 + 简洁数字角标
│  [RefreshCw]  五循环状态 (1)                        │
│  [ListChecks] Action闭环 (2)                        │
│  [Users]      GA 协同    ›                          │ ← ChevronRight 收起（GA 专属）
│  ───────────────────────────────────────────────    │
│  [MessageSquare] 对话 / [Ticket] 工单 / [Settings] 设置 │ ← 通用导航（Linear）
│  ───────────────────────────────────────────────    │
│  项目/客户（Projects 分组）...                       │
└──────────────────────────────────────────────────┘
```

**图标规范（本设计关键，对标 Codex）**：全部为 **Lucide 线性 stroke 图标**（`lucide-react`），**单色 `currentColor`、16px**，**无 emoji、无彩色填充**。角标为**简洁数字**（小号紧凑胶囊），非花哨样式。详见 §五。

**核心行为**：点击能力导航项 → **右栏联动**展示该能力详情；再点击同一项 → 取消选中，右栏回到"行动/报告/工单"三标签。左栏始终保持干干净净的一列导航项。

---

## 二、左栏改造规格（LeftPanel.tsx）

### 2.1 目标：用"主导航项"替换"折叠卡片"

#### 现状（当前 `LeftPanel.tsx`）
- 顶部是 `ICON_ITEMS` 图标条（搜索/对话/工作区/通知）
- 下方 `left-panel-content`：搜索 → 最近对话 → 工作区 → （GA）客户列表
- **无"产品独有能力位"**，无能力导航项

#### 新增：产品独有能力位（主导航区）
在"搜索"之下、"最近对话/工作区"之上，插入一个**能力导航组**。每个能力是一个 `nav-item` 行：

```
[Nav 结构]  — 图标用 Lucide 线性 SVG（单色 currentColor，16px），非 emoji
<div class="cap-section">
  <div class="cap-section-title">产品独有能力</div>
  <div class="cap-item" data-cap="reach">  <Radar/> 主动触达  <span class="cap-badge">2</span></div>
  <div class="cap-item" data-cap="loops">  <RefreshCw/> 五循环状态  <span class="cap-badge">1</span></div>
  <div class="cap-item" data-cap="action"> <ListChecks/> Action 闭环 <span class="cap-badge">2</span></div>
  <div class="cap-item" data-cap="ga">     <Users/> GA 协同     <span class="cap-chev">›</span></div>
</div>
```

**Lucide 图标映射**（`lucide-react`）：

| 能力 | Lucide 图标 | 命名 | 备注 |
|---|---|---|---|
| 主动触达 | Radar | `Radar` | 信号扫描/触达语义 |
| 五循环状态 | RefreshCw | `RefreshCw` | 循环/周期性 |
| Action 闭环 | ListChecks | `ListChecks` | 执行清单 |
| GA 协同 | Users | `Users` | 人机协同 |
| 对话 | MessageSquare | `MessageSquare` | 通用导航 |
| 工单 | Ticket | `Ticket` | 通用导航 |
| 设置 | Settings | `Settings` | 通用导航 |
| 收起箭头 | ChevronRight | `ChevronRight` | 折叠示意 |

**图标规范（对标 Codex）**：
- 全部 **线性 stroke**（`lucide-react` 默认，stroke=2），**单色 `currentColor`**，尺寸 **16px**
- 不用 emoji、不用彩色、不用填充图标
- 颜色继承文字色（正常 = `var(--label-primary)`，hover/active 加深或高亮，disabled = `var(--label-secondary)`）

### 2.2 交互规格
| 行为 | 规格 |
|---|---|
| 悬停 | `cap-item:hover` 背景变深（`var(--bg-layer-2)` 或等价 token）|
| 选中 | `cap-item.active` 浅蓝底 + 字重加粗（对齐选中高亮）|
| 点击 | 触发"选中能力" → **右栏联动**（见 §三）|
| 再次点击同一项 | 取消选中 → 右栏回到默认三标签 |
| 角标 | **简洁数字角标**（size 小，8px 高圆角胶囊，字重中等）。语义同 Codex 的"有未读/有 N 条"：红=高优先级、橙=关注、绿=正常。GA 协同无角标，用 `ChevronRight ›` 收起示意。**不用 emoji、不用花哨角标** |

### 2.3 折叠态（左栏收起）
收起后为 44-48px **Lucide 线性图标条**（Radar/RefreshCw/ListChecks/Users 对应 4 能力），点击图标 → 右栏联动对应能力。等同"主导航项"的图标条形态。所有图标同为 16px 单色线性。

---

## 三、右栏联动规格（RightPanel.tsx）

### 3.1 状态机
```
selectedCap ∈ { null, reach, loops, action, ga }

selectedCap === null  → 右栏显示默认三标签：行动 / 报告 / 工单（现状不变）
selectedCap === reach → 右栏显示"主动触达"详情（信号 Story 列表）
selectedCap === loops → 右栏显示"五循环状态"（官方 5 循环状态灯）
selectedCap === action → 右栏显示"Action 闭环"（行动项 + 自我报告）
selectedCap === ga    → 右栏显示"GA 人机协同"（校准/注入/效用，仅 GA 可见）
```

### 3.2 各能力详情内容（建议，供实现填充真实数据）

#### 主动触达（reach，图标 Radar）
- 头部：`主动触达 · 排序优先级`
- 内容：信号 **Story 卡片**列表。每条含：
  - 标题（如"💧 现金跑道仅剩 2.3 个月"）
  - 叙事正文（发生了什么 / 为什么重要 / 可能根因）
  - **追问按钮**：[现金结构分析] [应收催收方案] [暂不处理]
- 数据建议：`{ priority, severity, persona_match, time_decay, edge, title, narrative, actions[] }`

#### 五循环状态（loops，图标 RefreshCw）
- 头部：`五循环状态 · 官方 5 循环`
- 内容：5 行循环状态（企业诊断 / 部门导航 / GA进化 / 系统自检 / 知识积累），每行：名称 + 状态灯（绿=正常/橙=关注/红=断裂）
- 数据建议：`{ name, status: 'normal'|'watch'|'broken', lastRun, nextRun, recentFinding }`

#### Action 闭环（action，图标 ListChecks）
- 头部：`Action 闭环 · 执行承诺`
- 内容：行动项列表（负责人 / 状态 / 目标指标 / 当前值 vs 目标值 / 截止 / 偏离预警），+ 自我报告入口（今日/本周简报）
- 数据建议：`{ id, description, responsibleRole, status, targetMetric, currentValue, targetValue, tolerance, deadline }`

#### GA 协同（ga，图标 Users）—— 仅 GA 可见
- 头部：`GA 人机协同（仅 GA 可见）`
- 内容：
  - 🧬 诊断校准面板：Agent 结论待审（标记错误/补背景/重写逻辑/降级标记）
  - 📥 手动信号注入：+ 新增（线下黑域信息 → 系统）
  - 📊 反馈效用仪表：纠错/信号/采纳率
- 权限：`userRole === 'ga'` 才显示；否则该导航项可隐藏或置灰（由实现者按角色态决定）

---

## 四、状态与接口建议（供实现者验证，非强制）

### 4.1 状态存放（app-store.ts）
建议新增：
```ts
selectedCap: null | 'reach' | 'loops' | 'action' | 'ga';
setSelectedCap(cap): void;
```
复用现有 `userRole` 判断 GA 权限。

### 4.2 建议数据接口（对接后端，形状仅供参考）
| 能力 | 建议接口 | 返回形状 |
|---|---|---|
| 主动触达 | `GET /api/signals/top?persona=ga` | `{ signals: SignalStory[] }` |
| 五循环 | `GET /api/loops/status` | `{ loops: LoopStatus[] }` |
| Action | `GET /api/actions` | `{ actions: ActionItem[] }` |
| GA 校准 | `GET /api/ga/calibration/pending` | `{ pending: CalibrationItem[] }` |

> ⚠️ 这些接口**当前可能不存在**。实现者需先确认后端是否已提供；未提供则本设计只到"前端能显示的结构"，后端接入另议。本设计不伪造接口。

---

## 五、样式建议（global.css 增量，供实现者参考）

对齐现有 `electron-renderer/src/styles/global.css` 的 token 命名：
- `.cap-item`：padding 8px 10px，border-radius 8px，display flex, gap 8px
- `.cap-item:hover`：`background: var(--bg-layer-2)` 或等效
- `.cap-item.active`：`background: rgba(64,128,255,.12); font-weight:700`
- `.cap-badge`：**简洁数字角标**——小号（高 8px）圆角胶囊，字重中等；红 `#e74c3c`（高优先级）、橙 `#e67e22`（关注）、绿 `#2ecc71`（正常）；同 Codex"有 N 条"的克制样式，不喧宾夺主
- `.cap-chev`：折叠示意 `ChevronRight ›`
- 图标列 `.cap-ico`：**宽 16px 定宽，`color: currentColor`**（继承文字色，不硬编码颜色）；Lucide stroke 线性，stroke≈2

> 使用现有 CSS 变量 + Lucide（currentColor），勿硬编码颜色到无 token 的地方。`as any` 零容忍（铁律 38）。

**图标引入**（实现者）：
- `npm i lucide-react`（仓库已是 React 栈）
- `import { Radar, RefreshCw, ListChecks, Users, MessageSquare, Ticket, Settings, ChevronRight } from 'lucide-react'`
- 渲染为 `<Radar size={16} strokeWidth={2} />`，沿用组件默认 `currentColor`

---

## 六、验收标准（实现者 Done 判据，可证伪）

1. **左栏**：产品独有能力位出现在搜索之下、最近对话/工作区之上，4 个能力导航项一行一个，无折叠卡片边框。
2. **图标风格**：所有图标为 **Lucide 线性 SVG**（stroke、16px、单色 currentColor），**无任何 emoji**。能力项对应 Radar/RefreshCw/ListChecks/Users；通用导航 MessageSquare/Ticket/Settings；折叠 ChevronRight。
3. **右栏联动**：点击"主动触达"→ 右栏显示信号 Story 列表；点击"五循环状态"→ 显示 5 循环状态灯；点击"Action 闭环"→ 显示行动项；点击"GA 协同"→ 显示 GA 校准面板。
4. **取消选中**：再点同一能力项 → 右栏回到"行动/报告/工单"三标签。
5. **GA 权限**：非 GA 角色看不到/置灰"GA 协同"。
6. **折叠态**：左栏收起后为 Lucide 线性图标条（Radar/RefreshCw/ListChecks/Users），点击图标右栏联动。
7. **代码质量**：`as any` = 0；新导出有调用方（铁律 0-2 接线）；异常有 log + degraded（铁律 24+31）；测试有 expect（铁律 48）。
8. **术语**：界面无 "FDE"，统一 "GA"。

---

## 七、交付方式

本设计为 **DSH 线 dev doc**（只读交付物），编号 `SYNOVA-IMPL-DSH-前端交互设计-左栏Codex风格-v1`。**不改任何代码。** 实现由认领 `electron-renderer/` 的角色按本规格进行，另起 task brief / dev doc / PR，并走 DSH 预审 + K3 审计。

---

> 下一版待确认项：① 是否把"能力导航"上移到品牌行正下（贴近 Codex New chat 在 Projects 上面的位置）？② 是否需要"默认全部收起、仅显示图标+标题"的更紧凑态？③ 是否把 DSH 式输入框（多行自适应/模式/LLM）也纳入本设计？
