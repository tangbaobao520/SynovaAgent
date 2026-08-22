---
north-star:
  服务用户: FDE/企业主（对话诊断过程中的防跑偏受益者）+ 开发线（工具循环失控的守护者）——LLM 工具循环"重复调用同一工具/参数、无限转圈、单个工具卡死"会烧 token、拖垮诊断
  服务场景: ConversationEngine 的 tool-loop 里 LLM 反复调同一工具相同参数（改坏参数后仍重试）、或单次工具调用卡死（http/connector 无超时）——现状 ToolGuard 只有"连续 3 次硬阻断"，无分级提醒、无超时策略
  模块终态: tool-loop 有完整守卫链：① 超时策略（每工具可配 timeoutMs，超时 → TOOL_TIMEOUT 结构化结果不静默）② 循环卫生分级（同工具同参数 2 次提醒 → 3 次警告 → 5 次硬阻断，消息注入模型可见）③ 重复失败阻断（连续失败计数）——防跑偏 + 防卡死
  对齐北星: PRODUCT-BRIEF.md §五「全链路打通」+ §六 P0 哨兵真实数据流——诊断链路稳定是产品根基；工具循环失控 = 诊断半途而废，直接伤害 FDE 依赖
  完成标准: 入口 ConversationEngine tool-loop 真实触发 → 处理 超时策略 + 分级循环提醒 → 结果 卡死工具超时返回 TOOL_TIMEOUT（非静默挂起）+ 重复调用被提醒/阻断（测试可复现）
  当前进度: tool-loop-executor.ts 已有 ToolGuard 循环检测雏形（连续 3 次阻断 + 重复失败 3 次阻断 + 参数校验，tests/l3/tool-guard.test.ts 19 用例）；command-lanes 有 60s 超时隔离。缺口：① 无每工具超时策略（http 硬编码 30s，local/connector 无超时）② 循环卫生无分级提醒（只有硬阻断，无"提醒→阻断"阶梯）③ 超时/提醒无结构化结果类型
---

<!--
  SYNOVA-IMPL-DSH-D473: guard 循环卫生 + 超时策略（Stage1 D4，借鉴 B5）
  状态: dev doc | 2026-08-22 | 优先级 P1（Stage1 序 4）
  权威文档: 派发 Stage1-派发-devdoc-20260821.md Spec 4 + 施工图 DOC-0114 §3.5/§8 R6 + 借鉴清单 B5 + DSH guard 包族 README
  依赖: D460（已交付，llm-verifier）无；ToolGuard 已存在（复用不重造）
  并行: 与 D472（D2）/ D474（D3，原 D470）零文件交集；⚠️ src/agent/tool-loop-executor.ts + src/agent/tools.ts + src/l3/tool-guard.ts 属 TASK-ROUTING §四「src/ 其余业务归 Win Claude」区域，但 TASK-ROUTING §四 L115「Stage 1 D1-D4 范式借鉴归 Mac DSH」覆盖——实施前编码 session 须与 Win 核对写集（S-7/S-8 共享资源标注）
-->

# SYNOVA-IMPL-DSH-D473: guard 循环卫生 + 超时策略

> 一句话问题: tool-loop 有两个失控面：① **无超时策略**——`ToolRegistry.execute` 的 local 模式 `await tool.handler(params)` 裸执行（tools.ts:185），connector 模式同样无超时（tools.ts:196），http 模式硬编码 30s（tools.ts:208）——单个工具卡死 = 整个循环挂起，FDE 诊断卡在半路；② **循环卫生只有硬阻断**——ToolGuard 连续 3 次同工具同参数直接 deny（tool-guard.ts:101-106），无 DSH repeat-tool-reminder 的"分级提醒→阻断"阶梯（模型永远不知道"你在重复"，只知道"被拒绝了"）。借鉴 DSH guard 包族（B5：timeout-policy + repeat-tool-reminder），把单点守卫升级为策略层。

## 1. Authority Doc Verification

**来源**: [Stage1 派发文档](docs/synova/coordination/Stage1-派发-devdoc-20260821.md)（Spec 4 / D4）

> Spec 4：D4 guard（借鉴 B5）。借鉴点 guard 包族的 timeout-policy + repeat-tool-reminder；落地对象 `src/agent/tool-loop-executor.ts`（已有 ToolGuard 循环检测雏形）；补缺口防跑偏 + 超时（通用化控制塔）；验收循环卫生 + 超时策略。归属治理层，Mac DSH。

