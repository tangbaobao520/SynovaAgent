# SYNOVA-IMPL-D593：LLM 调用韧性层（重试配置化 + 协作式超时，DSH 借鉴卡 B-02+B-06）

> 状态：dev doc | 2026-09-08 | 优先级 P1（模型底座/自诊断可信度/稳定性）
> 归属：Claude 线（src/llm/ + src/store/）
> 借鉴：DSH 范式（读源码自研，零代码依赖，G1/G4）
> 借鉴锚点（真实源码 0.1.1-rc.2）：`packages/llm/llm-retry/lib/index.js` + `packages/llm/llm/lib/types/retry-policy.js` + `packages/llm/llm-deepseek/lib/types/translate.js` + `dsh-timeout`

## 1. 权威文档引用

- DSH 借鉴指引 v2 B-02 + B-06；DSH 源码（已读）：`retry-policy.js`（backoff schema + DEFAULT_RETRYABLE_CODES）、`llm-retry/lib/index.js`、`llm-deepseek/lib/types/translate.js`（DeepSeek 空响应识别）、`dsh-timeout`（MAX_TIMER_DELAY_MS/clampTimeout/deadline/idleWatchdog/TOOL_TIMEOUT）。
- 专家架构权威（20260905 第七章可组合性）：LLM 韧性层服务于**推理层（问题域专家/可组合专家单元）**，非固定 7 专家。
- 铁律 32（`.code+.phase+.retryable`）。

## 2. 代码审计现状（file:line，实测）

### 2.1 DSH 范式（DeepSeek 特别优化）

- `retry-policy.js`：`DEFAULT_INITIAL_DELAY_MS=500`、`DEFAULT_MAX_DELAY_MS=10_000`、`DEFAULT_JITTER_RATIO=0.1`；`DEFAULT_RETRYABLE_CODES=['EMPTY_RESPONSE','RATE_LIMIT','SERVER','TIMEOUT','TRANSPORT']`；backoff 全 schema 校验、归 provider 配置。
- `translate.js`（DeepSeek 特有）：DeepSeek `stop` 但 `order.length===0` → `EMPTY_RESPONSE` error finish（可安全重试）；usage 延迟到 `[DONE]`。
- `dsh-timeout`：`MAX_TIMER_DELAY_MS=2147483647` 防 Node 定时器溢出；clampTimeout（钳制）/deadline（绝对截止）/idleWatchdog（空闲看门狗）；超时返回 `TOOL_TIMEOUT` 结果而非抛异常（协作式取消）。

### 2.2 Synova 现状（已有部分，收敛对齐非新建）

- `src/llm/retry-middleware.ts` + `src/llm/circuit-breaker.ts` + `src/llm/types.ts`（RETRYABLE_STATUS_CODES/TRANSIENT_ERROR_PATTERNS/LLMCallOptions.maxRetries/backoff/firstTokenTimeoutMs/totalTimeoutMs）已存在。
- 缺口：重试策略未 provider 级配置、无 jitter 比例、**重试计数不进 D500 事件流**、DeepSeek 空响应未按 EMPTY_RESPONSE 可重试分类、无 clampTimeout/deadline/idleWatchdog 三层、无 MAX_TIMER_DELAY 防护、无「超时返回分类结果」协作式取消。

## 3. 无重复造轮子审计（S-14）

- grep 证实 `src/llm/retry-middleware.ts` + `circuit-breaker.ts` + `types.ts` 已有基础；本次**收敛对齐**（配置化 + 投影化 + 超时三层），不重写。
- 复用 B-01（D586）的 `normalizeLlmFailure`/`EMPTY_RESPONSE` 错误码。

## 4. 写集表（2 修改 + 2 新建 + 1 测试）

| 文件 | 操作 |
|---|---|
| `src/llm/types.ts` | 修改：LLMCallOptions 增 jitterRatio/retryableCodes/initialDelayMs/maxDelayMs/deadline/idleWatchdog |
| `src/llm/retry-middleware.ts` | 修改：退避加 jitter、重试码 schema 校验 + provider 配置 |
| `src/llm/timeout.ts` | 新建：clampTimeout/deadline/idleWatchdog + MAX_TIMER_DELAY 防护 + TOOL_TIMEOUT 结果 |
| `src/store/retry-projection.ts` | 新建：重试计数投影（D500 事件流可回放） |
| `tests/llm/call-resilience.test.ts` | 新建：red→green |

## 5. 测试要求（red→green，非空壳）

- 正常：429/RATE_LIMIT 按 backoff+jitter 退避重试；重试计数落事件流可回放；clampTimeout 钳制。
- 边界：EMPTY_RESPONSE 可重试、INVALID_CREDENTIAL 不重试；超时返回 TOOL_TIMEOUT 结果（非抛异常）；MAX_TIMER_DELAY 溢出防护；idleWatchdog 空闲触发。
- 每用例 ≥3 expect。

## 6. 接线要求

- `retry-projection` 挂 D500 事件流后；`timeout` 在 LLM/工具调用处接线；重试策略从 provider 配置读取。

## 7. 完成标准（DS1-DSn）

- DS1：`grep -rn "retryableCodes\|jitterRatio\|clampTimeout\|idleWatchdog\|TOOL_TIMEOUT" src/` 命中（真实接线）。
- DS2：`grep -rn "@deepseek-ai" src/` 零结果。
- DS3：新测试 red→green，≥4 用例。
- DS4：vitest 全绿 + tsc 28 基线零新增。
- DS5：as any = 0。

## 8. 自检清单

- [ ] DSH retry-policy/llm-retry/translate/dsh-timeout 源码已读
- [ ] Synova retry-middleware/circuit-breaker/types 现状 grep 实证
- [ ] 遵循新专家规范（推理层/问题域专家，非 7 专家）
- [ ] DeepSeek 空响应 EMPTY_RESPONSE + MAX_TIMER_DELAY + TOOL_TIMEOUT 已纳入
- [ ] 不是凭记忆
- [ ] 不用 --no-verify
