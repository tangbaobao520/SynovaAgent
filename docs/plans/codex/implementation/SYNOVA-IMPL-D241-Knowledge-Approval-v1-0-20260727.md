<!-- SYNOVA-IMPL-D241 v1.0 | 2026-07-27 | P0 | Auth Doc #18 Module 4 -->
# SynovaAgent -- D241 知识审批流水线 + 管理员界面 v1.0
> P0 | 权威文档 #18 模块四 §一-§二 | 代码差距 #11
> knowledge-store.ts pkb_status 默认 'active'——无审批, 知识直接上线

## 权威文档验证

模块四 §一 流水线一: "draft → pending_admin_review → approved(team/enterprise可见) 或 rejected(退回来源)"
模块四 §二 流水线二: "enterprise knowledge(管理员已批准+标记可对外共享) → anonymized → pending_admin_review → pending_ga_review → >=2家其他企业验证 → federated"

代码验证:
- knowledge-store.ts L70: `pkb_status TEXT DEFAULT 'active'`——无 draft/pending_admin_review 状态 ❌
- knowledge_chunks 表有 pkb_* 字段但无 approval 流程 ❌
- 无管理员审批 API 端点 ❌
- 无管理员审批 UI ❌

## Q0-Q4
Q0: 知识审批双流水线。当前知识写入直接 active——系统自动产生的知识和 GA 的 observation 直接上线, 无管理员审核。
Q1: 行业对标——CMS 审批流 (WordPress pending→publish), Git PR review (draft→review→merge)。双流水线设计: 企业内(admin审批)+联邦(admin+GA+多企业验证)。
Q2: 做——knowledge-store.ts 新增 3 个 pkb 状态 + approvePkb/rejectPkb 方法；新增 admin 审批 API POST /api/admin/knowledge/approve + GET /api/admin/knowledge/pending；admin.html 增加待审批知识列表。不做——联邦知识流水线 (D244)、脱敏引擎 (D244)。
Q3: 入口: 系统写入 PKB(status=draft) → admin.html 待审批列表 → POST approve → status=approved 公开可见。GA observation 写入时自动 draft 状态, 需管理员审批。
Q4: 降级——审批 API 不可用 → 知识保持 draft 状态 + log.warn。L1 单元 + L2a 集成。

## 改动清单

### 1. src/l4/knowledge-store.ts — 新增状态 + 审批方法
pkb_status 扩展: 'draft' | 'pending_admin_review' | 'approved' | 'rejected' (默认 'draft')
新增方法: approvePkb(id, approverId) / rejectPkb(id, approverId, reason)
新增方法: listPendingPkb(orgId, limit?, offset?) → KnowledgeChunk[]
PKB 写入时默认 status='draft' (而非 'active')

### 2. src/routes/admin.ts — 新增审批 API (或新建 admin-knowledge.ts)
GET /api/admin/knowledge/pending — 待审批知识列表 (admin 角色)
POST /api/admin/knowledge/:id/approve — 审批通过 (admin 角色)
POST /api/admin/knowledge/:id/reject — 驳回 (body: { reason }, admin 角色)

### 3. app/admin.html + app/js/admin.js — 新增待审批知识 UI
admin.html 增加 "Knowledge Approval" 面板
列表: 显示 pending_admin_review 的知识条目
操作: Approve / Reject 按钮 + Reject reason 输入框
API 调用: fetch (GET pending) → render → (POST approve/reject) → refresh

## 测试要求
| # | 层级 | 测试 | 验证 |
|---|------|------|------|
| 1 | L1 | approvePkb → status='approved', 记录 approver+timestamp | 单元 |
| 2 | L1 | rejectPkb → status='rejected', 记录 reason | 单元 |
| 3 | L1 | 新写入 PKB 默认 status='draft' | 单元 |
| 4 | L1 | listPendingPkb 返回正确过滤结果 | 单元 |
| 5 | L2a | POST /api/admin/knowledge/approve 端到端 | 集成 |
| 6 | L2a | admin role 可审批, staff role 被 403 | 集成 |

## 接线验证
| 新/改 export | 调用方 | 验证 |
|-------------|--------|------|
| approvePkb / rejectPkb | POST /api/admin/knowledge/approve | grep routes |
| listPendingPkb | GET /api/admin/knowledge/pending | grep routes |
| admin.html Knowledge Approval UI | admin.js fetch | 手动 |

## 完成标准
| 标准 | 验证 |
|------|------|
| pkb_status 枚举: draft/pending_admin_review/approved/rejected | 代码 |
| approvePkb + rejectPkb 实现 + 测试 | vitest |
| 新写入 PKB 默认 draft (非 active) | 代码确认 |
| admin API 端点可调用 + role 检查 | curl |
| admin.html 待审批列表可见 | 手动 |
| 6 tests 通过 | vitest |
| tsc --noEmit 零新增 | CI |
| as any = 0 | pre-commit |
