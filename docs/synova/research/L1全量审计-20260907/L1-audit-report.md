# SynovaAgent L1 交互层全量审计报告

> 派单: 创始人 | 审计: CTO（DSH 线） | 日期: 2026-09-07（2026-09-08 复核修订: 补 §3.6 逐文件 DSH 对标速查、§5 明确零 import 结论、修正 §0 文件计数/P0-1 凭证表述/§2 行B 锚点、补 MCP 工具缺口清单）
> 性质: **架构盘点与收工规划**（非 K3 审计，不定义审计标准）
> 基线: 创始人指令给定 ad617ed6；实际审计基于 origin/main @ d3dcfb9e（ad617ed6 的直接后代，+7 提交，含 D587/D588 dev doc）。分支 `research/l1-full-audit`。
> 红线遵守: 零源码修改（本 PR 仅新增本报告 + task-state 取号壳）；DSH 源码只读；未触碰 scripts/audit/、scripts/product-lines/。

---

## 0. 审计方法

1. **逐文件盘点**: 范围内 137 个源文件（routes 51 + agent L1 相关 6 + tui-v2 23 + tui-v3 3 + l1-interaction 3 + cli 7〔cli.ts + cli-manager.ts + src/cli/ 5〕 + mcp 5 + electron 7〔含孤儿 preload.js〕 + electron-renderer 32 = 137）逐一读取关键面（导入/导出/路由注册/调用链），全部断言带 file:line 或 grep 证据。
2. **接线判定**: 以"谁 import / 谁挂载 / 谁调用 / 结果在哪呈现"四问追踪（铁律 4/5），静态 grep + 动态 import()/require() 全形态检测（吸取施工图 §3 locale/infra 误判教训）。
3. **DSH 对标**: DSH 0.1.2-rc.1（Mac 依赖目录）7 个目标包一手源码阅读 + 既有资产交叉验证（施工图 §3/§4、附录A 224 包处置表、附录B 运行时深潜）。
4. **文档-现实核对**: 产线 yaml 验证点状态、权威文档05 补充研究声称、AGENTS.md L1 章节逐一对源码核实。

---

## 1. 执行摘要（创始人 30 秒版）

**一句话结论: L1 的零件基本齐、单件质量不差，但从未组装成一条用户可走通的路。**

| 判断 | 证据 |
|---|---|
| **对话引擎从未与 HTTP/桌面端相连** | ConversationEngine 的全部生产调用方 = cli.ts:20 / tui-v2/index.ts:41 / mcp/index.ts:17 / l1/im-inbound.ts:170。**routes/ 无任何对话端点**；桌面端对话组件悬空 |
| **桌面端生产态首条消息即 401（P0）** | 白名单 auth.ts:85-107 不含 /api/diagnosis/consult（亲证）；renderer 零凭证代码；DEV_MODE 逃生口 .env 实测 false。D575 只豁免了配置向导 3 端点，没豁免配置完要用的端点——**"配置完即可用"承诺生产态不成立** |
| **诊断上传管线是假绿源（P0）** | diagnosis-upload-v2.ts:553 DocExtractor=null + :558 new(null) 在 try 外→POST /api/diagnosis/upload 所有任务必 failed（亲证）；:607/:623 测量/专家硬编码空输出却自标 "@state: real"；/ga 表单页对 failed job 无限轮询 |
| **Web"对话界面"不是对话，是一次性诊断发射器** | routes/chat.ts:77 内嵌 HTML 的 JS 只调 POST /api/diagnosis/consult（chat.ts:667）+ 3 个状态接口；无多轮会话 |
| **SSE 只有一处是活的** | 诊断进度流 routes/diagnosis.ts:119-124（真实、写得好）；l1-interaction/web-adapter.ts（对话 SSE 适配器）**零消费者=死代码**——它本来就是为对话流准备的，从未接线 |
| **桌面端"流式"是假的** | useStreaming 16ms buffer 管道（:56-69）零数据流入，scheduleFlush 无调用方；store 只收整块消息。产线 2-2 在桌面端不成立 |
| **桌面壳质量好但 IPC 层断** | 自启/探活/回收（backend-spawn.cjs D504）扎实；但 preload 只暴露 2/10 方法（P0-2），托盘/系统通知整层静默 no-op |
| **TUI 是活的但是孤儿** | npm run tui 可跑、铁律 40-45 冻结 7 项完好；但它是**进程内直调 ConversationEngine 的独立交互面**（chat.tsx:184 进程内 new 引擎），与 HTTP/桌面零共享路径。tui-v3 是死实验（施工图 ⚫ 已判） |
| **MCP 有服务无防護** | 手写 stdio JSON-RPC（9 工具，mcp/index.ts）零认证零权限零打包；另有反向 MCP client（tool-registration.ts 接 brave/github） |
| **文档-现实漂移实锤** | 权威文档05补充研究声称 chat.ts 有 POST /api/chat/stream——`git log -S` 全历史证明**从未存在**（M2/M7）；铁律 40/41/44 声称 pre-commit 硬阻断，scripts/ 零执法逻辑；credentials.ts 声称加密实为内存明文 Map；产线线2 modules 仍写不存在的 `tui/` |
| **跨层违规存续（检测四类漏网）** | L1→L3 5 文件、L1→L4 6 文件、L1→L5 3 文件（含 3 处静态 import）。检测其实存在（check-architecture.sh §1b/1c 查 L1→L3/L4）但四类形态漏网: ① 只匹配 `from` 静态导入，**动态 import() 全部逃逸**（违规主体形态）② 按名字豁免（ga-annotations、agent-observer——恰是违规文件）③ 路径形态不匹配（`../expert-platform/` 不命中 `/expert/`）④ pre-commit 内为 soft_check 本地不阻断 |
| **好的一面** | 51 个路由文件全部接线（零死文件）；49 挂载+2 共享；sentinel 路由全经 L2（纪律样本）；D575 凭证存储契约优先+原子写+真实连通测试；diagnosis.ts consult 五件套（status/interrupt/resume/report）完整；tests/electron 8 文件 1444 行 |

**收工路径**: 三阶段（§7）——Phase 1 用 1 个新 HTTP SSE 端点把 ConversationEngine 接进 HTTP+桌面端（复活 web-adapter 而非新造）+ 鉴权姿态落地，Phase 2 报告落盘+桌面呈现+卡片，Phase 3 MCP 认证+TUI 清理+文档拉平。合计约 12.5-19.5 编码日，双线并行 ~2 周自然周。3 项需创始人裁决（§8.1）: 终端形态去留、upload-v2 修复或收敛、鉴权姿态。

---

## 2. L1 交互面全景（真相图谱）

L1 共有 **7 个交互面**，状态各异：

| # | 交互面 | 入口 | 后端路径 | 状态 |
|---|---|---|---|---|
| A | CLI 终端对话 | `npx tsx src/cli.ts` | cli.ts → ConversationEngine（进程内，流式） | **工作**（唯一真实对话 E2E 路径，但从未被创始人实测记录） |
| B | TUI v2 | `npm run tui` | tui-v2/chat.tsx:184-185 动态 import 并进程内 new ConversationEngine（index.ts:41 是死入口B的同款 import） | 工作（孤儿面，与 HTTP 零共享） |
| C | Web 内嵌页 | GET /chat | 内嵌 HTML → POST /api/diagnosis/consult（SSE 诊断）+ GET /api/status 等 3 接口 | 部分工作（是诊断发射器，非对话；无会话） |
| D | MCP server | `npx tsx src/mcp/index.ts` | 手写 stdio JSON-RPC → ConversationEngine + 哨兵/本体 | 工作（9 工具；零认证/权限/打包） |
| E | IM 通道 | routes/im.ts → l1/im-inbound.ts:170 | ConversationEngine + interactive-card + proactive-push | 工作（飞书桥接；卡片回复链路存在） |
| F | **桌面端** | electron/main.cjs | 自启后端（backend-spawn.cjs:25 探活 :18790）→ 窗口加载 renderer；renderer 走 HTTP fetch（非进程内） | **断链 ×3**（P0-1 对话 401；P0-2 preload 8/10 方法不存在；假流式零水源——详见 §3.5） |
| G | 诊断 SSE（唯一活 SSE） | POST /api/diagnosis/consult | diagnosis.ts:100 → synova-diagnosis-engine(L3) → onEvent→SSE | ⚠️代码工作、生产态 401（白名单不含，P0-1；DEV_MODE=false 时 Web/桌面/任何无 JWT 调用方全被拒） |

