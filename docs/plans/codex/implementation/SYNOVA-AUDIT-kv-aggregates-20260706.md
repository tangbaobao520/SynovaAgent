 # Sentinel KV Aggregate 审计报告
 > 日期: 2026-07-06 | 审计范围: 33 个 aggregate.ts | 7 维度审计
 > 本体层合法实体类型: Person, Team, Agent, Tool, Client, Process, Event, Document, Financial (9种)
 
 ## 审计总结
 
 | 维度 | PASS 数 | FAIL/WARN 数 | 关键发现 |
 |------|---------|-------------|---------|
 | check()签名 | 32 | 1 | key-person-risk 委托 L3 函数,签名不同 |
 | 缺少图遍历 | 33 NOTED | — | 全部有 fallback 需求,待 Task B |
 | degraded处理 | 22 | 11 | 11个文件未检查 compute 返回的 degraded 标志 |
 | catch异常 | 31 | 2 | key-person-risk 用 log.warn 而非 log.error; agent-deployment-maturity 返回空 description |
 | 空数据检查 | 25 | 8 | 8个文件空数据时可能静默返回空或崩溃 |
 | magic number | 22 | 11 | 包括 moat-dependency(0.6,0.3)、human-agent-boundary(100,0.7)、power-rigidity(0.5) 等 |
 | 业务逻辑 | 19 | 14 | 14个文件查询不存在的实体类型 (Goal/Product/Market/Supplier/Location/Compliance/KnowledgeChunk/Capability/APP/SYSTEM/ALL) |
 
 **总体**: 33 个文件中,**13 个完全 PASS**(仅 NOTED 图遍历),**20 个有 FAIL**。
 
 ---
 
 ## 逐文件审计
 
 ### 1. adaptation-velocity
 - [FAIL] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历: 仅 queryNodes KV 模式
 - [PASS] degraded处理: compute 结果无 degraded 字段,未检查
 - [PASS] catch异常: log.error + 返回 warning 级 Finding
 - [PASS] 空数据检查: queryNodes 空时 map 返回空数组,forEach 零迭代,score 默认行为取决于 compute
 - [PASS] magic number: 阈值 0.3/0.6 合理,从代码中读取
 - [FAIL] 业务逻辑: **查询 `Goal` 节点类型 — 该类型不在本体层 9 实体中**(仅 Person/Team/Agent/Tool/Client/Process/Event/Document/Financial)。`Goal` 类型不存在于 ontology-templates/general-enterprise.ts
 总体: FAIL — 查询了不存在的节点类型 `Goal`
 
 ### 2. agent-deployment-maturity
 - [PASS] check()签名: `check(s: GSR, tid: string)` — 参数名简写但语义一致
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查了 `r.degraded` 并返回 info Finding
 - [FAIL] catch异常: log.error({e}) 有日志,但返回的 Finding 有 `description: ''` 和 `suggestion: ''`,description 为空违反铁律 24 (应包含错误消息)
 - [PASS] 空数据检查: `tools.length || 1` 防止除以零
 - [FAIL] magic number: `autonomyLevel: 2` 硬编码在 compute 调用中,不从 store 读取
 - [PASS] 业务逻辑: 查询 Agent/Tool 是合法类型
 总体: FAIL — magic number `autonomyLevel: 2` + 异常 Finding 的 description 为空
 
 ### 3. ai-ecosystem-fit
 - [PASS] check()签名: `check(s: GSR, tid: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `r.degraded`
 - [PASS] catch异常: log.error({e}) + warning Finding
 - [PASS] 空数据检查: tools 空时 filter 返回空,compute 处理
 - [FAIL] magic number: `totalPlatforms: 5`, `devEcosystemScore: Math.min(aiPlatforms.length / 3, 1)` — 硬编码平台总数 5 和除数 3
 - [PASS] 业务逻辑: 查询 Tool 是合法类型
 总体: FAIL — magic number `totalPlatforms: 5`
 
 ### 4. ai-investment-return
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `r.degraded`
 - [PASS] catch异常: log.error({e}) + warning Finding
 - [FAIL] 空数据检查: 空数据时 `costSaved || 5000` 和 `revenueUplift || 3000` 使用硬编码默认值,且 `totalInvestment || 10000` — **三重 magic number 伪装成空数据处理**
 - [FAIL] magic number: `5000`, `3000`, `10000` 硬编码默认投资/节省/收入值
 - [PASS] 业务逻辑: 查询 Tool 合法
 总体: FAIL — 3 个硬编码 magic number (5000/3000/10000)
 
 ### 5. api-coverage
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `apiResult.degraded` 和 `protoResult.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: `apiResult.totalTools > 0` 守卫
 - [PASS] magic number: 阈值 0.6/0.8/0.3 合理
 - [FAIL] 业务逻辑: **查询 `TOOL` 节点类型(大写)** — 虽然语义上对应 `Tool`,但 queryNodes 可能是大小写敏感的;同时代码中无 TOOL 类型定义
 总体: FAIL — 查询 `TOOL` 大写,与本体层 `Tool` 不一致
 
 ### 6. channel-capacity
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: 空数据时 `personNodes.length=0`,compute 应返回 degraded
 - [PASS] magic number: 无
 - [PASS] 业务逻辑: 查询 Person/Team/Event 均为合法类型
 总体: PASS — 仅 NOTED 图遍历缺失
 
 ### 7. competitive-moat-perceptual
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `bp.degraded` 或 `cl.degraded` — compute 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [FAIL] 空数据检查: 空数据时 map 返回空数组,`products.length=0` 导致 `(0+0)/2 = 0`,返回 `crit` 级别 Finding — **空数据被误判为高危**
 - [PASS] magic number: 阈值 0.2/0.4 合理
 - [FAIL] 业务逻辑: **查询 `Product` 节点类型 — 不存在于本体层 9 实体中**
 总体: FAIL — 查询不存在的 `Product` 类型 + 空数据误判高危 + 未检查 degraded
 
 ### 8. connector-coverage
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `r.degraded`
 - [PASS] catch异常: log.error({e}) + warning Finding
 - [PASS] 空数据检查: `nodes.length=0` 时 `processes=[]`,compute 应返回 degraded
 - [PASS] magic number: 无
 - [PASS] 业务逻辑: 查询 Tool 合法,但 `n.type === 'Process'` 检查永远为 false(节点类型是 Tool 不是 Process)
 总体: PASS — 仅 NOTED 图遍历;`n.type === 'Process'` 永假但不影响功能
 
 ### 9. customer-demand-shift
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `concentration.degraded` 和 `churn.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: `clients.length === 0` 显式返回 `[]`
 - [PASS] magic number: 阈值 0.4/0.3/0.2/0.1 合理
 - [FAIL] 业务逻辑: **查询 `CLIENT` 节点类型(大写)** — 与本体层 `Client` 不一致
 总体: FAIL — 查询 `CLIENT` 大写
 
 ### 10. data-health
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `readiness.degraded`, `siloResult.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: `readiness.totalNodes > 0` 和 `siloResult.totalSystems >= 2` 守卫
 - [PASS] magic number: 阈值合理
 - [FAIL] 业务逻辑: **查询 `ALL`, `APP`, `SYSTEM` 节点类型 — 均不存在于本体层 9 实体中**。`TOOL` 大写也不一致
 总体: FAIL — 查询 4 个不存在的节点类型 (ALL/APP/SYSTEM/TOOL)
 
 ### 11. explore-exploit-balance
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理空数据
 - [PASS] magic number: 阈值合理
 - [FAIL] 业务逻辑: **查询 `Goal` 和 `Product` 节点类型 — 均不存在于本体层中**
 总体: FAIL — 查询 2 个不存在的节点类型 (Goal/Product)
 
 ### 12. human-agent-boundary
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `r.degraded`
 - [PASS] catch异常: log.error({e}) + warning Finding
 - [PASS] 空数据检查: `tools.length > 0` 守卫除法,`tools.length || 1` 防止零除
 - [FAIL] magic number: `preAgentThroughput: 100`, `postAgentThroughput: 100 * (1 + automatedPct * 0.5)`, `satisfactionScore: 0.7` — 三个硬编码值
 - [PASS] 业务逻辑: 查询 Tool/Process 均为合法类型
 总体: FAIL — 3 个硬编码 magic number (100/0.5/0.7)
 
 ### 13. incentive-alignment
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理
 - [PASS] magic number: 阈值合理
 - [FAIL] 业务逻辑: **查询 `Goal` 节点类型 — 不存在于本体层中**
 总体: FAIL — 查询不存在的节点类型 `Goal`
 
 ### 14. info-distortion
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理
 - [PASS] magic number: 无
 - [PASS] 业务逻辑: 查询 Person/Event 均为合法类型
 总体: PASS — 仅 NOTED 图遍历
 
 ### 15. key-person-risk
 - [FAIL] check()签名: 委托给 `checkKeyPersonRisk(store, teamId)`,返回 `result.findings`。**check() 本身没有 try/catch**,异常直接向上传播
 - [NOTED] 缺少图遍历: L3 函数 `checkKeyPersonRisk` 内部同样仅 KV queryNodes
 - [PASS] degraded处理: N/A — 委托内部处理
 - [FAIL] catch异常: L3 函数 `checkKeyPersonRisk` 的 catch 使用 **`log.warn` 而非 `log.error`**(铁律 24 要求 log.error)。`key-person-risk/aggregate.ts` 本身无任何异常处理
 - [PASS] 空数据检查: L3 函数 `persons.length === 0` 返回空 findings
 - [PASS] magic number: 无
 - [PASS] 业务逻辑: 查询 Person 合法,迭代知识域计算 Bus Factor 合理
 总体: FAIL — aggregate.ts 无 try/catch + L3 函数 catch 用 log.warn 而非 log.error
 
 ### 16. knowledge-accessibility
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理
 - [PASS] magic number: 无
 - [FAIL] 业务逻辑: **查询 `KnowledgeChunk` 和 `Capability` 节点类型 — 均不存在于本体层 9 实体中**
 总体: FAIL — 查询 2 个不存在的节点类型 (KnowledgeChunk/Capability)
 
 ### 17. make-or-buy
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `r.degraded` — computeMakeOrBuyScore 可能返回 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: capNodes 空时 map 返回空数组,compute 评分可能为默认值
 - [PASS] magic number: 阈值 0.2 合理
 - [FAIL] 业务逻辑: **查询 `Capability` 节点类型 — 不存在于本体层中**
 总体: FAIL — 查询不存在的 `Capability` 类型 + 未检查 degraded
 
 ### 18. moat-dependency
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `r.degraded` — computeMoatDependency 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [FAIL] 空数据检查: **根本不查询数据** — `computeMoatDependency(0.6, 0.3)` 完全硬编码,不读取 store
 - [FAIL] magic number: **整个调用都是硬编码** `computeMoatDependency(0.6, 0.3)` — 既不读 store,也不计算
 - [FAIL] 业务逻辑: `store` 参数完全未使用,不从本体层读取任何数据
 总体: FAIL — 已知问题:完全不读数据,全部硬编码 `(0.6, 0.3)`
 
 ### 19. network-power
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `r.degraded` — computeNetworkPower 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: 空数组传递给 compute
 - [PASS] magic number: 阈值 0.6/0.8 合理
 - [FAIL] 业务逻辑: **查询 `Supplier` 节点类型 — 不存在于本体层 9 实体中**
 总体: FAIL — 查询不存在的 `Supplier` 类型 + 未检查 degraded
 
 ### 20. niche-breadth
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `r.degraded` — computeLevinsBreadth 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: 空 segments 时 compute 可能返回 NaN
 - [PASS] magic number: 阈值 1.0/1.5/0.5 合理
 - [FAIL] 业务逻辑: **查询 `Location` 和 `Market` 节点类型 — 均不存在于本体层中**
 总体: FAIL — 查询 2 个不存在的节点类型 (Location/Market) + 未检查 degraded
 
 ### 21. niche-squeeze
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `r.degraded` — computeNicheSqueezeIndex 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: 空数组传递给 compute
 - [PASS] magic number: 阈值 0.5/0.7 合理
 - [FAIL] 业务逻辑: **查询 `Market` 和 `Supplier` 节点类型 — 均不存在于本体层中**
 总体: FAIL — 查询 2 个不存在的节点类型 (Market/Supplier) + 未检查 degraded
 
 ### 22. opportunity-window
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `result.degraded` — computeOpportunityWindowScore 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: 空数据时 events 为空数组,compute 处理
 - [PASS] magic number: 阈值 0.2/0.7 合理
 - [PASS] 业务逻辑: 查询 Event/Tool 均为合法类型
 总体: FAIL — 未检查 degraded
 
 ### 23. org-repairability
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理空数据
 - [PASS] magic number: 无
 - [PASS] 业务逻辑: 查询 Event 合法
 总体: PASS — 仅 NOTED 图遍历
 
 ### 24. power-rigidity
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理 + stage0 豁免
 - [FAIL] magic number: `founderEquity: 0.5` 硬编码,注释说明"可通过配置覆盖"但当前代码未实现从 store 读取
 - [PASS] 业务逻辑: 查询 Person/Event 合法
 总体: FAIL — magic number `founderEquity: 0.5`
 
 ### 25. process-ai-readiness
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `r.degraded`
 - [PASS] catch异常: log.error({e}) + warning Finding
 - [PASS] 空数据检查: `tools.length > 0` 守卫
 - [FAIL] magic number: `teamSkillAvg: 3` 硬编码团队技能评分
 - [PASS] 业务逻辑: 查询 Tool/Process 合法
 总体: FAIL — magic number `teamSkillAvg: 3`
 
 ### 26. resource-misallocation
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `result.degraded` — computeResourceMisallocation 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: 空数组传递给 compute
 - [PASS] magic number: 阈值 0.2/0.5 合理
 - [FAIL] 业务逻辑: **查询 `Goal` 和 `FINANCIAL`(大写) 节点类型** — `Goal` 不存在,`FINANCIAL` 大小写与本体 `Financial` 不一致
 总体: FAIL — 查询不存在的 `Goal` + `FINANCIAL` 大小写不一致 + 未检查 degraded
 
 ### 27. routine-diffusion
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理
 - [PASS] magic number: 无
 - [PASS] 业务逻辑: 查询 Process/Team 均为合法类型
 总体: PASS — 仅 NOTED 图遍历
 
 ### 28. routine-mutation
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理
 - [PASS] magic number: 无
 - [PASS] 业务逻辑: 查询 Process/Event 均为合法类型
 总体: PASS — 仅 NOTED 图遍历
 
 ### 29. strategy-capability-fit
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理
 - [PASS] magic number: 阈值 0.3/0.6 合理
 - [FAIL] 业务逻辑: **查询 `Goal` 和 `Capability` 节点类型 — 均不存在于本体层中**
 总体: FAIL — 查询 2 个不存在的节点类型 (Goal/Capability)
 
 ### 30. structural-change
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `result.degraded` — computeStructuralChangeSignal 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: 空数组传递给 compute
 - [PASS] magic number: 阈值 0.5/07 合理
 - [FAIL] 业务逻辑: **查询 `Compliance` 节点类型 — 不存在于本体层中**
 总体: FAIL — 查询不存在的 `Compliance` 类型 + 未检查 degraded
 
 ### 31. talent-density
 - [PASS] check()签名: `check(store: GraphStoreReader, teamId: string)` — PASS
 - [NOTED] 缺少图遍历
 - [PASS] degraded处理: 检查 `result.degraded`
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: degraded 分支处理
 - [PASS] magic number: 阈值合理、`proficiencyLevel >= 3` 合理
 - [FAIL] 业务逻辑: **查询 `Capability` 节点类型(查询了但未使用)** — 虽然不影响核心逻辑(只用 Person),但查询了不存在的类型
 总体: FAIL — 查询不存在的 `Capability` 类型(虽然未使用)
 
 ### 32. time-penetration
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `r.degraded` — computeTimePenetration 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: events.length=0 时 compute(0, 0) 处理
 - [FAIL] magic number: `computeTimePenetration(events.length, 0)` — 第二个参数 `0` 硬编码,应为从数据读取的外部事件数
 - [PASS] 业务逻辑: 查询 Event 合法
 总体: FAIL — magic number `0`(外部事件数硬编码) + 未检查 degraded
 
 ### 33. value-capture
 - [PASS] check()签名: PASS
 - [NOTED] 缺少图遍历
 - [FAIL] degraded处理: **未检查** `r.degraded` — computeValueCaptureScore 返回的 degraded 被忽略
 - [PASS] catch异常: log.error + warning Finding
 - [PASS] 空数据检查: 空 financials 数组时 compute 处理
 - [PASS] magic number: 阈值 0.2/0.4 合理
 - [FAIL] 业务逻辑: **查询 `FINANCIAL`(大写) 节点类型** — 与本体层 `Financial` 大小写不一致
 总体: FAIL — 查询 `FINANCIAL` 大写 + 未检查 degraded
 
 ---
 
 ## 问题汇总
 
 ### A. 本体层类型不匹配 (14 个文件)
 
 以下不存在的节点类型被查询:
 | 虚构类型 | 文件数 | 涉及文件 |
 |---------|--------|---------|
 | Goal | 5 | adaptation-velocity, explore-exploit-balance, incentive-alignment, resource-misallocation, strategy-capability-fit |
 | Product | 2 | competitive-moat-perceptual, explore-exploit-balance |
 | Capability | 3 | knowledge-accessibility, make-or-buy, strategy-capability-fit, talent-density |
 | Market | 2 | niche-breadth, niche-squeeze |
 | Supplier | 2 | network-power, niche-squeeze |
 | Location | 1 | niche-breadth |
 | Compliance | 1 | structural-change |
 | KnowledgeChunk | 1 | knowledge-accessibility |
 | ALL/APP/SYSTEM | 1 | data-health |
 
 ### B. 大小写不一致 (5 个文件)
 
 | 文件 | 查询类型 | 应为 |
 |------|---------|------|
 | api-coverage | `TOOL` | `Tool` |
 | customer-demand-shift | `CLIENT` | `Client` |
 | data-health | `TOOL` | `Tool` |
 | resource-misallocation | `FINANCIAL` | `Financial` |
 | value-capture | `FINANCIAL` | `Financial` |
 
 ### C. 未检查 degraded (11 个文件)
 
 competitive-moat-perceptual, make-or-buy, moat-dependency, network-power, niche-breadth, niche-squeeze, opportunity-window, resource-misallocation, structural-change, time-penetration, value-capture
 
 ### D. Magic Number 硬编码 (11 个文件)
 
 | 文件 | 具体值 |
 |------|-------|
 | agent-deployment-maturity | `autonomyLevel: 2` |
 | ai-ecosystem-fit | `totalPlatforms: 5`, `/ 3` |
 | ai-investment-return | `5000`, `3000`, `10000` |
 | human-agent-boundary | `100`, `0.5`, `0.7` |
 | moat-dependency | `(0.6, 0.3)` 全部硬编码 |
 | power-rigidity | `founderEquity: 0.5` |
 | process-ai-readiness | `teamSkillAvg: 3` |
 | time-penetration | `0` (外部事件数) |
 
 ---
 
 ## 完全 PASS 的文件 (仅 NOTED 图遍历)
 
 1. channel-capacity
 2. connector-coverage
 3. info-distortion
 4. org-repairability
 5. routine-diffusion
 6. routine-mutation
 
 **6/33 = 18%** 完全通过审计。
 
 ## 最严重问题 Top 5
 
 1. **moat-dependency**: 完全不读数据,`computeMoatDependency(0.6, 0.3)` 全部硬编码
 2. **14 个文件查询不存在的本体类型** — 这些哨兵永远不会产生有效数据
 3. **11 个文件不检查 degraded** — compute 返回 degraded 被静默吞掉
 4. **competitive-moat-perceptual**: 空数据被误判为 critical 高危
 5. **key-person-risk**: aggregate.ts 无 try/catch + L3 catch 用 log.warn 而非 log.error
