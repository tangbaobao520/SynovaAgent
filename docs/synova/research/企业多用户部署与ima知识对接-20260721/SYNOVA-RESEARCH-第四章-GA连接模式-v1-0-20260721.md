<!--
  Synova 企业多用户部署 | 第四章：GA 连接模式
  版本: v1.0 | 日期: 2026-07-21 | 作者: Synova 研究组
  定位: 架构设计文档——定义 GA（增长顾问）与企业 Synova Server 的连接模式、数据边界、三数据源、临时安全链接机制
  前置输入: 研究方案 v2.0, 权威05 Module 3 (GA人机协同), ga-admin.ts, ga-annotations.ts, ga-corrections.ts
-->

# 第四章：GA 连接模式

> 核心问题：GA（增长顾问）如何查看企业诊断数据？GA 有自己独立的 Synova 工作台，但客户数据不能出企业边界。GA 与客户企业 Synova Server 之间是什么关系？
> 本章产出：GA 数据边界模型、三数据源设计、临时安全链接机制、客户现场模式、与现有 GA 路由的继承关系

---

## 4.0 核心设计原则：GA 不远程连接企业 Synova Server

> **企业 Synova Server 的数据不出企业边界。GA 不能从互联网直接连接企业的 Synova 数据库。**

这是数据安全的绝对底线：
- 企业的财务数据（E-05/E-06/E-37 边参数）存储在本地 SQLite
- 企业的组织数据（人员、团队、角色）存储在本地
- 企业的知识库（PKB）存储在本地

GA 的工作方式不是"登录客户的 Synova Server 查看数据"，而是通过以下三种数据源获取诊断所需的信息。

---

## 4.1 GA 工作台的三个数据源

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GA 工作台 — 数据源架构                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      GA Synova 实例                          │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │                                                         │  │  │
│  │  │  数据源 ① ─── 联邦进化的匿名聚合数据                     │  │  │
│  │  │              (跨企业模式识别、行业基线、诊断规则优化)      │  │  │
│  │  │                                                         │  │  │
│  │  │  数据源 ② ─── 客户主动分享的诊断报告                     │  │  │
│  │  │              (PDF/HTML 导出，静态快照，非实时数据)         │  │  │
│  │  │                                                         │  │  │
│  │  │  数据源 ③ ─── 临时安全链接                               │  │  │
│  │  │              (一次性 token，有严格过期时间，远程深度诊断)  │  │  │
│  │  │                                                         │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  数据源 ④ ─── 客户现场模式（局域网直连）                      │  │
│  │  当 GA 在客户现场时 → 通过局域网连接企业 Synova Server       │  │
│  │  → 正常使用全部功能（等同于企业 admin）                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1.1 数据源 ① — 联邦进化的匿名聚合数据

**数据内容**：来自所有企业客户的匿名化诊断结果聚合

| 数据类型 | 说明 | 匿名化方式 |
|---------|------|-----------|
| 行业基线数据 | "母婴零售行业平均毛利率 18.5%，标准差 6.2%" | 聚合统计，不暴露单企业 |
| 诊断规则效果反馈 | "'成本结构恶化' 哨兵在制造业准确率 78%" | 来自 `ga-annotations.ts` 的精度统计 |
| 常见增长问题模式 | "50-100人规模企业最常见的 3 个增长瓶颈是..." | 多企业因果链聚合 |
| 专家推理质量 | "finance 专家在制造业案例中需要修正的比例 12%" | 来自 `ga-corrections.ts` 的修复率统计 |

**数据流向**：

```
企业 Synova Server (本地)
    │
    ├─→ 匿名化引擎 (PIIScrubber)
    │   - 去除企业名称、人员姓名、邮箱
    │   - 数值做分桶处理（精确收入 → 收入区间）
    │   - 仅输出聚合统计特征
    │
    ├─→ GA Synova 联邦进化数据库
    │   - 存储匿名化规则和基准
    │   - 供 GA 诊断时参考
    │
    └─→ 无逆向路径：GA 不能从聚合数据反推单企业信息
```

**代码关系**：
- `packages/engine-core/src/pipeline/diagnosis/knowledge-curator.ts` — 现有的 `federated` 知识源 (`KnowledgeSource`) 正是为此设计的
- `security/PIIScrubber` — 匿名化引擎（已有）

### 4.1.2 数据源 ② — 客户主动分享的诊断报告