**结构性结论**:
1. **两条对话轨道并存**: ConversationEngine（多轮，A/B/D/E 用）与 DiagnosisEngine consult（一次性，C/F 的报告链用）。产品叙事"对话触发诊断"要求二者桥接——桥只存在于 ConversationEngine.processMessage 内部（phase 0 完成 → startDiagnosis，conversation-engine.ts:675），**HTTP 面摸不到它**。
2. **ViewAdapter 抽象建了没用**: l1-interaction/types.ts 定义 7 方法接口，web-adapter.ts 实现 SSE 版，tui-adapter-v2.ts 实现 TUI 版——**两个实现都零生产消费者**，tests/view-adapter.test.ts 只测接口形状。这是"M3 机制建成未接线"的教科书案例（好在只是没接线，不是没造）。
3. **会话持久化双轨**: SessionStore（store/session-store.ts，SQLite，session-store.ts:391 注明 conversation-engine 用 assistant 承载工具结果）+ orchestration db（diagnosis.ts:172-180 D489）。对话轨道与会话轨道的归一未完成（D587/D588 在途正是补这个）。

---

## 3. 逐文件清单表

> 状态判定: ✅工作（有真实调用链+实现完整）/ ⚠️部分（能跑但有洞）/ ❌坏 / ❓未知（缺证据） / 💀死代码（零生产引用）
> 处置: 保留 / 修复 / 替换DSH / 删除

### 3.1 src/routes/（51 文件，HTTP API 层）

**挂载核实**: server.ts:21-75 导入 49 个路由模块，:297-367 全部 app.use 挂载；ga-annotations-types.ts（纯类型，ga-annotations.ts:27 引用）、ga-auth.ts（requireGa 中间件，ga-calibration.ts:28 引用）为路由间共享模块——**51 文件零死文件**。中间件顺序: llm-config 挂 JWT 之前（:297<:298，D575 免认证设计），其余全部在 JWT/rateLimit/rbac 之后。测试覆盖: 29/51 有对应测试，**21 个零测试**（含核心的 chat.ts、diagnosis-upload-v2.ts、sessions.ts）。

