# SYNOVA Audit: 50 Sentinel aggregate.ts Inline 计算逻辑审计

**日期**: 2026-07-06
**审计范围**: 50个 `extensions/sentinels/{name}/aggregate.ts` 中的内联计算逻辑
**审计标准**: 数据查询类型正确性 / 数学公式正确性 / 阈值方向 / degraded处理
**合法SOGNodeType (18)**: Person, Team, Agent, Tool, Client, Process, Event, Document, Financial, Location, Goal, Capability, Risk, Compliance, User, KnowledgeChunk, BusinessModel, Supplier

> 注意: `queryNodes` 参数使用枚举的**字符串值**(如 `'Client'`, `'Person'`)，大写形式 (`'CLIENT'`, `'FINANCIAL'`) 仅当代码使用字符串字面量绕过枚举时才产生问题。

## 汇总
- aggregate总数: 50
- 有内联计算: 21
- 内联计算全部正确: 14
- 内联计算有问题: 7

## 问题按严重度排序

| # | 严重度 | 哨兵 | 问题类型 |
|---|--------|------|----------|
| 1 | FAIL | profit-health | catch空吞异常 -- `catch (err: any) { log.warn(...) }` 不返回 degraded Finding |
| 2 | FAIL | cost-health | catch空吞异常 -- 同上 |
| 3 | FAIL | revenue-health | catch空吞异常 -- 同上 |
| 4 | FAIL | cash-runway | catch空吞异常 -- 同上 |
| 5 | FAIL | api-coverage | 大写类型 `'TOOL'` 不在 SOGNodeType 枚举中 (应为 `'Tool'`) |
| 6 | FAIL | data-health | 大写类型 `'TOOL'`, `'APP'`, `'SYSTEM'`, `'ALL'` -- `'APP'`/`'SYSTEM'`/`'ALL'` 不在枚举中 |
| 7 | FAIL | software-health | 大写类型 `'TOOL'`, `'APP'`, `'SOFTWARE'` -- `'APP'`/`'SOFTWARE'` 不在枚举中 |
| 8 | WARN | revenue-health | 收入增长率计算逻辑有bug -- 使用 `revenueNodes[revenueNodes.length-2]` 作为上期，但 revenueNodes 是 filter 结果，逻辑脆弱 |
| 9 | WARN | market-lifecycle | `previousRevenue = currentRevenue * 0.85` 硬编码假数据 |
| 10 | WARN | competitive-moat-structural | `queryNodes('ALL', ...)` -- `'ALL'` 不在枚举中，且 slm = hardcoded 假数据 |
| 11 | WARN | internal-transaction-cost | `previousAdminCost = adminCost * 0.9` 硬编码假数据 |
| 12 | INFO | competitive-dynamics | traversal filter 中 `'MARKET_OUTCOME'`/`'COMPETITIVE_OUTCOME'` 不在枚举中 |


## 逐aggregate审计

### 1. adaptation-velocity
- 内联计算行号: L33-L36 (eventNodes + goalNodes 合并为 events 数组)
- 数据查询类型: `'Event'`, `'Goal'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅数据变换，重型计算在 compute 中)
- degraded处理: OK (有 try-catch + log.error + 返回 warning Finding)
- 总体: OK

### 2. agent-deployment-maturity
- 内联计算行号: L14-L16 (monitoredAgents count, recentErrors count, totalOps)
- 数据查询类型: `'Agent'`, `'Tool'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (简单过滤/计数，重型计算在 compute 中)
- degraded处理: OK
- 总体: OK

### 3. ai-ecosystem-fit
- 内联计算行号: L13-L14 (aiApis filter, aiPlatforms count)
- 数据查询类型: `'Tool'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (简单过滤后传参给 compute)
- degraded处理: OK
- 总体: OK

### 4. ai-investment-return
- 内联计算行号: L13-L17 (costSaved reduce, revenueUplift reduce, totalInvestment, paybackMonths)
- 数据查询类型: `'Tool'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK -- paybackMonths = totalInvestment / max(costSaved + revenueUplift, 1) 公式正确，除零保护到位
- degraded处理: OK
- 总体: OK

