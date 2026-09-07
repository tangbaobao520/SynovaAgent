# SYNOVA-IMPL-D586：LLM 稳定错误码 taxonomy 收敛对齐（DSH 借鉴卡 B-01）

> 状态：dev doc | 2026-09-07 | 优先级 P1（模型底座）
> 归属：Claude 线（src/llm/ + src/providers/ + src/errors/）
> 借鉴：DSH 范式（读源码自研，零代码依赖，G1/G4）
> 借鉴锚点（真实源码，0.1.1-rc.2）：`D:\deepseek-harness\packages\llm\llm\lib\types\error.js` + `adapter-failure.js`

## 1. 权威文档引用

- DSH 借鉴指引 v2（`docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md`）B-01。
- DSH 源码（0.1.1-rc.2，已读全文）：`packages/llm/llm/lib/types/error.js`（HarnessError + 4 canonical codes + isXxxError）+ `adapter-failure.js`（normalizeLlmFailure）。
- 铁律 32（`.code+.phase+.retryable` 强制）。

## 2. 代码审计现状（file:line，实测）

### 2.1 DSH 范式（借鉴目标）

`error.js`：
- `HarnessError extends Error`，带稳定 `code` 字段；注释原文「route on this, never by parsing message」。
- 4 个 provider-neutral canonical code：`CONTEXT_WINDOW_EXCEEDED_CODE='CONTEXT_WINDOW_EXCEEDED'`、`QUOTA_EXCEEDED_CODE='QUOTA'`、`EMPTY_RESPONSE_CODE='EMPTY_RESPONSE'`、`INVALID_CREDENTIAL_CODE='INVALID_CREDENTIAL'`。
- 合一 detail 正则分类器（`export function is` 共 3 个）：`isContextWindowExceededError(detail)`、`isQuotaExceededError(detail)`（把 provider code/type/message 合一为 `detail` 字符串正则分类）、`isHarnessError(value)`。**注意：`EMPTY_RESPONSE`/`INVALID_CREDENTIAL` 是 canonical 码，其分类在 adapter/assembler 侧（非 isXxxError）。**

`adapter-failure.js`：
- `normalizeLlmFailure(value)`：任意 throw（Error/非 Error/敌意值）→ `Object.freeze({message, code})`，剥离可序列化 provider 事实，`cause` 链保留。

### 2.2 Synova 现状（已大部分存在，不重建）

`src/errors/types.ts`：
- `ErrorCode` 23 码（TIMEOUT/NETWORK/DNS/AUTH_FAILED/AUTH_PERMANENT/RATE_LIMITED/BILLING_EXCEEDED/OVERLOADED/SERVER_ERROR/PROVIDER_UNAVAILABLE/INVALID_INPUT/VALIDATION_FAILED/FORMAT_ERROR/CONTEXT_OVERFLOW/PAYLOAD_TOO_LARGE/MODEL_NOT_FOUND/CONTENT_POLICY_BLOCKED/ENGINE_UNAVAILABLE/ENGINE_TIMEOUT/MODULE_FAILED/DB_ERROR/CORRUPTED_DATA/INTERNAL）。
- `DiagnosticAgentError`：`.code/.phase/.retryable/.shouldCompress/.shouldRotateCredential/.shouldFallback/.cause/.statusCode/.provider/.model`（已满足铁律 32 的 `.code+.phase+.retryable`）。
- `BILLING_PATTERNS` / `RATE_LIMIT_PATTERNS` 模式库（Hermes 消息感知）。

`src/llm/types.ts`：`RETRYABLE_STATUS_CODES`、`TRANSIENT_ERROR_PATTERNS`、`CircuitState`、`LLMCallOptions`。

### 2.3 真实缺口（本次要补的 3 个 DSH 范式）

