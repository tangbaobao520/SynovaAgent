# SynovaAgent -- D106 企业用户 GraphStore 持久化 实施方案 v1.0

> 2026-07-26 | 将 enterprise.ts 的内存 Map 替换为 GraphStore 持久化
> Gate 2 (多人使用与权限): PARTIAL -> PASS
> 此文档为 claude code 的唯一执行依据。

---

## 权威文档原文验证(铁律 0-3)

- [x] Test-Path `src/routes/enterprise.ts` -> 存在 (D103, 19 个端点)
- [x] Test-Path `src/growth/user-store.ts` -> 存在 (5912 bytes, 已有 UserStore 类 + GraphStoreLike 接口)
- [x] Get-Content `enterprise.ts:46-48` -> `const users = new Map<string, UserRecord>()` -- 纯内存
- [x] Get-Content `user-store.ts:54` -> `export class UserStore` -- 已有 createUser/queryByEmail/listByOrg
- [x] Get-Content `user-store.ts:41-42` -> `createNode(type, props, graph)` + `queryNodes(type, filters, graph)` -- GraphBridge 接口完整
- [x] Select-String `synova-agent.ts` -> `UserStore` 零引用 -- UserStore 未在生产代码中实例化

---

## 构建内容

### 1. 修复 user-store.ts 使其可被 enterprise.ts 消费

- 确认 `UserStore.createUser()` 返回类型与 `UserRecord` 兼容
- 确认 `UserStore.queryByEmail()` 去重检查逻辑与当前 `for (const u of users.values())` 一致
- 添加 `getById(userId)` 方法(enterprise.ts 当前多处使用 `users.get(userId)`)
- 添加 `updateUser(userId, partial)` 方法(enterprise.ts 有成员更新端点)
- **不修改** GraphStoreLike 接口签名 -- 它已在 goal-store.ts、knowledge-store.ts 中共享

### 2. 替换 enterprise.ts 中的 users Map 为 UserStore

| 当前 Map 操作 | 位置 | 替换为 |
|-------------|------|--------|
| `users.set(userId, { ... })` | 注册 L84 | `userStore.createUser({ ... })` |
| `for (const u of users.values())` 查重 | 注册 L82 | `userStore.queryByEmail(email)` |
| `users.get(userId)` | 成员查询 | `userStore.getById(userId)` |
| `users.set(userId, { ...status })` | 成员更新 | `userStore.updateUser(userId, partial)` |
| `users.delete(userId)` | 成员删除 | `userStore.deleteUser(userId)` |
| `Array.from(users.values()).filter(...)` | 成员列表 | `userStore.listByOrg(orgId)` |

### 3. UserStore 注入方式

enterprise.ts 通过模块级单例 getter 接收 UserStore，不修改 Express Router 签名:

```typescript
let _userStore: UserStore | null = null;
export function setUserStore(store: UserStore) { _userStore = store; }
function getUserStore(): UserStore { ... }
```

**D106 本身不修改 synova-agent.ts**(D224-WIRING 任务负责)。

---

## 测试要求(依据权威文档 #6 测试体系规范)

| 层 | 内容 | 数量 |
|----|------|------|
| L1 UserStore | GraphStoreLike mock -> createUser/queryByEmail/getById/updateUser/deleteUser | >=5 tests |
| L1 enterprise | 注入 Mock UserStore -> 注册流程 + 重复注册 409 + 成员列表 | >=3 tests |
| 每 test | >=3 expect() | |

---

## 完成标准

```
[ ] user-store.ts: getById + updateUser + deleteUser 方法存在
[ ] enterprise.ts: users Map 被 UserStore 替换(零残留 users.set/users.get/users.delete)
[ ] enterprise.ts: setUserStore/getUserStore 注入模式就位
[ ] >=8 个新增测试通过
[ ] tsc --noEmit 零错误
[ ] 无 as any
```
