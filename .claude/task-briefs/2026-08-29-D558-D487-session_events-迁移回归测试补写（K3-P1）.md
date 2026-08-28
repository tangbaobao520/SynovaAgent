# D558 — D487 session_events 重建迁移回归测试补写（K3 P1 闭合）

> 派单: CTO | 2026-08-29 | 执行线: 编码 session | 来源: K3 审计 GA 线闭环批（2026-08-29-D551-D487-ga-line.md，P1×1）
> 类型: FIX（审计闭环铁律 D382：审计出问题 → 另起 FIX 任务，禁改原任务状态）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L5 存储层。D487（GA 诊断会话事件化装配）在 `src/store/session-store.ts` L150-175 新增了旧库 session_events CHECK 约束升级迁移：检测现有建表 SQL 缺 `diagnosis_phase` → BEGIN/COMMIT 包裹的重建（session_events_new + INSERT...SELECT 保留行 + DROP + RENAME + 重建索引），迁移失败 log.warn + degraded。
K3 物理实测该迁移 PASS（旧库 3 行保留 + seq 连续 + id 连续 + 幂等），但**无提交测试**——D551 同类双迁移有测试（ga-calibration.test.ts L494-604），D487 没有。spec §4 测试表（5 条）未同步 §3.2 新增迁移。回归风险：迁移逻辑被后续改动破坏无告警。

### b) 文件审计
- 迁移代码：`src/store/session-store.ts` L150-175（幂等重建，仅当缺 diagnosis_phase 时执行）
- 现有测试：`tests/store/session-event-log.test.ts`（D500 事件流 7 用例）、`tests/store/schema-migration.test.ts`（reconcileSchema v1/v2 版本化迁移）、`tests/agent/diagnosis-session-events.test.ts`（D487 事件落流 5 用例，其③为 DROP TABLE 降级路径，非迁移测试）
- 决策：复用现有 SessionStore 构造器直接覆盖（无需 mock 迁移函数）；落点 = `tests/store/session-event-log.test.ts` 新增 describe 块（D487 重建迁移），与 D500 事件流同文件归属一致

### c) 决策
无覆盖 → 新增测试。无冲突（session-event-log.test.ts 无其他在途认领——写集声明后由 D311/verify-parallel 门禁核对）。

## Q1: 调研
铁律 48（测试非空壳，expect 断言）；铁律 33（*.test.ts 命名）；S-5（先红再绿——先写断言旧库模拟，验证测试本身能抓到迁移缺失）；K3 P1 归因 devdoc：spec §4 测试表未同步 §3.2 新增迁移——本 FIX 含 spec 测试表同步（写集第 2 项）。
参考：D551 同类迁移测试手法（旧库构造 → 初始化触发迁移 → 断言行保留/约束升级/幂等）。

## Q2: 范围
做什么：
1. `tests/store/session-event-log.test.ts` 新增 describe「D487 重建迁移（K3 P1 闭合）」≥4 断言：
   ① 旧库模拟（手工建无 diagnosis_phase CHECK 的 session_events + 预置 3 行）→ new SessionStore(db) → 行保留（id/session_id/seq/event_type/payload_json 全字段一致）
   ② 约束升级：迁移后可成功写入 diagnosis_phase 事件（旧 CHECK 会拒绝，新表接受）
   ③ seq 连续：迁移后 appendEvent 续写 seq = 旧 MAX+1（无回退）
   ④ 幂等：同库再次 new SessionStore → 无重复重建、数据零损失、不报错
2. `docs/plans/codex/implementation/SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md` §4 测试表补一行：迁移测试（tests/store/session-event-log.test.ts，D558 闭合 K3 P1），并在 §3.2 注明测试落点
3. task-state/D558.json 回填（impl_done + commit hash + evidence）

不做什么：
- 不改 src/store/session-store.ts 迁移逻辑（K3 物理实测 PASS，无代码缺陷）
- 不碰 scripts/audit/、不写审计标准（审计红线）
- 不改 D487.json（审计结论由 K3 已回填）

## Q3: 验收
入口：`npx vitest run tests/store/session-event-log.test.ts`（Node 24，better-sqlite3 ABI 137）
处理：先红（在模拟旧库上断言诊断事件可写——无迁移时 CHECK 拒绝）→ 实现触发迁移 → 绿
结果：新增用例全绿 + session-event-log 全文件绿 + 零回归（diagnosis-session-events.test.ts 仍 5/5）

## 架构层: L5
## Done 标准
- [x] 新增迁移测试 ≥4 断言全绿（命令输出为准）
- [x] spec §4 测试表已同步（grep 迁移测试行命中）
- [x] task-state/D558.json impl_done + commit 回填
