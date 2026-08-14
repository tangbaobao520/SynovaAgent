# SynovaAgent -- D108 管理员工作台 UI 实施方案 v1.0

> 2026-07-26 | 权威文档 #16 第一章 — 企业多用户部署
> **10/31 客户截止线——第一个可视管理界面。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`app/admin.html` 存在（骨架），`app/js/admin.js` 存在（骨架），`app/css/admin.css` 存在，`src/routes/enterprise.ts` 存在（D103，19 个管理端点），`app/js/shell.js` 存在（D96 共享导航）
- [x] Get-Content 读取：权威文档 #16 第一章 L282 — "admin 在管理员工作台 → '成员管理' → 点击'邀请成员' → 填写邮箱 + 选择角色 → 发送邀请"。L173 — "客户端跳转到管理员工作台"。L826 — "系统内置升级提示逻辑，在管理员工作台首页展示"
- [x] Select-String 验证：enterprise.ts 含 19 个端点——`POST /api/enterprise/register`（L86）/ `POST /api/enterprise/invite`（L116）/ `GET /api/enterprise/members`（L132）/ `POST /api/enterprise/ima/bind`（L198）/ `POST /api/enterprise/ga/generate`（L220）。admin.html 当前为空壳页面（仅 HTML 骨架）
- [x] 引用 — D102-D105 已完成（Auth 升级 + Enterprise Routes + ima Connector + Knowledge Agent）

---

## 问题根因

D103 建了 19 个企业管理端点和 JWT 认证——但没有任何管理员 UI。管理员无法在浏览器里注册企业、邀请成员、管理权限。当前 `admin.html` 是空壳。10/31 客户验收需要管理员能登录、管理成员、查看企业状态。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 企业多用户——管理员工作台 UI。升级 `app/admin.html` + `app/js/admin.js` + `app/css/admin.css`，提供企业注册、成员邀请/管理、IMA 绑定、GA 访问管理四个功能面板。复用 D96 shell + D97 dashboard 卡片模式 + `api-client.js`。

### Q1：调研
- D103 enterprise.ts：19 个端点（注册/邀请/成员/IMA/GA），全部需要 admin JWT
- D96 shell.js：`<header id="synova-shell">` + 导航 + 用户显示——`role === 'admin'` 时显示 Admin 链接
- D97 dashboard 模式：卡片网格 + skeleton 加载 + 响应式
- D96 api-client.js：`api.get()` / `api.post()` 自动附带 JWT

### Q2：范围
- 最小：4 个功能面板——企业状态 / 成员管理（列表+邀请+删除） / IMA 绑定状态 / GA 访问令牌管理。复用 D96 shell + D97 卡片模式
- 不做：不新增后端端点（D103 已有）、不修改 JWT 逻辑

### Q3：验收
- 入口：admin 登录 → 导航栏显示 "Admin" → 点击进入 `/app/admin.html`
- 交互：成员管理面板 → 邀请新成员 → 列表刷新 → 删除成员 → 确认弹窗
- 结果：所有操作通过 D103 端点完成——JWT 自动附带、错误处理、降级提示

### Q4：契约与测试
- @input：admin JWT（api-client.js 自动处理）
- @output：4 个功能面板全部渲染
- @degraded：端点不可用 → toast "Service unavailable" + Retry 按钮
- 测试：面板渲染(2) + 成员邀请(1) + 错误降级(1) = 4 tests

---

## 构建内容

### 1. 升级 app/admin.html（约 60 行）

4 个面板的 HTML 骨架——JS 动态渲染内容：

```html
<div class="page-content">
  <div class="admin-header"><h1>Admin Workbench</h1></div>
  <section class="admin-grid">
    <div class="card"><h2>Enterprise Status</h2><div id="enterprise-status"></div></div>
    <div class="card"><h2>Members</h2><div id="members-panel"></div></div>
    <div class="card"><h2>IMA Binding</h2><div id="ima-panel"></div></div>
    <div class="card"><h2>GA Access</h2><div id="ga-panel"></div></div>
  </section>
</div>
```

### 2. 升级 app/js/admin.js（约 200 行）

```javascript
// 4 个加载函数
async function loadEnterpriseStatus()  // GET /api/enterprise/status
async function loadMembers()           // GET /api/enterprise/members
async function inviteMember(email, role) // POST /api/enterprise/invite
async function removeMember(memberId)  // DELETE /api/enterprise/members/:id
async function loadImaStatus()         // GET /api/enterprise/ima/status
async function bindIma(apiKey)         // POST /api/enterprise/ima/bind
async function loadGaTokens()          // GET /api/enterprise/ga/generate
async function revokeGaToken(tokenId)  // DELETE /api/enterprise/ga/:token

// 渲染函数
function renderEnterpriseStatus(data)
function renderMembersList(members)
function renderImaBinding(status)
function renderGaTokens(tokens)
```

### 3. 升级 app/css/admin.css（约 80 行）

`.admin-grid`——2×2 响应式网格、`.member-row`——列表行样式、`.invite-form`——内联表单、`.token-item`——令牌项。

---

## 不做什么

- 不新增后端端点（D103 已有 19 个）
- 不修改 JWT/权限逻辑
- 不实现批量操作（MVP 单条操作）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 4 个面板全部渲染（enterprise/members/IMA/GA）
- inviteMember → 表单提交 → 列表刷新
- 端点 401 → toast "unauthorized"
- 端点 500 → toast "service unavailable" + Retry
- 4 个测试

---

## 完成标准

```
[ ] admin.html: 4 功能面板骨架
[ ] admin.js: 8 个 API 调用函数 + 4 个渲染函数
[ ] admin.css: 响应式网格 + 列表/表单/令牌样式
[ ] D96 shell 复用: header#synova-shell + admin 导航可见
[ ] D96 api-client.js 复用: JWT 自动附带
[ ] 降级: 端点不可用 → toast + Retry
[ ] ≥4 个测试
```
