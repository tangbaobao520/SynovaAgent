# DSH 锚点重核表（真实断面）— B-01…B-05 × `0.1.7-alpha.2` 源码树

> **日期**：2026-09-23 ｜ **性质**：只读审计。未修改 `/Users/wane/src/deepseek-harness-017` 任何文件、未改 DSH 安装目录、未 `npm install`、未 copy 代码（引用止于 路径＋行号＋符号名）。
> **配套件**：[DSH锚点重核-0.1.6-alpha.2.md](DSH锚点重核-0.1.6-alpha.2.md)（上一版，**断面错误**：把打包运行时当源码）、[DSH借鉴卡重新对比审计.md](DSH借鉴卡重新对比审计.md)（D927 主件）。
> **本件使命**：把上一版用「npm 包名 + `lib/*.js` 产物行号」建立的锚点，全部换成「源码路径 + `.ts` 行号 + 符号名」。

---

## 〇 结论先行

| 卡 | 判定 | 一句话 |
|---|---|---|
| **B-01** | **位移**（含一处**实质语义变化**） | 四码全在 `llm/src/error.ts:25/28/39/48`，注释在 `:14`；但**「守卫族」是错的**——源码树只有 3 个 `is`-族函数，其中 2 个是**字符串分类器**，与注释"never by parsing message"**相冲突**。第 5 码存在。 |
| **B-02** | **命中**（显著扩展） | 五个锚点全部逐字命中；但 `RetryPolicySchema` 从一个对象扩展成 **`normal`/`always` 判别联合**，"截断后抖动的退避公式"实为**先抖动后截断**（截断是双保险）。 |
| **B-03** | **位移** | 四桶、`CHARS_PER_TOKEN`、plan/commit 全部命中，但**分散到 5 个文件**（旧锚点记在 3 个）；`ROLE_OVERHEAD` **确实新增**且是唯一 `export` 的常量。 |
| **B-04** | **位移** | 四项全部命中，`DEFAULTS` **确认已拆到 `config.ts`**（且 8192/4096/1024 三值行号 = 11/12/13）；`PRUNE_MARKER` 为 **L7（旧锚点记 L8，差一行）**。"replay-safe" 是**模块头注释**，不是变量名。 |
| **B-05** | **命中**（归属需修正） | 四件套落在 `compaction-basic/src/{config,region,summarizer,types}.ts`；**但 `compaction/`（无后缀）在 0.1.7 里是「抽象服务缝」而非实体**——`ctx.compaction` 的 seam 声明＋事件类型 owner，实体是 `compaction-basic`。这一条同时**判定了 B-05 的归属**。 |

**总判定分布：命中 2 / 位移 3 / 被上游取代 0 / 已消失 0。**

**最重要的一条发现（可能推翻借鉴卡本身，而不只是锚点）**：B-01 借鉴卡描述的「`isXxxError` 守卫族」在本断面**不存在**。实际存在的是 `isContextWindowExceededError(detail: string)` / `isQuotaExceededError(detail: string)` —— **接收字符串、用正则解析 provider 措辞**。即：**同一份文件里，类注释说「route on this, never by parsing message」，而这两个函数正是在 parse message**。它们的用途是**入站归类**（provider 措辞 → canonical code），与出站「按 code 路由」并不矛盾，但**借鉴卡若照抄"守卫族"三字会抄错**：抄到的不是类型守卫，是脆弱的正则分类器。

---

## 一 取证断面（钉死）

**唯一判据断面（源码树）：**

```
R = /Users/wane/src/deepseek-harness-017
```

| 项 | 实测值 | 复现命令 |
|---|---|---|
| HEAD | `00102833dfaee1da9f48a3a8eae9d34005a75218` | `git rev-parse HEAD` |
| HEAD subject/date | `Merge pull request #4978 … release-dsh-0.1.7-alpha.2` / `2026-09-22 23:25:38 +0800` | `git log -1 --format='%H %s %ad' --date=iso` |
| 版本三处一致 | `package.json:3` / `apps/desktop/package.json:4` / `apps/web/package.json:4` = `0.1.7-alpha.2` | `grep -n '"version"' package.json apps/desktop/package.json apps/web/package.json` |
| 净度 | `git status --porcelain` = **0 行** | `git status --porcelain \| wc -l` |
| 六包 package.json 版本 | 全部 `0.1.7-alpha.2` | 见 §五 E |

> **✅ 断面独立性已验证**：上述四项与派单方给出的前置事实**逐项一致**。

**旧锚点基线（两份文档，均为可读）：**

| 来源 | 记录版本 | 原文位置 |
|---|---|---|
| 〔引〕`DSH借鉴指引-v2-20260904.md` §3 | `0.1.2-alpha.2`（桌面实装） | `/Users/wane/SynovaAgent/docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md:49-70`（B-01…B-05 五条锚点逐字取此） |
| 〔映〕`DSH源码锚点映射-20260907/README.md` | `0.1.2-rc.1`（**224 包**） | 同目录 `DSH源码锚点映射-20260907/README.md` §二 |

> ⚠️ **硬限制**：`0.1.2-alpha.2` 与 `0.1.2-rc.1` 两个物理断面**均已不在磁盘**（macOS 桌面 `dependencies/` 现为 0.1.6/0.1.7）。因此本表只能做「旧文档记录的 `file:line` vs 今日源码树」复核，**不能做逐字对拍**。凡涉及"行号只差 1"这类判断，见 §四 反例②。

---

## 二 逐卡锚点重核表

### B-01 LLM 稳定错误码 taxonomy — 包 `@deepseek-ai/dsh-llm` → `packages/llm/llm/src/`

| 旧锚点（npm 包 + lib 文件 + 符号） | 新源码路径 `file:line` | 符号是否存在 | 语义是否变化 | 判定 |
|---|---|---|---|---|
| `dsh-llm lib/types/error.js` → `CONTEXT_WINDOW_EXCEEDED_CODE` | `packages/llm/llm/src/error.ts:25` | 是 | 否 | **位移** |
| 同上 → `QUOTA_EXCEEDED_CODE` | `packages/llm/llm/src/error.ts:28` | 是 | 否（值 = `'QUOTA'`，非 `'QUOTA_EXCEEDED'`） | **位移** |
| 同上 → `EMPTY_RESPONSE_CODE` | `packages/llm/llm/src/error.ts:39` | 是 | 否（新增长注释说明"degenerate completion"） | **位移** |
| 同上 → `INVALID_CREDENTIAL_CODE` | `packages/llm/llm/src/error.ts:48` | 是 | 否（注释明示"Deliberately outside the default retryable set"） | **位移** |
| 同上 → 设计注释 `"route on this, never by parsing message"` | `packages/llm/llm/src/error.ts:14` | 是 | **否**（逐字一致） | **命中** |
| 同上 → `isXxxError` **守卫族** | — | **不存在** | ⚠️ **实质变化** | **⚠️ 见下方专项** |
| `dsh-llm lib/types/adapter-failure.js` → `normalizeLlmFailure` | `packages/llm/llm/src/adapter-failure.ts:16` | 是 | **否，但已加固**：新增 `ownFailureSnapshot`/`ownErrorCode`（`:41`,`:51`）防 SDK accessor trap；返回 `Object.freeze({message, code, status?, providerRetryAfterMs?, requestId?, offloadImages?})`（`:80-87`） | **位移** |
| （旧锚点未记）第 5 码 | `packages/llm/llm/src/error.ts:172` `IMAGE_OFFLOAD_REQUIRED_CODE` | 是 | — | **新增确认** |

#### B-01 必须回答之 ②：守卫族到底有几个 —— **三个，不是一族**

**复现命令与输出摘要：**

```bash
grep -rn 'export function is' packages/llm/llm/src/
# packages/llm/llm/src/error.ts:80  isContextWindowExceededError(detail: string): boolean
# packages/llm/llm/src/error.ts:94  isQuotaExceededError(detail: string): boolean
# packages/llm/llm/src/error.ts:161 isHarnessError(value: unknown): value is HarnessError
# （另两条同名式但异族：assistant-stream.ts:250 isTokenDelta、:270 isVisibleChunk、
#   call-config.ts:76 isAgentLoopRequest —— 与 error taxonomy 无关）
```

**负对照（上一版 tarball 断面实测为零命中，本件独立复核）：**

```bash
for s in isEmptyResponseError isInvalidCredentialError isRateLimitError isServerError isTimeoutError; do
  printf "%-28s src*: "; grep -rn "$s" --include=*.ts packages/ | wc -l
done
```

| 符号 | `src/`（HEAD 源码） | `lib/`（本机构建产物） |
|---|---|---|
| `isEmptyResponseError` | **0** | **0** |
| `isInvalidCredentialError` | **0** | **0** |
| `isRateLimitError` / `isServerError` / `isTimeoutError` | **0** | 未查（同形判定） |

