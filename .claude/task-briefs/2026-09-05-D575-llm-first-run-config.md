# Task Brief: D575 LLM 配置首启向导（借鉴 DSH credential seam）

> 生成: 2026-09-05 | 分支: feat/d575-llm-first-run-config（worktree .synova-wt-d575，基线 origin/main @ e9da5123） | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议。
桌面端（Electron 品牌表层）+ 独立 API 进程（HTTP + MCP 对外服务）。
五层架构 L1-L5；本卡触 L1（routes/前端）+ L5 邻接文件 I/O（凭证存储，config-file.ts 同型）。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- 纵向（改 L1-L5 代码/架构）☑ — L1 新路由 routes/llm-config.ts + 前端首启向导；L5 邻接文件 I/O llm-credential-store.ts；根装配层 config.ts / server.ts 接线。
- 系统: 基础设施（LLM 配置面）+ 桌面端首启体验。现有模块: src/config.ts（llmApiKey 只读 env）、src/routes/credentials.ts（内存 Map 只管知识源）、WelcomeScreen 三态框架（firstLaunch 无配置步骤）。本卡**扩展**: 凭证存储层 + LLM 配置 API + 向导 UI；不替换不重写既有诊断链。

### b) 文件审计
- grep "llmApiKey|LLM_API_KEY" src/ → 唯一生产读点 src/config.ts L72-82（14 级 env 链）；消费点 diagnosis-upload-v2.ts L245/L526-528（每请求 loadConfig + createProvider）、chat.ts L21-25（GET /api/status 每请求 loadConfig）。
- grep "credential" src/routes/ src/security/ → credentials.ts（内存 Map 范式参照，只读）、credential-vault.ts（AES+sqlite，masterSecret 可预测 → 不复用，spec §6 决策 1）。
- synova.json llm 段 = 死配置（config.ts L45-46 只消费 server.port + sentinel）→ 本卡只读激活作回退，**零写入**。
- expert/ sentinel/ extensions/ 无相关文件驱动模块（文件审计无冲突）。
- 结论: 无覆盖 → 新建 src/services/llm-credential-store.ts + src/routes/llm-config.ts + 前端 2 新文件；config.ts/server.ts 最小侵入修改。

### c) 决策
- 凭证存储选型: B 独立 0600 JSON 文件（tmp+rename 原子写）而非复用 CredentialVault——bootstrap.ts L891 masterSecret 可预测（加密=剧场）+ vault 依赖 db 实例加载期不可用；DSH 同为本地文件范式。spec §6 决策 1。
- provider/model/baseUrl 落凭证文件单真相，synova.json 零写入（saveFileConfig 全量写回会覆盖手改 + git 追踪文件运行时写=污染）。spec §6 决策 2。
- 热重载 = 按请求解析（routes 每请求 loadConfig 实测），onChanged 保留为日志事件词汇，不为不存在的客户端单例造重建机制。spec §6 决策 3。
- 参考系: 参考：Anthropic（fail-closed + 机器可验契约）/ DSH 实装范式（A1-A5 锚点已抽验）/ 第一性原理 + 结论（收敛，无分歧——spec §6 六决策点全收敛）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = spec §4.2-4.4 三模块 JSDoc 契约 + §11 DS1-DS11（唯一契约，声称即引用）。
② 测试先行: 3 个测试文件先写证 red（store 单元 / API 集成真实路由 / 前端逻辑+渲染）。
③ 实现: 契约 JSDoc 原文照抄文件头（铁律 47）；catch 必 log + degraded（铁律 24/31）；错误 .code+.phase+.retryable（铁律 32）；as any/as never/as unknown as = 0（铁律 38）。
④ 接线: server.ts 挂载 + config.ts 消费 + 前端 App.tsx boot 判定 + StatusBar 黄条（spec §8 十二条 grep）。
⑤ 验证: 自检 6 问 + spec §11 verify 命令逐条。

### b) 本任务执行约束
- rule: "key 永不明文进 synova.json/日志/响应（A2 不回显）"
  verify: "grep -c 'apiKey\\|api_key' synova.json 输出 0；grep -rn 'apiKey' src/services/llm-credential-store.ts src/routes/llm-config.ts | grep 'log\\.' 零命中"
- rule: "G1 零 DSH 依赖——只读范式自研"
  verify: "grep -rn '@deepseek-ai' src/ packages/ --include='*.ts' 零结果"
- rule: "新 export 生产接线（测试调用不计，S-3）"
  verify: "grep -rn 'resolveLlmApiKey' src/ --include='*.ts' | grep -v test ≥2 处"

### c) 决策参考系
参考：Anthropic/DSH 实装范式/第一性原理 + 结论（逐决策点见 spec §6 六决策点表，双参考系全收敛无分歧，K3 可核）。

