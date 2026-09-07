# Task Brief: D588 会话投影注册表（DSH 借鉴卡 B-07）

> 生成: 2026-09-07 | 任务: D588 | 认领: Claude Code（Win 线，.sessions/D588/repo clone 交付，不用 --no-verify）
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D588-session-projection-20260907.md
> 参考: D333 决策四步（第一性原理 → Anthropic 工程基线 → 开源实证 → 收敛检查）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = 组织数字孪生诊断 + 增长导航 Agent，会话事件流（D500）是 Agent 运行记忆的底座。本任务在 L5 存储层 src/store/：现有 SessionEvent/appendEvent/getEvents（append-only 事件流，session-store.ts:343/:361）与 deriveMessages 单点投影，缺「从事件流派生可查询状态」的统一投影注册表——token 统计/调度态/goal 态各自硬算，无法版本化、无法增量重放。本任务新建投影层挂接 D500 事件流，不替换 session-store。
### b) 文件审计
grep 证实：projection/stateVersion/restoreFloor 在 src/ 零命中（本次新建；roi_projection 是无关财务工具名）；SessionEvent(:95)/appendEvent(:343)/getEvents(:361)/session_events 表(:162) 已存在（复用不重建）；deriveMessages(:381) 是既有单点投影先例（保留不动）；src/ 内 8+ 处 new SessionStore 构造点（synova-agent/cli/bootstrap 等，因此订阅缝必须内建新文件、零构造点修改）。DSH 锚点已逐行读全文：session/session-projection/lib/index.js（299 行）+ invariant.js（32 行）。
### c) 决策
已有覆盖 → 复用（SessionEvent 事件流与 getEvents 日志读取不动）；无覆盖 → 按 DSH 范式读源码自研（零代码依赖，G1/G4）；冲突 → 取消。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- DSH 真实源码（0.1.1-rc.2，逐行读）：D:/deepseek-harness/packages/session/session-projection/lib/index.js——SessionProjectionRegistry（register 校验 stateVersion 非负安全整数 + 同 key 拒绝；drive 对每个已提交事件跑每个单元 apply 的 eager drive + Object.is 变更门；checkpoint 输出 {ver,seq,val} 且 val 为 structuredClone 分离副本；restoreFloor 取可用行 min(seq+1) 再减一位的 one-below 锚点——尾读可证明日志未缩短；restore 可用行三条件 ver 匹配/seq>=baseSeq-1/seq<=endSeq，不可用且 baseSeq>0 抛错要求从 0 重读；单元格惰性构建 fold 全量日志）。
- dev doc 写集与测试契约：docs/plans/codex/implementation/SYNOVA-IMPL-D588-session-projection-20260907.md（1 新建 + 0 修改；测试 ≥4 用例含 ver 不匹配全量重放 + whole-value 断言 + 空 log）。
- 决策参考：参考 Anthropic/DeepSeek/第一性原理 + 结论——投影状态承接 DSH whole-value 不变量（状态承载事件必须携带完整 post-change 状态，禁裸 delta），机械化为 wholeValue 定义标志：apply(init,e) 与 apply(prev,e) 深等价才自描述，违反即 log.warn + 报警记录（铁律 24）；订阅缝取原型级 wrap SessionStore.prototype.appendEvent——dev doc 写集 0 修改下唯一能让 8+ 构造点全部自动获得 drive 的方案，import 即安装。
- memory/ 教训：engine-core-split-fraud（借范式必须读源码自研，交付前 grep @deepseek-ai src/ 零结果）；2026-09-01-d490（零回归 = FAIL 集恒等）；2026-08-28-d488（clone 交付：brief 复制主区 + hook ROOT 随 harness CWD）；2026-08-23-d477（tsc 基线对照单命令完成）。

## Q2: 范围 — 正确的最简方案
做什么：
- src/store/session-projection.ts
- tests/store/session-projection.test.ts
- .claude/task-briefs/2026-09-07-D588-session-projection.md
不做什么（含文件路径）：
- 不改 src/store/session-store.ts（写集 0 修改——订阅缝内建新文件原型 wrap）
- 不改 package.json（零新依赖，structuredClone 用 Node 全局）
- 不做 checkpoint 行的 SQLite 持久化表（restore/checkpoint 仅内存 API，持久化属后续任务）
- 不改 src/agent/（消费方迁移——token 统计/调度态/goal 态——属后续任务）
- 不改 scripts/audit/（K3 红线）
- 不改 extensions/（纯存储层任务）

## Q3: 验收 — 入口 → 交互 → 结果
入口：SessionStore.appendEvent 成功提交（生产 8+ 构造点全部自动）+ vitest 测试入口。
处理：原型 wrap 驱动注册表 eager drive → 每个注册单元 apply 增量派生 → Object.is 变更门 → change 通知 + whole-value 断言（裸 delta 事件 → log.warn + 违规记录）；惰性首触从 getEvents 全量日志 fold；checkpoint/restoreFloor/restore 支持冷读与版本化重放。
结果：npx vitest run tests/store/session-projection.test.ts 全绿（≥4 用例 red→green）；tests/store/ 全绿；tsc 28 基线零新增；grep registerProjection src/store/ 命中（真实接线）；grep @deepseek-ai src/ 零结果；as any = 0。

## 架构层:
L5 存储层（本任务在哪一层）— src/store/session-projection.ts，向下无依赖、向上供 L2/L3 消费

## 文档引用
docs/plans/codex/implementation/SYNOVA-IMPL-D588-session-projection-20260907.md §2 现状 / §4 写集表 / §5 测试要求 / §6 接线要求 / §7 DS 判据；docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md B-07；CLAUDE.md 铁律 0-2 / 24+31 / 32 / 38 / 47。

## 接口审计
src/store/session-store.ts: appendEvent
src/store/session-store.ts: getEvents
src/store/session-store.ts: addMessage

## Q4: 历史教训对照
memory/ engine-core-split-fraud：借范式必须读源码自研（本任务 DSH index.js 299 行 + invariant.js 32 行已逐行读），交付前 grep "@deepseek-ai" src/ 必须零结果。memory/ 2026-09-01-d490-expert-config-parser-fix：零回归 = FAIL 集恒等——实现前后各跑一次 tests/store/ 比对失败集。memory/ 2026-08-23-d477-standardkey-tags-delivery：tsc 基线对照须单 bash 命令完成，跑后还原副作用工件。memory/ 2026-08-28-d488-v2-workflow-state-desync：clone 交付时 brief 复制主区（hook ROOT 随 harness CWD 指向主工作区）+ clone 内 pre-commit 需 brief 与 current-brief 同步。

## Done 标准
- [x] 投影注册表落地（register 校验 + eager drive + checkpoint + restoreFloor + restore + 惰性 fold）且测试 red→green — verify: npx vitest run tests/store/session-projection.test.ts
- [x] appendEvent 订阅缝真实接线（DS1，非测试内） — verify: grep -rn "registerProjection" src/store/session-projection.ts
- [x] 零 DSH 代码依赖（DS2/G1） — verify: grep -rn "@deepseek-ai" src/ | wc -l
- [x] 新测试 + tests/store/ 全绿且 tsc 28 基线零新增（DS4） — verify: npx vitest run tests/store/session-projection.test.ts tests/store/session-store.test.ts
- [x] as any 新增 = 0（DS5） — verify: git diff -U0 -- src/ tests/ | grep "+.*as any" | wc -l
