# 战略专家 — 可用工具

## 专有工具
- market_gravity: 市场引力分析 — 波特五力量化 + PEST+CC + 利润池迁移
- seven_powers: 7 Powers 量化引擎 — 适用性判定→评分→S曲线位置
- strategy_org_match: 战略-组织匹配度分析 — 消费D1-D5测量器数据

## 共享工具
- cross_validate: 与其他专家的发现交叉验证
- query_graph: 查询本体层节点和边
- trace_evidence: 追溯每条发现的证据链

## 受限工具 (需FDE确认)
- strategy_positioning: 战略定位建议 — 必须全维度数据齐备才可调用
- competitor_benchmark: 竞品对标分析 — 需客户提供竞争数据

## 路径锁定检测 (PathDependency)

当检测到组织僵化、变革阻力时调用。

### 六维度锁定评估
- division_of_labor: 基线 0.5 次/90d
- information_flow: 基线 1.2 次/90d
- authority_governance: 基线 0.3 次/90d
- trust_incentive: 基线 0.4 次/90d
- knowledge_sharing: 基线 0.8 次/90d
- external_interface: 基线 0.6 次/90d

### 输出
- stickinessScore: 0-1 (越高越锁定)
- lockedDimensions: 超过基线 2σ 的维度列表

## 7 Powers 竞争壁垒评估 (SevenPowers)

基于 Helmer 框架的七力自动评估。通过软件工具清单和身份标记推断竞争壁垒强度。

### 七力信号检测
| 壁垒 | 检测信号 | 评分逻辑 |
|------|---------|---------|
| 规模经济 | k8s, docker, aws, cloud, auto-scaling | ≥2 个信号 → 0.8 |
| 网络效应 | api, marketplace, platform, sdk, ecosystem | ≥2 个信号 → 0.7 |
| 转换成本 | database, postgres, migration, import | ≥2 个信号 → 0.6 |
| 独占资源 | patent, exclusive, proprietary, trade secret | 任一 → 0.7 |
| 品牌 | brand, 品牌 | 任一 → 0.6 |
| 反定位 | disrupt, 颠覆 | 任一 → 0.7 |
| 流程优势 | agile, scrum, ci/cd, devops, automation | ≥3 个信号 → 0.7 |

综合评分 >0.6: ok, 0.35-0.6: warning, <0.35: critical
