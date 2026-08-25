# Task Brief: D456 修复 token env 名（ENGINE_API_TOKENS → ENGINE_TOKENS）

> 生成: 2026-08-18 | 分支: main | 角色: DeepSeek Harness (Mac)
> 依据: 创始人授权「你处理掉」token 配置 bug

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
config.ts 读 token 环境变量名错误：`ENGINE_API_TOKENS`（多 _API），而 `.env`/`.env.example`/
docs（D101 部署清单）都用 `ENGINE_TOKENS`。导致生产 token 读不到、回退到 dev 默认。

### b) 文件审计（grep 实测）
- src/config.ts:83 读 `ENGINE_API_TOKENS`（错）
- .env / .env.example:15 / docs/D101-deployment-checklist.md:29 都写 `ENGINE_TOKENS`（对）

### c) 决策（D333）
参考：第一性原理（以部署契约文档 + .env 模板为准，代码读错名）。结论：config.ts 改读 ENGINE_TOKENS。

## Q1: 调研
铁律 9（关键变更 grep 全仓）。ENGINE_API_TOKENS 仅 config.ts 出现，改一处即可。

## Q2: 范围 — 最简方案

做什么：
- src/config.ts

不做什么：
- 不改 scripts/audit/audit-check.py（K3 红线）

## Q3: 验收 — 入口→交互→结果

入口：服务启动读 config
处理：engineTokens = ENGINE_TOKENS || dev 默认
结果：生产 token 正确读取

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] grep "ENGINE_API_TOKENS" src/ 零结果
- [ ] npx tsc --noEmit 无 config.ts 新增错误
