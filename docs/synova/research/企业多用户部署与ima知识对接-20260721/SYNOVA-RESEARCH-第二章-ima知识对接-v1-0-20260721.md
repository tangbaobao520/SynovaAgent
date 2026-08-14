<!--
  Synova 企业多用户部署 | 第二章：ima 知识对接
  版本: v1.0 | 日期: 2026-07-21 | 作者: Synova 研究组
  定位: 技术设计文档——定义 Synova Server 与腾讯 ima 知识库的连接规范、权限模型、提取策略与同步机制
  前置输入: 研究方案 v2.0, knowledge-curator.ts, knowledge-agent.ts, 权威14 MVS
-->

# 第二章：ima 知识对接

> 核心问题：企业知识沉淀在 ima（腾讯智能知识库）中——OKR 文档、财务报表、会议纪要。Synova 如何安全地接入这些知识，既不越权读取敏感文档，又能提取诊断所需的结构化事实？
> 本章产出：ima 连接器完整规范（API 端点 / 认证 / 权限继承 / 提取策略 / 同步频率 / 变更检测）

---

## 2.0 设计约束与安全基线

| 约束 | 说明 |
|------|------|
| **不超级 Token** | Synova 不以企业全局 Token 读取 ima 全量文档。每个用户的文档访问范围 = ima 原生权限。 |
| **不阻断主系统** | ima API 不可用时，FDE 诊断和 Sentinel 哨兵继续运行。仅知识提取功能降级。 |
| **最小提取面** | 默认只提取 3 类文档（战略/运营/会议），不提取合同、员工手册等敏感或非诊断文档。 |
| **可追溯** | 每条 PKB 条目必须包含 source 字段，可反向追溯到 ima 原始文档。 |
| **增量同步** | 不重复提取已有文档。变更检测驱动重新提取。 |

---

## 2.1 ima 连接器规范

### 2.1.1 ima API 端点（假定，需腾讯 ima 开放平台确认）

| 端点 | 方法 | 功能 | 请求 | 响应 |
|------|------|------|------|------|
| `/api/v1/auth/token` | POST | 验证 API Key，获取临时 access_token | `{ apiKey, enterpriseId }` | `{ accessToken, expiresIn, scope }` |
| `/api/v1/documents` | GET | 获取当前用户的文档列表（分页） | `?page=1&size=50&updatedAfter=ISO` | `{ documents: [{ id, title, type, updatedAt, tags }], total }` |
| `/api/v1/documents/:id` | GET | 获取单文档内容（含全文和元数据） | — | `{ id, title, content, type, author, createdAt, updatedAt }` |
| `/api/v1/documents/:id/permissions` | GET | 查询指定文档的权限设置 | — | `{ viewers: [{ userId, role }], editors: [...] }` |
| `/api/v1/users/:userId/documents` | GET | 获取指定用户的文档列表（管理员代理查询） | `?page=1&size=50` | `{ documents: [...] }` |
| `/api/v1/enterprise/token/validate` | GET | 验证企业级 API Key 是否有效 | — | `{ valid: boolean, expiresAt, scope }` |

### 2.1.2 认证流程（企业管理员首次配置）

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ima API Key 配置流程                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 企业管理员登录 ima 管理后台                                       │
│     → 获取企业级 API Key（只读权限，scope: documents:read）           │
│                                                                     │
│  2. 管理员打开 Synova Electron 管理员工作台                           │
│     → 导航到「ima 知识库绑定」页面                                   │
│     → 粘贴 API Key                                                  │
│                                                                     │
│  3. Synova Server 接收 API Key                                       │
│     POST /api/enterprise/ima/bind                                   │
│     Body: { apiKey: "ima_sk_xxx..." }                               │
│                                                                     │
│  4. Synova Server 立即测试连接                                       │
│     → 调用 ima /api/v1/enterprise/token/validate                    │
│     → 成功：返回 { ok: true, expiresAt, scope }                      │
│     → 失败：返回 { ok: false, error: "API Key 无效" }               │
│                                                                     │
│  5. Synova Server 存储 API Key（加密存储）                            │
│     → 使用 AES-256-GCM 加密后存入 SQLite 配置表                      │
│     → 生产密钥由 JWT_SECRET 派生                                     │
│                                                                     │
│  6. 定期校验（每 24 小时）                                            │
│     → Cron 任务调用 ima /validate 端点                               │
│     → 有效：更新时间戳                                               │
│     → 即将过期（< 7 天）：主动触达引擎通知管理员                      │
│     → 已过期：标记所有 ima 文档为"待处理"，发出通知                   │
│                                                                     │
│  7. 失败处理                                                         │
│     → ima API 不可用 → 不阻断系统                                    │
│     → 标记文档为"待处理"状态                                         │
│     → 主动触达引擎发出通知："ima 知识库连接中断，请检查 API Key"      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.1.3 API Key 加密存储方案