**触发方式**：企业 admin 在诊断报告页面点击「分享给 GA」

**分享内容**：静态快照，包含：

| 内容 | 格式 | 说明 |
|------|------|------|
| FDE 诊断报告 | PDF | 综合诊断报告（8 位专家输出） |
| 哨兵报告 | PDF | Sentinel Finding 列表 + 聚合结果 |
| 增长导航方案 | HTML | 35 级 Growth Goals + 执行路线图 |
| 因果链可视化 | PNG/SVG | 诊断过程中的因果追溯图 |

**导出 API**：

```
POST /api/reports/export
Authorization: Bearer <admin_jwt>
Body: {
  reportIds: ["rpt_abc", "rpt_def"],
  format: "pdf",
  includeChains: true,
  includeRawData: false   // 不包含原始数据，只含诊断结论
}

Response: { ok: true, downloadUrl: "/api/reports/download/bundle_xyz.pdf" }
```

**分享到 GA**：

```
POST /api/reports/share-to-ga
Authorization: Bearer <admin_jwt>
Body: {
  bundleId: "bundle_xyz",
  gaEmail: "advisor@synova.com",
  message: "请帮忙看看最近三个月的利润下滑问题"
}

→ 生成分享链接，发送到 GA 工作台的通知列表
→ GA 点击查看、标注（ga-annotations.ts）、纠错（ga-corrections.ts）
→ GA 的反馈通过 ga-annotations 和 ga-corrections 回写
```

### 4.1.3 数据源 ③ — 临时安全链接（远程深度诊断）

**使用场景**：
- GA 从 PDF 报告中发现了可疑的诊断结论
- 需要查看企业 Synova 的实时数据（哨兵原始信号、42 边参数、因果链状态）
- 但 GA 不能远程登录企业 Synova → 通过企业 admin 生成的临时安全链接

**生成流程**：

```
企业 admin 在工作台 → 点击「生成 GA 访问链接」
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  生成 GA 临时访问链接                                               │
│                                                                     │
│  有效时长:  [24 小时 ▾]  (1h / 6h / 24h / 72h)                     │
│  访问范围:  ☑ 诊断报告  ☑ 哨兵数据  ☑ 42边参数  ☐ 原始数据          │
│  访问限制:  ☑ 只读  ☐ 允许修改                                     │
│                                                                     │
│  [取消]  [生成链接]                                                 │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
POST /api/enterprise/ga-access/generate
Authorization: Bearer <admin_jwt>
Body: { durationHours: 24, scopes: ["reports", "sentinels", "edges"] }

Response:
{
  ok: true,
  accessLink: "https://synova.local/ga-access?token=ga_tok_abc123xyz",
  token: "ga_tok_abc123xyz",   // 一次性 token
  expiresAt: "2026-07-22T14:30:00Z",
  scopes: ["reports", "sentinels", "edges"],
  accessCount: 0,
  maxAccesses: 1               // 一次性 —— 用过即失效
}
```

**GA 使用流程**：

```
GA 收到访问链接 → 点击打开
    │
    ▼
验证 token 有效性 + 未过期 + 未使用过
    │
    ▼
进入临时数据查看页面（只读）
    │
    ├─→ 查看诊断报告（完整版，非 PDF 快照）
    ├─→ 查看哨兵数据（当前实时值 + 历史趋势）
    ├─→ 查看 42 边参数（当前值）
    └─→ 查看因果链状态
    │
    ▼
GA 操作（在此模式下允许的）：
    ├─→ 提交 ga-annotations（标注哨兵 Finding）
    ├─→ 提交 ga-corrections（纠错诊断结论）
    └─→ 下载诊断数据（用于离线分析）
    │
    ▼
session 结束（GA 关闭页面 或 token 过期）
    │
    ▼
token 自动失效 → accessCount 递增 → link 不可复用
```

**安全机制**：

| 机制 | 实现 |
|------|------|
| 一次性使用 | `accessCount` 达到 `maxAccesses`（默认 1）后自动失效 |
| 时间限制 | 默认 24 小时，最长为 admin 设置的有效时长 |
| 范围限制 | admin 决定 GA 可见的数据范围（reports / sentinels / edges / raw） |
| 只读 | 临时访问模式下不可修改数据（除 ga-annotations 和 ga-corrections 回写） |
| 审计日志 | 每次临时访问生成审计条目：谁访问、何时、看了什么 |
| 管理员可撤销 | admin 可随时撤销未使用的访问链接 |

