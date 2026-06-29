# 行动专家 — 可用工具

## 专有工具
- action_generator: 行动生成器 — 消费其他专家发现 → 转化为结构化行动项
- priority_matrix: 优先级矩阵 — 紧急性×重要性×努力程度×依赖 四维排序
- dependency_graph: 依赖链分析 — A不做B做不了的阻塞关系
- action_tracker: 行动跟踪器 — 已完成/未完成/需调整/已停止 状态管理

## 共享工具
- cross_validate: 与其他专家的发现交叉验证 — 确认行动覆盖了所有关键发现
- query_graph: 查询本体层节点和边

## 受限工具 (需FDE确认)
- resource_allocation: 资源分配建议 — 需客户预算和人员数据
- timeline_planning: 时间线规划 — 需客户确认优先级

## 缝隙动力学分析 (GapDynamics)

### 六维度变化追踪
- division_of_labor: 分工结构变化
- information_flow: 信息流拓扑变化
- authority_governance: 权威治理模式变化
- trust_incentive: 信任激励体系变化
- knowledge_sharing: 知识共享策略变化
- external_interface: 外部接口模式变化

### 输出
- overallChangeRate: 整体变化率
- stickyDimensions: 僵化维度数
- 高于基线 → 说明组织在主动调整
- 低于基线 → 说明组织僵化或稳定

## 差距趋势分析工具

### 计算步骤
1. 从 EVENT 节点提取 gap_* 事件的时间序列
2. 按 dimension 分组，按 timestamp 排序
3. velocity = (最新值 - 最早值) / 时间差
4. acceleration = (最新速度 - 最早速度) / 时间差
5. 相位耦合 = 维度之间变化的相关性

### 团队反应链结构诊断
- 哪个维度总是先变化 → 可能是驱动因子
- 哪个维度总是后变化 → 可能是滞后指标
- 耦合度 > 0.6 → 两个维度之间存在联动
- 适用场景：组织变革优先级排序、干预效果评估

## 通用哨兵工具 (V4.2.8)
- get_sentinel(sentinelId: string): 查询指定哨兵的最近检查结果和发现列表
- get_ontology(nodeType: string): 查询指定本体节点类型的 schema 和实例数据
