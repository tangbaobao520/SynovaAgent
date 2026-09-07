# Task Brief — D593 LLM 调用韧性层（DSH 借鉴卡 B-02+B-06：重试配置化 + 协作式超时）

> 任务: src/llm/timeout.ts 三层超时 + retry-middleware 退避 jitter/重试码 schema/provider 配置 + src/store/retry-projection.ts 重试计数投影
> 日期: 2026-09-08 | Agent: Claude (Win) | dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D593-llm-call-resilience-20260908.md

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = 驻扎企业的 AI 诊断 Agent，诊断是手段，目的是增长导航。本任务在模型底座（src/llm/ 基础设施，服务 L2 编排调用 LLM 的链路）+ L5 存储（src/store/ 事件流投影）: LLM 调用缺韧性层配置化——重试策略硬编码在 retry-middleware（无 provider 级配置、无 jitter 比例、重试码不走 schema 校验）、超时只有单层 AbortSignal.timeout（无 clampTimeout/deadline/idleWatchdog 三层、无 MAX_TIMER_DELAY 溢出防护、无「超时返回分类结果」协作式取消）、重试计数不进 D500 事件流（不可回放）、DeepSeek 空响应未按 EMPTY_RESPONSE 可重试路由。本任务收敛对齐既有 retry-middleware/circuit-breaker/types（不重写），新建 timeout.ts + retry-projection.ts，属纵向（改 L2 支撑/L5 代码）。

### b) 文件审计
grep 实证（clone 基线 c1119d23）: `src/llm/` 现有 retry-middleware.ts（callWithRetry:27，export 且 src/ 零调用方——tests/llm-resilience.test.ts 锁定其抛异常契约）、circuit-breaker.ts（CircuitBreaker:24 三态机，providers/base.ts:121 消费）、types.ts（LLMCallOptions:23 / DEFAULT_LLM_CALL_OPTIONS:42 / isRetryableError:54 / computeBackoff:67）、tool-result-pruner.ts（D587 已交付）、output-validator.ts。`src/store/` 现有 session-store.ts（appendEvent:343 + D500 事件流 CHECK 约束 event_type ∈ message|tool_result|system|diagnosis_phase|diagnosis_module|diagnosis_report）、session-projection.ts（D588 registerProjection:346 订阅缝 import 即接线，内建投影范式 = 本卡 retry-projection 的挂载范式）。errors/types.ts:744 normalizeLlmFailure + ErrorCode.EMPTY_RESPONSE:50（B-01/D586 已交付，直接复用）。extensions/sentinels、expert/ 无相关模块，无冲突。

### c) 决策
已有覆盖（errors taxonomy + 投影注册表 + 熔断器）→ 复用不重建。无覆盖（三层超时/策略 schema/重试投影）→ 新建。冲突（老测试锁定 callWithRetry 抛异常语义 vs dev doc「超时返回 TOOL_TIMEOUT 非抛异常」）→ 新增 callWithResilience 协作式 outcome 入口，callWithRetry 原语义冻结不动，两入口并存。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- DSH 范式（借鉴锚点 0.1.1-rc.2，已逐行读全文）: `packages/llm/llm/lib/types/retry-policy.js` — DEFAULT_RETRYABLE_CODES=['EMPTY_RESPONSE','RATE_LIMIT','SERVER','TIMEOUT','TRANSPORT'](:16)、backoff schema 校验（positive finite ≤ MAX_TIMER_DELAY_MS、initialDelayMs≤maxDelayMs、jitterRatio∈[0,1]、retryableCodes 非空/非空串/无重复，:58-115）、Object.freeze 策略(:76/:110)。`packages/llm/llm-retry/lib/index.js` — localDelay 指数+jitter 公式 `min(initial*2^exp, max) * (1-jr+2jr*random())`(:43-48)、providerRetryAfterMs 优先(:146)、策略按 policyKey 从事件流 findLast 回放计数(:140-143)。`packages/llm-deepseek/lib/types/translate.js` — stop 但 order.length===0 → EMPTY_RESPONSE error finish 可安全重试(:89-98)。`packages/util/timeout/lib/index.js` — MAX_TIMER_DELAY_MS=2147483647(:27)、clampTimeout= min(requested??def,max)(:43)、deadline 融合上游 signal+TimeoutReason(:57)、idleWatchdog 可重臂+next 互斥+pulse(:85)、timeoutOf 按 code 匹配(:134)。
- dev doc（权威写集与完成标准）: docs/plans/codex/implementation/SYNOVA-IMPL-D593-llm-call-resilience-20260908.md §4-§7。
- Anthropic 决策链: 超时必须区分「截止(deadline)」与「空闲(idle)」两类失败；协作式取消（返回分类结果）优于异常控制流；配置须 schema 校验 fail-fast。
- DeepSeek 第一性原理: 重试是 provider 路由属性而非调用点散落参数；策略解析一次、冻结不可变。
- Q1c 决策参考系: 参考：Anthropic/DeepSeek/第一性原理 + 结论——retryableCodes 词汇表取 Synova ErrorCode 既有词（EMPTY_RESPONSE/RATE_LIMITED/SERVER_ERROR/TIMEOUT/NETWORK），不引 DSH 字面词（TRANSPORT→NETWORK 映射），DS1 零 @deepseek-ai 依赖。
- memory 历史教训: [[2026-09-07-d588-session-projection-delivery]] 组4 读提交版 plan.json——deferred wiring 声明须随 PR 提交；[[2026-09-04-d492-task-decomposer-expert-map]] hook ROOT=主区，brief 须主区/clone 双副本；[[2026-09-02-d491-expert-router-test-debt]] 老测试契约不破坏；[[2026-08-16-d355-l4-contract]] tsc 基线对照法。
- 铁律对照: 47（契约优先 JSDoc）、48（测试非空壳≥3 expect）、24/31（降级 outcome 带 degraded:true）、32（code+retryable 分类）、38（as any=0）、0-2（spec→test→impl→wire→review→merge）。

