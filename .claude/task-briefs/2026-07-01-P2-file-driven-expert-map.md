# Task Brief: Phase P2 — 哨兵→专家映射文件驱动化

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | 铁律 8 文件驱动 + CLAUDE.md §文件化扩展

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 目标：能文件化的必须文件化，不能文件化的必须有明确的扩展点。
当前 `expert-evolution.ts` 中 52 行的 `SENTINEL_EXPERT_MAP` 硬编码了哨兵 ID 前缀到专家类型的映射。
每个哨兵 manifest 已经包含 `name` + `layer` + `expert` 字段。**manifest 本身就是映射。**

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 扩展（文件驱动）— 删除硬编码映射，改为读取 sentinel manifest

本任务删除 `expert-evolution.ts` 中 52 行硬编码的 `SENTINEL_EXPERT_MAP`，改为运行时读取 `extensions/sentinels/*/manifest.json` 中的 `name` + `expert` 字段。

- 性质：迁移（硬编码 → 文件驱动）
- 为什么现在做：新增哨兵时，FDE 已在 manifest.json 中声明 expert 字段。
  硬编码的前缀匹配没有被 manifest 驱动，导致手动维护两份映射。

### b) 文件审计
- `packages/evolution/src/expert-evolution.ts:42-93` — 待删除的 52 行硬编码映射
- `packages/evolution/src/expert-evolution.ts:95-107` — sentinelToExpert 函数，需改为文件驱动
- `extensions/sentinels/*/manifest.json` — 数据源（每个哨兵 manifest 有 name + expert 字段）
- `packages/evolution/src/index.ts` — 无需修改（不导出新函数）

关系：迁移（删除硬编码，改为实时读取）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题**：`SENTINEL_EXPERT_MAP` 是一个硬编码的 52 行数组，镜像了 sentinel manifest 中已有的信息。每次新增哨兵，FDE 需要在 manifest 中填 `expert` 字段，同时还需要改 TS 代码来更新映射——两次维护，必然不一致。
2. **为什么不从 runner.ts 导入 LAYER_EXPERTS**：`packages/evolution/` 不应静态依赖 `src/sentinel/`。文件驱动方案更好：读 manifest JSON。
3. **方案**：`loadSentinelExpertMap()` 扫描 `extensions/sentinels/*/manifest.json`，提取 `name`+`expert` 构建映射。缓存到进程级变量。fallback 到按首字母推断（F→finance, T→tech 等）。
4. **为什么不直接从 manifest 读取 layer 再映射**：manifest 已经有 `expert` 字段，一步到位。

引用依据：
- 铁律 8: 文件驱动 — 新增哨兵只需在 manifest.json 中声明 expert
- 铁律 37: Dead code 不入仓库 — 删除后 grep SENTINEL_EXPERT_MAP 零结果
- 铁律 35: 自动化优先 — 启动时自动扫描，无需注册步骤

### b) 本任务执行约束
- rule: "SENTINEL_EXPERT_MAP 必须被删除（验证零引用）"
  verify: "grep -c 'SENTINEL_EXPERT_MAP' packages/evolution/src/expert-evolution.ts | grep 0"
- rule: "必须从 sentinel manifest 读取映射（非硬编码）"
  verify: "grep -q 'sentinels\|manifest\|loadMapping\|scanSentinels\|readdirSync' packages/evolution/src/expert-evolution.ts"
- rule: "必须有缓存（避免每次调用都扫描磁盘）"
  verify: "grep -q 'cache\|let.*map\|let.*Map' packages/evolution/src/expert-evolution.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. `expert-evolution.ts` 新增 `loadSentinelExpertMap()` — 扫描 `extensions/sentinels/*/manifest.json` 读取 name+expert
2. 删除 `SENTINEL_EXPERT_MAP` 常量（52 行）
3. 修改 `sentinelToExpert()` 优先读取文件驱动的映射，fallback 到首字母推断
4. 添加模块级缓存

不做什么：
- 不改 sentinel manifest 文件（expert 字段已在每个 manifest 中）
- 不改 runner.ts（LAYER_EXPERTS 保持不变）
- 不改 sentinel-loader.ts
- 不改 fallback 逻辑（首字母推断保留作为安全网）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`sentinelToExpert('F1_KZ')` 调用
处理：扫描 sentinel manifests → 构建 name→expert 映射 → 查询 → 返回
结果：F1_KZ → finance（与硬编码版本一致）

## 本任务在哪一层
L0（packages/evolution/src/expert-evolution.ts）

## Done 标准
- [x] verify: grep -c 'SENTINEL_EXPERT_MAP' packages/evolution/src/expert-evolution.ts 2>&1 | head -1 | grep 0
- [x] verify: grep -q 'readdirSync\|readFileSync' packages/evolution/src/expert-evolution.ts
- [x] verify: grep -q 'cache\|_expertMap' packages/evolution/src/expert-evolution.ts
- [x] verify: npx vitest run tests/evolution/expert-evolution.test.ts 2>&1 | tail -5 | grep -q 'Tests'
