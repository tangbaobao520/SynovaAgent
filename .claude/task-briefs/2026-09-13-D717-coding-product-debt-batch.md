# Task Brief: D717 coding-product-debt-batch

> 生成: 2026-09-13 | 任务: D717 | 认领: 🛠 Mac 编码（synova-dsh）
> 参考: 派单文档 docs/synova/coordination/派单-下一批四线并行-20260913.md §D717

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
产品代码真债两项（L2 编排 + L4 本体/证据）。两项都属「已登记但未修」的真缺陷，非新功能：
① 前端 `use-streaming-conversation` 未声明依赖 → **干净安装下必失败**（此前 21/21 绿是污染安装态的假绿）
② `evidence expireOld()` 存在但**全仓零生产调用方**（M3「机制建成未接线」家族）
### b) 文件审计
- 前批实证：`PLAN-react-markdown-dep` 记录 `use-streaming-conversation` 引用了未在 `package.json` 声明的依赖
- 前批实证：`grep -rn "expireOld" src/` 仅命中定义处，无生产调用方（`PLAN-expireold-wiring`）
- 数据保留分级策略见 `board-backlog.json`（`PLAN-evidence-invalidation-granularity` 同族）→ 接线点须与该策略一致
### c) 决策
复用现有函数（`expireOld` 已存在），补声明 + 补接线；不新建机制。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 5：后端能力 ≠ 用户可用功能——追踪调用链（谁调用？结果在哪呈现？）
- 铁律 4/0-2：接线是硬门禁，`grep` 零结果 = 未完成（WIRE CHECK）
- 历史教训：4 次接线失败（组件单测通过但从未被生产调用）；`--no-verify` 泛滥源于假绿
- 干净安装复现是唯一可信证据：污染 `node_modules` 会让缺失依赖「看起来能用」
### 参考：铁律 0-2/4/5 + WIRE CHECK 历史 → 以干净安装 + grep 调用方为验收

## Q2: 范围 — 正确的最简方案
做什么：
- `package.json` — 声明 `use-streaming-conversation` 实际引用但未声明的依赖（修 `PLAN-react-markdown-dep`）
- `src/**`（接线点）— 把 `evidence expireOld()` 接到真实生产调用方（修 `PLAN-expireold-wiring`）+ 补接线断言
- `tests/**` — 两项各自的回归断言（正常路径 + 降级路径 + 边界）
- `task-state/D717.json` — 本单登记
不做什么：
- 不改 `scripts/`（控制塔 = CTO 域）
- 不改 `src/sentinel/`、`src/cron/`、`src/mcp/`（哨兵切片属他人域，避免撞车）
- 不改 `src/server.ts`（Claude 专属，DSH 不碰）
- 不同批改锁文件与其他依赖（每批只动一个依赖改动面，惯例）

## Q3: 验收 — 入口 → 交互 → 结果
入口：开发者 `npm ci` 干净安装 → 运行相关测试
处理：补依赖声明 + 接线 `expireOld` 到真实调用点
结果：干净安装下相关测试全绿 + `grep -rn "expireOld" src/` ≥1 生产调用方

## 架构层: L2（编排）+ L4（证据/本体）
依赖声明属工程配置；`expireOld` 接线落在证据生命周期调用点（L4/存储清理侧）

## Done 标准:
- [ ] 干净安装下相关套件绿（**必须贴 `rm -rf node_modules && npm ci` 的原始输出**，不接受污染态结果）：`npm ci && npx vitest run <相关套件>` → 0 failed
- [ ] `expireOld` 有生产调用方：`grep -rn "expireOld" src/ --include="*.ts" | grep -v "\.test\." | wc -l` → ≥1
- [ ] 两项各有测试断言（非空壳，铁律 48）：`grep -c "expect(" tests/**/相关测试` → ≥1
