## Q0: 定位 — 项目拼图 + 文件审计 + 决策
SynovaAgent — I2-3d。审计: 13条边JSON+枚举全在。assumption_triggered_reallocation(1引用)是跨环节联动边已在代码中使用。其余12条纯新边零引用。决策: 基于3b/3c模板, 为13条边各创建1个compute+3个测试。I2阶段3完成后42边全部有compute。不改哨兵(阶段4)。

## Q1: 调研 — 引用来源 + memory教训
a) 42边纯净列表: 每条边的transfer_function和核心参数
b) I2-3b模板: l1-input/下12个compute — COMPUTE-{NAME}-v1格式
c) I2-3c模板: l2-internal/ + l3-output/ — 已验证的格式
d) memory/历史教训: 契约ID缺失→pre-commit阻断; as any零容忍; grep-refs必须先执行(V4.4.5)
e) 与I2-3b/3c零重叠确认: l1-input(12) + l2-internal(10) + l3-output(7) ≠ l4-capture/l5-reinput/cross-cycle

## Q2: 范围 — 做什么 + 不做什么
做什么: 13条新边×1 compute + 3测试 = 26个新文件
  环节4(7): value_pricing/customer_lockin/channel_delivery/competitive_positioning/procurement_bargaining/customer_data_loop/market_share_capture
  环节5(5): profit_reinvestment/talent_retention/knowledge_reuse/reputation_flywheel/retention_protects_knowledge
  跨环节(1): assumption_triggered_reallocation
不做什么: 不创建新哨兵; 不改哨兵aggregate.ts; 不更新index.ts
排除: extensions/sentinels/*/aggregate.ts, extensions/ontology/edge-types/*.json

## Q3: 验收 — 入口→处理→结果
入口: 26个新文件(13 compute + 13 test)
处理: 每compute含契约ID COMPUTE-{NAME}-v1 + JSDoc(输入/输出/降级)
结果: npx tsc --noEmit 零错误, npx vitest run 零新增失败, I2阶段3完成→42边全部有compute

## 架构层: L4(本体层compute) — l4-capture/ + l5-reinput/ + cross-cycle/
## Done 标准
- [x] verify: 26个新文件存在(13 compute + 13 test)
- [x] verify: 13个契约ID格式 COMPUTE-{NAME}-v1
- [x] verify: 39+个it(13×3) + expect >= 39
- [x] verify: I2阶段3完成: 42边全部有compute
- [x] verify: tsc零错误 / vitest零失败 / 零as any
