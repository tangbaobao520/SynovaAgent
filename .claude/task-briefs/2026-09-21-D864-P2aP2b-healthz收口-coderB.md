# Task Brief — D864（P2-a/P2-b）：healthz 泄值口收口 + 非 fetch API 族台账登记（coder-b）

## Q0: 定位 — 项目拼图 + 文件审计
Synova = AI 诊断 Agent。本任务在 L1 健康检查面（routes/healthz.ts）+ D862 台账文档。
K3 审计（origin/audit/k3-20260921-d862）必核 3 附带 P2-4（catch 拼 err.message 泄值口）+
P2-5（测试只断言 detail 子串）。派单件：origin/docs/fix-d864-d865:派单-D864-D865-退回闭环-20260921.md。
文件审计：healthz 归属已核 = src/routes/healthz.ts（派单写"先核归属"，非 src/invariants/health-route.ts）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- K3 审计 P2-4/P2-5 原文；派单 A 件条件 2/3。
- 铁律 24（catch 不得空吞但不等于可以回显原文）、31（degraded 可见）、48（测试三路径）。
- D575 A2 先例：错误只提示不回显——同类原则扩展到 healthz detail。
- 决策参考系：参考：Anthropic/DeepSeek/第一性原理 + 结论（固定文案 + 日志收窄 { name, code }，日志与响应双面收口）。

## Q2: 范围 — 正确的最简方案
做什么：
1. src/routes/healthz.ts outbound_proxy catch 分支：detail 固定文案「出站代理状态检查异常（详见服务端日志）」，
   不回显任何异常消息；log.error 收窄为 { name, code } 结构化字段（不含 message 原文）。
2. tests/routes/healthz.test.ts：outbound_proxy 三路径改为**整包对象断言**（toEqual 全量 checks.outbound_proxy）；
   新增反例测试：vi.spyOn(http-exit, getProxyStatus) 抛含凭据消息异常 → 断言响应整 JSON 不含凭据串（修前必红）。
3. docs/synova/coordination/D862-出站分类台账-20260921.md：新增「非 fetch API 族出站」章节，
   登记 src/deploy/backup-scheduler.ts:182（http.request → localhost:{PORT}/api/notifications/send，
   loopback 语义豁免）+ 理由证据；扩扫描口径权威清单**留白**待队长并入（coder-a sweep 进行中）。
不做什么（含文件路径）：
- 不改 src/providers/http-exit.ts、src/backup/（不存在，实为 src/deploy/backup-scheduler.ts 只登记不改）。
- 不碰 scripts/control-tower/**、scripts/audit/**、.github/workflows/**、src/sentinel/**、src/invariants/**。
- 不写死扩扫描口径命令与命中（等队长权威清单）。

## Q3: 验收 — 入口 → 交互 → 结果
入口：GET /api/healthz（含 outbound_proxy 检查异常路径）。
处理：getProxyStatus 抛错 → 固定文案 degraded；日志只含 name/code。
结果：vitest 整包断言全绿；反例测试（凭据串注入异常消息）响应零命中；台账新章节闭合。

## 架构层: L1（routes）读 providers 层状态快照（与 D862 原实现一致）

## Done 标准: 至少一条可验证的完成标准
1. healthz 响应与日志路径均无 err.message 回显（grep 代码 + 反例测试双证）。
2. `npx vitest run tests/routes/healthz.test.ts` 全绿（含整包断言 + 反例）。
3. 台账新增「非 fetch API 族出站」章节含 backup-scheduler.ts:182 逐条登记。
