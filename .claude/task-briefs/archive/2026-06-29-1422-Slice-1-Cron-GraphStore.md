# Task Brief: Slice 1: Cron调度 GraphStore适配器修复

> 生成: 2026-06-29 14:22 | 分支: feat/prompt-architecture | as any: 0

## 项目身份
SynovaAgent 增长诊断系统。46哨兵全链路断裂，本次修复第④号断裂点。

## Q0: 定位

### a) 项目拼图
L3洞察层 Sentinel 子系统。Cron路径。runner.ts:executeSentinel()传raw better-sqlite3给哨兵，哨兵期望queryNodes()接口。

### b) 文件审计
| 文件 | 关系 |
|------|------|
| src/sentinel/runner.ts:378 | context.db = this.db (raw SQLite) — 需包装 |
| src/l4/synova-graph-store.ts:389 | createSynovaGraphStore(db) 工厂 — 复用 |
| src/sentinel/sentinel-runner.ts:36 | 按需路径已正确用GraphStore — 参照 |

### c) 决策
扩展 — runner.ts 中 context 构造加 createSynovaGraphStore 包装。

## Q1: 调研
[[dual-source-fraud]] — 桥接文件历史教训。本次不改架构，只修复Cron路径的数据传递。

## Q2: 方案
reuse — createSynovaGraphStore 已有实现。runner.ts 378行加包装。

## Q3: 验收
verify: 启动服务器 → Cron哨兵不再抛TypeError

## 本任务在哪一层
L3 (sentinel/runner.ts)

## Done
- [ ] runner.ts executeSentinel() 内包装GraphStore
- [ ] tsc零错误
- [ ] 启动验证不抛TypeError
