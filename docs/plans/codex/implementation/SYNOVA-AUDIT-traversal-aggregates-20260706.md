# 17-Aggregate 图遍历审计报告

> 审计日期: 2026-07-06
> 审计范围: 17个使用图遍历的 aggregate.ts 文件
> 审计维度: 7项 (check签名 / 图遍历模式 / KV fallback / degraded处理 / catch异常 / 空数据检查 / magic number)

---

## 总体结论

- **PASS: 9 / 17 (53%)**
- **FAIL: 8 / 17 (47%)**

三类主要问题:
1. **catch 空吞异常** (4个文件) — log.warn 后无 Finding 返回，调用方无法感知异常
2. **硬编码 magic number** (4个文件) — 不从 store 读取数据，直接用字面量调用 compute 函数
3. **competitive-dynamics** 同时有上述两类问题

---

### business-model-coherence
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整 try { if(traversal) { r = traversal.traverse(...); if(r.nodes[0]) { ... usedTraversal = true } } } catch { log.warn }
- [PASS] KV fallback: if (!usedTraversal) { allNodes = store.queryNodes('BusinessModel', ...).concat(...) } — 正确
- [PASS] degraded处理: computeModelCoherence 无 degraded 路径 — 可接受
- [PASS] catch异常: 外层 catch 有 log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: 三分支都有返回，空数组落到 return [] — 不崩溃
- [PASS] magic number: 阈值 0.2, 0.4 是业务阈值 — 可接受
总体: **PASS** — 图遍历模式和异常处理完整。

### capital-efficiency
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', { teamId }) } — 正确
- [PASS] degraded处理: spreadResult.degraded, turnoverResult.degraded 都检查后才输出 Finding — 正确
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: if (financials.length === 0 || financials.every(f => f.revenue === 0)) return [] — 正确
- [PASS] magic number: 阈值是业务阈值 — 可接受
总体: **PASS** — 标杆级实现。

### capital-structure
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', { teamId }) } — 正确
- [PASS] degraded处理: de.degraded, ic.degraded, ds.degraded 都检查后才输出 Finding — 正确
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: if (financials.length > 0) 包裹 short-term debt 计算 — 正确
- [PASS] magic number: 阈值是业务阈值 — 可接受
总体: **PASS** — 标杆级实现。

### capital-turnover
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', { teamId }) } — 正确
- [PASS] degraded处理: at.degraded, rt.degraded 检查后才输出 Finding — 正确
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: 空数组不触发阈值 — 不崩溃
- [PASS] magic number: 無
总体: **PASS** — 无缺陷。

### cash-runway
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: try { if(traversal) { ... hasData=true } } catch { log.warn } — 模式等价
- [PASS] KV fallback: if (!hasData) { nodes = store.queryNodes('Financial', { teamId }) } — 正确
- [PASS] degraded处理: N/A（无 compute 函数）
- [FAIL] catch异常: **外层 catch 只有 log.warn，没有返回任何 Finding。** 异常被完全吞没，调用方收到空 []，无法区分"正常无数据"和"计算崩溃"。违反铁律 24。
  **修复**: catch 块改为返回 warning 级 Finding: eturn [{ id: 'cash-error-...', severity: 'warning', title: '现金流检测异常', description: err.message, ... }]
- [PASS] 空数据检查: if (!nodes[0]) return [] / Infinity 处理 — 正确
- [PASS] magic number: 無
总体: **FAIL** — catch 空吞异常。

### competitive-dynamics
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { marketNodes = store.queryNodes('Market', ...); finNodes = store.queryNodes('FINANCIAL', ...) } — 正确
- [FAIL] degraded处理: computeCompetitiveIntensity 接收硬编码参数 { recentEntries: 1, recentExits: 1, marketGrowth: 0.05 } 而非从 store 读
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: 空数组不崩溃
- [FAIL] magic number: **第 60-62 行硬编码 recentEntries: 1, recentExits: 1, marketGrowth: 0.05。** 应从 Market 节点的 props 读取。
  **修复**: 从 marketNodes 提取: const recentEntries = marketNodes.reduce((s, n) => s + (Number(n.props.recentEntries) || 0), 0);
总体: **FAIL** — 竞争强度用假数据计算。

### competitive-moat-structural
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', ...); allNodes = store.queryNodes('ALL', ...) } — 正确
- [PASS] degraded处理: compute 函数无 degraded 字段 — 可接受
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: 空数组不崩溃
- [FAIL] magic number: **第 35 行 computeCounterPositioningSlm({ incumbentMargin: 0.6, incumbentPrice: 100, ourPrice: 60, ourRevenue: 100, incumbentRevenue: 5000 }) — 5 个参数全部硬编码。** 这是最严重的 magic number。
  **修复**: 从 allNodes 中提取市场/竞争数据: const marketData = allNodes.filter(n => n.type === 'MARKET_OUTCOME'); const incumbentMargin = marketData.reduce(...) / marketData.length || 0.3; 等。
