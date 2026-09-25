# Task Brief: T3 — GA哨兵标注工具

> 生成: 2026-07-08 | 分支: feat/prompt-architecture

## Q1: 调研

**业界参考**: 标注工具是AI系统可信度基线的核心——收集人类反馈（Human-in-the-loop）已有成熟模式（RLHF标注、GA标注、SQuAD标注）。本任务不引入新包，复用现有 AgentMemoryStore + JWT 认证。

**项目模式参考**: 
- `src/routes/ga-corrections.ts` — 现有GA纠错API，使用`extractAuthFromRequest` + `AgentMemoryStore` + 相同认证模式
- `src/routes/ga-diagnosis.ts` — 诊断报告页面，纯HTML内联JS+CSS

## Q2: 范围

**做什么**:
1. 新增 `src/routes/ga-annotations-types.ts` — API类型定义
2. 新增 `tests/routes/ga-annotations.test.ts` — API测试
3. 修改 `src/l4/agent-memory-store.ts` — 新增 `sentinel_annotation` MemoryType + SQL CHECK约束
4. 新增 `src/routes/ga-annotations.ts` — 3个API端点 (POST+GET+GET stats)
5. 修改 `src/server.ts` — 注册新路由
6. 修改 `src/routes/ga-diagnosis.ts` — 前端标注UI

**不做什么**:
- ❌ 不修改任何哨兵或 compute 函数
- ❌ 不修改 `SentinelFinding` 接口 (`src/sentinel/types.ts`)
- ❌ 不引入新 npm 包
- ❌ 不修改已有 `ga-corrections.ts`
- ❌ 不做服务端幂等去重（P2，本次不实现）

## Q3: 验收

**入口**: API端点 `POST/GET /api/ga/annotations` + `GET /api/ga/annotations/stats`
**交互**: 诊断报告页面 Finding 卡片下方标注按钮
**结果**: 标注数据存入 AgentMemoryStore，T9 可通过 `/stats` 消费

## Q4: 契约与测试

**API契约**:
- 输入: `CreateAnnotationRequest` (findingId, annotation, correctionNote?)
- 输出: `CreateAnnotationResponse` (ok, annotationId)
- 降级: AgentMemoryStore 不可用 → 500 + `degraded: true`
- 铁律38: `as any` 零容忍 — 用 `Record<string, unknown>` + 内联类型断言替代

**测试策略**:
- POST /api/ga/annotations — 正常提交(200), 无效值(400), 非GA(403)
- GET /api/ga/annotations — 按findingId/sentinelId/annotation筛选, 分页
- GET /api/ga/annotations/stats — 按哨兵统计, 总体统计, 空数据

## 架构层级
L1 (路由 ga-annotations.ts) → L4 (AgentMemoryStore)

## Done 标准
- [ ] verify: grep -n "sentinel_annotation" src/l4/agent-memory-store.ts | grep -q "MemoryType"
- [ ] verify: grep -c "gaAnnotationsRoutes" src/server.ts | grep -q 2
- [ ] verify: npx vitest run tests/routes/ga-annotations.test.ts 2>&1 | grep -q "15 passed"
- [ ] verify: npx tsc --noEmit 2>&1 | grep -E "^src/routes/ga-|^src/l4/agent-memory-store" || echo "0 errors"
- [ ] verify: grep -rn 'as any' src/routes/ga-annotations* | grep -v "注释\|comment" || echo "as any = 0"
