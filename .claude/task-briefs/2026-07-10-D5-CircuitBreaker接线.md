# D5: CircuitBreaker接线到LLM调用路径

> 生成: 2026-07-10 | 分支: feat/prompt-architecture | V4.4.4

## Q0: 项目身份 + 审计
a) 项目拼图 — 
   Synova = AI 诊断 Agent。五层架构 L1→L5。
   本任务在 L2(编排层) — providers/base.ts 是 LLM 调用的统一入口。
   本任务为新增 CircuitBreaker 三态机接线, 影响所有 Provider(openai/deepseek/gateway)。
b) 文件审计 — 
   已有: src/llm/circuit-breaker.ts (86行三态机, 已实现但零运行时实例)
   已有: src/providers/base.ts (createOpenAICompatibleProvider 工厂)
   审计: CircuitBreaker 在 12 个 Provider 文件中零实例
c) 决策 —
   新增接线。CircuitBreaker 类不修改, 只接线。

## Q1: 调研
a) CircuitBreaker 三态机: CLOSED→OPEN(threshold次失败)→HALF_OPEN(冷却后探测)→CLOSED/OPEN
b) base.ts: makeRequest() 和 chat() 是 LLM 调用入口, 被所有 Provider 复用
c) Agent 对标: 三级恢复 L1 层(自动熔断), D10 负责 L2(GA一键恢复)

## Q2: 范围
- base.ts 的 createOpenAICompatibleProvider() 中实例化 CircuitBreaker
- makeRequest() 前加 breaker.isOpen() 检查
- chat()/stream() 用 try/catch 包裹, 成功/失败时调用 recordSuccess/recordFailure
- 配置: threshold=5, cooldownMs=30000, halfOpenMaxCalls=1
- 不动: CircuitBreaker 类本身 / 其他 Provider / 已有 makeRequest 逻辑

## Q3: 验收
verify: grep "CircuitBreaker" src/providers/base.ts 有结果(接线)
verify: npx tsc --noEmit 零新增错误
verify: git diff src/llm/circuit-breaker.ts 为空(未修改类本身)

## 本任务在哪一层
L2(编排层) — providers/base.ts

## Done 标准
- [x] verify: grep "CircuitBreaker" src/providers/base.ts 有结果(接线)
- [x] verify: npx tsc --noEmit 零新增错误
- [x] verify: git diff src/llm/circuit-breaker.ts 为空(未修改类本身)
- [x] verify: grep -c "as any" src/providers/base.ts | xargs test 0 -eq (零as any)
- [x] verify: pre-commit 8组通过
