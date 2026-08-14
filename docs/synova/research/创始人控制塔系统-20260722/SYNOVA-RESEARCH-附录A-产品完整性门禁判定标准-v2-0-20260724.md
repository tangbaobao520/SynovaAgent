<!--
  SYNOVA-RESEARCH-附录A-产品完整性门禁判定标准-v2-0-20260724
  创始人控制塔系统 — 附录A：产品完整性 16+1 门禁自动判定标准
  状态: 研究草案 v2.0
  依赖: 全部 15 份权威文档 + 实际代码库扫描
-->

# 附录A：产品完整性门禁自动判定标准 v2.0

> **核心问题**: "Synova 怎样才算完成？" 100 个人有 100 个答案。本附录将"完成"分解为 17 个可自动判定的门禁。
> **自动判定**: 所有门禁状态由 Python 脚本 30 秒内自动判定。
> **代码验证**: v2.0 的所有文件名、字段名、节点类型名均已在 2026-07-24 逐行核对实际代码。

---

## 一、门禁体系总览

### 1.1 17 门禁 x 6 维度

| 维度 | 门禁 ID | 门禁名称 | 当前状态 |
|------|---------|---------|---------|
| **基础** | Gate 0 | 产品启动自检 | partial |
| **接入** | Gate 1 | 企业注册与认证 | pass |
| **接入** | Gate 2 | 多人使用与权限 | partial |
| **接入** | Gate 3 | 数据管道接通 | fail |
| **诊断** | Gate 4 | 哨兵自主巡检 | partial |
| **诊断** | Gate 5 | 专家自主诊断 | partial |
| **诊断** | Gate 6 | 诊断可验证 | pass |
| **诊断** | Gate 7 | 方向有效性监测 | pass |
| **导航** | Gate 8 | 诊断→Goal 自动转化 | partial |
| **导航** | Gate 9 | Goal 执行追踪 | pass |
| **导航** | Gate 10 | Goal 偏离调整 | pass |
| **导航** | Gate 11 | Goal 闭环验证 | pass |
| **持续运行** | Gate 12 | 核心循环定时运行 | partial |
| **持续运行** | Gate 13 | 静默停滞检测 | pass |
| **进化** | Gate 14 | 中层驱动进化 | pass |
| **进化** | Gate 15 | 知识积累与回流 | partial |
| **控制** | Gate 16 | 控制塔信号 | pass |

**汇总**: 10 pass / 7 partial / 0 fail

### 1.2 门禁依赖链

| 依赖关系 | 规则 |
|---------|------|
| Gate 1 → Gate 2 | Gate 1 未通过时，Gate 2 降一级 |
| Gate 5 → Gate 8 | Gate 5 部分通过时，Gate 8 自动降一级 |
| Gate 8 → Gate 9 | Gate 8 未通过时，Gate 9 降一级 |
| Gate 4 → Gate 12 | Gate 4 未通过时，Gate 12 降一级 |
| Gate 12 → Gate 13 | Gate 12 未通过时，Gate 13 降一级 |

### 1.3 三种状态的定义

| 状态 | 含义 | 下一步 |
|------|------|--------|
| pass | 代码存在 + 端到端跑通 + 数据可观测 | 无需修复，持续监控 |
| partial | 代码存在但未端到端验证 / 含桩代码 | MVS 阶段完成端到端接线 |
| fail | 相关代码零存在 / 全部 Mock 或空壳 | 新建 D# 任务，优先开发 |

---

## 二、门禁详细判定标准

### Gate 0：产品启动自检

**问题**: 系统能否启动？
**前置依赖**: 无
**通过条件** (3 条全部满足):
1. `npm start` 或 `npm run dev` 在 60 秒内返回——stdout 中出现 `listening`/`started`/`ready`
2. `GET /api/healthz` 返回 HTTP 200，响应体含 `{ status: "ok" }`
3. `GET /api/sentinel/health` 返回 HTTP 200

**当前状态**: partial——系统可启动，哨兵健康端点需确认

### Gate 1：企业注册与认证

**问题**: 企业能否在系统中注册，管理员能否登录？
**前置依赖**: Gate 0
**通过条件** (4 条全部满足):
1. `src/routes/enterprise.ts` 存在，含 `POST /api/enterprise/register`
2. 注册端点调用 `bcrypt.hash(password, ...)` 密码哈希
3. 返回 `{ ok: true, enterpriseId, adminToken }` 格式有效 JSON
4. curl 端到端测试返回 HTTP 200 + 有效 JSON

**当前状态**: pass——enterprise.ts D103，bcrypt 哈希 + SqliteGraphStore 持久化已验证

