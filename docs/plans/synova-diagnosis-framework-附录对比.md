# 附录：当前哨兵 vs 零基设计对比

经审计，当前代码库中有 **16 个文件驱动哨兵**（extensions/sentinels/）+ **25 个旧适配器**（src/sentinel/adapters/，部分已标@deprecated）。

## A. 16 个文件驱动哨兵（当前实际存在的）

| 哨兵 | 专家 | 当前状态 | 零基设计决策 | 原因 |
|------|------|---------|------------|------|
| cost-health | finance | 有 aggregate + 真实计算逻辑 ✅ | 保留，重命名→**cost-efficiency** | 名字更准确。公式需要重写（当前毛利率算法来自 Novis） |
| revenue-health | finance | 有 aggregate stub，computes/ 空 | 保留 | 零基设计的 revenue-health 同样判断收入质量 |
| cash-runway | finance | 有 aggregate stub，computes/ 空 | 保留 | 零基设计的 cash-runway 同样判断现金可持续性 |
| profit-health | finance | 有 aggregate stub，computes/ 空 | ❌ 删除，合并入 cost-efficiency | 利润率是成本结构的一部分，独立哨兵太细 |
| financial-snapshot | finance | compute stub（来自 engine-core 桥接） | ❌ 删除 | 财务快照是内部数据收集，不是诊断信号 |
| token-economics | finance | compute stub（来自 engine-core 桥接） | 保留，重命名→**ai-investment-return** | 关注点从 Token 成本转向 AI 投入产出比 |
| collaboration-health | org | 有 aggregate stub + 1 compute（CPC 来自 Novis） | 保留，compute 重写 | 概念一致，但协作协议评估方法要换 |
| key-person-risk | org | 已有 L3 独立实现 ✅ | 保留 | 这是唯一真正的 SynovaAgent 原生实现 |
| htm | tech | compute stub（来自 engine-core 桥接） | ❌ 删除 | Novis 的"混合信任模型"基于通用 Agent 场景 |
| hacd | tech | compute stub（来自 engine-core 桥接） | ❌ 删除 | 合并入 collaboration-health |
| hona | org | compute stub（来自 engine-core 桥接） | ❌ 删除 | SynovaAgent 不做异质网络分析 |
| self-awareness | org | compute stub（来自 engine-core 桥接） | ❌ 删除 | 自评数据不可靠 |
| eob | business_model | compute stub（来自 engine-core 桥接） | ❌ 删除 | 边界管理不是增长瓶颈 |
| seven-powers | strategy | compute stub（来自 engine-core 桥接） | 保留，重写 compute | 7 Powers 框架正确，算法要基于企业数据 |
| path-dependency | strategy | compute stub（来自 engine-core 桥接） | 保留，重写 compute | 路径依赖检测正确，阈值要重新校准 |
| gap-dynamics | action | compute stub（来自 engine-core 桥接） | 保留，重命名→**execution-gap** | 概念一致，名字更准确 |

## B. 零基设计新增的哨兵（12 个）

| 新哨兵 | 专家 | 替代什么 | 判断什么 |
|--------|------|---------|---------|
| incentive-alignment | org | 新增（Novis 没有） | KPI 是否对齐增长目标？短期指标占比过高？ |
| market-position | strategy | 新增 | 行业结构是否支持增长？HHI/CR5 集中度 |
| competitive-moat | strategy | 替代 seven-powers（新版） | 护城河指标变化趋势（毛利/留存/研发） |
| vendor-risk | tech | 新增 | 外部技术依赖风险、单供应商集中度 |
| architecture-readiness | tech | 新增 | 架构是否 Agent 就绪？自动化率 |
| pricing-power | marketing | 新增 | 定价能力变化、折扣率趋势 |
| customer-health | marketing | 新增 | 客户流失率、NPS 趋势 |
| value-chain | business_model | 新增 | 价值链利润迁移、环节集中度 |
| revenue-model | business_model | 新增 | 收入来源分布、ARPU、续费率 |
| priority-sorter | action | 新增 | 跨哨兵优先级排序 |
| ai-investment-return | finance | 替代 token-economics | AI/LLM 投入产出比 |
| trust-health | org | 替代 htm | AI 工具信任度、采纳率 |

## C. 清除清单（7 个确定删除的 Novis 遗留）

| 哨兵 | 删除后能力去哪了？ | 影响 |
|------|-----------------|------|
| htm | trust-health 替代（判断标准完全不同） | 低 — htm 是 stub |
| hacd | 合并入 collaboration-health | 低 — hacd 是 stub |
| hona | 无直接替代 | 低 — hona 是 stub |
| self-awareness | 无直接替代 | 低 — stub |
| eob | 无直接替代 | 低 — stub |
| financial-snapshot | 财务快照不是哨兵信号 | 低 — stub |
| profit-health | 合并入 cost-efficiency | 低 — stub |

## D. 保留但需要重写的（8 个）

| 哨兵 | 保留什么 | 需要重写什么 |
|------|---------|------------|
| cost-health→cost-efficiency | 目录结构、manifest | compute 算法、aggregate 逻辑 |
| revenue-health | 目录结构、manifest、部分 aggregate | compute（CR5 算法要适配企业数据） |
| cash-runway | 目录结构、manifest | compute（基于 L4 FINANCIAL 节点） |
| collaboration-health | 概念、目录结构 | CPC compute（Novis 六维度不适用） |
| seven-powers | 目录结构、manifest | compute（算法基于企业数据非软件信号） |
| path-dependency | 目录结构、manifest | compute（基线要重新校准） |
| gap-dynamics→execution-gap | 目录结构、manifest、部分 aggregate | compute（阈值重新校准） |
| token-economics→ai-investment-return | 目录结构、manifest | 概念和算法全部重写 |
