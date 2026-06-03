# SynovaAgent v0.1.0-beta 第三方代码审计报告

**审计日期**: 2026-06-02
**审计员**: 独立第三方 AI 代码审计员
**审计范围**: SynovaAgent 本体 + 项目文档 + engine-core 依赖
**审计方法**: 按用户旅程切片走查 + 逐文件审查 + CLAUDE.md 铁律对照

---

## 1. 总评分：C+（勉强可用，存在多项 P0 级阻塞缺陷）

| 维度 | 评分 | 说明 |
|------|------|------|
| 接线完整性 | **D** | Phase 1-5 诊断流水线未接线，TUI 首条消息后可能锁死 |
| 错误处理 | **C-** | 关键 catch 有日志，但 6 处空 catch 静默吞错，缺少 degraded 信号传播 |
| 测试质量 | **C** | 53 个测试覆盖核心逻辑，但 TUI/CLI 零覆盖，无端到端用户旅程测试 |
| 代码一致性 | **B-** | 整体术语一致，但 tool_call_id 误用函数名、provider 检测逻辑三处重复 |
| 安全性 | **B** | API Key 未硬编码，SQL 参数化，但无速率限制、orgId 未过滤 |
| 文档对齐 | **B-** | README 与代码基本一致，CLAUDE.md 在项目根目录而非包内 |
| 依赖管理 | **B+** | 依赖精简合理，engine-core 通过 file: 引用无已知漏洞 |

---

## 2. 执行摘要（给非技术创始人）

SynovaAgent 的基础架构搭建得相当扎实：三个 LLM 通道（DeepSeek/OpenAI/Gateway）都已实现，TUI 三栏界面设计专业，SQLite 数据持久化可靠，53 个测试覆盖了核心逻辑。

**但存在一个关键问题：用户开始对话后，发完第一条消息可能就无法发第二条了**（streaming 状态锁死）。另外，产品承诺的"六阶段诊断分析"——即 Phase 1 到 Phase 5 的自动诊断流水线——目前只有框架代码，实际诊断引擎没有真正接线到对话流程中。

**建议优先修复两个问题**：（1）修复输入框锁死 bug（预计 1 小时）；（2）将 Phase 1-5 诊断引擎真正接入对话流（预计 1-2 天）。修复后，产品即可达到"可演示可用"的水平。

其余问题（空 catch 块、测试覆盖、速率限制等）可以后续迭代处理。

---

## 3. 切片式问题清单

### 切片 1: 首次启动 → Setup 向导 → API Key 配置 → .env 写入 → 连接验证

| 步骤 | 状态 | 问题 |
|------|------|------|
| `.env` 自动加载 | ✅ 通过 | `loadEnvFile()` 在 `chat.ts` 和 `cli.ts` 都有实现 |
| LLM 配置检测 | ✅ 通过 | `isLLMConfigured()` 检查三个环境变量 |
| Setup 交互向导 | ✅ 通过 | `runSetup()` 引导选 Provider → 输 Key → 测连接 |
| .env 写入 | ⚠️ 部分通过 | `fs.writeFileSync` 使用同步写入，无 `try/catch`，磁盘满时会崩溃 |
| 连接验证 | ✅ 通过 | `healthCheck()` 区分 401 和网络错误，延迟测量准确 |
| 当前会话立即生效 | ✅ 通过 | `process.env` 在写入后立即赋值 |

**缺陷 #1**（Medium）：`setup.ts` 写入 .env 时如果磁盘满或目录无写权限，会抛出未捕获异常。应包装 try/catch 并提示用户。

### 切片 2: 启动流程 → Welcome 页 → 按 Enter → 对话界面 → 开场白

