# Task Brief: D386: 修复 sentinel-loader 测试断言（CI Vitest 预存红）

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D386)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
CI Vitest (2/2) 全量红：sentinel-loader.test.ts:20 断言所有哨兵 computes.length > 0，但 2 个规范外哨兵（forecast-accuracy/pricing-strategy）在 aggregate.ts 直接实现不声明 computes。预存红（D378 已发现规范外哨兵），非 D356 引入。修断言容忍「有 entryPoint 入口」。

### b) 文件审计
- tests/sentinel/sentinel-loader.test.ts:20（断言）
- 涉及哨兵: extensions/sentinels/sentinel-forecast-accuracy/（computes=[] + aggregate.ts）、sentinel-pricing-strategy/（同上）

### c) 决策
断言语义 = 哨兵必须有可执行入口（computes 非空 或 entryPoint 存在）。参考：第一性原理（哨兵可执行即合格）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 复现（本地 vitest 1 失败）→ ② 修断言（容忍 entryPoint）→ ③ 验证（75/75 全绿）→ ④ 提交。
引用铁律 48（测试有断言）、D360 P2 批次（规范外哨兵）。

### b) 执行约束
- rule: "修复后本地 vitest tests/sentinel/ 全绿"
  verify: "75/75"

### c) 决策参考系
参考：第一性原理。收敛。

## Q2: 范围 — 正确的最简方案

做什么：
- tests/sentinel/sentinel-loader.test.ts
- .claude/task-briefs/2026-08-16-D386-vitest-sentinel-assert.md
- task-state/D386.json

不做什么：
- 不改 extensions/sentinels/*/manifest.json（规范外哨兵契约冻结，D360 批次处理）
- 不改 src/sentinel/sentinel-loader.ts（loader 无缺陷）

## Q3: 验收 — 入口 → 交互 → 结果

入口：CI Vitest (2/2)
处理：断言容忍 entryPoint 哨兵
结果：75/75 全绿；CI Vitest 转绿（main 预存红消除）

## 架构层: L3 洞察（测试）

#CRITERIA: A

## Done 标准
- [ ] npx vitest run tests/sentinel/ 75/75 通过
- [ ] 断言注释说明 D386 容忍规范外哨兵
