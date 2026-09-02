# D567 — 专家枚举硬编码残留 ×4 传播修复（K3 15-1）

> 派单: CTO | 2026-09-02 | 执行线: 编码 session | 来源: K3 产品线 17 点批（15-1 🟡）
> 类型: FIX（铁律 9 传播缺口——「专家名枚举」类符号漏网）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
专家名枚举散落 4 处硬编码旧 6 专家（strategy/org/finance/tech/marketing/action），expert/expert-registry.yaml 实际 7 位（含 business_model/knowledge 类新增）——V5 视图与 CLI/校验器/引擎/哨兵视图不一致。

### b) 文件审计（K3 实证 file:line）
- src/tui-v2/chat.tsx:409-411 EXPERT_NAMES 6 位
- src/cli/commands/expert.ts:16-18
- src/l3/cross-validator.ts:75 附近
- src/engine/synova-diagnosis-engine-impl.ts:528-534
- src/sentinel/runner.ts:643 附近
- 唯一事实源: expert/expert-registry.yaml（7 位）

### c) 决策
四处全部改为从 expert-registry.yaml（或其加载器导出的常量）动态读取——消灭枚举复制本身，而非逐处改数。

## Q1: 调研
铁律 9（关键变更 grep 传播）；文件驱动架构（expert/ 自动注册即唯一事实源）；K3 L4-2 归因（「专家名枚举」类符号 grep 漏网——修复后此类符号应不复存在）。

## Q2: 范围
做什么：
- 修改 src/tui-v2/chat.tsx：EXPERT_NAMES → registry 动态读取
- 修改 src/cli/commands/expert.ts：同
- 修改 src/l3/cross-validator.ts：同
- 修改 src/engine/synova-diagnosis-engine-impl.ts：同
- 修改 src/sentinel/runner.ts：同
- 修改 tests/（受影响断言适配 7 位）
- task-state/D567.json：回填

不做什么：
- 不改 expert/expert-registry.yaml 内容（7 位为权威）
- 不改 scripts/audit/K3-AUDIT-PROTOCOL.md 等审计文件：审计红线

## Q3: 验收
入口：grep -rn "strategy: '战略'" src/ = 0（四处全灭）
处理：动态读取 → 各视图 7 位一致
结果：tsc 零新增 + 相关测试绿 + K3 复审

## 架构层:

跨 L1/L3/L5 视图层（数据源 L5 expert-registry 文件驱动，铁律 39 合规路径）

## Done 标准
- [x] 枚举残留清零 verify: grep -rn "marketing: '营销'" src/ | wc -l | xargs test 0 -eq
- [x] registry 唯一源 verify: grep -c "business_model" src/tui-v2/chat.tsx | xargs test 1 -ge
- [x] 回归 verify: npx tsc --noEmit --pretty false 2>&1 | grep -cE "error TS" | xargs test 28 -eq
