# Task Brief: Task A Step 1 — 新实体 JSON Schema (29 文件)

> 生成: 2026-07-04 | 分支: worktree-session+03 | 本体层重建 Step 1/7

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova 五层架构 L4 本体层。当前 `extensions/ontology/node-types/` 22 个旧节点 JSON，`edge-types/` 17 个旧边 JSON。
本任务在 `extensions/ontology/` 下新增 `resource/` `activity/` `outcome/` 三目录，创建 29 个新实体 JSON Schema。
纯新增，不改现有文件。

旧文件保留不动：`extensions/ontology/node-types/` (22), `extensions/ontology/edge-types/` (17)

### b) 文件审计
- `extensions/ontology/resource/` — 新建 13 个 JSON
- `extensions/ontology/activity/` — 新建 8 个 JSON
- `extensions/ontology/outcome/` — 新建 8 个 JSON

### c) 决策
无冲突。纯新增。

## Q1: 调研 — Anthropic 决策链
- 铁律 46: 禁止桥接文件（记忆: `engine-core-split-fraud.md`）
- JSON Schema 与 `ontology-loader.ts` 的 `NodeTypeDef` 接口兼容
- 所有 `$id` 使用新命名空间（`resource/xxx` `activity/xxx` `outcome/xxx`）
- 29 个 JSON 是纯声明文件，无逻辑代码，按 TASK_A 文档模板创建

## Q2: 范围
**做什么**: 创建 29 个实体 JSON 文件，分布在 3 个新目录
**不做什么**: 不改 node-types/ 旧文件、不改 ontology-loader.ts（Step 2）、不改任何 compute 函数

## Q3: 验收
入口: `extensions/ontology/resource/`
处理: 逐文件写入 JSON Schema
结果: 29 个文件 + tsc 零错误

## Done 标准
- [x] `ls extensions/ontology/resource/*.json | wc -l` = 13
- [x] `ls extensions/ontology/activity/*.json | wc -l` = 8
- [x] `ls extensions/ontology/outcome/*.json | wc -l` = 8
- [x] `npx tsc --noEmit` 零错误

已通过验证:
```bash
ls extensions/ontology/resource/*.json | wc -l
# 输出: 13
ls extensions/ontology/activity/*.json | wc -l
# 输出: 8
ls extensions/ontology/outcome/*.json | wc -l
# 输出: 8
npx tsc --noEmit
# 输出: (无输出=通过)
```