**临时访问 API**：

```
GET /api/enterprise/ga-access/validate?token=ga_tok_abc123xyz
→ { ok: true, expiresAt, scopes, accessCount, maxAccesses }

GET /api/enterprise/ga-access/data/sentinels?token=ga_tok_abc123xyz
→ { ok: true, sentinels: [...] }  // 临时只读数据

GET /api/enterprise/ga-access/data/edges?token=ga_tok_abc123xyz
→ { ok: true, edges: [...] }      // 临时只读数据

DELETE /api/enterprise/ga-access/:token
Authorization: Bearer <admin_jwt>
→ 管理员手动撤销（即使未使用）
```

### 4.1.4 数据源 ④ — 客户现场模式（局域网直连）

**使用场景**：GA 出差到客户企业现场

```
GA 的笔记本电脑
    │
    ├─→ 连接到客户局域网（Wi-Fi / 有线）
    │
    ├─→ 打开 SynovaAgent Electron
    │    → 配置页输入：serverUrl = "192.168.1.100:3000"（客户 Synova Server）
    │    → 使用客户管理员给的临时账号登录（或 admin 创建的 GA 访客账号）
    │
    ├─→ 登录成功 → 正常使用全部功能：
    │    ├─→ FDE 按需诊断
    │    ├─→ Sentinel 哨兵实时数据
    │    ├─→ GA 校准面板（ga-annotations / ga-corrections）
    │    ├─→ 因果链追溯
    │    └─→ 增长导航
    │
    └─→ 离开现场 → Token 自动到期（临时账号设定过期时间）
```

**GA 现场访客账号**：

```
POST /api/enterprise/members
Body: {
  email: "advisor@synova.com",
  role: "ga_guest",
  department: "外部顾问",
  expiresInDays: 3         // 3 天后自动失效
}
→ 生成临时 GA 账号，仅限局域网使用
→ role = "ga_guest" 比正常 "ga" 少一些敏感权限
   （不可查看原始数据、不可导出完整数据库、不可邀请成员）
```

---

## 4.2 临时安全链接的完整生命周期

```
┌─────────────────────────────────────────────────────────────────────┐
│              临时安全链接生命周期（数据源 ③）                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  创建                                                               │
│  ├─ admin 生成 → POST /api/enterprise/ga-access/generate            │
│  ├─ token = crypto.randomBytes(32).toString('hex')                  │
│  ├─ 存储到 SQLite 临时表（token, orgId, createdBy, expiresAt,       │
│  │   scopes, accessCount, maxAccesses）                             │
│  └─ 返回一次性 URL + token                                         │
│                                                                     │
│  传输                                                               │
│  ├─ admin 复制链接 → 通过微信/邮件/飞书发送给 GA                    │
│  └─ 链接格式: https://synova.local/ga-access?token=xxx             │
│                                                                     │
│  使用                                                               │
│  ├─ GA 点击链接 → 浏览器打开                                        │
│  ├─ GET /api/enterprise/ga-access/validate?token=xxx                │
│  │   ├─ token 不存在 → 400 "无效链接"                               │
│  │   ├─ token 已过期 → 410 "链接已过期"                             │
│  │   ├─ accessCount >= maxAccesses → 410 "链接已使用"              │
│  │   └─ 有效 → 200 "验证通过，请确认访问"                           │
│  ├─ GA 确认 → accessCount++ → 进入临时数据查看页面                  │
│  └─ GA 操作 → 查看报告/哨兵/边缘 → 提交标注/纠错                     │
│                                                                     │
│  失效                                                               │
│  ├─ 主动失效 1: GA 关闭页面 → 前端调用 DELETE /api/.../close       │
│  ├─ 主动失效 2: admin 撤销 → DELETE /api/enterprise/ga-access/:token │
│  ├─ 自动失效 1: 超过 expiresAt → Cron 清理过期 token               │
│  ├─ 自动失效 2: accessCount >= maxAccesses → token 不可再用         │
│  └─ 审计日志: 完整记录创建/访问/关闭/失效时间                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4.3 与现有 ga-admin.ts / ga-annotations.ts / ga-corrections.ts 的关系

### 4.3.1 现有代码结构（不变）

这三个文件是 GA 工作台的核心后端路由，它们的 API 接口不变：

```
src/routes/
├── ga-admin.ts         ← GA 客户管理（客户列表 / 新增客户 / 切换客户）
├── ga-annotations.ts   ← GA 哨兵标注（标注 Finding 质量 → 精度统计）
└── ga-corrections.ts   ← GA 诊断纠错（纠正诊断结论 → 联邦学习数据）
```

### 4.3.2 调用场景变化

| 场景 | Demo 现状 | 企业版改造 |
|------|----------|----------|
| GA 查看客户列表 | 直接请求 `/api/ga/clients` → 返回 Mock 数据 | 数据源 ①（联邦聚合）提供匿名化客户列表 |
| GA 标注哨兵 Finding | GA 在查看 PDF 报告后标注 | GA 通过 **数据源 ②**（PDF）或 **数据源 ③**（临时链接）查看后标注 |
| GA 纠错诊断结论 | GA 在查看报告后纠错 | 同标注——通过数据源 ②/③ 触发 |
| GA 切换活跃客户 | `POST /api/ga/switch/:orgId` | 在 **数据源 ④**（现场模式）下使用 |

### 4.3.3 ga-admin.ts 的 Mock → 生产改造

```typescript
// routes/ga-admin.ts — 数据源从 Mock 切换到联邦聚合