> **结论**：**上一版的零命中结论正确**，且不是"tarball 压缩/摇树"造成的假阴性——源码树与构建产物**双双为零**。`isEmptyResponseError` / `isInvalidCredentialError` **从未存在**于 0.1.7-alpha.2。

**实际存在的 `is`-族函数清单（3 个，并附语义分类）**

| 函数 | `file:line` | 入参 | 返回 | 语义类别 |
|---|---|---|---|---|
| `isContextWindowExceededError` | `error.ts:80` | `detail: string` | `boolean` | **字符串分类器**（5 条正则，`STRUCTURED_CONTEXT_OVERFLOW`:51 / `TOO_LARGE_FOR_CONTEXT`:58 / `EXCEEDS_MODEL_CONTEXT`:66） |
| `isQuotaExceededError` | `error.ts:94` | `detail: string` | `boolean` | **字符串分类器**（5 条正则） |
| `isHarnessError` | `error.ts:161` | `value: unknown` | `value is HarnessError` | **真·类型守卫**（唯一的真守卫） |

> **语义变化的准确表述（事实/推断分离）**：
> - **事实**：两个 canonical 码 `CONTEXT_WINDOW_EXCEEDED` / `QUOTA` 配有**正则分类器**，入参是 provider 措辞拼成的字符串，不是 Error 对象。
> - **事实**：`EMPTY_RESPONSE` / `INVALID_CREDENTIAL` / `IMAGE_OFFLOAD_REQUIRED` **没有**对应的 `is`-函数。
> - **推断（依赖假设：借鉴卡原意是"每种码配一个类型守卫"）**：旧卡"守卫族"三字**不成立**。可借鉴的真实模式是 **"canonical 码（出站路由）＋正则分类器（入站归类）"双层**，两层的可靠性等级完全不同——前者可路由，后者必须按"可能误判"对待。

#### B-01 必须回答之 ③：`normalizeLlmFailure` 不在 `error.ts`

**已在 `adapter-failure.ts:16` 确认**（旧锚点记录的 `lib/types/adapter-failure.js` 在新树里落到 `src/adapter-failure.ts`，**与 `error.ts` 平级，不在 types/ 子目录**）。
调用点：`packages/llm/llm/src/index.ts:35`（import）、`:1131`（调用）。
测试存在：`packages/llm/llm/tests/adapter-failure.spec.ts`（11 处断言，全部期望 `code: 'UNKNOWN'`）。

#### B-01 必须回答之 ④：第 5 码 —— **有**

`IMAGE_OFFLOAD_REQUIRED_CODE = 'IMAGE_OFFLOAD_REQUIRED'` @ `error.ts:172`，**且是本文件最后一个声明**（文件共 172 行）。注释说明其载荷 `offloadImages` 由 `dsh-compaction-image-offload` 消费。
> 上一版在 tarball 断面见到此码 → **源码树同样存在**，非打包期产物。差异仅在于：旧锚点把它记成"第 5 个 canonical 码"，而源码树的**物理排布**把它放在**文件末尾、`isHarnessError` 之后**，与四码的连续块（25–48）分离。

---

### B-02 重试策略配置化 + 投影化 — `packages/llm/llm-retry/src/` ＋ `packages/llm/llm/src/retry-policy.ts`

| 旧锚点 | 新 `file:line` | 符号 | 语义变化 | 判定 |
|---|---|---|---|---|
| `dsh-llm-retry lib/index.js` → `inject=["agents","sessionProjections"]` | `packages/llm/llm-retry/src/index.ts:22` `export const inject = ['agents', 'sessionProjections']` | 是 | 否（逐字一致） | **命中** |
| 同上 → 退避公式 `initialDelayMs*2^(retry-1)` 截断 `maxDelayMs` ± jitter | `index.ts:59-64`（`localDelay`） | 是 | **微变**：指数先夹到 `Math.min(retry-1, 1024)`（`:60`，防溢出），**先抖动后截断**（`:62-63`） | **位移** |
| 同上 → **先 append 意图 → 等待 → 再 append started** | `index.ts:188` `append('llm/retry', …)` → `:189` `await cancellableDelay` → `:190` `append('llm/retry-started', …)` | 是 | **否（三段顺序逐字成立）** | **命中** |
| `dsh-llm lib/types/retry-policy.js` → `maxRetries=5` | `packages/llm/llm/src/retry-policy.ts:14` `DEFAULT_MAX_RETRIES = 5` | 是 | 否 | **位移** |
| 同上 → `retryableCodes` 默认词表 | `retry-policy.ts:18-24` `DEFAULT_RETRYABLE_CODES` | 是 | 否（词表逐字一致） | **位移** |
| 同上 → `RetryPolicySchema` | `retry-policy.ts:100` | 是 | **⚠️ 扩展**：`z.union([normalPolicySchema, alwaysPolicySchema])`，新增 `mode:'always'` 无界模式（`:94-97`） | **位移** |
| （旧锚点隐含"单一 schema"） | `retry-policy.ts:87` `normalPolicySchema` / `:81` `backoffSchema` | 是 | — | **新增确认** |

**五个锚点逐字命中清单（本轮必须回答的全部五项）**

| 必须回答 | `file:line` | 实测值 |
|---|---|---|
| inject 声明 | `llm-retry/src/index.ts:22` | `export const inject = ['agents', 'sessionProjections']` |
| 退避公式 | `llm-retry/src/index.ts:59-64` | `exponential = min(initialDelayMs * 2**min(retry-1,1024), maxDelayMs)`；`jitter = 1 - jitterRatio + 2*jitterRatio*random()`；`delay = min(exponential * jitter, maxDelayMs)` |
| append→await→append-started | `llm-retry/src/index.ts:188/189/190` | `append('llm/retry')` → `await cancellableDelay(...)` → `append('llm/retry-started', {retryId,turn,step,retry})` |
| `DEFAULT_MAX_RETRIES` | `llm/src/retry-policy.ts:14` | `5` |
| `DEFAULT_RETRYABLE_CODES` | `llm/src/retry-policy.ts:18-24` | `[EMPTY_RESPONSE_CODE, 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT']` |
| `RetryPolicySchema` | `llm/src/retry-policy.ts:100` | `z.union([normalPolicySchema(:87), alwaysPolicySchema(:94)])` |

**B-02 的实质语义变化（三条，均可复现）**

1. **模式从单值变判别联合**。`RetryPolicyConfig = NormalRetryPolicyConfig | AlwaysRetryPolicyConfig`（`retry-policy.ts:57`）。`normal` = 有界瞬态重试；`always` = **无界**重试至成功/取消/销毁（`:49-54`）。旧卡只记了 `maxRetries=5` 一条，**漏掉了无界模式这个能力面**。
2. **策略归属被"代码级锁死"**。`llm-retry/src/index.ts:30-37` `validateConfig()` 显式拒绝：
   > `if (key === 'retryPolicy') throw new Error('llm-retry: retryPolicy belongs under each provider configuration')`
   —— 旧卡说"策略归 provider 配置所有"，**源码里这句话被实现成了一条运行时守卫**（照抄插件配置会直接抛错）。这是比文档更强的证据。
3. **重试状态持久化走投影注册表**。`sessionProjections.register({ key: 'llmRetry', stateVersion: 1, … })` @ `index.ts:125-138`；状态形状经 `declare module '@deepseek-ai/dsh-session-projection/types'` 的 `SessionProjectionStateMap` 合并声明（`:116-121`）。**这正是 B-07（会话投影注册表）的真实锚点**，与 B-02 强耦合——建议在 B-07 复核时交叉引用。
4. **`llm/retry-started` 由不变式插件独立校验**：`llm-retry/src/invariant.ts:120/129/134/138/140/142/144/154/168`，`inject = ['invariants']`（`:16`），另有一处 `{ inject: ['sessions'] }`（`:170`）。事件类型声明在 `llm-retry/src/types.ts:9`（`'llm/retry'`）与 `:11`（`'llm/retry-started'`）。

---

### B-03 token 计量四桶 + 成本护栏 — `packages/llm/token-meter/src/`

