# 鉄律 33 — 测试文件命名约定

> 创建日期: 2026-05-31
> 适用范围: 全仓库所有 `*.test.ts` 文件
> 前置状态: 当前 65 个测试文件全部使用 `*.test.ts` 后缀，无分类命名

---

## 一、命名约定

| 后缀 | 定义 | 判定标准 |
|------|------|----------|
| `*.test.ts` | **单元测试** | 纯函数 / 纯内存逻辑，零 I/O（无文件系统、无网络、无数据库） |
| `*.integration.test.ts` | **集成测试** | 至少一项真实 I/O：Express HTTP 服务 + `http.request` / SQLite（含 `:memory:`）/ 文件系统读写 / 真实模块间交互 |
| `*.e2e.test.ts` | **端到端测试** | 完整用户旅程，hits 真实运行中的服务器（非测试内 createServer），使用真实 LLM / 外部服务（或可控 sandbox） |

### 判定优先级

```
1. 是否启动 HTTP server (http.createServer) 并 hit 它？  → YES → *.integration.test.ts
2. 是否使用真实 SQLite（含 new Database(':memory:')）？   → YES → *.integration.test.ts
3. 是否使用真实文件系统读写（fs.writeFileSync 等）？        → YES → *.integration.test.ts
4. 以上全部为 NO → 纯单元测试                              → *.test.ts
```

### 术语边界说明

| 场景 | 分类 | 理由 |
|------|------|------|
| `ScriptedLLM` / `FaultyLLM` / `makeLLMClient` 测试替身 | **Unit** | 完全在内存中，零 I/O |
| `vi.fn().mockResolvedValue(...)`（vitest mock） | **Unit** | mock 函数不触发 I/O |
| `new Database(':memory:')`（better-sqlite3 内存模式） | **Integration** | 真实的 SQLite 引擎执行完整 SQL，非 mock |
| `createSqliteDb()`（写临时文件 SQLite） | **Integration** | 真实的 SQLite 文件 I/O |
| `http.createServer(app).listen(0, ...)` 在测试内 | **Integration** | 真实的 HTTP 协议栈，端口绑定，TCP 连接 |
| `fs.writeFileSync(tempPath, ...)` 写临时目录 | **Integration** | 真实的文件系统 I/O |
| `new DiagnosisEventStream(mockRes)` — mock 了 Response | **Unit** | mock 对象无真实 I/O |
| `new SessionTranscriptor(...)` — 真实 `fs` 写 JSONL | **Integration** | 真实文件系统 I/O |

---

## 二、现有测试文件全量分类

### A. Engine-Core 诊断管线测试

> 路径: `server/vendor/@synova/engine-core/src/pipeline/diagnosis/__tests__/`
> 共 32 个文件

#### 单元测试（31 个）— 保持 `*.test.ts`