// 现状 (Demo):
const MOCK_CLIENTS: Record<string, GAClient> = { ... };

// 改造后 (企业版):
async function getGAClients(gaUserId: string): Promise<GAClient[]> {
  // 数据源 ① — 联邦聚合（匿名化）
  const federatedClients = await federatedStore.listClients(gaUserId);

  // 数据源 ② — 主动分享（有完整信息）
  const sharedClients = await sharedReportStore.listSharedClients(gaUserId);

  // 数据源 ③ — 临时访问（当前有效的链接）
  const tempAccessClients = await tempAccessStore.listActiveLinks(gaUserId);

  // 合并（去重）→ 返回
  return mergeClients([federatedClients, sharedClients, tempAccessClients]);
}
```

### 4.3.4 ga-annotations.ts / ga-corrections.ts 的数据源适配

这两个文件的核心逻辑不变，但需要增加数据源上下文标记：

```typescript
// routes/ga-annotations.ts — 标注时记录数据源

router.post('/api/ga/annotations', async (req, res) => {
  // ... 现有校验逻辑不变 ...

  // 新增: 记录标注时的数据源上下文
  const annotationSource = (req.body.dataSource as string) || 'unknown';
  // 'shared_report' (数据源②) | 'temp_access' (数据源③) | 'on_site' (数据源④)

  const entry = store.remember({
    // ... 现有字段 ...
    tags: [
      'sentinel_annotation',
      req.body.sentinelId,
      annotation,
      `datasource:${annotationSource}`,  // 新增：标注来源
    ],
  });

  // ...
});
```

---

## 4.4 GA 角色权限矩阵

| 操作 | GA (远程) | GA (现场) | Admin | Manager | Staff |
|------|----------|----------|-------|---------|-------|
| 查看自己客户列表 | ✅ (联邦聚合) | ✅ | ✅ | ❌ | ❌ |
| 查看诊断报告 | ✅ (PDF/临时链接) | ✅ | ✅ | ✅ (本部门) | ✅ (本人) |
| 查看哨兵实时数据 | ✅ (仅临时链接) | ✅ | ✅ | ✅ (本部门) | ❌ |
| 标注哨兵 Finding | ✅ | ✅ | ❌ | ❌ | ❌ |
| 纠错诊断结论 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 修改 42 边参数 | ❌ | ✅ (可在现场建议) | ✅ | ❌ | ❌ |
| 导出原始数据 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 生成临时访问链接 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 邀请企业成员 | ❌ | ❌ | ✅ | ❌ | ❌ |

---

## 4.5 安全总结

| 保障维度 | 机制 |
|---------|------|
| 数据不出企业边界 | GA 不远程连接企业 Synova Server。数据通过匿名聚合 / PDF 导出 / 临时链接三种受控渠道流出。 |
| 临时链接最小权限 | admin 设置可见范围 + 有效时长。一次性 token，用后即焚。 |
| 匿名化不可逆 | 联邦聚合数据经过 PIIScrubber，数值分桶，无法反推单企业。 |
| 审计全记录 | 所有 GA 访问（临时链接、标注、纠错）记录到审计日志。 |
| 现场模式隔离 | GA 访客账号有独立 role "ga_guest"，权限矩阵最小化，到时自动失效。 |