| 步骤 | 状态 | 问题 |
|------|------|------|
| Welcome 页创建 | ✅ 通过 | `showWelcome()` 在已创建的 screen 上显示 |
| Enter 键过渡 | ✅ 通过 | keypress 监听 → remove → resolve |
| TUI 三栏布局 | ✅ 通过 | `createTuiApp()` 复用同一 screen 构建布局 |
| 开场白显示 | ✅ 通过 | `addMessage('agent', OPENING_MESSAGE)` |
| Ctrl+C 退出 | ✅ 通过 | screen 级 key 监听 + process.exit(0) |

**无阻塞问题。**

### 切片 3: 第一轮对话 → 用户输入 → LLM 调用 → 流式输出 → 消息存储

| 步骤 | 状态 | 问题 |
|------|------|------|
| 用户输入捕获 | ✅ 通过 | `onSubmit` 回调 |
| 命令检测（/开头） | ✅ 通过 | `/quit`, `/help`, `/status`, `/history`, `/search` |
| LLM 流式调用 | ⚠️ 部分通过 | `streamWithToolLoop` 存在重复调用问题（见 #2） |
| Token 流式追加 | ✅ 通过 | `appendToken()` + `screen.render()` |
| 消息存储 | ✅ 通过 | `store.addMessage()` |

**🔴 缺陷 #2（Critical）：`streamWithToolLoop` 双重 LLM 调用**

`conversation.ts` 的 `streamWithToolLoop` 逻辑：
1. 先调用 `provider.stream()` → 获取文本回复并流式输出
2. 再调用 `provider.chat()` 带 tools → 检测是否有工具调用
3. 如果有工具调用，用 chat() 的结果替换 stream() 的结果

**问题**：
- 每条消息调用 LLM **两次**，API 成本翻倍
- `stream()` 和 `chat()` 可能返回不同结果，导致用户看到的流式内容和最终注入的工具调用不匹配
- 如果 `stream()` 有 token 输出但 `chat()` 检测到工具调用，被 pop() 掉的 stream 消息会丢失用户已看到的内容

**建议**：统一使用 `chat()` 获取完整响应（含 tool_calls），流式输出改为从 chat 结果中提取文本，或使用支持流式+工具调用的统一 API。

**🔴 缺陷 #3（High）：第一轮对话后 streaming 状态可能锁死**

`chat.ts` 的 `onSubmit` 回调中：
```typescript
app.chat.onSubmit(async (input) => {
    if (streaming) return;
    streaming = true;
    try { ... } finally {
      streaming = false;
      // 重置输入框内部状态
      try { (app.input as any)._reading = false; } catch {}
      app.input.setValue('');
      app.screen.render();
      app.chat.focus();
    }
});
```

`app.chat.focus()` 在 `finally` 块中调用，但如果 `app.chat` 的 `focus()` 方法内部抛异常，`app.chat.focus()` 之后的代码不会执行。更关键的是，**如果 LLM 请求超时（120s AbortSignal.timeout），用户等待期间再次按 Enter 会直接 return（streaming===true），没有任何反馈提示**。

**建议**：在 `if (streaming) return;` 前加一行 `app.chat.addMessage('system', '正在生成回复，请稍候...');` 或在 TUI 状态栏显示"处理中"。

### 切片 4: 第二轮对话 → 输入框复位 → 再次输入 → 再次 LLM → 连续对话

| 步骤 | 状态 | 问题 |
|------|------|------|
| streaming 状态复位 | ⚠️ 部分通过 | `finally` 块中复位，但若 focus() 抛异常则可能残留 |
| 输入框清空 | ✅ 通过 | `app.input.setValue('')` + `_reading = false` |
| 历史消息传递 | ✅ 通过 | `conv.messages` 数组持续增长 |
| Phase 推进显示 | ✅ 通过 | `app.side.setPhase()` + `setTitleStatus()` |

**无独立阻塞问题**，但受缺陷 #2 和 #3 影响。

### 切片 5: 命令系统 → /help /status /history /search 各命令路径