### d) 相关 Note 引用
- 无治理变更（功能卡，不改门禁/铁律/规则文档）→ 无 commit-msg Note 义务；memory/notes/ 无凭证类历史教训（implemented/ 全扫，spec §3.2 实测）。

## Q2: 范围 — 正确的最简方案是什么？

做什么（spec §3.3.1 写集 6 修改 + 7 新建，13 条）：
- src/services/llm-credential-store.ts
- src/routes/llm-config.ts
- src/config.ts
- src/server.ts
- tests/services/llm-credential-store.test.ts
- tests/routes/llm-config.test.ts
- tests/llm-config-frontend.test.ts
- electron-renderer/src/stores/llm-config.ts
- electron-renderer/src/components/LlmSetupCard.tsx
- electron-renderer/src/components/WelcomeScreen.tsx
- electron-renderer/src/components/StatusBar.tsx
- electron-renderer/src/App.tsx
- electron-renderer/src/stores/app-store.ts
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D575-llm-first-run-config-20260904.md
- .claude/task-briefs/2026-09-05-D575-llm-first-run-config.md
- task-state/D575.json

不做什么：
- 不改 src/routes/credentials.ts (内存 Map 缺陷另行处置，不扩散)
- 不改 src/providers/index.ts (createProvider/listProviderTypes 只读消费)
- 不改 src/security/credential-vault.ts (评估后不复用)
- 不改 src/deploy/bootstrap.ts (masterSecret 问题归别卡)
- 不改 synova.json (key 永不进 synova.json；llm 段只读激活)
- 不改 electron/main.cjs (启动链刚验证)
- 不改 electron/backend-spawn.cjs (启动链刚验证)
- 不改 scripts/pre-commit-check.sh (门禁脚本红线)
- 不改 electron-renderer/package.json (零新依赖)
- 不改 package.json (零新依赖)
- 不改 vitest.config.ts (零新依赖)
- 不改 tests/sessions-api.test.ts (集成先例只读参照)
- 不改 electron-renderer/src/test-support/render.ts (D556 交付物只读复用)
- 不做重试逻辑（B-02 另卡，retryPolicy 仅白名单预留词汇）、不做多 provider 适配器重构（B-01 另卡）、不做 10 provider 全量 UI（前端只露 deepseek + openai 兼容）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：桌面端冷启动 → WelcomeScreen firstLaunch → LlmSetupCard 配置卡片（provider 默认 deepseek / model 预填 synova.json 现值 / key 粘贴框 / 测试连接 / 保存并进入 / 暂不配置）。
处理（中间经过哪些步骤）：测试连接 → POST /api/llm/test 真实最小 chat 请求 → 稳定错误码；保存并进入 → POST /api/llm/config → A2 校验（不回显）→ setLlmCredential 0600 原子写 → onChanged → server.ts config/llm-changed 日志；config.ts 每请求 resolveLlmApiKey/getStoredLlmRuntime 分层解析。
结果（最终展示在哪）：welcomeState→ready 主界面可诊断（key 已热生效）；「暂不配置」→ StatusBar 黄条「⚠ LLM 未配置，诊断不可用——请在设置中配置」常驻；删凭证文件重启 → 向导再现；错 key → 「密钥无效，请重新粘贴」人话非堆栈。物理验收 = spec §11 DS1-DS11 逐条。

## 架构层: L1 交互（routes/llm-config.ts + 前端）+ L5 邻接文件 I/O（llm-credential-store.ts，config-file.ts 同型自标）

#CRITERIA: A

## Done 标准
- [ ] 入口可触达: GET /api/llm/config 未配置返回 200 + configured:false（空值语义）。verify: npx vitest run tests/routes/llm-config.test.ts 全绿
- [ ] 链路走通: POST /api/llm/config 保存 → data 路径 llm-credentials.json 0600 → loadConfig().llmApiKey 同进程读到新值（热重载）。verify: npx vitest run tests/services/llm-credential-store.test.ts tests/routes/llm-config.test.ts 全绿
- [ ] 结果可见: 首启向导五态渲染 + WelcomeScreen 三态 + StatusBar 黄条。verify: npx vitest run tests/llm-config-frontend.test.ts 全绿
- [ ] 类型安全零容忍 + G1 零依赖。verify: grep -rn "as any\\|as never\\|as unknown as" src/ electron-renderer/src/ tests/ --include="*.ts" --include="*.tsx" 新增零命中 && grep -rn "@deepseek-ai" src/ packages/ --include="*.ts" 零结果
- [ ] 全量回归零失败（铁律 36）。verify: npx vitest run 零失败；npx tsc --noEmit 零新增
- [ ] evidence 落盘 evidence/D575/（测试输出 + E2E 实测 + DS1-DS11 状态）。verify: ls evidence/D575/ 非空