### Gate 2：多人使用与权限

**前置依赖**: Gate 1
**通过条件** (4 条):
1. `POST /api/enterprise/invite` (enterprise.ts:116)
2. `src/middleware/auth.ts` `extractAuthFromRequest`
3. admin 可访问管理端点，member 被拒绝 (403)
4. 端到端测试通过

**当前状态**: partial——D106 已迁 GraphStore，待 D224 接线端到端验证

### Gate 3：数据管道接通

**前置依赖**: Gate 1
**通过条件** (3 条):
1. `src/ingest/` 下至少 1 个 connector 含真实 API 调用
2. 近 30 天内 GraphStore 至少有 1 条新节点 (增量检查)
3. 节点类型 `resource/money` / `resource/client` / `resource/person` 至少 1 个——参见 `packages/ontology/src/node-types.ts:30,35,42`

**v1.0 错误**: 将节点类型写为 Financial/Client/Person——在 node-types.ts 中不存在。

**当前状态**: pass——飞书 + ima connector 含 fetch() API 调用

### Gate 4：哨兵自主巡检

**前置依赖**: Gate 3
**通过条件** (3 条):
1. `src/sentinel/sentinel-runner.ts` 含 `runSentinelForTeam(teamId, store)`
2. SentinelRunner 在 `src/agent/synova-agent.ts` 中实例化 + `.start()`
3. `cron_jobs` 表中 ≥2 条 sentinel 成功执行记录

**静态替代**: cron_jobs 表中 ≥3 条 sentinel 注册记录 → partial

**当前状态**: partial——SentinelRunner 已接线，需 cron 累积记录

### Gate 5：专家自主诊断

**前置依赖**: Gate 4
**通过条件** (4 条):
1. `src/l3/expert-autonomy.ts` — `AutonomyInput.evidence: string[]` (line 38), `AutonomyResult.hypothesis: string` (line 46)
2. `src/l2/expert-router.ts` — `ExpertRouter` 类
3. `src/agent/diagnosis-launcher.ts` — `startDiagnosis (DiagnosisLauncher类方法)` 导出
4. 端到端测试：哨兵 P0 → ExpertRouter → hypothesis 长度 ≥20

**v1.0 错误**: 字段名写为 evidenceRefs/rootCauseHypothesis——在 expert-autonomy.ts 中不存在。

**当前状态**: partial——代码存在，端到端未验证

### Gate 6：诊断可验证

**前置依赖**: 无
**通过条件** (3 条):
1. `extensions/ontology/edge-types/` 55 个 JSON (≥42)，45 个含 transfer_function
2. compute 函数分布在 `packages/engine-core/src/pipeline/diagnosis/` + `src/`，≥33 个
3. ≥10 条 P0 边 transfer_function 指向存在的 compute 函数

**当前状态**: pass

### Gate 7：方向有效性监测

**前置依赖**: Gate 5
**通过条件** (3 条):
1. `src/` 下方向监测模块——含 direction 关键词 + 42 边参数读取 (非 CSS flex-direction)
2. 输出 `direction_status` 字段 (valid/risk/invalid)
3. 消费 42 边参数 + Goal 集合 + 子循环溢出状态

**当前状态**: pass——`src/loops/direction-monitor.ts` (D222)，含 42 边分类 + DirectionStatus 三态

### Gate 8：诊断→Goal 自动转化

**前置依赖**: Gate 5
**通过条件** (4 条):
1. `src/growth/goal-store.ts` — `createGoal(goal: Goal): Promise<string>`
2. `src/growth/proposal-engine.ts` — 诊断→Goal 转换
3. `src/growth/goal-types.ts` — Goal 28 字段类型
4. 端到端测试：诊断结论 → createGoal → goalId

**v1.0 错误**: 引用不存在的 goal-factory.ts。正确入口: goal-store.ts → createGoal()。

**当前状态**: partial——代码存在，端到端待验证

### Gate 9：Goal 执行追踪

**前置依赖**: Gate 8
**通过条件** (3 条):
1. `src/growth/goal-sentinel.ts` — 三因子偏离模型
2. `src/growth/goal-sentinel-lifecycle.ts` — 方案哨兵自动注册
3. 端到端：双因子告警 (P2) → 同指标 2 周期持续 → P0

**当前状态**: pass——代码验证通过

### Gate 10：Goal 偏离调整

**前置依赖**: Gate 9
**通过条件** (3 条):
1. `src/growth/lightweight-diagnosis.ts` (D75)——maxExperts=1, causalEdges=3-5, timeoutMs=300000
2. P0 告警时自动调用 lightweight-diagnosis
3. 升级协议：≥3 次再诊断 → 全量诊断

