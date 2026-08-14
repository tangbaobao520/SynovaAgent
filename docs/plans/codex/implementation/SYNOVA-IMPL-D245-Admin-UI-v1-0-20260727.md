<!-- SYNOVA-IMPL-D245 v1.0 | 2026-07-27 | Admin Workbench UI -->
# SynovaAgent -- D245 管理员工作台 UI 更新 v1.0
> D108 admin.html 已建基础面板。D242/D243/D244 加新功能需 UI 面板。

## 改动 (仅前端 app/admin.html + app/js/admin.js + app/css/admin.css)

### 新增 3 个面板
1. 角色模板管理: 模板列表 + 新建/编辑/删除按钮。内置模板灰色不可删。调用 GET/POST/DELETE /api/enterprise/role-templates
2. 知识审批: 待审批列表 + Approve/Reject 按钮 + 驳回理由输入。调用 GET /api/admin/knowledge/pending + POST approve/reject
3. 联邦知识: 可共享标记 + GA 审批 + 降级列表。调用 D244 联邦 API

### 测试 (L1 手动×3)
| # | 测试 |
|---|------|
| 1 | 模板管理面板展示内置+自定义模板, 内置不可删除 |
| 2 | 知识审批面板 Approve/Reject 操作 |
| 3 | 联邦知识面板标记可共享 + 查看待审批 |

## 完成标准
admin.html 3 个新面板可操作。API 调用正确。tsc零新增 (纯前端 JS).
