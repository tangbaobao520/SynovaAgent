# Task Brief: E2E 修复 — sentinel ID 短格式兼容

> 生成: 2026-06-30 | 分支: feat/prompt-architecture

## Q0: 定位
- 纵向：L2（sentinel-service.ts）
- 性质：修复已有功能，不改架构
- 文件审计：src/agent/sentinel-service.ts — runSentinelOnce 函数

## Q1: 调研
- 铁律 24+31: 降级处理已在现有 catch 中
- 铁律 38: as any 零新增

## Q2: 范围
- 仅修改 src/agent/sentinel-service.ts 中 runSentinelOnce 函数
- 不改路由，不改 registry

## Q3: 验收
- 入口: POST /api/sentinel/run/cash-runway
- 处理: runSentinelOnce 自动补全 sentinel- 前缀 → registry.get('sentinel-cash-runway')
- 结果: 200 + sentinelId 返回完整 ID

## 本任务在哪一层
L2+L3

## Done 标准
- [x] verify: grep -q 'sentinel-' src/agent/sentinel-service.ts
- [x] verify: npx tsc --noEmit 零错误
