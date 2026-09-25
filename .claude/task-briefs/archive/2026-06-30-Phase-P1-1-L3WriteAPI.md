# Task Brief: Phase P1-1 — SentinelRunner 暴露 L3WriteAPI

> 生成: 2026-06-30 | 分支: feat/prompt-architecture | 基于 EVOLUTION-LAYER-v2.md §七

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）— L3 sentinel/runner.ts

本任务属于 L3 洞察层的 SentinelRunner。暴露 L3WriteAPI 接口供 L0 进化层调用。
- 性质：扩展（给现有 SentinelRunner 加方法）
- 接线：OrgAdapter.closeStaleTickets() 需要 L3WriteAPI.closeTicket()

### b) 文件审计
- `src/sentinel/runner.ts` — SentinelRunner 类所在，已有 `sentinel_tickets` 表（L137-149）和 `storeExpertReport()`（L330-345），但无 closeTicket/阈值读写方法
- `packages/evolution/src/evolution-types.ts` — 已有 L3WriteAPI 接口定义
- `packages/evolution/src/org-adapter.ts` — 已有 closeStaleTickets() 调用，当前 l3=null

关系：扩展（runner.ts 加方法）+ 接线（L0 通过 L3WriteAPI 调用 L3）

### c) 决策
无冲突。直接扩展 SentinelRunner。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC → ② 实现 → ③ 测试 → ④ 接线 → ⑤ 验证 → ⑥ 提交 CI

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 24+31: 每个 catch 有 log + degraded
- 铁律 31: 降级信号传播

### b) 本任务执行约束
- rule: "L3WriteAPI 的 closeTicket 必须关闭 sentinel_tickets 表中匹配的行"
  verify: "grep -q 'UPDATE.*sentinel_tickets.*status.*resolved' src/sentinel/runner.ts"
- rule: "getSentinelStats 必须返回 PerSentinelStats 结构"
  verify: "grep -q 'PerSentinelStats\|median\|p25\|p75' src/sentinel/runner.ts"
- rule: "getThreshold 必须同时查 memory store + manifest fallback"
  verify: "grep -q 'threshold.*manifest\|getThreshold' src/sentinel/runner.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. SentinelRunner 新增 getL0API() 方法 → 返回 L3WriteAPI 实现
2. 实现 closeTicket(): UPDATE sentinel_tickets SET status='resolved'
3. 实现 getThreshold(): 先从 AgentMemoryStore 查, fallback 到 SentinelManifest 默认值
4. 实现 updateThreshold(): 写入 AgentMemoryStore (type:'threshold_adjustment')
5. 实现 getSentinelStats(): 聚合所有哨兵得分返回

不做什么：
- 不改 src/l4/agent-memory-store.ts（只写入已有类型）
- 不改 src/sentinel/runner.ts（sentinel_tickets 表结构无需改动）
- 不改 evolution-types.ts（接口定义已有）
- 不改 org-adapter.ts（只需将 l3 从 null 改为 getL0API()）

## Q3: 验收 — 入口 → 交互 → 结果

入口：OrgAdapter.afterDiagnosis() → this.l3.closeTicket/getThreshold/updateThreshold/getSentinelStats()
处理：SentinelRunner 操作 sentinel_tickets 表 + AgentMemoryStore
结果：OrgAdapter 的 closeStaleTickets() 能真实关闭工单

## 本任务在哪一层
L3（src/sentinel/runner.ts）

## Done 标准
- [x] verify: grep -q 'getL0API' src/sentinel/runner.ts
- [x] verify: grep -q 'UPDATE.*sentinel_tickets.*resolved' src/sentinel/runner.ts
- [x] verify: grep -q 'getThreshold' src/sentinel/runner.ts && grep -q 'PerSentinelStats' src/sentinel/runner.ts
- [x] verify: npx tsc --noEmit 2>&1 | grep -c 'runner'; test $? -eq 1
- [x] verify: npx vitest run tests/sentinel/l3-write-api.test.ts 2>&1 | grep -q 'passed'
