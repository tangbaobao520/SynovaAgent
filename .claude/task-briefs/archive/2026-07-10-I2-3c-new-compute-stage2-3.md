## Q0: 定位 — 项目拼图 + 文件审计 + 决策
SynovaAgent — I2-3c。审计: 17条边JSON+枚举全在。talent_deployment(3引用)/information_flow(8)/operational_execution(9)/tech_infrastructure(2)是MODIFY边已引用。其余13条纯新边零引用。决策: 基于3b模板, 为17条边各创建1个compute+3个测试。不改哨兵(阶段4)。

## Q1: 调研 — 引用来源
a) 42边纯净列表: SYNOVA-RESEARCH-纯净边列表-20260709.md — 每条边的transfer_function
b) I2-3b模板: l1-input/ 下12个compute — COMPUTE-{NAME}-v1格式
c) memory/ — 历史教训: 契约ID缺失(pre-commit阻断), as any零容忍
d) grep-refs: talent_deployment(3), information_flow(8), operational_execution(9), tech_infrastructure(2)

## Q2: 范围 — 做什么 + 不做什么
做什么: 17条新边×1 compute + 3测试 = 34个新文件
  环节2(10): capital_allocation/decision_authority/talent_deployment/information_flow/incentive_alignment/rule_constraint/organizational_learning/knowledge_sharing/trust_friction_reduction/routine_rigidity
  环节3(7): operational_execution/innovation_output/brand_building/demand_to_spec/service_support/cross_functional_synergy/tech_infrastructure
不做什么: 不创建新哨兵; 不改哨兵aggregate.ts; 不更新index.ts(D2合并到阶段3完成后)
排除: extensions/sentinels/*/aggregate.ts, extensions/ontology/edge-types/*.json

## Q3: 验收 — 入口→处理→结果
入口: 34个新文件(17 compute + 17 test)
处理: 每compute含契约ID COMPUTE-{NAME}-v1 + JSDoc(输入/输出/降级)
结果: npx tsc --noEmit 零错误, npx vitest run 零新增失败

## 架构层: L4(本体层compute) — shared/computes/l2-internal/ + l3-output/
## Done 标准
- [x] verify: 34个新文件存在(17 compute + 17 test)
- [x] verify: 17个契约ID格式 COMPUTE-{NAME}-v1
- [x] verify: 51+个it(17×3) + expect >= 51
- [x] verify: tsc零错误 / vitest零失败 / 零as any
