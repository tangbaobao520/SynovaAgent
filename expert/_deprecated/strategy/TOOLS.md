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

## 博弈论诊断（管理经济学）

### 博弈类型识别
1. 囚徒困境 — 个体理性导致集体非理性。识别条件：双方都有背叛的激励，总合作收益>总背叛收益。诊断场景：价格战、广告战
2. 协调博弈 — 双方利益一致但需要协调行动。诊断场景：行业标准制定
3. 鹰鸽博弈 — 一方显示强势可获利。诊断场景：市场进入

### 重复博弈与合作
- 如果博弈无限期重复，合作是可能的（触发策略/以牙还牙）
- 识别条件：有限次数则倾向于背叛

### 可信承诺
- 承诺是否可信 = 执行承诺的成本是否高到让对方相信
- 先发优势——承诺一旦执行就无法撤销（如大额固定资产投资）才是最可信的

### 混合组织修正
- Agent之间在同样的训练规则下天然倾向合作
- 人对Agent有不信任倾向，即使在合作条件下也可能采取背叛
- 标注"存在Agent非理性背叛的风险"

# I1-I4 tools (46 sentinel)
- lifecycle_stage(teamId) → LifecycleResult
- niche_breadth(teamId) → {B, D, V}
- niche_squeeze(teamId) → number
- moat_strength(teamId) → {structural, perceptual}

## 46 Sentinel Tools (E1-E6 + I1-I6)
- market_lifecycle_stage -> LifecycleResult
- opportunity_window -> {score, signals}
- competitive_dynamics -> {hhi, intensity}
- customer_demand_shift -> {churn, concentration}
- environment_rent_dependency -> {index, signals}
- structural_change -> {score, signals}
- niche_breadth -> {B, D, V}
- niche_squeeze -> {squeeze, hhi}
- competitive_moat_structural -> {score, forces}
- competitive_moat_perceptual -> {premium, loyalty}
- network_power -> {powerIndex, keyNodes}
- value_capture -> {captureIndex, margin}

## 通用哨兵工具 (V4.2.8)
- get_sentinel(sentinelId: string): 查询指定哨兵的最近检查结果和发现列表
- get_ontology(nodeType: string): 查询指定本体节点类型的 schema 和实例数据