| # | 当前文件名 | 被测模块 | I/O 分析 |
|---|-----------|---------|---------|
| 1 | `diagnosis-types.test.ts` | 类型序列化 / 枚举值 / 可区分联合类型 | 纯内存 JSON round-trip |
| 2 | `diagnosis-prompt-builder.test.ts` | Prompt 组装器（Builder 模式） | 纯内存字符串拼接 |
| 3 | `diagnosis-permissions.test.ts` | 7 层权限决策树 + RecordingPermissionStore | 纯内存 Policy 对象 |
| 4 | `diagnosis-recovery.test.ts` | 故障恢复配方（8 场景覆盖） | 纯内存 Executor + async pass/fail steps |
| 5 | `diagnosis-orchestrator.test.ts` | 六阶段编排器（ScriptedLLM / FaultyLLM / NoopToolExecutor） | 测试替身，零真实 I/O |
| 6 | `financial-impact.test.ts` | 财务归因引擎（computeFinancialImpact / simulateImprovement） | 纯计算，stub FullDiagnosis |
| 7 | `gap-recorder.test.ts` | 缝隙记录器（100 条上限淘汰 / 多团队隔离） | 纯内存 Map 操作 |
| 8 | `evidence-manager.test.ts` | 证据池管理器（去重 / 矛盾检测 / 过期 / 查询） | 纯内存 EvidenceManager |
| 9 | `key-person-risk.test.ts` | 关键人才风险（busFactor / SPOF / 恢复天数） | 纯计算，构造 RoleDependency[] |
| 10 | `diagnosis-session.test.ts` | 会话压缩（token 估算 / ToolUse-ToolResult 配对保护） | 纯内存消息列表 |
| 11 | `empathy-templates.test.ts` | 共情模板（renderEmpathyMessage / adaptDetailLevel） | 纯内存模板渲染 |
| 12 | `sensitivity-rules.test.ts` | 隐私控制（detectSensitiveFields / redactObject / 审计） | 纯内存规则匹配 |
| 13 | `interviewee-profile.test.ts` | 角色画像（buildIntervieweeProfile / 13 种内置角色） | 纯内存枚举映射 |
| 14 | `question-bank/index.test.ts` | 问题库（query / count / custom CRUD / generateQuestionnaire） | 纯内存内置题库 |
| 15 | `financial-snapshot.test.ts` | 财务报表分析（利润率 / YoY / 现金流健康度 / validateEntry） | 纯计算，stub FinancialEntry |
| 16 | `diagnosis-archive.test.ts` | 诊断归档（archive / query / extractKnowledge / 200 条淘汰） | 纯内存 Map 存储 |
| 17 | `ai-product-knowledge.test.ts` | AI 产品知识库（查询 / 版本检测 / 库存分析 / fuzzySearch） | 纯内存内置数据 |
| 18 | `organization-knowledge-builder.test.ts` | 组织知识库（CRUD / upsert / cite / extractFromDiagnosis） | 纯内存 store |
| 19 | `fde-toolset.test.ts` | FDE 工具集（3 工具定义 / createFdeToolExecutor） | 纯内存工具注册 + 执行 |
| 20 | `auto-action.test.ts` | 自动行动引擎（规则匹配 / 去重 / 优先级排序 / 健康诊断不触发） | 纯计算 + 规则匹配 |
| 21 | `auto-interpreter.test.ts` | 自动解读器（fallback narrative / LLM 不可用降级 / 三角色结构） | 纯计算 + fallback 路径 |
| 22 | `task-integration.test.ts` | 任务集成（manual 跳过 / already-created 跳过 / 未配置系统跳过） | 纯内存项判断逻辑 |
| 23 | `diagnosis-event-stream.test.ts` | SSE 事件流封装（write / close / error / interrupt / 幂等） | mock Response 对象，零真实 HTTP |
| 24 | `diagnosis-error.test.ts` | 错误归一化（枚举匹配 / 12 种关键词模式 / 多类型输入 / 可恢复判别） | 纯字符串匹配 |
| 25 | `report-renderer.test.ts` | HTML 报告渲染（金字塔结构 / CSS 自包含 / XSS 防护 / UTF-8） | 纯内存字符串拼接 |
| 26 | `diagnosis-hook-map.test.ts` | 钩子系统（register / run pipeline / pipe / interrupt） | 纯内存 hook 注册执行 |
| 27 | `agent-tool-registry.test.ts` | Agent 工具注册表（register / list / execute / 22+3 自动注册） | 全局内存注册表 |
| 28 | `sub-agent-isolator.test.ts` | 子 Agent 隔离器（5 种 Agent / timeout / AbortSignal / 并行 / 重试） | ScriptedLLMClient + AbortController（测试替身） |
| 29 | `differentiation-validation.test.ts` | 差异化实质性验证（rule → LLM 辅助判定 / 真伪判别） | 纯计算 + vi.fn mock LLM judge |
| 30 | `positioning-consistency.test.ts` | 定位三方一致性（external-internal-customer / strong/partial/broken） | 纯计算，零依赖 |
| 31 | `category-clarity.test.ts` | 品类认知清晰度（词频分布 / clear/fuzzy/chaotic / CJK+EN 双语文） | 纯计算，零依赖 |