**来源**: [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§3.5 混合模块 + §8 R6）

> src/agent/ 通用面实际很小（conversation-engine/tool-loop-executor/main-agent/tools 基建）→ 拆分后 🟢 为主。R6：治理层独立排期；不因运行时迁移同时动门禁。

**来源**: [第六章借鉴清单 B5](docs/synova/research/Harness研究与Synova战略再定位-20260816/第六章-借鉴清单与走出自己的特色-20260816.md)（6.1 表 B5 行）

> guard（循环卫生 + 超时）——防跑偏 + 超时——通用化控制塔。落地方式：吸收 timeout-policy + repeat-tool-reminder。

**来源**: [dsh-tool-call-timeout-policy README](D:\deepseek-harness 或本机 DSH 安装)\@deepseek-ai\dsh-tool-call-timeout-policy\README.md（本机路径 /Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tool-call-timeout-policy/README.md）

> Tool-call timeout enforcer：每工具从 `ToolDefinition.timeoutMs` 读预算，超时 → 结构化 `TOOL_TIMEOUT` 结果 `{ isError: true, error: { name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT' } }`。零配置（预算在工具声明处）。

**来源**: [dsh-repeat-tool-reminder README](本机 DSH 安装)\@deepseek-ai\dsh-repeat-tool-reminder\README.md

> Advisory loop-breaker：`thresholds: [3, 5, 8]` 阶梯——首阈值短提醒，后续阈值详细提醒（工具名/连续次数/规范化参数），注入模型可见上下文，**决策留给模型**（不阻断）；被 deny 的调用也计数（锤被拒调用正是要断的循环）。

**来源**: [AGENTS.md 铁律](AGENTS.md)（11/24/31 降级纪律 + 47/48 契约优先）

> 铁律 24/31: catch 必须有 log + degraded；静默降级禁止。超时/提醒必须显式结构化，不静默。

## 2. Problem Statement

对齐施工图 §3.5（src/agent 通用面）+ C 线 S3-5 同源（控制塔防跑偏）。两个失控面：

1. **无超时策略（卡死 = 诊断停摆）**：`src/agent/tools.ts:185` local 模式 `return await tool.handler(params)`——工具 handler 卡死（如连接外部服务无响应），Promise 永不 settle，ConversationEngine 的 `provider.chat` 等待循环挂起，FDE 诊断卡在半路。connector 模式（:191-197）同样裸 await。http 模式硬编码 30s（:208）不可配。
2. **循环卫生无阶梯（模型不知道在重复）**：`src/l3/tool-guard.ts:101-106` 连续 3 次同工具同参数 → `{ allow: false, reason: '循环检测...' }` 硬阻断。模型只收到"工具被阻止"的 tool 结果，**不知道自己在重复、为什么被拒、该换什么策略**——DSH repeat-tool-reminder 的"提醒注入模型可见上下文"（让模型自己调整）是更优路径，硬阻断是最后手段。

对齐北星：诊断链路稳定性是产品根基（PRODUCT-BRIEF §五/§六）——工具循环失控直接伤害 FDE 依赖的"按需诊断"。

## 3. Current State（2026-08-22 grep/read 实测）

### 3.1 已存在（复用不重造）

| 资产 | 位置 | 状态 |
|------|------|------|
| ToolGuard 循环检测 | `src/l3/tool-guard.ts:96-106` | ✅ 同工具同参数连续 3 次 → deny |
| ToolGuard 重复失败 | `src/l3/tool-guard.ts:87-94` | ✅ 连续 3 次失败 → deny |
| ToolGuard 参数校验 | `src/l3/tool-guard.ts:80-85` | ✅ null/非对象 → deny |
| ToolGuard 测试 | `tests/l3/tool-guard.test.ts`（19 用例） | ✅ 已交付 |
| ToolGuard 接线 | `tool-loop-executor.ts:25 new ToolGuard()` + :94/:104/:214/:235 调用 | ✅ 两条路径（callLLMWithTools + streamWithToolLoop）均接线 |
| 循环轮次上限 | `tool-loop-executor.ts:36 MAX_TOOL_ROUNDS=3` / :152 MAX_ROUNDS=3 | ✅ 整体轮次兜底 |

### 3.2 缺陷 A（P1）: 无每工具超时策略

- `src/agent/tools.ts:185` local: `return await tool.handler(params)` — 无超时
- `src/agent/tools.ts:196` connector: `await connector.executeTool(name, params)` — 无超时
- `src/agent/tools.ts:208` http: `AbortSignal.timeout(30000)` — 硬编码 30s，不可配
- `src/agent/tools.ts:40-57` ToolDefinition — 无 timeoutMs 字段（契约缺口）

### 3.3 缺陷 B（P1）: 循环卫生无分级提醒（只有硬阻断）

- `tool-guard.ts:96-106` 连续 3 次同工具同参数 → 直接 `{ allow: false }` — 无提醒阶梯
- 模型收到的是 `内容: {"error":"工具被阻止: 循环检测..."}`（tool-loop-executor.ts:97）— 不知道自己在重复
- DSH repeat-tool-reminder 阶梯（[3,5,8] 提醒 → 模型自决）未借鉴

### 3.4 缺陷 C（P2）: 无结构化超时/提醒结果类型

- 无 `TOOL_TIMEOUT` 错误码类型（对照 DSH `ToolTimeoutError`）
- 无 `LoopReminder` 消息类型（对照 DSH 注入模型可见的 reminder user/message）
- tool-loop-executor 的 tool 结果一律 `JSON.stringify(execResult)`，无法区分"超时/提醒"与正常结果

## 4. What We Build

### 4.1 写集 (3 修改 + 1 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/agent/tools.ts](src/agent/tools.ts) | 修改 | ① ToolDefinition 加 `timeoutMs?: number` 契约字段（缺陷 A）② execute() 加超时包裹：local/connector 模式 `Promise.race`，超时 → 结构化 `{ error: { name:'ToolTimeoutError', code:'TOOL_TIMEOUT', message:'tool call timed out after <ms>ms' } }`（缺陷 A/C）③ 内联定义 `ToolTimeoutError` 类（error-types 包无超时专属类，见 §4.2） |
| [src/l3/tool-guard.ts](src/l3/tool-guard.ts) | 修改 | ① 循环检测改分级：2 次 → 返回 `reminder`（提醒注入，不阻断）/ 3 次 → `block`（硬阻断，**保持原 LOOP_THRESHOLD=3 语义**——tool-loop MAX_ROUNDS=3 内 5 次永远达不到，2026-08-22 修正）② ToolGuardDecision 加 `level?: 'reminder'|'block'` + `reminderMessage?: string`（缺陷 C）③ 保持 19 用例回归兼容 |
| [src/agent/tool-loop-executor.ts](src/agent/tool-loop-executor.ts) | 修改 | ① guardDecision.level === 'reminder' 时：将提醒消息作为 tool 结果注入（模型可见，不阻断执行，缺陷 B）② block 时才 `continue` 跳过（现逻辑）③ 超时结果传入 afterCall 计数（缺陷 C） |
| [tests/l3/tool-guard.test.ts](tests/l3/tool-guard.test.ts) | 修改 | 新增分级阶梯 + 提醒消息 + 超时契约测试（≥8 用例，见 §5） |

### 4.2 修复模式

**ToolDefinition.timeoutMs 契约（tools.ts:40-57 增加）**:

```ts
export interface ToolDefinition {
  // ...现有字段
  /** 单次调用超时（ms）。缺省：local/connector 无超时（保守，不改变现有行为）；
   *  声明后超时 → 结构化 TOOL_TIMEOUT 结果（对照 DSH timeout-policy，铁律 24/31） */
  timeoutMs?: number;
}
```

**execute 超时包裹（tools.ts:185 替换，local 模式示范）**:

```ts
// ToolTimeoutError 定义（2026-08-22 修正：error-types 包有 ToolExecError 但无超时专属类，
// 本卡在 tools.ts 内联定义，避免改 packages/error-types 包（归 Win 区域，跨包改动留待后续））
export class ToolTimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`tool call timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
  }
}