| 旧锚点 | 新 `file:line` | 符号 | 语义变化 | 判定 |
|---|---|---|---|---|
| `dsh-token-meter lib/types/estimate.js` → `CHARS_PER_TOKEN=4` | `packages/llm/token-meter/src/estimate.ts:13` | 是 | 否（值 = 4） | **位移** |
| 同上 → block overhead 4 | `estimate.ts:16` `BLOCK_OVERHEAD = 4` | 是 | 否 | **位移** |
| （旧锚点未记）`ROLE_OVERHEAD` | `estimate.ts:19` `export const ROLE_OVERHEAD = 4` | **是（新增项已确认）** | **新增** | **新增确认** |
| 四桶 `uncachedInput/output/cacheRead/cacheWrite` | `usage-projection.ts:14-19`（`zeroBuckets`）、`:21-26`（`bucketsFrom`）、`:45-50`（`projectionSchema`） | 是 | **命名微变**：实际标识符带 `Tokens` 后缀 | **位移** |
| `usage-projection.js` → `bucketsFrom` | `usage-projection.ts:21`（另有调用点 `:136`） | 是 | 否 | **位移** |
| `surface-projection.js` → plan/commit 两段式 | `surface-fold.ts:107` `planSurfaceTokens` / `:136` `commitSurfaceTokens`（plan 类型 `:41`） | 是 | **文件位移**：从 `surface-projection.ts` **搬到 `surface-fold.ts`** | **位移** |
| `projectedTokens` 外推 | `usage-projection.ts:69`（schema）`:73`（透传）`:215`（计算） | 是 | 否（但语义收窄，见下） | **位移** |

**必须回答项 → 实测**

| 必须回答 | `file:line` | 实测 |
|---|---|---|
| `CHARS_PER_TOKEN` | `estimate.ts:13` | `const CHARS_PER_TOKEN = 4` —— **未导出**（模块私有） |
| `BLOCK_OVERHEAD` | `estimate.ts:16` | `const BLOCK_OVERHEAD = 4` —— **未导出** |
| 是否有 `ROLE_OVERHEAD` | `estimate.ts:19` | **有**，`export const ROLE_OVERHEAD = 4` —— **是三个常量里唯一导出的** |
| 四桶定义 | `usage-projection.ts:14-19` | `uncachedInputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens` |
| `bucketsFrom` | `usage-projection.ts:21` | `usage.inputTokens` → `uncachedInputTokens`；`cacheRead/Write` 用 `?? 0` 兜底 |
| plan/commit 两段式 | `surface-fold.ts:107` / `:136` | 见下 |
| `projectedTokens` | `usage-projection.ts:69/73/215`、`projection.ts:45` | 见下 |

**plan/commit 的准确语义（这是本卡最容易被误述的一处）**

`surface-fold.ts:7-9` 的模块头注释原文（逐字）：
> `The fold is a plan/commit pair: {@link planSurfaceTokens} runs every fallible step read-only and {@link commitSurfaceTokens} mutates in place, so a throw leaves the caller's state untouched and the same malformed event fails identically on every retry.`

- `planSurfaceTokens(nodes, event): SurfaceTokenPlan` @ `:107`（**只读**，可抛）
- `commitSurfaceTokens<Node>(nodes, plan): void` @ `:136`（**原地变更**，不抛）
- 调用对：`index.ts:289` → `:326`；`breakdown-projection.ts:64` → `:66`

> **重要限定（防止过度外推）**：这个 plan/commit **是"纯函数式先校验后提交"的异常安全模式**（事务语义），**不是**"先规划再提交的两阶段成本护栏"。旧卡把 plan/commit 与 `projectedTokens`/成本护栏并列书写，容易让人以为 plan/commit 是成本侧的两段式。**源码事实是：plan/commit 属于 surface 折叠的异常安全，成本护栏由 `projectedTokens`/`pressureTokens` 承担，两者是不同机制。**

**`ROLE_OVERHEAD` 的语义（新增项的作用）**

- 应用于 `estimateSystemMessage` @ `estimate.ts:79`（`Math.ceil(chars/4) + ROLE_OVERHEAD`）
- 应用于 `estimateMessage` @ `estimate.ts:90`（`estimateContent(...) + ROLE_OVERHEAD`）
- 消费点：`token-meter/src/index.ts:35`（import）、`:338`（providerContent 分支）
- **含义**：每条 priced message 的 role-field framing 开销，**与 per-block 的 `BLOCK_OVERHEAD` 正交**。旧断面（0.1.2-rc.1）未见此项 → 是**新增的计价维度**，会使同一段对话的估算值**高于旧版**。**借用此计量器做成本预估时，必须知道它比旧版更保守（更贵）。**

**`projectedTokens` 的语义（含一条重要的"不可用于计费"限定）**

- `usage-projection.ts:69` 定义于 `pressureSchema`；`:71-73` 经 `.strict().transform()` 透传；`:215` 计算式：
  `projectedTokens = Math.max(0, pressureTokens + surfaceTokens - sampledSurfaceTokens)`
  —— 即 **"上次采样值 ＋ surface 自采样以来的带符号位移"** 外推。
- `projection.ts:54-56` 有一处**必须读到的警告**（原文要点）：`projectedTokens` 存在的原因是 **estimator 系统性低估 CJK 文本**，因此该值**被排除在 occupancy 之外**。

> **对 SynovaAgent 的直接含义（推断，依赖假设：我们可能想用 token-meter 报价）**：**不能**用 `projectedTokens` 做客户计费或硬性成本闸门——DSH 自己就把它排除在占用判定之外，理由是中文被系统性低估。中文场景下这个偏差只会更大，因为 `CHARS_PER_TOKEN = 4` 是**拉丁文密度假设**。这是 B-03 借用时的**头号坑**。

---

### B-04 工具结果修剪器 — `packages/compaction/compaction-tool-result-pruner/src/`

| 旧锚点 | 新 `file:line` | 符号 | 语义变化 | 判定 |
|---|---|---|---|---|
| `dsh-compaction-tool-result-pruner lib/index.js` → `DEFAULTS{thresholdChars:8192, headChars:4096, tailChars:1024}` | `packages/compaction/compaction-tool-result-pruner/src/config.ts:10`（`DEFAULTS`），三值 `:11` / `:12` / `:13` | 是 | 否 | **位移**（确认已拆到 `config.ts`） |
| 同上 → `PRUNE_MARKER` | `config.ts:7` | 是 | 否（值 `'\n\n[... tool result middle pruned ...]\n\n'`） | **位移**（旧记 L8，实为 **L7**） |
| 同上 → `codePointLength` | `config.ts:27` | 是 | 否（`Array.from(text).length`） | **位移** |
| 同上 → "replay-safe" 派生式修剪 | **两处**：`index.ts:2`（模块头）＋ `index.ts:148` `session.deriveEventMessage(event)` | 是 | 否 | **位移** |

**四项 → 实测（含 `DEFAULTS` 拆分的确认）**

| 必须回答 | `file:line` | 实测 |
|---|---|---|
| `DEFAULTS` | `config.ts:10`（字面量 `:11-13`） | `deepFreeze({ thresholdChars: 8192, headChars: 4096, tailChars: 1024 })` —— **三值与旧锚点逐字一致** |
| `PRUNE_MARKER` | `config.ts:7` | `export const PRUNE_MARKER = '\n\n[... tool result middle pruned ...]\n\n'` |
| `codePointLength` | `config.ts:27` | `export function codePointLength(text: string): number { return Array.from(text).length }` |
| "replay-safe" 等价语义 | `index.ts:2` ＋ `index.ts:148` | 见下 |

**"replay-safe" 的等价语义在哪一行 —— 精确回答**

| 位置 | 内容 | 性质 |
|---|---|---|
| `index.ts:2` | `Replay-safe, model-free tool-result pruning service.` | **模块头 doc comment（"replay-safe" 这个词组的唯一出处）** |
| `index.ts:145-150` | `session.deriveEventMessage(event)` 从**原始 tool/result 事件**派生消息，而非读可变副本 | **实现机理** |
| `index.ts:165-171` | 替换事件的 `sourceEventSeqs: [seq]` ＋ `surfaceOp: {op:'replace', startSeq:seq, endSeq:seq}` | **回放可复原被剪内容的关键字段** |
| `index.ts:126-130`（doc） | "preserves the complete event data except for `content`, cites the shadowed node so replay can recover the replacement input" | **等价语义的完整表述** |

> **"派生式"的准确含义**：修剪**不存储**一份"被剪掉的内容"另档保存，而是**每一次都从原始事件重新派生**（`deriveEventMessage`），替换事件只声明 `sourceEventSeqs` 指向原节点。因此回放时能被完整重建 —— 这就是 replay-safe。**它不是"内容可撤销"，而是"内容是日志的函数"。**

**B-04 的两处语义变化（旧卡未记）**

1. **修剪器现在依赖 token meter**：`static inject = ['tokenMeter']`（`index.ts:47`），且**每次都发射影子价格事件**：
   `session.append('compaction/prune', { shadowedRange, shadowedSeqs, shadowedTokenCount: this.ctx.tokenMeter.estimateMessage(original) })` @ `index.ts:160-164`。
   → **B-04 与 B-03 在 0.1.7 是硬耦合的**（旧卡把两者当独立卡写）。移植 B-04 时必须同时移植 B-03 的计价器。
