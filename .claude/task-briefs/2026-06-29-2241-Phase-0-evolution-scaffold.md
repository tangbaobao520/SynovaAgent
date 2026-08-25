# Task Brief: Phase 0 — L0 进化引擎包结构初始化 + 死代码清理

> 生成: 2026-06-29 | 分支: feat/prompt-architecture | 基于 EVOLUTION-LAYER-v2.md

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
目标: 成为组织诊断的 AWS。能文件化的必须文件化。不能文件化的必须有明确的扩展点。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（迁移到独立包 / 新建包）
- [x] 纵向（改 L1-L5 代码/架构） — 清理 src/evolution/ 死代码

本任务属于基础设施模块。触及 L0（新包）和 src/evolution（清理）。
- L0 进化层在设计中是横向切面，现有 src/evolution/ 有 3 个文件，2 个死代码
- 本任务：清理 2 个死代码 + 创建 packages/evolution/ 包骨架
- 性质：清理 + 新建

### b) 文件审计
grep 结果：
- `src/evolution/l0-adaptation.ts` — 无任何 src/ 引用（死代码），引用了 engine-core（铁律 46 违规）
- `src/evolution/l1-session-learning.ts` — 无任何 src/ 引用（死代码）
- `src/evolution/feedback-collector.ts` — src/routes/chat.ts:63 引用（活的，保留）
- `packages/evolution/` — 不存在（新建）

关系：清理（2 删除）→ 新建（包骨架）

### c) 决策
无冲突。直接清理死代码，新建包骨架。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC / Done 标准 → ② 实现 → ③ 验证 → ④ 接线审计 → ⑤ 提交 CI

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 37: Dead code 入仓库即违规。删除旧文件 + grep 零引用确认
- 铁律 46: 禁止桥接代理文件 — l0-adaptation.ts 是 engine-core 桥接违规

### b) 本任务执行约束
- rule: "删除死代码前必须 grep 确认零引用"
  verify: "grep -rn 'l0-adaptation\|l1-session-learning' src/ --include='*.ts' | grep -v 'evolution/' | head -5"
- rule: "新建包必须在 package.json workspaces 中注册"
  verify: "grep -c '@synova/evolution' package.json"
- rule: "新建包必须有 tsconfig.json，可与根 tsconfig 的 strict 模式兼容"
  verify: "npx tsc --noEmit --project packages/evolution/tsconfig.json 2>&1 | head -5"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 删除 `src/evolution/l0-adaptation.ts`（死代码 + engine-core 桥接违规）
2. 删除 `src/evolution/l1-session-learning.ts`（死代码）
3. 创建 `packages/evolution/` 目录结构
4. 创建 `packages/evolution/package.json` (name: "@synova/evolution")
5. 创建 `packages/evolution/tsconfig.json`
6. 创建 `packages/evolution/src/index.ts`（导出占位）
7. 创建 `packages/evolution/src/evolution-types.ts`（L0 类型定义）
8. 在根 `package.json` workspaces 中注册 `packages/evolution`
9. 确保 tsc --noEmit 对新建包零错误

不做什么：
- 不迁移 feedback-collector.ts（Phase P0-1 做）
- 不实现进化逻辑（Phase P0-2/P0-3 做）
- 不改 sentinel/runner.ts
- 不改 post-diagnosis-processor.ts
- 不改 agent-memory-store.ts
- 不改 chat.ts

## Q3: 验收 — 入口 → 交互 → 结果

入口：命令行 — `ls packages/evolution/` → 目录存在
处理：删除死代码 → 新建包结构 → 注册到根 package.json
结果：grep 确认零旧引用 + tsc 编译通过 + 包可被 import

## 本任务在哪一层
L0（新建横向层，不改变五层架构）

## Done 标准
- [x] 入口可触达: packages/evolution/package.json 存在且有效
      verify: test -f packages/evolution/package.json && grep -q '"@synova/evolution"' packages/evolution/package.json
- [x] 链路走通: 删除的死代码无外部引用
      verify: grep -rn 'l0-adaptation\|l1-session-learning' src/ --include='*.ts' 2>/dev/null; [ $? -eq 1 ]
- [x] 结果可见: tsc 编译零错误（根 tsconfig 找到了 @synova/evolution 路径）
      verify: npx tsc --noEmit 2>&1 | grep -c evolution; test $? -eq 1
- [x] 结果可见: @synova/evolution 注册在根 tsconfig.json paths 中
      verify: grep -c '@synova/evolution' tsconfig.json
