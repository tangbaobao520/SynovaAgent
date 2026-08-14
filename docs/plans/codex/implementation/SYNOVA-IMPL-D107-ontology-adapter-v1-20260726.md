# SynovaAgent -- D107 本体适配器 User 节点注册 实施方案 v1.0

> 2026-07-26 | 权威文档 #16 第五章 §5.4.2 — 本体适配器
> **D106 UserStore 已完成（GraphStore 持久化）。D107 在 ontology-adapter.ts 中新增 RESOURCE_USER 类型映射。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`packages/engine-core/src/pipeline/diagnosis/ontology-adapter.ts` 存在（L400 当前使用 `PERSON` 表示人员，无 `USER` 节点类型），`src/growth/user-store.ts` 存在（D106，NODE_TYPE='USER' 已生效），`packages/ontology/src/node-types.ts` 存在（RESOURCE_PERSON 已定义）
- [x] Get-Content 读取：权威文档 #16 第五章 §5.4.2 L407-415 — "新增 `RESOURCE_USER` 节点类型。`ontology-adapter.ts` 当前使用 `SOGNodeType.PERSON` 表示人员，无专门的 User 节点类型。新增枚举值 + `createUserNode()` 函数 + `queryNodeByEmail()` 函数"
- [x] Select-String 验证：D106 user-store.ts L50 `NODE_TYPE = 'USER'`——UserStore 已用字符串 'USER' 创建节点。ontology-adapter.ts 中 `NodeType` 枚举无 `RESOURCE_USER` 值
- [x] 引用 — D106 已完成（UserStore GraphStore 持久化），D107 是其本体层适配——在 ontology 系统中注册 USER 节点类型

---

## 问题根因

D106 user-store.ts 使用字符串 `'USER'` 作为节点类型创建 GraphStore 节点——硬编码字符串绕过了 ontology-adapter.ts 的 NodeType 枚举。ontology-adapter.ts 的 `NodeType` 枚举中没有 `RESOURCE_USER` 值——USER 节点在本体系统中不存在。D107 在 ontology-adapter.ts 的 NodeType 枚举中新增 `RESOURCE_USER`，并提供 `createUserNode()` 包装函数。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 本体层 — User 节点类型注册。在 `ontology-adapter.ts` 的 `NodeType` 枚举中新增 `RESOURCE_USER` 值，新增 `createUserNode()` 函数。与 D106 user-store.ts 的 'USER' 字符串对齐。

### Q1：调研
- `ontology-adapter.ts` 当前 `NodeType` 枚举含 PERSON 等值——无 USER
- `user-store.ts`（D106）使用 `NODE_TYPE = 'USER'` 硬编码字符串创建节点
- `node-types.ts`（ontology package）含 `RESOURCE_PERSON`——作为参考模式
- GraphStore 的 `createNode(type, props, graph)` 接受任意字符串 type——'USER' 已可工作

### Q2：范围
- 最小：(A) `ontology-adapter.ts` NodeType 枚举新增 `RESOURCE_USER = 'resource/user'` (B) 新增 `createUserNode(email, role, orgId)` 包装函数 (C) 新增 `queryUserByEmail(email)` 查询函数
- 不做：不修改 user-store.ts（D106 已完成）、不修改 GraphStore 核心

### Q3：验收
- `ontology-adapter.ts` 的 NodeType 枚举含 RESOURCE_USER
- `createUserNode('test@example.com', 'admin', 'org-1')` → 创建并返回节点 ID
- `queryUserByEmail('test@example.com')` → 返回节点对象

### Q4：契约与测试
- @input：email + role + orgId（createUserNode）/ email（queryUserByEmail）
- @output：nodeId（createUserNode）/ node object（queryUserByEmail）
- @degraded：GraphStore 不可用 → throw
- 测试：createUserNode 返回 nodeId(1) + queryUserByEmail 返回节点(1) = 2 tests

---

## 构建内容

### 修改 packages/engine-core/src/pipeline/diagnosis/ontology-adapter.ts

```typescript
// 1. NodeType 枚举新增
export enum NodeType {
  // ...existing types...
  RESOURCE_PERSON = 'resource/person',
  RESOURCE_USER = 'resource/user',    // D107 新增
}

// 2. 新增 createUserNode()
export async function createUserNode(
  email: string, role: string, orgId: string,
  store: GraphStore
): Promise<string> {
  return store.createNode(NodeType.RESOURCE_USER, {
    email, role, orgId, createdAt: new Date().toISOString(),
  }, 'enterprise');
}

// 3. 新增 queryUserByEmail()
export async function queryUserByEmail(
  email: string, store: GraphStore
): Promise<Record<string, unknown> | null> {
  const results = store.queryNodes(NodeType.RESOURCE_USER, { email }, 'enterprise');
  return results[0]?.props || null;
}
```

---

## 不做什么

- 不修改 user-store.ts（D106 已完成——保持硬编码 'USER' 或迁移到 NodeType.RESOURCE_USER 作为后续优化）
- 不修改 node-types.ts（ontology package 独立维护）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `createUserNode()` → 返回非空 nodeId
- `queryUserByEmail()` → 返回匹配节点
- 2 个测试

---

## 完成标准

```
[ ] NodeType.RESOURCE_USER 枚举值新增
[ ] createUserNode(email, role, orgId) 函数
[ ] queryUserByEmail(email) 函数
[ ] tsc --noEmit 零新增错误
[ ] ≥2 个测试
```
