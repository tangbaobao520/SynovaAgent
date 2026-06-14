# D1/D4/D5 哨兵补充方案

> 2026-06-14 | 全量对齐手册 vs 代码差距分析 §3

## 现状

| 维度 | 手册要求 | 已覆盖 |
|------|---------|--------|
| D1 增长动力 | 4 测量器 | **0** |
| D2 组织能力 | 7 测量器 | ~5 (gap/cpc/pathdep/self-awareness/goal) |
| D3 人+Agent | 7 测量器 | ~7 (htm/hacd/hona/eob/self-awareness/*) |
| D4 软件生态 | 4 测量器 | **0** |
| D5 软件-Agent适配 | 4 测量器 | **0** |
| D6 战略健康 | 4 测量器 | 1 (seven-powers) |
| D7 风险预警 | 2+聚合 | 2 (key-person-risk + risk-aggregator) |

## D1 增长动力 — 4 个待建哨兵

### 1.1 营收分解 (Revenue Decomposition)
- **compute 函数**: `computeRevenueDecomposition(teamId)` 
- **数据源**: 财务连接器 (金蝶/用友/QuickBooks API)
- **频率**: 每月 1 日 9:00
- **输出**: 按产品线/渠道/区域的营收占比 + 集中度风险
- **现状**: 财务连接器未建 → 手持数据或手动导入作为 MVP
- **工期**: 2d (连接器) + 1d (哨兵)

### 1.2 客户动态 (Customer Dynamics)  
- **compute 函数**: `computeCustomerDynamics(teamId)`
- **数据源**: CRM 连接器 + 本体层客户节点
- **频率**: 每周一 9:00
- **输出**: 获客成本趋势 / 流失率 / LTV / 集中度(N个客户占M%营收)
- **现状**: CRM 连接器未建
- **工期**: 2d (连接器) + 1d (哨兵)

### 1.3 现金流 (Cash Flow)
- **compute 函数**: `computeCashFlow(teamId)`
- **数据源**: 银行流水连接器
- **频率**: 每日 9:00
- **输出**: 现金流预测 / 跑道(月) / 应收账款逾期率
- **现状**: 银行连接器未建
- **工期**: 3d (连接器) + 1d (哨兵)

### 1.4 单位经济学 (Unit Economics)
- **compute 函数**: `computeTokenEconomics(teamId)` ← 已存在！
- **哨兵**: `sentinel-token-economics` 已注册
- **覆盖**: ✅ 部分覆盖。需要扩展到非 AI 业务的单位经济学

## D4 软件生态 — 4 个待建哨兵

### 4.1 SaaS 利用率 (SaaS Utilization)
- **compute 函数**: `computeSaaSUtilization(teamId)`
- **数据源**: SaaS 管理平台 API (BetterCloud/Torii) 或手动盘点
- **频率**: 每周一 9:00
- **输出**: 在用 SaaS 数量 / 活跃率 / 重叠工具(多个工具做同一件事) / 闲置订阅
- **工期**: 2d (连接器) + 1d (哨兵)

### 4.2 数据孤岛 (Data Silos)
- **compute 函数**: `computeDataSilos(teamId)`
- **数据源**: 本体层系统节点 + 集成健康数据
- **频率**: 每月 1 日 9:00
- **输出**: 系统间数据流断点 / 手动搬运的数据量 / API 失败率
- **工期**: 1d (本体查询) + 1d (哨兵)

### 4.3 集成健康 (Integration Health)
- **compute 函数**: `computeIntegrationHealth(teamId)`
- **数据源**: 本体层集成边(integration edges)
- **频率**: 每日 9:00
- **输出**: 活跃集成数 / 失败率 / 数据延迟 / 集成债务(过时协议)
- **工期**: 1d (哨兵，本体层已有数据)

### 4.4 影子 IT (Shadow IT)
- **compute 函数**: `computeShadowIT(teamId)`
- **数据源**: 网络扫描 + 员工问卷
- **频率**: 每月 1 日 9:00
- **输出**: 未授权的 SaaS / 自建脚本 / 关键人离职会带走的工具
- **工期**: 3d (扫描工具) + 1d (哨兵)

## D5 软件-Agent适配 — 4 个待建哨兵

### 5.1 API 可访问性 (API Accessibility)
- **compute 函数**: `computeAPIAccessibility(teamId)`
- **数据源**: 本体层系统节点 + HTTP 可达性检测
- **频率**: 每日 9:00
- **输出**: API 可达率 / 认证方式 / 限流风险 / 文档完整度
- **工期**: 1d (哨兵，用现有 HTTP 检查)

### 5.2 数据就绪 (Data Readiness)
- **compute 函数**: `computeDataReadiness(teamId)`
- **数据源**: 本体层 + 数据质量检查
- **频率**: 每周一 9:00
- **输出**: 结构化数据比例 / 缺失字段率 / Schema 一致性 / PII 混入率
- **工期**: 1d (哨兵)

### 5.3 协议覆盖 (Protocol Coverage)
- **compute 函数**: `computeProtocolCoverage(teamId)`
- **数据源**: MCP/API 协议注册表
- **频率**: 每周一 9:00
- **输出**: MCP/标准 API 覆盖率 / 自定义协议数 / 协议版本不一致
- **工期**: 1d (哨兵)

### 5.4 安全边界 (Security Boundary)
- **compute 函数**: `computeSecurityBoundary(teamId)`
- **数据源**: 权限审计 + 本体层
- **频率**: 每日 9:00
- **输出**: Agent 访问权限膨胀 / 跨租户数据泄漏风险 / 未授权 PII 访问
- **工期**: 2d (审计集成) + 1d (哨兵)

## 实施优先级

### Phase 1 (无新连接器，可立即开工): 3 个哨兵

| 哨兵 | 维度 | 工期 | 优先级 |
|------|------|------|--------|
| 集成健康 | D4 | 1d | P0 — 本体层已有数据 |
| API 可访问性 | D5 | 1d | P0 — HTTP 检查即可 |
| 数据就绪 | D5 | 1d | P0 — 本体层查询 |

### Phase 2 (需要新连接器或外部数据): 6 个哨兵

| 哨兵 | 维度 | 工期 | 依赖 |
|------|------|------|------|
| 现金流 | D1 | 4d | 银行连接器 |
| 营收分解 | D1 | 3d | 财务连接器 |
| SaaS 利用率 | D4 | 3d | SaaS 管理 API |
| 数据孤岛 | D4 | 2d | 本体查询 |
| 协议覆盖 | D5 | 1d | MCP 注册表 |
| 安全边界 | D5 | 3d | 权限审计 |

### Phase 3 (需要深度集成): 3 个哨兵

| 哨兵 | 维度 | 工期 | 依赖 |
|------|------|------|------|
| 客户动态 | D1 | 3d | CRM 连接器 |
| 影子 IT | D4 | 4d | 网络扫描工具 |
| 单位经济学扩展 | D1 | 1d | 已有 token-economics 基础 |

## 总计

- 12 个新哨兵
- 3 个立即开工 (Phase 1, 3 天)
- 哨兵总数: 15 → 27 (覆盖 7/7 维度)