## Q2: 范围 — 正确的最简方案
不做什么（含文件路径）：
- 不修改 src/providers/base.ts（EMPTY_RESPONSE 归类 B-01 已就位，adapter 边界不动）
- 不修改 src/llm/circuit-breaker.ts（熔断器不在本卡缺口清单）
- 不修改 src/llm/tool-result-pruner.ts（D587 已交付，无关）
- 不修改 src/store/session-store.ts（D500 event_type CHECK 约束不动，重试事件走既有 system 通道，deriveMessages 跳过 log-only 不污染消息历史）
- 不修改 src/store/session-projection.ts（D588 注册表零改动，retry 投影仅作消费方注册，import 即接线范式）
- 不修改 src/errors/types.ts（normalizeLlmFailure/ErrorCode 词汇表复用不扩展）
- 不修改 tests/llm-resilience.test.ts（既有 callWithRetry/isRetryableError/computeBackoff 兼容契约保持全绿）
- 不修改 src/agent/conversation-engine.ts（L2 消费方接线属后续 wire 阶段，plan.json deferred 声明，D588 先例）
做什么：
- src/llm/types.ts
- src/llm/retry-middleware.ts
- src/llm/timeout.ts
- src/store/retry-projection.ts
- tests/llm/call-resilience.test.ts
- tests/llm/timeout.test.ts
- tests/store/retry-projection.test.ts
- .claude/task-briefs/2026-09-08-D593-llm-call-resilience.md
- .claude/plan.json

## Q3: 验收 — 入口 → 交互 → 结果

入口（触发）: 调用方（后续 L2 conversation-engine / 现有测试）调 `callWithResilience(provider, messages, options)` / `streamWithRetry(provider, messages, cb, options)`；重试事件消费方调 `appendRetryEvent(store, sessionId, payload)`。
处理（中间）: callWithResilience 按 resolveRetryPolicy（显式 options > provider 注册策略 > 默认）解析冻结策略 → 每次尝试经 deadline(upstream, clampTimeout(totalTimeoutMs, def, MAX_TIMER_DELAY_MS), TOOL_TIMEOUT) 融合信号 → 可重试失败（code ∈ retryableCodes；DiagnosticAgentError.EMPTY_RESPONSE 可重试、AUTH_FAILED/INVALID_CREDENTIAL 不重试）按 `min(initial*2^exp, max)*(1-jr+2jr*random())` jitter 退避 → 超时不抛异常返回 {ok:false, kind:'timeout', code:'TOOL_TIMEOUT', degraded:true} 结果；重试事件经 onRetry 回调按 DSH llm/retry 载荷形态外抛。streamWithRetry 用 idleWatchdog 包住流，每个 onToken pulse 重臂，空闲超时归类 TOOL_TIMEOUT。retry-projection 注册 llm_retry_stats 投影单元（appendEvent 订阅缝自动 drive），按 payload.kind==='llm_retry' 计数（总重试/按 provider/按失败码，seq 幂等）。
结果（呈现）: 测试全绿（red→green）；投影状态可从 D500 事件流回放重建（restore 一致）；DS1-DS5 命令输出留档。

