# Task Brief — T7a BRAND_BUILDS 边创建

## Q0 定位
a) **项目拼图**: 
   - Synova = AI 诊断 Agent。五层架构 L1→L5。8 专家 7 维度。
   - 本任务在哪一层？**L3 洞察层 + L4 本体层** — 创建第17条边类型 BRAND_BUILDS，属于本体层(L4)的边定义，compute 函数属于洞察层(L3)的共享计算模块。
   - 本任务上下层：L3(洞察)的 compute 函数消费 BRAND_BUILDS 边数据；L4(本体)的 edge-types.ts 和 JSON Schema 定义边结构。
   - 本任务是**新增**——BRAND_BUILDS 边目前不存在。
b) **文件审计**:
   - grep 关键词 "BRAND_BUILDS" → 0处（不存在）
   - grep "edge-types" → packages/ontology/src/edge-types.ts (16条边)
   - grep "brand" → extensions/ontology/resource/brand.json (已存在)
   - 本任务和已有模块的关系：**新建**（无覆盖）
c) **决策**: 无覆盖 → 新建走文件驱动（manifest.json + 独立文件），不准硬编码在 TS 里。

## Q1 调研
a) 业界最佳实践：Aaker(1991)品牌资产理论 + Keller(1993)CBBE模型——品牌建设到营收转化有6-18个月滞后期。
b) 项目已有模式：16条边均通过JSON Schema + EdgeType枚举 + ALL_EDGE_TYPES数组定义。compute函数按层分组在shared/computes/{layer}/。测试在tests/sentinels/shared/。
c) Memory教训：铁律46（禁止桥接文件）、铁律38（零as any）、约束1（ALL_EDGE_TYPES必须同步更新）。

## Q2 范围
- 创建 BRAND_BUILDS 边 JSON Schema
- 更新 EdgeType 枚举 + ALL_EDGE_TYPES 数组 + JSDoc 注释
- 创建 computeBrandROI 函数（契约ID: COMPUTE-BRAND-ROI-v1）
- 更新 shared/computes/index.ts 导出
- 创建 6 个测试场景
- **不做的事**: 不修改任何 aggregate.ts 哨兵文件；不修改 dist/ 下的 .d.ts 文件；不创建其他边类型（COUPLES/CUMULATIVE_LEARNING 等归 T7 范围外）

## Q3 验收
- 入口: extensions/ontology/edge-types/brand_builds.json 文件存在
- 交互: EdgeType.BRAND_BUILDS 可导入，ALL_EDGE_TYPES.includes(EdgeType.BRAND_BUILDS) 为 true
- 结果: computeBrandROI 函数可调用，6个测试全部通过，全量 vitest 零新增失败

## 架构层级
L3 + L4

## Done 标准
1. `extensions/ontology/edge-types/brand_builds.json` 存在，ontology-loader 可加载
2. `EdgeType.BRAND_BUILDS` 可导入，`ALL_EDGE_TYPES.includes(EdgeType.BRAND_BUILDS)` 为 true
3. `grep -c "BRAND_BUILDS" packages/ontology/src/edge-types.ts` = 3
4. `computeBrandROI` 函数存在，契约ID=COMPUTE-BRAND-ROI-v1
5. `shared/computes/index.ts` 导出 computeBrandROI
6. 6 个测试场景全部通过
7. 全量 vitest 零新增失败
8. tsc 零新增错误