1. **归一化边界缺失**：Synova 无 `normalizeLlmFailure` 等价物——provider throw 的任意值（含跨包拷贝丢失类身份、敌意对象）没有统一归一化为冻结 `{message, code}` 的边界。
2. **合一 detail 正则分类缺失**：Synova 的 pattern banks 是「消息子串匹配」，不是 DSH 的「code+type+message 合一 detail 再正则分类」——后者对 OpenAI 兼容 provider 的 thrown 与 in-band 两种投递风格共享一个分类器。
3. **canonical 词汇表未对齐**：DSH 的 4 个稳定码（CONTEXT_WINDOW_EXCEEDED/QUOTA/EMPTY_RESPONSE/INVALID_CREDENTIAL）与 Synova 的（CONTEXT_OVERFLOW/BILLING_EXCEEDED/AUTH_FAILED）命名不一致；尤其 Synova 缺 **EMPTY_RESPONSE**（退化空响应）这个「可安全重试」的独立分类。

## 3. 无重复造轮子审计（S-14）

- grep `ErrorCode|DiagnosticAgentError|classify|normalize|failure` 证实：Synova 已有 ErrorCode + DiagnosticAgentError + 分类流水线，**不重建**。
- 本次只补 3 个 DSH 范式（归一化边界 / 合一 detail 分类 / canonical 词汇表对齐），并**保持 DiagnosticAgentError 消费方接口不变**（capability seam）。

## 4. 写集表（2 修改 + 0 新建）

| 文件 | 操作 |
|---|---|
| `src/errors/types.ts` | 修改：+`normalizeLlmFailure` +`isContextWindowExceededError/isQuotaExceededError`（合一 detail 正则，仅这 2 个 isXxxError）+ canonical 码对齐（补 `EMPTY_RESPONSE` 码；`INVALID_CREDENTIAL` 分类走 adapter 侧；`CONTEXT_OVERFLOW`→对齐 `CONTEXT_WINDOW_EXCEEDED` 语义） |
| `src/providers/base.ts` 或对应 adapter 边界 | 修改：provider throw 处接 `normalizeLlmFailure`（真实路由接线） |

## 5. 测试要求（red→green，非空壳）

新增 `tests/errors/llm-error-taxonomy.test.ts`：
- 正常：`normalizeLlmFailure(Error)` → frozen `{message, code}`；`normalizeLlmFailure('string throw')` → `{message:'...', code:'UNKNOWN'}`。
- 边界：敌意 throw（访问器抛错）不逃逸；跨包拷贝（own `code`/`failure` 不一致）回落 harnessErrorCode。
- 分类：`isContextWindowExceededError`/`isQuotaExceededError` 对 provider code+type+message 合一 detail 正确命中（≥3 断言 each）；`EMPTY_RESPONSE`/`INVALID_CREDENTIAL` 码在 adapter 分类路径（assembler/api-key）正确命中（≥3 断言 each）。

## 6. 接线要求

- `normalizeLlmFailure` 在 `src/providers/` 的 adapter 最终 throw 边界被调用（grep 调用方）。
- `DiagnosticAgentError` 既有消费方（deepseek.ts/ernie.ts 等）接口不变，零回归。

## 7. 完成标准（DS1-DSn）

- DS1：`grep -rn "normalizeLlmFailure" src/providers/` 命中（真实接线，非测试内）。
- DS2：`grep -rn "@deepseek-ai" src/` 零结果（G1 零依赖）。
- DS3：新测试 red→green（先红后绿，≥4 用例，每用例 ≥3 expect）。
- DS4：`npx vitest run tests/errors/llm-error-taxonomy.test.ts tests/providers/` 全绿；tsc 零新增（28 基线）。
- DS5：`as any` = 0。

## 8. 自检清单

- [ ] DSH 源码 error.js/adapter-failure.js 已读全文（file:line 锚点真实）
- [ ] Synova 现状 ErrorCode/DiagnosticAgentError grep 实证
- [ ] 3 个范式（归一化/合一分类/词汇表）逐项落写集
- [ ] 测试 red→green 实测
- [ ] 不是凭记忆
- [ ] 不用 --no-verify
