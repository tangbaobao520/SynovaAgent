<!-- SYNOVA-IMPL-D253 v1.0 | 2026-07-28 | #05 M3 GA管理界面 -->
# SynovaAgent -- D253 GA 管理界面 v1.0
> GA 角色+权限边界 (D239) 完整, 无 GA 端 UI

## 代码验证
- rbac.ts: ga role + GAConstraints ✅
- enterprise.ts: ga-access generate/validate/data/delete 4 endpoints ✅
- D244 federated-pipeline.ts: GA 审批 API ✅
- app/ 下无 GA 页面 ❌

## Q0-Q4
Q0: GA 角色已定义, 权限边界已实现, 但 GA 没有可操作的界面。
Q2: 做——新建 app/ga.html + app/js/ga.js, 4 面板: 企业状态(单企业JWT) + 诊断概览(cockpit) + 联邦审批 + 标注纠错(已有后端API)。不做——GA 数据导出(禁止), 多企业切换(无多企业场景)。
Q3: GA 登录→ga.html→企业状态(cockpit数据) + 诊断概览 + 联邦审批列表 + 标注纠错表单
Q4: L1 手动×3。纯前端。

## 改动 (~150行, 纯前端)

### 1. app/ga.html — 新建 (~30行)
复用 .three-panel 布局。左栏: 企业列表, 中栏: 诊断数据+报告, 右栏: 联邦审批+Observation

### 2. app/js/ga.js — 新建 (~100行)
4 面板加载函数:
- `loadEnterprises()`: GET /api/enterprise/status → 企业信息 (GA 有权限的)
- `loadDiagnosisOverview()`: GET /api/cockpit/data → 信号+门禁+活跃任务
- `loadFederatedPending()`: GET /api/admin/knowledge/federated/pending → GA 审批列表
- `writeObservation()`: POST /api/admin/knowledge/federated/:id/approve (GA 审批)

### 3. app/css/app.css — GA 面板样式 (~20行)
.ga-panel / .ga-enterprise-item / .ga-observation-form

## 测试 (L1 手动×3)
| # | 测试 |
|---|------|
| 1 | GA 页面加载→企业列表展示 |
| 2 | 联邦知识审批面板→Approval 操作 |
| 3 | 纠错标注输入→提交 |

## 完成标准
GA 可查看企业诊断数据+审批联邦知识+写入 Observation。纯前端。
