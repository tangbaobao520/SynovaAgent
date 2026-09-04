# 派单 — D575 LLM 配置首启向导（借鉴 DSH credential seam，打开产品第一步即配置）

> 派单: CTO | 2026-09-04 | 认领: 编码 session（synova-dsh 预设，桌面端+后端垂直切片）
> 来源: 创始人 2026-09-04 指示——「产品的 LLM 配置和 DSH 类似，如果可以直接借鉴它的；打开产品的第一步就直接配置」
> 依据: DOC-0117《DSH 借鉴指引 v2》B-01（错误码）/ B-02（provider 拥有策略）/ 修订建议 #2 #19（配置与凭证表面：key 流转 = 壳 UI → 核心 vault 单向下发）
> DSH 借鉴核查（SOP 〇b 三步）: ✅ 完成——施工图四色归属 🔵借 DSH；边界=范式借鉴零依赖（G1）；锚点已逐一给出（下）

## 一、现状与差距（CTO 已实测，2026-09-04）

| 现状 | 证据 | 差距 |
|---|---|---|
| LLM key 只从 `process.env.LLM_API_KEY` 读 | src/config.ts:72 | UI 配置无法注入已运行进程；.env 读了但 synova.json 无 key 字段 |
| synova.json 有 `llm` 段（provider/model/baseUrl）无 key | synova.json | key 不该明文进配置（正确），但缺凭证存储层 |
| `routes/credentials.ts` 已有凭证路由 | 61 行，内存 Map（重启丢），只管 IMA/Confluence 知识源 | 不管 LLM；存储不持久 |
| WelcomeScreen 有 firstLaunch 态 | electron-renderer/src/components/WelcomeScreen.tsx | 首屏无 LLM 配置步骤 |
| 无 LLM 配置写入/测试 API | grep src/routes 无 | 全缺 |
| 桌面端启动链已修复可用 | electron-renderer 依赖已装、tsc 115→0、dist 产物已出、后端自启链验证通过（2026-09-04 CTO 实测） | 在此基础上加首启配置 |

## 二、DSH 借鉴锚点（全部实测于 dsh@0.1.2-alpha.2 实装产物）

| # | DSH 机制 | 锚点（文件 + 行号/符号） | 借鉴什么 |
|---|---|---|---|
| A1 | **凭证引用制**：配置存 `<scope>/<id>` 引用名，key 明文只在凭证层；空值=未配置（非错误）；分层解析 env → store → .env | `dsh-credentials/lib/index.js` L21 `credentialRef(value)`、L56 `credentialKey(scope,id)`、L108 `class CredentialProvider extends Service`、L96-98 分层解析与空值语义 | Synova 的 `LlmCredentialStore`：key 存本地凭证文件（0600 权限），synova.json 只存 `apiKeyRef` 引用；解析顺序 存储文件 → `LLM_API_KEY` env 回退 |
| A2 | **key 校验不回显**：trim + 传输不变量校验 + 错误只提示 ref 位置，绝不回显 key 内容 | `dsh-llm/lib/types/index.js` L65-132 `assertUsableApiKey(raw, pkg, ref)`；`lib/types/api-key.js` `normalizeApiKey` + `LEGAL_API_KEY=/^[\x21-\x7E]+$/` | 配置 API 的 key 校验：拒绝空/非法字符；错误消息只说「key 无效请重新粘贴」，响应里只返回 `****尾4位` |
| A3 | **配置测试用真实最小请求 + 稳定错误码** | `dsh-llm/lib/types/error.js` `CONTEXT_WINDOW_EXCEEDED/QUOTA/EMPTY_RESPONSE/INVALID_CREDENTIAL` + `isXxxError` 正则族；`adapter-failure.js` `normalizeLlmFailure`；`dsh-llm-deepseek/lib/index.js` L1512 `httpErrorCode`（401/403→AUTH、429→RATE_LIMIT、413→INVALID_REQUEST、≥500→SERVER） | `POST /api/llm/test`：发一次真实最小 chat 请求，失败归类为 `{code}`（INVALID_CREDENTIAL / RATE_LIMIT / SERVER / NETWORK），配置页把 code 渲染成人话（「key 无效」vs「额度不足」vs「服务不可达」）——对齐铁律 32 `.code+.phase+.retryable` |
| A4 | **配置变更热生效（onChanged 事件）** | `dsh-credentials/lib/index.js` L121-140 `onChanged(ref)` 事件；dsh-llm-deepseek L1813 注释「changed key through the optional credential seam」 | key 更新 → 触发 LLM 客户端重建（热重载），**不重启进程**；写一条 `config/llm-changed` 事件进日志 |
| A5 | **provider 配置拥有重试策略**（本卡只预留词汇不实现重试） | `dsh-llm/lib/types/retry-policy.js` `RetryPolicySchema`（maxRetries=5、retryableCodes 默认 5 值） | 配置 schema 预留 `retryPolicy` 字段（校验拒绝未知 key），实现归 B-02 卡——本卡不做重试逻辑 |