```typescript
// src/connectors/ima.ts — 加密存储接口

interface ImaConfig {
  apiKey: string;          // 加密后的 API Key（ciphertext）
  keyFingerprint: string;  // SHA256(apiKey) 前 8 位，用于快速比对
  boundBy: string;         // 绑定此 Key 的管理员 userId
  boundAt: string;         // ISO 时间戳
  lastValidatedAt: string;
  expiresAt: string;       // ima 返回的过期时间
  status: 'active' | 'expiring' | 'expired' | 'error';
}

// 加密/解密
function encryptApiKey(plaintext: string, encryptionKey: Buffer): string;
function decryptApiKey(ciphertext: string, encryptionKey: Buffer): string;

// 派生加密密钥（从 JWT_SECRET 或独立 SECRET）
function deriveEncryptionKey(): Buffer {
  const secret = process.env.IMA_ENCRYPTION_KEY || process.env.JWT_SECRET;
  return crypto.scryptSync(secret || 'dev-fallback-key', 'ima-salt', 32);
}
```

---

## 2.2 用户级权限继承（安全底线）

### 2.2.1 核心原则

> **每个用户的文档访问范围 = ima 原生权限。Synova 不以超级 Token 读全量文档——以每个用户自己的权限读取。**

这意味着：
- 财务部员工只能看到 ima 中自己有权限的文档（财报、预算）
- 老板的机密战略文档如果未在 ima 中授权给此员工，Synova 也读不到
- 知识提取的结果（PKB 条目）自动继承源文档的权限级别

### 2.2.2 实现方案：用户级 Token 代理

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ima 用户级权限代理模型                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Synova Server                              腾讯 ima 服务器          │
│  ┌─────────────────────┐                   ┌──────────────────┐    │
│  │ imaKnowledgeScanner │                   │                  │    │
│  │                     │                   │  GET /documents  │    │
│  │  1. 获取企业成员列表  │                   │  (userA token)    │    │
│  │     ↓               │                   │  → 财报 + 预算    │    │
│  │  2. 对每个成员:       │                   │                  │    │
│  │     获取其 ima Token │                   │  GET /documents  │    │
│  │     ↓               │                   │  (userB token)    │    │
│  │  3. 以其 Token 调 API │                   │  → OKR + 会议纪要 │    │
│  │     ↓               │                   │                  │    │
│  │  4. 按用户合并+去重   │                   │                  │    │
│  │     ↓               │                   │                  │    │
│  │  5. 提取 → PKB       │                   │                  │    │
│  └─────────────────────┘                   └──────────────────┘    │
│                                                                     │
│  关键约束:                                                          │
│  - 扫描器不缓存用户的 ima Token（每次从安全存储获取）                 │
│  - 如果某用户未绑定 ima Token → 跳过该用户                           │
│  - 提取出的 PKB 条目 accessLevel = 源文档 ima 权限对应的级别         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2.3 权限映射表（ima 权限 → Synova 权限）

| ima 文档权限 | Synova PKB accessLevel | Synova PKB sensitivity |
|-------------|----------------------|----------------------|
| 企业全员可见 | `public` | `normal` |
| 指定部门可见 | `team` (teamId = 部门 ID) | `normal` |
| 指定成员可见 | `team` (teamId = 成员列表) | `sensitive` |
| 仅创建者可见 | `private` (ownerId = 创建者) | `restricted` |
| 老板/高管专属 | `private` (ownerId = 创建者) | `restricted` |

