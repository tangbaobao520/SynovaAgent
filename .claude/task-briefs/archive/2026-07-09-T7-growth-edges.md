# T7: 3条增长边创建 — COUPLES(P0) + CUMULATIVE_LEARNING(P1) + OCCUPIES(P1)

> 从零创建3条增长边（JSON Schema + EdgeType枚举 + compute函数 + 测试）。
> 同时提交T7a(BRAND_BUILDS)的未跟踪产物。

---

## Q0 定位: 项目拼图 + 文件审计

**a) 项目拼图**:
- Synova = AI 诊断 Agent。五层架构 L1→L5。8 专家 7 维度。
- 本任务在 L4 本体层（边类型扩展）+ L3 计算层（compute函数）。
- 当前17条边中6条防御边覆盖60-70%诊断需求——本任务增加3条增长边（COUPLES/CUMULATIVE_LEARNING/OCCUPIES）。
- 完成后总边数: 20条。

**b) 文件审计**:
- T7a产物(BRAND_BUILDS)文件存在但untracked：
  - `extensions/ontology/edge-types/brand_builds.json` ✅ 存在
  - `extensions/sentinels/shared/computes/l2-value/compute-brand-roi.ts` ✅ 存在
  - `tests/sentinels/shared/compute-brand-roi.test.ts` ✅ 存在
  - `packages/ontology/src/edge-types.ts` — BRAND_BUILDS缺失（需恢复）
  - `extensions/sentinels/shared/computes/index.ts` — 无computeBrandROI导出
- 3条新边：完全零创建（EdgeType枚举/JSON Schema/代码引用均为0）

**c) 决策**:
- T7a: 恢复edge-types.ts中BRAND_BUILDS + 追加index.ts导出 → 提交
- 新边: 从零创建，遵循已有边的格式约束

## Q1 调研

**契约优先（铁律47+48）**:
- 已有17条边的JSON Schema格式：`allowedFrom`/`allowedTo`用具体节点名列表（无`*`通配符）
- 已有compute函数格式：契约ID `COMPUTE-{NAME}-v1` + JSDoc输入/输出/降级 + 测试
- 已有测试路径：`tests/sentinels/shared/compute-{name}.test.ts`

**memory/ 教训**:
- 桥接文件教训（铁律46）：本次是edge-types.ts直接追加，不创建桥接文件
- stub实现教训：compute函数必须有真实算法，不能是空壳
- as any零容忍（铁律38）

## Q2 范围

**做的事**:
1. Step 0: 提交T7a未跟踪的3个文件 + 恢复edge-types.ts BRAND_BUILDS + index.ts导出
2. Step 1: 创建couples.json/cumulative_learning.json/occupies.json JSON Schema
3. Step 2: 更新edge-types.ts（EdgeType对象+ALL_EDGE_TYPES+JSDoc）
4. Step 3: 3个compute函数（computeCouplingStrength/computeLearningRate/computeOccupancy）
5. Step 4: 更新index.ts导出 + 3个测试文件（每个≥3测试）
6. Step 5: 验证（vitest + tsc + 约束检查）

**不做的事**:
- ❌ 不创建consumed_by_sentinels消费者（T7d学术哨兵+T10 ME compute会消费）
- ❌ 不修改其他已有边的JSON Schema
- ❌ 不修改store.queryEdges引用（约束6：必须通过GraphTraversal）
- ❌ 不含`*`通配符在allowedFrom/allowedTo（约束1）
- ❌ 零 as any（铁律38）

## Q3 验收: 入口→交互→结果

- **入口**: edge-types.ts + extensions/ontology/edge-types/ + shared/computes/ + tests/
- **交互**: JSON Schema文件驱动加载 + EdgeType枚举 + compute函数计算
- **结果**: 
  1. BRAND_BUILDS边回归（edge-types.ts 3处出现 + index.ts导出）
  2. 3条新边JSON Schema可被ontology-loader加载
  3. 3个compute函数有清晰JSDoc契约（含计算步骤/降级条件）
  4. ≥9个测试场景全部通过
  5. vitest + tsc 零新增失败

## 架构层级

L4 本体层（边类型扩展）+ L3 计算层（compute函数）

## Done 标准

1. BRAND_BUILDS回归edge-types.ts（EdgeType对象+ALL_EDGE_TYPES+JSDoc）
2. COUPLES/CUMULATIVE_LEARNING/OCCUPIES各有JSON Schema文件且可加载
3. EdgeType枚举中每边出现≥2次（EdgeType对象+ALL_EDGE_TYPES数组）
4. 3个compute函数各有契约ID + JSDoc输入/输出/降级
5. computeCouplingStrength的JSDoc含明确5步计算步骤（约束3）
6. computeOccupancy测试覆盖GA未配置时的degraded路径（约束4）
7. 3个JSON Schema中零`*`通配符（约束1）
8. 零 as any（约束5）/ 零新增store.queryEdges（约束6）
9. 全量vitest + tsc 零新增失败