2. **配置校验新增一条结构性不变式**：`config.ts:55-63` 强制 `headChars + codePointLength(PRUNE_MARKER) + tailChars ≤ thresholdChars`，否则抛错（`:60-61`）。另：`thresholdChars` 必须为**正**整数（`:51`），`headChars`/`tailChars` 可为 **0**（`:52-53`）。

---

### B-05 上下文压缩引擎四件套 — `packages/compaction/compaction-basic/src/`（＋ seam 在 `packages/compaction/compaction/`）

| 旧锚点 | 新 `file:line` | 符号 | 语义变化 | 判定 |
|---|---|---|---|---|
| `dsh-compaction-basic lib/types/{config,region,summarizer}.js` | `compaction-basic/src/config.ts` / `region.ts` / `summarizer.ts` ＋ `types.ts` | 是 | 否（三文件同名对应，**＋ `types.ts`**） | **命中** |
| → threshold `0.8` | `compaction-basic/src/config.ts:20` `DEFAULT_THRESHOLD_RATIO = 0.8` | 是 | 否 | **位移** |
| → retain `0.16` | `compaction-basic/src/config.ts:23` `DEFAULT_RETAIN_RATIO = 0.16` | 是 | 否 | **位移** |
| → 事件 `compaction/start\|summary\|end` | 发射点 `region.ts:210` / `:491` / `:237`（成功）·`:245`（失败）；**类型定义在 `compaction/src/types.ts:24/34/72`** | 是 | **拆包**：发射在 `-basic`，类型在 seam | **位移** |
| → 影子价格 `shadowedTokenCount` | 定义 `compaction/src/types.ts:40`（summary）`:88`（prune）`:119`（result）；产出 `region.ts:380/500/520`；消费 `token-meter/src/surface-projection.ts:69/75` | 是 | 否 | **位移** |
| → 摘要复用会话前缀保 KV-cache | `summarizer.ts:30`（**最直接**）／`summarizer.ts:74-77`（接口 doc）／`summarizer.ts:110-112`／`region.ts:532-539`／`index.ts:238-240` | 是 | 否 | **命中** |
| → 溢出恢复臂 `CONTEXT_WINDOW_EXCEEDED → 强制压缩 → retry` | `compaction-basic/src/index.ts:194` `if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE \|\| signal.aborted) return next()` | 是 | **否，且增强**（新增 `maxOverflowRetries` 上限 `:200`，见下） | **命中** |

**必须回答项 → 实测**

| 必须回答 | `file:line` | 实测 |
|---|---|---|
| `DEFAULT_THRESHOLD_RATIO` | `compaction-basic/src/config.ts:20` | `= 0.8` —— **未导出**（模块私有）；消费点 `:78` |
| `DEFAULT_RETAIN_RATIO` | `compaction-basic/src/config.ts:23` | `= 0.16` —— **未导出**；消费点 `:79`（`resolveRetention(config, { retainRatio: DEFAULT_RETAIN_RATIO })`） |
| 三事件发射点 | `region.ts:210` / `:491` / `:237`＋`:245` | 见下 |
| `shadowedTokenCount` | `compaction/src/types.ts:40`（定义）／`region.ts:380`（求和）／`region.ts:500`（发射）／`surface-projection.ts:69,75`（消费） | 见下 |
| KV-cache 前缀复用 | `summarizer.ts:30` | 见下 |
| 恢复臂那一行 | `compaction-basic/src/index.ts:194` | 见下 |

**① 三个事件的发射点（精确）**

| 事件 | 发射点 | 语义 |
|---|---|---|
| `compaction/start` | `region.ts:210` `const startEvent = session.append('compaction/start', lifecycle)` | **durable 锁的取得**（`lifecycle` 构造于 `:205-209`） |
| `compaction/summary` | `region.ts:491` `const summaryEvent = session.append('compaction/summary', {…})` | 摘要与影子价格（载荷 `:491-505`） |
| `compaction/end` | 成功 `region.ts:237`；失败 `region.ts:245`（带 `error: errorChain(error)`） | 锁释放 |
| （第 4 个，旧卡未列） | `compaction/prune` 由**另一个包**发射：`compaction-tool-result-pruner/src/index.ts:160` | B-04 的影子价格事件 —— **与 B-05 共享同一协议** |

**② `shadowedTokenCount` 的完整链路（含类型 owner）**

| 环节 | `file:line` |
|---|---|
| 事件类型定义（summary） | `compaction/src/types.ts:40` |
| 事件类型定义（prune） | `compaction/src/types.ts:88` |
| `CompactionResult` 字段 | `compaction/src/types.ts:119` |
| 不变式校验（非负安全整数） | `compaction/src/invariant.ts:230-231` |
| 求和（选中的 surface 节点启发式价之和） | `compaction-basic/src/region.ts:380` |
| 随事件落地 | `region.ts:500`；返回体 `region.ts:520` |
| 摘要结构字段 | `compaction-basic/src/region.ts:45` |
| **消费端（真正的价值所在）** | `token-meter/src/surface-projection.ts:69` `const { shadowedRange, shadowedTokenCount } = event.data` → `:75 tokens: shadowedTokenCount` |

> **影子价格协议（这是 B-03/B-04/B-05 三卡的共享枢纽，旧卡分开写是漏了）**：
> `surface-projection.ts:5-13` 的 doc 原文要点：**计量事件必须紧邻其替换事件**，折叠只保留"运行总量 ＋ 至多一个待兑认领（claim）"，**从不保留逐节点价格**。
> 后果（`:12-13` 明写）：**没有认领的替换按零增量折叠 —— 保住了回放，代价是可能的漂移（drift）**。
> `compaction/src/types.ts:75-81` 把这条相邻性写成**契约**："The replacement MUST be appended synchronously right after this event."

**③ KV-cache 前缀复用 —— 源码原文（含中英措辞检索结论）**

**检索结论**：源码树中**没有中文措辞**（全树 `src/` 为英文注释）。"KV-cache" 字面出现于 `summarizer.ts:30` 与 `region.ts:538`；"prefix cache" 出现于 `summarizer.ts:76`、`:80`、`:110-112`。

最直接的一处，`summarizer.ts:26-31`（逐字，摘 ≤3 行）：

```
 * The summarization directive, delivered as the FINAL user message after the
 * replayed conversation rather than as a distinct summarizer system prompt.
 * Keeping the conversation's own system prompt, tools, and message prefix in
 * front of it makes the auxiliary call a genuine prefix of the last routed
 * request, so the provider's KV cache is reused instead of invalidated.
```

机理补充：`region.ts:532-539` 的 `buildSummarizationInput` 负责重建"system（surface node 0）＋ header 工具 schema ＋ 影子区域内派生消息"这一**真实前缀**；`summarizer.ts:76-80` 定义 `SummarizationInput`（`tools` 复用是为 prefix-cache 对齐）。
`index.ts:238-240` 的 `summarize()` hook doc 再次复述："prompt, tools, and messages so the provider's KV cache is not invalidated"。

> **⚠️ 关键实现细节（照抄时最容易丢的一条）**：指令**不是**作为独立的 summarizer system prompt 发送，而是**追加在重放对话之后的最后一条 user message**。这正是前缀能命中缓存的原因——若图省事换成独立 system prompt，**KV cache 立刻全失效，摘要调用成本会数倍上升**。

**④ 溢出恢复臂 —— `index.ts:194` 的完整上下文**

- 符号：`ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => …)`
- 守卫行：`index.ts:194` `if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE || signal.aborted) return next()`
- 导入：`index.ts:12` `import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'`
- 上限：`index.ts:200` `if (retries >= policy.maxOverflowRetries) return next()`（schema `:89`、默认装载 `:102`/`:125`）
- 压缩调用：`index.ts:205` `await this.compactIfNeeded(agent, 'context-overflow', signal)`
- 放行条件（比旧卡更严）：`index.ts:232-234` —— **仅当 surface 真的前进了**（`replaceGeneration > generation`）才 `return { kind: 'retry' }`
- 一处值得单列的增强：`index.ts:207-216`，**摘要在中途失败但已有 durable surface 进展时，仍判为可重试**（日志原文 `context-overflow compaction failed after durable surface progress`），因为 model-free 的 prune 可能已落地、那份缩减就是重试依据。**取消（abort）优先于重试。**

**⑤ `compaction/start` 兼 durable 锁 ＋ 表面稳定复查 —— 两半分别在两个包**

