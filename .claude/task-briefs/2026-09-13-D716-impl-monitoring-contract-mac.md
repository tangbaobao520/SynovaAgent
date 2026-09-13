# Task Brief: D716-impl 监测契约——Mac DSH 编码线（spec 1 实施）

> 生成: 2026-09-13 | 任务: D716（实现段；spec 段由 dev-doc 预置于同号 json） | 认领: Mac编码-synova-dsh
> 唯一契约: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D716-D1-monitoring-contract-20260913.md（dev-doc 分支 chore/d716-devdoc-specs 已交付，随 dev-doc PR 落 main）
> 上游裁定: docs/synova/product-lines/DECISION-D1-状态驱动通知模型-20260912.md（创始人已裁，六态 + 四条政策值）

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = 组织数字孪生诊断 Agent。本任务在 L3 洞察层哨兵切片（src/sentinel/）：把「通知决策」从时间窗去重改为「工单状态 + 实质变化 + 客户监测契约」。复用既有工单状态机（D580）/ 通知派发链（D6/D17）/ 阈值解析单点（D577）/ 渠道注册表；新建此前不存在的配置面（契约文件 schema + loader）与决策纯函数。
### b) 文件审计
- 工单四态/DDL/读路径/状态机已存在: src/sentinel/runner.ts L178/L259/L1058/L1092（2026-09-13 实测重核，±6 行内吻合）
- 通知决策只查 sentinelId + last_sent_ms 不读工单状态: src/sentinel/runner.ts L1313（M3 型缺口，本任务接上）
- 监测契约/契约 loader/状态驱动决策: 全仓 grep 零命中（本任务新建）
- 阈值解析单点 resolveThresholds: src/sentinel/sentinel-loader.ts L130，生产调用 runner.ts L1210 + sentinel-loader.ts L259
### c) 决策
能复用全部复用；新建面压到最小（1 个 loader 模块 + 1 个策略模块 + 1 张新表 sentinel_notification_state）；不新增 sentinel_events event_type（DDL CHECK 迁移陷阱，spec §5.4 决策 5）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- spec §Q1 已做 D333 四步（第一性原理 + PagerDuty 式状态机先例 + 本仓单点先例 D577/D580），收敛无分歧
- 铁律 0-2: spec→test→impl→wire，测试先 red 再 green；铁律 24/31: 每个 catch log.warn + degraded 传播，不吞真告警（状态表读失败按首次处理）
- 铁律 47/48: 新函数先 JSDoc 契约（@input/@output/@degraded/@error），测试覆盖正常/降级/边界三路径
- K3 D580 credit: 去重表/去重键不动，保留为抖动合并器（创始人裁定 D-1 第 1 条）；8-3 语义不受影响
- M3 教训: 机制建成必须接线——本 spec §8 逐条列生产调用点，测试调用不计
### 参考：spec §Q1 四步收敛 + 第一性原理 + 本仓 D577/D580 单点先例 + 铁律 11/24/31/47/48 → 契约=文件化配置面（数据目录），决策=纯函数+工单状态，复用既有单点

