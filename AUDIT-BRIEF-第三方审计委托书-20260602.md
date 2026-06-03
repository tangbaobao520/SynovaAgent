# SynovaAgent 第三方全面审计 — 委托书

> **委托日期**：2026-06-02
> **审计对象**：SynovaAgent v0.1.0-beta（独立进程）
> **代码行数**：6,339 行 TypeScript / 75 个源文件 / 93 个测试用例
> **审计目标**：代码质量、架构合理性、安全性、可维护性、缺陷密度

---

## 零、代码路径（先读这里）

本委托书所有路径以此为基准：

```
审计根目录: D:\novis-backup-20260526\Novis\

SynovaAgent 本体:   D:\novis-backup-20260526\Novis\synova-agent\
  源代码:           synova-agent\src\
  测试:             synova-agent\tests\
  技能定义:         synova-agent\skills\
  配置文件:         synova-agent\package.json, tsconfig.json, vitest.config.ts

项目文档:           D:\novis-backup-20260526\Novis\docs\
  SynovaAgent 专属: docs\12-SynovaAgent-诊断代理\
  诊断引擎:         docs\01-Architecture-架构设计\Diagnosis-诊断引擎\
  工程铁律:         D:\novis-backup-20260526\Novis\CLAUDE.md

依赖引擎:           D:\novis-backup-20260526\Novis\server\vendor\@synova\engine-core\
```

下文所有相对路径（如 `src/tui/chat.ts`）均为相对于 `synova-agent\` 的路径。

---

## 一、产品背景（必读——这是理解代码的前提）

### 1.1 我们是谁，在做什么

**产品名**：Synova组织智能诊断（简称 SynovaAgent）  
**品牌**：Novis（原代号 ClawOrg，已废弃）  
**市场定位**：服务于 5-300 人团队（可扩展至 5-500 人）的 AI 组织诊断平台。更大规模企业暂不是目标客户。

**核心洞察**：5-300 人的团队往往缺乏专职的组织诊断能力——他们不知道自己的人员、工具、流程之间究竟有什么问题，也请不起麦肯锡。他们需要有人"把脉"——不是提一堆建议然后走人，而是持续监测、定期检查、逐渐优化。

**一句话**：把麦肯锡级的组织诊断能力，做成一个 AI Agent，让中小规模团队也能负担得起。

### 1.2 SynovaAgent 的产品定位

**SynovaAgent 是当前唯一活跃开发的项目。** Novis 桌面端和 SoloHub 均为暂停状态。

```
Novis 产品生态（品牌）
├── SynovaAgent ✅ 活跃     ← 本次审计对象：终端对话式组织诊断应用
├── Novis 桌面端 ⏸️ 暂停    ← 主控制台，后续恢复
└── SoloHub ⏸️ 暂停        ← 独立知识库，后续恢复
```

**SynovaAgent 是什么**：
- 一个**独立进程**的终端对话应用（TUI，Terminal User Interface）
- 用户配置 LLM API Key 即可使用，不需要部署服务器
- 对标"组织医生"——通过结构化访谈了解你的组织，然后运行六阶段诊断
- **双轨部署**：国际版对接 NemoClaw MCP 生态 / 国内版独立运行，对接国产大模型

### 1.3 用户旅程

```
用户打开终端 → 输入 synova
  → Welcome 过渡页（版本介绍、六边形 Logo）
  → 按 Enter 进入对话
  → Agent 做自我介绍（"你好，我们是六个 AI 专家组成的诊断团队..."）
  → 用户告诉 Agent 组织名称、规模、行业
  → Agent 进入六阶段诊断流程
  → 诊断完成，Agent 持续监测组织健康指标
