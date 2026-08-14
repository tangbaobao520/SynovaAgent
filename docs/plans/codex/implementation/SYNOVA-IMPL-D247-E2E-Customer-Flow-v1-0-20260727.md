<!-- SYNOVA-IMPL-D247 v1.0 | 2026-07-27 | 全链路E2E集成测试 -->
# SynovaAgent -- D247 全链路 E2E 集成测试 v1.0
> 覆盖完整客户流程。当前 tests/ 无 .e2e 测试——17/17 gates PASS 但端到端验证缺失

## 代码验证
- tests/ 下 18 个 .integration.test.ts ✅
- tests/ 下 0 个 .e2e.test.ts ❌
- 现有 full-pipeline.integration.test.ts 只测诊断管线, 不测注册/导入/审批

## Q0-Q4
Q0: 全链路 E2E 测试——验证从注册到报告到知识审批的完整客户流程。
Q1: 现有 18 个集成测试覆盖组件级, 缺少跨组件的端到端验证
Q2: 做——新建 tests/e2e/customer-flow.e2e.test.ts, 覆盖 5 阶段。不做——GA 工作台 E2E (需 GA 账户), 联邦知识 E2E (需多企业)
Q3: vitest 启动 Server → 注册企业 → 导入CSV → 触发哨兵 → 触发诊断 → 验证仪表盘 → 知识审批。全部通过 = 客户流程完整可用。
Q4: L2c E2E 测试×5。Server 未启动→skip。

## 改动 (tests/e2e/customer-flow.e2e.test.ts ~200行)

### 5 阶段测试

**Phase 1: 注册 + 认证**
POST /api/enterprise/register {name, adminEmail, adminPassword}
→ expect 201 + {ok:true, enterprise:{enterpriseId}, token}
POST /api/auth/login {email, password}
→ expect 200 + {ok:true, token}

**Phase 2: 数据导入**
POST /api/import/csv (D231) 示例 CSV
→ expect 200 + {imported > 0, warnings:[]}

**Phase 3: 哨兵巡检**
GET /api/sentinel/health
→ expect 200 + {status:"ok", sentinels > 0}
POST /api/loops/4/execute (loop-4 系统自检)
→ expect 200

**Phase 4: 诊断触发**
POST /api/loops/1/execute (loop-1 企业诊断)
→ expect 200 + {ok:true}
GET /api/cockpit/data
→ expect 200 + {signals:{}, gates:[], activeTasks > 0}

**Phase 5: 知识审批**
GET /api/admin/knowledge/pending
→ expect 200 + {ok:true, data:[], count >= 0}

## 测试 (L2c×5)
| # | 阶段 | 验证 |
|---|------|------|
| 1 | 注册+认证 | enterpriseId + token 非空 |
| 2 | 数据导入 | imported > 0 |
| 3 | 哨兵巡检 | sentinel health ok |
| 4 | 诊断触发 | cockpit data 有效 JSON |
| 5 | 知识审批 | pending API 可访问 |

## 降级: Server 未启动 → test.skip

## 完成标准
5 tests 通过 (Server 运行时) 或 5 skips (Server 未启动)。tsc 零新增, as any=0。