#### 集成测试（1 个）— 须重命名为 `*.integration.test.ts`

| # | 当前文件名 | 被测模块 | I/O 分析 |
|---|-----------|---------|---------|
| 1 | `session-transcript.test.ts` | 会话转录（JSONL 文件） | `fs.writeFileSync` / `fs.readFileSync` / `fs.existsSync` / `fs.rmSync` 操作临时目录 |

---

### B. 路由测试

> 路径: `server/src/routes/__tests__/`
> 共 33 个文件（含 1 个 `test-helpers.ts`）

#### 单元测试（4 个）— 保持 `*.test.ts`

| # | 当前文件名 | 被测模块 | I/O 分析 |
|---|-----------|---------|---------|
| 1 | `im-intent-detector.test.ts` | 意图识别（KeywordIntentDetector / LLMIntentDetector / HybridIntentDetector） | 纯内存类实例化 + ScriptedLLMClient |
| 2 | `im-security-check.test.ts` | 四层安全检查管道（TransportSignature / ChannelPolicy / TeamBoundary / ToolPermission） | 纯内存层实例化 |
| 3 | `im-dedup.test.ts` | 消息去重（RingBufferMessageDeduper / TTLMessageDeduper / CompositeMessageDeduper） | 纯内存去重器 |
| 4 | `im-agent-context-store.test.ts` | Agent 上下文存储（InMemoryAgentContextStore / LRU / TTL / buildIMContextPrompt） | 纯内存 InMemoryStore + 字符串 Prompt 构建 |

#### 集成测试（29 个）— 须重命名为 `*.integration.test.ts`

| # | 当前文件名 | I/O 类型 | 备注 |
|---|-----------|---------|------|
| 1 | `auth.test.ts` | HTTP + 真实 SQLite（`createSqliteDb` 文件 DB） | register → login → /me 三步闭环 |
| 2 | `agent-chat.test.ts` | HTTP + 真实 SQLite + mock `global.fetch` | 完整聊天生命周期（创建 / 消息 / 删除） |
| 3 | `agent-message.test.ts` | HTTP + mock DB/fs/protocol-engine | 消息拦截（允许 / 拒绝 / 降级 / 跨团队边界） |
| 4 | `diagnosis.test.ts` | HTTP + SSE + mock `@synova/engine-core` | 六阶段 SSE 流式诊断 |
| 5 | `synova.test.ts` | HTTP + mock engine（工厂函数） | Synova 引擎路由（会话 / 蓝图 / 安装） |
| 6 | `synova-incremental.test.ts` | HTTP + mock engine | 增量更新（新增角色 / 协议警告 / 删除 / 蒸馏） |
| 7 | `l0.test.ts` | HTTP + SSE + mock fetch/PhaseAEngine/public-api | L0 顾问式对话（extract → input → confirm → incubation → deliver） |
| 8 | `evolution.test.ts` | HTTP + 真实文件系统（temp `evolution-overrides.json`） | M3 进化信号（default / overrides_file / circuit_breaker） |
| 9 | `gateway.test.ts` | HTTP（真实路由逻辑，无业务 mock） | Gateway 配置（GET /config / POST /regenerate） |
| 10 | `version.test.ts` | HTTP（真实路由逻辑，无业务 mock） | 版本查询（semver / releaseDate / changes） |
| 11 | `events.test.ts` | HTTP + SSE（真实 SSE 心跳） | 事件流（connected / heartbeat） |
| 12 | `knowledge.test.ts` | HTTP + mock collector/ingest/mapper/injector/DB | 知识注入路由 |
| 13 | `security.test.ts` | HTTP + mock security-audit/safety | 安全审计路由（audit-skill / audit-batch / status） |
| 14 | `cockpit.test.ts` | HTTP + 真实 SQLite | 指挥舱路由（agents / contract / tasks / cost / overview） |
| 15 | `distillation.test.ts` | HTTP + mock scenario-forge | 编辑式蒸馏路由（scenarios CRUD / regenerate / versions） |
| 16 | `feedback.test.ts` | HTTP + 真实 SQLite | 反馈路由（POST feedback） |
| 17 | `harness.test.ts` | HTTP + mock public-api（16 端点） | Harness API（teams / health / collect / metrics / protocol） |
| 18 | `llm-configs.test.ts` | HTTP + 真实文件系统（temp `~/.openclaw/openclaw.json`） | LLM 配置路由（CRUD / verify / default） |
| 19 | `marketplace.test.ts` | HTTP + mock marketplace-client/sync/registry | 千面市场路由（catalog / search / install） |
| 20 | `onboarding.test.ts` | HTTP + mock onboarding（scanWorkspace / createFromTemplate） | 新手引导路由 |
| 21 | `qa.test.ts` | HTTP + mock fs | QA 质量评估路由（evaluate / run-suite / report / baseline） |
| 22 | `scenarios.test.ts` | HTTP + mock scenario-forge/template-forge | 场景生成路由（quick-match / forge / templates） |
| 23 | `share.test.ts` | HTTP + mock share service | 分享裂变路由（generate / create / install / stats） |
| 24 | `snapshots.test.ts` | HTTP + mock `@synova/engine-core` | 快照路由（CRUD / diff / rollback） |
| 25 | `teams.test.ts` | HTTP + 真实 SQLite | 团队导入导出路由（list / detail / export / import） |
| 26 | `templates.test.ts` | HTTP + 真实 SQLite | 模板路由（list / detail / download / install / versions） |
| 27 | `org.test.ts` | HTTP + 真实 SQLite（`new Database(':memory:')`） | 组织管理路由（C1-C6 + Steward 全流程） |
| 28 | `celebrity-evidence.test.ts` | HTTP + 真实文件系统（temp presets/celebrities dir） | 名人证据路由 |
| 29 | `im-router.test.ts` | HTTP + 真实 SQLite（`new Database(':memory:')`） | IM 路由（Express + IMSessionStore + 真实 SQL） |
| 30 | `update.test.ts` | HTTP + mock update-checker | 版本更新路由 |

