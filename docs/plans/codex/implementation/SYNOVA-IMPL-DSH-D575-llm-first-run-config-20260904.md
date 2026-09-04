---
north-star:
  服务用户: FDE（部署 Synova 的执行者）。痛点：装好桌面端打开后，LLM key 只能手工改 .env 再重启进程（src/config.ts:72 只读 env）——产品第一步即卡壳，演示现场无法快速配好。
  服务场景: 首次安装打开桌面端 → 首屏出现 LLM 配置卡片 → 粘贴 key → 「测试连接」绿勾 → 「保存并进入」主界面 → 立即可发起诊断。key 换了在 UI 改一下即热生效，不重启进程。
  模块终态: 「打开产品第一步即配置 LLM」——首启向导（provider/model/key/测试连接）+ 本地凭证存储（0600 文件，key 永不明文进 synova.json/日志/响应）+ 配置 API（GET/POST /api/llm/config + POST /api/llm/test 稳定错误码）+ 热重载（按请求解析，进程不重启）。
  对齐北星: PRODUCT-BRIEF §二（FDE 是直接用户，1 人服务 10-20 客户，部署效率=生命线）+ §五「可演示」状态列（首启体验=演示刚需，创始人 2026-09-04 指示「打开产品的第一步就直接配置」）。
  完成标准: （入口）冷启动桌面端首屏配置卡片 →（处理）粘贴 key→测试连接→保存（POST config→0600 凭证文件→onChanged 日志）→（结果）主界面可诊断、换 key 热生效（PID 不变）、删凭证文件重启向导再现、错 key 显示「密钥无效」人话。可验证：DS1-DS11（§11）。
  当前进度: 派单已入库（d5e5310f，PR #347）；本 spec 2026-09-04 交付（dev doc）；编码未开始（分支 feat/d575-llm-first-run-config 待编码 session 认领）。差：实现+测试+E2E evidence。
---

# SYNOVA-IMPL-DSH-D575: LLM 配置首启向导（借鉴 DSH credential seam）

> 归属: DeepSeek Harness（DSH）· dev doc | 2026-09-04 | slice: `llm-first-run-config`
> 基线: **main @ d5e5310f**（全部 file:line 锚定此 commit；编码前按 §3.3 抽验——M7 教训）
> 执行方: 🛠 编码 session（synova-dsh 预设，分支 feat/d575-llm-first-run-config）→ K3 → CTO 合并
> 上游: 派单 D575（d5e5310f 入库）+ DOC-0117《DSH 借鉴指引 v2》§3 B-01/B-02 + §6 五条硬守卫
> ⚠️ DSH 锚点抽验记录（指引 §1 重验程序，2026-09-04 本机 dsh@0.1.2-alpha.2 实装产物抽 2 处）: ① dsh-credentials/lib/index.js L21 `credentialRef(value)` / L56 `credentialKey(scope,id)` / L96-98 分层解析+空值语义注释 / L108 `class CredentialProvider extends Service` / L121-126 `notifyUpdated→fanOut("credentials/reference-updated")` **全部命中**；② dsh-llm/lib/types/api-key.js L14 `LEGAL_API_KEY=/^[\x21-\x7E]+$/` + dsh-llm-deepseek/lib/index.js **L1512** `httpErrorCode`（401/403→AUTH、413→INVALID_REQUEST、quota 检测）**命中**；附微校：`assertUsableApiKey` 精确行 L119（派单区间 L65-132 内，不冲突）。锚点可信。

---

## 1. Authority Doc Verification

**权威 ① — 派单 D575**（`docs/synova/coordination/派单-D575-llm-first-run-config-20260904.md`，d5e5310f）:

> §三 交付内容（store/routes/config 改造/WelcomeScreen 向导/黄条）+ §四 禁碰清单 + §五 验收 6 条物理可复现 + §六 交付要求（evidence 落盘 evidence/D575/、task-state impl 回填）。

**权威 ② — DOC-0117《DSH 借鉴指引 v2》**（`docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md`）:

> §6 硬守卫 G1「借鉴 = 读 DSH 源码、自己写实现。验证命令：grep -rn "@deepseek-ai" src/ packages/ … 零结果」；G2「每卡单独 PR；grep 调用方 + 集成测试走真实路由」；G3「每卡必须挂产品线缺口」；G4「grep 物理证明 + 可回退」；G5「Stage 3 前零运行时依赖」。§3 B-01 稳定错误码 taxonomy（「route on this, never by parsing message」）+ B-02 provider 拥有重试策略（本卡只预留词汇）。

**权威 ③ — AGENTS.md 铁律**: 47（契约优先——本卡三个新模块的 JSDoc 输入/输出/降级契约先于实现，见 §7）/ 48（测试三路径：正常+降级+边界）/ 0-2（接线验收，grep 生产调用点）/ 24+31（catch 必 log + degraded 传播；未配置黄条不静默）/ 32（错误分类 .code+.phase+.retryable——A3 错误码对齐此律）/ 38（as any=0）/ 39（五层边界）。

**权威 ④ — PRODUCT-BRIEF §二/§五**: FDE 直接用户 + 可演示。本卡 = 首启体验（演示刚需），不做诊断逻辑改动。

