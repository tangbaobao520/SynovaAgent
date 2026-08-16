<!--
  SYNOVA-IMPL-D363: LLM 运行时 failover 接线（机制建成未接线，非从零实现）
  状态: dev doc | 2026-08-16 | 优先级 P1（K3 基础设施审计 P1-1，结论已修正）
  权威文档: AGENTS.md 铁律 5 + 铁律 0-2 接线验收 + K3 基础设施审计 AGENT-INFRASTRUCTURE-AUDIT-20260814.md P1-1
  依赖: 无
  并行: D355（L4 数据契约收敛，写集零交集——本任务 src/agent、src/l3、src/providers；D355 src/adapters、src/store、extensions/ontology）
-->

# D363: LLM 运行时 failover 接线

> 一句话问题：`createProviderChain`（registry.ts:26）已实现运行时 failover（try-catch 循环切换 provider）、CircuitBreaker 已接线（base.ts:81），但生产路径（diagnosis-engine、tool-loop-executor）**直接调单 provider.chat()，从不走 chain**——failover 机制建成但未接线（M3），"DeepSeek 挂了自动切 OpenAI"在生产中不成立。

## 1. 权威文档引用

**来源**: [AGENTS.md 铁律 5](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律 5. 后端能力 ≠ 用户可用的功能。追踪调用链：谁 import？谁调用？结果在哪呈现？

**来源**: [AGENTS.md 铁律 0-2](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律 0-2. 测试先行 + 接线验收——Step 5 WIRE CHECK 是硬门禁：`grep -rn "新函数名" src/` 零结果 = 未完成。

**来源**: [K3 基础设施审计 P1-1](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\audit-reports\AGENT-INFRASTRUCTURE-AUDIT-20260814.md)

> P1-1：LLM 网关无运行时 failover……（**本次审计修正**：K3 说"failover 代码不存在"不准确——见 §2 实测，真实问题是 failover 机制建成但未接线）。

## 2. 代码审计——现状 (2026-08-16 实测)

### 2.1 缺陷 A (P1): failover 机制建成但未接线（M3）

实测 [registry.ts](D:\novis-backup-20260526\Novis\synova-agent\src\providers\registry.ts)：

- `:26` `createProviderChain` **已实现运行时 failover**——`chat()` 内 `for (const p of providers) { try { return await p.chat() } catch { 尝试下一个 } }`，全部失败抛 `所有 Provider 均失败`。
- `:122` `getHealthyProvider()`、`:135` `buildChain()`（健康优先排序）——**全仓 grep 零生产调用方**（只有定义，无 `.buildChain()`/`.getHealthyProvider()` 调用）。
- `:144` `buildChain` 内部调 `createProviderChain(all)`——但 buildChain 本身零调用 → chain 从未被生产使用。

实测 [base.ts](D:\novis-backup-20260526\Novis\synova-agent\src\providers\base.ts)：

- `:81` `new CircuitBreaker({ threshold: 5, cooldownMs: 30_000 })`、`:87` OPEN 时抛错——**CircuitBreaker 已接线**（K3 说"无 circuit breaker"不准确）。

### 2.2 缺陷 B (P1): 生产路径直接调单 provider.chat()，不走 chain（且两套接口并存）

实测生产调用点（**注意：两个生产路径用不同接口**）：

| 文件 | 实测 | 接口类型 | 问题 |
|------|------|---------|------|
| [tool-loop-executor.ts:42](D:\novis-backup-20260526\Novis\synova-agent\src\agent\tool-loop-executor.ts) | `await provider.chat(messages, ...)` | `LLMProvider`（ctx.provider，engine-context.ts:19） | 单 provider 直接调，可接 chain |
| [synova-diagnosis-engine-impl.ts:299](D:\novis-backup-20260526\Novis\synova-agent\src\l3\synova-diagnosis-engine-impl.ts) | `await this.llm.chat(messages, ...)` | `LLMClient`（synova-diagnosis-engine.ts:368，简化接口 `{role,content}→{content,toolCalls}`） | **接口不兼容**，不能直接换 createProviderChain |

> **两套接口并存（关键）**：`LLMProvider`（providers/types.ts:74，`chat(LLMMessage[])→ChatResult`）与 `LLMClient`（synova-diagnosis-engine.ts:368，`chat({role,content})→{content,toolCalls}`）是**两个不同接口，全仓无适配层**。createProviderChain 只兼容 LLMProvider。

## 3. 实现方案

### 3.1 写集 (1 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/agent/conversation-engine.ts](D:\novis-backup-20260526\Novis\synova-agent\src\agent\conversation-engine.ts) | 修改 | provider 注入处（constructor 接收 LLMProvider，:299）——单 provider → `createProviderChain([主, 备])`，使 tool-loop-executor 消费的 ctx.provider 变为 chain |
| [tests/contract/llm-failover.test.ts](D:\novis-backup-20260526\Novis\synova-agent\tests\contract\llm-failover.test.ts) | 新建 | 故障注入测试（mock 主 provider 抛错 → 断言 chain 切换到备用） |

> **共享资源标注**（S-8）：无 VERSION.md/current-brief 等共享资源；本任务与 D355 写集零交集（D355 动 src/adapters、src/store、extensions/ontology），可并行。

### 3.2 修复模式（最终实现 — S-6 回填 2026-08-16）

生产路径从单 provider 改为 failover chain。最终实现与 §3.1 草图同向（直接 createProviderChain 注入，未采用 buildChain），比草图多两个必要组成：

1. **healthCheck 契约适配**（wrapProviderWithFailover）：chain 的 `healthCheck()` 返回 `HealthCheckResult[]`（registry.ts:71），而 `LLMProvider` 契约（types.ts:74）与生产消费方 [context-engine.ts:274](D:\novis-backup-20260526\Novis\synova-agent\src\orchestrator\context-engine.ts) 的 `result.healthy` 单值契约不兼容——裸传 chain 会破坏 ContextEngine。适配层显式聚合：任一 provider 健康即链可用，全不健康返回主 provider 错误（无 as any，铁律 38）。
2. **备用 provider 来源**（buildFallbackProvider）：6 个生产构造点（cli/tui-v2/chat/mcp/im-inbound/fromState）单点 constructor 派生——`detectProviderFromUrl(主.baseUrl)`：主 deepseek → 备 openai（OPENAI_API_KEY）；主非 deepseek → 备 deepseek（LLM_API_KEY/DEEPSEEK_API_KEY）。凭据缺失 → null + `log.info 'failover 未启用'`，保持单 provider 行为与修复前完全一致（不静默单飞）。`EngineConfig.fallbackProvider` 为显式注入缝（测试/未来调用方；null = 显式禁用）。

```typescript
// 修复前（tool-loop-executor.ts）：单 provider 直接调，失败即抛
const result = await provider.chat(messages, opts);

// 修复后（conversation-engine.ts 构造注入处）：注入 failover chain，主失败自动切备用
// constructor(provider, config) →
//   this.provider = wrapProviderWithFailover(provider,
//     config.fallbackProvider !== undefined ? config.fallbackProvider : buildFallbackProvider(provider));
// wrapProviderWithFailover = createProviderChain([主, 备]) + healthCheck 数组→单值聚合
const chain = wrapProviderWithFailover(primaryProvider, fallbackProvider);
const result = await chain.chat(messages, opts);
```

> S-6 回填完成：最终形态 = 直接 createProviderChain（非 buildChain，决策记录见 §4.5）+ healthCheck 契约适配 + 环境变量派生备用。本回填与代码实现同一次交付（同一 PR：docs commit 先行，代码 feat commit 紧随其后——DS5 要求代码 commit 恰为写集 1 修改 + 1 新建）。

### 3.3 不做的事

| 项 | 理由 |
|----|------|
| 不重写 createProviderChain（已有运行时 failover） | 已实现，只接线 |
| 不重写 CircuitBreaker（base.ts 已接线） | 已实现 |
| 不改 providers/detect.ts（启动时环境变量切换） | 启动检测与运行时 failover 是两层，本任务只做运行时 failover 接线 |
| 不做凭据池轮换（registry.ts CredentialPool） | 独立能力，非本任务 |
| 不接 synova-diagnosis-engine-impl.ts（this.llm 是 LLMClient） | LLMClient ≠ LLMProvider，需适配层，属独立任务（接口统一是跨模块决策） |

## 4. 测试要求 (测试优先)

> 第一步写测试（red）→ 第二步实现（green）。

| 层 | 类型 | 数量 | 覆盖 |
|----|------|:---:|------|
| 单测 | llm-failover.test.ts | ≥6 断言 | 主 provider 成功不切 / 主失败切备用 / 全失败抛错 / chain 名称含顺序 / stream 路径 failover / 故障注入（mock 抛错） |

**RED 必须覆盖失败模式**（S-5，CT-30 故障注入契约）：
- 场景（P1 复现）：mock 主 provider `chat()` 抛错 → 生产路径（单 provider）直接抛错无切换 → 修复后 chain 自动切备用并返回成功——"修复前主失败即抛 → 修复后自动切备用"。

## 4.5 决策参考

**决策点**：接线方式（直接 createProviderChain vs 走 ProviderRegistry.buildChain）。

**参考系**：第一性原理——buildChain 已实现健康排序，但零调用；直接 createProviderChain 最小改动即可接线；Anthropic——接线要"生产调用点真实传递"，不引入新抽象。

**结论**：先以最小改动接线（createProviderChain 注入生产路径），若需健康排序再升级到 buildChain。完成报告须含"决策记录"。

**决策记录（2026-08-16 落地回填，K3 可核）**：

- 决策点 1（接线方式）：**直接 createProviderChain 注入**，未采用 buildChain。参考：第一性原理（buildChain 需 await healthCheck 网络请求做健康排序，构造路径会阻塞；最小机制即可满足"DeepSeek 挂了自动切 OpenAI"）+ Anthropic 工程基线（生产调用点真实传递）+ DeepSeek（最少机制）。与初判一致。
- 决策点 2（备用 provider 来源，实现新增）：**constructor 内环境变量派生**（buildFallbackProvider）+ EngineConfig.fallbackProvider 注入缝。参考：第一性原理（6 个生产构造点逐一显式传入 = 6 倍改动面；单点派生最小机制）+ Anthropic（显式可验证——凭据缺失 log 显式记录"failover 未启用"，不静默）。
- 决策点 3（healthCheck 契约冲突，实现新增）：**显式聚合适配**（wrapProviderWithFailover 内数组→单值），未用 `as unknown as` 掩盖类型冲突。参考：铁律 38（as any 零容忍）+ 铁律 24/31（降级显式传播——任一健康即链可用，全不健康返回主 provider 错误）。

## 5. 接线要求

| 新接线 | 调用方 | 确认方式 |
|------|------|---------|
| createProviderChain 注入 provider 创建处 | conversation-engine.ts（provider 构造函数注入） | `grep -n "createProviderChain" src/agent/conversation-engine.ts` ≥1 处生产调用，且 tool-loop-executor 消费的 ctx.provider 变为 chain |

> 生产调用点必须（S-3）：createProviderChain 必须被 ≥1 个生产路径真实调用（conversation-engine 注入处），grep 验证；测试调用不计入。

## 6. 完成标准

- DS1: `grep -n "createProviderChain" src/agent/conversation-engine.ts` ≥1 处生产调用
- DS2: `npx vitest run tests/contract/llm-failover.test.ts` 全绿（≥6 断言，red 阶段已证：主失败→修复前抛错→修复后切换）
- DS3: `grep -rn "provider.chat" src/agent/tool-loop-executor.ts` 确认 tool-loop-executor 消费的 ctx.provider 是 chain（经 conversation-engine 注入），不再直接单 provider
- DS4: 审计基线不变：`python scripts/audit/audit-check.py --full | tail -2`（FAIL/WARN 数与 HEAD 基线一致，本任务纯接线无新增）
- DS5: `git diff --name-only HEAD~1..HEAD` 恰为写集 1 修改 + 1 新建（无越界）
- DS6: 真实 push 验证：`git log @{upstream}..HEAD` 为空（已推送）+ CI task-relevant jobs 绿（vitest/tsc；npm audit/Architecture 预存失败单独标注）

## 7. 自检清单

- [ ] 代码审计：createProviderChain 已实现 failover（registry.ts:26）、buildChain 零调用、CircuitBreaker 已接线（base.ts:81）——均 grep 实测，不是凭记忆
- [ ] **修正 K3 P1-1 误判**：failover 代码存在，真实问题是"未接线"（M3），dev doc 已如实标注，不是照抄 K3 的"代码不存在"
- [ ] 写集表格式符合契约（`### 3.1 写集` 标题后紧跟表格，无空行）
- [ ] 写集严格限定 Claude 线（src/agent/conversation-engine、tests/contract），与 D355 零交集可并行
- [ ] 测试 red→green 覆盖故障注入（主 provider 抛错→切换备用，CT-30）
- [ ] DS 每项可机器验证（grep/vitest/audit/git diff）
- [ ] §5 接线 ≥1 生产调用点（conversation-engine 注入处），LLMClient 路径（diagnosis-engine）明确排除（接口不兼容）
- [ ] 接线方式有决策记录（§4.5）
- [ ] 交付声明 DS 须与本 dev doc DS1..DS6 一一对应，缺项显式 descope
- [ ] 派发说明：与 D355 并行时，各自独立 worktree（D307 已落地），写集零交集，互不干扰
- [ ] 不用 --no-verify
