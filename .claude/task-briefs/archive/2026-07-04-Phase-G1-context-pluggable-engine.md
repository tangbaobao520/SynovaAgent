# Task Brief: Phase G1 — 上下文可插拔引擎（对标补全）

> 生成: 2026-07-04 23:00 | 分支: session/02 | as any: 0
> 来源: docs/plans/codex/implementation/SYNOVA-IMPL-对标补全-v1-20260703.md — Phase 1 (G1, P0)
> 前置: RUNTIME Phase 0-5 已交付（B1-B9），context-compressor.ts 已存在

## Q0: 定位

### a) 项目拼图
- **纵向**: L2 编排层 — context-engine 是对话引擎的压缩策略管理器
- **Synova 定位**: 文件驱动压缩策略。LLM 可用时用 LLM 智能摘要，LLM 不可用时降级到 truncate_oldest
- **本任务在哪一层**: L2（编排层）+ L2 扩展（文件驱动策略 JSON）
- **上下层依赖**:
  - L1 交互层: conversation-engine 在 L2，被 L1 路由调用
  - L2 已有模块: `src/orchestrator/context-compressor.ts`（284 行，含 3 种策略 + 副模型摘要）
  - L3 洞察层: 不涉及
- **本任务是替换还是扩展**: 扩展。context-engine 是 context-compressor 的上层包装——加载策略配置、评估触发条件、处理降级。context-compressor 继续存在作为底层压缩执行器。

### b) 文件审计
```
src/orchestrator/context-compressor.ts      — ✅ 已有（Phase 3.3, 284 行, 3 策略 + 工具裁剪 + 冷却 + 副模型摘要）
src/agent/conversation-engine.ts             — ✅ 已有（line 484-498: 内联 new ContextCompressor() 压缩）
extensions/                                  — ✅ 已有目录结构，无 context-strategies/ 子目录
src/orchestrator/context-engine.ts           — ❌ 新建
extensions/context-strategies/default.json   — ❌ 新建
tests/orchestrator/context-engine.test.ts    — ❌ 新建
```

### c) 决策
- 新建 `context-engine.ts` — 包装 ContextCompressor，添加策略加载 + 触发评估 + LLM 降级
- 新建 `extensions/context-strategies/default.json` — 默认压缩策略，文件驱动
- 新建 `tests/orchestrator/context-engine.test.ts` — 策略加载 / LLM 压缩 / LLM 降级 / 文件扩展
- 修改 `conversation-engine.ts` — 替换内联压缩为 contextEngine
- 复用 `ContextCompressor` 做底层压缩执行，不重写压缩逻辑

## Q1: 调研

### a) 业界最佳实践
- OpenClaw `context-compression.ts`: 单一策略、无降级、无文件驱动
- Codex 桌面端: 硬编码压缩阈值 + 无降级设计
- Anthropic 参考实现: Claude Code 使用滑动窗口 + LLM 摘要双策略，LLM 不可用时降级到纯截断

### b) 已有代码分析
`context-compressor.ts` 已实现：
- 3 种压缩策略（sliding-window / summary / selective）
- 工具输出裁剪（>500 chars → 截断并标记）
- 压缩冷却（600s 内不重复压缩）
- 副模型摘要（subModelSummary）
- 压缩统计（getCompressStats）
- 已确认判断注入（confirmedFacts）

当前 conversation-engine.ts 使用时：
- 消息数 > 30 触发压缩
- 硬编码 `new ContextCompressor()` + `strategy: 'summary'`
- 无策略配置、无文件驱动、无降级
- catch 只 log + 非阻断

### c) memory/ 教训
- [[stub-implementation-pattern]]: 压缩引擎必须走完整测试链路，不可 stub
- [[q0-skipped]]: 不能跳过 Q0，已完成文件审计
- [[plan-actual-closure]]: 交付后必须 grep 验证接线

## Q2: 范围

### 做
1. 创建 `extensions/context-strategies/default.json` — 默认压缩策略（maxTokens=8000, triggers threshold=6400）
2. 创建 `src/orchestrator/context-engine.ts` — ContextEngine 类
3. 创建 `tests/orchestrator/context-engine.test.ts` — 4 组测试用例
4. 修改 `src/agent/conversation-engine.ts` — 替换内联压缩为 contextEngine

### 不做
- 不改 `src/orchestrator/context-compressor.ts`（复用现有逻辑）
- 不改 `src/providers/types.ts` 或 `src/providers/base.ts`（复用现有 Provider；health check 用 try-catch provider.chat()）
- 不修改任何路由或中间件
- 不使用 as any

## Q3: 验收

### 入口
- conversation-engine.ts 在每次 LLM 调用前调用 `contextEngine.shouldCompress()`
- 策略文件 `extensions/context-strategies/default.json` 在 engine 构造函数中自动加载

### 交互
- `shouldCompress()` 根据 triggers (tokenThreshold, messageCountThreshold) 判断是否触发
- `compress()` 在 LLM 可用时调用 ContextCompressor + subModelSummary
- LLM 不可用时: compress() 降级到 `truncate_oldest`，返回 `degraded: true`
- 新增策略 JSON → 重启后自动加载（文件扫描扩展目录）

### 结果
- 消息数超阈值时上下文被压缩，不阻塞对话流程
- LLM 不可用时对话继续运行（压缩降级到纯截断）
- 策略文件可扩展（新增 JSON 文件不断代码）

## 架构层级: L2

## Done 标准

```bash
# 1. 策略加载：engine 初始化时自动加载 default.json
grep -rn "extensions/context-strategies" src/orchestrator/context-engine.ts

# 2. shouldCompress 触发：token > 6400 时返回 true
# 见测试: tokenOverThreshold → shouldCompress true

# 3. LLM 压缩：token > 6400 且 LLM 可用 → compress → 缩减 >= 30%
# 见测试: compressWithLLM → discardedCount > 0

# 4. LLM 降级：LLM 不可用时 → truncate_oldest → degraded: true
# 见测试: compressDegradedWhenLLMDown

# 5. 文件扩展：新增 strategy 文件 → 扫描发现
# 见测试: loadStrategiesDiscoversNewFiles

# 6. as any = 0
grep -rn "as any" src/orchestrator/context-engine.ts

# 7. 接线验证：conversation-engine.ts 使用 contextEngine
grep -rn "contextEngine\|ContextEngine" src/agent/conversation-engine.ts
```