---

## 2. Problem Statement

Synova 的 LLM key 只能从 `process.env` 读（src/config.ts L72-82 的 14 级 env 链），synova.json 的 llm 段只有 provider/model/baseUrl 三个非敏感字段且**从未被 config.ts 消费**（L45-46 只取 server.port 与 sentinel——死配置）；凭证路由 src/routes/credentials.ts 是内存 Map（重启即丢）且只管 IMA/Confluence 知识源。桌面端用户（FDE）没有 UI 配置 LLM 的入口：首屏 WelcomeScreen 有 firstLaunch 三态框架却无配置步骤。结果 = 产品第一步即卡壳（改 .env + 重启进程），演示刚需被卡在部署环节。本卡借鉴 DSH credential seam 四机制（凭证引用分层解析 / key 校验不回显 / 稳定错误码 / onChanged 热生效），垂直切片打通「首启 → 配置 → 测试 → 保存 → 诊断可用」。

---

## 3. Q0-Q4

### 3.1 Q0 项目拼图 + 文件审计（main @ d5e5310f 全部实读）

| 文件 | 实测要点 | 与本任务关系 |
|---|---|---|
| src/config.ts | L72-82 llmApiKey 14 级 env 链（LLM_API_KEY 最高→各 provider 专属→''）；L45-46 loadFileConfig 只消费 server.port+sentinel（llm 段死配置）；L83 baseUrl 默认 `https://api.deepseek.com/v1`；L84 model 默认 `deepseek-v4-flash`；L98-101 未配置仅 warn；L103 llmConfigured | **修改对象**（key 解析接 resolve + model/baseUrl 激活链） |
| src/routes/credentials.ts | 61 行：内存 Map（L17）；POST/GET /api/credentials/:provider；脱敏 `'****'+slice(-4)`（L44）；L55 getStoredCredentials 内部导出先例；无认证中间件 | **范式参照**（只读，不碰） |
| src/server.ts | L24 import CredentialVault；L49 import credentialRoutes；L339 `app.use(credentialRoutes)` 挂载段 L330-345；L371-374 vault 用法 `req.app.locals.credentialVault` | **修改对象**（L340 附近挂载 llmConfigRoutes + onChanged 订阅） |
| src/deploy/bootstrap.ts | L891 masterSecret = `CREDENTIAL_MASTER_KEY \|\| config.engineTokens \|\| (devMode?'synova-dev-secret':'')` ——可预测；Phase 4a 初始化失败降级 | vault 复用否决证据（§6 决策 1） |
| src/security/credential-vault.ts | AES-256-GCM + better-sqlite3 表 connector_credentials；构造需 (db, masterSecret, salt) | 评估后**不复用不碰**（§6 决策 1） |
| src/providers/index.ts | L25 ProviderType 10 值枚举（deepseek/qwen/glm/kimi/yi/minimax/step/ernie/openai/gateway）；L54 createProvider(type,config) 每请求构造（diagnosis-upload-v2.ts L528 在请求处理器内调用）；listProviderTypes() 带中文 label | **只读消费**（POST provider 校验对齐 10 值枚举；零改动） |
| src/routes/diagnosis-upload-v2.ts | L245/L526 **每请求 `loadConfig()`**；L528 createProvider 在请求处理器内 | 热重载机制依据（§6 决策 3） |
| src/routes/chat.ts | L21-25 GET /api/status 每请求 loadConfig() 返回 llmConfigured/hasApiKey | 空值=200 非 error 的既有范式佐证 |
| src/config-file.ts | L20-42 SynovaFileConfig.llm={provider,model,baseUrl}；L132 saveFileConfig **全量写回**；L44 路径 process.cwd()/synova.json | 决策 2 证据（运行时写 git 追踪文件的风险） |
| synova.json | llm 段现值 `{provider:"deepseek", model:"deepseek-chat", baseUrl:"https://api.deepseek.com/v1"}`；git 追踪（未 ignore）；data/ 在 .gitignore L3（data/llm-credentials.json 天然不进 git） | **显式不变声明**（§3.3.1 下） |
| electron-renderer/src/components/WelcomeScreen.tsx | 105 行；三态 welcomeState（L46 useConversationStore，L36 默认 'firstLaunch'）；CenterPanel.tsx L37 挂载 | **修改对象**（firstLaunch 分支渲染向导） |
| electron-renderer/src/stores/app-store.ts | zustand；L100-102 bootUserRole 先例（D556）；L117-132 actions | **修改对象**（+llmUnconfigured 状态） |
| electron-renderer/src/components/StatusBar.tsx | 51 行 footer 状态栏（L28 useAppStore） | **修改对象**（黄条渲染） |
| electron-renderer/src/App.tsx | L18 getApiBase（lib/api.ts D504）；L50 boot health fetch 先例；L95 StatusBar 挂载 | **修改对象**（boot fetch /api/llm/config） |
| electron-renderer/src/test-support/render.ts | 已存在（D556 交付）：renderToStaticMarkup 桥接 | **只读复用**（UI 测试零新依赖） |
| tests/sessions-api.test.ts | 集成测试先例：createServer() + PORT=0 + SYNOVA_DB_PATH=:memory: + 真实 fetch 断言 | 集成测试模板（L2a 走真实路由，铁律 12） |
| vitest.config.ts | L28 include `./tests/**/*.test.ts` + `./tests/**/*.integration.test.ts` | 测试落位依据 |
| scripts/check-architecture.sh | L34-64 只检 L1→L3/L1→L4；src/services/ 不在黑名单；routes→services 先例 5+ 处（actions-api.ts L7 等） | llm-credential-store.ts 落位 src/services/ 合法 |