---

## 三、改名执行计划

### 阶段 1: Engine-Core 目录（1 个文件改名）

```bash
cd server/vendor/@synova/engine-core/src/pipeline/diagnosis/__tests__/

mv session-transcript.test.ts session-transcript.integration.test.ts
```

其余 31 个 engine-core 测试文件保持 `*.test.ts` 不变。

### 阶段 2: Routes 目录（30 个文件改名）

```bash
cd server/src/routes/__tests__/

# 按字母序排列
mv agent-chat.test.ts           agent-chat.integration.test.ts
mv agent-message.test.ts        agent-message.integration.test.ts
mv auth.test.ts                 auth.integration.test.ts
mv celebrity-evidence.test.ts   celebrity-evidence.integration.test.ts
mv cockpit.test.ts              cockpit.integration.test.ts
mv diagnosis.test.ts            diagnosis.integration.test.ts
mv distillation.test.ts         distillation.integration.test.ts
mv events.test.ts               events.integration.test.ts
mv evolution.test.ts            evolution.integration.test.ts
mv feedback.test.ts             feedback.integration.test.ts
mv gateway.test.ts              gateway.integration.test.ts
mv harness.test.ts              harness.integration.test.ts
mv im-router.test.ts            im-router.integration.test.ts
mv knowledge.test.ts            knowledge.integration.test.ts
mv l0.test.ts                   l0.integration.test.ts
mv llm-configs.test.ts          llm-configs.integration.test.ts
mv marketplace.test.ts          marketplace.integration.test.ts
mv onboarding.test.ts           onboarding.integration.test.ts
mv org.test.ts                  org.integration.test.ts
mv qa.test.ts                   qa.integration.test.ts
mv scenarios.test.ts            scenarios.integration.test.ts
mv security.test.ts             security.integration.test.ts
mv share.test.ts                share.integration.test.ts
mv snapshots.test.ts            snapshots.integration.test.ts
mv synova.test.ts               synova.integration.test.ts
mv synova-incremental.test.ts   synova-incremental.integration.test.ts
mv teams.test.ts                teams.integration.test.ts
mv templates.test.ts            templates.integration.test.ts
mv update.test.ts               update.integration.test.ts
mv version.test.ts              version.integration.test.ts
```

