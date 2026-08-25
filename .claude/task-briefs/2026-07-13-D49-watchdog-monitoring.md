## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
SynovaAgent — 部署运维P0。D49：独立看门狗 + 三层监控 + 系统健康审计。
第9份权威文档第三章。D47/D48已完成。核心问题：Agent进程僵死时谁发现？

### b) 文件审计
| 审计项 | 状态 | 行动 |
|--------|------|------|
| watchdog脚本 | 零 | 新建 scripts/watchdog.js — 零依赖 |
| healthz端点 | 仅/health版本检查 | 新建 src/routes/healthz.ts — 6项 |
| system-health审计 | 零 | 新建 src/monitoring/system-health.ts |
| report-assembler.ts | 已有assembleReport() | 修改 — 注入系统健康 |
| server.ts | L428 healthRoutes | 新增 /api/healthz |

### c) 决策
3新建 + 2修改。看门狗纯.js。healthz复用sentinel runner+MetricsCollector。

## Q1: 调研
a) 3.1: 独立看门狗 — 极简进程, 探测GET /api/healthz
b) 3.1.1: 自愈边界 — 10分钟内3次失败→停止重启
c) 3.2: 三层监控 — L1/L2/L3（L3暂不做）
d) 3.3: healthz 6项检查
e) 3.4: 告警 P0/P1/P2
f) 3.5: 系统健康审计
g) 铁律24: catch + log + degraded

## Q2: 范围
做什么:
1. scripts/watchdog.js — 独立脚本, 5min探测, 3次失败→告警+重启
2. src/routes/healthz.ts — GET /api/healthz 6项独立检查
3. src/monitoring/system-health.ts — 7项指标收集
4. src/server.ts — 挂载 /api/healthz
5. src/agent/report-assembler.ts — expert/raw注入systemHealth

不做什么:
- 不修改 electron-main.ts
- 不实现L3业务层监控（需哨兵准确率）
- 看门狗不做自动修复
- 看门狗不依赖TypeScript编译

## Q3: 验收
入口1: node scripts/watchdog.js → 5min探测 → 3次失败→告警+重启
入口2: GET /api/healthz → 6项检查 → JSON {status, checks, uptime}
入口3: assembleReport(diagnosis, expert) → data含systemHealth
处理: 各项独立try-catch, 单点失败不阻断

## 架构层
L4（scripts + monitoring）+ L1（routes/healthz）+ L2（report-assembler）

## Done 标准
- [ ] watchdog.js: <500行, 零依赖, 5min探测, 3次失败→告警+重启
- [ ] watchdog.js: Linux降级→stdout+log
- [ ] healthz: 6项独立检查, 单点故障不阻断
- [ ] system-health.ts: 7项指标
- [ ] report-assembler.ts: 注入systemHealth
- [ ] server.ts: /api/healthz已注册
- [ ] 零as any / tsc零新增 / vitest零新增
- [ ] >=11测试: healthz 6 + system-health 5