### 3.2 Q1 调研（教训 + 业界参照）

- **memory/ 四态 Note 无凭证类教训**（implemented/ 全扫实读）；相关铁律教训：铁律 24（区分 ENOENT 正常默认 vs JSON.parse 失败告警——凭证文件损坏路径必守）、铁律 11（未配置黄条不静默）。
- **D556 同型先例**（本仓 2026-08-29）：前端纯逻辑层 stores/*.ts（零 react/zustand import，node 可测）+ renderToStaticMarkup props 驱动展示组件 + spec-only 提交写集漂移预登记——本卡全套沿用。
- **DSH 业界参照**（0.1.2-alpha.2 抽验，见文档头）：凭证层单向下发（壳 UI → 存储 → 按需解析）、空值=未配置非错误、key 校验不回显、稳定错误码路由。桌面应用凭证存本地 0600 文件是 DSH 同款形态（其 CredentialProvider 即本地存储分层）。
- **决策参考系**: 参考：Anthropic（fail-closed + 机器可验契约 + 最少机制）/ DSH 实装范式 / 第一性原理 + 结论（逐决策点见 §6，无分歧）。

### 3.3 Q2 范围

**做什么**: ① `src/services/llm-credential-store.ts`（凭证存储：0600 原子写 + 分层解析 + onChanged）；② `src/routes/llm-config.ts`（GET/POST config + POST test 稳定错误码）；③ `src/config.ts` 最小侵入（key 解析接 resolve 优先 + model/baseUrl 激活 synova.json llm 段只读回退）；④ `src/server.ts` 挂载 + onChanged 订阅；⑤ 前端首启向导（WelcomeScreen firstLaunch 分支 → LlmSetupCard + stores/llm-config.ts 纯逻辑层 + App.tsx boot 判定 + StatusBar 黄条）；⑥ 三层测试（L1 单元 / L2a 集成真实路由 / 前端逻辑+UI 渲染）。

### 3.3.1 写集 (6 修改 + 7 新建)

| 文件 | 操作 | 说明 |
|---|---|---|
| src/config.ts | 修改 | L72-82 区间最小侵入：llmApiKey = `resolveLlmApiKey().value \|\|`（原 14 级 env 链原样保留）；L83-84 区间：llmModel/llmBaseUrl = `getStoredLlmRuntime()` 优先 → 原 env 链 → `fileCfg.llm.model/baseUrl`（synova.json llm 段只读激活，消死配置）→ 原默认值不变；fileCfg 变量提升 try 外（约 2 行）；import 自 src/services/llm-credential-store（同 config-recovery 先例） |
| src/server.ts | 修改 | L340 附近（credentialRoutes 挂载相邻）`app.use(llmConfigRoutes)` + `onLlmCredentialChanged` 订阅一条 `config/llm-changed` 事件日志（进程不重启声明） |
| electron-renderer/src/components/WelcomeScreen.tsx | 修改 | welcomeState==='firstLaunch' 分支提前 return `<LlmSetupCard onConfigured={…} onSkip={…}/>`（配置向导第一步）；hasConfigNoData/ready 两态渲染路径零改动；WELCOME_COPY 保留（另两态在用，无死代码） |
| electron-renderer/src/components/StatusBar.tsx | 修改 | footer 追加黄条段：`llmUnconfigured===true` 时渲染「⚠ LLM 未配置，诊断不可用——请在设置中配置」（铁律 31 不静默） |
| electron-renderer/src/App.tsx | 修改 | boot effect（L50 health fetch 相邻）追加 GET /api/llm/config：configured → conversation-store setWelcomeState('ready')（已配置用户跳过向导）；未配置 → app-store setLlmUnconfigured(true) |
| electron-renderer/src/stores/app-store.ts | 修改 | +`llmUnconfigured: boolean`（默认 false）+`setLlmUnconfigured` action（bootUserRole D556 同型最小扩展） |
| src/services/llm-credential-store.ts | 新建 | 凭证存储（§4 契约）：setLlmCredential / resolveLlmApiKey / getStoredLlmRuntime / onLlmCredentialChanged 四 export；路径 `join(SYNOVA_DATA_DIR\|\|'data','llm-credentials.json')` 每次读 env（测试可注入）；tmp+rename 原子写 + POSIX chmod 0600；损坏文件 log.warn+degraded 返回 null（区分 ENOENT，铁律 24） |
| src/routes/llm-config.ts | 新建 | 三端点（§4 契约）：GET /api/llm/config（未配置=200+configured:false 空值语义）/ POST /api/llm/config（A2 校验不回显 + 存 + onChanged + maskedKey）/ POST /api/llm/test（提交值先行测试，A3 稳定错误码，AbortController 10s） |
| electron-renderer/src/stores/llm-config.ts | 新建 | 前端纯逻辑层（零 react/zustand，D556 ga-collab 同型）：PROVIDER_OPTIONS 常量（deepseek 默认 / openai 兼容自定义 baseUrl，派单 §三.5 范围）/ mapLlmTestError 七码→人话 / buildConfigPayload 客户端预校验 / maskedKeyOf / fetchLlmConfigStatus / testLlmConnection / submitLlmConfig（getApiBase 包装） |
| electron-renderer/src/components/LlmSetupCard.tsx | 新建 | props 驱动展示组件（renderToStaticMarkup 可测）：provider 下拉 + model 输入 + key 粘贴框 + baseUrl（选 openai 时显示）+「测试连接」+「保存并进入」+「暂不配置」；五态 idle/testing/test-ok（绿勾 maskedKey+latency）/test-fail（code→人话，零堆栈）/saving |
| tests/llm-credential-store.test.ts | 新建 | L1 单元：正常存取+0600 断言（skipIf win32）/ 空值=未配置 / env 回退 / 损坏文件降级不崩 / onChanged 触发 / tmp 注入隔离 |
| tests/llm-config-api.integration.test.ts | 新建 | L2a 真实路由（createServer 先例，铁律 12 不 mock 管线）+ L2b 降级（stub 上游 401/429/500/连接拒绝→错误码分类）+ L2c 边界（空/非法字符 400 不回显、未知字段拒绝、retryPolicy 预留不炸、热重载同进程断言 loadConfig 变化） |
| tests/llm-config-frontend.test.ts | 新建 | 前端逻辑（mapLlmTestError 七码全断言 / buildConfigPayload / maskedKeyOf 短 key 全掩）+ UI 渲染（renderToStaticMarkup 复用 test-support/render.ts：LlmSetupCard 五态 + WelcomeScreen 三态——zustand vanilla store node 可渲染） |

> **synova.json 显式不变声明（禁碰清单物理化）**: synova.json **零改动**（写集表 13 条目中无它，编码全程不得写入）——key 永不进 synova.json（派单 §四红线）；provider/model/baseUrl 存凭证文件（§6 决策 2），synova.json llm 段保持只读现状（死配置激活仅指 config.ts **读取**它作回退，不写回）。E2E 后断言：`grep -c "apiKey\|api_key" synova.json` = 0（DS9）。
>
> **提交策略预登记（spec-only 提交预期漂移）**: 本 spec 单独提交时，6 个修改文件零 diff + 7 个新建文件不存在 → check-dev-doc-write-set 恰好 **13 条预期漂移**（非事故）。消解 = spec 文件随编码首个 commit 同批提交（届时全命中零漂移）；若 CTO 先单独提交本 spec，13 条漂移为预登记预期。编码执行写集与 D556 交付面（electron-renderer/src/test-support/、stores/ga-collab.ts）零重叠（§10）。

**不做什么（含文件路径，铁律 Q2 排除项）**:
- ❌ 不碰 scripts/audit/、scripts/pre-commit-check.sh（审计红线 + 派单 §四）
- ❌ 不碰 electron/main.cjs、electron/backend-spawn.cjs（启动链 2026-09-04 刚验证，派单 §四）
- ❌ 不碰 src/routes/credentials.ts（只读范式参照——内存 Map 缺陷另行处置，不在本卡扩散）
- ❌ 不碰 src/providers/ 全部（createProvider/listProviderTypes 只读消费）、src/security/credential-vault.ts（评估后不复用）、src/deploy/bootstrap.ts
- ❌ 不碰 synova.json（显式不变声明，见上）
- ❌ 不做重试逻辑（B-02 另卡；仅 body 白名单预留 retryPolicy 词汇不消费）、不做多 provider 适配器重构（B-01 另卡）、不做 10 provider 全量 UI（前端只露 deepseek + openai 兼容自定义，后端 10 值枚举校验全支持）
- ❌ 不碰 electron-renderer/package.json / 根 package.json / vitest.config.ts（零新依赖红线——renderToStaticMarkup 桥接复用 D556 交付物）

### 3.4 Q3 验收（入口 → 处理 → 结果）

- **入口**: 冷启动桌面端（渲染层 dist 已产出）→ 首屏 LLM 配置卡片。
- **处理**: provider 默认 deepseek → model 预填 synova.json 现值 deepseek-chat → 粘贴 key → 测试连接（POST /api/llm/test）→ 绿勾 maskedKey+latency → 保存并进入（POST /api/llm/config → 0600 凭证文件 → onChanged 日志 → 热生效）。
- **结果**: 主界面黄条消失；发起诊断成功用新 key；kill-免重启换 key 热生效；删凭证文件重启向导再现；错 key 显示「密钥无效」。物理验收 6 条逐项 verify 命令见 §11 DS1-DS11。

### 3.5 Q4 契约与测试（铁律 47/48）

契约先行：三个新模块 JSDoc 三要素（@input/@output/@degraded）见 §4，编码时原文照抄进实现文件头。测试三层：L1 单元（store）/ L2a 集成真实路由 + L2b 降级 + L2c 边界（API）/ 逻辑+渲染（前端）——全 expect 非空壳。

---

## 4. Current State + 新模块契约（铁律 47，先于实现）

### 4.1 Current State（2026-09-04 实测，main @ d5e5310f）

| # | 事实 | 证据 |
|---|---|---|
| 1 | llmApiKey 只读 env（14 级链），UI 无法注入已运行进程 | config.ts L72-82 |
| 2 | synova.json llm 段从未被 config.ts 消费（死配置） | config.ts L45-46 只取 filePort/fileSentinel |
| 3 | 凭证路由存在但内存 Map 不持久、只管知识源 | credentials.ts L17（`new Map`）+ L20-52 |
| 4 | 每请求 loadConfig() + 每请求 createProvider → 按请求解析即天然热生效 | diagnosis-upload-v2.ts L245/L526；chat.ts L21 |
| 5 | CredentialVault 存在但 masterSecret 可预测 + 依赖 bootstrap Phase 4a | bootstrap.ts L891 + credential-vault.ts L16-20 |
| 6 | WelcomeScreen 三态框架在，firstLaunch 无配置步骤 | WelcomeScreen.tsx L36/L46；CenterPanel.tsx L37 |
| 7 | 前端 API 基座与测试桥接齐备 | lib/api.ts getApiBase（D504）；test-support/render.ts（D556） |
| 8 | data/ 已 gitignore → 凭证文件天然不进 git | .gitignore L3（check-ignore 实测 data/llm-credentials.json 命中） |
| 9 | G1 基线干净 | `grep -rn "@deepseek-ai" src/ packages/ --include="*.ts"` 零结果（2026-09-04 实测） |

### 4.2 契约 A — llm-credential-store（L5 邻接文件 I/O，config-file.ts 同型自标）

```typescript
/**
 * llm-credential-store — LLM 凭证本地存储（借鉴 DSH credential seam A1，零依赖自研）
 * 契约:
 *   @input  — setLlmCredential({provider, apiKey, model?, baseUrl?})；apiKey 非
 *             空且须匹配 /^[\x21-\x7E]+$/（A2 词汇，防御性校验）
 *   @output — resolveLlmApiKey(): { value: string|null, source: 'stored'|'env'|null }
 *             分层解析 凭证文件 → process.env.LLM_API_KEY → null（空值=未配置，非错误）
 *             getStoredLlmRuntime(): { provider, model, baseUrl } | null（非敏感明文面）
 *   @degraded — 凭证文件存在但 JSON.parse 失败 → log.warn + degraded 标记 + 返回 null
 *             （区分 ENOENT=正常未配置不告警，铁律 24）；文件 I/O 异常同理降级不崩
 *   @error  — LLM_CREDENTIAL_ERROR: .code+.phase='credential'+.retryable（铁律 32）
 *   @side   — 写侧 tmp+rename 原子写 + POSIX chmod 0600（skipIf win32，NTFS 走用户目录 ACL）；
 *             日志零 key 片段；路径每次读 SYNOVA_DATA_DIR（测试注入缝）
 */