### 5. api-coverage
- 内联计算行号: L27 (tools map)
- 数据查询类型: `'TOOL'` -- **大写'T'，不是枚举值 'Tool'**
- 类型是否正确: **FAIL** -- `'TOOL'` 不是 SOGNodeType 枚举的标准字符串值。在 graph-bridge.ts 中，创建 Tool 节点使用 `SOGNodeType.TOOL` 即 `'Tool'`。用 `'TOOL'` 查询可能找不到节点。
- 计算逻辑: OK (全部委托给 compute 函数)
- degraded处理: OK
- 总体: NEEDS_FIX -- 将 `'TOOL'` 改为 `'Tool'`

### 6. business-model-coherence
- 内联计算行号: L14-L15 (allNodes concat)
- 数据查询类型: `'BusinessModel'`, `'Goal'`, `'Channel'`, `'Capability'`, `'FINANCIAL'`
- 类型是否正确: `'Channel'` -- **不在 SOGNodeType 枚举中**。`'FINANCIAL'` -- 大写形式不是枚举值（应为 `'Financial'`）。`'BusinessModel'` -- OK。
- 计算逻辑: OK (仅数据收集)
- degraded处理: OK
- 总体: NEEDS_FIX -- `'Channel'` 不属于合法节点类型; `'FINANCIAL'` 应改为 `'Financial'`

### 7. capital-efficiency
- 内联计算行号: L36-L39 (hasWaccOverride检测, waccValue赋值), L42-L43 (financialsForSpread map)
- 数据查询类型: `'FINANCIAL'` -- 大写，不是枚举值
- 类型是否正确: **FAIL** -- `'FINANCIAL'` 应改为 `'Financial'`
- 计算逻辑: OK (hasWaccOverride 逻辑正确)
- degraded处理: OK
- 总体: NEEDS_FIX -- `'FINANCIAL'` -> `'Financial'`

### 8. capital-structure
- 内联计算行号: L23-L24 (shortTermDebt avg, totalDebtAvg avg)
- 数据查询类型: `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- 同上
- 计算逻辑: OK (reduce+avg)
- degraded处理: OK
- 总体: NEEDS_FIX -- `'FINANCIAL'` -> `'Financial'`

### 9. capital-turnover
- 内联计算行号: L17 (finNodes map), L19-L24 (threshold checks + findings)
- 数据查询类型: `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- 同上
- 计算逻辑: OK (阈值判断方向正确: turnover<0.5 critical, <0.8 warning; daysOutstanding>90 critical, >60 warning)
- degraded处理: OK
- 总体: NEEDS_FIX -- `'FINANCIAL'` -> `'Financial'`

### 10. cash-runway
- 内联计算行号: L22-L23 (`traversal.traverse` 后 reduce), L31-L33 (降级路径 reduce), L36 (runwayMonths = totalCash / monthlyBurn), L38 (overdueRate = receivable / totalCash), L40-L48 (manifest阈值比较)
- 数据查询类型: `'Financial'` -- OK (降级路径)
- 类型是否正确: OK (降级路径用正确大小写)
- 计算逻辑: runwayMonths = totalCash / monthlyBurn -- 有除零保护 (`monthlyBurn > 0 ? ... : (totalCash > 0 ? Infinity : 0)`)。overdueRate = receivable / totalCash -- 有除零保护。公式正确。
- degraded处理: **FAIL** -- catch 使用 `log.warn(...)` 但没有返回 warning Finding (`return findings` 即空数组)，违反铁律 24 (空吞异常)。
- 总体: NEEDS_FIX -- catch 应返回 degraded Finding