**红线（G1/G5）**: 只读 DSH 源码自研实现，`grep -rn "@deepseek-ai" src/ packages/ --include="*.ts"` 零结果；不引任何 DSH 依赖。

## 三、交付内容（垂直切片：入口→交互→结果）

### 后端（src/）
1. **新建 `src/services/llm-credential-store.ts`**（借鉴 A1）
   - `setLlmCredential({provider, apiKey})`：加密/脱敏持久化到 `data/llm-credentials.json`（0600 权限；或复用 CredentialVault 若可直接用——先 grep 评估）
   - `resolveLlmApiKey()`：分层解析 存储文件 → `process.env.LLM_API_KEY` → null；返回 `{value, source: "stored"|"env"|null}`
   - `onLlmCredentialChanged(cb)`：变更事件
2. **新建 `src/routes/llm-config.ts`**（借鉴 A2/A3）
   - `GET /api/llm/config` → `{configured, provider, model, baseUrl, maskedKey, source}`（未配置=200 + configured:false，不报错——对齐 DSH 空值语义）
   - `POST /api/llm/config` {provider, model, baseUrl?, apiKey} → 校验（A2）→ 存 → onChanged 触发热重载 → `{ok, maskedKey}`
   - `POST /api/llm/test` → 用**提交的**配置（未保存也可先测）发真实最小请求 → `{ok, latencyMs} | {ok:false, code, message}`（A3 错误码）
   - 接线：`src/server.ts` 挂载路由
3. **改造 `src/config.ts`**（最小侵入）
   - `llmApiKey` 解析改为 `resolveLlmApiKey()` 优先，env 回退（config.ts:72 处）
   - LLM 客户端构造处订阅 onChanged → 热重建
4. **测试**（铁律 48：正常/降级/边界）
   - store：正常存取 / 空值=未配置 / env 回退 / 损坏文件降级（degraded 不崩）
   - API：配置成功 / key 空与非法字符 400（不回显）/ test 的 401→INVALID_CREDENTIAL / 网络不通→NETWORK

### 前端（electron-renderer/）
5. **WelcomeScreen firstLaunch 态升级为配置向导第一步**（借鉴产品形态：DSH 首启即配 LLM）
   - 配置卡片：provider 选择（DeepSeek 默认 / OpenAI 兼容自定义 baseUrl）+ model 输入（默认 deepseek-chat）+ key 粘贴框 + 「测试连接」按钮
   - 测试中 loading；成功绿勾显示 maskedKey + latency；失败按 code 显示人话
   - 「保存并进入」→ POST config → 进入主界面；「暂不配置」→ 进主界面 + StatusBar/顶栏常驻黄条「LLM 未配置，诊断不可用」（不静默，铁律 31）
   - 已配置用户（source=stored/env）跳过向导直接进主界面
6. **前端测试**：三态渲染（未配置/已配置/测试失败）+ mock API 交互

## 四、禁碰清单
- 不改 scripts/audit/、scripts/pre-commit-check.sh
- 不改 electron/main.cjs 与 backend-spawn.cjs（启动链刚修复验证过，勿动）
- 不做重试逻辑（B-02 另卡）、不做多 provider 适配器重构（B-01 另卡）——本卡只做配置面
- synova.json 的 llm 段结构不变（key 永不进 synova.json）

## 五、验收（物理可复现）
1. `grep -rn "@deepseek-ai" src/ packages/ --include="*.ts"` 零结果（G1）
2. 冷启动桌面端（渲染层 dist 已产出）→ 首屏出现 LLM 配置卡片 → 粘贴真实 key → 测试连接绿 → 保存 → 主界面 → 发起一次诊断请求成功用上该 key
3. 删除凭证文件重启 → 首启向导再次出现（firstLaunch 判定含 LLM 未配置）
4. `kill 后端进程` 后从 UI 改 key → 不重启进程，下一次诊断用新 key（热重载证据）
5. 错误码→人话映射：手动填错 key → 显示「密钥无效」而非堆栈
6. vitest 三路径全绿 + `npx tsc --noEmit` 零新增

## 六、交付要求
- 分支 `feat/d575-llm-first-run-config`，单 PR
- evidence 落盘: 测试输出 + 5 条验收的实测输出 → `evidence/D575/`
- task-state/D575.json impl 段回填
- K3 审计随代码交付后统一安排（创始人 2026-09-04 指示：文档免审、代码产出再审）
