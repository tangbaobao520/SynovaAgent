# SynovaAgent — D49 独立看门狗 + 三层监控 实施方案 v1.0

> 2026-07-13 | 第9份权威文档（部署运维）第三章
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在，不是"我相信会有人调"）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38 — pre-commit 硬阻断）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-13 确认）

- 分支: `feat/prompt-architecture`
- D47: 双进程架构+首次启动检查 ✅
- D48: 静默升级+版本回滚 ✅
- 现有 GET /health 端点只返回 version+uptime，需升级为 /api/healthz 6项检查

---

## 做了什么

### 1. scripts/watchdog.js — 独立看门狗进程（新建）

独立于主Agent的极简Node.js脚本（<500行，零外部依赖，纯Node.js内置模块：http + fs + child_process）。

- 运行方式: `node scripts/watchdog.js [--port=3000]`
- 探测逻辑: 每5分钟 GET /api/healthz（超时10s），连续3次无响应或返回非200 → 触发告警
- 告警方式: 复用D6推送通知API；Linux降级→stdout+写入 ~/.synova/logs/watchdog.log；可配置暴露告警端点供Nagios/Zabbix轮询
- 重启尝试: 告警后执行启动脚本重启主进程（child_process.spawn），记录重启次数
- 自愈边界: 10分钟内连续重启失败≥3次 → 立即停止重启 → 最终告警（OS通知+log）→ 在日志中指明路径："系统连续3次启动失败。最后一次错误日志路径。可能需要人工介入恢复。请运行恢复包或联系GA。"
- 不尝试自动修复损坏数据——明确报告"我已无法自愈，需要人工介入"

### 2. src/routes/healthz.ts — GET /api/healthz（新建，L1层）

6项独立检查，每项独立try-catch，单点故障不影响其他检查。返回格式:

```json
{
  "status": "healthy|degraded|down",
  "checks": {
    "database": {"status": "ok|degraded|down", "detail": ""},
    "llm_connectivity": {"status": "ok|degraded|down", "detail": ""},
    "last_sentinel_run": {"status": "ok|degraded|down", "detail": ""},
    "disk_free_gb": {"status": "ok|degraded|down", "detail": ""},
    "data_freshness": {"status": "ok|degraded|down", "detail": ""},
    "watchdog_alive": {"status": "ok|degraded|down", "detail": ""}
  },
  "uptime": 12345
}
```

6项检查的具体判定条件（来自权威文档§3.3）:
| 检查项 | 判定条件 | 失败影响 |
|--------|---------|---------|
| database | SQLite PRAGMA integrity_check 通过 | 整个系统不可用 |
| llm_connectivity | 最近1小时内至少1次LLM调用成功 | 诊断不可用，哨兵可运行 |
| last_sentinel_run | 最近24小时内至少1个哨兵执行成功 | 哨兵可能中断 |
| disk_free_gb | 剩余空间 > 1GB | 备份和写入可能失败 |
| data_freshness | 最近7天内有新数据接入 | 诊断基于过时数据 |
| watchdog_alive | 看门狗最近5分钟内探测成功 | 系统监控失效 |

### 3. src/monitoring/system-health.ts — 系统健康审计（新建，L4层）

SystemHealthAudit类，收集7项指标（数据来源: log + 哨兵runner + D48版本记录 + 看门狗日志）:
- 过去30天可用率
- 上次备份时间及结果（D50恢复包产出后接入，当前返回null）
- 数据延迟次数
- 活跃哨兵数量（50个中几个在产出Finding）
- 看门狗重启次数
- Agent当前版本号
- 累计诊断次数

权威文档§3.5要求：每次诊断报告强制插入"系统健康审计"章节。向老板客观汇报——用数据判断"数字员工有没有在偷懒"。数据来自日志，不来自用户感知。

### 4. src/server.ts — 挂载路由（修改）

`app.use('/api/healthz', healthzRoutes)`