总体: **FAIL** — SLM 5 个参数全硬编码，护城河评分不可信。

### cost-health
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { financialNodes = store.queryNodes('FINANCIAL', { teamId }) } — 正确
- [PASS] degraded处理: N/A（无 compute 函数）
- [FAIL] catch异常: **catch 只有 log.warn，没有返回 Finding。** 异常被吞没。
  **修复**: catch 块改为返回 warning 级 Finding。
- [PASS] 空数据检查: revenueNodes.length > 0 && costNodes.length > 0 — 正确
- [PASS] magic number: 無（阈值从 manifest 读取）
总体: **FAIL** — catch 空吞异常。

### environment-rent-dependency
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', { teamId }) } — 正确
- [PASS] degraded处理: compute 无 degraded 字段 — 可接受
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: 空数组不崩溃
- [PASS] magic number: 阈值 0.5, 0.3 是业务阈值 — 可接受
总体: **PASS** — 无缺陷。

### financing-constraint
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', { teamId }) } — 正确
- [PASS] degraded处理: compute 无 degraded 字段 — 可接受
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: 空数组不崩溃
- [PASS] magic number: 阈值 2.0, 1.0 是业务阈值 — 可接受
总体: **PASS** — 无缺陷。

### growth-quality
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', { teamId }) } — 正确
- [PASS] degraded处理: ccr.degraded, ogr.degraded 检查后才输出 Finding — 正确
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: 空数组不崩溃
- [PASS] magic number: 無
总体: **PASS** — 无缺陷。

### internal-transaction-cost
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { fin = store.queryNodes(...); teams = store.queryNodes(...); events = store.queryNodes(...) } — 正确
- [PASS] degraded处理: compute 无 degraded 字段 — 可接受
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: 空数组不崩溃
- [FAIL] magic number: **第 17 行 previousAdminCost: adminCost * 0.9, previousTotalCost: totalCost * 0.9 — 凭空捏造历史数据。** 应从 store 读取历史周期数据。
  **修复**: 从 FINANCIAL 节点读取历史数据，或标记 degraded 不在无历史时触发 Finding。
总体: **FAIL** — 历史数据用 * 0.9 凭空构造。

### market-lifecycle
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { marketNodes = store.queryNodes('Market', ...); finNodes = store.queryNodes('FINANCIAL', ...) } — 正确
- [PASS] degraded处理: compute 无 degraded 字段 — 可接受
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: if (marketNodes.length === 0 || finNodes.length === 0) 显式检查并返回 info Finding — 良好的 UX
- [FAIL] magic number: **第 50 行 previousRevenue = currentRevenue * 0.85（注释写明"简化假设"）和第 55 行 competitorEntries: 1, competitorExits: 0 硬编码。**
  **修复**: 从 finNodes 读 previousRevenue，从 marketNodes 读 recentEntries/recentExits。
总体: **FAIL** — 历史数据 + 竞争动态用假数据。

### profit-health
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 完整
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }) } — 正确
- [PASS] degraded处理: N/A（无 compute 函数）
- [FAIL] catch异常: **catch 只有 log.warn，没有返回 Finding。** 异常被吞没。
  **修复**: catch 块改为返回 warning 级 Finding。
- [PASS] 空数据检查: if (!finNodes[0]) return [] — 正确
- [FAIL] magic number: **第 22 行 const benchmarkMargin = 0.25; — 硬编码行业基准利润率。** 应从 this.manifest.thresholds 或其他数据源读取。
  **修复**: 在 manifest 中增加 industry_benchmark_margin 字段，或从 Market 节点读取。
总体: **FAIL** — catch 空吞异常 + 硬编码行业基准。

### revenue-health
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: 两次 traverse（FINANCIAL + CLIENT）拆分正确
- [PASS] KV fallback: if (!usedTraversal) { nodes = store.queryNodes('Financial', ...); clientNodes = store.queryNodes('Client', ...) } — 正确
- [PASS] degraded处理: N/A（无 compute 函数）
- [FAIL] catch异常: **catch 只有 log.warn，没有返回 Finding。** 异常被吞没。
  **修复**: catch 块改为返回 warning 级 Finding。
- [PASS] 空数据检查: if (!revenueNodes[0]) return [] — 正确
- [PASS] magic number: 無（阈值从 manifest 读取）
总体: **FAIL** — catch 空吞异常。