| 机制 | `file:line` | 说明 |
|---|---|---|
| 锁语义（类型层） | `compaction/src/types.ts:20-23` | "Marks the start of a compaction — log-only, **holds the lock until `compaction/end`**" |
| 锁语义（不变式层） | `compaction/src/invariant.ts`（校验族，`tests/invariant.spec.ts:53-128` 逐例覆盖） | 重复 `compaction/start` 被拒；`compaction/end` 必须配对 |
| 打开标记与事务同步相邻 | `compaction-basic/src/region.ts:160`（doc） | "…`compaction/start` are synchronously adjacent, so the durable opening marker is…" |
| **表面稳定复查** | `region.ts:211-214` `assertStable: StabilityCheck`；`region.ts:80` `type StabilityCheck`；`region.ts:59` `stability: 'whole-surface' \| 'selected-span'` | **两档复查**：`assertWholeSurfaceUnchanged` 或 `assertSelectedSpanStable` |
| 复查的两个时点 | `region.ts:233`（摘要前 `prepareCompaction` 后）＋ `region.ts:236`（`summarizeCompaction` 后、`stage='commit'` 前） | 异步摘要期间表面必须未变 |
| 阶段机 | `region.ts:220` `stage='summary'` → `:234` `stage='commit'`；失败归因 `:241`/`:248` | `TransactionFailure['stage']` |
| 手动压缩的忙等拒绝 | `compaction-basic/src/index.ts:427-435` → `ManualCompactionError('busy', 'manual compaction requires an idle agent with no waking queued work')` | 与 durable 锁互补的另一层互斥 |

> **结论修正**：旧卡把"durable 锁"与"表面稳定复查"写在同一个 `compaction/start` 名下。**实际是三处机制**：(a) **durable 锁** = seam 包的类型语义 ＋ 不变式校验；(b) **表面稳定复查** = `-basic` 的 `StabilityCheck` 双档 ＋ 双时点检查；(c) **忙等互斥** = `ManualCompactionError('busy')`。

---

### B-05 另答：`packages/compaction/compaction/`（无 `-basic` 后缀）是什么？

**判定：抽象 seam（`ctx.compaction` 的服务缝），不是实体。B-05 的归属权仍在 `compaction-basic`。**

**证据**

| 证据 | `file:line` | 内容 |
|---|---|---|
| 包 description | `packages/compaction/compaction/package.json:3` | `"Abstract compaction service seam (ctx.compaction) for the DeepSeek Harness"` |
| 模块头 doc | `packages/compaction/compaction/src/index.ts:1-8` | "Compaction Service Definition (`ctx.compaction`): **providers decide when to compact** … by **subclassing** {@link CompactionEngine}… depends on session and LLM vocabulary" |
| 只声明抽象类 | `compaction/src/index.ts:119` | `export abstract class CompactionEngine extends Service` —— **唯一 class，抽象** |
| 服务名注册 | `compaction/src/index.ts`（`Context` 合并声明） | `interface Context { compaction: CompactionEngine }` |
| 对比：实体的 description | `compaction-basic/package.json:3` | `"Token-meter-driven compaction policy and LLM summarization backend"` |
| 对比：实体继承 | `compaction-basic/src/index.ts:113-114` | `export class BasicCompactionEngine extends CompactionEngine { static inject = ['llm','tokenMeter','sessions'] }` |
| 对比：实体默认导出 | `compaction-basic/src/index.ts:452` | `export default BasicCompactionEngine` |

**seam 包 `src/` 里实际装了什么（6 个文件，全是**声明**而非**策略**）**

| 文件 | 内容 | 性质 |
|---|---|---|
| `index.ts` | `CompactionEngine`（抽象）、`ManualCompactionError`（`:48`）、`CompactionTrigger`、`ManualCompactionErrorCode` | 服务接口＋错误分类 |
| `types.ts` | **三个 `compaction/*` 事件的 SessionEventMap 定义**（`:24`/`:34`/`:72`）、`CompactionResult`（`:94`） | **事件类型 owner** |
| `checkpoint.ts` | `compactCheckpointSource`（`:33`）、`isCompactCheckpointSource`（`:49`） | cordis-free 叶子（供 client/wire 引用，见 `index.ts:19-22` 注释） |
| `tool-pairing.ts` | `toolPairingBalancedBefore`（`:112`）/`After`（`:124`） | 纯函数工具 |
| `brand.ts` | `CompactionId`（`:11`） | 品牌类型 |
| `invariant.ts` | 不变式校验族 | 校验，非策略 |

**为什么这条判定重要**

1. **B-05 归属不变**：`threshold 0.8 / retain 0.16`、摘要调用、溢出恢复臂**全部在 `compaction-basic`**。旧卡把锚点写在 `dsh-compaction-basic` 名下是**正确的**。
2. **但旧〔映〕表把 B-05 的锚点记在 `dsh-compaction lib/types/`** —— 那是**seam 包**（`README` §二 B-05 行）。**这是一个需要修正的历史记录**：`config/region/summarizer` **从来不在** `dsh-compaction`，而在 `dsh-compaction-basic`。（**事实**：本断面确认 seam 包无 `config.ts`/`region.ts`/`summarizer.ts`，见上表 6 文件清单。）
3. **对 SynovaAgent 的移植含义（推断）**：seam 与实体分离意味着**可以只借 seam 的接口与事件契约，而换掉实体**（例如换成中文优化的摘要器、或换成非 LLM 的确定性压缩）。这是 0.1.7 留给我们的**真实可插拔缝隙**，且 `compaction-basic/src/index.ts:236-246` 明确 `summarize()` 是 "sole subclass customization hook"。
4. **`compaction/summary-error` waterfall** 是另一个官方扩展点：`compaction-basic/src/index.ts:442` `this.ctx.waterfall('compaction/summary-error', { session, sourceEventSeqs, error, signal }, () => false)`（默认返回 `false`）。

---

## 三 汇总表（一页速查）

