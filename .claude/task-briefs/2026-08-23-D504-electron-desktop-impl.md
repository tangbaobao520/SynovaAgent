# Task Brief: D504 Electron 桌面端一体化实现

> 生成: 2026-08-23 03:56:38 | 分支: main | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.5.0 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）

本任务属于哪个系统（GA诊断/哨兵/基础设施）？触及哪层？该层现有模块？新增/替换/扩展？
GA诊断系统的 L1 交互层（Electron 桌面载体）。扩展 electron/main.cjs（153 行瘦客户端：BrowserWindow/Tray/checkServer/离线页）+ 接线 electron-renderer/（36 文件 React 对话 UI，已实现 useStreaming consult SSE 但从未被 main.cjs 加载）。新增 electron/backend-spawn.cjs（服务自启）。

### b) 文件审计
grep 本任务关键词在 expert/ sentinel/ extensions/ knowledge/ theory/ skills/ 中。列出已有文件驱动模块。关系: 复用 / 扩展 / 新建 / 冲突
grep "spawn|ensureBackend" electron/ 零命中（服务自启 0 处实现）。grep "fetch(" electron-renderer/src → 8 处调用点（App.tsx:49 /health、useStreaming.ts:179 consult、LeftPanel.tsx:37/45 ga、useNotifications.ts:33/54/67、RightPanel.tsx:136 apiFetch+API_BASE=''）——比 spec §5.1 列的 2 处多，铁律 9 全部接线（统一封装 src/lib/api.ts）。复用：preload.cjs getServerUrl、vite proxy、src/config.ts:90 SYNOVA_DB_PATH（只读）、src/routes/healthz.ts:323（探活只读）。关系：扩展+接线，无冲突。

### c) 决策
已有覆盖→复用，不准新建硬编码。无覆盖→新建走文件驱动（属扩展解耦）。冲突→取消任务，复用已有。
冲突取舍/多选项/架构选择 → 走 DECISION-REFERENCE 四步框架（docs/synova/coordination/DECISION-REFERENCE.md），结论写入 Q1c 决策参考系。
决策走 dev doc §5.3 四决策点（已收敛）：服务自启=Electron 进程内 spawn（非系统服务/非内嵌 node）；CI 打包只 --dir；renderer 生产态 loadFile + base URL；数据目录 SYNOVA_DB_PATH 注入 userData。参考：Anthropic+DeepSeek+第一性原理 + 结论（D504 spec §5.3，K3 可核）。



## 注入上下文
### DECISION-REFERENCE

> D333 决策参考框架全文（创始人 2026-08-13 定）:

# 决策参考框架（双参考系）

> 2026-08-13 创始人定 | 用途：遇到难决策/多选项/最佳实践选择时，强制走四步参考，并记录所用参考系
> 触发条件：①多选项需取舍 ②设计/架构方案选择 ③优先级排序 ④"最佳实践是什么"类问题 ⑤实现与文档声称冲突时

## 四步框架

```
① 第一性原理（DeepSeek/梁文峰）：这个问题的最简本质是什么？最少机制能解决吗？
② Anthropic 工程基线：隔离/失败即关闭/脚本验证/机器可验契约——哪条适用？
③ 开源实证（DeepSeek）：有可克隆的代码/架构参考吗？clone 下来看实际做法（成本/效率/结构）
④ 收敛检查：两参考系是否指向同一答案？收敛 = 大概率正确；分歧 = 值得深挖
```

## 双参考系边界

| 参考系 | 适用 | 不适用 |
|--------|------|--------|
| **Anthropic 工程实践** | agent 隔离、门禁/fail-closed、脚本化验证、机器可验契约、并行协作 | 成本/产品定位/模型选择 |
| **DeepSeek 第一性原理 + 开源实证** | 产品哲学、成本/效率/架构取舍、反内卷、开源参考（clone 仓库） | 工程流程细节（其仓库是模型/推理代码，非 agent 协作） |

## 梁文峰原则摘要（DeepSeek 参考时使用）

- **第一性原理**：不做无意义的炫技，回到问题本质
- **极致成本**：能用最少机制解决就不用多的（这正好支持"worktree 隔离 = 最少机制"而非 N 个门禁）
- **开源开放**：能参考开源实证就不闭门造车
- **反内卷**：机制是为了减少摩擦，不是为了增加流程

## 记录要求（可验证，不靠记忆）

- Codex 决策：在 dev doc / 本会话回复中**明确写"参考：Anthropic/DeepSeek/第一性原理 + 结论"**
- Claude Code 决策：dev doc 要求完成报告含**决策记录**（决策点 + 参考系 + 理由），K3 审计可核

## 已用案例

| 日期 | 决策 | 参考系 | 结论 |
|------|------|--------|------|
| 2026-08-13 | 并行 agent 冲突（串行 vs 并行） | Anthropic（隔离基线）+ DeepSeek（最少机制） | 收敛：worktree 隔离（D307）优先解锁并行 |


## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — 定义「怎么算做完」
  ② 测试 — 先写测试，测试 = 产品的一部分
  ③ 实现 — 刚好满足以下全部条件：
     - Done 标准中列出的所有完成项
     - 测试全部通过
     - 接线完整（新 export 有引用）
     - 错误路径有 log + degraded
     - tsc + vitest 零失败
  ④ 接线 — 端到端走通（入口可触达 + 链路完整 + 结果可见）
  ⑤ 验证 — 自检 6 问（接线/异常/类型/测试/残留/文件驱动）

