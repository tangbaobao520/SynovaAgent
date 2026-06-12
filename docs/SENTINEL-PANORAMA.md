# Sentinel 哨兵全景 — 2026-06-13

## 架构

```
SentinelRegistry (11 哨兵)
  ↓
SentinelRunner (CronScheduler 驱动)
  ↓ executeSentinel() → check(context)
  ↓ BaselineStore.record() + .compare()
  ↓
SignalAggregator (每小时聚合)
  ↓ aggregateSignals()
  ↓ 交叉关联 + 严重度升级 + 专家路由
  ↓
Expert Pipeline (消费聚合信号)
```

## 11 哨兵

| # | ID | 名称 | 频率 | 类别 | 优先级 |
|---|----|------|------|------|--------|
| 1 | `sentinel-htm` | 混合信任模型 | 每日 9:00 | collaboration | P1 |
| 2 | `sentinel-hacd` | 人机协作深度 | 每日 9:00 | collaboration | P1 |
| 3 | `sentinel-self-awareness` | 自知偏差 | 周一 9:00 | collaboration | P2 |
| 4 | `sentinel-hona` | 异质节点网络 | 周一 9:00 | collaboration | P2 |
| 5 | `sentinel-gap-dynamics` | 缝隙动力学 | 周一 9:00 | capability | P1 |
| 6 | `sentinel-cpc` | 协作协议完备性 | 周一 9:00 | capability | P2 |
| 7 | `sentinel-path-dependency` | 路径依赖检测 | 周一 9:00 | capability | P2 |
| 8 | `sentinel-eob` | 组织弹性边界 | 周二 9:00 | capability | P1 |
| 9 | `sentinel-token-economics` | 单位经济学 | 周一 9:00 | capability | P2 |
| 10 | `sentinel-seven-powers` | 7Powers竞争壁垒 | 每月 1 日 | strategy | P1 |
| 11 | `sentinel-key-person-risk` | 关键人风险 | 周一 9:00 | risk | P0 |

## 手册覆盖度

```
D1 增长动力:     token-economics ✅  营收分解❌ 客户动态❌ 现金流❌
D2 组织能力:     gap ✅ cpc ✅ pathdep ✅ eob ✅ 目标对齐❌ 决策质量❌
D3 人+Agent:     htm ✅ hacd ✅ sa ✅ hona ✅ 渗透率❌ 技能迁移❌
D4 软件生态:     全缺
D5 软件-Agent适配: 全缺
D6 战略健康:     7p ✅ 品类认知❌ 定位❌ 差异化❌
D7 风险预警:     kpr ✅ 合规❌ 安全❌ 聚合引擎✅ (部分)
```

**覆盖率: 11/25 ≈ 44%**

## 信号→专家路由

| 信号类别 | 推荐专家 |
|---------|---------|
| collaboration | 组织专家 |
| capability | 组织 + 技术专家 |
| strategy | 战略专家 |
| risk | 战略 + 财务专家 |
| health | 技术专家 |
| data-quality | 技术专家 |

## 严重度升级规则

- ≥3 个不同哨兵指向同一实体 → critical
- ≥2 个 warning 来自不同哨兵 → 升级为 critical
- 基线偏离 >3x → critical
- 基线偏离 >2x → warning→critical 升级

## API

- `GET /api/sentinel/health` — 11 哨兵状态 + 基线统计
- `SentinelRunner.runOnce(id)` — 手动触发单个哨兵
- `getBaselineStore().compare(id, findings)` — 基线对比

## 测试

- 56 sentinel tests / 13 files
- 719 total tests / 99 files