```

### 1.4 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 运行时 | Node.js v24 + TypeScript 5.6 | tsx 执行（无需编译） |
| TUI 框架 | neo-blessed | 终端界面渲染（三栏布局） |
| LLM 接入 | 自建 Provider 系统 | 支持 DeepSeek / OpenAI 兼容 / 自定义 Gateway |
| 数据库 | SQLite (better-sqlite3) | 会话存储 + 全文搜索 (FTS5) |
| HTTP 服务 | Express | 可选的 REST API（本体查询、诊断、会话管理） |
| 日志 | pino | 写 stderr（不污染 TUI stdout） |
| 测试 | vitest | 93 个测试用例，11 个测试文件 |

### 1.5 关键工程约束

1. **独立进程**：不依赖 Novis 服务器，不依赖外部数据库，最小化部署门槛
2. **Windows 优先**：创始人使用 Windows，TUI 必须在 Windows Terminal/PowerShell 下完美运行
3. **双轨国际化**：国内轨走国产 LLM，国际轨走 MCP 协议（预留但未全量实现）
4. **38 条工程铁律**：项目有严格的开发规范（见 `CLAUDE.md`），审计时请对照检查

---

## 二、代码目录结构

### 2.1 总览

```
synova-agent/
├── src/                           # 全部源代码 (75 个 TS 文件)
│   ├── agent/                     # Agent 对话运行时
│   │   ├── conversation.ts        #   对话状态机 (Phase 0-5, 工具调用循环)
│   │   ├── tools.ts               #   工具注册与执行引擎
│   │   ├── builtin-tools.ts       #   26 个内置诊断工具注册
│   │   └── synova-agent.ts        #   Agent 类封装 (start/stop 生命周期)
│   │
│   ├── providers/                 # LLM Provider 适配层
│   │   ├── index.ts               #   工厂函数 + Provider 类型定义
│   │   ├── types.ts               #   接口定义 (LLMProvider, ChatOptions, StreamCallback)
│   │   ├── deepseek.ts            #   DeepSeek API 适配 (默认 Provider)
│   │   ├── openai.ts              #   OpenAI 兼容 API 适配 (通义千问/GLM/Kimi 等)
│   │   ├── gateway.ts             #   自定义 Gateway 适配 (高级用户)
│   │   └── registry.ts            #   Provider 注册中心 + Failover 逻辑
│   │
│   ├── tui/                       # 终端界面 (blessed TUI)
│   │   ├── app.ts                 #   TUI 主入口：三栏布局 + input + 分隔线
│   │   ├── chat.ts                #   对话入口：启动流程 (Setup → Welcome → 对话循环)
│   │   ├── chat-panel.ts          #   对话面板：消息列表 + 输入绑定 + wrapText
│   │   ├── side-panel.ts          #   洞察面板：诊断进度 + 组织图谱 + 告警区
│   │   ├── status-bar.ts          #   底部状态栏
│   │   └── welcome.ts             #   Welcome 过渡页 (六边形 Logo + 版本信息)
│   │
│   ├── store/                     # 持久化层
│   │   └── session-store.ts       #   SQLite 会话存储 (sessions + messages + FTS5)
│   │
│   ├── cron/                      # 定时任务
│   │   └── scheduler.ts           #   Cron 调度器 (SQLite 持久化 + setTimeout 循环)
│   │
│   ├── tools/                     # 诊断专家工具链 (26 个工具)
│   │   ├── index.ts               #   工具注册导出
│   │   ├── accuracy-tools.ts      #   准确率验证工具 (交叉验证/溯源/闭环)
│   │   ├── org-expert-tools.ts    #   组织诊断工具 (本体图/协作模式/决策流)
│   │   ├── tech-expert-tools.ts   #   技术诊断工具 (软件生态/代码健康/AI 成熟度)
│   │   ├── strategy-expert-tools.ts # 战略诊断工具 (行业扫描/竞争分析/商业模式)
│   │   ├── finance-expert-tools.ts  # 财务诊断工具 (成本/收入/ROI)
│   │   ├── action-expert-tools.ts   # 行动诊断工具 (优先级/执行/效果)
│   │   ├── marketing-expert-tools.ts # 营销诊断工具 (定位/竞争/GTM)
│   │   └── pattern-engine.ts      #   模式引擎 (SQLite 存储 + 模式匹配)
│   │
│   ├── connectors/                # 数据连接器 (双轨部署)
│   │   ├── types.ts               #   连接器接口定义
│   │   ├── index.ts               #   导出中心
│   │   ├── nemoclaw.ts            #   NemoClaw MCP 连接器 (国际轨)
│   │   └── feishu.ts              #   飞书 API 连接器 (国内轨)
│   │
│   ├── routes/                    # HTTP API 路由 (Express)
│   │   ├── chat.ts                #   Web 对话界面 (GET /)
│   │   ├── health.ts              #   健康检查 (GET /health)
│   │   ├── ontology.ts            #   本体 API (GET/POST /api/ontology/*)
│   │   ├── diagnosis.ts           #   诊断 API (POST /api/diagnosis/consult, SSE)
│   │   ├── sessions.ts            #   会话 API (GET /api/sessions)
│   │   └── review.ts              #   审核队列 API
│   │
│   ├── skills/                    # 技能系统
│   │   └── skill-loader.ts        #   技能加载器 (注入到 system prompt)
│   │
│   ├── monitoring/                # 监控与遥测
│   │   ├── metrics.ts             #   指标收集
│   │   └── routes.ts              #   监控 API 路由
│   │
│   ├── init/                      # 初始化
│   │   └── engine-context.ts      #   engine-core 上下文注入
│   │
│   ├── mcp/                       # MCP 协议支持
│   │   └── index.ts               #   MCP 工具导出
│   │
│   ├── index.ts                   # 主入口 (HTTP 服务模式)
│   ├── server.ts                  # Express 服务器创建
│   ├── config.ts                  # 配置读取 (环境变量)
│   ├── setup.ts                   # 交互式 Setup 向导 (LLM 配置)
│   ├── logger.ts                  # pino 日志 (写 stderr)
│   └── cli.ts                     # CLI 对话入口 (readline 版本)
│
├── skills/                        # 6 个诊断技能定义 (SKILL.md)
│   ├── cross_validate/SKILL.md    #   交叉验证
│   ├── detect_contradiction/SKILL.md # 矛盾检测
│   ├── human_calibration/SKILL.md #   人工校准
│   ├── match_pattern/SKILL.md     #   模式匹配
│   ├── trace_evidence/SKILL.md    #   证据追踪
│   └── verify_closed_loop/SKILL.md #  闭环验证
│
├── tests/                         # 11 个测试文件, 93 个测试用例
│   ├── conversation.test.ts       #   对话状态机测试
│   ├── cron.test.ts               #   Cron 调度器测试
│   ├── deploy.test.ts             #   部署验证测试
│   ├── metrics.test.ts            #   监控指标测试
│   ├── provider-chain.test.ts     #   Provider Failover 链路测试
│   ├── providers.test.ts          #   Provider 接口测试
│   ├── session-store.test.ts      #   会话存储测试
│   ├── sessions-api.test.ts       #   会话 API 测试
│   ├── smoke.test.ts              #   冒烟测试
│   ├── tool-calling.test.ts       #   工具调用测试
│   └── tui-components.test.ts     #   TUI 组件测试
│
├── scripts/                       # 一键安装脚本
│   ├── install.sh                 #   macOS/Linux
│   └── install.ps1                #   Windows
│
├── package.json                   # 依赖 + 脚本 (v0.1.0)
├── tsconfig.json                  # TypeScript 配置
├── vitest.config.ts               # 测试配置
├── Dockerfile                     # Docker 构建
├── docker-compose.yml             # Docker 编排
├── README.md                      # 项目说明
├── synova.cmd                     # Windows 全局命令包装
├── skill-manifest.json            # 技能清单
└── install-path.ps1               # PATH 安装脚本
```

---

## 三、架构关键点（审计重点）

### 3.1 对话状态机

```
Phase 0 (组织访谈) → Phase 1 (数据采集) → Phase 2 (假设生成)
  → Phase 3 (根因分析) → Phase 4 (报告生成) → Phase 5 (交付)