### software-health
- [PASS] check()签名: check(store, teamId, traversal?) — 正确
- [PASS] 图遍历模式: try { if(traversal) { ... hasData = true } } catch { log.warn } — 模式等价
- [PASS] KV fallback: if (!hasData) { toolNodes = store.queryNodes('TOOL', ...); appNodes = ...; swNodes = ... } — 正确，覆盖三种节点类型
- [PASS] degraded处理: usage.degraded, shadow.degraded, ih.degraded 都检查后才输出 Finding — 正确
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: usage.totalTools > 0, shadow.totalTools > 0, ih.totalSystems > 0 — 正确
- [PASS] magic number: 無
总体: **PASS** — 标杆级实现，图遍历 + fallback + 3 种节点类型全覆盖。

### unit-economics
- [PASS] check()签名: check(store, teamId, traversal?) — 正确。GraphStoreReader 扩展了 queryEdges? 可选方法
- [PASS] 图遍历模式: 两次 traverse（FINANCIAL + CLIENT）拆分正确
- [PASS] KV fallback: if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', ...); clientNodes = store.queryNodes('CLIENT', ...) } — 正确
- [PASS] degraded处理: ltv.degraded, um.degraded, mc.degraded, vc.degraded, bep.degraded 都检查后才输出 Finding — 正确
- [PASS] catch异常: log.error + 返回 warning 级 Finding — 正确
- [PASS] 空数据检查: clientGroups 空时不触发后续 — 不崩溃
- [PASS] magic number: 無
总体: **PASS** — 最复杂的聚合文件，7 个 compute 集成，所有维度正确。

---

## 汇总表

| # | 文件名 | 1.签名 | 2.遍历 | 3.KV降级 | 4.degraded | 5.catch | 6.空数据 | 7.magic | 总体 |
|---|--------|--------|--------|----------|------------|---------|----------|---------|------|
| 1 | business-model-coherence | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 2 | capital-efficiency | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 3 | capital-structure | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 4 | capital-turnover | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 5 | cash-runway | PASS | PASS | PASS | N/A | **FAIL** | PASS | PASS | **FAIL** |
| 6 | competitive-dynamics | PASS | PASS | PASS | FAIL | PASS | PASS | **FAIL** | **FAIL** |
| 7 | competitive-moat-structural | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | **FAIL** |
| 8 | cost-health | PASS | PASS | PASS | N/A | **FAIL** | PASS | PASS | **FAIL** |
| 9 | environment-rent-dependency | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 10 | financing-constraint | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 11 | growth-quality | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 12 | internal-transaction-cost | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | **FAIL** |
| 13 | market-lifecycle | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | **FAIL** |
| 14 | profit-health | PASS | PASS | PASS | N/A | **FAIL** | PASS | **FAIL** | **FAIL** |
| 15 | revenue-health | PASS | PASS | PASS | N/A | **FAIL** | PASS | PASS | **FAIL** |
| 16 | software-health | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 17 | unit-economics | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |

---

## 问题严重度排序

### P0 — 诊断结果不可信（必须立即修复）

1. **competitive-moat-structural** L35: SLM 5 个参数全硬编码，护城河评分来自假数据
2. **competitive-dynamics** L60-62: 竞争强度输入 recentEntries:1, recentExits:1, marketGrowth:0.05 全硬编码
3. **market-lifecycle** L50: 历史 revenue * 0.85 凭空构造；L55: competitorEntries:1, competitorExits:0 假数据
4. **internal-transaction-cost** L17: 历史成本 * 0.9 凭空构造

### P1 — 异常被吞没（调用方无法感知错误）

5. **cash-runway** L74: catch 只 log.warn，无 Finding 返回
6. **cost-health** L76: catch 只 log.warn，无 Finding 返回
7. **profit-health** L33: catch 只 log.warn，无 Finding 返回；L22: benchmarkMargin = 0.25 硬编码
8. **revenue-health** L52: catch 只 log.warn，无 Finding 返回

### 修复优先级

先修 P0（诊断结果不可信），再修 P1（异常吞没）。P0 修复涉及从 store 读取真实数据，可能需要确认 Market/FINANCIAL 节点的 props schema 是否包含所需字段。

---

## 修复 checklist

- [ ] competitive-moat-structural L35: computeCounterPositioningSlm 从 store 读取参数
- [ ] competitive-dynamics L60-62: recentEntries/recentExits/marketGrowth 从 marketNodes 读取
- [ ] market-lifecycle L50: previousRevenue 从 finNodes.props.previousRevenue 读取
- [ ] market-lifecycle L55: competitorEntries/Exits 从 marketNodes 读取
- [ ] internal-transaction-cost L17: previousAdminCost/previousTotalCost 从 store 读取历史数据
- [ ] cash-runway L74: catch 返回 warning Finding
- [ ] cost-health L76: catch 返回 warning Finding
- [ ] profit-health L33: catch 返回 warning Finding
- [ ] profit-health L22: benchmarkMargin 从 manifest 或 store 读取
- [ ] revenue-health L52: catch 返回 warning Finding

