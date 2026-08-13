# D39: TraversalPermissionFilter — 图遍历权限过滤器

> 生成: 2026-07-12 | 分支: feat/prompt-architecture | V4.4.5

## Q0: 定位 — 项目拼图 + 文件审计 + 决策
a) 项目拼图
   SynovaAgent — D39。安全P1。
   graph-traversal.ts traverse() 零权限感知 — 返回全部匹配节点。
   PolicyEngine(D38)已就绪。
b) 文件审计
   graph-traversal.ts: traverse() → {nodes,edges} 无过滤
   policy-engine.ts(D38): 消费SOI常量(GRAPH_TRAVERSE)，不依赖evaluate
c) 决策
   新建 TraversalPermissionFilter — traverseFiltered() 后过滤层
   不改graph-traversal.ts核心逻辑

## Q1: 调研 — 引用来源 + memory教训
a) 安全规范 §3.5: TraversalPermissionFilter — filterNodes(userContext, nodes[])→nodes[]
b) PolicyEngine(D38): 提供SOI常量，过滤是节点级裁剪
c) graph-traversal.ts: traverse(startIds, edgeTypes, maxDepth)→{nodes,edges}

## Q2: 范围 — 做什么 + 不做什么
做什么:
  1) TraversalPermissionFilter类 + traverseFiltered(userContext,...)→TraversalResult
  2) 后过滤: department匹配 / sensitivity上限 / nodeType白名单
  3) 裁剪后重建edges(移除挂引用)
不做什么:
  不改 graph-traversal.ts; 不改 sentinel aggregate
排除: src/l4/graph-traversal.ts(不改)

## Q3: 验收 — 入口→处理→结果
入口: filter.traverseFiltered(userCtx, startIds, edgeTypes)
处理: 原始traverse() → 后过滤节点 → 重建edges → 裁剪计数
结果: nodes只含权限范围内, edges无悬挂引用

## 架构层: L4(本体层) — src/l4/traversal-permission-filter.ts
## Done 标准
- [ ] verify: manager → nodes只含本department
- [ ] verify: staff → nodes不含S3/S4
- [ ] verify: 裁剪后edges无悬挂引用
- [ ] verify: tsc零错误 / vitest零失败 / 零as any