| 文件 | 行数 | 功能 | 关键路由 | 状态 | 证据摘要 | 处置 |
|---|---:|---|---|---|---|---|
| actions-api.ts | 91 | 行动项 CRUD | /api/actions | ✅ | 有测试 | 保留 |
| adapters.ts | 55 | 适配器列出/重载 | /api/adapters | ✅ | 有测试(服务层) | 保留 |
| admin-knowledge.ts | 205 | D241 知识审批+联邦 | /api/admin/knowledge/* 8条 | ✅ | 有测试 | 保留 |
| agent-observer.ts | 117 | 外部 Agent 活动上报→SOG | /api/agent-observer/report | ✅ | collector 真实 | 保留 |
| audit.ts | 93 | 审计日志查询 | /api/audit | ✅ | 有测试 | 保留 |
| auth.ts | 294 | JWT 注册/登录/刷新/吊销 | /api/auth/* | ✅ | bcrypt+JWT 真实 | 保留（D591 若选登录流则扩展） |
| backup.ts | 157 | 备份/恢复/校验 | /api/backup/* | ✅ | 有测试；:38 as unknown as 存量 | 保留（顺手清 CT-46） |
| chat.ts | 898 | Web 对话页(内嵌HTML)+3辅助接口 | GET /chat 等 4条 | ⚠️ | 无测试；:321,:726 浏览器脚本引用服务端 log→错误路径 ReferenceError；头注释"统一 SSE"不实 | 修复（D590 并入：页面对接新对话端点+log bug） |
| cockpit.ts | 93 | 创始人仪表盘(Python桥) | /cockpit | ✅ | execSync 调 Python；依赖本机 Python | 保留 |
| credentials.ts | 61 | 外部知识源凭证 | /api/credentials/:provider | ❌ | **:5 声称 CredentialVault 加密，:16-17 实为内存 Map 明文**（亲证）；重启丢；无测试 | 修复（接 security/credential-vault——server.ts:44 已 import 未用） |
| data-lifecycle.ts | 111 | D40 GDPR 导出/清除 | /api/data/{export,purge} | ✅ | 有测试 | 保留 |
| data.ts | 84 | 结构化数据上传→L4 | /api/data/upload | ✅ | PII 预检真实；无测试 | 保留 |
| department-workspace.ts | 121 | 部门工作区旧页 | GET /dept | ⚠️废弃 | :7 @deprecated（D77b 待删）仍挂载 | 删除（D596，grep 复核后） |
| diagnosis-upload-v2.ts | 981 | 文档诊断异步管线 | /api/diagnosis/upload 等 | ❌ | **P0: :553 DocExtractor=null + :558 new(null) 在 try 外→所有 job 必 failed**（commit 3d8336f6 引入，doc-extractor 已不存在——亲证）；:607,:623 测量/专家硬编码空输出，与 :3 "@state: real" 矛盾；ga-diagnosis.ts:157-161 前端对 failed job 无限轮询；无路由测试 | **创始人裁决**: 修复 or 收敛下线（§8） |
| diagnosis.ts | 475 | **六阶段 SSE 诊断**（唯一活 SSE 对话面） | /api/diagnosis/consult + status/interrupt/resume/report | ✅ | 全链路真实；有测试；**但生产态 401**（白名单 auth.ts:85-107 不含 consult，亲证；renderer 零凭证→首条消息即 401）；报告仅内存 50 条 FIFO（:64-65，重启丢，:458 自认）；L1→L3/L5 动态 import | 修复（D593: 鉴权对齐+报告落盘） |
| documents.ts | 168 | 文档上传→FTS5 | /api/documents/* | ✅ | 真实；无测试 | 保留 |
| enterprise.ts | 619 | D103 企业管理 24 路由 | /api/enterprise/* | ✅ | 4 个内存 Map（:5-6 自认）易失；:460 count-based mock | 保留（内存态挂 P2 治理） |
| evolution.ts | 223 | L0 进化提案审批 | /api/evolution/* 8条 | ✅ | 有测试；5 处 as unknown as | 保留 |
| expert.ts | 78 | 专家贡献市场 | /api/expert/* | ✅ | **:11-12 L1→L3 静态 import（铁律39 违规）**；无测试 | 修复（跨层+补测试，D596 批次） |
| ga-admin.ts | 147 | GA 客户管理/切换 | /api/ga/clients | ✅ | :37 内存 Map 易失；有测试 | 保留 |
| ga-annotations-types.ts | 141 | GA 标注类型定义 | （类型文件） | ✅ | 被 ga-annotations.ts:27 引用 | 保留 |
| ga-annotations.ts | 285 | T3 GA 哨兵标注 | /api/ga/annotations | ✅ | 落库真实；:28-29 L1→L3 静态、:38 L1→L4 | 修复（跨层） |
| ga-auth.ts | 36 | GA 共享认证中间件 | （无路由） | ✅ | 有测试 | 保留 |
| ga-calibration.ts | 479 | D551 校准/信号注入 | /api/ga/calibration | ✅ | 有测试；:70 L1→L4 动态 | 保留（跨层顺手清） |
| ga-corrections.ts | 57 | GA 纠错 | /api/ga/corrections | ✅ | 真实；:51-52 显式 any | 保留 |
| ga-diagnosis.ts | 368 | GA 诊断表单页 | GET /ga | ⚠️ | 页面真实有测试，但提交的 upload 管线已坏→无限轮询（:157-161）；浏览器 log bug 6 处 | 随 upload-v2 裁决 |
| ga-evolution.ts | 387 | GA 进化面板 | GET /ga/evolution | ✅ | 有测试 | 保留 |
| health.ts | 42 | 健康检查+更新检测 | /health | ✅ | 白名单内，桌面轮询可达 | 保留 |
| healthz.ts | 338 | D49 六项健康检查 | /api/healthz | ✅ | 有测试；后端自启探活依赖它 | 保留 |
| home.ts | 172 | 首页双入口 | GET / | ✅ | 有测试 | 保留 |
| im.ts | 131 | IM webhook+员工问答 | /api/im/* /api/qa/ask | ⚠️ | 飞书真实；**wecom :88-90 stub 返回 200 伪装成功**；无测试 | 修复（stub 转 501 或实现） |
| import.ts | 45 | D231 CSV 导入 | /api/import/csv | ✅ | 有测试 | 保留 |
| knowledge-ask.ts | 71 | 知识问答 | /api/knowledge/ask | ✅ | 有测试；:39 L1→L4 动态 | 保留 |
| knowledge.ts | 114 | 知识库搜索/写入 | /api/knowledge/* | ✅ | 权限过滤真实 | 保留 |
| llm-config.ts | 231 | D575 LLM 配置后端 | /api/llm/* | ✅ | 0600 原子写+真实连通测试+零 key 回显；免认证挂载（设计如此）；有测试 | 保留（免认证面收敛见 §8） |
| loops.ts | 151 | D20 循环状态/执行 | /api/loops/* | ✅ | MainAgent 注入；有测试 | 保留 |
| notifications.ts | 142 | 通知列表/已读 | /api/notifications | ⚠️ | 逻辑真实有测试；**不在白名单→桌面 401**；已读状态内存级 | 修复（D594） |
| ontology-admin.ts | 61 | 本体管理页 | GET /ontology-admin | ✅ | :16 L1→L4 动态 | 保留 |
| ontology.ts | 231 | 本体图查询/可视化 | /api/ontology/* | ✅ | SqliteGraphStore 真实 | 保留 |
| overflow.ts | 143 | D478 溢出仪表盘 | /api/overflow/* | ✅ | 生产注入 graphStore；有测试 | 保留 |
| permissions.ts | 196 | M2 知识访问权限 | /api/permissions/* | ✅ | 真实；无测试 | 保留 |
| reload.ts | 83 | 专家文件热加载 | POST /api/reload | ✅ | 真实 | 保留 |
| review.ts | 33 | 人工审核队列 | /api/review/queue | ✅ | 真实 | 保留 |
| self-ops.ts | 89 | D52 自运维 | /api/self-ops | ✅ | 真实 | 保留 |
| sentinel-health.ts | 26 | 哨兵健康 | /api/sentinel/health | ✅ | 真实 | 保留 |
| sentinel.ts | 187 | 哨兵查询/触发/工单/卡片动作 | /api/sentinel/* 7条 | ✅ | 全经 L2 sentinel-service（:24 有 2026-09-06 修复记录）；工单状态机 D580；有测试 | 保留（L1 纪律样本） |
| sessions.ts | 122 | 会话 CRUD+FTS | /api/sessions | ✅ | 真实；**:11 L1→L5 静态 import（铁律39）**；无路由测试 | 保留（跨层 D596 修） |
| solutions.ts | 190 | 方案生成/推送 | /api/solutions* | ✅ | 有测试；白名单外→桌面 401 | 保留（D593 对齐） |
| workspace-data.ts | 216 | D74 工作台数据 | /api/workspace/:dept* | ✅ | 有测试 | 保留 |
| workspace.ts | 145 | 三栏工作区旧页 | GET /workspace | ⚠️旧版 | 被 workspace-data 替代，无废弃标记 | 删除候选（D596） |
| workspaces-api.ts | 236 | 工作区 CRUD | /api/workspaces | ⚠️ | :45-46 自认内存 Phase 1；无测试 | 保留（落 SQLite 挂 P2） |

### 3.2 src/agent/ 中 L1 相关（ConversationEngine 及其直接协作件）

> src/agent/ 共 43 文件，施工图 §3.5 判定为混合模块（通用面小、领域为主）。此处只盘 L1 直接协作件，其余归 L2/L3 审计范围。

| 文件 | 行数 | 功能 | 状态 | 证据 | 处置 |
|---|---:|---|---|---|---|
| conversation-engine.ts | 862 | 多轮对话编排核心: provider 链+工具循环+相位状态机+PII 脱敏+15 个可选子系统挂点 | ⚠️**逻辑完整、E2E 从未验证** | 单测全 mock LLM（tests/conversation-engine.test.ts）；生产调用方仅 cli.ts:20/tui-v2/index.ts:41/mcp/index.ts:17/l1-im-inbound.ts:170；**HTTP 面零调用**；:454 setViewAdapter 挂点存在但无人注入 HTTP 适配器 | 保留+**D590 实测接 HTTP**（产品对话主链路的引擎） |
| diagnosis-launcher.ts | 328 | 诊断启动器（engine 对接+L4 后处理委托） | ✅ | 消费者: conversation-engine/mcp/index/routes/diagnosis + l3 适配器 | 保留 |
| sentinel-service.ts | 429 | L2 哨兵数据服务（findings/signals/tickets/触发） | ✅ | routes/sentinel.ts:16-24 消费；:24 有 2026-09-06 L1→L3 修复记录 | 保留（L1→L2 纪律样本） |
| interactive-card.ts | 332 | 交互式卡片（confirm/dismiss/details/flag/correct/rediagnose 六动作） | ✅ | consumers: proactive-push.ts + routes/sentinel.ts:150；IM 卡片回复链路活 | 保留；**桌面/Web 卡片呈现缺位**（D594） |
| tool-loop-executor.ts | — | 工具调用循环+逐字流 sleep(5)（铁律42） | ✅ | :174-176,:185-187,:278-280 三处 sleep(5)；消费者 TUI+CLI（routes 诊断 SSE 不经此路径） | 保留 |
| main-agent.ts / synova-agent.ts | — | 进程装配（routes/loops setMainAgent 注入点、proactive-push 接线） | ✅ | server.ts:416-422 注入 | 保留 |

### 3.3 TUI / CLI（src/tui-v2 23 + tui-v3 3 + l1-interaction 3 + cli 3）

**数据链路真相（本审计最重要发现之一）**: TUI 是**进程内全量引擎直连**，非 HTTP 客户端——chat.tsx:184-185 进程内 `new ConversationEngine(...)`，:343 直调 `processMessageStream`；bootstrap.ts:14-23 进程内构造 providers/SessionStore/EventBus 等全家桶，:120-122 直接 `new Database('data/synova.db')`。与 HTTP API 零共享路径（src/index.ts 无 TUI 引用），**删除 TUI 对 HTTP/桌面端零影响**。注意: TUI 与 API server 同时跑会共享 synova.db（WAL 并发写风险）。

| 文件 | 功能 | 状态 | 证据 | 处置建议 |
|---|---|---|---|---|
| tui-v2/chat.tsx | TUI 主界面 | ✅活 | package.json:16 "tui"+:18 "synova"、bin/synova:7 | **待创始人裁决**（见 §4 方案A/B） |
| tui-v2/demo.tsx | 纯 UI 演示（无后端） | ✅活低值 | package.json:17 "tui:demo" | 删除（演示价值低） |
| tui-v2/index.ts | 入口B（ViewAdapter 版） | ❌坏（从未工作） | 零启动入口；其渲染的 app.tsx:41 调 `engine.processUserInput?.()`——ConversationEngine **无此方法**，optional chaining 静默 no-op，提交功能从未可用 | 删除 |
| tui-v2/app.tsx | ViewAdapter 版根组件 | ❌半死 | 唯一引用方 tui-v2/index.ts:10 | 删除（随 index.ts） |
| tui-v2/hooks/use-event-bus.ts | EventBus 订阅 hook | 💀死 | 全仓零引用（chat.tsx 用 SidebarAggregator 直连） | 删除 |
| tui-v2/hooks/use-streaming.ts | 流式 buffer hook（铁律41模式所在） | ✅活 | chat.tsx:28；bufferRef:22+setTimeout(16):39 | 随 chat.tsx 裁决 |
| tui-v2/lib/*（bootstrap/commands/mouse-input/theme/grapheme/sidebar-aggregator/thinking） | 初始化/命令/输入/主题等 | ✅活 | chat.tsx:11-30 内部引用 | 随 chat.tsx 裁决 |
| tui-v2/components/*（8 文件） | UI 组件 | ✅活 | chat.tsx:22-26 | 随 chat.tsx 裁决 |
| tui-v2/types.ts | TUI 类型 | ✅活 | 内部 + l1-interaction/tui-adapter-v2.ts:7 | 随目录裁决 |
| tui-v2/README.md | 文档 | ⚠️过时 | 声称的 `npm run tui:v2` 不存在 | 随目录；若保留则改写 |
| tui-v3/demo-opentui.tsx | OpenTUI 实验 | 💀死+跑不起来 | 全仓零引用；@opentui/core、@opentui/react 不在 package.json 且 node_modules 无 | **删除**（施工图:112 已判 ⚫） |
| tui-v3/demo-unblessed.ts | unblessed 实验 | 💀死 | 全仓零引用；@unblessed/node 唯一消费者 | **删除** |
| tui-v3/tsconfig.json | — | 💀死 | 只 include demo-opentui.tsx | **删除** |
| l1-interaction/types.ts | ViewAdapter 接口 | ✅活 | conversation-engine.ts:21 import、:344 字段、:454 setViewAdapter、:734 调用 | **保留**（Phase 1 复活重点，见 §7 D590） |
| l1-interaction/tui-adapter-v2.ts | TUI ViewAdapter 实现 | ❌半死 | 唯一引用方 app.tsx:11（本身半死） | 删除（app.tsx 删后成零引用） |
| l1-interaction/web-adapter.ts | express SSE ViewAdapter | 💀现状死 | 全仓零消费者 | **修复（Phase 1 复活）**——不是删，D590 正是要接线它 |
| cli.ts | 终端对话（readline） | ✅活 | package.json:15 "chat"；cli.ts:20 import ConversationEngine | **保留**（唯一对话 E2E 手动验证工具，Phase 1 依赖它） |
| cli-manager.ts | synova 子命令工具 | ❌半死 | 无 script 无 bin（package.json bin:9 → bin/synova → tui chat.tsx）；tests/cli-manager.test.ts:5 有测试 | 保留待接线（Phase 3 决断：bin 重指向或归档） |
| src/cli/*（5 文件） | cli-manager 子命令 | ✅相对活 | cli-manager.ts:13-17 import | 随 cli-manager |

**铁律 40-45 冻结项核查**: 7 项全部通过（patch 存在 175 行/postinstall:12/memo: message.tsx:106+streaming-text.tsx:17 等 6 处/use-streaming 无违禁类名/chat-panel 无 flex-end 有截断算法:135,148/铁律43 顺序对: chat.tsx:356-359/铁律42 sleep(5): tool-loop-executor.ts:174-176,185-187,278-280）。
**⚠️ 重大漂移**: CLAUDE.md 声称铁律 40/41/44 有「pre-commit 硬阻断」——grep scripts/ 全目录**零执法逻辑**。冻结靠自觉维持。清理 TUI 若连带删 patch 不会有门禁报警（已登记 §8 风险 + 待办台账移交）。

### 3.4 src/mcp/（5 文件）

| 文件 | 行数 | 功能 | 状态 | 证据 | 处置 |
|---|---:|---|---|---|---|
| index.ts | 349 | MCP **server**（stdio）：手写 JSON-RPC（readline，**非官方 SDK**）暴露 9 工具 | ⚠️ | 工具: sentinel_list/sentinel_run/sentinel_run_all/flywheel_speeds/data_source_status/diagnose_organization/query_ontology/ingest_document/get_session（:44-117）；进程内 ConversationEngine（:17）；**零认证零权限零打包配置**；启动方式仅文档级 `npx tsx src/mcp/index.ts` | D595（认证+SDK 评估+打包） |
| bridge.ts | 228 | MCP **client** 桥：连接外部 MCP server 并把其工具注册进 agent ToolRegistry | ✅ | tool-registration.ts 消费 | 保留 |
| tool-registration.ts | 141 | 反向注册：brave-search/github MCP 工具入 ToolRegistry | ✅ | Promise.allSettled 并行连接（:22-24） | 保留 |
| skill-audit-gate.ts | 174 | 技能审计门禁（MCP 安装路径的审计拦截） | ✅ | 独立职责 | 保留 |
| skill-installer.ts | 167 | 技能安装器 | ✅ | 独立职责 | 保留 |

**要点**: Synova 的 MCP 是**双向的**——server（对外暴露诊断能力，A 形态连接点：未来 DSH mcp-client 消费它）+ client（消费外部工具）。缺口集中在 server 侧: 认证/权限/打包/协议实现方式。
**工具清单缺口（哪些暴露/哪些缺失）**: 已暴露 9 工具覆盖哨兵/飞轮/数据源/诊断/本体/文档/会话查询；**缺失候选**: ① 报告与工单查询（GET /api/sentinel/reports、tickets 无 MCP 对应——外部 Agent 拿不到诊断产物）② 知识问答（routes/knowledge-ask 能力未暴露）③ 多轮对话工具（MCP 侧只有一次性 diagnose_organization，ConversationEngine 会话式交互未暴露）④ 契约版本化元数据（Stage 2 固化前置）。→ 全部列入 D595 评估范围。

**P0 断链（子代理盘点 + CTO 亲证）**:
- **P0-1 对话 401**: renderer 无登录/token 获取流程（唯一凭证附着是 GA 端点的 dev-seed x-synova-token，RightPanel.tsx:157-159，且仅 localStorage 有 seed 时生效；consult/notifications/solutions 等请求不带任何凭证）；server.ts:298 jwtAuthMiddleware 全局门禁；白名单 auth.ts:85-107 含 /api/sentinel/* 但**不含 /api/diagnosis/consult、/api/solutions、/api/notifications、/api/ga/clients**；DEV_MODE 逃生口（auth.ts:273-285）在 .env DEV_MODE=false（亲证）+ 生产包无 .env 下不触发。→ **D575 配置完→首条消息即 401**（红条英文报错，诚实失败不白屏）。D575 只豁免了向导 3 端点（server.ts:293-298 挂载序），没豁免向导完成后要用的端点。
- **P0-2 preload 断链**: main.cjs:77 加载 electron/preload.cjs（仅 2 方法）；electron-renderer/preload.js 声明 10 方法但是**死文件**（build-synova.cjs:80-89 打包白名单不含它）且 main.cjs 零 ipcMain 注册→bridge.ts 10 方法中 8 个 `?.` 静默 no-op（托盘角标/系统通知/版本号恒 '0.1.0'）。
- **假流式**: 桌面 useStreaming 的 16ms buffer 管道（:56-69）**零数据流入**——consult SSE 事件是整块消息，scheduleFlush 无调用方；store 只收整块 addMessage。产线 2-2"回答是流式的"在桌面端**不成立**。

**对话链路图**: App.tsx:102 CenterPanel → :24 useStreaming → Composer.tsx:102-110 onSend → useStreaming.ts:200-208 `fetch POST /api/diagnosis/consult`（❌401）→（若通）:220-260 fetch+getReader 手写 SSE 解析 → sse-contract.applySSEEvent 归约（15 事件类型 :24-30）→ conversation-store.addMessage → MessageItem 渲染；报告出口 RightPanel.tsx:213 GET report（同样 401）。

### 3.5.1 electron-renderer/src/（32 文件）

| 文件 | 功能 | 状态 | 证据 |
|---|---|---|---|
| App.tsx | 根布局+健康轮询+D575 boot+托盘同步 | ✅（托盘死） | :49-59,65-75,80-82 |
| main.tsx | React 挂载 | ✅ | :6-9 |
| types/chat.ts | 消息/阶段/欢迎三态类型 | ✅ | :20-55 |
| stores/app-store.ts | 全局状态(zustand) | ✅（含 mock 假数据 :88-97） | 保留+清 mock |
| stores/capability.ts | 能力导航纯逻辑 | ✅ 有测试 | :31-102 |
| stores/conversation-store.ts | 消息 CRUD | ✅ | :33-63 |
| stores/ga-collab.ts | GA 协同数据层 | ✅（dev seed 语义） | :65-102 |
| stores/llm-config.ts | D575 向导数据层 | ✅ | :151-230 |
| CenterPanel.tsx | **对话主面板**（无 ChatPanel 之名） | ✅（断在 401） | :24-31,105-109 |
| Composer.tsx | 输入框+@提及+/命令 | ✅（拖拽 TODO；mentions 第二参被 CenterPanel 丢弃） | :87-99 |
| MessageItem.tsx | 四型消息渲染 | ✅ | :18-50 |
| WelcomeScreen.tsx | 欢迎容器 | ✅ | :128-205 |
| LlmSetupCard.tsx | D575 向导卡片 | ✅ | :37-144 |
| LeftPanel.tsx | 左栏导航+角标+GA 客户 | ⚠️（sentinel✅；loops/actions/ga-clients 401） | :62,73,83,96,112 |
| RightPanel.tsx | 右栏报告/方案/详情/GA | ⚠️（signals✅ 白名单内；report/solutions 401；哨兵 tab 是 Empty 占位 :345-347） | :213,488,555,685 |
| ga-detail-sections.tsx | GA 三块展示 | ✅ | :215-245 |
| ExpertAttribution.tsx | 专家署名折叠 | ✅（推理链按钮无 onClick） | :45-47 |
| StatusBar.tsx | 状态栏 | ⚠️（在线✅；告警 401；上次诊断死数据） | :51 |
| TitleBar.tsx | 标题栏+维度条 | ⚠️（维度恒 0/8，setDiagnosisInfo 零调用方） | :16-17 |
| NotificationCenter.tsx | 通知浮层 | ❌（上游 401→恒空；error 未渲染） | :23 |
| CommandPalette.tsx | Ctrl+K | ⚠️（假哨兵数据；命令点击无动作） | :31-36,100-104 |
| ResizeHandle.tsx | 面板拖拽 | ✅ | :37-69 |
| hooks/useStreaming.ts | SSE 消费+发消息 | ⚠️（401 断+假流式） | :200,:56-69 |
| hooks/sse-contract.ts | SSE 事件契约单源 | ✅ 有测试（**可单源资产**，TUI 未用它） | :70-136 |
| hooks/useConversation.ts | 对话封装 | 💀**死代码零消费者**（文件头自认 :23） | 删除或复活（D591 裁量） |
| hooks/useKeyboard.ts | 快捷键 | ⚠️（3 handler 未传=空按） | :41-51 |
| hooks/useNotifications.ts | 通知轮询 | ❌（401；逻辑本身健全） | :34 |
| hooks/useWorkspaces.ts | 工作区管理 | 占位（console.warn） | :18-21 |
| lib/api.ts | API base 封装 | ✅ | :28-39 |
| ipc/bridge.ts | IPC 桥 | ⚠️（8/10 方法运行时不存在） | :4-15 |
| test-support/render.ts | 测试渲染桥 | ✅ | :89-91 |
| styles/global.css | 全局样式 | —（无运行时逻辑） | — |

### 3.5.2 electron/ 主进程（7 文件）

| 文件 | 功能 | 状态 | 证据 |
|---|---|---|---|
| main.cjs | 窗口/托盘/单实例锁/P0 轮询 | ✅（托盘菜单指向旧 web UI /cockpit、/app/admin.html :176-177；零 ipcMain） | 修复（D594 补通道） |
| preload.cjs | contextBridge 暴露 2 方法 | ✅覆盖不足 | :10-13 |
| backend-spawn.cjs | 后端探活/spawn/回收（D504） | ✅ 有测试；SIGTERM→5s→SIGKILL 树回收；重启限 3 次/10min | :148-229 |
| config.json | serverUrl 硬编码 :18790 | ✅（无环境覆盖入口） | :2 |
| package.json | electron devDep+scripts | ✅ | — |
| test-electron.cjs | 冒烟脚本 | 工具 | :3 |
| electron-renderer/preload.js | （孤儿）声明 10 IPC | 💀**死文件**（未打包+无通道） | 删除或转正（D594） |

**构建/启动**: dev = vite:5173(proxy→18790) + 根 npm run dev + electron 壳三态（main.cjs:96-111: prod renderer / dev 5173 / 降级 /app/login.html 旧路径）；prod = 三步链（build-synova.cjs:11-19，beforePack 守卫 backend.mjs）+ ensureBackend 自启（ELECTRON_RUN_AS_NODE 跑 dist/backend.mjs，SYNOVA_DB_PATH=userData）。另: `npm run dev` 根脚本指向 **scripts/agent-start.bat（Windows 批处理）**——Mac 上 `npm run dev` 不可用（agent-start.sh 存在但未接线）——L1 开发链路的跨平台缺口。

### 3.6 逐文件 DSH 对标速查（补清单表「DSH 对标」列）

> §3.1-3.5 各表中未标 DSH 对标的文件，其对标一律为「🟢 品牌表层/领域层自留，DSH 无对应包」（routes 的 GA/工作台/哨兵查询族、electron-renderer 领域组件、app/ 静态报表等——这正是施工图"品牌活在表层"的含义）。通用管道类（store/cron/providers/orchestrator）按施工图 §3 🔵/⚠️ 处置，不在 L1 收工范围。**有实质对应的文件如下**：

| 文件 | DSH 对标（包 + 机制锚点） | 判定 |
|---|---|---|
| agent/conversation-engine.ts | dsh-agent-loop: turn/step 状态机（lib/index.js:337-778）、请求重建 invariant（lib/invariant.js:15-33）、中断锚（:637-655） | 自研简版 → 范式借鉴（D590/D592）；Stage 3 替换 |
| agent/tool-loop-executor.ts | dsh-agent-loop 工具调度: 独占屏障+有界并行池（:164-274），结果保模型序 | 自研简版 |
| routes/diagnosis.ts（consult SSE） | dsh-api-gateway 流帧协议: open/cancel/item/end/error 五帧+心跳（:122-133,:199-269） | 自研简版 → 帧语义 D590 借鉴 |
| routes/chat.ts + l1-interaction/web-adapter.ts | dsh-api-gateway 单 /api 拦截器+端点认领（:454-456,:510-517）；输入边界校验（:1074-1103） | 空白 → D590 建新端点时借鉴 |
| routes/sessions.ts（+store/session-store.ts） | dsh-api-session-controller: 冷读激活策略（lib/index.js:142-170）、resume/create 单飞去重（:213-267）、fork turn 边界切点（:655-725）；dsh-session 事件溯源（附录B §4） | 空白 → 范式借鉴（与 D587/D588 在途同向） |
| routes/llm-config.ts + services/llm-credential-store.ts | DSH credential seam（D575 已按此借鉴，spec 在案） | 已对标 ✅ |
| agent/main-agent.ts + 进程装配 | dsh-agent-presets 声明式组合（agent.cordis.yml、常设挂载+stamp 代际 lib/index.js:1768-1803、空白会话锁 :1730-1751） | 自研简版 → Stage 2+ 升级 expert-registry.yaml |
| src/mcp/index.ts（server） | dsh-acp: 诚实能力广告（lib/index.js:1143-1163）、权限桥一次性授权（:1118-1141）；DSH 侧 mcp-client 是未来消费方（A 形态连接点） | 空白 → D595 |
| src/mcp/bridge.ts + tool-registration.ts | DSH mcp-client（消费方同型机制） | 相当 |
| electron-renderer/hooks/useStreaming.ts + sse-contract.ts | dsh-client-ui-session 外部存储订阅（lib/client.js:83-126,:211-226）+ 提交回声（dsh-api-session-controller lib/client.js:875-896） | 自研简版 → D591 借鉴 |
| electron/backend-spawn.cjs | DSH 子进程生命周期范式（spawn/探活/限次回收） | 相当（有测试） |
| tui-v2/**（方案A 保留时） | 无对应（DSH 无 TUI 形态）；流式模式受铁律 41 冻结 | 自留 |
| l1-interaction/types.ts（ViewAdapter 接口） | 与 dsh-agent-loop 的 surface/投影思想同型（loop 只认事件流，呈现层可换） | 自留（D590 复活其 web 实现） |

---

## 4. TUI 清理方案

**裁决前提（给创始人的一句话）**: TUI v2 是进程内直连引擎的独立交互面，与 HTTP/桌面/IM 零共享路径；产品叙事的交互面是桌面端+IM。终端形态是否保留是**产品判断**，两个方案都已在下面备妥，默认推荐 A。

### 4.1 无争议立即清理（无论 A/B 都做，D596 执行）

| 对象 | 动作 | 依据 |
|---|---|---|
| src/tui-v3/ 全部 3 文件 | 删 | 全形态零引用；@opentui 不在依赖（跑不起来）；施工图:112 已判 ⚫ |
| tui-v2/index.ts + app.tsx | 删 | 半死坏入口：app.tsx:41 调引擎不存在的 `processUserInput?.()` 静默 no-op——该入口**从未工作过** |
| tui-v2/hooks/use-event-bus.ts | 删 | 全仓零引用 |
| tui-v2/demo.tsx + "tui:demo" script | 删 | 演示价值低 |
| l1-interaction/tui-adapter-v2.ts | 删 | 唯一引用方是被删的 app.tsx |
| tests/tui-components.test.ts | 删 | 伪断言（vi.mock neo-blessed 后断言 mock 自身，零真实锁定——铁律 48 反例） |
| 依赖卸载: neo-blessed、@unblessed/node、@types/blessed、grapheme-splitter（若 B 则加 ink、ink-text-input、react、@types/react） | 卸载 | 消费者 100% 在删除清单内（grep 验证） |
| 存量悬空顺带修: packages/test-kit 03-tui-smoke.test.ts:13（import 已删的 src/tui/welcome）、vitest.config.ts:43（排除项指向不存在的 src/tui/**） | 修正 | 存量漂移，与本清理无关但应一并 |
| types/neo-blessed.d.ts | 删 | V1 遗留类型声明 |

### 4.2 方案 A（默认推荐）——保留最小入口

**留**: tui-v2/chat.tsx 主线（唯一活入口，package.json:16 "tui" + bin/synova:7）+ 其 hooks/lib/components 依赖闭包 + cli.ts（"chat" script）+ cli-manager.ts（有测试有体系，bin 接线挂起待定）。
**理由**: ① 改动面最小，不炸 3 个引用 chat.tsx 的测试（expert-enum-propagation.test.ts:32、graphstore-unify.test.ts:101）；② CLI 是当前唯一可手动 E2E 验证 ConversationEngine 的工具，Phase 1 依赖它；③ 铁律 40-45 冻结项全部继续有效，无需治理动作。
**代价**: ink/react 依赖链继续存在；TUI 与 API 同时跑共享 synova.db（WAL 并发）的风险继续存在（低频：开发者本机）。

### 4.3 方案 B——全删（若创始人确认产品永不做终端形态）

**删**: 方案 A 保留项全部（chat.tsx 主线 + cli.ts + cli-manager + src/cli/）。
**连带动作**: 4 处 script（tui:16/synova:18/chat:15/tui:demo:17）+ bin:9 删改；3 个测试修改/删除；卸载 8 个依赖；**铁律 40-45 整体退役**（AGENTS/CLAUDE 六章删除——它们保护的对象不存在了）；patches/ink+5.2.1.patch + patch-package devDep 删除；tool-loop-executor sleep(5) 失去全部消费者（铁律 42 同步退役）。
**收益**: 卸掉整条 ink/react 终端栈（约 5 个直接依赖+传递依赖）；铁律手册瘦身 6 条；消除 WAL 双进程写风险。
**注意**: 铁律 40/41/44 声称的 pre-commit 执法**本就不存在**（§3.3 重大漂移）——退役的实际成本比文档声称的低。

### 4.4 铁律 40-45 处置（随方案落位）

| 方案 | 处置 |
|---|---|
| A | 铁律保留；但「pre-commit 硬阻断」声称改为如实描述（现状无执法），或在 D596 补一个真实 check（属 scripts/control-tower 域，CTO 另行派工，不入编码线写集） |
| B | 六条整体归档退役（memory/notes 四态流程），AGENTS/CLAUDE 同步删章 |

---

## 5. DSH 可复用组件映射（哪个包解决哪个 L1 缺口 + 集成方式）

> DSH 0.1.2-rc.1，七包一手源码深读（file:line 相对包根），与施工图附录A 既有判定交叉验证一致。**可直接 import（npm 依赖）的包 = 0**——G1 零依赖红线 + 施工图 Stage 3 前零依赖约束，全部为范式借鉴/改造自研；标「Stage 3」的按施工图绞杀者节奏走。

| DSH 包 | 解决的 L1 缺口 | 最值得搬的机制（锚点） | 集成方式 |
|---|---|---|---|
| **dsh-agent-loop** | ConversationEngine 从未实测、无中断语义 | ① 请求重建不变量自检（lib/invariant.js:15-33：请求消息必须严格等于持久日志重建结果，失同步即 fail）② 中断锚（lib/index.js:637-655：abort 后已投递前缀落 `interrupted:true` 锚，历史仍可重放）③ 独占屏障+有界并行池工具调度（:164-274，结果保模型序） | **现在就借鉴范式进 D590/D592**: 给对话会话加"重放自检"测试；中断时已见 token 落库。Stage 3 后整体替换 ConversationEngine（施工图 §4 既定） |
| **dsh-api-gateway** | SSE 推送无纪律、裸路由无输入边界 | ① 提交后才通知（语义 update 只从已落日志投影）② 单流多路+心跳+取消帧协议（/api/remote.mux lib/index.js:11,122-133,199-269：open/cancel/item/end/error 五帧+2s 心跳）③ 边界 JSON 纯度校验（assertJsonValue :1074-1103） | **D590 直接借鉴**: 新对话 SSE 的事件命名/心跳/断线重连语义对齐该帧协议；consult/对话路由输入校验补边界检查。Stage 3 接缝预留（附录A 判定） |
| **dsh-api-session-controller** | 会话模型空白（对话轨/诊断轨/内存报告三套并存） | ① 逐端点激活策略（冷读不复活引擎 lib/index.js:142-170）② resume/create 单飞去重（:213-267）③ fork 只切完成 turn 边界+seed 前缀（:655-725） | **借鉴范式**: sessions.ts 会话列表读路径不触碰引擎；"从某轮重试"若做，按 turn 边界切。与在途 D587/D588（工具结果修剪/会话投影）同向，D590 设计前必读其 spec 防冲突 |
| **dsh-client-ui-session** | 桌面端 fetch+setState 散乱、假流式 | ① 外部存储订阅（getSnapshot/subscribe+notifySubscribers lib/client.js:83-126,211-226，配 useSyncExternalStore）② 提交回声 beginSubmission（api-session-controller/lib/client.js:875-896：发送前同步插入 pending 帧，requestId 贯穿到持久化回执，断线可对账） | **D591 直接借鉴**: 桌面已有 zustand（外部 store），补"提交回声"语义（用户消息乐观上屏+服务端确认对账）与真流式 token 水源。附录A「纯 UI 不适用」判定偏粗，本审计修正：状态接缝范式可搬 |
| **dsh-agent-presets** | 交互面无声明式组合（工具/提示段/技能按 hardcode 装配） | ① preset 目录=组合文件+元数据（agent.cordis.yml，isolate realm 分组）② 常设挂载+文件 stamp 代际（lib/index.js:1768-1803，改文件不伤在跑会话）③ 空白会话锁（:1730-1751）+泄漏审计 | 长期借鉴（Stage 2+）：expert-registry.yaml 已是声明式雏形，升级方向=每 agent 一份组合。**不在 L1 收工范围** |
| **dsh-acp** | MCP 零认证零权限 | ① 权限桥（approval/request→协议级 allow-once/reject-once 一次性选项 :1118-1141）② 诚实能力广告（能力实时探测后才 advertise :78-88,1143-1163）③ stdout 纯度/启动闩（acp-app lib/index.js:31-38） | **D595 直接借鉴**: MCP 工具权限走显式一次性授权语义；server 启动时显式声明能力与信任模型（单机本机信任=明文写入握手响应/README），替代隐式无认证 |
| **dsh-acp-app / 协议本体** | — | ACP 是给"可信程序客户端"的自动化协议；Synova 对外面是 HTTP+MCP | **不搬协议**（附录A 判定维持）；启动闩微借鉴备用 |

**结构性差异（DSH 深读横向提醒，本审计采纳）**: DSH 七包全部建立在「会话日志是唯一真相、一切视图是投影」的事件溯源地基上；Synova L1 现状是对话 SSE 推内存态、报告存 50 条 FIFO 内存缓存。**这不是搬一个包能解决的，是 D500（已开工）→ D587/D588（在途）→ D590（本计划）持续推进的同一条线。**

---

## 6. 缺口分析（DSH 没有、必须自己建的）

以下是 DSH **没有**、必须 Synova 自建的能力（按与 L1 收工的相关度排序）：

| # | 缺口 | 说明 | 归属 |
|---|---|---|---|
| 1 | **企业多用户/RBAC 权限体系** | DSH 定位单 agent 单机，无企业多用户概念（施工图 §5.5 已认定【双缺】差异化机会）。middleware/rbac 五角色底子已有但未全量验证；当前桌面对话 401 断链本质是"单机信任模型未声明"与"多租户门禁"两套语义打架 | 核心服务做深（🟢）；L1 收工先落单机信任声明，多用户按施工图 5.5 |
| 2 | **对话→诊断的领域桥接语义** | ConversationEngine 内置"Phase 0 访谈完成→自动诊断"（:675）是纯领域流程；DSH agent-loop 只有通用 turn/step。HTTP 化时这条桥的暴露方式（对话中触发诊断→SSE 通知→报告回投对话流）需自设计 | D590/D592 |
| 3 | **诊断领域交互件** | judgment_card/interactive-card（六动作卡片）/ExpertAttribution/GA 审批流——DSH client-ui 全是代码助手语义（approval/attachment/terminal），无诊断领域 UI 语义 | D594（🟢 品牌表层自留） |
| 4 | **IM 触达通道** | 飞书/企微 webhook、boss-mailbox、proactive-push——DSH 无 IM 概念。这是"系统主动找老板"（产线 2-4）的物理载体 | 保留+接线（企微 stub 转正或删） |
| 5 | **报告品牌呈现层** | app/*.html 静态报表、报告模板品牌定制——DSH 无报表概念。当前报告数据→品牌呈现的链路（consult 报告→report.html/ga.html）半断（内存态+401） | D593 |
| 6 | **会话模型归一** | 三套并存：ConversationEngine 内存消息+SessionStore 落库、consult 会话（orchestration.db+内存报告）、workspaces-api 内存 Map。DSH 是单一 session log。归一方向=事件溯源投影（D500/D587/D588 在途），L1 收工只要求**对话轨归 SessionStore + 报告落盘**两件事 | D590/D593 |
| 7 | **MCP server 的诊断工具语义** | DSH 生态是 MCP 消费方；Synova 是诊断能力 provider（A 形态连接点：DSH mcp-client 消费 Synova MCP server）。9 工具的契约版本化（Stage 2 契约固化）是自建责任 | D595 + Stage 2 |

---

## 7. 分阶段执行计划（任务号已取: D590-D596）

> 任务号 D590-D596 已经 alloc-task-id.sh 取号登记（task-state/ 壳随本 PR 提交）。认领建议: Phase 1/2 主归 **Claude 编码线**（src/routes+agent+electron 归 Claude），Phase 3 的 D595 归 **DSH 编码线**（mcp 在 DSH 线写集例外内）、D596 双线可拆。派单时按派单模板 §〇b 补 DSH 借鉴核查（本报告 §5 已备好锚点）。

### Phase 1 关键路径——对话端到端打通（目标: 老板一句话→流式回答→落库可恢复）

| 任务 | 内容 | 写集 | 验收标准 | 预估 | 依赖 |
|---|---|---|---|---|---|
| **D590** 对话 HTTP SSE 端点 | ① 新增对话流式端点（建议 `POST /api/conversations/:id/messages`，SSE）接 ConversationEngine.processMessageStream + 复活 web-adapter.ts（它就是为此写的）② 会话持久化进 SessionStore（复用 sessions.ts 读路径，读不触引擎）③ **鉴权落地**: consult+对话端点与 /api/sentinel/\* 白名单对齐（单机本地信任模型，README/握手显式声明——借鉴 dsh-acp 诚实能力广告），多用户阶段按施工图 §5.5 重构 ④ SSE 事件契约对齐桌面 sse-contract.ts（新增 token/agent_message 事件，五帧语义借鉴 dsh-api-gateway）⑤ 中断语义: 客户端断开→已见 token 落库（借鉴 agent-loop 中断锚）⑥ 顺手修 chat.ts:321,:726 浏览器 log ReferenceError + chat 页面对接新端点 | src/routes/（新文件+chat.ts+sessions.ts）、src/l1-interaction/web-adapter.ts、src/server.ts、src/middleware/auth.ts（白名单）、tests/routes/ | ① DEV_MODE=false 生产态下 curl 发消息→token 流式返回→回复在 GET /api/sessions 可查 ② 断开重连不丢已见内容 ③ 全量 vitest 零新失败 | 2-2.5 天 | 无（设计前读 D588 spec 防写集语义冲突） |
| **D591** 桌面端对话接线 | ① useConversation.ts 复活或 useStreaming 扩展 conversation 模式（废 enum 裁量）② **真流式**: appendToken→scheduleFlush 水源接通（当前假流式）③ Composer→新端点；D575 向导完成后直达对话 ④ 提交回声语义（乐观上屏+requestId 对账，借鉴 client-ui-session）⑤ mock 假数据清理（app-store:88-97） | electron-renderer/src/{hooks,components,stores} | ① 桌面端发一句话→**逐字**流式→完整回复 ② 刷新后会话还在 ③ use-streaming-contract 测试更新后绿 | 1.5-2 天 | D590 |
| **D592** 对话 E2E 场景 | ① tests/e2e 对话场景: 配置→发消息→流式→触发诊断→报告落库可取（GS-01 前置段）② ConversationEngine 重放自检测试（借鉴 agent-loop invariant: 请求消息≡SessionStore 重建结果）③ 产线 2-1/2-2/2-5 evidence（带 at 时间戳，衔接 D589 规则） | tests/e2e/、evidence | ① E2E 绿（真实 key 或网关 mock server）② 2-1 verified（K3 复核后） | 1-1.5 天 | D591；需创始人提供测试 key 或批准网关 mock |

**Phase 1 合计约 4.5-6 个编码日**。关键路径 = D590 → D591 → D592。

### Phase 2 报告链路（目标: 诊断结果重启不丢、桌面可读、卡片可交互）

| 任务 | 内容 | 写集 | 验收标准 | 预估 | 依赖 |
|---|---|---|---|---|---|
| **D593** 报告持久化+桌面呈现 | ① consult 报告从 50 条内存 FIFO（diagnosis.ts:64-65）落盘（SessionStore/l4 或文件，重启可读）② 桌面 RightPanel report/solutions、LeftPanel ga-clients 的 401 修复（随 D590 白名单对齐）③ GET /api/sentinel/reports+tickets 在桌面呈现（哨兵 tab Empty 占位接真数据）④ /api/notifications 白名单对齐 | src/routes/diagnosis.ts、electron-renderer RightPanel/LeftPanel、auth.ts、tests | ① 跑一次诊断→重启后端→报告仍可取 ② 桌面右栏看到真实报告/哨兵数据（无 401） | 2-2.5 天 | D590（白名单先行） |
| **D594** 交互卡片+通知+IPC 修复 | ① P0-2: main.cjs 补 ipcMain 通道 + preload.cjs 扩展（或删 electron-renderer/preload.js 死文件——二选一收敛）② judgment_card/interactive-card 桌面呈现（六动作→POST /api/sentinel/alerts/:id/action 已存在）③ NotificationCenter error 消费（不再静默空）④ StatusBar/TitleBar 死数据修复或摘除 | electron/main.cjs、preload.cjs、electron-renderer 通知/卡片组件、tests | ① 桌面收到通知→点卡片动作→工单状态变化落库 ② 托盘/版本号恢复工作或显式移除入口 | 1.5-2 天 | D590 |
| **D595b(并入D593)** upload-v2 裁决落地 | 按创始人裁决执行: 收敛下线（/ga 页改走 consult 或摘除入口）或修复管线（DocExtractor 重建+测量/专家段迁移——工作量大需另立任务） | 视裁决 | 视裁决 | 0.5-3 天 | **创始人裁决** |

**Phase 2 合计约 4-7.5 个编码日**（视 upload-v2 裁决）。

### Phase 3 MCP + 清理（目标: 对外协议可信、死代码清零、文档拉平）

| 任务 | 内容 | 写集 | 验收标准 | 预估 | 依赖 |
|---|---|---|---|---|---|
| **D595** MCP 认证/权限/打包（DSH 线） | ① 信任模型显式化: stdio 本机信任声明+握手响应能力广告（借鉴 dsh-acp :1143-1163）② 工具权限: 敏感工具（diagnose_organization/ingest_document）走一次性授权语义（借鉴权限桥 :1118-1141）③ **官方 SDK 评估**: 手写 readline JSON-RPC vs @modelcontextprotocol/sdk——倾向迁移（消协议漂移），产出对比结论 ④ 打包: 桌面端内置 or npx 文档化+冒烟测试 ⑤ 契约版本化预备（Stage 2 前置） | src/mcp/、tests/mcp、docs | ① 冒烟: 9 工具 stdio 全链路调用绿 ② 认证/权限语义有测试 ③ SDK 结论落盘 | 2-3 天 | 无（可 Phase 1 并行启动） |
| **D596** TUI 清理+文档拉平 | ① 执行 §4.1 无争议清单 + §4.2 方案 A（或创始人裁 B）② 跨层违规修复批次: sessions.ts:11、expert.ts:11-12、ga-annotations.ts:28-29 静态 L1→L3/L5 违规（动态 import 违规列清单分批）③ 死文件清理: department-workspace.ts、workspace.ts、mvp-server.ts（各 grep 复核后删）④ 文档拉平: AGENTS/CLAUDE L1 章节 tui/ 路径、routes/chat.ts 头注释、权威文档05补充研究勘误注记、credentials.ts 假声称修复（接 credential-vault）⑤ im.ts wecom stub 转 501 或实现 | §4.1 清单+上述文件、memory/notes（铁律处置） | ① 删除对象全仓 grep 零引用 ② vitest 全绿 ③ check-architecture 通过（新增 L1 违规清零） | 2-3 天 | D591 定 useConversation 去落后；方案 B 需创始人先裁决 |

**Phase 3 合计约 4-6 个编码日**。**总计: 12.5-19.5 编码日**（双线并行可压至 ~2 周自然周）。

### 跨切治理（CTO 自领，不占编码线写集）

1. 跨层检测加固: check-architecture.sh（存在，scripts/check-architecture.sh:34-48 已查 L1→L3/L4）需补四类漏网——动态 `import()` 形态、按名字豁免清单复核（ga-annotations/agent-observer 恰是违规文件）、`expert-platform` 等路径形态、soft_check 升级策略 → ctrl-tower-change 流程，审计 PR 合并后另行开工。
2. `npm run dev` 指向 .bat 的跨平台修复（agent-start.sh 已存在）。
3. 铁律 40-45「pre-commit 执法」声称与实现拉平（§4.4）。
4. 台账登记: preload 断链/假流式/报告内存态/upload-v2 假绿（M2 模式）/credentials 假声称，按审计闭环铁律另起 FIX 任务。

---

## 8. 风险与依赖

### 8.1 需创始人裁决（3 项）

| # | 裁决 | 背景 | 建议 |
|---|---|---|---|
| ① | **终端形态去留**（TUI 方案 A 保留最小入口 / B 全删） | TUI 是活的但是孤儿面（§4）；CLI 重叠 | A（最小改动，CLI 留作 E2E 工具）；确认永不做终端则 B |
| ② | **diagnosis-upload-v2 管线: 修复 or 收敛** | P0: 所有任务必 failed（假绿源，:553 亲证）；测量/专家段硬编码空（:607,:623）；而 consult SSE 管线是活的 | 收敛: /ga 表单入口下线或改走 consult，双管线维护成本高；若表单式诊断是产品需求则另立修复任务（3 天+） |
| ③ | **鉴权姿态**（本地信任白名单 / renderer 登录流） | 桌面对话 401 断链（P0-1）；/api/sentinel/* 已白名单是既有先例 | 本地信任白名单（对齐 sentinel 先例+llm-config 免认证先例），README 显式声明单机信任模型；多用户阶段按施工图 §5.5 重构——产品安全姿态变化，创始人知情即可 |

### 8.2 阻塞与依赖

1. **E2E 需要真实 LLM key**: D592 的端到端场景要么创始人提供测试 key，要么批准搭网关 mock server（OpenAI 兼容假端点）。无此则 D592 只能降级为 mock 层测试，产线 2-1 无法 verified。
2. **在途任务协调**: D587/D588（DSH 编码线 claimed: 工具结果修剪器/会话投影注册表）与 D590 的会话持久化设计同向——D590 开工前必读两份 dev doc（d3dcfb9e），防会话语义双轨。D589（evidence 批）已含线 1/线 2 测试点重验，与 D592 的 evidence 产出需带 at 时间戳衔接。
3. **ConversationEngine 首次 E2E 的缺陷翻出风险**: 862 行从未真跑，接 HTTP 后 provider 链/工具循环/相位机可能暴露连锁缺陷——D590 预估已含缓冲，超 3 天即停下来按 FIX 任务拆分，不硬扛。
4. **sqlite WAL 双进程写**: 方案 A 下 TUI/CLI 与 API server 并发写 synova.db。短期纪律（文档标注），长期随 TUI 处置消解。
5. **SSE 契约变更波及**: D590 新增 token 事件+D591 真流式会动 sse-contract.ts——use-streaming-contract.test.ts 需同步更新，属预期内改动（契约测试正是为此存在）。
6. **K3 审计点**: 本报告是架构盘点（非 K3 审计、未定义审计标准）；D590-D596 每个任务交付仍走常规 K3 审计。跨层检测的四类漏网形态已由本审计实证（§7 治理项 1），修复属控制塔域不在编码线写集。

### 8.3 风险登记（移交台账，按审计闭环铁律另起 FIX 任务）

| 发现 | 模式 | 去向 |
|---|---|---|
| upload-v2 假绿（@state: real 实则必抛+硬编码空输出） | M2 声称vs事实 | 裁决后 FIX |
| credentials.ts 安全声称虚假 | M2/M7 | D596④ |
| 权威文档05 chat/stream 不实声称 | M2/M7 | D596④ 勘误 |
| 铁律 40-45 执法声称无实现 | M7 | 跨切治理 3 |
| preload/假流式/死文件/死数据一批 | M3 建成未接线 | D591/D594/D596 |
| 报告 50 条 FIFO 内存态（重启丢用户数据） | 铁律 24/31 边缘 | D593① |

---

## 附录A: 审计中核实为「文档-现实漂移」的声称清单

| 声称 | 出处 | 物理核实 | 判定 |
|---|---|---|---|
| chat.ts 有 POST /api/chat/stream SSE | 权威文档05补充研究 §0.1 表 | `git log -S "/api/chat/stream" --all -- src/routes/chat.ts` 零命中（仅 8d64c433 文档归档提交含此串） | **从未存在**（M2） |
| L1 modules 含 `tui/` | product-lines.yaml 线2 | 仓库根与 src/ 均无 tui/ 目录（实为 src/tui-v2、src/tui-v3） | 路径漂移（M7） |
| "chat.ts — 统一 SSE + 进度可视化" | routes/chat.ts:3 文件头 | 文件内无 event-stream 头、无对话端点（只有 /chat 静态页+3 辅助接口） | 头注释过期（M7） |
| ConversationEngine "端到端未验证" | 产线 2-1 note | 属性属实：单测全 mock LLM（tests/conversation-engine.test.ts），无真实 LLM E2E | 如实，本报告 Phase 1 处置 |
| 铁律 40/41/44 有「pre-commit 硬阻断」 | CLAUDE.md 第六章 | grep scripts/ 全目录零执法逻辑（patches/memo/postinstall/use-streaming/flex-end/ink 模式均无检查代码） | 执法缺位（M7）——冻结项完好纯靠自觉 |
| credentials.ts "CredentialVault 加密不落盘" | credentials.ts:5 头注释 | :16-17 实为内存 Map 明文（亲证） | 声称虚假（M2） |
| diagnosis-upload-v2 "@state: real 接入真实测量管道+专家LLM推理" | diagnosis-upload-v2.ts:3 | :553 new(null) 必抛 + :607/:623 硬编码空输出"待迁移"（亲证） | 假绿（M2） |
| D575 "配置完即可用"（隐含） | D575 task-state（DS6 自标"发起诊断未端到端验证 ⏸"） | 生产态 consult 401，首条消息即断（白名单亲证） | DS6 自标诚实；承诺需 P0-1 修复兜底 |

## 附录B: 本次审计产出的治理动作

1. task-state 取号 D590-D596（scripts/control-tower/alloc-task-id.sh，7 壳已登记，随本 PR 提交）——§7 计划任务号真实可用。
2. 发现 D588.json 缺失（dev doc d3dcfb9e 已提交但 task-state 未登记壳）→ 移交 dev-doc 线补登记（不在本 PR 范围，防写集越界）。
3. 台账移交清单（§8.3 六项，M 模式已标注）→ 审计 PR 合并后由 CTO 登记 AUDIT-FINDINGS-LEDGER 并按审计闭环铁律另起 FIX 任务。
4. CTO 自领跨切治理四项（§7 末）: check-architecture 四类漏网加固 / npm run dev=.bat 跨平台修复 / 铁律 40-45 执法声称拉平 / 台账六项登记——均属 scripts/control-tower 域，走 ctrl-tower-change 流程另行开工。
