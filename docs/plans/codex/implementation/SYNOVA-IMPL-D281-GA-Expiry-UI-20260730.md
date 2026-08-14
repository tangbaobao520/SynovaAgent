<!--
  SYNOVA-IMPL-D281: GA权限到期日 UI — N1 前端补全
  状态: dev doc | 2026-07-30
  权威文档: 开发者任务地图 v2.0 N1 + rbac.ts 后端已就位
  依赖: D239 (GAConstraints/rbac.ts) — 后端已完成
  并行: D282, D283 — 零共享文件
-->

# D281: GA权限到期日 UI — 前端补全

## 1. 权威文档引用

**来源**: [开发者任务地图 v2.0](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-开发者任务地图-v2-0-20260730.md) N1

> N1: GA权限到期日 [⚠️ 后端完成，前端缺失]
> rbac.ts:135-137 isGaContractExpired() 已存在。canAccessWorkspace 已检查冻结+到期+部门+敏感度。
> 但 admin.js L98 仅显示GA token——无到期日设置UI。enterprise.ts 无 PUT 端点

**来源**: 预期状态模型 v3.1 §四

> GA 外部顾问接入: ⚠️ GA 能看到数据但不能设合同到期日——权限永久有效

## 2. 代码审计——现状

### 2.1 后端已完成 (D239)

**rbac.ts GAConstraints 接口** (L79-85):
```typescript
export interface GAConstraints {
  contractExpiry?: string;  // ← 到期日字段已定义
  isFrozen?: boolean;
  deptScope?: string[];
  sensitivityCeiling?: string;
  canDownload?: boolean;
}
```

**检查链** (L214-220): `canAccessWorkspace()` 先检查 `isGaFrozen()` → 再检查 `isGaContractExpired()` → 放行。到期当天 `new Date(contractExpiry) < new Date()` → 拒绝访问。

**freeze 端点** (enterprise.ts L301-318): `PUT /api/enterprise/:id/freeze` + `PUT /api/enterprise/:id/unfreeze` 存在。

### 2.2 前端缺失

| 缺失 | 位置 | 说明 |
|------|------|------|
| **GA 到期日 UI** | `app/js/admin.js` | L98 仅显示 GA token，无日期/日历输入 |
| **PUT /ga/:id/expiry 端点** | `src/routes/enterprise.ts` | 无 endpoint 可设置 contractExpiry |

### 2.3 历史代码备注

admin.js 已有 GA token 复制功能 (L92-98)，可作为 UI 扩展的锚点。freeze/unfreeze 按钮可复用已有模式。

## 3. 实现方案

### 3.1 写集 (2 文件)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| `app/js/admin.js` | 修改 +30行 | GA section 追加到期日 date input + 保存按钮 |
| `src/routes/enterprise.ts` | 修改 +20行 | 新增 `PUT /api/enterprise/ga/:id/expiry` 端点 |

### 3.2 admin.js 修改

在 GA token 卡片下方追加到期日设置区域：

```
┌─ GA Access ─────────────────────┐
│ Token: xxxxx... [Copy]          │
│ Contract Expiry: [2026-12-31] ▼ │  ← 新增 date input
│ [Save Expiry]                   │  ← 新增 保存按钮
│ Status: Active (expires 12/31)  │  ← 新增 状态行
└─────────────────────────────────┘
```

**API 调用**: `api.put('/api/enterprise/ga/' + gaId + '/expiry', { contractExpiry: '2026-12-31' })`

### 3.3 enterprise.ts 新增端点

```typescript
// PUT /api/enterprise/ga/:id/expiry
router.put('/ga/:id/expiry', requireAdmin, async (req, res) => {
  const { contractExpiry } = req.body;
  // 更新 UserStore 中 GA 用户的 gaConstraints.contractExpiry
  // 返回 { ok: true, contractExpiry }
});
```

**安全**: 仅 admin 角色可调用（已有 `requireAdmin` 中间件）。到期日必须是未来日期。冻结的 GA 不能修改到期日。

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | 2 | 1) PUT 设置到期日→返回 ok 2) 过去日期→拒绝 |
| L2b | vitest 集成 | 1 | 设置到期日 + 当天 GA 无法登录 |

测试文件: `tests/routes/ga-expiry.test.ts`

## 5. 接线要求

| 新 export | 调用方 | 确认方式 |
|-----------|--------|---------|
| `PUT /api/enterprise/ga/:id/expiry` | admin.js saveExpiry() | grep "ga.*expiry" in enterprise.ts |
| `admin.js ga 到期日 UI` | admin.html admin-grid section | 浏览器验证 |

已有接线不破坏: `isGaContractExpired()` / `canAccessWorkspace()` — 继续正常运作。

## 6. 完成标准

1. admin.html GA section 有到期日 date input
2. 保存→`PUT /api/enterprise/ga/:id/expiry` 调用成功
3. 到期当天 GA 无法登录（isGaContractExpired 返回 true）
4. 冻结 GA 不能修改到期日
5. tsc 零新增错误 | vitest 零新增失败

## 7. 自检清单

- [x] 已读 rbac.ts GAConstraints 完整接口 (L79-85)
- [x] 已读 canAccessWorkspace GA 检查链 (L208-220)
- [x] 已读 admin.js GA token 代码 (L92-98)
- [x] 已读 enterprise.ts freeze 端点 (L301-318)
- [x] 已验证 isGaContractExpired 逻辑正确
- [x] 不是凭记忆
- [x] 不用 --no-verify