### 2.2.4 PKB 权限继承实现伪代码

```typescript
// src/connectors/ima.ts — 权限继承逻辑

async function extractDocWithPermission(
  doc: ImaDocument,
  viewerUserId: string,
  viewerImaToken: string
): Promise<ExtractedPkbEntry | null> {
  // 1. 获取文档在 ima 中的权限设置
  const permissions = await imaApi.getDocumentPermissions(doc.id, viewerImaToken);

  // 2. 映射到 Synova 权限模型
  const synovaAccess = mapImaPermissionToSynova(permissions, viewerUserId);

  // 3. 提取文档内容
  const content = await imaApi.getDocument(doc.id, viewerImaToken);

  // 4. 过滤：只提取诊断相关章节（§2.3）
  const filteredContent = filterDiagnosticContent(content, doc.type);
  if (!filteredContent) return null; // 非诊断文档，跳过

  // 5. 构建 PKB 条目（权限继承）
  return {
    text: filteredContent,
    sourceType: 'external',
    sourceId: `ima:${doc.id}`,
    authorityLevel: 'reference',
    accessLevel: synovaAccess.level,        // 继承自 ima 权限
    accessTeamId: synovaAccess.teamId,       // 继承自 ima 部门
    accessSensitivity: synovaAccess.sensitivity,
    source: {
      source: 'ima',
      documentId: doc.id,
      documentTitle: doc.title,
      pageRef: 'auto-extract',
      extractedAt: new Date().toISOString(),
      extractedBy: viewerUserId,
    },
  };
}
```

---

## 2.3 知识提取范围与优先级

### 2.3.1 默认提取三类文档

| 类别 | 文档类型示例 | 提取优先级 | 诊断用途 |
|------|-------------|----------|---------|
| **战略规划类** | OKR 设定、年度计划、竞争分析、市场进入策略、产品路线图 | P0（最高） | 战略维度 (strategy) — 42 边 E-03/E-33/E-36 数据源 |
| **运营数据类** | 财务报告、销售报表、经营分析、成本结构、KPI 仪表盘 | P0（最高） | 财务维度 (finance) — 42 边 E-05/E-06/E-23/E-30/E-37 数据源 |
| **会议纪要类** | 月度 Review、产品评审、客户反馈、战略复盘、季度总结 | P1（高） | 组织维度 (org) — 42 边 E-17/E-38 数据源，补充信号 |

### 2.3.2 明确不提取的文档

| 黑名单类型 | 原因 |
|-----------|------|
| 劳动合同 / 员工手册 | 含个人敏感信息 (PII)，与诊断无关 |
| 供应商合同 / 采购合同 | 含商业机密，可通过 42 边 E-34 参数间接反映 |
| 薪酬明细 / 个税记录 | 含 PII，可通过 E-17 激励扭曲信号间接反映 |
| 法律文件 / 诉讼材料 | 含法律风险信息，非诊断核心输入 |
| 客户合同 / 保密协议 | 含第三方商业机密 |

### 2.3.3 GA 手动标记机制

GA 可以在诊断校准面板中手动标记需要额外提取的文档：

```
POST /api/ga/annotations/mark-for-extraction
Body: {
  documentId: "ima_doc_xxx",
  documentTitle: "XX 客户竞品分析",
  reason: "该文档包含客户所在行业的竞争格局数据，对哨兵 competitive-position 有价值",
  priority: "high"
}
```

标记后的文档进入提取队列，不再受默认三分类约束。GA 的标记操作记录到审计日志。

### 2.3.4 增量同步与变更检测