## 架构层:
L2 支撑（src/llm/ 韧性层，服务 L2 编排）+ L5 存储（src/store/ 投影）；src/llm 无层间约束（check-architecture.sh 只检 L1/L2 agent/orchestrator/L3 sentinel 路径），src/store 内部仅依赖 ./session-projection 与 ./session-store 类型
#CRITERIA: A

## Done 标准:
- [ ] DS3 新测试 red→green 全绿 ≥6 用例每用例 ≥3 expect verify: npx vitest run tests/llm/call-resilience.test.ts
- [ ] DS1 韧性符号真实接线（timeout 被 retry-middleware 消费） verify: grep -rn "retryableCodes\|jitterRatio\|clampTimeout\|idleWatchdog\|TOOL_TIMEOUT" src/llm/ | wc -l
- [ ] DS2 零 @deepseek-ai 依赖 verify: grep -rn "@deepseek-ai" src/ | wc -l
- [ ] DS5 as any / as never / as unknown as = 0（本卡写集文件） verify: grep -rn "as any\|as never\|as unknown as" src/llm/ src/store/retry-projection.ts | wc -l
- [ ] DS4 tsc 28 基线零新增 + vitest 既有套件零回归 verify: npx tsc --noEmit
- [ ] DS6 重试投影可回放（restore 与 eager drive 一致） verify: npx vitest run tests/llm/call-resilience.test.ts -t 投影

## 文档引用

- docs/plans/codex/implementation/SYNOVA-IMPL-D593-llm-call-resilience-20260908.md（§4 写集表 / §5 测试要求 / §6 接线要求 / §7 DS1-DS5）
- CLAUDE.md §铁律 0-2/24/31/32/38/46/47/48、§Loop Engineering V4.5.1
- D:/deepseek-harness/packages/llm/llm/lib/types/retry-policy.js + packages/llm/llm-retry/lib/index.js + packages/llm/llm-deepseek/lib/types/translate.js + packages/util/timeout/lib/index.js（借鉴锚点 0.1.1-rc.2，已读全文，零代码依赖）
- 专家架构权威 20260905 第七章可组合性（LLM 韧性层服务推理层/问题域专家，非固定 7 专家）

## 接口审计

- src/llm/retry-middleware.ts:callWithRetry（既有入口，语义冻结：可重试退避重试/不可重试立即抛，tests/llm-resilience.test.ts 锁定）
- src/llm/types.ts:computeBackoff（既有退避，增 jitterRatio 可配，默认 0.2 保持原 ±20% 行为）
- src/llm/types.ts:isRetryableError（既有 message 兜底分类，无稳定码时降级使用）
- src/errors/types.ts:normalizeLlmFailure（B-01 归一化边界，读稳定 code 路由 retryableCodes）
- src/errors/types.ts:DiagnosticAgentError（.code+.phase+.retryable，铁律 32 载体）
- src/store/session-projection.ts:registerProjection（D588 注册入口，retry 投影经此挂 D500 事件流）
- src/store/session-store.ts:appendEvent（事件落盘入口，system 通道承载 llm_retry 载荷）
- src/llm/circuit-breaker.ts:CircuitBreaker.getState（本卡不改，审计确认零冲突）
- src/providers/base.ts:finalizeAdapterFailure（adapter 最终 throw 边界，本卡不改，上游分类已就位）

## 自检清单

- [ ] DSH retry-policy/llm-retry/translate/dsh-timeout 源码已读全文
- [ ] Synova retry-middleware/circuit-breaker/types 现状 grep 实证（Q0b）
- [ ] 遵循新专家规范（推理层/问题域专家，非 7 专家）
- [ ] DeepSeek 空响应 EMPTY_RESPONSE + MAX_TIMER_DELAY + TOOL_TIMEOUT 已纳入
- [ ] 不是凭记忆（全部 file:line 实读）
- [ ] 不用 --no-verify
