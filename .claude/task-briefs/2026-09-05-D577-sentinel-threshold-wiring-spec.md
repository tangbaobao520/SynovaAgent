# Task Brief — D577 哨兵阈值配置真实挂载（dev-doc spec 交付）

> 任务: D577 spec 交付（dev-doc 线，只写 doc 不写实现代码） | 2026-09-05 | 认领: synova-devdoc
> 派单: docs/synova/coordination/派单-D577-sentinel-threshold-wiring-20260905.md
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = 组织诊断 Agent。本任务在 **L3 洞察层哨兵体系**（src/sentinel/ + extensions/sentinels/ 文件驱动扩展）。
现有机制: manifest.json thresholds（45 哨兵全有）+ runner L3WriteAPI updateThreshold（memStore 存储）。
本任务 = spec 设计"阈值从配置文件流入 finding 判定"的修复方案，交付 spec + 编码指令 + task-state 回填。**本 brief 的 commit 只含文档**，代码实现由后续编码 session 按 spec 执行。

### b) 文件审计
- `src/sentinel/sentinel-loader.ts` L142-148: manifest 挂载守卫 `'manifest' in sentinelObj`（D356 交付）；L195-217 registry check wrapper（阈值注入点）。
- `extensions/sentinels/customer-demand-shift/aggregate.ts` L29 DEPLOYS 静默 return、L50/59/77/86 硬编码 0.4/0.3/0.2/0.1（K3 指认）。
- `src/sentinel/runner.ts` L1021-1083 getThreshold/updateThreshold（memStore 机制，getThreshold 生产调用方为零）。
- `packages/evolution/src/org-adapter.ts` L360: updateThreshold 唯一生产调用方（L0 阈值自适应）。
- 复用: D356 已建 this.manifest 通道（cash-runway/revenue-health/margin-health/capital-health 4 消费者，不动）。

### c) 决策
已有 D356 通道 → 存量 4 消费者不动；缺口（40 哨兵硬编码 + 覆写不进 check）→ spec 设计 SentinelContext.thresholds 注入。不新建 src/ 文件（resolver 落 sentinel-loader.ts）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 业界: Prometheus alerting rules（规则文件外置 + 配置即行为）、Grafana 阈值面板——告警阈值配置单源 + 改配置即改行为是标准形态。
- Anthropic 工程基线: 配置 single source of truth；fail-closed（缺配置显式降级不静默）；机器可验契约（改配置 → 行为变化可用断言证明）。
- memory 历史教训: M3"机制建成未接线"（本缺陷正是 M3 复发——manifest/updateThreshold 机制全在，消费端断链）；CT-53（验收点级证据，禁任务级兑换）；S-3（接线 = 生产调用点）；D356 K3 审计 PASS 先例（this.manifest 通道 + degraded 拦截测试）。
- Q1c 决策参考系: 参考：Anthropic/DeepSeek/第一性原理 + 结论（决策 5 项详见 spec §5.3）。

## Q2: 范围 — 正确的最简方案

做什么（本 brief commit = spec 交付文档，编码写集在 spec §5.1 单独声明）:
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D577-sentinel-threshold-wiring-20260905.md
- docs/synova/coordination/编码指令-D577-sentinel-threshold-wiring-20260905.md
- docs/synova/coordination/TASK-ROUTING.md（D577 认领登记行）
- task-state/D577.json（spec 段回填，独立 commit）
- .claude/task-briefs/2026-09-05-D577-sentinel-threshold-wiring-spec.md

不做什么:
- 不改 src/sentinel/sentinel-loader.ts（编码阶段写集，本 spec 只设计）
- 不改 src/sentinel/types.ts 与 src/sentinel/runner.ts（编码阶段写集）
- 不改 extensions/sentinels/customer-demand-shift/aggregate.ts（编码阶段写集）
- 不改 scripts/audit/AUDIT-PROTOCOL.md（K3 专属，审计红线永不碰）
- 不改 src/server.ts（D575 领地，零重叠并行）
- 不改 extensions/sentinels/customer-demand-shift/manifest.json（派单: 阈值值不变，只让值生效）

## Q3: 验收 — 入口 → 交互 → 结果

- 入口: 派单-D577（CTO 派单，含断裂链路画像 + 5 必答 + 7 验收锚点）。
- 处理: grep/read 实测现状（loader/runner/14 个 aggregate/manifest）→ 三方对照表（哨兵→thresholds key→判定位置）→ 契约设计（SentinelContext.thresholds 注入 + memStore 覆写合并 + degraded 传播）。
- 结果: spec 过 dev-doc-gatekeeper.sh exit 0 + check-dev-doc-write-set.sh 对账（预期漂移预登记）+ 编码指令入库 + task-state/D577.json spec_done + PR 分支推送。

## 架构层: L3

## Done 标准

- [x] `bash scripts/control-tower/dev-doc-gatekeeper.sh docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D577-sentinel-threshold-wiring-20260905.md` 返回 exit 0（6 项机械验证全过）。
- [x] `task-state/D577.json` 的 spec.path 指向真实存在的 spec 文件且 status=spec_done（D393 生成器可派生）。
- [x] spec §4.2 三方对照表逐行可 grep 复核（每个判定点带文件+行号，声称即引用）。