### 11. channel-capacity
- 内联计算: 无 -- 全部委托 computeChannelCapacity(personNodes.length, teamNodes.length, eventNodes.length)
- 数据查询类型: `'Person'`, `'Team'`, `'Event'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅传参)
- degraded处理: OK
- 总体: OK

### 12. competitive-dynamics
- 内联计算行号: L26-L27 (competitors map)
- 数据查询类型: `'Market'`, `'FINANCIAL'` -- 大写 Financial
- 类型是否正确: `'FINANCIAL'` -> `'Financial'` **FAIL**
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 其他: traversal filter 中 `n.type === 'MARKET_OUTCOME' || n.type === 'COMPETITIVE_OUTCOME'` -- 这些类型不在枚举中
- 总体: NEEDS_FIX -- `'FINANCIAL'` -> `'Financial'`

### 13. competitive-moat-perceptual
- 内联计算行号: L15 (`(bp.premium + cl.loyalty) / 2`)
- 数据查询类型: `'Product'`, `'Client'` -- OK
- 类型是否正确: OK
- 计算逻辑: `score = (bp.premium + cl.loyalty) / 2` -- 简单平均，公式正确。阈值: score<0.2 critical, score<0.4 warning (低分=差)，方向正确。
- degraded处理: OK
- 总体: OK

### 14. competitive-moat-structural
- 内联计算行号: L21 (`(se.score + ne.score + sc.score + pp.score + (slm.applicable ? slm.slm : 0) + cr.score) / 6`)
- 数据查询类型: `'FINANCIAL'`, `'ALL'` -- `'ALL'` 不在枚举中，`'FINANCIAL'` 大写
- 类型是否正确: **FAIL** -- 两者都不对
- 计算逻辑: 六力平均 score -- 分母固定为6（即使 slm 不适用也除以6），当 slm 不适用时实际有效分母仍为6，可能压低了总体分数。这是设计选择，不算bug但值得注意。slm 参数硬编码 `{ incumbentMargin: 0.6, incumbentPrice: 100, ourPrice: 60, ourRevenue: 100, incumbentRevenue: 5000 }` -- 假数据。
- degraded处理: OK
- 总体: NEEDS_FIX -- 类型错误 + 硬编码假数据

### 15. connector-coverage
- 内联计算行号: L12-L15 (processes map)
- 数据查询类型: `'Tool'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: OK

### 16. cost-health
- 内联计算行号: L30-L31 (grossMargin = (revenue - cost) / revenue), L50-L52 (fixedCost/totalCost reduce), L53 (fixedRatio = fixedCost / totalCost)
- 数据查询类型: `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- 同上
- 计算逻辑: 毛利率 = (收入-成本)/收入 -- **公式正确**。fixedRatio = fixedCost / totalCost -- 有除零保护 (`if totalCost > 0`)。阈值方向: grossMargin <= critical 触发警告（低毛利=差）-- 方向正确。fixedRatio >= critical 触发警告（高固费比=差）-- 方向正确。
- degraded处理: **FAIL** -- catch 使用 `log.warn(...)` 但没有返回 warning Finding，违反铁律 24。
- 总体: NEEDS_FIX -- 类型错误 + 空吞异常

### 17. customer-demand-shift
- 内联计算行号: L23-L27 (clients map)
- 数据查询类型: `'CLIENT'` -- 大写，不是枚举值
- 类型是否正确: **FAIL** -- 应为 `'Client'`
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: NEEDS_FIX -- `'CLIENT'` -> `'Client'`

### 18. data-health
- 内联计算行号: L26 (allNodes query), L54-L57 (allSystems merge), L58-L61 (edges 空数组)
- 数据查询类型: `'ALL'`, `'TOOL'`, `'APP'`, `'SYSTEM'`
- 类型是否正确: **FAIL** -- `'ALL'` 不在枚举中; `'TOOL'` 应改为 `'Tool'`; `'APP'` 不在枚举中; `'SYSTEM'` 不在枚举中
- 计算逻辑: OK (edges 硬编码为空数组，注释说明 GraphStoreReader 不支持 queryEdges)
- degraded处理: OK
- 总体: NEEDS_FIX -- 4个类型名无效

### 19. environment-rent-dependency
- 内联计算行号: L22 (financials map)
- 数据查询类型: `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- 应为 `'Financial'`
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: NEEDS_FIX

### 20. explore-exploit-balance
- 内联计算行号: L17-L18 (recentProducts filter by date, twelveMonthsAgo 计算)
- 数据查询类型: `'Goal'`, `'Document'`, `'Product'` -- OK
- 类型是否正确: OK
- 计算逻辑: recentProducts 过滤 -- 使用 `createdAt || created_at` 转换为日期后比较。如果两者都 undefined，`c ? ... : true` 会返回 true (视作新产品)。这是合理的默认（缺失数据不隐藏风险），但可能导致高估。
- degraded处理: OK
- 总体: OK (边界情况处理可接受)

