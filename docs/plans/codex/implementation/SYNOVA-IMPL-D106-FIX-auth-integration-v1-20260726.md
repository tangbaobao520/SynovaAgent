# SynovaAgent -- Gate 2 fix auth.ts 内存 Map → UserStore 接线 实施方案 v1.0

> 2026-07-26 | 审计发现：D106 user-store.ts 用 GraphStore 但 auth.ts:27 仍用内存 Map
> **Gate 2 PARTIAL→PASS。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/growth/user-store.ts` 存在（D106，GraphStore 持久化已完成），`src/routes/auth.ts` 存在（L27 `const users = new Map()`——未接线），附录 A v2.0 存在
- [x] Get-Content 读取：auth.ts L27 — `const users = new Map<string, UserRecord>()`。L30 — `/** D106+D107: UserStore (GraphStore 持久化), 注入后替代内存 Map */`——注释已写好但从未执行。L52 — `// 检查重复邮箱 (UserStore 优先, 内存 Map 回退)`，L96 — `// UserStore 优先, 内存 Map 回退`——回退逻辑已标记但 UserStore 从未被实例化
- [x] Select-String 验证：auth.ts 全文中 `new UserStore` → 零结果。UserStore 被 import（L21）但从未被 `new`。`users.set` → 3 处（L58/L62/L71）仍在使用内存 Map
- [x] 引用 — Gate 2 当前状态："partial — 数据存储为内存 Map (非 GraphStore 持久化)"。附录 A Gate 2 通过条件 4："端到端测试通过：创建企业 → 邀请成员 → 成员登录 → 成员访问受限端点返回 403"

---

## 问题根因

D106 完成了 UserStore 的 GraphStore 持久化实现，但 auth.ts 从未被更新去实例化它。auth.ts:27 的 `const users = new Map()` 仍然是活跃的数据存储。Gate 2 因此被标记为 partial——"认证代码存在但存储为内存 Map"。不是代码没写——是代码写完了但没接线到调用方。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 认证层 — 内存 Map 替换。在 auth.ts 中实例化 `UserStore`（D106）替代 `const users = new Map()`。替换 3 处 `users.set/get/has` 为对应的 `userStore` API 调用。保留内存 Map 作为 fallback。

### Q1：调研
- UserStore API（D106）：`constructor(store: GraphStoreLike)` / `createUser(email, password, role, orgId)` / `queryByEmail(email)` / `getById(userId)`
- auth.ts L52-62：注册时检查重复邮箱——`userStore.queryByEmail(email)` 替代 `users.has(email)`
- auth.ts L58-71：注册后存储用户——`userStore.createUser(email, password, role, orgId)` 替代 `users.set(email, { ... })`
- auth.ts L96-108：登录时查询用户——`userStore.queryByEmail(email)` 替代 `users.get(email)`
- GraphStore 实例：auth.ts 中没有现成的 GraphStore 实例——需要从 `src/l4/graph-bridge.ts` 获取或接受注入

### Q2：范围
- 最小：auth.ts 中创建 `const userStore = new UserStore(graphStore)` + 替换 3 处 `users.*` 调用。保留原有 `const users = new Map()` 作为 fallback（当 GraphStore 不可用时）
- 不做：不修改 UserStore（D106 已完成）、不修改 EnterpriseStore

### Q3：验收
- 入口：POST `/api/auth/register` → userStore.createUser 写入 GraphStore → 返回 JWT
- 交互：服务重启后 → POST `/api/auth/login` → userStore.queryByEmail 从 GraphStore 查询 → 返回 JWT
- 结果：Gate 2 重新检查 → "数据存储为内存 Map" 变为 "数据存储为 GraphStore"

### Q4：契约与测试
- @input：注册/登录请求
- @output：JWT token（与内存 Map 行为一致）
- @degraded：GraphStore 不可用 → fallback 到内存 Map + degraded
- 测试：注册查询 GraphStore(1) + 登录从 GraphStore 读取(1) + GraphStore 不可用 fallback(1) = 3 tests

---

## 构建内容

### 1. 修改 src/routes/auth.ts — 实例化 UserStore + 替换 3 处调用

```typescript
// L27 替换
const users = new Map<string, UserRecord>();                          // 保留作为 fallback
const userStore = new UserStore(getGraphStore());                     // 新增：D106 接线

// L52 替换
if (userStore) {
  const existing = userStore.queryByEmail(email);                     // UserStore 优先
  if (existing) return res.status(409).json(...);
} else if (users.has(email)) {                                        // fallback
  return res.status(409).json(...);
}

// L58-71 替换
const userId = userStore
  ? userStore.createUser(email, password, role, orgId)                // UserStore 优先
  : (users.set(email, { ... }), email);                               // fallback

// L96-108 替换（登录）
const user = userStore
  ? userStore.queryByEmail(email)                                      // UserStore 优先
  : users.get(email);                                                  // fallback
```

### 2. 获取 GraphStore 实例

```typescript
import { getGraphStore } from '../l4/graph-bridge';
// 或从 server.ts 注入
```

---

## 不做什么

- 不修改 UserStore（D106 已完成）
- 不修改 EnterpriseStore
- 不删除内存 Map（保留作为 fallback）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 注册 → userStore.createUser → GraphStore 中可查询到
- 登录 → userStore.queryByEmail → 返回正确用户
- GraphStore 不可用 → fallback 到内存 Map + degraded
- 3 个测试

---

## 完成标准

```
[ ] auth.ts: const userStore = new UserStore(getGraphStore())
[ ] auth.ts L52: users.has → userStore.queryByEmail
[ ] auth.ts L58-71: users.set → userStore.createUser
[ ] auth.ts L96-108: users.get → userStore.queryByEmail
[ ] 内存 Map 保留作为 fallback（userStore 不可用时）
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] ≥3 个测试
```