| B# | 旧锚点（npm 包 + lib 文件 + 符号） | 新源码路径 `file:line` | 符号是否存在 | 语义是否变化 | 判定 |
|---|---|---|---|---|---|
| **B-01** | `dsh-llm` `lib/types/error.js` 四码 | `packages/llm/llm/src/error.ts:25/28/39/48` | 是（4/4） | 否 | **位移** |
| B-01 | 同上 设计注释 | `llm/src/error.ts:14` | 是 | 否（逐字） | **命中** |
| B-01 | 同上 `isXxxError` 守卫族 | —（只有 `error.ts:80/94/161`，其中 2 个是字符串正则分类器） | **否** | **是（实质）** | **位移＋警示** |
| B-01 | `dsh-llm` `lib/types/adapter-failure.js` `normalizeLlmFailure` | `llm/src/adapter-failure.ts:16` | 是 | 否（已加固） | **位移** |
| B-01 | （旧卡未记）第 5 码 | `llm/src/error.ts:172` | 是 | — | **新增确认** |
| **B-02** | `dsh-llm-retry` `lib/index.js` `inject=["agents","sessionProjections"]` | `llm-retry/src/index.ts:22` | 是 | 否 | **命中** |
| B-02 | 退避公式 ± jitter | `llm-retry/src/index.ts:59-64` | 是 | **微变**（先抖动后截断；指数夹 1024） | **位移** |
| B-02 | 先 append 意图→等待→append started | `llm-retry/src/index.ts:188/189/190` | 是 | 否 | **命中** |
| B-02 | `dsh-llm` `lib/types/retry-policy.js` `maxRetries=5` | `llm/src/retry-policy.ts:14` | 是 | 否 | **位移** |
| B-02 | `retryableCodes` 默认词表 | `llm/src/retry-policy.ts:18-24` | 是 | 否（词表逐字一致） | **位移** |
| B-02 | `RetryPolicySchema` | `llm/src/retry-policy.ts:100` | 是 | **是**（→ `normal`/`always` 联合） | **位移** |
| **B-03** | `dsh-token-meter` `lib/types/estimate.js` `CHARS_PER_TOKEN=4` | `token-meter/src/estimate.ts:13` | 是 | 否（未导出） | **位移** |
| B-03 | block overhead 4 | `token-meter/src/estimate.ts:16` | 是 | 否（未导出） | **位移** |
| B-03 | （旧卡未记）`ROLE_OVERHEAD` | `token-meter/src/estimate.ts:19` | **是** | **新增维度** | **新增确认** |
| B-03 | 四桶 `uncachedInput/output/cacheRead/cacheWrite` | `token-meter/src/usage-projection.ts:14-19`、`:21-26`、`:45-50` | 是 | 命名加 `Tokens` 后缀 | **位移** |
| B-03 | `bucketsFrom` | `token-meter/src/usage-projection.ts:21` | 是 | 否 | **位移** |
| B-03 | `usage/surface-projection.js` plan/commit | `token-meter/src/surface-fold.ts:107` / `:136` | 是 | **文件位移＋语义限定**（异常安全，非成本两段式） | **位移** |
| B-03 | `projectedTokens` 外推 | `token-meter/src/usage-projection.ts:69/73/215`、`projection.ts:45` | 是 | 语义收窄（明示不可用于占用判定） | **位移** |
| （旧卡未记）退避上限常量 | `packages/util/timeout/src/index.ts:25` `MAX_TIMER_DELAY_MS = 2_147_483_647` | 是 | — | **新增确认** |
| **B-04** | `dsh-compaction-tool-result-pruner` `lib/index.js` `DEFAULTS{8192,4096,1024}` | `compaction-tool-result-pruner/src/config.ts:10`（值 `:11-13`） | 是 | 否 | **位移**（确认拆到 `config.ts`） |
| B-04 | `PRUNE_MARKER` | `config.ts:7` | 是 | 否 | **位移**（旧记 L8，实为 L7） |
| B-04 | `codePointLength` | `config.ts:27` | 是 | 否 | **位移** |
| B-04 | "replay-safe" 派生式修剪 | `index.ts:2`（词组）＋`:145-150`（机理）＋`:165-171`（回放字段） | 是 | 否 | **位移** |
| B-04 | （旧卡未记）依赖 `tokenMeter` ＋ 发影子价格 | `index.ts:47`、`:160-164` | **是** | **B-04↔B-03 硬耦合（新增）** | **新增确认** |
| **B-05** | `dsh-compaction-basic` `lib/types/{config,region,summarizer}.js` | `compaction-basic/src/config.ts`/`region.ts`/`summarizer.ts`（＋`types.ts`） | 是 | 否（＋1 文件） | **命中** |
| B-05 | threshold `0.8` / retain `0.16` | `compaction-basic/src/config.ts:20` / `:23` | 是 | 否（均未导出） | **位移** |
| B-05 | 事件 `compaction/start\|summary\|end` | 发射 `region.ts:210`/`:491`/`:237`·`:245`；类型 `compaction/src/types.ts:24/34/72` | 是 | **拆包**（发射在 `-basic`，类型在 seam） | **位移** |
| B-05 | 影子价格 `shadowedTokenCount` | 定义 `compaction/src/types.ts:40/88/119`；产出 `region.ts:380/500/520`；消费 `surface-projection.ts:69/75` | 是 | 否 | **位移** |
| B-05 | 摘要复用前缀保 KV-cache | `summarizer.ts:30`（＋`region.ts:532-539`、`index.ts:238-240`） | 是 | 否 | **命中** |
| B-05 | 溢出恢复臂 `failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE` | `compaction-basic/src/index.ts:194` | 是 | 否（＋`maxOverflowRetries` 上限 `:200`，schema `:89`） | **命中** |
| B-05 | `compaction/start` durable 锁＋稳定复查 | 锁：`compaction/src/types.ts:20-23`＋`invariant.ts`；复查：`region.ts:211-214`/`:233`/`:236` | 是 | **一拆三** | **位移** |

**分布：命中 6 / 位移 16 / 被上游取代 0 / 已消失 0。**

## 四 反例与失效条件

### 0 「浅克隆限制」—— 本断面不能用 `git log` 做任何历史/归属判断（**自查发现并已修正**）

**复现命令与输出**

```bash
cd /Users/wane/src/deepseek-harness-017
git rev-parse --is-shallow-repository   # → true
git rev-list --count HEAD               # → 1
git log --oneline | wc -l               # → 1
```

- **事实**：`R` 是**单 commit 浅克隆**。`git rev-parse HEAD` 与 `git log -1 --format='%H %s %ad'` 仍然**可靠**（HEAD 元数据是真的）。
- **事实**：但 `git log -- <path>` 在只有一个 commit 的情况下，**必然**返回那个 commit —— 它**不能**证明"该文件未被改动过"，也**不能**证明"某符号是新增的"。
- **自查与修正**：本报告初稿在 §四 推翻条件 ⑥ 用过 `git log -1 -- packages/llm/llm/src/error.ts` = `00102833` 作为"文件未被后续提交改动"的证据。**该推理无效，已改为 mtime 对比**（`src/error.ts` = `Sep 22 23:45` 早于 `lib/` 的 `Sep 23 01:18`，且 `git status` 净）。
- **连带影响（必须继承的纪律）**：本件凡涉及 **"某某是新增的"** 的论断（§四.1b 的三项新增、`ROLE_OVERHEAD`、`always` 模式、B-04↔B-03 耦合），其**证据一律来自旧文档的文字记录**，**不来自 git 历史**。旧断面已不可达 → 这三项新增的**历史首次出现版本无法用本断面确证**（见 §五.#1）。
- **来源**：此限制由姊妹件 [DSH锚点重核-0.1.7-alpha.2源码树.md](DSH锚点重核-0.1.7-alpha.2源码树.md)（B-11…B-15 分册，同一断面）发现并已在其 U1 登记；本件独立复跑上述三条命令确认，并在本件内部完成修正。

---

### 1 「源码树与 tarball 断面的差异」

**（a）哪些锚点在 tarball 断面存在但源码树里没有？—— 未发现此类。**

本件逐项复核后，**B-01…B-05 的每个锚点符号在源码树中都找得到对应物**，无一项"仅在打包产物中存在"。上一版零命中的两个符号（`isEmptyResponseError`/`isInvalidCredentialError`）**在两侧都不存在**，因此它们是**卡片描述错误**，不是断面差异。

**（b）反方向的差异（源码树有、旧 tarball 断面无）—— 3 项，全部是 0.1.7 新增**

| 新增项 | 源码位置 | 旧断面（0.1.2-rc.1 / 0.1.6-alpha.2） |
|---|---|---|
| `ROLE_OVERHEAD` | `token-meter/src/estimate.ts:19` | 旧卡只记 `CHARS_PER_TOKEN` ＋ block overhead；**此为新增计价维度** |
| `RetryPolicyConfig` 的 `mode:'always'` 无界模式 | `llm/src/retry-policy.ts:49-54`、`:94-97`、`:100` | 旧卡只记"单一 `RetryPolicySchema` ＋ maxRetries=5" |
| 修剪器 ↔ token meter 的硬依赖 ＋ `compaction/prune` 影子价格事件 | `compaction-tool-result-pruner/src/index.ts:47`、`:160-164`；事件类型 `compaction/src/types.ts:82-89` | 旧卡把 B-04 记为**纯本地字符裁剪**（无计价依赖） |

**（c）本次复核暴露的最重要差异 —— 断面污染（这是上一版错误的根因）**

- **事实**：源码树里**同时存在** `src/*.ts`（跟踪）与 `lib/**/*.js`（`.gitignore:7` 忽略、本机构建产物）。实测：`git check-ignore -v packages/llm/llm/lib/index.js` → `.gitignore:7:lib/`；`git ls-files packages/llm/llm` 只列 `src/`＋`tests/`＋配置，**不含 `lib/`**。
- **事实**：本机 `lib/` 是 **2026-09-23 01:18** 的构建，晚于 HEAD 提交（09-22 23:45），且 `lib/types/error.js` 内容与 `src/error.ts` 一致（`CONTEXT_WINDOW_EXCEEDED_CODE` 在 `lib` 的 L22、`IMAGE_OFFLOAD_REQUIRED_CODE` 在 L152）。
- **推断**：`lib/` 的**行号与 `src/` 必然不同**（`error.js` L22 vs `error.ts` L25）。**任何用 `lib/*.js` 行号建立的锚点，一旦断面换成 `src/*.ts`，行号必然漂移。** 这正是本件"位移"占 16 项中的多数成因。
- **可复现的对照实例**：`PRUNE_MARKER` 旧记 `lib/index.js:8`，本断面 `src/config.ts:7`；`DEFAULTS` 旧记 `lib/index.js:11`，本断面 `src/config.ts:10`（值在 `:11-13`）。**旧卡的行号其实是"值所在行"，新树的行号是"对象声明行"** —— 差异来自**配置被抽到独立文件**，不只是文件重命名。

**（d）物理断面已不可达（硬限制）**

两个旧断面（`0.1.2-alpha.2`、`0.1.2-rc.1`）**均已不在磁盘**。因此**"tarball 断面存在/源码树没有"这类判断，本件无法用对拍证明** —— 只能依据旧文档的文字记录。**这是本件最实质的取证限制**，见 §六。

### 2 「会推翻本表的条件」

