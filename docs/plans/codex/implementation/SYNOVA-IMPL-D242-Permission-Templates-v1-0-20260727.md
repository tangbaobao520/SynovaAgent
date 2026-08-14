<!-- SYNOVA-IMPL-D242 v1.0 | 2026-07-27 | P1 | Auth Doc #18 Module 1 §2-3 -->
# SynovaAgent -- D242 权限模板 + 管理员制衡 v1.0
> P1 | 权威文档 #18 模块一 §二-§三 | 代码差距 #3
> 5 内置角色不够中型企业使用, 无双签/审计保护

## 权威文档验证
模块一 §二: "管理员可基于内置模板创建自定义模板, 在模板基础上为具体用户增减权限"
模块一 §三: "全量数据导出→安全告警+审计日志+通知创始人 / 删除审计日志→禁止 / 批量修改权限→管理员+创始人双签 / 连续异常操作→冻结导出24h"

代码验证:
- rbac.ts: 5 角色常量 (admin/manager/liaison/staff/ga) 硬编码——无模板系统 ❌
- 无双签机制 ❌ | 无审计日志写入保护 ❌ | 无权限变更追踪 ❌

## Q0-Q4
Q0: 权限模板系统 + 管理员制衡。D239 修了 GA 边界, D242 扩展模板系统让中型企业可自定义角色。
Q1: RBAC 模板系统——内置模板不可删除, 自定义模板基于内置模板派生 (继承+覆盖)。双签=admin+founder 或退化二次确认。
Q2: 做——新增 RoleTemplate 类型 + RoleTemplateStore; enterprise.ts 新增模板 CRUD API; 双签机制 (关键操作需 secondApprover); 审计日志表追加保护。不做——独立董事双签 (可选功能, 多付费客户后), 自定义权限 UI (admin.html 已有基础)。
Q3: 管理员创建自定义模板→分配给用户→用户权限基于模板派生。双签操作 (批量权限变更) 需两人确认或二次确认。
Q4: L1 单元测试 (RoleTemplateStore CRUD + 双签逻辑) ×5。L2a 集成测试 (模板 CRUD API) ×2。

## 改动清单

### 1. src/middleware/rbac.ts — 新增 RoleTemplate 类型 + 派生逻辑
RoleTemplate 接口: { id, name, basedOn, permissions: {data, function, time}, isBuiltin }
BUILTIN_TEMPLATES 常量: admin/manager/liaison/staff/ga (不可删除)
derivePermissions(template, overrides): 从模板派生实际权限

### 2. src/services/role-template-store.ts — 新建 (~100行)
模板 JSON 文件存储 (.codex/settings/role-templates/{id}.json)
CRUD: listTemplates / getTemplate / saveTemplate / deleteTemplate
deleteTemplate 拒绝删除内置模板 (isBuiltin=true)

### 3. src/routes/enterprise.ts — 模板管理 API + 双签
GET /api/enterprise/role-templates — 模板列表
POST /api/enterprise/role-templates — 创建自定义模板
DELETE /api/enterprise/role-templates/:id — 删除 (拒绝内置)
POST /api/enterprise/members/:userId/role — 为用户分配角色模板
双签: 批量权限变更操作需 x-second-approver header

### 4. src/services/audit-log.ts — 审计日志保护 (新增或修改)
audit_log 表: INSERT ONLY (无 DELETE/UPDATE 权限, SQLite 层面限制)
writeAuditLog(operation, context, diff): 追加写

## 测试要求
| # | 测试 | 验证 |
|---|------|------|
| 1 | 内置模板不可删除 | L1 |
| 2 | 自定义模板 CRUD | L1 |
| 3 | 模板派生权限正确 | L1 |
| 4 | 双签拒绝单签请求 | L1 |
| 5 | 审计日志 INSERT ONLY | L1 |
| 6 | POST 模板 API 端到端 | L2a |
| 7 | DELETE 内置模板返回 403 | L2a |

## 完成标准
| 标准 | 验证 |
|------|------|
| 5 内置模板不可删除 | 代码+测试 |
| 自定义模板 CRUD 完整 | API + 测试 |
| 双签机制存在 | 代码 |
| 审计日志只追加不删除 | SQL schema |
| 7 tests 通过 | vitest |
| tsc 零新增 + as any = 0 | CI + pre-commit |
