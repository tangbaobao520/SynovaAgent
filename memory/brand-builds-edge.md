---
name: brand-builds-edge
description: BRAND_BUILDS 第17条边创建 — JSON Schema + EdgeType枚举 + compute + 测试
metadata:
  type: reference
---

# BRAND_BUILDS 边 — 品牌→营收长期因果链

创建于 T7a (2026-07-09)。16条边不覆盖品牌建设的长期滞后因果链（6-18个月），新增第17条。

## 文件清单

| 文件 | 类型 | 路径 |
|------|------|------|
| brand_builds.json | JSON Schema | extensions/ontology/edge-types/ |
| compute-brand-roi.ts | compute 函数 | extensions/sentinels/shared/computes/l2-value/ |
| compute-brand-roi.test.ts | 测试 (6场景) | tests/sentinels/shared/ |
| edge-types.ts | 修改 | packages/ontology/src/ |
| index.ts | 修改 (导出追加) | extensions/sentinels/shared/computes/ |

## 设计要点

- **学术基础**: Aaker(1991)品牌资产理论 + Keller(1993)CBBE模型
- **允许起点**: activity/acquisition, activity/innovation, activity/coordination
- **允许终点**: outcome/financial, outcome/market
- **requiredProps**: lag_months, brand_investment
- **数据映射**: awareness_lift←brand.json.awareness, premium_ratio_change←brand.json.premium_ratio, repeat_purchase_lift←brand.json.repeat_purchase_rate, nps_change←brand.json.nps

## computeBrandROI 契约

- **契约ID**: COMPUTE-BRAND-ROI-v1
- **公式**: f = awarenessLift×0.25 + premiumRatioChange×0.30 + repeatPurchaseLift×0.25 + npsChange×0.20; ROI = (revenue_lift - investment) / investment
- **降级**: dataMonths<6 → 跳过; 6≤dataMonths<18 → degraded; brandInvestment=0 → degraded

## 约束

- `grep -c BRAND_BUILDS packages/ontology/src/edge-types.ts` = 3 (EdgeType对象 + ALL_EDGE_TYPES + JSDoc)
- 零 `as any`
- 不修改已有 aggregate.ts 哨兵文件