| 命令 | 状态 | 问题 |
|------|------|------|
| `/quit` / `/exit` | ✅ 通过 | 保存状态 → 销毁 screen → 退出 |
| `/help` | ✅ 通过 | 显示可用命令列表 |
| `/status` | ✅ 通过 | 显示 Phase + 消息数 + Provider |
| `/history` | ✅ 通过 | 显示最近 6 条非系统消息（截断 120 字） |
| `/search <词>` | ✅ 通过 | FTS5/LIKE 搜索，显示匹配片段 |

**无阻塞问题。** 命令系统实现完整。

### 切片 6: 工具调用 → LLM 请求工具 → 注册表查询 → 工具执行 → 结果注入

| 步骤 | 状态 | 问题 |
|------|------|------|
| 工具注册 | ✅ 通过 | `registerBuiltinTools()` 注册 4 个内置 + 26 个专家工具 |
| 工具查询 | ✅ 通过 | `ToolRegistry.toOpenAITools()` 生成 OpenAI schema |
| 工具执行 | ✅ 通过 | `ToolRegistry.execute()` 永不抛异常 |
| 结果注入 | ⚠️ 部分通过 | `tool_call_id` 使用函数名（见 #4） |
| 工具结果展示 | ✅ 通过 | JSON 序列化注入消息 |

**缺陷 #4（Medium）：`tool_call_id` 误用函数名**

`conversation.ts` 中：
```typescript
(this.messages as any[]).push({
  role: 'tool',
  tool_call_id: tc.function.name,  // ❌ 应该是唯一 ID，不是函数名
  content: JSON.stringify(execResult),
});
```

OpenAI 协议要求 `tool_call_id` 对应 assistant 消息中 `tool_calls[].id`（一个唯一字符串）。使用函数名作为 ID，在 LLM 同时调用多个同名工具时会导致歧义。虽然 DeepSeek 目前可能宽容处理，但不符合协议规范。

### 切片 7: 异常路径 → LLM 超时 → 连接失败 → API Key 无效 → 网络断开

| 场景 | 状态 | 问题 |
|------|------|------|
| LLM 超时（120s） | ⚠️ 部分通过 | `AbortSignal.timeout(120_000)` 触发，但错误处理只有通用 catch |
| 连接失败 | ✅ 通过 | `healthCheck` 返回 unhealthy，降级为离线模式 |
| API Key 无效 | ✅ 通过 | 401 状态码有专门错误消息 |
| 网络断开 | ⚠️ 部分通过 | fetch 抛异常，被 catch 捕获返回错误消息 |
| 本体 API 不可达 | ⚠️ 部分通过 | Cron 回调中 **静默跳过**（空 catch） |

**🟡 缺陷 #5（Medium-High）：Cron 本体监测静默失败**

