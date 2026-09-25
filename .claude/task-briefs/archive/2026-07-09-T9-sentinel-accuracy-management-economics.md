---
task_id: "T9"
title: "哨兵精度基线 + 管理经济学知识注入 Phase 1"
date: "2026-07-09"
version: "V4.4.4"
---

## Q0:

a) 项目拼图：
Synova = AI 诊断 Agent。五层架构 L1→L5。8 专家 7 维度。
本任务涉及：
- L3 洞察层: src/sentinel/sentinel-accuracy.ts（新建）— 哨兵精度计算
- L1 交互层: src/routes/ga-annotations.ts（扩展）— 标注 API stats
- 专家层: expert/org/THEORY.md + expert/tech/THEORY.md（追加）
- 测试层: tests/sentinel/sentinel-accuracy.test.ts + tests/expert/*.test.ts

上层相关：无（精度基线是全新模块）
下层相关：L4 AgentMemoryStore 存储标注数据

本任务是新增（精度基线）+ 扩展（标注API）+ 追加（知识文件）。

b) 文件审计：
- src/sentinel/ 无精度基线相关模块
- src/routes/ga-annotations.ts T3 已交付 3 端点
- expert/org/THEORY.md 194行，委托-代理有概念级概述缺操作框架
- expert/tech/THEORY.md 信息不对称有理论支柱缺操作框架
- docs/synova/business/SYNOVA-管理经济学-知识体系设计-20260623.html 权威源

c) 决策：无冲突，可执行。

## Q1:

a) 业界最佳实践: Precision/Recall/F1 标准定义，最小标注≥10条
b) 项目教训: memory/stub-implementation-pattern.md 不写 stub
c) 权威源确认: 设计方案 pre-code 块是注入权威源

## Q2:

做：
- 创建 sentinel-accuracy.ts（computeSentinelAccuracy + SentinelAccuracy 接口）
- ga-annotations-types.ts 添加 correction 状态 + accuracy 类型
- ga-annotations.ts 扩展 POST 接受 correction + stats 返回 accuracy
- 6 个精度测试用例
- org/THEORY.md 追加委托-代理操作分析框架
- tech/THEORY.md 追加信息不对称分析框架
- 5 个注入验证测试
- 创建 tests/expert/ 目录

不做：
- ❌ 不创建 TOOLS.md/RULES.md/KNOWLEDGE.md（Phase 2 做）
- ❌ 不创建 skills/ behavioral-economics / info-economics-screening / game-theory
- ❌ 不修复 22 个预存 vitest 失败（已知基建债豁免）
- ❌ 不改 packages/engine-core/src/*.ts（Phase 5 做）
- ❌ 不修改 ga-annotations.ts 前端（无前端文件）
- ❌ 不修改 ga-annotations.ts 核心端点逻辑（仅扩展 stats）

## Q3:

入口: sentinel-accuracy.ts 被 ga-annotations.ts stats 端点 import
交互: GET /api/ga/annotations/stats 返回 accuracy 字段
结果: 6 精度测试 + 5 注入测试全部通过，pre-commit 8组通过

## 本任务在哪一层
L1 (routes/ga-annotations.ts) + L3 (sentinel/sentinel-accuracy.ts) + expert/

## Done 标准

[verify: 1] grep -c "import.*sentinel-accuracy" src/routes/ga-annotations.ts — 非零
[verify: 2] npx vitest run tests/sentinel/sentinel-accuracy.test.ts — 通过
[verify: 3] npx vitest run tests/expert/org-theory-injection.test.ts — 通过
[verify: 4] npx vitest run tests/expert/tech-theory-injection.test.ts — 通过
[verify: 5] grep -c "correction" src/routes/ga-annotations-types.ts — 非零
[verify: 6] git diff expert/org/THEORY.md | grep "^-" | grep -v "^---\|^-$" | wc -l ≤ 5
[verify: 7] grep -c "委托-代理操作分析框架" expert/org/THEORY.md — 非零
[verify: 8] grep -c "信息不对称分析框架" expert/tech/THEORY.md — 非零
[verify: 9] bash scripts/pre-commit-check.sh — exit 0
[verify:10] grep -c "accuracy" src/routes/ga-annotations-types.ts — 非零
