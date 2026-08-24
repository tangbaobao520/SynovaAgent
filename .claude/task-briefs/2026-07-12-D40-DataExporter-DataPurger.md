## Q0: 定位 — 项目拼图 + 文件审计 + 决策
### a) 项目拼图
SynovaAgent — D40。安全P0最高优先级(GDPR合规底线 — 可携带权+被遗忘权)。
审计: 零数据导出代码; 零数据删除代码; 无GDPR API端点。
PolicyEngine(D38)已就绪, 可通过它裁决 data.export/data.delete SOI权限。
### b) 文件审计
grep: DataExporter/DataPurger/purge — 零结果（全新模块）。
PolicyEngine — src/security/policy-engine.ts 已有 data.export/data.delete SOI。
GraphStore(D29) — src/l4/graph-bridge.ts 已有 createNode/queryNodes。
SessionStore — src/store/session-store.ts 已有会话存储。
AgentMemoryStore — src/l4/agent-memory-store.ts 已有企业事实存储。
### c) 决策
新建 DataExporter(按tenantId导出全部数据为JSON) + DataPurger(四阶段传染性删除)。
新建 src/routes/data-lifecycle.ts 提供3个API端点。

## Q1: 调研 — 引用来源 + memory教训
a) 安全规范 §4.3.1: DataExporter 接口 — export(tenantId)→{archive, manifest}
b) 安全规范 §4.3.2: DataPurger 接口 — 四阶段(SafetyLock/WaitingPeriod/CascadeDelete/Verification)
c) 安全规范 §4.4: 传染性删除 — 源数据→派生报告→哨兵结论→知识库引用
d) PolicyEngine(D38): data.export + data.delete SOI 已有
e) memory/: D10完成了engine-core退役, 数据导出时不再需要考虑旧引擎数据

## Q2: 范围 — 正确的最简方案
做什么:
  1) DataExporter: export(tenantId)→{archive: Buffer, manifest: JSON} — 导出GraphStore+SessionStore+AgentMemory
  2) DataPurger: purge(tenantId)→{stages: PurgeStage[]} — SafetyLock→Wait→Cascade→Verify
  3) API: POST /api/data/export + POST /api/data/purge + GET /api/data/purge/:id/status
  4) PolicyEngine裁决: data.export/data.delete SOI
不做什么:
  不删除engine-core目录(D10已处理)
  不自动触发(需GA审批——通过PolicyEngine enforce)
排除: packages/engine-core/(不涉及)

## Q3: 验收 — 入口→处理→结果
入口: POST /api/data/export {tenantId}
处理: PolicyEngine check → DataExporter.export → JSON打包 → 返回
结果: 下载包含全部企业数据的zip包

入口: POST /api/data/purge {tenantId}
处理: PolicyEngine check → DataPurger.purge → 四阶段执行
结果: 7天后传染性删除 + 验证报告

## 架构层: 
L4(本体层) — src/l4/data-exporter.ts + src/l4/data-purger.ts
L2(编排层) — src/routes/data-lifecycle.ts

## Done 标准
- [ ] verify: POST /api/data/export → 返回JSON zip, manifest含tenantId+checksum
- [ ] verify: POST /api/data/purge → 返回4阶段状态
- [ ] verify: PolicyEngine.evaluate('ga','S3','data.delete') → {allow:false} (GA无权删除)
- [ ] verify: tsc零错误 / vitest零失败 / 零as any