### 5. src/agent/report-assembler.ts — 注入系统健康（修改）

在 expert/raw 深度报告的 data 中注入 systemHealth 对象。注：report-assembler依赖system-health模块，system-health依赖D50备份能力尚未完成——备份相关字段先返回null，后续接入。

---

## 三层监控落地分工（权威文档§3.2）

| 层级 | 指标 | D49交付 | 不在D49范围 |
|------|------|---------|------------|
| L1 基础设施 | 磁盘/CPU/内存/进程存活/看门狗心跳 | healthz 6项包含其中4项 | CPU/内存占用（后续版本） |
| L2 应用层 | 哨兵心跳/LLM延迟/SQLite慢查询/Token/API可用率 | healthz含last_sentinel_run + llm_connectivity | LLM p50/p95延迟、慢查询、Token（后续D49b） |
| L3 业务层 | 诊断质量/哨兵误报率/GPI波动 | 不在D49范围 | 需哨兵准确率系统先行 |

D49交付L1全量指标 + L2核心指标。L2细节指标和L3全部指标后续迭代。

---

## 不做什么

- 不修改 electron-main.ts
- 不实现L3业务层监控（需哨兵准确率系统先行）
- 看门狗不做自动修复损坏数据
- 看门狗不依赖TypeScript编译（纯.js脚本，不被tsc检查）
- 看门狗不嵌入Electron生命周期（独立进程）
- 不实现§3.4告警升级引擎（复用D6推送通道即可，P0/P1/P2分级由后续sentinel改版时统一处理）

---

## 架构层

L4（部署监测: scripts/watchdog.js + src/monitoring/system-health.ts）+ L1（交互层: routes/healthz.ts）+ L2（编排层: report-assembler.ts注入）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | healthz路由 + server接线 | 2h | healthz.ts + server.ts |
| 2 | 看门狗脚本 | 3h | watchdog.js (独立脚本) |
| 3 | system-health审计 | 2h | system-health.ts |
| 4 | report-assembler注入 | 1h | report-assembler.ts |

**总工时: 8h（1个工作日）**

---

## 完成标准

```
[ ] watchdog.js: <500行，零外部依赖（只用Node.js内置http/fs/child_process）
[ ] watchdog.js: 5分钟探测周期，超时10s，连续3次失败触发告警
[ ] watchdog.js: 10分钟内3次重启失败 → 停止 + 最终告警 + log
[ ] watchdog.js: Linux环境降级为stdout+log（不崩溃）
[ ] healthz: 6项检查每项有明确判定条件（§3.3表格）
[ ] healthz: 每项独立try-catch，单点故障不阻断其他检查
[ ] healthz: 返回格式含 status + checks{每项有status+detail} + uptime
[ ] system-health.ts: 7项指标全部可采集（备份项当前返回null并标注"待D50"）
[ ] report-assembler.ts: expert/raw深度data含systemHealth
[ ] server.ts: /api/healthz路由已注册
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误（watchdog.js除外，纯.js脚本不被tsc检查）
[ ] npx vitest run --changed 零新增失败
[ ] >=14测试: healthz 8（6项ok + 1 degraded + 1 全down）+ system-health 6（7指标正常 + 备份null + 无哨兵 + 边界 + 空数据 + 异常）
```

---

## 权威文档引用

- 第9份权威文档: 部署运维权威规范 第三章（监控与告警）
  - §3.1: 独立看门狗进程（运行方式/探测逻辑/告警方式/重启尝试）
  - §3.1.1: 自愈边界与死亡循环防护（退避策略）
  - §3.2: 三层监控体系（L1/L2/L3指标+采集方式+告警阈值）
  - §3.3: 健康检查端点 GET /api/healthz（6项检查+判定条件+返回格式）
  - §3.4: 告警升级规则（P0/P1/P2，本任务复用D6通道）
  - §3.5: 系统健康审计章节（7项指标+数据来源=日志非用户感知）