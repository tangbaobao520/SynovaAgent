# Task Brief: Phase P1 — 阈值文件驱动化（`GENERAL_THRESHOLDS` → JSON）

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | 铁律 8 + 文件驱动原则

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 目标：能文件化的必须文件化，不能文件化的必须有明确的扩展点。

当前 `GENERAL_THRESHOLDS` 硬编码在 `global-analyzer.ts:33-45` 中。每新增一个哨兵，必须修改 TypeScript 代码——违反"文件驱动"原则。FDE 无法在不部署代码的情况下调整通用阈值。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 扩展（文件驱动，不改 TypeScript）— 新建 `extensions/evolution/default-thresholds.json`

本任务将 `global-analyzer.ts` 中的 `GENERAL_THRESHOLDS` 硬编码常量迁移到 JSON 文件。
- 性质：迁移（常量→文件）
- 为什么现在做：新增哨兵需要修改 TS 代码才能添加默认阈值，FDE 无法自行调整

| 当前 | 改为 |
|------|------|
| TypeScript 常量 `GENERAL_THRESHOLDS` | `extensions/evolution/default-thresholds.json` |
| 编译时绑定 | 运行时加载 + 文件不存在时 fallback 到编译期默认值 |
| 改阈值→改代码→PR→CI→部署 | 改阈值→改 JSON→热加载生效 |

### b) 文件审计
- `packages/evolution/src/global-analyzer.ts:33-45` — 待迁移的硬编码常量
- `packages/evolution/src/global-analyzer.ts:72` — 引用 GENERAL_THRESHOLDS 的地方
- `packages/evolution/src/global-analyzer.ts:118-124` — writeIndustryThresholds 也使用 GENERAL_THRESHOLDS
- `extensions/evolution/` — 新建
- `extensions/evolution/default-thresholds.json` — 新建（迁移目标）

关系：迁移（常量→JSON）+ 新建（扩展目录 + JSON 文件）

### c) 决策
无冲突。直接迁移。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题**：硬编码阈值 = 每次新增哨兵都要改代码。违反复用+扩展原则。
2. **为什么不在 AgentMemoryStore 中存储**：
   - `GENERAL_THRESHOLDS` 是编译期默认值，不是运行时数据
   - JSON 文件可以被版本管理（git），可以跨环境共享
   - AgentMemoryStore 是租户隔离的运行时存储，不适合存全局默认值
3. **最小可行方案**：
   - 新建 `extensions/evolution/default-thresholds.json`
   - 添加 `loadDefaultThresholds()` 函数（支持文件不存在 → 编译期 fallback）
   - 替换 `GENERAL_THRESHOLDS` 常量的所有引用

引用依据：
- 铁律 8: 文件驱动 — 新增能力靠文件，不靠改代码
- 铁律 37: Dead code 不入仓库 — 迁移后删除硬编码常量
- 铁律 35: 自动化优先 — JSON 文件加载有缓存，避免磁盘 I/O 热点

### b) 本任务执行约束
- rule: "JSON 文件不存在时必须 fallback 到编译期默认值，不抛异常"
  verify: "grep -q 'fallback\|GENERAL_THRESHOLDS_FALLBACK\|\.\/default-thresholds' packages/evolution/src/global-analyzer.ts"
- rule: "加载必须有缓存（首次读取后缓存到进程结束）"
  verify: "grep -q 'cache\|let thresholds' packages/evolution/src/global-analyzer.ts"
- rule: "原始 GENERAL_THRESHOLDS 常量消失（迁移到 JSON 后删除）"
  verify: "grep -c 'const GENERAL_THRESHOLDS' packages/evolution/src/global-analyzer.ts | grep 0"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 新建 `extensions/evolution/default-thresholds.json`（包含当前所有阈值数据）
2. `global-analyzer.ts` 添加 `loadDefaultThresholds()` 函数：
   - 从 `extensions/evolution/default-thresholds.json` 读取
   - 缓存到模块级变量（进程内复用）
   - 文件不存在 → log.warn → 返回编译期 fallback
   - JSON 解析失败 → log.warn → 返回编译期 fallback
3. 删除旧的 `GENERAL_THRESHOLDS` 常量
4. 将所有引用 `GENERAL_THRESHOLDS` 改为调用 `loadDefaultThresholds()`
5. 更新测试（验证 JSON 加载 + fallback 行为）

不做什么：
- 不改 `writeIndustryThresholds` 的写入逻辑（它写入 `extensions/industries/`，不是 `extensions/evolution/`）
- 不改 `extensions/industries/*/thresholds.json`（行业阈值是聚合产物，非默认值）
- 不改 `aggregateIndustryBaseline` 的外部接口签名
- 不改任何其他模块

## Q3: 验收 — 入口 → 交互 → 结果

入口：`aggregateIndustryBaseline()` 内部调用 `loadDefaultThresholds()`
处理：读取 JSON → 解析 → 缓存 → 返回阈值
结果：JSON 文件中的阈值被用于行业基线对比

## 本任务在哪一层
L0（packages/evolution/src/global-analyzer.ts）+ 扩展（extensions/evolution/）

## Done 标准
- [x] verify: test -f extensions/evolution/default-thresholds.json
- [x] verify: grep -q 'loadDefaultThresholds' packages/evolution/src/global-analyzer.ts
- [x] verify: grep -c 'const GENERAL_THRESHOLDS' packages/evolution/src/global-analyzer.ts 2>&1 | head -1 | grep 0
- [x] verify: npx vitest run tests/evolution/global-analyzer.test.ts 2>&1 | tail -3 | grep -q 'Tests'
- [x] verify: npx vitest run tests/evolution/ 2>&1 | tail -5 | grep -q '71 passed'