case 'local': {
  if (tool.timeoutMs && tool.timeoutMs > 0) {
    // 契约: 超时 → 结构化 TOOL_TIMEOUT（不静默挂起，铁律 24）
    return await Promise.race([
      tool.handler(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ToolTimeoutError(tool.timeoutMs!)), tool.timeoutMs)
      ),
    ]).catch((err) => {
      if (err instanceof ToolTimeoutError) {
        log.warn({ name, timeoutMs: tool.timeoutMs }, '工具调用超时 — TOOL_TIMEOUT');
        return { error: { name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT', message: err.message } };
      }
      throw err;
    });
  }
  return await tool.handler(params);
}
```

**ToolGuard 分级阶梯（tool-guard.ts:96-106 替换）**:

```ts
// 2026-08-22 修正: DSH repeat-tool-reminder 阶梯 [3,5,8] 参考，但 Synova tool-loop
// MAX_TOOL_ROUNDS=3（tool-loop-executor.ts:36/:152）——同工具同参数在 3 轮循环内
// 最多出现 3 次（每轮一次），**BLOCK=5 永远达不到** → 阶梯压缩为 [2提醒, 3阻断]：
const REMINDER_THRESHOLD = 2;   // 2 次同工具同参数 → reminder（模型可见，不阻断）
const BLOCK_THRESHOLD = 3;      // 3 次 → block（硬阻断，最后手段；保持原 LOOP_THRESHOLD=3 语义）