### 21. financing-constraint
- 内联计算: 无 -- 全部委托 computeKzIndex
- 数据查询类型: `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- 同上
- 计算逻辑: OK (仅数据准备 + 委托)
- degraded处理: OK
- 总体: NEEDS_FIX -- 类型名

### 22. growth-quality
- 内联计算: 无 -- 全部委托 computeCashConversionRate + computeOrganicGrowthPct
- 数据查询类型: `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- 同上
- 计算逻辑: OK
- degraded处理: OK
- 总体: NEEDS_FIX -- 类型名

### 23. human-agent-boundary
- 内联计算行号: L12-L13 (automatedPct, handoffs filter), L15-L19 (computeHumanAgentBoundary 参数构造)
- 数据查询类型: `'Tool'`, `'Process'` -- OK
- 类型是否正确: OK
- 计算逻辑: `automatedPct` 简单除法。`postAgentThroughput = 100 * (1 + automatedPct * 0.5)` -- 线性假设，合理。`satisfactionScore: 0.7` -- 硬编码。
- degraded处理: OK
- 总体: OK

### 24. incentive-alignment
- 内联计算: 无 (仅数据整形成 Goal/Event 数组)
- 数据查询类型: `'Goal'`, `'Event'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (全部委托)
- degraded处理: OK
- 总体: OK

### 25. info-distortion
- 内联计算行号: L20-L22 (managerCount filter), L24-L28 (failureEvents filter)
- 数据查询类型: `'Person'`, `'Event'` -- OK
- 类型是否正确: OK
- 计算逻辑: managerCount -- 判断 `manager !== undefined || reportsTo !== undefined || isManager === true`，逻辑合理。failureEvents -- 搜索 eventType 中的关键词，合理。
- degraded处理: OK
- 总体: OK

### 26. internal-transaction-cost
- 内联计算行号: L17-L18 (totalCost reduce, adminCost reduce)
- 数据查询类型: `'FINANCIAL'`, `'Team'`, `'Event'` -- 大写 Financial
- 类型是否正确: **FAIL** -- `'FINANCIAL'` -> `'Financial'`
- 计算逻辑: `previousAdminCost = adminCost * 0.9` -- **硬编码假数据**。`previousTotalCost = totalCost * 0.9` -- **硬编码假数据**。
- degraded处理: OK
- 总体: NEEDS_FIX -- 类型 + 假数据

### 27. key-person-risk
- 内联计算: 无 -- 直接委托 `checkKeyPersonRisk(store, teamId)` 到 L3
- 数据查询类型: 无 (委托给 L3 函数)
- 类型是否正确: OK (不在 aggregate 中查询)
- 计算逻辑: OK
- degraded处理: 无 catch (委托给 L3 层处理)
- 总体: OK

### 28. knowledge-accessibility
- 内联计算: 无 (仅传 count 给 compute)
- 数据查询类型: `'Document'`, `'KnowledgeChunk'`, `'Capability'`, `'Person'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (全部委托)
- degraded处理: OK
- 总体: OK

### 29. make-or-buy
- 内联计算行号: L12 (capNodes map)
- 数据查询类型: `'Capability'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: OK

### 30. market-lifecycle
- 内联计算行号: L30-L31 (revenues reduce, previousRevenue = currentRevenue * 0.85)
- 数据查询类型: `'Market'`, `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- `'FINANCIAL'` -> `'Financial'`
- 计算逻辑: `previousRevenue = currentRevenue * 0.85` -- **硬编码假数据** (假设上年为当年85%)
- degraded处理: OK
- 总体: NEEDS_FIX -- 类型 + 假数据

### 31. moat-dependency
- 内联计算行号: L9 (`computeMoatDependency(0.6, 0.3)` -- 硬编码参数)
- 数据查询类型: 无 (不查询数据)
- 类型是否正确: N/A (不查询)
- 计算逻辑: 两个参数硬编码 -- 未从存储读取任何数据
- degraded处理: OK
- 总体: WARN -- 硬编码参数，不是从 store 读取的

