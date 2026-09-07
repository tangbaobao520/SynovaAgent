# Task Brief: D586 LLM 稳定错误码 taxonomy 收敛对齐（DSH 借鉴卡 B-01）

> 生成: 2026-09-07 | 任务: D586 | 认领: Claude Code（Win 线，.sessions/D586/repo clone 交付）
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D586-llm-error-taxonomy-align-20260907.md
> 参考: D333 决策四步（第一性原理 → Anthropic 工程基线 → 开源实证 → 收敛检查）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = 组织数字孪生诊断 + 增长导航 Agent，LLM 调用是诊断与增长信号链路的底座。本任务在 L3 洞察层的 provider 底座（src/errors + src/providers）：现有 ErrorCode 23 码 + DiagnosticAgentError（铁律 32 的 .code+.phase+.retryable 已满足），缺 DSH 的归一化边界（normalizeLlmFailure：任意 throw 冻结为 {message, code}）与合一 detail 正则分类器（isContextWindowExceededError/isQuotaExceededError），且无 EMPTY_RESPONSE 码。本任务是增量扩展，不替换既有 8 阶段分类流水线。
### b) 文件审计
grep 证实：normalizeLlmFailure / isContextWindowExceededError / isQuotaExceededError / EMPTY_RESPONSE 在 src/ 全部零命中（本次新建）；classifyApiError / normalizeError / isRetryable / ErrorCode / DiagnosticAgentError 已存在于 src/errors/types.ts（复用不重建）；DiagnosticAgentError 既有消费方 src/providers/deepseek.ts、src/providers/ernie.ts 接口保持不变（capability seam）。DSH 锚点已逐行读全文：error.js + adapter-failure.js。
### c) 决策
已有覆盖 → 复用（classifyApiError 流水线与既有 ErrorCode 词汇表不动）；无覆盖 → 按 DSH 范式读源码自研（零代码依赖，G1/G4）；冲突 → 取消。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- DSH 真实源码（0.1.1-rc.2，逐行读）：D:/deepseek-harness/packages/llm/llm/lib/types/error.js（HarnessError 稳定 code + 4 个 canonical 码 + 合一 detail 正则分类器，注释 route on this, never by parsing message）+ adapter-failure.js（normalizeLlmFailure：任意 throw → 冻结 {message, code}；own failure 与 own code 一致才信任跨包拷贝；敌意访问器/敌意 toString 不逃逸）。
- dev doc 写集表与测试契约：docs/plans/codex/implementation/SYNOVA-IMPL-D586-llm-error-taxonomy-align-20260907.md（2 修改 + 新增测试 red→green）。
- 决策参考：参考 Anthropic/DeepSeek/第一性原理 + 结论——稳定码用于路由、正则分类只在 adapter 边界对 provider code/type/message 合一 detail 跑一次；Synova 词汇表映射：CONTEXT_OVERFLOW 对齐 CONTEXT_WINDOW_EXCEEDED 语义、BILLING_EXCEEDED 对齐 QUOTA、新增 EMPTY_RESPONSE、INVALID_CREDENTIAL 分类走 adapter 侧（AUTH_FAILED+轮换，不新增码）。
- memory/ 教训：engine-core-split-fraud（借范式必须读源码自研，grep 零依赖）；2026-09-01-d490（零回归 = FAIL 集恒等）；2026-08-23-d477（基线对照单命令完成）；2026-08-28-d488（clone 内 brief 复制主区 + workflow-state 重建）。

## Q2: 范围 — 正确的最简方案
做什么：
- src/errors/types.ts
- src/providers/base.ts
- tests/errors/llm-error-taxonomy.test.ts
- .claude/task-briefs/2026-09-07-D586-win-llm-error-taxonomy.md
不做什么：
- 不改 src/providers/deepseek.ts（onError 已分类，seam 保持）
- 不改 src/providers/ernie.ts（dev doc 写集外）
- 不改 src/llm/types.ts（韧性配置不动）
- 不改 scripts/audit/（K3 红线）
- 不改 expert/（纯 LLM 底座任务）
- 不改 sentinel/（D580 已合并领地）
- 不改 extensions/（纯 LLM 底座任务）

## Q3: 验收 — 入口 → 交互 → 结果
入口：provider 适配器 chat()/stream() 边界的任意 throw（HTTP 非 OK、SSE、空响应、网络错误）+ vitest 测试入口。
处理：src/providers/base.ts 最终 throw 边界接 normalizeLlmFailure（任意 throw → 冻结 {message, code}，敌意值不逃逸）→ 合一 detail（provider code+type+message）正则分类 → canonical 码（CONTEXT_OVERFLOW / BILLING_EXCEEDED / EMPTY_RESPONSE / AUTH_FAILED）→ 抛出 DiagnosticAgentError（既有消费方接口不变）。
结果：npx vitest run tests/errors/llm-error-taxonomy.test.ts tests/providers/ 全绿；tsc 28 基线零新增；grep normalizeLlmFailure src/providers/ 命中（真实接线）；grep @deepseek-ai src/ 零结果。

## 架构层: L3（本任务在哪一层 = L3 洞察层 LLM 底座：src/errors + src/providers，邻接 L2 编排）

## 文档引用
docs/plans/codex/implementation/SYNOVA-IMPL-D586-llm-error-taxonomy-align-20260907.md §2 现状 / §4 写集表 / §5 测试要求 / §7 完成标准；docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md B-01；CLAUDE.md 铁律 0-2 / 32 / 38 / 46。

## 接口审计
src/errors/types.ts: classifyApiError
src/errors/types.ts: isRetryable
src/errors/types.ts: ErrorCode
src/errors/types.ts: DiagnosticAgentError
src/providers/base.ts: createOpenAICompatibleProvider
src/providers/base.ts: checkResponse

## Q4: 历史教训对照
memory/ engine-core-split-fraud：借范式必须读源码自研，交付前 grep "@deepseek-ai" src/ 必须零结果。memory/ 2026-09-01-d490-expert-config-parser-fix：零回归 = FAIL 集恒等，实现前后各跑一次相关目录比对失败集。memory/ 2026-08-23-d477-standardkey-tags-delivery：tsc 基线对照须单 bash 命令完成，跑后还原副作用工件。memory/ 2026-08-28-d488-v2-workflow-state-desync：clone 内交付时 brief 复制主区 + workflow-state.json 重建，hook ROOT 随 harness CWD 指向主工作区。

## Done 标准
- [x] 3 个 DSH 范式落地且测试 red→green — verify: npx vitest run tests/errors/llm-error-taxonomy.test.ts
- [x] normalizeLlmFailure 在 src/providers/base.ts 真实接线（DS1） — verify: grep -rn "normalizeLlmFailure" src/providers/
- [x] 零 DSH 代码依赖（DS2/G1） — verify: grep -rn "@deepseek-ai" src/ | wc -l
- [x] 新测试 + tests/providers/ 全绿且 tsc 28 基线零新增（DS4） — verify: npx vitest run tests/errors/llm-error-taxonomy.test.ts tests/providers/
- [x] as any 新增 = 0（DS5） — verify: git diff -U0 | grep "+.*as any" | wc -l
