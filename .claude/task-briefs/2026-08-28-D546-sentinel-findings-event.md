# Task Brief: D546 sentinel-findings-event

> 生成: 2026-08-28 | 任务: D546 | 认领: 🛠 编码 session（DSH）| 基线: origin/main @ e8ea8ed3
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）；spec = SYNOVA-IMPL-DSH-D546-sentinel-findings-event-20260828.md（§8.1 契约表 / §9 接线 / §13 DS1-DS8）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
L5 存储（sentinel_events 表，D394 片1 a8a5857e 已交付 audited PASS）+ L3 runner 写入口在位。本任务**零架构位变更**：事件化本体不重建，产出物在测试层——与 Win 片2-A（D487）公共契约对齐（DS2）+ I1 回放等价强化到 sha256（DS3）+ durationMs 回归网（DS4）。对齐北星 PRODUCT-BRIEF §三.2（哨兵定时巡检）。
### b) 文件审计
src/sentinel/sentinel-events.ts（207 行）: SentinelEventType 5 值 / appendSentinelEvent L119（I2 唯一写入口 throw fail-closed）/ 表 DDL L88-99——复用冻结。src/sentinel/runner.ts（1213 行）: persistRunEvents L713-739 / rebuildFromEvents L753 / executeSentinel L1053+（L1080-1081 duration）——条件写集预计零改动。src/store/session-store.ts（D500）: session_events L127-135 / appendEvent L272-287（degraded 返回）——只读对齐对象（Win D487 写集禁改）。tests/sentinel/sentinel-events.test.ts（292 行）: I1 抽查等价 L156-168 + kill -9 L170-197——扩展（DS3）。与 D544（electron-renderer/ + tests/electron/）零重叠。
### c) 决策
已有覆盖→复用（事件化本体 audited PASS，不重建）。冲突→无。契约对齐=测试层公共信封契约，不合并两表（spec §6 五条理由）；durationMs「runner 5 处恒 1970」经逐行实读与代码不符（均为正确 duration 语义），历史缺陷在 sentinel-service.ts:97 已随 a8a5857e 修复——不做伪修复，只补回归网（诚实声明随 PR 描述携带）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
铁律 0-2（spec→test→impl→wire）/ 47（契约优先：本任务把 §8.1 字段表变成可执行契约测试）/ 48（测试非空壳：每用例真实 expect + 故障注入）/ 38（as any=0）/ 33（测试命名）/ D540 教训（CI check-runs 贴结果，本地绿不算）/ D524 教训（行号锚定 e8ea8ed3 + 抽验——已验 3 处锚点零漂移）。
参考：Anthropic（契约优先 + 物理证据）+ DeepSeek/第一性原理（以生产事实为准）+ K3 战略咨询 §4.1/§4.6（I1/I2/I3 invariant 与「形似神不似」预警）+ 结论：① findings 维持 sentinel_events 独立通道 + 信封契约对齐；② durationMs 只补回归网不做伪修复；③ 回放断言升级 canonical-JSON sha256 全投影等价（抽查挡不住投影丢失类漂移）。收敛检查：参考系指向一致，无分歧。

## Q2: 范围 — 正确的最简方案
做什么：
- tests/sentinel/sentinel-events-contract.test.ts — 新建：双线公共契约冻结 3 用例（信封 ⊆ C1-C6 生产路径 + durationMs 冒充 checkedAt 违约注入 red + 双线信封映射同构含 C7 双形态）
- tests/sentinel/durationms-regression.test.ts — 新建：durationMs 回归网 4 用例（真实 check 正值经 executeSentinel + 纪元防护 + L97 来源锁定 + 历史缺陷形态注入 red）
- tests/sentinel/sentinel-events.test.ts — 修改：I1 用例补 canonical-JSON sha256 全投影等价 + 生产路径等价 + 删事件注入 red（既有 kill -9 用例保持）
- task-state/D546.json — 回填 impl 段 + status=impl_done + slice=d394-slice1 + L07 收益标注（DS8）
不做什么：
- 不改 src/sentinel/runner.ts（条件写集预计零改动——仅当契约测试暴露 payload 缺陷才修 persistRunEvents）
- 不改 src/store/session-store.ts（Win D487 写集——只读其类型做契约映射）
- 不改 src/agent/conversation-engine.ts（Win D487 写集）
- 不改 src/agent/diagnosis-launcher.ts（Win D487 写集）
- 不改 src/deploy/bootstrap.ts（Win D487 写集）
- 不改 src/server.ts（Win D487 写集）
- 不改 package.json（零新依赖——DS6 零膨胀断言）
- 不改 scripts/pre-commit-check.sh（控制塔线）
- 不改 .github/workflows/ci.yml（CI 线，DS7 只读 check-runs）
- 不改 electron-renderer/ 下任何 .ts 与 .tsx（D544 领地）
- 不改 tests/electron/ 下任何 .test.ts（D544 领地）

## Q3: 验收 — 入口 → 交互 → 结果
入口：编码 session 在 worktree（基线 e8ea8ed3）跑 vitest；K3 审计独立重跑三测试文件。
处理：DS2 契约测试（真实形态事件信封 ⊆ C1-C6 + 违约注入 red + 双线映射同构）→ DS3 I1 sha256 强化（直写投影 vs 重放投影 canonical-JSON sha256 全等 + 删事件注入 red）→ DS4 durationMs 回归（真实 check 正值 + 纪元防护 + L97 来源锁定 + 历史缺陷注入 red）→ §9 五条接线 grep。
结果：evidence/D546/（三测试输出 + 五条 grep + CI check-runs）+ PR 描述 + task-state/D546.json impl_done + DS1-DS8 逐项对照。

## 架构层: L5
L5 存储（sentinel_events 契约与回归的验证层）+ L3 runner 写入口（只读断言）。零架构位变更，无新跨层依赖。

## Done 标准
- [ ] verify: npx vitest run tests/sentinel/ → 24 文件全绿零失败（含 DS2 3 用例 / DS3 强化后 I1 / DS4 4 用例）
- [ ] verify: 三处故障注入 red 物理生效——契约测试 expect(...).toThrow(/\[C6 违约\]/) ×2 + durationms 测试 expect(...).toThrow(/年份 1970/) + 删事件后 expect(replayedSha).not.toBe(directSha)
- [ ] verify: git diff --name-only origin/main..HEAD -- package.json → 空（DS6 零膨胀）+ §9 五条接线 grep 全命中（evidence/D546/wiring-greps-ds5.log）
- [ ] verify: CI 三 job（TypeScript + Lint + Iron Laws / Vitest (1/2) / Vitest (2/2)）+ Architecture Check 全 success（贴 check-runs——D540 教训）