### 32. network-power
- 内联计算行号: L10 (4种节点合并)
- 数据查询类型: `'Person'`, `'Agent'`, `'Client'`, `'Supplier'` -- OK (`'Supplier'` 不在枚举中)
- 类型是否正确: `'Supplier'` -- **不在 SOGNodeType 枚举中**。但可能作为扩展类型存在于实际数据中。
- 计算逻辑: OK (仅收集节点)
- degraded处理: OK
- 总体: OK (Supplier 可能是合理的扩展类型)

### 33. niche-breadth
- 内联计算行号: L13-L16 (segments map)
- 数据查询类型: `'Client'`, `'Location'`, `'Market'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: OK

### 34. niche-squeeze
- 内联计算行号: L10-L11 (nodes 合并, competitors map)
- 数据查询类型: `'Market'`, `'Client'`, `'Supplier'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: OK

### 35. opportunity-window
- 内联计算行号: L26-L29 (events 合并 eventNodes + toolNodes)
- 数据查询类型: `'Event'`, `'Tool'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅合并数据)
- degraded处理: OK
- 总体: OK

### 36. org-repairability
- 内联计算行号: L23-L29 (events map，含 problemCategory/resolved 等字段提取)
- 数据查询类型: `'Event'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅数据变换，重型计算在 compute)
- degraded处理: OK
- 总体: OK

### 37. power-rigidity
- 内联计算行号: L22-L33 (decisionApprovals filter, ceoApprovals filter, managers filter)
- 数据查询类型: `'Person'`, `'Event'` -- OK
- 类型是否正确: OK
- 计算逻辑: 关键词匹配 (`type.includes('decision_approval')`, `initiator.includes('ceo')`) -- 语言相关的字符串匹配，跨语言可能失效，但在中文/英文混合场景下基本合理。
- degraded处理: OK
- 总体: OK

### 38. process-ai-readiness
- 内联计算行号: L12-L13 (connectors filter), L14-L18 (computeProcessAiReadiness 参数构造含 structuredDataRatio 计算)
- 数据查询类型: `'Tool'`, `'Process'` -- OK
- 类型是否正确: OK
- 计算逻辑: `structuredDataRatio = tools.length > 0 ? connectors.length / tools.length : 0` -- 公式正确。`teamSkillAvg: 3` -- 硬编码。
- degraded处理: OK
- 总体: OK

### 39. profit-health
- 内联计算行号: L22-L25 (revenue/cost reduce, profitMargin 计算, marginVsBenchmark)
- 数据查询类型: `'Financial'` -- OK
- 类型是否正确: OK
- 计算逻辑: `profitMargin = (revenue - cost) / revenue` -- **公式正确**。`benchmarkMargin = 0.25` -- 硬编码通用基准。
- **阈值bug分析**: `marginVsBenchmark <= critical` 触发 -- 如果 critical 为负数（如 -0.1），profitMargin 25% 时 marginVsBenchmark = 0 (25%-25%)，不触发。如果 profitMargin 10%，marginVsBenchmark = -0.15 <= -0.1，触发 critical。方向正确。
- **第二个阈值**: `profitMargin <= Math.abs(t.profit_margin_change.critical)` -- 使用 Math.abs 有问题！如果 critical=-0.05，`Math.abs(-0.05)=0.05`，profitMargin 5% 会触发。但如果 critical=0，`Math.abs(0)=0`，任何正利润都不会触发。这个逻辑有设计疑问，可能与 manifest 的意图不符（critical 阈值通常是负值，表示容忍的最大亏损率）。
- degraded处理: **FAIL** -- `catch (err: any) { log.warn(...); }` 空吞异常不返回 Finding
- 总体: NEEDS_FIX -- 空吞异常 + Math.abs 逻辑可疑

