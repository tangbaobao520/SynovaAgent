# Sentinel 哨兵全景 — 2026-06-14

## 23 哨兵 × 7 维度

### D1 增长动力 (4)
| ID | 名称 | 频率 | 类别 | 数据源 |
|----|------|------|------|--------|
| sentinel-revenue-decomposition | 营收分解 | 每月1日 | capability | FINANCIAL/DOCUMENT节点 |
| sentinel-customer-dynamics | 客户动态 | 每周一 | risk | CLIENT节点 |
| sentinel-cash-flow | 现金流 | 每日 | risk | FINANCIAL节点 |
| sentinel-token-economics | 单位经济学 | 每周一 | capability | agent/routing events |

### D2 组织能力 (5)
| ID | 名称 | 频率 | 类别 |
|----|------|------|------|
| sentinel-gap-dynamics | 缝隙动力学 | 每周一 | capability |
| sentinel-cpc | 协作协议完备性 | 每周一 | capability |
| sentinel-path-dependency | 路径依赖 | 每周一 | capability |
| sentinel-self-awareness | 自知偏差 | 每周一 | collaboration |
| sentinel-goal-alignment | 目标对齐度 | 每周一 | capability |

### D3 人+Agent (4)
| ID | 名称 | 频率 | 类别 |
|----|------|------|------|
| sentinel-htm | 混合信任模型 | 每日 | collaboration |
| sentinel-hacd | 人机协作深度 | 每日 | collaboration |
| sentinel-hona | 异质节点网络 | 每周一 | collaboration |
| sentinel-eob | 组织弹性边界 | 每周二 | capability |

### D4 软件生态 (2)
| ID | 名称 | 频率 | 类别 | 数据源 |
|----|------|------|------|--------|
| sentinel-integration-health | 集成健康 | 每日 | health | SOG集成边 |
| sentinel-data-silos | 数据孤岛 | 每月1日 | data-quality | SOG跨系统查询 |

### D5 软件-Agent适配 (3)
| ID | 名称 | 频率 | 类别 | 数据源 |
|----|------|------|------|--------|
| sentinel-api-accessibility | API可访问性 | 每日 | health | SOG TOOL + HTTP HEAD |
| sentinel-data-readiness | 数据就绪 | 每周一 | data-quality | graph_nodes完整性 |
| sentinel-protocol-coverage | 协议覆盖 | 每周一 | health | SOG TOOL协议统计 |

### D6 战略健康 (1)
| ID | 名称 | 频率 | 类别 |
|----|------|------|------|
| sentinel-seven-powers | 7Powers竞争壁垒 | 每月1日 | strategy |

### D7 风险预警 (4)
| ID | 名称 | 频率 | 类别 |
|----|------|------|------|
| sentinel-key-person-risk | 关键人风险 | 每周一 | risk |
| sentinel-risk-aggregator | 风险聚合 | 每周一 | risk |
| sentinel-financial-impact | 财务影响分析 | 每月1日 | risk |
| sentinel-financial-snapshot | 财务快照 | 每月1日 | risk |

## 覆盖率

```
D1 增长动力:      4/4 ✅ (100%)
D2 组织能力:      5/7 (71%)
D3 人+Agent:      4/7 (57%)
D4 软件生态:      2/4 (50%)
D5 软件-Agent适配: 3/4 (75%)
D6 战略健康:      1/4 (25%)
D7 风险预警:      4/4 ✅ (100%)
─────────────────────────
总计: 23/34 (68%)
```

数据源: 全部通过 SOG 图 + diagnosis_snapshots，不依赖外部连接器 (degraded 标记区分数据质量)

## API

- `GET /api/sentinel/health` — 23哨兵状态
- `GET /api/sentinel/findings` — 发现列表
- `GET /api/sentinel/signals` — 信号聚合
- `GET /api/sentinel/reports` — 专家诊断报告
- `GET /api/sentinel/tickets` — 哨兵工单 (L3闭环)
- `POST /api/sentinel/run/:id` — 手动触发
