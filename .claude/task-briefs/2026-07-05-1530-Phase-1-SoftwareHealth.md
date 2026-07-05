# Task Brief: Phase 1 Pilot — software-health aggregate 迁移到图遍历

> 生成: 2026-07-05 15:30 | 分支: session/04 | V4.4.0

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向 — 改 extensions/sentinels/software-health/aggregate.ts

**系统**: 哨兵 — L4 extensions。
**本任务**: 将 software-health aggregate 从 KV 读取迁移到图遍历模式。
- 当前: `check(store, teamId)` → 3 次 `queryNodes('TOOL'/'APP'/'SOFTWARE')` → `.props.xxx`
- 改为: `check(store, teamId, traversal?)` → `traversal?.traverse(...)` → `n.props.xxx`
- 字段映射: `endpoint/apiEndpoint` → `api_endpoint`，其余字段名不变

### b) 文件审计
- `extensions/sentinels/software-health/aggregate.ts` — 本任务修改
- `extensions/sentinels/software-health/computes/saas-usage-score.ts` — 不改（纯函数）
- `extensions/sentinels/software-health/computes/shadow-it-score.ts` — 不改
- `extensions/sentinels/software-health/computes/integration-health.ts` — 不改
- `extensions/ontology/resource/tool.json` — TOOL 实体 schema（新字段名参考）

### c) 决策
无覆盖 → 新建迁移。复用 Phase 0 的 GraphTraversal 注入。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① 读 aggregate 代码 → 3 个 queryNodes + 3 个 compute 调用 → 全部内联字段映射
② 改为 try-traversal-fallback-queryNodes 模式
③ 新字段: api_endpoint 替代 endpoint/apiEndpoint
④ tsc + vitest 全通过

### b) 执行约束
- rule: "traversal 返回空数据时必须降级到 queryNodes"
  verify: "grep -c 'queryNodes' extensions/sentinels/software-health/aggregate.ts | xargs test 2 -le"
- rule: "不使用 nodes.length（V4.4.0 铁律）"
  verify: "grep -c 'nodes.length' extensions/sentinels/software-health/aggregate.ts | xargs test 0 -eq"
- rule: "catch 必须有 log.warn/error"
  verify: "grep -c 'log\.' extensions/sentinels/software-health/aggregate.ts | xargs test 2 -le"

## Q2: 范围

**做什么**: extensions/sentinels/software-health/aggregate.ts — 加 traversal? 第 3 参，加图遍历路径，保留 fallback

**不做什么**:
- 不改 3 个 compute 函数（纯函数，不改数据访问）
- 不改 `src/sentinel/sentinel-loader.ts`
- 不改 `extensions/sentinels/software-health/manifest.json`
- 不改其他 aggregate

## Q3: 验收

**入口**: Cron → Runner → sentinel-loader → check(store, teamId, traversal?)
**处理**: traversal traverse 优先 → TOOL 节点 → 3 个 compute 函数 → 阈值对比 → finding
**结果**: SentinelFinding[]（与迁移前一致）

## 架构层
L4 (extensions/sentinels)

## Done 标准
- [x] verify: npx tsc --noEmit 2>&1 | grep -c error | xargs -I{} bash -c 'test {} -eq 0 && echo PASS || echo FAIL'
- [x] verify: npx vitest run 2>&1 | grep -q "passed" && echo "PASS"
- [x] verify: grep -c "traversal?" extensions/sentinels/software-health/aggregate.ts | xargs test 1 -eq
- [x] verify: grep -c "api_endpoint" extensions/sentinels/software-health/aggregate.ts | xargs test 1 -eq
- [x] verify: grep "nodes.length" extensions/sentinels/software-health/aggregate.ts && echo FAIL || echo PASS
- [x] verify: grep "as any" extensions/sentinels/software-health/aggregate.ts && echo FAIL || echo PASS