### 40. resource-misallocation
- 内联计算行号: L23-L36 (goals map, resources 构造)
- 数据查询类型: `'Goal'`, `'Person'`, `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- `'FINANCIAL'` -> `'Financial'`
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: NEEDS_FIX -- 类型名

### 41. revenue-health
- 内联计算行号: L32-L34 (totalRevenue reduce, cr5 计算), L42-L46 (growth 计算: `prev = Number(revenueNodes[revenueNodes.length - 2]?.props.amount || 0)`)
- 数据查询类型: `'Financial'`, `'Client'` -- OK (降级路径)
- 类型是否正确: OK (降级路径用正确大小写)
- 计算逻辑: `cr5 = clientCount > 0 ? Math.min(1, clientCount / 5) : 0` -- 这是对 CR5 的极简近似（不计算前5客户收入占比，而是用客户数/5代替），严格来说不正确。真正的 CR5 需要前5大客户收入/总收入。当前逻辑当有5个以上客户时 cr5=1，会触发 critical（因为 `cr5 >= t.customer_concentration.critical` 当 critical 阈值较低时）。
- **增长率bug**: `revenueNodes[revenueNodes.length - 2]` 试图取倒数第二个元素作为上期 -- 但这假设数组按时间排序，且恰好有2个元素。如果只有1个 revenueNode，`length-2 = -1`，`revenueNodes[-1]` 是 undefined，prev = 0，导致 `growth = (totalRevenue - 0) / 0 = Infinity`。**除零bug!**
- degraded处理: **FAIL** -- catch 空吞异常 (`log.warn(...)` 不返回 Finding)
- 总体: NEEDS_FIX -- 除零bug + 空吞异常 + CR5 近似不准确

### 42. routine-diffusion
- 内联计算: 无 (仅传 count)
- 数据查询类型: `'Process'`, `'Team'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (全部委托)
- degraded处理: OK
- 总体: OK

### 43. routine-mutation
- 内联计算行号: L22-L25 (routines map), L27-L29 (events map)
- 数据查询类型: `'Process'`, `'Event'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: OK

### 44. software-health
- 内联计算行号: L44-L48 (降级路径: allTools merge `[...toolNodes, ...appNodes, ...swNodes]`)
- 数据查询类型: `'TOOL'`, `'APP'`, `'SOFTWARE'`
- 类型是否正确: **FAIL** -- `'TOOL'` 应改为 `'Tool'`; `'APP'` 不在枚举中; `'SOFTWARE'` 不在枚举中
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: NEEDS_FIX -- 3个类型名无效

### 45. strategy-capability-fit
- 内联计算: 无 (仅数据整形)
- 数据查询类型: `'Goal'`, `'Capability'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (全部委托)
- degraded处理: OK
- 总体: OK

### 46. structural-change
- 内联计算行号: L15 (events 合并 + map)
- 数据查询类型: `'Event'`, `'Compliance'` -- OK
- 类型是否正确: OK
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: OK

### 47. talent-density
- 内联计算行号: L23-L27 (highSkill filter)
- 数据查询类型: `'Person'`, `'Capability'` -- OK (但 Capability 查询后未实际使用)
- 类型是否正确: OK
- 计算逻辑: highSkill 判断: `Array.isArray(skills) && skills.length > 0` -- 有技能即高技能? 这个判断偏宽松。但核心逻辑在 compute 中，仅用于参数传递。
- degraded处理: OK
- 总体: OK (logic acceptable as parameter prep)

### 48. time-penetration
- 内联计算行号: L9 (`computeTimePenetration(events.length, 0)`)
- 数据查询类型: `'Event'` -- OK
- 类型是否正确: OK
- 计算逻辑: `computeTimePenetration(events.length, 0)` -- 第二个参数硬编码为 0
- degraded处理: OK
- 总体: OK (minimal inline)

### 49. unit-economics
- 内联计算行号: L79 (totalOpEx reduce, fallback costEdges), L87-L95 (clientGroups 构造)
- 数据查询类型: `'FINANCIAL'`, `'CLIENT'` -- 都是大写
- 类型是否正确: **FAIL** -- `'FINANCIAL'` -> `'Financial'`, `'CLIENT'` -> `'Client'`
- 计算逻辑: `clientGroups` fallback 中 `variableCost = unitCost / fin.length * 100` -- 这个 `*100` 看起来可疑（单位成本乘以100），可能是个bug。但仅在 clientNodes.length === 0 的 fallback 路径使用。
- degraded处理: OK
- 总体: NEEDS_FIX -- 类型名错误，variableCost `*100` 可疑