```

### 4.3 契约 B — routes/llm-config（L1）

```typescript
/**
 * routes/llm-config — LLM 配置 API（借鉴 A2 校验不回显 / A3 稳定错误码 / A5 词汇预留）
 * 契约:
 *   @input  — POST /api/llm/config {provider(10值枚举), model, baseUrl?, apiKey}
 *             body 白名单校验：白名单外未知字段 → 400；retryPolicy 字段收下不消费（B-02 预留）
 *   @output — GET  /api/llm/config → 200 {ok, configured, provider, model, baseUrl,
 *             maskedKey: '****'+尾4|null(长度<8 全掩), source: 'stored'|'env'|null}
 *             未配置 = 200 + configured:false（空值语义，不报错——A1）
 *             POST /api/llm/config → 200 {ok, maskedKey} | 400 {ok:false, code, error}
 *             POST /api/llm/test（用提交值，未保存可先测）→ 200 {ok:true, latencyMs, maskedKey}
 *             | 200 {ok:false, code, message}；code ∈ INVALID_CREDENTIAL(401/403) /
 *             RATE_LIMIT(429) / SERVER(≥500) / NETWORK(连接失败) / TIMEOUT(Abort 10s) /
 *             INVALID_REQUEST(其他 4xx)——route on code, never by parsing message（B-01）
 *   @degraded — 上游不可达/超时 → 200+ok:false+code（测试结果是数据非服务端错误）；
 *             凭证存储降级 → log.warn 继续走 env 链判定
 *   @error  — 400 响应体零 key 原文（A2：错误只提示重贴，绝不回显）；message 零上游
 *             body 透传（只透 code + status 数字——兼 SSRF 面收敛：baseUrl 用户可控，
 *             本地单用户场景自险，响应不放大）
 */
