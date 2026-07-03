# Task Brief: Task A Step 1 — 新实体 JSON Schema (29 文件)

> 生成: 2026-07-04 | 分支: worktree-session+03 | 本体层重建 Step 1/7

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- **Synova 五层架构**: 本任务在 L4 本体层
- **当前状态**: `extensions/ontology/node-types/` 有 22 个旧节点 JSON；`edge-types/` 有 17 个旧边 JSON
- **本任务**: 在 `extensions/ontology/` 下新增 `resource/` `activity/` `outcome/` 三个目录，创建 29 个新实体 JSON Schema
- **关系**: 纯新增，不修改现有文件。旧 node-types/ 保留不动

### b) 文件审计
- `extensions/ontology/resource/` — 新建 13 个 JSON（money, person, team, tool, agent, knowledge, client, channel, brand, ip, data, location, supplier）
- `extensions/ontology/activity/` — 新建 8 个 JSON（production, acquisition, innovation, coordination, learning, governance, maintenance, compliance）
- `extensions/ontology/outcome/` — 新建 8 个 JSON（financial, market, operational, people, innovation, risk, competitive, external）

### c) 决策
无冲突。纯新增文件，不改旧文件。

## Q1: 调研

### a) 业界/记忆教训
- 铁律 46: 禁止桥接代理文件（`engine-core-split-fraud.md`）
- JSON Schema 必须与 `ontology-loader.ts` 的 `NodeTypeDef` 接口兼容（已验证现有接口）

### b) Anthropic 决策链
1. 29 个 JSON 是纯声明文件，无逻辑代码 → 直接按 TASK_A 文档模板逐文件创建
2. 每个 JSON 使用 `$id` 新命名空间（`resource/xxx` `activity/xxx` `outcome/xxx`）
3. `optionalProps` 按 TASK_A 文档定义的字段清单编写

## Q2: 范围

**做什么**: 创建 29 个实体 JSON 文件，分布在 3 个新目录
**不做什么**: 
- 不改 `node-types/` 旧文件
- 不改 `ontology-loader.ts`（Step 2 才改）
- 不改任何 compute 函数、哨兵、专家文件
- 不改 `edge-types/`（Step 2 才替换）

## Q3: 验收

入口: `ls extensions/ontology/resource/*.json` = 13 个
处理: 逐文件按模板写入
结果: `ls extensions/ontology/activity/*.json` = 8 个, `ls extensions/ontology/outcome/*.json` = 8 个

## 架构层级
L4 本体层

## Done 标准
- [ ] verify: `ls extensions/ontology/resource/*.json | wc -l` = 13
- [ ] verify: `ls extensions/ontology/activity/*.json | wc -l` = 8
- [ ] verify: `ls extensions/ontology/outcome/*.json | wc -l` = 8
- [ ] verify: `npx tsc --noEmit` 零错误（已有 JSON 被 loader 读取）