```

- 入口：`src/agent/conversation.ts` — `AgentConversation` 类
- 每个 Phase 有独立的 system prompt 和工具集
- 工具调用循环：LLM 返回 tool_calls → 执行工具 → 注入结果 → 重新调用 LLM（最多 3 轮）

### 3.2 TUI 三栏布局

```
┌─────────── 对话区 (75%) ───────────┐│── 洞察区 (25%) ──│
│  消息滚动区                         ││ 诊断进度 + 图谱  │
│  "你: xxx"                          ││                 │
│  "Agent: yyy"                       ││                 │
├────────────────────────────────────┤├─────────────────┤
│  ❯ 全宽输入框 (100%)                                        │
├─────────────────────────────────────────────────────────────┤
│  状态栏: Enter 发送  Ctrl+C 退出                             │
└─────────────────────────────────────────────────────────────┘
```

- 关键文件：`src/tui/app.ts`, `src/tui/chat-panel.ts`, `src/tui/side-panel.ts`
- **已知挑战**：neo-blessed 在 Windows 上的 `fullUnicode` CJK 支持、终端 codepage 兼容性

### 3.3 LLM Provider 系统

- 工厂模式：`createProvider(type, config) → LLMProvider`
- 三个 Provider 类型：deepseek / openai-compatible / gateway
- 流式输出：`stream(messages, callback)` → SSE token-by-token
- Failover 逻辑在 `providers/registry.ts`

### 3.4 数据流

```
用户输入 → Conversation.processMessageStream()
  → LLM Provider.stream()
    → LLM API (DeepSeek / OpenAI / ...)
  ← token stream
  → TUI appendToken() 渲染
  → 工具调用检测 (chat() 查询)
    → ToolRegistry.execute()
    → 结果注入消息历史
  → 最终回复 → TUI addMessage() → SQLite 存储