```
┌─────────────────────────────────────────────────────────────────────┐
│                      增量同步与变更检测流程                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  每次同步（默认每 6 小时）：                                         │
│                                                                     │
│  Step 1: 获取所有已提取文档的清单（本地 PKB sourceId 列表）          │
│  Step 2: 遍历 ima 用户文档列表                                       │
│          ├─ 新文档（ima docId 不在本地清单中）                        │
│          │  → 进入提取队列                                           │
│          ├─ 已有文档，updatedAt 变更                                 │
│          │  → 进入重新提取队列                                       │
│          └─ 已有文档，updatedAt 未变                                 │
│             → 跳过（hash 快速比对）                                  │
│  Step 3: 提取队列中的文档按优先级排序（战略 > 运营 > 会议）           │
│  Step 4: 逐个提取（带限流：每秒最多 5 个 ima API 调用）              │
│  Step 5: 文档更新后的级联操作:                                       │
│          ├─ 重新提取 → 写入新 PKB 条目（新 id）                      │
│          ├─ 旧 PKB 条目标记状态: "needs_revalidation"                │
│          ├─ 关联因果链标记: "stale"（等待下一轮诊断重新验证）         │
│          └─ 通知: "ima 文档 'XX' 已更新，3 条知识需重新验证"         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3.5 提取内容过滤规则

```typescript
// 文档 → PKB 条目的内容过滤逻辑
function filterDiagnosticContent(
  fullText: string,
  docType: ImaDocumentType
): string | null {
  // 1. 全文字数 < 100 → 跳过（太短，无诊断价值）
  if (fullText.length < 100) return null;

  // 2. 黑名单关键词过滤 → 返回 null（属于不提取类型）
  const BLACKLIST_KEYWORDS = [
    '劳动合同', '员工手册', '保密协议', '薪酬明细',
    '个税', '竞业限制', '股权激励协议', '诉讼',
  ];
  if (BLACKLIST_KEYWORDS.some(kw => fullText.includes(kw))) return null;

  // 3. 白名单信号：判断文档是否包含诊断相关信息
  const DIAGNOSTIC_SIGNALS = [
    // 战略类
    'OKR', '年度目标', '竞争分析', '市场策略', '产品路线图', '增长目标',
    // 运营类
    '收入', '成本', '利润', '毛利率', '现金流', '费用',
    '同比增长', '环比', '预算', '实际 vs', 'KPI',
    // 会议类
    '会议纪要', '月度回顾', 'Review', '复盘',
    '行动计划', '责任人', '截止日期',
  ];

  const matchedSignals = DIAGNOSTIC_SIGNALS.filter(sig =>
    fullText.includes(sig)
  );

  // 至少匹配 2 个信号才提取（减少噪音）
  if (matchedSignals.length < 2) return null;

  // 4. 截取前 5000 字符（诊断足够，避免超大文本）
  return fullText.slice(0, 5000);
}
```

---

## 2.4 文档引用追溯

### 2.4.1 PKB 条目的 source 字段格式

每条通过 ima 提取的 PKB 条目，其 `source` 字段包含完整的追溯信息：

```typescript
interface ImaPkbSource {
  source: 'ima';                // 固定值，标识来源系统
  documentId: string;           // ima 文档 ID（如 "doc_abc123"）
  documentTitle: string;        // 文档标题（如 "2026Q1 财务报告"）
  documentType: 'okr' | 'report' | 'meeting' | 'strategy' | 'other';
  documentUpdatedAt: string;    // ima 文档最后更新时间
  pageRef: string;              // 引用章节/页码（如 "§3 成本分析"）
  extractedAt: string;          // Synova 提取时间（ISO）
  extractedBy: string;          // 以哪个用户的 ima Token 提取的
  contentHash: string;          // 提取内容 SHA256 前 16 位
}
```

### 2.4.2 文档变更时的级联标记

```
ima 文档更新
    │
    ├─→ Synova 检测到 updatedAt 变更
    │
    ├─→ 重新提取该文档 → 生成新 PKB 条目（新 id）
    │
    ├─→ 旧 PKB 条目标记 pkb_status: "stale"
    │        ↓
    │   关联因果链标记: "data_stale"（需重新验证）
    │        ↓
    │   下次诊断时，专家会看到：
    │   "⚠️ 以下知识条目关联的源文档已更新，结论可能需要重新验证：
    │     [pkb_xxx] 引自 ima 文档 '2026Q1 财务报告'（2026-07-20 更新）"
    │
    └─→ 通知 GA："{文档标题} 已更新，{n} 条 PKB 条目标记为需重新验证"
```

### 2.4.3 追溯查询 API

```
GET /api/knowledge/trace/:pkbEntryId