引用依据（至少引用两项）：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 7: 入口可触达 + 完整链路走通 + 结果可见
  - 铁律 24+31: 错误处理 + 降级信号
  - 铁律 33: 测试命名约定
  - memory/ 中的历史教训文件

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
根据决策链和本任务特点，提炼 2-3 条必须遵守的规则。每条 rule 必须包含 verify 命令。
例如:
  - rule: "修改 manifest.json 后必须验证 sentinel-loader.ts 能正确解析"
    verify: "grep -rn '新字段名' src/sentinel/sentinel-loader.ts"
  - rule: "新增 export 必须在 pre-commit 组 4 有引用"
    verify: "grep -rn '新函数名' src/"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
按 DECISION-REFERENCE 四步框架（docs/synova/coordination/DECISION-REFERENCE.md）执行，并将结论记录在本字段：
  ① 第一性原理 — 问题的最简本质是什么？最少机制能解决吗？
  ② Anthropic 工程基线 — 隔离/失败即关闭/脚本验证/机器可验契约，哪条适用？
  ③ 开源实证 — 有可克隆的代码/架构参考吗？clone 下来看实际做法
  ④ 收敛检查 — 两参考系是否指向同一答案？收敛 = 大概率正确；分歧 = 值得深挖
决策记录格式（K3 审计可核）: 参考：Anthropic/DeepSeek/第一性原理 + 结论
简单决策（无冲突、单一路径）只需记录参考系名。

### d) 相关 Note 引用
- [ ] memory/notes/<四态>/YYYY-MM-DD-<主题>.md（本任务决策沉淀到哪条 Note；无则新建 proposed）

## Q2: 范围 — 正确的最简方案是什么？

做什么：实现 dev doc SYNOVA-IMPL-DSH-D504（feat/d504-dev-doc 分支，commit 3c79328d）的全部写集
- electron/backend-spawn.cjs — ensureBackend 探活/spawn/重启限次/stop 契约（纯 Node 可无头测试）
- electron/main.cjs — whenReady 集成 ensureBackend + isPackaged 双引导分支 + before-quit stop
- build-synova.cjs — extraResources（后端 dist/extensions/renderer 产物）+ files 补 backend-spawn
- electron/package.json — pack/pack:dir 脚本
- electron-renderer/vite.config.ts — proxy 3000→18790（缺陷 D）
- electron-renderer/index.html — vite 构建入口（实测缺失——renderer 从未可构建，补齐）
- scripts/golden-scenarios/GS-01-first-diagnosis/expect.json — D504 断言组 4 条（L1-1/L1-4/L1-5/L1-7）
- electron-renderer/src/lib/api.ts — getApiBase 统一封装（新增）
- electron-renderer/src/App.tsx — /health fetch 带 base URL
- electron-renderer/src/hooks/useStreaming.ts — consult fetch 带 base URL
- electron-renderer/src/hooks/useNotifications.ts — 3 处 fetch 带 base URL（铁律 9 补全）
- electron-renderer/src/components/LeftPanel.tsx — 2 处 fetch 带 base URL（铁律 9 补全）
- electron-renderer/src/components/RightPanel.tsx — API_BASE 接 getApiBase（铁律 9 补全）
- electron-renderer/src/ipc/bridge.ts — ElectronAPI 接口补 getServerUrl
- scripts/golden-scenarios/GS-01-first-diagnosis/run.sh — Electron 产物断言组
- tests/electron/backend-spawn.test.ts — spawn 契约三路径 ≥8 用例
- tests/electron/desktop-build.test.ts — 打包配置/renderer 接线静态断言
- .gitignore — 反例外 !electron-renderer/index.html（*.html 全局忽略导致 renderer 入口从未入库——从未可构建根因之一）
- task-state/D504.json — impl 状态登记
不做什么（Q2 排除项，含文件路径）：
- 不改 src/ 任何文件（Win 领地红线——服务自启 = spawn + 环境变量注入）
- 不做 auto-update/代码签名（build-synova.cjs publish 保持注释）
- 不做 Linux 安装包实测（CI 只 --dir）
- 不重构 renderer UI/不新增页面
- 不跑真实 LLM 首诊全链路（GS-01 契约级断言保持 D446 诚实 RED）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：双击安装包（prod）/ npm run electron:dev（dev）→ main.cjs app.whenReady → ensureBackend 自启后端
处理（中间经过哪些步骤）：探活 /api/healthz → 不可达则 spawn 后端（dev: npx tsx；prod: node dist/index.js + SYNOVA_DB_PATH=userData）→ 探活轮询 ≤60s → 窗口加载 renderer 产物（prod loadFile）或 dev 页面
结果（最终展示在哪）：桌面窗口打开即用（对话 UI + consult SSE 首诊链路）；spawn 失败 → 离线页 + degraded 提示（不静默）；GS-01 增强断言 exit 0 + evidence 入库

## 架构层: 基础设施
L1（交互层——Electron 主进程/renderer 经 HTTP 调 L2 API，不直连 L4/L5）
#CRITERIA: A
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] 入口可触达: grep "ensureBackend" electron/main.cjs 非零（WIRE CHECK）
- [ ] 链路走通: tests/electron/backend-spawn.test.ts + desktop-build.test.ts 全过；vitest --changed 零失败
- [ ] 结果可见: GS-01 增强断言 exit 0（Electron 产物 + spawn 契约 + renderer 产物）+ evidence JSON 入库