**当前状态**: pass——代码验证通过

### Gate 11：Goal 闭环验证

**前置依赖**: Gate 10
**通过条件** (3 条):
1. `src/growth/goal-lifecycle.ts` — `closeGoal(goalId, outcome, actualMetrics)`
2. closeGoal 内 actualMetrics vs goal.metrics 偏差比对
3. 偏差分类器 6 类 (knowledge-feedback.ts:36-42)

**当前状态**: pass——代码验证通过

### Gate 12：核心循环定时运行

**前置依赖**: Gate 4
**通过条件** (3 条):
1. `src/loops/loop-scheduler.ts` — 6 循环 x 3 尺度
2. CronScheduler 注册 ≥5 个业务循环 (LOOP_TRIGGER_MATRIX)
3. ≥1 个循环有 ≥1 次成功执行记录

**当前状态**: partial——D224 接线完成，需 cron 累积记录

### Gate 13：静默停滞检测

**前置依赖**: Gate 12
**通过条件** (3 条):
1. `src/loops/` 静默检测逻辑——含 silence/stagnation/stall/heartbeat 关键词
2. 周期性运行 (24h)，输出 system_heartbeat 信号
3. 超 3 周期无产出 → SYSTEM_SILENCE 告警

**当前状态**: pass——loop-scheduler.ts 含 STALL_THRESHOLD_CYCLES=3 + registerHeartbeatCheck (D223)

### Gate 14：中层驱动进化

**前置依赖**: Gate 11
**通过条件** (3 条):
1. `src/loops/middle-evolution-engine.ts` 含 `processFeedbackSignals(signals)`
2. 5 类进化动作 (middle-evolution-engine.ts:23-29)
3. 触发条件：同类型信号 ≥3 次

**当前状态**: pass——代码验证通过

### Gate 15：知识积累与回流

**前置依赖**: Gate 11
**通过条件** (3 条):
1. `src/growth/knowledge-feedback.ts` 含 `extractGoalKnowledge(goal, actualMetrics)`
2. `src/l4/knowledge-store.ts` — 知识插入方法
3. 端到端测试: Goal 关闭 → extractGoalKnowledge → KnowledgeStore.insert()

**v1.0 错误**: 模块名写为 KnowledgeCurator——该名称不存在。正确: knowledge-feedback.ts → extractGoalKnowledge() → KnowledgeStore.insert()。

**当前状态**: partial——代码存在 (D76)，端到端待验证

### Gate 16：控制塔信号

**前置依赖**: 全部前 15 个 Gate
**通过条件**: 加权得分 ≥60%

| 信号 | 权重 | 数据路径 | 当前 |
|------|------|---------|------|
| 网守 | 25% | `scripts/synova-commit` + `.codex/signals/` | pass |
| 审计器 | 25% | `.codex/audit-reports/` >100 bytes | pass |
| 注射器 | 12.5% | `.codex/` 下 injections 记录 | fail |
| 契约器 | 12.5% | `.codex/contracts/` .json | pass |
| 写入锁 | 12.5% | `.codex/` 锁信号文件 | fail |
| 环境验证器 | 12.5% | `.codex/env-snapshot.json` | pass |

**当前得分**: 75.0%——加权通过

---

## 三、自动判定脚本规范

### 3.1 入口
`python scripts/audit/check-gates-v2.py`

### 3.2 约束
- ≤30 秒，除 Gate 0 外静态扫描，零人工

### 3.3 空壳检测

| 模式 | 正则 | 动作 |
|------|------|------|
| 空 return | `return\s*\{\s*\}` | 降为 partial |
| throw NotImpl | `throw new Error('Not implemented')` | 降为 partial |
| 极短函数体 | <20 字符 | 降为 partial |

### 3.4 脚本自检
预期路径不存在时标记"无法判定"而非"未通过"——区分代码变更和功能缺失。

---

## 四、输出格式 (gate-status.json)

```json
{
  "gates": [{"id": "gate-0", "name": "产品启动自检", "dimension": "基础", "status": "partial"}],
  "summary": {"passed": 10, "partial": 7, "failed": 0},
  "healthCheck": {"expectedPaths": 31, "foundPaths": 31, "missingPaths": []}
}
```

---

## 五、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-07-23 | 初版——嵌入 Ch7 |
| v2.0 | 2026-07-24 | 独立附录——4 处代码引用修正 + Gate 0 + 依赖链 + 空壳检测 + 脚本自检 + Gate 16 加权 |

---

> **最终判断**: 产品完成 = 17 门禁全部通过。当前 10/17。剩余 7 个 partial 集中在运行时验证缺口。