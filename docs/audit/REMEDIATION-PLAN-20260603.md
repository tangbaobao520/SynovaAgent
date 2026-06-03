# SynovaAgent 执行路线 — 基于 MASTER-REPORT 权威架构

> 来源：MASTER-REPORT-审计架构模块化综合报告-20260603.html (Part 7)
> 架构设计：ARCH-20/21 L1-L5 五层解耦（全貌报告 V1.5）
> 此文档为唯一执行标准。

---

## 架构约束（不可妥协）

1. **L1-L5 五层解耦**：交互→编排→分析→本体→数据。L2 是独立编排层（不是交互层一部分），专家 Agent 在 L3 内部（不是独立层）
2. **engine-core 297 文件必须拆包**：按领域拆为 ~15 独立 npm 包，每个独立 package.json + 版本 + 测试
3. **知识摄取是必需能力**：PDF/DOCX/Excel 解析 → SOG 本体构建
4. **渐进式改造**：每次改一个模块，测试全绿再继续，不推倒重来

---

## 已完成的 Phase 0 项（本会话）

| 任务 | 状态 | 说明 |
|------|------|------|
| P0-1: streamWithToolLoop 双重 LLM 调用 | ✅ | tool-loop-executor.ts 统一为单次 chat() |
| P0-3: 空 catch 块补日志 | ⚠️ | accuracy-tools 修复，10 处入 TECH_DEBT |
| P1-1 (部分): ConversationEngine 纯逻辑化 | ✅ | 已拆为 4 组件 + 从 TUI 解耦 |
| P1-1 (部分): ToolRegistry 基础 | ⚠️ | 已注册 26 工具，但全是 local 模式，未扩展多执行模式 |
| P1-4 (部分): .env 异常 | ✅ | try/catch 安全写入 |
| P1-4 (部分): Cron 单例 | ✅ | 全局单例 + 初始化锁 |
| 铁律自动化 | ✅ | pre-commit 6 硬阻断 + 架构检查 + commit-msg + pre-push + CI |
| 类型安全 | ✅ | as any 47→0，LLMMessage 扩展，SQLite 行类型 |
| 架构解耦 P1 | ✅ | L2→engine-core 诊断通过 diagnosis-launcher 桥接 |
| AgentConversation 删除 | ✅ | CLI/MCP/TUI 已迁移到 ConversationEngine |

---

## 待执行：Phase 1 — 接线引擎（本周，2-3 天）

### P0-2: TUI "处理中"状态提示 (30min)
- 文件：`src/tui/chat.ts`
- streaming 时状态栏显示"正在生成回复..."
- 优先级：P0（用户感知阻塞）

### P1-1 剩余: ToolRegistry 多执行模式 (4-6h)
- 当前 26 工具全是 local 函数
- 必须扩展：local / connector / remote-agent / http 四种执行模式
- 定义 `ToolDescriptor` 接口：name/description/parameters/executionMode/category
- Connector 启动时自动注册工具到 ToolRegistry

### P1-2: 接线 Phase 1 诊断到对话流 (1-2天)
- Phase 0 访谈信息 → SOG 本体 (createNode/createEdge)
- Phase 1 自动触发 DiagnosisOrchestrator
- 诊断结果通过 TUI side-panel 展示（进度 + 发现）

### P1-3: 接线 EvidenceManager 证据池 (2-3h)
- Agent 从读原始对话 → 读结构化 Evidence
- 矛盾检测自动标记高价值诊断信号

### P1-4: 定义 StorageBackend 接口 (2-3h)
- engine-core storage.ts 当前是内存模式
- 需要 SQLite 后端 + 接口抽象

### P1-5: 定义错误类型枚举 + 重试策略 (2-3h)
- Timeout / Network / Auth / InvalidInput
- Timeout → 可重试一次；Auth → 不可重试；Network → 退避重试

### P1-6: tool_call_id + Cron 统一 + .env 安全 (1h)
- tool_call_id 改为 crypto.randomUUID()
- Scheduler → 全局单例（✅ 已完成）
- .env 写入 try/catch（✅ 已完成）

### P1-7: Connector-Registry 基础框架 (1-2天)
- Connector 接口：getToolDescriptors() / execute() / connect() / disconnect()
- 注册中心：register / unregister / list / getStatus
- 飞书 Connector 最小实现

### P1-8: Extension Registry 基础框架 (1-2天)
- ExtensionManifest 接口
- 生命周期：load → validate → activate → deactivate → unload
- SOG 节点/边类型运行时注册

### P1-9: Expert-Platform 基础框架 (2-3天)
- 专家贡献层：自然语言/表单 → 结构化知识提取
- 模板进化层：真实诊断验证 → 自动标记状态
- 区分原理层(why)和方案层(how)

---

## 待执行：Phase 2 — 模块化（下周，3-5 天）

按 MASTER-REPORT Part 3 拆分方案：

| 顺序 | 包名 | 领域 | 工时 |
|------|------|------|------|
| 1 | @synova/sog-core | L4 本体数据契约（✅ 已存在） | — |
| 2 | @synova/extension-registry | 运行时扩展注册中心 | 1天 |
| 3 | @synova/expert-platform | 行业专家贡献 + 模板进化 | 1天 |
| 4 | @synova/diagnosis-engine | 六阶段诊断引擎 | 1-2天 |
| 5 | @synova/knowledge-ingest | 知识摄取 | 1天 |
| 6 | @synova/connector-registry | 连接器平台 | 1天 |
| 7 | @synova/agent-core | Agent 运行时 | 1天 |
| 8 | @synova/evolution-engine | 联邦进化 | 1天 |

---

## 工时总计

| Phase | 内容 | 工时 |
|-------|------|------|
| Phase 0（已完成） | 紧急修复 | ✅ |
| Phase 1（剩余） | 接线引擎 + 框架 | ~10 天 |
| Phase 2 | 包拆分 | ~8 天 |
| Phase 3 | 测试补齐 + 安全 | ~3 天 |
| **总计** | | **~21 天** |