### 50. value-capture
- 内联计算行号: L9 (finNodes 查询 'FINANCIAL'), L10 (financials map)
- 数据查询类型: `'FINANCIAL'` -- 大写
- 类型是否正确: **FAIL** -- 应为 `'Financial'`
- 计算逻辑: OK (仅数据整形)
- degraded处理: OK
- 总体: NEEDS_FIX -- 类型名

## 大写类型名汇总 (系统性问题)

以下哨兵使用大写类型名字符串(`'FINANCIAL'`, `'CLIENT'`, `'TOOL'`, `'APP'`, `'SYSTEM'`, `'SOFTWARE'`, `'ALL'`), 而 SOGNodeType 枚举定义为 PascalCase (`'Financial'`, `'Client'`, `'Tool'`):

| 大写字符串 | 出现次数 | 哨兵 |
|-----------|---------|------|
| `'FINANCIAL'` | 16 | value-capture, internal-transaction-cost, capital-turnover, competitive-moat-structural, financing-constraint, growth-quality, capital-structure, environment-rent-dependency, capital-efficiency, cost-health, market-lifecycle, competitive-dynamics, resource-misallocation, unit-economics, business-model-coherence |
| `'CLIENT'` | 2 | customer-demand-shift, unit-economics |
| `'TOOL'` | 4 | api-coverage, data-health, software-health |
| `'APP'` | 2 | data-health, software-health |
| `'SYSTEM'` | 1 | data-health |
| `'SOFTWARE'` | 1 | software-health |
| `'ALL'` | 2 | data-health, competitive-moat-structural |

**根本原因分析**: `graph-bridge.ts` 使用 `SOGNodeType.FINANCIAL` (值为 `'Financial'`) 创建节点。`queryNodes` 的实现在 graph-store 中做**精确字符串匹配**。如果 aggregate 用 `'FINANCIAL'` 查询而 store 中存的是 `'Financial'`，查询将返回空数组 -- 导致哨兵永远返回"无数据"。

这取决于 `queryNodes` 的具体实现。如果它做了大小写不敏感匹配，则不会有问题。由于无法在此审计中验证 Runtime 行为，标记为 **NEEDS_FIX** 是最安全的做法。

## 空吞异常汇总 (系统性问题)

4个哨兵 (cash-runway, cost-health, profit-health, revenue-health) 使用 `catch (err: any) { log.warn(...); }` 模式，catch 后返回空 findings 数组而非 degraded Finding:

- **cash-runway** L48: `catch (err: unknown) { log.warn({ err, teamId }, '...'); }` -> `return findings;`（空数组）
- **cost-health** L69: `catch (err: any) { log.warn({ err, teamId }, '...'); }` -> `return findings;`（空数组）
- **profit-health** L42: `catch (err: any) { log.warn({ err, teamId }, '...'); }` -> `return findings;`（空数组）
- **revenue-health** L50: `catch (err: any) { log.warn({ err, teamId }, '...'); }` -> `return findings;`（空数组）

这4个都违反了铁律 24 (catch 必须返回 degraded 标记) 和铁律 31 (降级信号传播)。调用方拿到空数组，无法区分"无问题"和"检测失败"。

## 硬编码数据汇总

| 哨兵 | 硬编码内容 |
|------|-----------|
| competitive-moat-structural | slm = `{ incumbentMargin: 0.6, incumbentPrice: 100, ourPrice: 60, ourRevenue: 100, incumbentRevenue: 5000 }` |
| internal-transaction-cost | `previousAdminCost = adminCost * 0.9`; `previousTotalCost = totalCost * 0.9` |
| market-lifecycle | `previousRevenue = currentRevenue * 0.85` |
| moat-dependency | `computeMoatDependency(0.6, 0.3)` |
| profit-health | `benchmarkMargin = 0.25` |
| human-agent-boundary | `satisfactionScore: 0.7`, `preAgentThroughput: 100` |
| process-ai-readiness | `teamSkillAvg: 3` |

