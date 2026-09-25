# Task Brief: Phase P0-1 — 迁移改造 feedback-collector.ts 到 @synova/evolution

> 生成: 2026-06-30 | 分支: feat/prompt-architecture | 基于 EVOLUTION-LAYER-v2.md §五

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
目标: 成为组织诊断的 AWS。能文件化的必须文件化。不能文件化的必须有明确的扩展点。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（迁移到独立包 / 新建包）

本任务属于 L0 进化层基础设施。将 `src/evolution/feedback-collector.ts` 迁入 `packages/evolution/src/` 并改造。
- 性质：迁移 + 改造（非新建，非删除）

### b) 文件审计
- `src/evolution/feedback-collector.ts` — 活的，被 `src/routes/chat.ts:63` 引用
- `packages/evolution/src/index.ts` — 已存在（Phase 0 创建），需添加重新导出
- `packages/evolution/src/evolution-types.ts` — 已存在，已有 UserCorrection 类型

关系：迁移（移出 src/ → 移入 packages/evolution/）+ 改造（加 orgId + 改 type）

### c) 决策
无冲突。已有包结构（Phase 0）直接使用。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC / Done 标准 → ② 实现 → ③ 验证 → ④ 接线 → ⑤ 提交 CI

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 7: 入口可触达 + 完整链路走通 + 结果可见
- 铁律 24+31: 错误处理 + 降级信号
- 铁律 46: 禁止桥接代理文件
- memory/stub-implementation-pattern.md: 不要留 stub 实现

### b) 本任务执行约束
- rule: "迁移后的 feedback-collector 必须保留内存 Map 降级路径"
  verify: "grep -c 'new Map' packages/evolution/src/feedback-collector.ts"
- rule: "chat.ts 的 import 路径必须从 '../evolution/feedback-collector' 改为 '@synova/evolution'"
  verify: "grep -c '@synova/evolution' src/routes/chat.ts"
- rule: "orgId 参数必须为必选"
  verify: "grep -q 'orgId:' packages/evolution/src/feedback-collector.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 从 `src/evolution/feedback-collector.ts` 复制到 `packages/evolution/src/feedback-collector.ts`
2. 改造：
   - `collectFeedback()` 增加 `orgId: string` 必选参数
   - 记忆 key 改为 `correction_${sentinelId}_${findingId}`（带 sentinelId）
   - 记忆 type 改为 `'user_correction'`（区别于 enterprise_fact）
   - 记忆 tags 改为 `['correction', decision, sentinelId]`
   - 保持原有内存 Map 降级路径（AgentMemoryStore 不可用时回退）
3. `packages/evolution/src/index.ts` 重新导出 feedback-collector
4. 更新 `src/routes/chat.ts:63` 的 import 路径
5. 删除 `src/evolution/feedback-collector.ts`（原位置）

不做什么：
- 不改 src/l4/agent-memory-store.ts（代码或表结构）
- 不改 src/sentinel/runner.ts
- 不改 org-adapter.ts（Phase P0-2）
- 不改 session-learner.ts（Phase P0-3）
- 不改 tsconfig.json（Phase 0 已配好 paths）
- 不改 evolution-types.ts（Phase 0 已定义 UserCorrection 类型）

## Q3: 验收 — 入口 → 交互 → 结果

入口：chat.ts:63 用户 confirm/reject/opinion → `collectFeedback()`
处理：orgId + actionId + decision + reason → 持久化到 AgentMemoryStore (type:'user_correction')
结果：AgentMemoryStore 中可查到 user_correction 类型记忆

## 本任务在哪一层
L0（横向层）— 迁入 packages/evolution/，不影响五层架构

## Done 标准
- [x] verify: test -f packages/evolution/src/feedback-collector.ts
- [x] verify: grep -c '@synova/evolution' src/routes/chat.ts
- [x] verify: grep -q 'orgId:' packages/evolution/src/feedback-collector.ts
- [x] verify: test ! -f src/evolution/feedback-collector.ts
- [x] verify: npx tsc --noEmit 2>&1 | grep -c evolution; test $? -eq 1
