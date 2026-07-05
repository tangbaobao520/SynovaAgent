# Task Brief: Phase G3 — 升级链（对标补全）

> 生成: 2026-07-05 00:30 | 分支: session/02 | as any: 0
> 来源: docs/plans/codex/implementation/SYNOVA-IMPL-对标补全-v1-20260703.md — Phase 3 (G3, P0)
> Anthropic 决策链路: spec → test → impl → wire → review → merge

## Q0: 定位

### a) 项目拼图
- **纵向**: L2 编排层 — escalation-engine 是哨兵发现到通知分发的中间决策层
- **Synova 定位**: 对接人连续忽略告警后自动升级到上级。数据改善才停止升级，不是已读就停。
- **本任务在哪一层**: L2（编排层—告警处理管线）+ L2 配置（文件驱动升级规则 JSON）
- **上下层依赖**:
  - L1 交互层: 不涉及
  - L2 已有模块: `src/sentinel/runner.ts`（哨兵运行器）、`src/sentinel/baseline-store.ts`（基线对比 + 已有 escalatedFindings）
  - L2 通知: `src/notifications/registry.ts`（dispatchNotification）+ `src/notifications/types.ts`（Notification/NotificationAdapter）
  - L4 数据: `src/l4/agent-memory-store.ts`（持久化 ignore 记录和升级历史）
- **本任务是替换还是扩展**: 新建。当前哨兵通知管线没有升级链——告警发给对接人后，没有"被忽略后自动升级"的机制。

### b) 文件审计
```
src/sentinel/runner.ts                        — ✅ 已有（哨兵运行器，line 567 日志已有发现统计）
src/notifications/registry.ts                 — ✅ 已有（dispatchNotification + adapter 注册表）
src/notifications/types.ts                    — ✅ 已有（Notification/NofiticationAdapter 接口）
src/notifications/electron-adapter.ts         — ✅ 已有（email 渠道）
src/sentinel/baseline-store.ts                — ✅ 已有（Severity 级升级，非人员级）
extensions/policies/data-access.yaml          — ✅ 已有策略目录
src/services/escalation-engine.ts             — ❌ 新建
extensions/policies/escalation-rules.json     — ❌ 新建
tests/services/escalation-engine.test.ts      — ❌ 新建
```

### c) 决策
- 新建 `escalation-engine.ts` — 升级引擎（评估升级条件 + 追踪忽略历史 + 数据改善检测）
- 新建 `extensions/policies/escalation-rules.json` — 升级规则，文件驱动（GA 可编辑）
- 新建 `tests/services/escalation-engine.test.ts` — 6+ 组测试用例
- 暂不接线到 sentinel runner（通知管线重组是 Phase 4.1 DESKTOP 的范围）。escalation-engine 作为独立服务，先交付接口+规则+测试
- 复用 `AgentMemoryStore` 持久化忽略记录、升级历史
- 复用 `dispatchNotification` 做升级后的通知发送

## Q1: 调研

### a) 业界最佳实践
- **PagerDuty 升级链**: 分层次（L1→L2→L3），每层有时间窗口（15min→30min→60min），ACK 不等于解决。数据改善才是解决标志。
- **SentinelOne 告警升级**: 基于忽略次数（3次忽略→升级）、时间窗口（24h未处理→升级）、严重度（critical→即时通知老板）
- **Anthropic 安全实践**: 任何安全告警必须有人工确认，超时自动升级，不能被静默吞掉

### b) 核心设计原则（对标补全文档）
1. **数据改善才停，不是已读就停** — 对接人点"确认"不阻止升级，哨兵值恢复正常才停
2. **可配置规则** — 不同严重度不同阈值，GA 可通过 JSON 编辑
3. **累计忽略** — 同一 sentinel 累计 N 次忽略触发升级（即使不是连续的）
4. **多级升级** — liaison → department_head → owner，每级有不同的渠道和阈值

### c) memory/ 教训
- [[stub-implementation-pattern]]: 升级引擎必须走完整测试链路
- [[plan-actual-closure]]: 交付后 grep 验证接线
- [[q0-skipped]]: 已完成 Q0 文件审计

## Q2: 范围

### 做
1. 创建 `extensions/policies/escalation-rules.json` — 升级规则定义
2. 创建 `src/services/escalation-engine.ts` — EscalationEngine 类
3. 创建 `tests/services/escalation-engine.test.ts` — 测试用例
4. 类型定义：EscalationRule / EscalationDecision / EscalationRecord / IgnoreRecord

### 不做
- 不改 `src/sentinel/runner.ts`（不修改现有哨兵管线）
- 不改 `src/notifications/registry.ts` 或 `types.ts`（复用现有通知接口）
- 不改 `src/sentinel/baseline-store.ts`（基线+严重度升级已有）
- 不修改任何路由、中间件、前端
- 不使用 as any

## Q3: 验收

### 入口
- EscalationEngine.evaluate(alert, history): 每次哨兵发现后调用
- EscalationEngine.recordIgnore(alertId, orgId): 对接人忽略时调用
- EscalationEngine.checkDataImprovement(sentinelId, currentValue, baseline): 哨兵值恢复正常时自动终止

### 交互
- 规则从 `extensions/policies/escalation-rules.json` 文件驱动加载
- 忽略记录持久化到 AgentMemoryStore
- 升级历史可查询（getEscalationHistory）

### 结果
- critical 告警被忽略 3 天 → 升到 owner（Electron + 邮件）
- warning 累计忽略 3 次 → 升到 owner（邮件）
- 哨兵值恢复正常 → 升级链自动终止
- 新增规则 JSON → 重启后自动加载

## 架构层级: L2

## Done 标准

```bash
# 1. 规则文件存在且可解析
grep -rn "escalation-rules" extensions/policies/
python3 -c "import json; json.load(open('extensions/policies/escalation-rules.json'))"

# 2. escalate critical: ignore 3 days → escalate to owner
# 见测试: escalateAfterIgnoreDays

# 3. escalate warning: accumulate 3 ignores → escalate to owner via email
# 见测试: escalateAfterCumulativeIgnores

# 4. data improvement → auto-stop escalation
# 见测试: autoStopOnDataImprovement

# 5. as any = 0
grep -rn "as any" src/services/escalation-engine.ts

# 6. export 接口存在 (evaluate / recordIgnore / getEscalationHistory)
grep -rn "export.*evaluate\|export.*recordIgnore\|export.*getEscalation" src/services/escalation-engine.ts
```