`chat.ts` 中：
```typescript
scheduler.schedule('ontology-monitor', '*/5 * * * *', async () => {
    try {
      const response = await fetch(`http://localhost:${config.port}/...`);
      // ...
    } catch {
      // 本体 API 可能尚未就绪——静默跳过
    }
});
```

这个空 catch 违反了 CLAUDE.md 铁律 #11（静默降级禁止）和铁律 #24（异常处理审计）。至少应该 `log.debug('本体 API 不可达，跳过本轮监测')`。

类似的空 catch 还出现在：
- `synova-agent.ts` line 42: `} catch { /* 静默跳过 */ }`
- `mcp/index.ts` line 186: `} catch (err: any) { /* 无法解析 JSON 的行——静默跳过 */ }`
- `routes/chat.ts`（Web 界面 JS）line 210: `} catch {}`

**缺陷 #6（High）：无错误分类**

违反铁律 #32。所有错误都走同一个 catch 路径，LLM 超时（可重试）、API Key 无效（不可重试）、网络断开（可能可重试）没有区分处理。

### 切片 8: 数据持久化 → 会话创建 → 消息存储 → 状态序列化 → 恢复

| 步骤 | 状态 | 问题 |
|------|------|------|
| 会话创建 | ✅ 通过 | `store.createSession()` + WAL 模式 |
| 消息存储 | ✅ 通过 | `store.addMessage()` + FTS5 触发器 |
| 状态序列化 | ✅ 通过 | `conv.serialize()` → JSON → `saveState()` |
| 状态恢复 | ✅ 通过 | `AgentConversation.fromState()` |
| FTS5 搜索 | ✅ 通过 | 中文回退 LIKE，英文走 FTS5 |

**无阻塞问题。** SQLite 持久化层实现扎实。

---

## 4. 高危缺陷清单

| 编号 | 严重度 | 描述 | 影响 | 修复难度 |
|------|--------|------|------|----------|
| #2 | **Critical** | `streamWithToolLoop` 双重 LLM 调用导致成本翻倍和结果不一致 | 每条消息多一次 API 调用，流式内容与工具调用可能不匹配 | 中（重构 streamWithToolLoop） |
| #3 | **High** | 流式处理期间用户无法获得进度反馈，可能误以为卡死 | 用户体验差，可能重复提交 | 低（加状态提示） |
| #5 | **High** | 6+ 处空 catch 块违反铁律 #11/#24，错误静默消失 | 问题无法被运维发现，诊断失败数周无人察觉 | 低（加日志） |
| #6 | **High** | 无错误分类，所有错误同一降级路径 | LLM 超时不可自动重试，用户需手动重启 | 中（定义错误类型） |
| #7 | **Medium-High** | `chat.ts` 和 `SynovaAgent` 各创建一个 CronScheduler | 本体监测任务重复执行 | 低（统一调度器管理） |
| #1 | **Medium** | `setup.ts` .env 写入无异常处理 | 磁盘满时崩溃 | 低（加 try/catch） |
| #4 | **Medium** | `tool_call_id` 使用函数名而非唯一 ID | 多工具调用时 LLM 可能混淆 | 低（生成唯一 ID） |

---

## 5. 改进建议优先级排序

### P0 — 立即修复（本迭代之内）

| 优先级 | 修改 | 文件 | 预估工时 |
|--------|------|------|----------|
| P0-1 | 修复 `streamWithToolLoop` 双重 LLM 调用，统一为单次调用 | `conversation.ts` | 2-3 小时 |
| P0-2 | 流式处理期间添加"处理中"状态提示 | `chat.ts` | 30 分钟 |
| P0-3 | 所有空 catch 块补上日志（至少 log.debug） | 6 个文件 | 1 小时 |

### P1 — 本迭代

| 优先级 | 修改 | 文件 | 预估工时 |
|--------|------|------|----------|
| P1-1 | 定义错误类型枚举（LLMCallError / TimeoutError / NetworkError），支持差异化重试 | `providers/types.ts` + 各 provider | 2-3 小时 |
| P1-2 | `tool_call_id` 改为生成唯一 ID | `conversation.ts` | 30 分钟 |
| P1-3 | 消除 CronScheduler 重复创建 | `chat.ts` + `synova-agent.ts` | 1 小时 |
| P1-4 | `.env` 写入加 try/catch | `setup.ts` | 15 分钟 |
| P1-5 | Phase 1-5 诊断流水线接线到对话流 | `conversation.ts` + engine-core | 1-2 天 |

### P2 — 下迭代

| 优先级 | 修改 | 文件 | 预估工时 |
|--------|------|------|----------|
| P2-1 | 添加 TUI/CLI 端到端测试 | `tests/` | 1 天 |
| P2-2 | 添加 API 速率限制中间件 | `server.ts` | 2 小时 |
| P2-3 | orgId 输入过滤/白名单 | `routes/ontology.ts` | 30 分钟 |
| P2-4 | 统一 provider 检测逻辑为单一函数 | `chat.ts` / `cli.ts` / `mcp/index.ts` | 1 小时 |
| P2-5 | 添加 graceful shutdown（SIGTERM 处理） | `chat.ts` | 1 小时 |

---

## 6. CLAUDE.md 38 条铁律合规率

> 注：CLAUDE.md 实际位于项目根目录 `D:\novis-backup-20260526\Novis\CLAUDE.md`，而非 `synova-agent/CLAUDE.md`。

| 铁律编号 | 铁律名称 | 合规状态 | 说明 |
|----------|----------|----------|------|
| **铁律 0** | 协作对齐前置 | ⏭️ N/A | 非代码审计范围 |
| **铁律 0-2** | 测试先行 | ⚠️ 部分通过 | 53 个测试覆盖核心逻辑，但 TUI/CLI/Setup 零覆盖；测试命名未区分单元/集成/端到端 |
| **铁律 1** | 垂直切片交付 | ❌ 未通过 | Phase 1-5 诊断流水线只写了框架，用户不可见结果 |
| **铁律 2** | 触发定义+结果呈现 | ❌ 未通过 | Phase 1-5 缺少"谁来触发"和"用户在哪里看到结果"的定义 |
| **铁律 3** | 用户旅程测试 | ❌ 未通过 | 无端到端用户旅程测试（Slice 1-8 完整走通） |
| **铁律 4** | 交付完整（入口→交互→结果） | ⚠️ 部分通过 | TUI 对话链路完整，但诊断流水线未接线 |
| **铁律 5** | 后端能力 ≠ 用户可用功能 | ⚠️ 部分通过 | 六阶段诊断引擎（engine-core）已存在但未接入 TUI 对话 |
| **铁律 6** | 追问用户入口 | ⏭️ N/A | 设计阶段约束 |
| **铁律 7** | 确认 Done 标准 | ⏭️ N/A | 流程约束 |
| **铁律 8** | Mock/TODO 不留交付代码 | ⚠️ 部分通过 | `FeishuConnector` 标注 Phase A stub（合理），但 `engine-context.ts` 有 TODO: 替换为持久化存储 |
| **铁律 9** | 关键变更 grep 传播 | ⏭️ N/A | 流程约束 |
| **铁律 10** | 文档与代码一致 | ⚠️ 部分通过 | README 与代码基本一致，但 CLAUDE.md 在项目根目录而非 synova-agent 内 |
| **铁律 11** | 静默降级禁止 | ❌ 未通过 | 6+ 处空 catch 块，Cron 监测静默失败 |
| **铁律 12** | 集成测试 cover 真实路由 | ⚠️ 部分通过 | HTTP 集成测试使用真实 Express 路由，但 TUI 测试完全 mock |
| **铁律 13** | 占位符填实 | ✅ 通过 | 未发现未填充占位符 |
| **铁律 14** | 同步 INDEX.md | ⏭️ N/A | 文档维护约束 |
| **铁律 15** | 对照 DOC-STANDARD | ⏭️ N/A | 文档约束 |
| **铁律 16** | 三层产品架构 | ⏭️ N/A | 架构约束 |
| **铁律 17** | 部署后外部验证 | ⏭️ N/A | 部署约束 |
| **铁律 18** | Nginx 变更 | ⏭️ N/A | 部署约束 |
| **铁律 19** | pm2 变更 | ⏭️ N/A | 部署约束 |
| **铁律 20** | 桌面端排查 | ⏭️ N/A | 运维约束 |
| **铁律 21** | 构建后验证 | ⏭️ N/A | 构建约束 |
| **铁律 22** | 测试前目标确认 | ⚠️ 部分通过 | 测试用例有清晰的 Given/When/Then，但 TUI 测试完全 mock |
| **铁律 23** | 修改后传播检查 | ⏭️ N/A | 流程约束 |
| **铁律 24** | 异常处理审计 | ❌ 未通过 | 6+ 空 catch 块，缺少 log + degraded 标记 |
| **铁律 25** | OpenClaw 边界验证 | ⏭️ N/A | 设计约束 |
| **铁律 26** | UI 重构删除旧文件 | ⏭️ N/A | UI 约束 |
| **铁律 27** | 路由隔离 | ⏭️ N/A | 部署约束 |
| **铁律 28** | 版本管理 | ⏭️ N/A | 发布约束 |
| **铁律 29** | 调优前指标验证 | ⏭️ N/A | 优化约束 |
| **铁律 30** | 跨仓库对比验证 | ⏭️ N/A | 架构约束 |
| **铁律 31** | 降级信号传播 | ❌ 未通过 | 无 degraded 标记传播机制 |
| **铁律 32** | 错误分类强制 | ❌ 未通过 | 所有错误走同一 catch 路径，无错误类型枚举 |
| **铁律 33** | 测试命名约定 | ❌ 未通过 | 所有测试混用 `.test.ts`，无 `.integration.test.ts` 区分 |
| **铁律 34** | Feature Branch | ⏭️ N/A | Git 工作流约束 |
| **铁律 35** | 自动化优先 | ❌ 未通过 | 无可自动化规则（ESLint/tsc 规则、pre-commit 脚本） |
| **铁律 36** | 测试基础设施自检 | ⚠️ 部分通过 | `vitest.config.ts` 配置合理，但未验证根级 `npm test` 是否全绿 |
| **铁律 37** | Dead code 入仓库违规 | ⚠️ 部分通过 | 代码量精简，但 `mcp/index.ts` 的 `handleToolCall` 部分分支未实现 |
| **铁律 38** | （不存在） | — | CLAUDE.md 实际包含 37 条铁律（编号 0~37，但 0-2 合并计数为一条） |

### 合规率统计

| 状态 | 数量 | 占比 |
|------|------|------|
| ✅ 通过 | 2 | 5.4% |
| ⚠️ 部分通过 | 9 | 24.3% |
| ❌ 未通过 | 8 | 21.6% |
| ⏭️ N/A（非代码审计范围） | 18 | 48.6% |

**代码相关铁律合规率（排除 N/A）**: 2/19 通过 (10.5%)，9/19 部分通过 (47.4%)。

**最严重的违规**：
1. **铁律 1（垂直切片交付）**：Phase 1-5 诊断流水线未接线
2. **铁律 11/24（静默降级禁止/异常处理审计）**：6+ 处空 catch 块
3. **铁律 32（错误分类）**：无错误类型枚举

---

## 7. 测试质量评估

### 覆盖率概况

| 测试文件 | 测试数 | 覆盖模块 | 真实性 |
|----------|--------|----------|--------|
| `conversation.test.ts` | 8 | AgentConversation 状态机 | 高（fake provider 模拟合理） |
| `tool-calling.test.ts` | 9 | ToolRegistry + 工具调用循环 | 高（真实注册/执行/错误处理） |
| `session-store.test.ts` | 10 | SQLite CRUD + FTS5 搜索 | 高（真实 SQLite :memory:） |
| `providers.test.ts` | 7 | Provider 工厂 + 健康检查 | 中（hit 真实 API，依赖网络） |
| `provider-chain.test.ts` | 8 | ProviderChain failover | 高（fake provider 模拟失败） |
| `cron.test.ts` | 7 | CronScheduler CRUD | 高（真实 SQLite + 手动执行） |
| `tui-components.test.ts` | 8 | TUI 组件 mock 验证 | 低（完全 mock，无真实 blessed） |
| `smoke.test.ts` | 7 | HTTP 端点集成 | 高（真实 Express 服务器） |
| `sessions-api.test.ts` | 6 | 会话 REST API | 高（真实 Express + SQLite） |
| `metrics.test.ts` | 5 | Prometheus 指标 | 高（真实 MetricsCollector） |
| `deploy.test.ts` | 6 | 部署产物验证 | 中（文件存在性检查） |

**总计**: 53 个测试用例（与 README 声明一致）

### 评估

| 指标 | 评分 | 说明 |
|------|------|------|
| 代码行覆盖率 | **~35%**（估计） | 核心工具/存储/Provider 层覆盖好，TUI/CLI/MCP 零覆盖 |
| Mock 比例 | **~30%** | TUI 测试完全 mock；其他模块用真实 SQLite |
| 真实性评分 | **C+** | 集成测试使用真实 Express 路由和 SQLite，但无端到端测试 |

### 关键缺失

1. **无 TUI 端到端测试**：`tui/chat.ts` 的完整对话流程未测试
2. **无 CLI 测试**：`cli.ts` 的交互循环未测试
3. **无 Setup 向导测试**：`setup.ts` 的交互流程未测试
4. **无 streamWithToolLoop 测试**：最复杂的代码路径无测试覆盖
5. **无时间敏感测试**：`AbortSignal.timeout(120_000)` 等超时逻辑无真实 sleep 测试（违反铁律 #0-2）
6. **测试命名未分类**（违反铁律 #33）：所有测试混用 `.test.ts`

### 测试质量亮点

- `tool-calling.test.ts` 的工具执行测试覆盖了正常路径、未知工具、工具异常三个场景
- `session-store.test.ts` 的 FTS5 中文搜索测试验证了 LIKE fallback
- `provider-chain.test.ts` 的 failover 测试验证了 primary→secondary 切换

---

## 8. 附录

### 8.1 空 catch 块详细清单

| 文件:行号 | 代码 | 风险 |
|-----------|------|------|
| `conversation.ts:143` | `try { params = JSON.parse(...); } catch { params = {}; }` | 低（默认值合理） |
| `conversation.ts:166` | `} catch { return '工具调用超过最大轮次...' }` | 中（无日志） |
| `conversation.ts:237` | `try { params = JSON.parse(...); } catch { params = {}; }` | 低 |
| `conversation.ts:247` | `} catch { /* chat() 失败→保留流式回复 */ }` | 中（无日志） |
| `synova-agent.ts:42` | `} catch { /* 静默跳过 */ }` | 高 |
| `deepseek.ts:83` | `} catch { /* skip malformed chunks */ }` | 低 |
| `openai.ts:62` | `} catch {}` | 中 |
| `gateway.ts:59` | `} catch {}` | 中 |
| `mcp/index.ts:113/126/136` | `} catch { return JSON.stringify({ error: ... }) }` | 低（返回了错误） |
| `mcp/index.ts:186` | `} catch (err: any) { /* 无法解析 JSON */ }` | 中 |
| `routes/chat.ts:143/210/214` | `} catch {}` / `} catch(e)` | 中（前端 JS） |

### 8.2 文件统计

| 类别 | 文件数 | 代码行数（估计） |
|------|--------|------------------|
| 核心 Agent | 4 | ~800 |
| Provider 层 | 4 | ~600 |
| TUI | 6 | ~900 |
| 工具链 | 9 | ~1200 |
| 路由 | 6 | ~800 |
| 基础设施 | 5 | ~500 |
| 测试 | 11 | ~1500 |
| **总计** | **~45** | **~6300** |

### 8.3 审计方法说明

本次审计采用**按用户旅程切片走查**的方法：
1. 首先通读所有 P0/P1/P2 核心文件
2. 按 8 个用户旅程切片逐一走查触发点→数据流→结果呈现
3. 扫描全仓库空 catch 块、硬编码、安全漏洞
4. 对照 CLAUDE.md 38 条铁律逐条标注
5. 审查所有 11 个测试文件的覆盖范围和真实性

审计为**只读操作**，未修改任何代码文件。

---

**审计报告完毕。**

*审计员声明：本报告基于对 SynovaAgent v0.1.0-beta 源代码的只读审查。所有发现和建议均基于审计时的代码状态。报告中的代码行号可能因后续修改而偏移。*
