<!-- SYNOVA-IMPL-D243 v1.0 | 2026-07-27 | P1 | Auth Doc #18 Module 5 -->
# SynovaAgent -- D243 防破坏机制 v1.0
> P1 | 权威文档 #18 模块五 | 代码差距 #13 + #14 (2 gaps)
> 基线自适应阈值 + GA/员工破坏防护 + 双签机制 + 审计日志不可删除

## 权威文档验证
模块五 §一: "防破坏阈值应基于该企业过去30天的正常操作量来设定基线。Action创建量超过日均值3倍→审查。Goal变更超4倍→冻结24h。数据导出1h多次→冻结24h"
模块五 §二-§三: GA/员工破坏场景防护
模块五 §四-§五: 双签机制 + 审计日志只追加不删除

代码验证:
- 无异常检测机制 ❌ | 无基线计算 ❌ | 无双签 (D242实现) ❌
- 审计日志表存在但无写入保护 ❌

## Q0-Q4
Q0: 防破坏机制。系统不能假设所有行动者善意——需要基线自适应阈值+破坏场景防护。
Q1: 基线=过去30天操作量均值+标准差。阈值=日均值×倍数。双签=admin+founder (D242)。
Q2: 做——AnomalyDetector 类 (基线计算+异常检测); 破坏场景处理器 (冻结/告警/通知); 审计日志表追加保护 (D242补)。不做——独立董事双签 (D242 scope), GA置信度追踪 (需历史数据积累)。
Q3: Cron 每日计算基线→操作时检查是否触发阈值→触发→冻结/告警/通知管理员。GA连续高置信度建议失效→标记审查。
Q4: L1 单元测试 (基线计算+异常检测+场景处理) ×6。

## 改动清单

### 1. src/services/anomaly-detector.ts — 新建 (~120行)
BaselineCalculator: 从 audit_log 表统计过去30天操作量→{mean, stddev} per operation type
AnomalyDetector.check(operation, count, baseline): 检测 3x/4x 阈值触发
SabotageHandler: freezeUser(userId, duration) / unfreezeUser / notifyAdmin
GA sabotage: checkGaConfidence(userId, recentDiagnoses) →标记审查

### 2. src/middleware/rate-limiter.ts — 新建 (~60行)
操作计数器: 记录 Action/Goal/Export 操作时间戳
checkRateLimit(userId, operation): 1h 窗口内次数 → 触发阈值→返回 {blocked, reason}

### 3. src/l4/audit-log.ts — 审计日志保护 (~40行)
audit_log 表: INSERT ONLY (无 DELETE/UPDATE 权限, SQLite trigger 或应用层拒绝)
writeAuditLog(operation, operator, target, diff, reason)

### 4. src/routes/enterprise.ts — 管理员通知端点
GET /api/admin/alerts — 最近安全告警列表
POST /api/enterprise/members/:userId/unfreeze — 管理员解冻 (已有, 增强)

## 测试要求
| # | 测试 | 验证 |
|---|------|------|
| 1 | 基线计算: 30天数据→mean+stddev 正确 | L1 |
| 2 | Action 3x阈值触发异常 | L1 |
| 3 | Goal 4x阈值触发冻结 | L1 |
| 4 | 1h多次导出触发冻结 | L1 |
| 5 | freezeUser 后 canAccessWorkspace=false | L1 |
| 6 | audit_log DELETE 被拒绝 | L1 |

## 完成标准
| 标准 | 验证 |
|------|------|
| AnomalyDetector 基线计算+异常检测 | 代码+测试 |
| RateLimiter 1h窗口检查 | 代码 |
| audit_log INSERT ONLY | SQL schema |
| freeze/unfreeze 集成到 rbac | 接线 |
| 6 tests 通过 | vitest |
| tsc 零新增 + as any = 0 | CI + pre-commit |
