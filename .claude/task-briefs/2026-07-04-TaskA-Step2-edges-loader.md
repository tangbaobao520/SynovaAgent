# Task Brief: Task A Step 2 — 替换 edge-types + 更新 ontology-loader

> 生成: 2026-07-04 | 分支: worktree-session+03 | 本体层重建 Step 2/7

## Q0: 定位
**项目拼图**: L4 本体层。删除旧 17 个边 JSON，创建新 16 个边 JSON。更新 loader 读取新目录(resource/activity/outcome/)，不再读旧 node-types/。
**文件审计**: `extensions/ontology/edge-types/` → 删除 17 个旧边，新建 16 个新边
**决策**: 一次性切换，不保留旧边

## Q1: 调研 — Anthropic 决策链
- 新边 `$id` 使用 `edge/xxx` 命名空间（如 `edge/deploys`）
- `allowedFrom/To` 引用新实体 ID（如 `resource/money`、`activity/production`、`outcome/financial`）
- `EdgeTypeDef` 添加 `consumed_by_sentinels?: string[]`
- loader 新增扫描 resource/activity/outcome/ 三个新目录，去掉 node-types/扫描

## Q2: 范围
**做什么**: 
1. 删除 `extensions/ontology/edge-types/` 全部 17 个旧 JSON
2. 创建 16 个新边 JSON
3. 更新 `src/l4/ontology-loader.ts`
**不做什么**:
- 不改 `extensions/ontology/node-types/*.json`
- 不改任何 compute 函数
- 不改 extensions/sentinels/

## 架构层级
L4

## Q3: 验收
入口: `extensions/ontology/edge-types/`
处理: 删除旧边 + 创建新边 + loader 修改
结果: `ls edge-types/*.json` = 16, `npx tsc --noEmit` 零错误

## Done 标准
- [x] verify: `ls extensions/ontology/edge-types/*.json | wc -l` = 16
- [x] verify: `npx tsc --noEmit` 零错误
- [x] verify: loader 扫描 resource/activity/outcome/ 三个目录