Response:
{
  ok: true,
  entry: {
    id: "pkb_abc123",
    text: "2026Q1 毛利率 18%，同比下降 3 个百分点...",
    pkbStatus: "active",
    source: {
      source: "ima",
      documentId: "doc_xyz789",
      documentTitle: "2026Q1 财务报告",
      documentType: "report",
      pageRef: "§3 盈利能力分析",
      extractedAt: "2026-07-15T10:30:00Z"
    },
    versions: [                           // 历史版本
      {
        id: "pkb_abc122",
        extractedAt: "2026-04-15T10:30:00Z",
        status: "archived",
        replacedBy: "pkb_abc123"
      }
    ]
  }
}
```

---

## 2.5 同步频率与触发机制

### 2.5.1 定时同步（Cron）

| 参数 | 值 | 说明 |
|------|-----|------|
| 默认频率 | 每 6 小时 | `0 */6 * * *` |
| 可配置范围 | 1 小时 ~ 24 小时 | 管理员在工作台调整 |
| 首次同步 | 管理员绑定 ima API Key 后立即执行 | 全量扫描 + 提取 |
| 增量窗口 | `updatedAfter = 上次同步时间 - 1 小时` | 1 小时重叠窗口防遗漏 |
| 限流 | 每秒最多 5 个 ima API 调用 | 避免触发 ima 限流 |
| 超时 | 单次扫描最长 30 分钟 | 超时后记录进度，下次继续 |

### 2.5.2 手动触发（GA / 管理员）

```
POST /api/enterprise/ima/sync/trigger

Response:
{
  ok: true,
  syncId: "sync_20260721_001",
  startedAt: "2026-07-21T14:30:00Z",
  estimatedDuration: "约 5 分钟"
}
```

### 2.5.3 同步状态查询

```
GET /api/enterprise/ima/sync/status

Response:
{
  ok: true,
  lastSync: {
    syncId: "sync_20260721_001",
    startedAt: "2026-07-21T14:30:00Z",
    completedAt: "2026-07-21T14:35:22Z",
    documentsScanned: 245,
    newlyExtracted: 3,
    reExtracted: 1,
    skipped: 241,
    errors: 0
  },
  nextSyncAt: "2026-07-21T20:30:00Z",
  imaApiKey: { status: "active", expiresAt: "2026-12-31" }
}
```

---

## 2.6 与现有代码的关系

| 现有模块 | 变更类型 | 说明 |
|---------|---------|------|
| `src/connectors/ima.ts` | **新增** | ima 连接器主文件（认证 / 扫描 / 提取 / 校验） |
| `src/l3/knowledge-agent.ts` | **增强** | 新增 `imaDataSource` 工具，消费 ima 连接器的提取结果写入 PKB |
| `packages/engine-core/src/pipeline/diagnosis/knowledge-curator.ts` | **无变更** | 现有知识生命周期管理（markStale / consolidate）直接适用于 ima 来源的 PKB 条目 |
| `src/routes/enterprise.ts` | **新增** | 新增 `/api/enterprise/ima/bind`、`/api/enterprise/ima/sync/trigger`、`/api/enterprise/ima/sync/status` |
| `src/cron/` | **增强** | 新增 `imaSyncCronJob`（每 6 小时） |

---

## 2.7 降级策略与异常处理

| 异常场景 | 降级行为 | 恢复策略 |
|---------|---------|---------|
| ima API Key 过期 | 标记所有 ima 文档为 "待处理"，不提取新文档 | 通知管理员 → 管理员更新 Key → 自动恢复 |
| ima API 返回 5xx | 跳过本次同步，记录错误日志 | 下次 Cron 重试（指数退避：1h → 2h → 4h → 6h 封顶） |
| 某用户的 ima Token 无效 | 跳过该用户，继续处理其他用户 | 通知该用户 → 用户重新绑定 ima → 恢复该用户文档提取 |
| 某文档内容解析失败 | 标记该文档为 "extraction_failed"，跳过 | 下次变更时重新尝试提取 |
| 全量提取耗时超过 30 分钟 | 中断并保存进度（cursor: 最后成功提取的 docId） | 下次从 cursor 继续 |
