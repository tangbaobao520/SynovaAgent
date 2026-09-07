# Task Brief — D597 D588 会话投影接线（M3 第 5 次修复）

#CRITERIA: A

> 任务: src/deploy/bootstrap.ts import 区追加 1 行副作用导入（+注释），激活 D588 会话投影
> 日期: 2026-09-08 | Agent: DSH 编码线 | 派单: docs/synova/coordination/派单-D597-D588接线-20260908.md

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = 驻扎企业的 AI 诊断 Agent。本任务在 L5 存储层与启动编排交界：D588 已交付 src/store/session-projection.ts（410 行，会话投影注册表，「import 即接线」设计——模块加载时原型级 wrap SessionStore.prototype.appendEvent），但 src/ 零生产 import → 原型 wrap 从未触发 → 死代码（M3 第 5 次复发）。K3 七任务批审计 D588 判 CONDITIONAL PASS，三条件之① 即「接线 D# 显式立项」（本单）。新增 1 行副作用导入于应用入口 bootstrap.ts，生产 8+ SessionStore 构造点零修改自动获得投影 drive。

### b) 文件审计
grep 实证（基线 47b3d2b8 + grep-refs.sh，见 .claude/reference-map.md）：`session-projection` 在 src/ 仅命中 src/store/session-projection.ts 自身 3 处（:2/:5/:41 注释与 logger 名），tests/ 命中测试文件自身——**零生产引用 = M3 根因物理复现**。D588 交付物：src/store/session-projection.ts（410 行）+ tests/store/session-projection.test.ts（248 行，7 用例）。落点 src/deploy/bootstrap.ts:16-28 为 import 区，:23 已导入 SessionStore。无冲突，无既有接线可复用（有则 M3 不会复发）。

### c) 决策
无既有覆盖 → 最小修复 = bootstrap.ts 副作用导入（派单钦定落点）。决策参考系：第一性原理（ESM 副作用模块不被 import 就永不执行，无自动加载机制）+ Anthropic 工程基线（接线验证用 grep 物理证明，不靠声称）+ DeepSeek 实证（DSH session-projection 范式原文即「import 注册表即触发」）。三参考系收敛 → 直接执行。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 派单（权威写集与验收）：docs/synova/coordination/派单-D597-D588接线-20260908.md §二/§三。
- D588 模块设计语义：src/store/session-projection.ts:21-24——「模块加载时原型级 wrap SessionStore.prototype.appendEvent——生产 8+ 构造点零修改自动获得 drive，import 即接线。事件先落盘后驱动；drive 异常只降级不回滚」；:33-39 该模块自身 import SessionStore，ESM 模块图保证 wrap 执行时原型已就绪，导入顺序无脆弱性。
- 业界范式：side-effect import 是 ESM 激活模块级副作用的唯一标准机制（如 dotenv/config、reflect-metadata、node 的 require('source-map-support')）。
- memory 历史教训：铁律 0-2——4 次接线失败（组件过单元测试但零生产调用），M3 即第 5 次同类复发；本次修复本身就是对该教训的执行。
- 铁律对照：0-2（WIRE CHECK 硬门禁）、5（后端能力≠用户可用）、37（死代码入仓库即违规——不接线则 D588 全部 410 行属死代码）、38（as any=0，本单零类型改动）。

## Q2: 范围 — 正确的最简方案

做什么：
- 修改 src/deploy/bootstrap.ts（import 区追加 1 行副作用导入 + M3 修复注释）
- 新建 .claude/task-briefs/2026-09-08-D597-session-projection-wiring.md
- 更新 task-state/D597.json（SOP ⑦b：impl 段 + status=impl_done）

不改 src/store/session-projection.ts — D588 交付物不动
不改 tests/store/session-projection.test.ts — D588 测试不动，仅回归验证
不改 scripts/check-architecture.sh — 门禁脚本不在写集
不改 product-lines.yaml — 派单 §三 明令不碰
不改 VERSION.md — 派单 §三 明令不碰

## Q3: 验收 — 入口 → 交互 → 结果

入口（触发）：应用启动加载 src/deploy/bootstrap.ts（规范化 Server 启动序列最前置文件）→ ESM import 图执行副作用导入。
处理（中间）：session-projection 模块体执行 → 原型级 wrap SessionStore.prototype.appendEvent → 生产 8+ 构造点（bootstrap/synova-agent/cli/im-inbound 等）构造的每个 SessionStore 实例落盘事件时自动驱动已注册投影。
结果（呈现）：会话事件落盘即投影可查询（stateOf/checkpoint/restore），D588 从死代码变为生产链路真实一环；7/7 测试回归绿、架构检查零违规、tsc 28=28 基线。

## 架构层: 基础设施（src/deploy/bootstrap.ts 启动编排入口，副作用接线 L5 store 模块；无新增跨层类型依赖，bash scripts/check-architecture.sh 验证零违规）

## Done 标准:
- [ ] bootstrap.ts 含副作用导入 verify: grep -rn "session-projection" src/deploy/bootstrap.ts
- [ ] D588 测试回归 7/7 绿 verify: npx vitest run tests/store/session-projection.test.ts
- [ ] 架构检查零违规 verify: bash scripts/check-architecture.sh
- [ ] tsc 28=28 基线（改动前后错误数不变，基线 47b3d2b8 实测 28） verify: npx tsc --noEmit
- [ ] pre-commit 门禁本地全过 verify: SYNO_CI=1 SYNO_DIFF_BASE=origin/main bash scripts/pre-commit-check.sh

## 文档引用

- docs/synova/coordination/派单-D597-D588接线-20260908.md（写集/验收/交付路径）
- task-state/D597.json（CTO 认领记录）、task-state/README.md（状态机）
- src/store/session-projection.ts 头注释（契约：铁律 47 JSDoc，D588 已定义输入/输出/降级）
- CLAUDE.md §铁律 0-2/5/37、§Loop Engineering

## 接口审计

- src/store/session-projection.ts:21-24 订阅缝设计——模块加载时原型级 wrap，import 即接线（file:line 实读）
- src/store/session-projection.ts:33-39 自身 import { SessionStore } from './session-store'（模块图保证 wrap 前原型就绪）
- src/deploy/bootstrap.ts:16-28 import 区（落点；:23 SessionStore 导入；:30 createLogger）
- src/deploy/bootstrap.ts:1-15 文件头 6-Phase 启动序列说明（Phase 0 基础设施最早执行）
- grep 实证 src/ 内 session-projection 仅自引用 3 处、tests/ 仅测试文件自身——零生产引用（.claude/reference-map.md）

## 自检清单

- [x] 派单已读全文（37 行），写集/验收逐条对齐
- [x] M3 根因 grep 物理复现（零生产引用）
- [x] 写集零越界（1 修改 + brief + task-state 记账）
- [x] 不是凭记忆（bootstrap.ts/session-projection.ts 均 file:line 实读）
- [x] 不用 --no-verify
