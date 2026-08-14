<!-- SYNOVA-IMPL-D239 v2.0 | 2026-07-27 | P0 | Auth Doc #18 Module 1 §4 -->
# SynovaAgent -- D239 GA 权限边界 v2.0
> P0 | 权威文档 #18 模块一 §四 | 覆盖代码差距 #2 + #4 + 冻结

## 权威文档验证

模块一 §四 GA权限边界与防数据泄漏 (6 条要求):
1. 查看数据: "管理员授权范围内可看, 默认S1及以下。S2及以上需管理员临时授权" → rbac.ts L53 无条件 true ❌
2. 下载原始数据: "管理员可设置禁止GA下载。默认 can_download_raw_data = false" → 无实现 ❌
3. 数据导出: "禁止——GA不能将诊断报告导出为可传播的文件格式" → 无检查 ❌
4. 合同到期: "所有权限自动收回。系统自动生成GA数据访问总结报告" → 无合同检查 ❌
5. 离职/解约: "管理员可立即冻结GA账户。冻结后所有正在进行的诊断立即中止" → 无冻结机制 ❌
6. 审计追踪: "GA每次查看敏感数据记录: userId + timestamp + 数据内容 + 查看目的" → 无审计 ❌

## Q0-Q4
Q0: GA 权限边界。rbac.ts L53 对 GA 无条件 true——客户已上线。
Q1: RBAC 三维 (数据x功能x时间) + GA 特有约束 (部门+敏感度+合同+冻结+审计)。
Q2: 做——RbacContext 加 GA 约束字段 (deptScope/sensitivityCeiling/contractExpiry/canDownload/isFrozen)；canAccessWorkspace GA 检查链；新增 canDownloadRawData/auditGaAccess；企业端增加 Freeze/Unfreeze API。不做——GA observation 软删除 (canModifyWorkspace 已正确拒止)。
Q3: GA 有约束→JWT 携带→canAccessWorkspace 逐项检查→不合规拒绝。管理员 POST /freeze→GA 立即失去全部权限。
Q4: 降级——约束字段未设置时默认安全值。isFrozen 默认 false。L1×7 + L2a×1。

## 改动清单

### 1. src/middleware/rbac.ts (81→~140行)
RbacContext 新增: deptScope? / sensitivityCeiling? / contractExpiry? / canDownload? / isFrozen? / gaConstraints?

canAccessWorkspace GA 检查链 (按优先级):
(a) isFrozen → true → false (立即中止, 最高优先级)
(b) contractExpiry < now → false + log.warn 'GA contract expired'
(c) deptScope 不含 ws.department → false + log 'GA department out of scope'
(d) ws.sensitivity > (sensitivityCeiling ?? 'S1') → false
(e) 通过全部检查 → true

新增导出:
- canDownloadRawData(ctx): boolean — ga role + canDownload===true
- auditGaAccess(ctx, action, target): void — 记录到 agent_memory (type: ga_audit)
- isGaFrozen(ctx): boolean — 封装冻结检查

### 2. src/routes/auth.ts — JWT payload 扩展
signJwtToken 对 ga role 追加: deptScope, sensitivityCeiling, contractExpiry, canDownload, isFrozen
verifyJwtToken 提取到 req.auth.gaConstraints

### 3. src/routes/enterprise.ts — GA 冻结/解冻 API
POST /api/enterprise/members/:userId/freeze (admin only)
  → 设置 User 节点 props.isFrozen = true
  → canAccessWorkspace 立即拒止该用户所有后续请求
POST /api/enterprise/members/:userId/unfreeze (admin only)
POST /api/enterprise/invite 增加可选 GA 约束字段

## 测试要求 (L1×7 + L2a×1)
| # | 测试 | 验证 |
|---|------|------|
| 1 | GA isFrozen=true → canAccessWorkspace false | L1 |
| 2 | GA contractExpiry 过期 → false + log.warn | L1 |
| 3 | GA deptScope 外 → false | L1 |
| 4 | GA sensitivity > ceiling → false | L1 |
| 5 | GA canDownloadRawData 默认 false | L1 |
| 6 | auditGaAccess 写入 agent_memory | L1 |
| 7 | GA 无约束 → 使用安全默认值 | L1 |
| 8 | POST /freeze → isFrozen=true → 后续请求拒止 | L2a |

## 接线验证
| 新 export | 调用方 | grep |
|----------|--------|------|
| canDownloadRawData | download 中间件 | grep -rn canDownloadRawData |
| auditGaAccess | canAccessWorkspace 内部 | grep -rn auditGaAccess |
| isFrozen | canAccessWorkspace 检查链 | grep -rn isFrozen |
| POST /freeze | enterprise.ts | grep freeze |

## 完成标准
| 标准 | 验证 |
|------|------|
| canAccessWorkspace 对 GA 先查 isFrozen, 再查 contract/dept/sensitivity | 代码确认检查链顺序 |
| canDownloadRawData 对 GA 默认 false | 代码 |
| POST /freeze 管理员冻结 GA 后立即拒止 | curl 端到端 |
| 8 tests 通过 | vitest run |
| tsc 零新增 + as any = 0 | CI + pre-commit |
