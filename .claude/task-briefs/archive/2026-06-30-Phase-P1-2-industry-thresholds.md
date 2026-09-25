# Task Brief: Phase P1-2 — 哨兵阈值行业聚合

> 生成: 2026-06-30 | 分支: feat/prompt-architecture | 基于 EVOLUTION-LAYER-v2.md §六

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 扩展（文件驱动，不改 TypeScript）— 写入 `extensions/industries/` JSON 文件
- [x] 横向（迁移到独立包 / 新建包）— packages/evolution/

本任务属于 L0 进化层第三层（全局进化/行业聚合）。
- 性质：新建
- 触发：Cron 定时或手动 API POST /api/evolution/aggregate/:industry
- 产出：写入 `extensions/industries/{name}/thresholds.json`

### b) 文件审计
- `packages/evolution/src/global-analyzer.ts` — 新建
- `packages/evolution/src/index.ts` — 已存在，需增加 global-analyzer 导出
- `packages/evolution/src/evolution-types.ts` — 已有 IndustryBaseline/PerSentinelStats 类型
- `extensions/industries/` — 已有 manifest.json 和 5 个行业目录（general-enterprise/saas-tech/manufacturing/financial-services），都只有 manifest.json
- `src/sentinel/runner.ts` — 已有 getSentinelStats() 方法（Phase P1-1）
- `src/sentinel/sentinel-loader.ts` — 已有哨兵 manifest thresholds

关系：新建（global-analyzer）+ 扩展（写入行业扩展 JSON 文件）

### c) 决策
无冲突。直接新建。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC → ② 实现 → ③ 测试 → ④ 接线 → ⑤ 验证 → ⑥ 提交 CI

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 24+31: 每个 catch 有 log + degraded
- 铁律 8: Mock/TODO 不留到交付代码

### b) 本任务执行约束
- rule: "industry threshold 必须写入 JSON 文件, 不写入 AgentMemoryStore"
  verify: "grep -q 'writeFileSync\|writeIndustryThresholds\|thresholds.json' packages/evolution/src/global-analyzer.ts"
- rule: "aggregateIndustryBaseline 必须使用 L3WriteAPI.getSentinelStats()"
  verify: "grep -q 'getSentinelStats' packages/evolution/src/global-analyzer.ts"
- rule: "聚合至少计算 median/p25/p75 三个统计量"
  verify: "grep -q 'median\|p25\|p75' packages/evolution/src/global-analyzer.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 新建 `packages/evolution/src/global-analyzer.ts`
   - `aggregateIndustryBaseline(industry)` — 读 L3 哨兵统计 → 算行业中位数 → 写入 JSON
   - `compareWithDefaults(stats, industry)` — 对比通用阈值，产生 adjustment 建议
   - 辅助函数: `writeIndustryThresholds(industry, suggestions)` — 写入 JSON 文件
2. `packages/evolution/src/index.ts` 导出
3. 为已有行业目录添加初始 `thresholds.json`（从哨兵 manifest 复制通用默认值）

不做什么：
- 不改 packages/evolution/src/evolution-types.ts（Phase P1-1 已完成）
- 不改 src/sentinel/runner.ts
- 不改 src/l4/agent-memory-store.ts
- 不改任何 src/l*/ 代码

## Q3: 验收 — 入口 → 交互 → 结果

入口：Cron 定时触发或手动调用 aggregateIndustryBaseline('saas-tech')
处理：读取同行业所有组织的哨兵得分 → 计算统计量 → 对比通用阈值 → 写入 JSON
结果：`extensions/industries/saas-tech/thresholds.json` 中存在行业专有阈值

## 本任务在哪一层
L0（扩展解耦）— packages/evolution/ + 行业扩展 JSON 文件

## Done 标准
- [x] verify: test -f packages/evolution/src/global-analyzer.ts
- [x] verify: grep -q 'aggregateIndustryBaseline' packages/evolution/src/global-analyzer.ts
- [x] verify: grep -q 'thresholds.json' packages/evolution/src/global-analyzer.ts
- [x] verify: grep -q 'median' packages/evolution/src/global-analyzer.ts
- [x] verify: npx tsc --noEmit 2>&1 | grep -c 'global-analyzer\|evolution'; test $? -eq 1