| # | 条件 | 现状检查 | 结论 |
|---|---|---|---|
| ① | **符号在多文件重复定义** → 单一 `file:line` 会误导 | 已逐符号普查（见下方命令）：19 个 B-01…B-05 关键符号**各只有 1 处定义** | ✅ **不推翻** |
| ② | **`lib/` 产物被误当源码** | 已用 `git check-ignore` 证明 `lib/` 被忽略；`git ls-files` 证明非跟踪 | ✅ **已排除**（并已在 §四.1c 单列，因为它才是上一版的根因） |
| ③ | **codegen 生成文件** | 对 `packages/llm`、`packages/compaction` 全 `src/*.ts` 检索 `DO NOT EDIT`/`auto-generated`/`@generated`/`This file is generated` → **零命中** | ✅ **不推翻** |
| ④ | **条件导出（双入口 `import`/`require`）** | 六包 `package.json` 的 `exports` 均为单一条目 `{types, default}`，无 `"import"`/`"require"` 条件分支；`main` 一律 `lib/index.js` | ✅ **不推翻** |
| ⑤ | **`.ts` 扩展名导入导致 `src/` 与 `lib/` 双解析** | 六包 `exports` 均含 `"./src/*": "./src/*"` 之类的直通导出（如 `compaction/package.json`），**源码与产物均可被外部引用** | ⚠️ **部分成立**：作为**库消费者**（如 SynovaAgent 经 npm 引用）看到的是 `lib/`，行号按本表的 `.ts` 行号**对不上**。**本表只适用于"读源码树"场景** |
| ⑥ | **HEAD 之后有新提交改动这些文件** | `git status` 净；`packages/llm/llm/src/error.ts` 的 mtime（`Sep 22 23:45`）**早于** `lib/` 构建（`Sep 23 01:18`） | ✅ **不推翻**（断面自洽）。**⚠️ 本项不能用 `git log` 证明** —— 见 §四.3 浅克隆限制 |
| ⑦ | **构建产物与源码不同步** → 我用 `.ts` 结论描述运行行为会错 | 本机 `lib/` 晚于 HEAD 构建，且 `error.js` 与 `error.ts` 内容对应 | ⚠️ **未做全量对拍**，见 §六 |

**①的复现命令：**

```bash
for s in CONTEXT_WINDOW_EXCEEDED_CODE QUOTA_EXCEEDED_CODE EMPTY_RESPONSE_CODE \
         INVALID_CREDENTIAL_CODE IMAGE_OFFLOAD_REQUIRED_CODE normalizeLlmFailure \
         RetryPolicySchema DEFAULT_MAX_RETRIES DEFAULT_RETRYABLE_CODES \
         CHARS_PER_TOKEN BLOCK_OVERHEAD ROLE_OVERHEAD DEFAULTS PRUNE_MARKER \
         codePointLength DEFAULT_THRESHOLD_RATIO DEFAULT_RETAIN_RATIO \
         planSurfaceTokens commitSurfaceTokens; do
  n=$(grep -rn "^\(export \)\?\(const\|function\|class\) $s\b" --include=*.ts packages/*/*/src/ | wc -l)
  printf "%-32s defs=%s\n" "$s" "$n"
done
# 全部输出 defs=1
```

**②的复现命令：**

```bash
git check-ignore -v packages/llm/llm/lib/index.js   # → .gitignore:7:lib/	packages/llm/llm/lib/index.js
git ls-files packages/llm/llm | grep -c '^packages/llm/llm/lib/'   # → 0
```

---

## 五 未核实项（**"未核实" ≠ "已排除"**）

| # | 未核实项 | 为什么没核 | 影响 |
|---|---|---|---|
| 1 | **两个旧物理断面（`0.1.2-alpha.2` / `0.1.2-rc.1`）的逐字对拍** | 断面已不在磁盘（现桌面为 0.1.6/0.1.7） | "位移 vs 命中"的判定依据是**旧文档的文字记录**，不是实物。若旧文档本身记错（B-01"守卫族"已证实记错）→ 相关行号的"差 1"结论（如 `PRUNE_MARKER` L8→L7）**脆弱** |
| 2 | **本机 `lib/` 与 `src/` 的全量字节级一致性** | 只抽查了 `llm/llm/lib/types/error.js` 一处（两码位置相符）；未逐包 diff | 若某包 `lib/` 滞后于 `src/`，则"运行行为"与本表描述可能不一致。**本表的对象是源码树，不是运行态** |
| 3 | ~~**`packages/compaction/image-offload` 是否为独立包**~~ | **✅ 已核实（2026-09-23，补）**：`packages/compaction/compaction-image-offload/` **存在** | 已关闭 —— 它正是 `compaction/summary-error` 的订阅者（见 #4），与 `error.ts:169` 注释所述一致 |
| 4 | ~~**`compaction/summary-error` waterfall 的全部订阅者**~~ | **✅ 已核实（2026-09-23，补）** | 见下方补核 |
| 5 | **B-02 的 `always` 无界模式在真实 provider 上的行为** | 需运行；本件只读 | 影响"无界重试是否会打爆成本"的判断。**建议列为 B-02 移植前必测项** |
| 6 | ~~**`MAX_TIMER_DELAY_MS` 的具体数值**~~ | **✅ 已核实（2026-09-23，补）**：`packages/util/timeout/src/index.ts:25` = `2_147_483_647`；包名 `@deepseek-ai/dsh-timeout` | 已关闭 —— 即 Node `setTimeout` 的 32 位上限；`maxDelayMs` 默认 10s 远低于它，**schema 上限形同虚设** |
| 7 | **`ctx.sessionProjections` 的实现与持久化位置** | 属 B-07 范围；本件只核到 B-02 的注册调用 | B-02 与 B-07 的耦合未完全展开 |
| 8 | **`toolPairingBalancedBefore/After` 的配对语义** | 只核到 `compaction/src/tool-pairing.ts:112/124` 的存在与导出 | B-05 借用时"tool call/result 必须成对"这一约束的强度未评 |
| 9 | **`isXxxError` 守卫族"曾经存在过"吗？（历史存在性）** | **浅克隆（1 commit）→ `git log` 不可用于历史判断**（§四.0） | 本件只能证明 **0.1.7-alpha.2 断面不存在**这两个符号，**不能证明**它们在 0.1.2-alpha.2 断面是否曾经存在。若旧卡作者确曾见到，则属"**被上游取代（已删除）**"而非"从未存在"——**两种情况的借鉴结论不同**（前者说明官方主动否弃了该模式，后者说明卡片记错） |
| 10 | **`ROLE_OVERHEAD`／`always` 模式／B-04↔B-03 耦合的"首次出现版本"** | 同上：旧断面不可达 ＋ 浅克隆 | §四.1b 的三项"新增"只能确证在 0.1.7 存在，**不能确证始于哪一版** |

---

### 补核：`compaction/summary-error` waterfall 的订阅者（原 §五.#4 关闭）

**复现命令与输出摘要**

```bash
grep -rn "compaction/summary-error" --include=*.ts packages/ | grep -v '/lib/'
```

| 角色 | `file:line` |
|---|---|
| **接口声明**（waterfall 类型） | `packages/compaction/compaction/src/index.ts:106` |
| **发射方**（默认返回 `false`） | `packages/compaction/compaction-basic/src/index.ts:442` |
| **订阅方（真正的消费者）** | `packages/compaction/compaction-image-offload/src/index.ts:33` `ctx.on('compaction/summary-error', ({session, sourceEventSeqs, error, signal}, next) => …)` |
| 第三方目录镜像 | `packages/extensions/tool-cordis/src/api-catalog.ts:3789-3791`（工具目录自动镜像，非逻辑） |
| 测试 | `compaction-image-offload/tests/image-offload.spec.ts:132`、`:390` |

> **结论（对 B-05 能力边界的影响）**：`compaction/summary-error` 是 **`compaction-basic` 与 `compaction-image-offload` 之间的正式扩展点**：摘要因图片过多失败时，`image-offload` 有机会**卸载最旧的图片再从新表面重试**，而 `-basic` 的 `recover` 默认返回 `false`（不接管）。
> 这补齐了 B-01 第 5 码 `IMAGE_OFFLOAD_REQUIRED_CODE` 的完整生命周期：**码（`llm/src/error.ts:172`）→ 事件（`compaction/summary-error`）→ 承担者（`compaction-image-offload/src/index.ts:33`）**。
> **这同时是一条 B-01 与 B-05 的跨卡耦合**，旧卡分列两处，未记录该回路。

**至此 §五 未核实项由 8 项降至 5 项**（余 #1 旧断面不可达、#2 `lib/`↔`src/` 全量对拍、#5 `always` 模式实测、#7 投影实现、#8 tool-pairing 语义 —— 其中 #1/#2 为结构性限制）。

---

## 六 置信度自评：**高**

**理由（为什么给"高"）**

