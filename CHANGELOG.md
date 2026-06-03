# CHANGELOG

## 2026-06-04 — P0/P1 审计修复 + DeepSeek V4 + L1 UX

### 审计修复（30 项 → 12 已修复, 3 审计错误, 其余降级/无需修复）

**架构违例修复**
- `routes/diagnosis.ts` 移除 `@synova/engine-core` 直接依赖，改用 `EngineCoreVendorAdapter`（铁律 39 L1→L2）
- `server.ts` 编排层初始化：EventBus + PhaseStateMachine + SessionManager + FederalAdapter + ConnectorBinding
- `wiring.ts` HTTP 路径接线（原仅 TUI），`bindConnectorTools()` 零调用修复

**代码质量**
- 5 处空 catch 块补充 `log.warn`/`log.debug` 信号
- `GraphBridge` 6 个 upsert 方法全部接入 `diagnosis-launcher`
- `ExpertDispatcher` 吸收 engine-core 结构化解析 + 重试 + 超时，旧 `ExpertSubAgentExecutor` 标记 @deprecated
- 删除 engine-core 孤立 `sog/` 目录（与 `packages/sog-core` 逐字节重复）

**测试修复**
- `conversation-engine.test.ts` import 路径修复（0 tests → 11 tests, 10 passed）
- 冒烟/会话测试改用 port 0 随机端口，消除 EADDRINUSE
- Python bridge 测试加 beforeAll 可用性检测，不可用时自动跳过
- tsc 预推送门禁精准排除 vendor/packages

**Code Review 接线修复**
- `CredentialVault` AES-256-GCM 凭证加密接入 server.ts
- `ConnectorPipeline` 接入 POST `/api/connector/sync` + 30min 定时同步
- `OntologyEventBus` 注入 GraphStore 单例初始化

### DeepSeek V4 优化

- **P0**: 模型名迁移 `deepseek-chat` → `deepseek-v4-flash`（7/24 后旧名 404）
- **P1**: Strict Mode — 工具参数服务端 Schema 验证（`strict: true` + `additionalProperties: false`）
- **P1**: Prefix Cache — 工具定义固化缓存，按名称排序确保跨请求字节序列一致
- **P1**: `toOpenAITools()` 缓存自动失效机制

### L1 用户体验改进

- 统一 SSE 事件协议（同时解析 `event:` 和 `data:` 两种格式）
- 诊断进度可视化（6 阶段进度条 + 阶段完成标记 + 脉冲动画）
- 中间发现卡片（标题 + 摘要 + 可信度标签）
- Notion AI 风格快捷操作按钮（"诊断我的公司" / "团队协作分析" / "关键人风险评估"）
- `DiagnosisEvent` 增强（`confidence` / `nodesCreated` / `edgesCreated`）

### 部署交付

- `scripts/setup.ps1` — PDE 客户 Windows 一键部署脚本（7 步自动化）

### 版本号

- 版本号读取统一为 `getCurrentVersion()`（`health.ts` + `welcome.ts` 移除内联 readFileSync）

### Pre-commit 工具修复

- `as any` 检测正则 `as any[][;,)}>]` → `as any\b`（修复漏匹配空格/行尾）