## Q2: 范围 — 正确的最简方案
做什么：
- src/sentinel/monitoring-contract.ts — 新建: schema 类型单源 + 字段校验 + 三层合并 loader loadMonitoringContract + contractForSentinel + clearMonitoringContractCache + mtime 记忆化（spec §5.2-A/B/C）
- src/sentinel/notification-policy.ts — 新建: 通知状态表三件套 createNotificationStateTable/readNotificationState/upsertNotificationState + 纯函数 decideNotification（六态映射 spec §5.2-H）+ listEscalationQueue 读接口（spec §5.2-D/E/F）
- src/sentinel/runner.ts — 修改: start() 建通知状态表；自诊断 L517 与聚合 L588 两个派发点改走 decideNotification（读工单状态 + 契约 + 状态表）；提醒/首页幂等落账；新增 listEscalationQueue 公开方法；保留抖动合并器语义（去重表不动，spec §5.1-⑤）
- src/sentinel/sentinel-loader.ts — 修改: resolveThresholds 加契约层（契约 > memStore > manifest，无契约时逐条等价零回归，spec §5.2-G）
- tests/sentinel/monitoring-contract.test.ts — 新建: T1-T6 + T13（loader 单元 L1）
- tests/sentinel/notification-policy.test.ts — 新建: T14/T15/T16/T17（决策纯函数 L1，六态八断言）
- tests/sentinel/notification-wiring.test.ts — 新建: T7-T12（接线 + 降级 + 边界 L2a/L2b/L2c，真实 runner + :memory: DB）
- docs/synova/product-lines/evidence/D716-mac-20260913/ — 新建: vitest 原始输出 + grep 接线输出 + 时间戳（.txt，不用 .log）
- task-state/D716.json — 修改: 回填 impl 段（commit + by + files + DS 证据指针）
不做什么：
- 不改 src/sentinel/types.ts（类型单源在 monitoring-contract.ts，spec §5.1 条件项条件不满足）
- 不改 src/sentinel/sentinel-events.ts（不新增 event_type，spec §5.4 决策 5 CHECK 约束陷阱）
- 不改 src/services/escalation-engine.ts（升级链双重死是独立缺陷，spec §6 登记 CTO 另起任务，不复活）
- 不改 tests/services/escalation-engine.test.ts（引擎不改）
- 不改 src/server.ts（Claude 专属 Win 域）
- 不改 src/routes/sentinel.ts（Win 域路由）
- 不改 src/agent/boss-mailbox.ts（Win 域周报渲染）
- 不改 app/setup.html（spec 2 双引导收敛，Win 域）
- 不改 extensions/policies/escalation-rules.json（严重度升级链全局策略，§6 登记待办）
- 不改 docs/synova/product-lines/product-lines.yaml（8-6 证据绑定归 CTO/产品线，DS11）
- 不改 scripts/audit/audit-rules.sh（K3 审计红线）

## Q3: 验收 — 入口 → 交互 → 结果
入口（从哪触发）：
- 写一份契约文件到数据目录（dirname(config.dbPath)/monitoring-contract.json）——Win 交互写入或 GA 手工编辑；无文件 = 全默认
处理（中间步骤）：
- loader 读取校验三层合并 → runner 两派发点调 decideNotification（读工单状态 + sentinel_notification_state + 契约）→ 输出 notify/remind/front_page/silent → 按契约 channels 真实派发；提醒/首页幂等落账
结果（最终展示）：
- 老板侧可观测: 新发现/实质变化立刻推；已认领不再重复打扰（silent/acknowledged）；24h 未回应提醒一次（幂等）；7 天停滞进周报首页队列（listEscalationQueue 供 Win 消费）；明确不处理进每周回顾清单（silent/dismissed）
- 每条行为有测试 + evidence 物理可证（spec §10 DS2-DS10）

## 架构层: L3 洞察层（src/sentinel/ 哨兵引擎——决策纯函数 + 状态表读写 + 升级队列读接口）
L5 邻接运行时文件 I/O（loader 读 dirname(config.dbPath)/monitoring-contract.json，与 llm-credential-store.ts 同型先例）
不新增跨层 import: loader 只依赖 fs/path + src/config.ts + src/notifications/registry.ts（渠道合法性）

## Done 标准: （spec §10 DS2-DS10，全部可证伪）
- [ ] 1. loader/决策/状态表/队列各自有生产调用点（测试调用不计，spec §8）
  verify: grep -rn "loadMonitoringContract\|decideNotification\|listEscalationQueue\|createNotificationStateTable" src/sentinel/ --include=*.ts | grep -v "monitoring-contract.ts\|notification-policy.ts" | wc -l 结果 ≥ 4
- [ ] 2. 三个新测试文件全绿（L1/L2a/L2b/L2c 四层 + 六态八断言 + 24h±1ms 边界 + 幂等两段）
  verify: npx vitest run tests/sentinel/monitoring-contract.test.ts tests/sentinel/notification-policy.test.ts tests/sentinel/notification-wiring.test.ts
- [ ] 3. 既有哨兵测试零回归（threshold-injection / dedup-key-stability / ticket-* 等 30 文件）
  verify: npx vitest run tests/sentinel/
- [ ] 4. 类型安全: tsc 零错误 + as any/as never/as unknown as = 0
  verify: npx tsc --noEmit && grep -rn "as any" src/sentinel/monitoring-contract.ts src/sentinel/notification-policy.ts | wc -l 结果 = 0
- [ ] 5. evidence 落盘（原始输出 + 时间戳，K3 独立重跑可复现，DB 全用 :memory:）
  verify: ls docs/synova/product-lines/evidence/D716-mac-20260913/

#CRITERIA: A