// beforeCall 返回:
//   count < 2            → { allow: true }
//   count === 2          → { allow: true, level: 'reminder', reminderMessage: '...' }
//   count >= 3           → { allow: false, level: 'block', reason: '...' }
//   （DSH 的 warning 中档在本循环上限下无意义，删除——S-10 显式 descope）
```

**tool-loop-executor 注入提醒（:94-99 改造）**:

```ts
const guardDecision = this.toolGuard.beforeCall(tc.function.name, effectiveParams);
if (!guardDecision.allow) {
  // block: 现逻辑（跳过 + 错误消息）
} else if (guardDecision.level === 'reminder') {
  // reminder: 注入模型可见的提醒消息（不阻断执行，DSH 范式）
  messages.push({
    role: 'tool', tool_call_id: crypto.randomUUID(),
    content: JSON.stringify({ reminder: guardDecision.reminderMessage }),
  });
  // 仍执行工具（决策留给模型）
}
```

### 4.3 不做的事

| 不做 | 原因 |
|------|------|
| 改 command-lanes 的 60s 隔离语义 | 施工图 CTO 审计修正：infra/command-lanes 是运行时 require 的活跃安全机制，冻结不动（任务卡 S1-4 明令） |
| 改哨兵调度（src/loops） | 领域层不属本卡（任务卡 S1-4 明令） |
| 全局默认超时（registry-wide timeoutMs） | DSH 明令"无 blanket budget"——只给声明 timeoutMs 的工具加超时，不改变未声明工具行为（保守） |
| 改 ConversationEngine 对外接口 | capability seam：能力可换、消费方不动 |
| 硬阻断升级为默认（advisory → block 全量） | DSH 明令 advisory only 是参考基线；Synova 保留 block 作为第 5 次最后手段 |

## 5. Test Requirements（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 扩展 `tests/l3/tool-guard.test.ts`，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| L1 超时契约：ToolDefinition 含 timeoutMs 字段 | 无字段 | 字段存在 |
| L1 超时触发：local 工具声明 timeoutMs=50 + handler sleep(200) → 返回 TOOL_TIMEOUT 结构化错误（非挂起） | 裸 await 挂起（测试超时失败） | TOOL_TIMEOUT 返回 |
| L1 超时不触发：handler 50ms 内完成 → 正常结果（timeoutMs=200） | 无超时逻辑（仍返回） | 正常返回 |
| L1 无 timeoutMs：未声明 → 行为不变（不新增超时） | — | 不变（回归） |
| L1 分级阶梯：同工具同参数 2 次 → reminder + allow:true + 消息非空 | 2 次无提醒 | reminder 注入 |
| L1 分级阶梯：3 次 → block + allow:false（**与 MAX_TOOL_ROUNDS=3 对齐，2026-08-22 修正——5 次在 3 轮循环内永远达不到**） | 3 次直接 deny（无提醒） | 2 次提醒后 3 次 block |
| L1 ToolTimeoutError 类：内联定义存在（name='ToolTimeoutError'） | 无类 | 类存在 |
| L1 回归：原 19 用例全绿（重复失败 3 次阻断/参数校验不变） | — | 全绿 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | ≥8 | 上述 8 用例（正常/降级/边界/阶梯/回归） |
| L2a | 接线 | 1 | tool-loop-executor 两条路径真实消费 level/reminderMessage |

## 6. Wiring Verification

| 新 export/函数 | 生产调用点 | 确认方式 |
|---------------|-----------|---------|
| ToolDefinition.timeoutMs | tools.ts execute() 内消费 | `grep -n "timeoutMs" src/agent/tools.ts` 命中定义 + 消费 |
| ToolGuard 分级（level/reminderMessage） | tool-loop-executor.ts :94 与 :214 两条路径 | `grep -n "reminderMessage\|guardDecision.level" src/agent/tool-loop-executor.ts` 命中 |
| TOOL_TIMEOUT 结构化错误 | tools.ts execute catch 路径 | `grep -n "TOOL_TIMEOUT" src/agent/tools.ts` 命中 |
| 生产入口（ConversationEngine） | conversation-engine.ts:442 `new ToolLoopExecutor(engineCtx)` → tool-loop 生产链路 | `grep -rn "new ToolLoopExecutor" src/agent/conversation-engine.ts` 命中（已存在，验证传导） |

> 生产调用点必须（S-3）：tool-loop-executor 两条生产路径（callLLMWithTools/streamWithToolLoop）真实消费分级结果（grep 断言）；测试调用不计。

## 7. Test Requirements（契约明细，铁律 47/48）

### 7.1 L1 单元契约 — tool-guard.test.ts 扩展（≥8 用例）

- 正常路径：2 次 reminder / 3 次 block；超时返回 TOOL_TIMEOUT
- 降级路径：超时 → 结构化错误 + log.warn（铁律 24，不静默）；block → allow:false + reason
- 边界条件：timeoutMs=0/未声明 → 不超时；同工具不同参数 → 不累计；失败后重置
- 失败模式覆盖（S-5）：裸 await 挂起（broken 超时）/ 阶梯缺失（broken 分级）/ 提醒消息空（broken 注入）

### 7.2 L2a 接线契约

- tool-loop-executor.ts 两处 beforeCall 消费 level（grep 断言 reminderMessage 出现在两条路径）
- ConversationEngine → ToolLoopExecutor → ToolGuard 生产链路传导（conversation-engine.ts:442 已存在）

### 7.3 L2b 降级契约

- 超时 → `{ error: { code: 'TOOL_TIMEOUT' } }` + log.warn（不静默挂起）
- ToolGuard.beforeCall 异常 → 兜底放行（现逻辑 tool-guard.ts:109-113 保留）+ log.error

### 7.4 L2c 边界契约

- timeoutMs=0 / 缺省 → 不超时（保守，不改变未声明工具行为）
- 同工具不同参数 → callCount key 不同，不触发阶梯（`${tool}:${JSON.stringify(args)}` key，tool-guard.ts:97）
- 成功调用 → 重置失败计数（tool-guard.ts:131-133 现逻辑保留）

## 8. Architecture Layer

**L2 编排（tool-loop-executor 属 ConversationEngine 子组件）+ L3 洞察（ToolGuard）**。依据：
- `src/agent/tool-loop-executor.ts` = L2 编排（ConversationEngine 子组件）
- `src/l3/tool-guard.ts` = L3 洞察层（文件头自声明"L3 洞察层"，铁律 39 合规：L3 → L4 相邻）
- 施工图 §3.5：src/agent 通用面（conversation-engine/tool-loop-executor/tools 基建）→ 混合模块拆分后 🟢 为主；tool-loop 是通用管道，归 🔵 借 DSH 层（Stage 1 借鉴范式）
- 不改 command-lanes（L2 infra，冻结）

## 9. Completion Standard（DS 与 dev doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. DS1: `tests/l3/tool-guard.test.ts` 全过（≥8 新用例；red 已证——超时挂起在修复前测试超时失败）
2. DS2: ToolDefinition.timeoutMs 契约字段——`grep -n "timeoutMs" src/agent/tools.ts` 命中定义
3. DS3: 超时触发——local 工具声明 timeoutMs + 慢 handler → 返回 `{ error: { code:'TOOL_TIMEOUT' } }`（非挂起）
4. DS4: 超时不触发——timeoutMs 内完成 → 正常结果；未声明 timeoutMs → 行为不变（回归）
5. DS5: 分级阶梯——2 次 reminder（allow:true + 消息非空）/ 3 次 block（allow:false，与 MAX_TOOL_ROUNDS=3 对齐，2026-08-22 修正）
6. DS6: 提醒注入——tool-loop-executor 两路径消费 reminderMessage（`grep -n "reminderMessage" src/agent/tool-loop-executor.ts` 命中）
7. DS7: 原 19 用例回归——重复失败阻断/参数校验行为不变
8. DS8: 零回归——`bash scripts/control-tower/baseline-check.sh` 无新增失败；vitest 全量绿
9. DS9: 写集一致——`git diff --name-only HEAD^` 与 §4.1 写集一致，无越界文件
10. DS10: 无绕过——pre-commit 13 组全过、bypass.log 无 `--no-verify`
11. DS11: 完成报告含决策记录（§4.2 阶梯阈值压缩/超时默认/不全局默认/ToolTimeoutError 内联四处的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项。

## 10. Auth Doc References

- [Stage1 派发文档](docs/synova/coordination/Stage1-派发-devdoc-20260821.md)（Spec 4 / D4）
- [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§3.5 / §8 R6）
- [第六章借鉴清单 B5](docs/synova/research/Harness研究与Synova战略再定位-20260816/第六章-借鉴清单与走出自己的特色-20260816.md)
- [dsh-tool-call-timeout-policy README](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tool-call-timeout-policy/README.md)
- [dsh-repeat-tool-reminder README](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-repeat-tool-reminder/README.md)
- [tool-loop-executor.ts](src/agent/tool-loop-executor.ts) / [tool-guard.ts](src/l3/tool-guard.ts) / [tools.ts](src/agent/tools.ts)
- TASK-ROUTING.md §四（Stage 1 归 Mac DSH）§一（src/ 归 Win——协调标注）
- AGENTS.md 铁律 11/24/31/39/47/48

## 11. 自检清单

- [x] tools.ts 无超时实测（local :185 / connector :196 / http 硬编码 :208）
- [x] ToolDefinition 无 timeoutMs 实测（:40-57 字段清单）
- [x] ToolGuard 硬阻断实测（:96-106 连续 3 次 deny，无阶梯）
- [x] ToolGuard 接线实测（tool-loop-executor :25/:94/:104/:214/:235，两条路径）
- [x] ConversationEngine 生产入口实测（:442 new ToolLoopExecutor）
- [x] DSH timeout-policy / repeat-tool-reminder README 精读（阶梯 [3,5,8] / TOOL_TIMEOUT / advisory only）
- [x] **2026-08-22 修正：BLOCK=5 与 MAX_TOOL_ROUNDS=3 矛盾实证（tool-loop-executor.ts:36/:152）→ 阶梯压缩为 [2提醒, 3阻断]；warning 中档删除（S-10 descope）**
- [x] **2026-08-22 修正：ToolTimeoutError 内联定义（error-types 包无超时专属类，避免改 packages/ 归 Win 区域）**
- [x] 决策参考已记录（阶梯阈值压缩/超时默认保守/不全局默认/ToolTimeoutError 内联，§4.2）
- [x] 测试 red→green 覆盖失败模式（S-5：挂起/阶梯缺失/提醒空）
- [x] DS 与 dev doc 一一对应（DS1-DS11）；写集表标题紧跟表头（D381 格式契约）
- [x] 与 D472/D474（原 D470）/D471 写集零交集（并行安全）；⚠️ src/ 区域已标注 Win 协调（S-7/S-8）
- [x] 不是凭记忆；不用 --no-verify

## 12. 复核修复记录（2026-08-22 impl 后独立复核，commit 89cf38e8）

> 创始人要求交付后批判性复核。复核发现 1 个真实问题 + 2 个改进并修复（K3 可核）:

1. **withTimeout 返回类型 TS2322（高严重度，铁律 38）**：`tools.ts:205` `withTimeout` 返回 `Promise<unknown>` 赋给 `ToolCallResult` → tsc 报类型错误。vitest（esbuild 转译）不查类型 + pre-commit 组 1 只查 `as any` → 31/31 绿掩盖了类型违规。修复：withTimeout 返回 `Promise<ToolCallResult>`，run() 结果适配；`ToolCallResult.error` 类型放宽为 `string | { name, code, message }`（容纳结构化超时错误，铁律 32 错误分类）。
2. **timer 泄漏（低）**：超时 Promise 未 clearTimeout，race settle 后 timer 仍存活。修复：finally clearTimeout。
3. **block 路径 level 一致性（低）**：参数校验/重复失败 block 缺 `level:'block'`（与循环 block 不一致）。修复：统一补上。测试 32/32 绿（新增 level 一致性用例）。