1. **断面已三重钉死**：HEAD 哈希、版本三处一致、`git status` 零脏 —— 四项独立指标与派单方前置事实**逐项吻合**。
2. **全部 19 个关键符号的 `file:line` 均由 `grep -n`／`sed -n` 直接产出**，非记忆或推断；每条均附可复现命令。
3. **负对照做了**：B-01 的两个"不存在"符号，在 `src/` 与 `lib/` **双侧为零**；并额外普查了 `isRateLimitError`/`isServerError`/`isTimeoutError` 同样为零 —— **排除了"符号其实在别处"的可能**。
4. **反例检查做了四项**：重复定义（19/19 唯一）、codegen（零命中）、条件导出（无分支）、`lib` 污染（已证明被 gitignore 并可判别）。

**为什么不给"极高"（四条扣分项）**

1. **浅克隆 → 历史维度整体缺失**（§四.0）。`git rev-list --count HEAD` = **1**，因此**所有"曾经存在／新增／删除"的判断都不能用 git 证明**。这直接削弱了两类结论：`isXxxError` 是"从未存在"还是"被官方删掉"（§五.9），以及三个"新增项"始于哪一版（§五.10）。**这是本件最实质的证据缺口**——而且它是**继承性的**（同一断面的姊妹件已登记，本件复核确认）。
2. **旧断面不可达**（§五.1）→ "位移 vs 命中"的**基线**来自文档而非实物。这是**结构性限制**，无法通过更多检索消除。
3. **一处曾出现工具误导**：我用 `awk` 重编号 `sed` 区间输出时产生了错行（`types.ts` 的显示行号与真实行号偏移），**已弃用该方法并改用 `grep -n`／`sed -n` 直接确认**。表中所有行号均出自后者。**此风险已在过程中拦截，但说明"行号复现"这一步不能靠显示工具。**
4. **未做 `lib/` ↔ `src/` 全量一致性对拍**（§五.2）→ 本表**只描述源码树，不担保运行态**。

> **置信度分档（避免一个数字掩盖差异）**：
> | 结论类别 | 置信度 | 依据 |
> |---|---|---|
> | **文件路径 + 行号 + 符号存在性**（本表主体的 22 行） | **高** | 全部由 `grep -n`／`sed -n` 直接产出，附可复现命令，且 19/19 符号定义唯一 |
> | **"符号不存在"类否定结论**（`isEmptyResponseError` 等） | **高** | `src/` ＋ `lib/` 双侧为零，并做了 3 个同形符号的扩展普查 |
> | **属性"新增/变化"类结论**（`ROLE_OVERHEAD`、`always`、B-04↔B-03 耦合） | **中** | 依赖旧文档文字记录；浅克隆致历史不可证 |
> | **"从未存在"vs"被删除"的历史判定** | **低** | 浅克隆 ＋ 旧断面不可达，二者叠加 |

**给下游的硬约束（若引用本表）**

- 引用行号时**必须同时引用 `src/` 路径**；若你手上的 DSH 是 npm 安装产物（`node_modules/@deepseek-ai/*/lib/*.js`），**本表行号一律不适用**，需按 `file` 名重新定位（示例：`error.ts:25` 对应 `lib/types/error.js:22`）。
- 引用"守卫族"三字时**必须改写**为"canonical 码 ＋ 正则分类器"两层，否则会把借鉴卡的错误表述继续传下去。
- **不得把本表的"新增"读作"官方在 0.1.7 才加的"**——只能说"在 0.1.7-alpha.2 存在、在旧文档记录的旧断面未见"。要查首次出现版本，必须换一个**完整克隆**的断面。

---

## 七 对借鉴卡的净效应（技术线结论）

> 本节按技术线纪律给「能做 / 不能做 / 不该做」三选一，不罗列方案。

| 卡 | 净判定 | 依据（本表证据） | 移植前必改的一处 |
|---|---|---|---|
| **B-01** | **现在能做** | 四码＋注释＋`normalizeLlmFailure` 全部在源码树可读、语义无漂移；加固逻辑（防 SDK accessor trap）正是我们要的 | 把"守卫族"改写为**「canonical 码（出站路由）＋ 正则分类器（入站归类）」两层**，并接受分类器**必然有误判率** |
| **B-02** | **现在能做**（`always` 模式除外） | inject／三段 append／词表／schema 全部逐字命中，可直接照抄 | **`always` 无界模式建议先不抄**：成本上限不可控，且本件未验证真实行为（§五.5）。先抄 `normal` 有界模式 |
| **B-03** | **现在能做，但不该直接用于中文计费** | 常量与四桶机制清晰；但 `CHARS_PER_TOKEN=4` 是**拉丁文密度假设**，且 DSH 自己把 `projectedTokens` **排除在占用判定之外**（理由明写：低估 CJK） | **中文场景必须先实测密度并替换常量**；`projectedTokens` 可作趋势观测，**不可作计费或硬闸门** |
| **B-04** | **现在能做** | 四项命中，`replay-safe` 机理（`deriveEventMessage` ＋ `sourceEventSeqs`）清晰且值得整套照抄 | **必须连带移植 B-03 的 token meter**（`index.ts:47` 硬依赖），否则影子价格事件无法发射 —— 这两张卡在 0.1.7 里**不能拆开移植** |
| **B-05** | **现在能做，且 seam/实体分离给了我们真实的替换缝隙** | 四件套在 `-basic`；seam 包只放接口与事件契约；`summarize()` 是官方明示的"sole subclass customization hook" | 摘要调用**必须保持"指令作为最后一条 user message"**（`summarizer.ts:26-31`），改成独立 system prompt **会直接废掉 KV cache** |

**一句话给产品线**：B-01…B-05 在 `0.1.7-alpha.2` 源码树上**没有一项"已消失"或"被上游取代"** —— 五张卡的技术前提**全部成立**。真正的风险不在"锚点找不到"，而在三处**卡片描述与源码的偏差**：B-01 的"守卫族"、B-03 的 plan/commit 语义混用、B-04↔B-03 的隐式耦合。**照卡抄会抄错这三处。**

---

## 附：本件执行的部分命令（复现清单）

```bash
R=/Users/wane/src/deepseek-harness-017
cd $R && git rev-parse HEAD && git log -1 --format='%H %s %ad' --date=iso && git status --porcelain | wc -l
grep -n '"version"' package.json apps/desktop/package.json apps/web/package.json

# B-01
grep -rn '^export const [A-Z_]*_CODE =' --include=*.ts packages/
grep -rn 'export function is' packages/llm/llm/src/
for s in isEmptyResponseError isInvalidCredentialError; do grep -rn "$s" --include=*.ts packages/ | wc -l; done

# B-02
grep -rn "inject" --include=*.ts packages/llm/llm-retry/src/
grep -n 'localDelay' -A6 packages/llm/llm-retry/src/index.ts
grep -n "append('llm/retry" packages/llm/llm-retry/src/index.ts

# B-03
grep -rn 'CHARS_PER_TOKEN\|BLOCK_OVERHEAD\|ROLE_OVERHEAD\|bucketsFrom\|projectedTokens\|planSurfaceTokens\|commitSurfaceTokens' packages/llm/token-meter/src/

# B-04
grep -rn 'PRUNE_MARKER\|codePointLength\|8192\|4096\|1024' packages/compaction/compaction-tool-result-pruner/src/

# B-05
grep -n 'DEFAULT_THRESHOLD_RATIO\|DEFAULT_RETAIN_RATIO' packages/compaction/compaction-basic/src/config.ts
grep -rn 'session.append(' packages/compaction/compaction-basic/src/
grep -rn 'shadowedTokenCount' --include=*.ts packages/
grep -rn 'KV cache\|prefix cache' packages/compaction/compaction-basic/src/
grep -n 'CONTEXT_WINDOW_EXCEEDED_CODE' packages/compaction/compaction-basic/src/index.ts

# seam vs 实体
grep -n '"name"\|"description"' packages/compaction/compaction/package.json packages/compaction/compaction-basic/package.json

# 反例检查
git check-ignore -v packages/llm/llm/lib/index.js
git ls-files packages/llm/llm | grep -c '^packages/llm/llm/lib/'
find packages/llm packages/compaction -path '*/src/*' -name '*.ts' | xargs grep -ln 'DO NOT EDIT\|auto-generated\|@generated'
```

---

**修订记录**

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-09-23 | 首版。断面从 tarball（`0.1.6-alpha.2`）纠正为**源码树**（`0.1.7-alpha.2`，HEAD `00102833`）；B-01…B-05 全部锚点换成 `.ts` 路径＋行号；B-05 归属判定澄清（seam vs `-basic`）；新增 §四.1c「断面污染」根因分析与 §七 净效应判定 |