```

### 4.4 契约 C — 前端 stores/llm-config（纯逻辑，零 react/zustand）

```typescript
/**
 * stores/llm-config — 首启向导纯逻辑数据层（D556 ga-collab 同型：node 可测）
 * 契约:
 *   @input  — 表单值 {provider, model, baseUrl?, apiKey}
 *   @output — mapLlmTestError(code): 人话文案（七码全覆盖 + default 兜底）；
 *             buildConfigPayload(form): {payload} | {error}（客户端预校验空/非法字符，
 *             镜像服务端 A2 规则）；maskedKeyOf(key): 长度<8 → '********' 否则 '****'+尾4；
 *             fetchLlmConfigStatus / testLlmConnection / submitLlmConfig（getApiBase 包装，
 *             非 2xx/网络失败 → null 由调用方显式降级，铁律 31）
 *   @degraded — fetch 异常 console.warn + 返回 null（不静默）；UI 侧 degraded 由
 *             LlmSetupCard save-error 态渲染
 *   @error  — 不抛（返回形态表达失败）
 */
```

---

## 5. What We Build — 关键实现面（编码照此，不锁死内部写法）

### 5.1 config.ts 接线（热重载机制核心）

解析链（对齐 A1 分层语义）：`凭证文件(stored) → LLM_API_KEY → 14 级 provider env（原样保留）→ ''`；model/baseUrl 链：`getStoredLlmRuntime() → 原 env → synova.json llm 段（只读激活）→ 原默认`。因 routes 每请求 loadConfig()（4.1 #4 实测），保存后下一次请求即用新值——**热重载 = 按请求解析，零客户端重建**（§6 决策 3）。未配置 warn（L98-101）与 llmConfigured（L103）语义不变。

### 5.2 POST /api/llm/config 保存序列

A2 校验（trim + `LEGAL_API_KEY` 同款 `/^[\x21-\x7E]+$/` + provider 枚举）→ `setLlmCredential`（0600 原子写）→ `onLlmCredentialChanged` fanOut（server.ts 订阅点打 `config/llm-changed` 日志）→ 200 `{ok, maskedKey}`。响应与日志零 key 原文。

### 5.3 首启向导状态机

App.tsx boot：GET /api/llm/config → configured（source=stored/env）→ setWelcomeState('ready') 直接进主界面（跳过向导）；未配置 → firstLaunch 保留 → WelcomeScreen 渲染 LlmSetupCard。「暂不配置」→ setWelcomeState('ready') + setLlmUnconfigured(true) → StatusBar 黄条常驻（进设置可再配，本卡黄条即提示面，设置页复配不另做入口——CenterPanel ready 态用户可从主界面再次触发向导的入口**不做**，留待后续卡，诚实 descope）。

### 5.4 测试 red→green 对照（铁律 0-2 Step 2，先写测试）

| 用例 | 实现前（red） | 实现后（green） |
|---|---|---|
| store 存取 + 0600 | 模块不存在，import 失败 | set→文件 0600→resolve {value, source:'stored'} |
| store 空值语义 | 同上 | 无文件 → {value:null, source:null} 不抛 |
| store env 回退 | 同上 | LLM_API_KEY 注入 → {value, source:'env'} |
| store 损坏文件 | 同上 | 'not-json{{' → log.warn + {value:null, source:null}（铁律 24） |
| GET 未配置=200 空值 | 404 | 200 {configured:false, source:null} |
| POST 合法保存 | 404 | 200 {ok, maskedKey}；响应体 stringify 不含 key 原文 |
| POST 空/非法 key | 404 | 400 INVALID_API_KEY，响应零 key 原文（A2） |
| POST 未知字段/provider 非法 | 404 | 400；retryPolicy 收下不炸（A5 预留） |
| test 401→INVALID_CREDENTIAL | 404 | stub 上游 401 → {ok:false, code:'INVALID_CREDENTIAL'} |
| test 429/500/拒连 | 404 | RATE_LIMIT / SERVER / NETWORK |
| test 200 | 404 | {ok:true, latencyMs>0} |
| 热重载同进程 | 404 | POST 新 key → loadConfig().llmApiKey===新值（PID 不变的自动化代理） |
| mapLlmTestError 七码 | 函数不存在 | 七码+default 全断言 |
| LlmSetupCard 五态渲染 | 组件不存在 | renderToStaticMarkup 断言（人话在、堆栈无、maskedKey 在） |
| WelcomeScreen 三态 | firstLaunch 无向导 | firstLaunch 含向导特征 / ready 无 / hasConfigNoData 原文案 |

---

## 6. 决策参考（S-12，多选项决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 1 凭证存储选型 | A 复用 CredentialVault（AES+sqlite）/ B 独立 0600 文件+原子写 | bootstrap.ts L891 masterSecret=`CREDENTIAL_MASTER_KEY\|\|engineTokens\|\|'synova-dev-secret'` 可预测→加密=剧场；vault 依赖 db 实例+Phase 4a 降级链，config.ts 加载期不可用；DSH 同为本地文件范式（抽验①） | **B**——0600+gitignore(data/)+原子写；vault 零改动 |
| 2 provider/model/baseUrl 落哪 | A 写回 synova.json llm 段（saveFileConfig）/ B 凭证文件单文件真相 | saveFileConfig L132 全量写回会覆盖手改；synova.json 是 git 追踪文件→运行时/测试写它=污染生产配置（D312 同型「运行态与版本态分离」）；第一性原理最少机制=单真相 | **B**——synova.json 零写入（只读激活）；派单 A1「apiKeyRef 引用」词汇降级为凭证文件本体，诚实登记语义缩水 |
| 3 热重载机制 | A onChanged 重建 LLM 客户端单例 / B 按请求解析 | diagnosis-upload-v2.ts L245/L526 实测每请求 loadConfig+createProvider——**无长命客户端可重建**；A 是为不存在的单例造机制 | **B**——onChanged 保留为 A4 词汇保真（config/llm-changed 日志事件，server.ts 订阅） |
| 4 UI 默认 model | A 'deepseek-chat'（synova.json llm.model 现值）/ B 'deepseek-v4-flash'（config.ts L84 env 缺省） | 派单 §三.5 写 deepseek-chat；synova.json 现值实测 deepseek-chat；未配置时 GET 预填读 loadFileConfig().llm.model 与决策 2 回退链一致 | **A**——UI 预填=synova.json 现值；配置后真相收敛凭证文件 |
| 5 路由认证 | A 挂现有 auth 中间件 / B 无认证（对齐 credentials.ts） | 首启场景必须在无用户系统时可用；credentials.ts L20-52 既有无认证范式；认证闭环归 D483-D486 在途任务 | **B**——localhost 本机场景；D483-D486 落地后统一收编（诚实登记） |
| 6 C2 门禁盲区 | A 放任 / B 自行模拟核验 | 本机 BSD grep 2.6 无 -P（实测 `grep -oP` exit 2）→ gatekeeper C2 恒「跳过」 | **B**——dev doc 侧以 grep -oE 模拟核验路径（§7 自检），控制塔修复另行走 ctrl-tower-change 流程（本卡不碰 scripts/） |

> 收敛检查：六决策点双参考系均指向同答案，无分歧。**参考：Anthropic/DSH 实装范式/第一性原理 + 结论**（K3 可核）。

---

## 7. Test Requirements（L1 / L2a / L2b / L2c 全层级）

| 层 | 文件 | 覆盖 | 数量 |
|---|---|---|---|
| L1 单元（store 契约三路径） | tests/llm-credential-store.test.ts | 正常存取+0600 / 空值未配置 / env 回退 / 损坏降级 / onChanged / 注入隔离 | ≥7 用例 |
| L2a 接线（真实路由，铁律 12） | tests/llm-config-api.integration.test.ts | createServer 真实 HTTP：GET 空值语义 / POST 保存+maskedKey / 热重载同进程断言 / test 200 | ≥5 用例 |
| L2b 降级 | 同上 + store 测试 | stub 上游 401/429/500/拒连→四码分类 / 损坏凭证文件 degraded / GET 降级链 | ≥5 用例 |
| L2c 边界 | 同上 + 前端测试 | 空/非法字符 400 不回显 / 未知字段 / retryPolicy 预留 / 短 key 全掩 / Abort TIMEOUT / 七码人话映射 / 五态渲染 | ≥10 用例 |

Stub 上游 = node http.createServer 按 header 分支返回（真实 HTTP 全链路，不 mock fetch）。前端 UI = renderToStaticMarkup 复用 electron-renderer/src/test-support/render.ts（D556 交付，零新依赖）。

---

## 8. Wiring Verification（接线审计——S-3 测试调用不计）

| 断言 | 命令（编码完成后） | 期望 |
|---|---|---|
| resolveLlmApiKey 生产调用 | grep -rn "resolveLlmApiKey" src/ --include="*.ts" \| grep -v test | ≥2（config.ts + routes/llm-config.ts） |
| getStoredLlmRuntime 生产调用 | grep -rn "getStoredLlmRuntime" src/ --include="*.ts" | ≥1（config.ts） |
| setLlmCredential 生产调用 | grep -rn "setLlmCredential" src/ --include="*.ts" | ≥1（routes/llm-config.ts） |
| onLlmCredentialChanged 生产调用 | grep -rn "onLlmCredentialChanged" src/ --include="*.ts" | ≥1（server.ts 订阅） |
| 路由挂载 | grep -n "llmConfigRoutes" src/server.ts | import 1 + app.use 1 |
| 前端状态拉取 | grep -rn "fetchLlmConfigStatus" electron-renderer/src --include="*.ts*" | ≥1（App.tsx） |
| 前端提交/测试 | grep -rn "submitLlmConfig\|testLlmConnection" electron-renderer/src --include="*.ts*" | ≥2（LlmSetupCard 调用） |
| 黄条接线 | grep -rn "llmUnconfigured" electron-renderer/src --include="*.ts*" | store 定义 + App 写入 + StatusBar 消费 ≥3 |
| G1 零依赖 | grep -rn "@deepseek-ai" src/ packages/ --include="*.ts" | 零结果 |
| 存量零回改 | git diff main..HEAD -- src/routes/credentials.ts src/providers/ src/security/credential-vault.ts src/deploy/bootstrap.ts synova.json electron/main.cjs electron/backend-spawn.cjs scripts/ | 空 |
| key 零进 synova.json | grep -c "apiKey\|api_key" synova.json | 0（E2E 后） |
| key 零进日志 | grep -rn "apiKey" src/services/llm-credential-store.ts src/routes/llm-config.ts \| grep "log\." | 零命中（日志语句零 key 引用） |

---

## 9. Architecture Layer

**L1 交互**（routes/llm-config.ts + 前端 WelcomeScreen/LlmSetupCard/StatusBar/App + stores/llm-config.ts 纯逻辑）→ **L5 邻接文件 I/O**（src/services/llm-credential-store.ts——config-file.ts L9 同型自标「L5 存储层文件 I/O」先例；check-architecture.sh L34-64 黑名单不含 services/，routes→services 先例 5+ 处实测）→ config.ts（根装配层，消费 services/config-recovery 同型先例）+ server.ts（L1 装配）。诊断链消费面零改动（config.llmApiKey 形状不变，diagnosis-upload-v2/diagnosis/chat 路由零 diff 自动受益）。零 L1→L3/L4（铁律 39），Architecture Check 复核。

---

## 10. What We Don't Do（排除汇总）

见 §3.3.1「不做什么」逐项（含文件路径）。补充诚实 descope：设置页复配入口（黄条仅提示）、凭证轮换 UI、多凭证引用（<scope>/<id> 命名空间——单凭证场景 A1 词汇子集）、10 provider 全量 UI、诊断管线任何改动。

---

## 11. Completion Standard（DS1-DS11 一一对应，禁重编号/跳号/静默缺项——S-10；覆盖派单 §五全部 6 条物理验收）

1. **DS1**（派单验收 1·G1）`grep -rn "@deepseek-ai" src/ packages/ --include="*.ts" \| grep -v node_modules` 零结果。
2. **DS2** tests/llm-credential-store.test.ts 全绿（≥7 用例：正常+0600 / 空值 / env 回退 / 损坏降级 / onChanged / 隔离）。verify: `npx vitest run tests/llm-credential-store.test.ts`
3. **DS3** tests/llm-config-api.integration.test.ts 全绿（L2a+L2b+L2c：真实路由 + stub 上游错误码分类 + 400 不回显 + 热重载同进程断言）。verify: `npx vitest run tests/llm-config-api.integration.test.ts`
4. **DS4** config.ts 生产接线：§8 前四行 grep 断言全过 + tsc --noEmit 零新增。verify: `npx tsc --noEmit`
5. **DS5** tests/llm-config-frontend.test.ts 全绿（七码人话 / 预校验 / 五态+三态渲染）。verify: `npx vitest run tests/llm-config-frontend.test.ts`
6. **DS6**（派单验收 2·冷启动全链路）渲染层 dist 产物 + `npm run dev` 后端 → 首屏配置卡片 → 粘贴真实 key → 测试连接绿（maskedKey+latency）→ 保存并进入 → 主界面 → 发起一次诊断成功且后端日志显示请求走该 key。evidence/D575/e2e-first-run.md（截图+日志）。
7. **DS7**（派单验收 3·向导再现）删除 data/llm-credentials.json → 重启桌面端 → 首启向导再次出现（firstLaunch 判定含 LLM 未配置）。evidence 落盘。
8. **DS8**（派单验收 4·热重载，进程 PID 不变）后端保持运行记录 PID → UI 改 key 保存 → 下一次诊断用新 key；DS3 热重载集成断言为自动化代理。evidence 落盘（含 PID 前后一致）。诚实声明：派单原文「kill 后端进程后…不重启进程」按热重载本义固化为「进程保持运行（PID 不变）」，kill+重启场景由 DS7 覆盖。
9. **DS9**（派单验收 5·错误码人话 + 安全四断言）手动填错 key → 「密钥无效，请重新粘贴」非堆栈；`grep -c "apiKey\|api_key" synova.json`=0；日志零 key 片段（§8 末行）；凭证文件 `stat -f "%Lp" data/llm-credentials.json`=600。
10. **DS10** vitest 全量零失败（铁律 36）+ as any/as never/as unknown as = 0（铁律 38）+ §8 存量零回改 diff 为空。
11. **DS11** evidence/D575/ 落盘（测试输出 + 5 条 E2E 实测）+ task-state/D575.json impl 段回填（编码 session 职责）+ spec 文件随编码首个 commit 同批提交（消解 §3.3.1 预登记漂移）。

> 交付声明必须覆盖 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；禁重编号/跳号/静默缺项（S-10，D331 审计教训）。

---

## 12. Auth Doc References

- 派单 D575：`docs/synova/coordination/派单-D575-llm-first-run-config-20260904.md`（d5e5310f）
- DSH 借鉴指引 v2（DOC-0117）：`docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md` §3 B-01/B-02 + §6 G1-G5
- DSH 锚点（本机 dsh@0.1.2-alpha.2 抽验 2026-09-04）：dsh-credentials/lib/index.js L21/L56/L96-98/L108/L121-126；dsh-llm/lib/types/api-key.js L14；dsh-llm/lib/types/index.js L119；dsh-llm-deepseek/lib/index.js L1512
- AGENTS.md 铁律 0-2/24/31/32/33/36/38/39/47/48；PRODUCT-BRIEF §二/§五
- 同型先例：SYNOVA-IMPL-DSH-D556（写集文件级/漂移预登记/renderToStaticMarkup/纯逻辑层）；tests/sessions-api.test.ts（集成先例）；lib/api.ts（D504）
- 现状锚点（全部 d5e5310f 实测）：§3.1 表 + §4.1 表
