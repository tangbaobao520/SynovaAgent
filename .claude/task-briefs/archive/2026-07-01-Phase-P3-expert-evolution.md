# Task Brief: Phase P3 — ExpertEvolution 专家子 Agent 专项进化

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | EVOLUTION-LAYER-v2.md §八

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（新建包）— packages/evolution/src/expert-evolution.ts

本任务完成 L0 进化层最后一块拼图：专家子 Agent 的专项进化。
根据用户纠错数据 → 识别哪些专家的配置需要更新 → 生成结构化建议 → 通过 FDE 审批流程实施。

- 性质：新建
- 数据流：user_correction（L1）→ ExpertEvolution → EvolutionProposal（P2 复用）→ FDE 审批
- 依赖：P2 的提案系统（generateThresholdProposal / approveProposal）

### b) 文件审计
- `packages/evolution/src/expert-evolution.ts` — 新建
- `packages/evolution/src/evolution-types.ts` — 已有 IndustryPattern/EvolutionProposal
- `packages/evolution/src/index.ts` — 需导出
- `src/routes/evolution.ts` — 已有提案 API，可扩展一个端点
- `src/sentinel/runner.ts` — 已有 LAYER_EXPERTS 映射表（哨兵→专家）
- `src/expert/` — 8 位专家的配置目录

关系：新建（expert-evolution）+ 复用（P2 提案系统 + 哨兵→专家映射）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
1. **问题定义**：8 位专家（strategy/finance/org/tech/marketing/business_model/action/knowledge）各自依赖不同的哨兵数据。当用户频繁纠错某个专家相关的哨兵时 → 该专家的配置可能需要进化（阈值/权重/解读规则）。
2. **最小可行方案**：读取 user_correction → 通过哨兵→专家映射表分组 → 统计每个专家的纠错率 → 纠错率高的专家生成进化提案。
3. **映射来源**：复用 runner.ts 中已有的 `LAYER_EXPERTS` 映射，不重复定义。

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 37: Dead code 不入仓库 — 文件驱动专家配置不在此任务范围
- 铁律 46: 不引用 engine-core
- ARCH-13 §6.5: 人工审核门禁

### b) 本任务执行约束
- rule: "哨兵→专家映射必须使用 runner.ts 的 LAYER_EXPERTS，不重复定义"
  verify: "grep -q 'LAYER_EXPERTS\|layer' packages/evolution/src/expert-evolution.ts"
- rule: "专家进化建议必须复用 P2 的 EvolutionProposal 类型"
  verify: "grep -q 'EvolutionProposal' packages/evolution/src/expert-evolution.ts"
- rule: "纠错率统计必须按 expert type 分组"
  verify: "grep -q 'expert\|sentinelToExpert' packages/evolution/src/expert-evolution.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 新建 `packages/evolution/src/expert-evolution.ts`
   - `sentinelToExpert` 映射表（从 runner.ts LAYER_EXPERTS 镜像）
   - `analyzeExpertCorrections(memoryStore)` — 读取 user_correction → 按 expert 分组 → 统计纠错率
   - `generateExpertProposal(analysis)` — 为纠错率高的专家生成进化提案
2. `packages/evolution/src/index.ts` — 导出新函数
3. `src/routes/evolution.ts` — 新增端点在专家详情中显示纠错统计
4. 测试文件

不做什么：
- 不改 runner.ts 的 LAYER_EXPERTS 映射表
- 不改任何 expert/{type}/ 目录下的文件（通过提案系统建议 FDE 手动修改）
- 不改 src/l4/agent-memory-store.ts
- 不改 packages/evolution/src/global-analyzer.ts（P2 提案逻辑已完整）

## Q3: 验收 — 入口 → 交互 → 结果

入口：POST /api/evolution/aggregate/:industry 或独立触发 analyzeExpertCorrections()
处理：读取 user_correction → sentinelToExpert 映射 → 统计 → 生成提案
结果：AgentMemoryStore 中存在 type:'enterprise_fact' + tags:['proposal', 'expert_evolution'] 的提案

## 本任务在哪一层
L0（packages/evolution/）

## Done 标准
- [x] verify: test -f packages/evolution/src/expert-evolution.ts
- [x] verify: grep -q 'sentinelToExpert' packages/evolution/src/expert-evolution.ts
- [x] verify: grep -q 'analyzeExpertCorrections' packages/evolution/src/expert-evolution.ts
- [x] verify: grep -q 'generateExpertProposal' packages/evolution/src/expert-evolution.ts
- [x] verify: npx vitest run tests/evolution/expert-evolution.test.ts 2>&1 | tail -5 | grep -q 'Tests'