```

### 3.5 已知技术债务

1. **Windows TUI 兼容性**：`fullUnicode` + CJK 字符在 Windows conhost 下偶发渲染异常
2. **数据连接器未全量**：NemoClaw MCP 和飞书 API 连接器为 stub 实现
3. **模拟仿真引擎**：设计方案已有（ARCH-22），代码未开始
4. **Web UI**：仅 Express 返回静态 HTML，无完整前端
5. **错误分类**：部分 catch 块未使用类型化 Error 子类（铁律 32）

---

## 四、相关文档索引

### 4.1 核心架构文档（`docs/12-SynovaAgent-诊断代理/`）

| 文档 | 说明 |
|------|------|
| `ARCH-10-技能系统与诊断领域扩展框架-20260530.md` | 技能系统设计 |
| `ARCH-11-双重身份-既是操作系统也是第一家客户-20260530.md` | 产品定位 |
| `ARCH-12-行业诊断师经济-20260530.md` | 商业模式 |
| `ARCH-13-自我进化引擎设计-20260530.md` | 进化引擎 |
| `ARCH-14-IM对接与消息路由设计-20260530.md` | 消息路由 |
| `ARCH-15-多租户企业部署架构与Agent配置规范-20260531.md` | 多租户部署 |
| `ARCH-17-专家子Agent调度与合成器设计-20260601.md` | 专家调度 |
| `ARCH-22-模拟仿真引擎-设计方案-20260601.md` | 仿真引擎 |
| `AUDIT-代码审计与实施计划-20260530.md` | 前次审计 |
| `REFERENCE-SynovaAgent-技能与工具清单-20260530.md` | 工具清单 |
| `STRATEGY-诊断Agent化-全产品线影响评估-20260530.md` | 战略评估 |

### 4.2 诊断引擎文档（`docs/01-Architecture-架构设计/Diagnosis-诊断引擎/`）

| 文档 | 说明 |
|------|------|
| `ARCH-04-Synova多层诊断引擎架构-20260526.md` | 引擎架构 |
| `ARCH-06-Synova诊断平台演进路线-20260530.md` | 演进路线 |
| `ARCH-07-引擎审计与升级路径-20260530.md` | 引擎审计 |
| `CODE-QUALITY-IRON-RULES-V1.0-20260530.md` | 代码质量铁律 |

### 4.3 工程规范

| 文件 | 说明 |
|------|------|
| `CLAUDE.md` | 项目全貌 + 38 条铁律 |
| `synova-agent/README.md` | 快速开始 + 配置指南 |
| `docs/07-Lessons-踩坑录/LESSONS-全量经验教训库-20260523.md` | 历史教训 |

---

## 五、审计方法论建议（Anthropic 风格）

### 5.1 审计维度

请从以下维度逐层审计，每一层独立评分：

| 维度 | 权重 | 检查要点 |
|------|------|----------|
| **接线完整性** | 🔴 最高 | 用户可见功能是否真正可触达？每个触发点→数据流→结果呈现是否闭环？ |
| **错误处理** | 🔴 最高 | catch 块是否有 log + degraded 标记？空 catch 数量？降级路径是否静默？ |
| **测试质量** | 🟡 高 | 测试覆盖真实路由还是 mock？时间敏感逻辑是否有真实 sleep？ |
| **代码一致性** | 🟡 高 | 术语/类型/接口是否全仓库一致？是否存在硬编码应替换为枚举？ |
| **安全性** | 🟡 高 | API Key 是否硬编码？SQL 注入？路径遍历？输入校验？ |
| **文档对齐** | 🟢 中 | 文档描述与代码是否一致？占位符是否已填充？ |
| **依赖管理** | 🟢 中 | 依赖是否必要？是否有已知漏洞？包大小是否合理？ |

### 5.2 切片式审计流程

不建议按目录/文件顺序审计。建议按以下**用户旅程切片**逐一走查：

```
切片 1: 首次启动 → Setup 向导 → API Key 配置 → .env 写入 → 连接验证
切片 2: 启动流程 → Welcome 页 → 按 Enter → 对话界面 → 开场白
切片 3: 第一轮对话 → 用户输入 → LLM 调用 → 流式输出 → 消息存储
切片 4: 第二轮对话 → 输入框复位 → 再次输入 → 再次 LLM → 连续对话
切片 5: 命令系统 → /help /status /history /search 各命令路径
切片 6: 工具调用 → LLM 请求工具 → 注册表查询 → 工具执行 → 结果注入
切片 7: 异常路径 → LLM 超时 → 连接失败 → API Key 无效 → 网络断开
切片 8: 数据持久化 → 会话创建 → 消息存储 → 状态序列化 → 恢复
```

### 5.3 关键文件清单（按审计优先级）

**P0 — 必须审**：
- `src/tui/chat.ts` — TUI 主入口，启动流程，对话循环
- `src/agent/conversation.ts` — 对话状态机，工具调用循环，流式输出
- `src/agent/tools.ts` — 工具注册与执行引擎
- `src/tui/chat-panel.ts` — 消息渲染，输入处理，wrapText
- `src/tui/app.ts` — TUI 布局管理
- `src/providers/deepseek.ts` — LLM API 适配
- `src/setup.ts` — Setup 向导

**P1 — 应该审**：
- `src/store/session-store.ts` — SQLite 存储
- `src/cron/scheduler.ts` — 定时任务
- `src/providers/registry.ts` — Provider Failover
- `src/tui/welcome.ts` — Welcome 页
- `src/server.ts` — Express 服务器
- `src/config.ts` — 配置管理
- `src/logger.ts` — 日志系统

**P2 — 可选审**：
- `src/tools/*.ts` — 26 个专家工具
- `src/connectors/*.ts` — 数据连接器
- `src/skills/skill-loader.ts` — 技能加载
- `src/monitoring/*.ts` — 监控遥测
- `src/routes/*.ts` — HTTP 路由
- `skills/*/SKILL.md` — 技能定义

---

## 六、交付预期

审计完成后，请输出以下格式的报告：

```
1. 总评分：A/B/C/D/F
2. 各维度分项评分 + 关键发现
3. 切片式问题清单（按用户旅程切片组织）
4. 高危缺陷清单（安全 / 数据丢失 / 崩溃级）
5. 改进建议优先级排序（P0 立即修复 / P1 本迭代 / P2 下迭代）
6. 对照 CLAUDE.md 38 条铁律的合规率
```

---

> **委托方备注**：本项目的唯一程序员是 Claude Code (deepseek-v4-pro)。创始人为非技术背景。审计时请考虑这个人力约束——建议的可执行性比建议的数量重要。
