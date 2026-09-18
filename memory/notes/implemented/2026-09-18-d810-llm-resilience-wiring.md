# LLM 韧性层三入口接线（D810）：落盘缝上移 + 协作式 outcome 两分法

> 状态: implemented | 日期: 2026-09-18 | 任务: D810 | 相关 D#: D593（韧性层交付）、D594（compaction）、D806/D808（借鉴卡台账与审计）、D809（pending_wiring 标记，PR 未合）
> 决策: ① 韧性层三入口（retry-middleware / timeout / context-compaction 溢出恢复）按 K3 P0-1 接入生产调用链而非删除；② 重试事件落盘缝从 `src/store/retry-projection.ts` **上移到** `src/llm/retry-middleware.ts`；③ 协作式 outcome 与分类错误两分：L2 主循环吃 outcome，L1 装配缝转分类错误
> 理由: K3《DSH借鉴合规专项》§四 P0-1 判定"机制建成未接线"（M3）——`callWithResilience` 全仓零调用、`timeout.ts` 链式死码、`appendRetryEvent` 仅自家测试引用；铁律 4/5/37。

## 一、为什么"落盘缝上移"（关键设计裁决）

原设计把写入缝放在 `src/store/retry-projection.ts#appendRetryEvent`，其 JSDoc 自述"由 L2 消费方调用"。
但 pre-commit 组 5 有**硬门禁**：`src/agent/**` 出现 `from '../store/`（非 `import type` 行）即判
`L2→L5` 跨层违规（铁律 39，`scripts/pre-commit-check.sh:721-724`）。

结果是原设计**物理不可达**：调用方恰是 L2（`tool-loop-executor`），一 import 就被拦。
三个候选处置：

| 方案 | 结论 |
|---|---|
| 给 pre-commit 加白名单（仿 `knowledge-bridge-service`） | ❌ 否决——改门禁让自家代码过关 = 自证循环，且削弱既有防线 |
| 用 `sessionStore.appendEvent` 直写、废弃 `appendRetryEvent` | ❌ 否决——L5 的 `appendRetryEvent` 仍零调用，K3 发现原样存在（铁律 37） |
| **写入缝上移到共享基础设施层 `src/llm/`** | ✅ 采纳——`src/llm` 不属 L1-L5 任一层，L2 可合法 import；payload 形态与 kind 常量归写入侧单源，投影侧只读常量 |

迁移后：`src/llm/retry-middleware.ts` 导出 `RETRY_EVENT_KIND` / `RetryEventSink` /
`appendRetryEvent`；`src/store/retry-projection.ts` 只保留投影定义与注册，`import { RETRY_EVENT_KIND }`
（防 M7 双源漂移）。L5→infra 无门禁项，且 `src/llm` 不反向 import `src/store`（无环）。

## 二、协作式（非抛）落地的两分法

K3/创始人口径："超时**返回 TOOL_TIMEOUT 结果而非抛异常**"。落到 Synova 现有接口形态：

1. **韧性原语层**（`callWithResilience` / `streamWithRetry`）：永不抛，返回
   `{ok:false, code, kind:'timeout'|'error', degraded:true, retryable}`（D593 原样，零改动）。
2. **能直接吃 outcome 的消费方**：`tool-loop-executor`（L2 主循环）、`context-engine`（摘要）、
   `background-review`（×2）、`extractor`（×3）——就地按 `outcome.code` 走各自既有降级分支，**不抛**。
3. **接口契约只允许"返回/抛"的消费方**：L3 `LLMClient.chat` 无 outcome 通道，routes 装配缝
   （`createResilientChatAdapter`）把 outcome **转成分类错误** `LlmResilienceError`
   （`code`+`phase`+`retryable`，铁律 32）——L3 既有 catch 分支按对象降级
   （`degradedModules.push('phase2_llm')` + error 事件）。分类码不丢：SSE 帧 `code=AUTH_FAILED`
   即此路径产物（全仓唯一构造点在 `src/llm/resilient-chat-adapter.ts`）。

范式锚点：DSH `dsh-tool-call-timeout-policy/lib/index.js:115-133`——武装
`deadline(exec.signal, timeoutMs, 'TOOL_TIMEOUT')` → 委派 → 本层定时器命中时**替换为结构化结果**
（`isError:true` + `error.info.code`），消费方按 `error.code` 路由，不解析 message。

## 三、顺手修掉的静默丢弃（否则接线即回归）

`retry-middleware.pickChatOptions` 原白名单只透传 model/temperature/maxTokens/reasoningEffort，
**静默丢弃 `tools` / `cacheConfig`**。接线前无调用方 ⇒ 无暴露；一旦接入工具循环，
`tools` 丢失 = Agent 永不请求工具（静默行为回归，铁律 11 同族）。D810 补齐白名单并注明
"新增 ChatOptions 字段须同步此处"。

## 四、验证契约（可复跑）

- 生产调用点：`grep -rn "callWithResilience\|createResilientChatAdapter" src/` → 6 文件非测试命中
- 断开反证：临时把 `tool-loop-executor.callLlm` 换回直连 `provider.chat` → vitest 3/4 必红；
  还原 → 4/4 绿（`tests/agent/tool-loop-executor-resilience.integration.test.ts`）
- 端到端：GS-01 真实 consult → SSE `"code":"AUTH_FAILED"`
- 台账：`pending_wiring` 态 `v1_passed=22` ↔ 改回 `test` 态 `25`（本地实测两态）

## 五、未闭合项（移交，非本任务范围）

- **20-3/20-5/22-1 的 pending_wiring 回改**：D809（分支 `fix/d809-pending-wiring`）把 v0.2 附录 A
  三行证据列改为 `pending_wiring`（fail-closed 不计 passed）；本任务已产出绑定证据
  `docs/synova/product-lines/evidence/test-2026-09-18.json`。D809 合入后把三行改回 `test` 即恢复计分
  （两分支同改一文件，须串行）。
- **GS-01 noauth-401**：无 token 调 `POST /api/diagnosis/consult` 返回 200 并流式跑完诊断
  （鉴权 fail-open）。D774 2026-09-15/16 evidence 同项已红，属独立安全任务，本任务只如实登记。
- **编号撞车**：`alloc-task-id.sh` 只扫本工作树 `task-state/`，看不到其他 worktree 的登记 →
  首跑把 D809 重复分配（与 `fix/d809-pending-wiring` 撞号）。本任务改取 D810；缺陷入控制塔待修。