以下 4 个文件保持 `*.test.ts` 不变（纯单元测试）：
- `im-intent-detector.test.ts`
- `im-security-check.test.ts`
- `im-dedup.test.ts`
- `im-agent-context-store.test.ts`

辅助文件不受影响：
- `test-helpers.ts`（不是测试文件，无需改名）

### 阶段 3: 配套修改（改名后强制执行）

```bash
# 1. 检查是否有硬编码文件名的引用
grep -rn "\.test\.ts" --include="*.json" --include="*.ts" --include="*.js" \
  server/package.json server/jest.config.* server/vitest.config.* \
  frontend/package.json box/package.json

# 2. Jest/Vitest 默认 glob 已覆盖所有后缀
#    - jest: "**/*.test.ts" 默认已匹配 *.integration.test.ts
#    - vitest: "**/*.test.ts" 默认已匹配 *.integration.test.ts
#    无需修改配置文件

# 3. 全量运行测试确保零失败
cd server && npx jest --config jest.config.ts
cd server/vendor/@synova/engine-core && npx vitest run

# 4. 如果有 CI 脚本引用具体文件名，同步更新
grep -rn "\.test\.ts" .github/
```

---

## 四、E2E 测试（当前状态）

当前仓库中**没有任何 `*.e2e.test.ts` 文件**。

现有最接近 E2E 的测试是 `l0.integration.test.ts` 中的 "user journey: full L0 lifecycle" 用例——它串联了 `extract → confirm → incubation status → deliver` 完整流程。但所有外部依赖（LLM、pipeline、task-store）都被 mock，因此仍然是**集成测试**而非 E2E。

`server/scripts/e2e-smoke.sh` 提供了 shell 级别的 E2E smoke 检测（curl 验证端点可达），但并非 Jest/Vitest 测试文件。

未来如引入真正的 E2E 测试（hits 真实 Express 服务 + 真实 LLM Gateway），应使用 `*.e2e.test.ts` 后缀。

---

## 五、执行优先级与风险

| 优先级 | 阶段 | 文件数 | 风险 | 理由 |
|--------|------|--------|------|------|
| P0 | 阶段 1 | 1 改 | 极低 | engine-core 测试独立运行，无交叉引用 |
| P1 | 阶段 2 | 30 改 | 中 | routes 测试可能有 CI 脚本硬编码引用，需 grep 确认 |
| P2 | 阶段 3 | 配套检查 | 低 | Jest/Vitest 默认 glob 已自动覆盖所有后缀 |

---

## 六、鉄律 33 原文

**测试文件必须按类型使用不同后缀：**

```
*.test.ts               — 单元测试（纯函数，无 I/O）
*.integration.test.ts   — 集成测试（API + DB，hit 真实 SQLite 或文件系统）
*.e2e.test.ts           — E2E 测试（完整用户旅程，hit 真实运行中的服务）
```

**判定优先级：**
1. 是否启动 HTTP server 并 hit 它？→ `*.integration.test.ts`
2. 是否使用真实 SQLite（含 `:memory:`）？→ `*.integration.test.ts`
3. 是否使用真实文件系统读写？→ `*.integration.test.ts`
4. 以上全部 NO → `*.test.ts`

**强制检查项**（新增测试文件时）：
```
[ ] 文件名后缀与测试类型匹配（.test.ts / .integration.test.ts / .e2e.test.ts）
[ ] 测试内部不包含分类矛盾（如 .test.ts 内启动 http.createServer）
[ ] jest.config / vitest.config 的 testMatch 覆盖所有三种后缀
[ ] 集成测试不包含 jest.mock() 管线逻辑（用手写 test double 替代）
```
