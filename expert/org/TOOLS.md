# 组织专家 — 可用工具

## 专有工具
- org_structure_scan: 组织架构扫描 — 层级数、管理幅度、信息流分析
- key_person_risk: 关键人依赖分析 — Bus Factor量化、离职影响评估
- agent_readiness: Agent化机会识别 — 流程×维度评估矩阵
- collaboration_health: 协作健康度 — 跨部门交互密度、信息断裂点检测

## 共享工具
- cross_validate: 与其他专家的发现交叉验证
- query_graph: 查询本体层节点和边
- trace_evidence: 追溯每条发现的证据链

## 受限工具 (需FDE确认)
- org_restructure: 组织架构调整建议 — 需充分了解业务和人员
- team_performance: 团队绩效分析 — 需明确的绩效数据来源

## 协作协议完备度检查 (CPC)

当诊断涉及团队协作效率、跨部门沟通时调用此工具。

### 六维度评估矩阵
| 维度 | 检查内容 | 数据来源 |
|------|---------|---------|
| 分工明确度 | 角色分配是否清晰 | L4 GraphStore Person 节点 |
| 信息流通度 | 团队间 INTERACTS_WITH 边密度 | L4 GraphStore 边数据 |
| 权威治理度 | 决策流程是否明确 | Process 节点 |
| 信任激励度 | 激励机制是否对齐 | Goal 节点 |
| 知识共享度 | 知识是否在团队间流动 | KNOWLEDGE_CHUNK 节点 |
| 外部接口度 | 对外协作是否规范 | Client 节点 |

### 评分方法
- 每个维度 0-1 分
- < 0.4: 该维度存在协议缺失
- 综合分 = 六维度均值
