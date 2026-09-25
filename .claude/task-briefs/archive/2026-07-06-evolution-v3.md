# Task Brief: Evolution v3 — 多源反馈 + NCI 升级

> 生成: 2026-07-06 | 分支: feat/evolution-v3 | L0 进化层

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
进化体系从 v2 升级到 v3。当前 60% 就绪，缺失多源反馈采集（4种来源）、企业行为隐式检测、NCI 全局模式识别。

### b) 文件审计
- `packages/evolution/src/feedback-collector.ts` — 已有: 单源 GA 反馈。需加: FeedbackEvent 多源接口 + collectAllFeedback
- `packages/evolution/src/org-adapter.ts` — 已有: OrgAdapter 类。需加: detectBehavioralValidation, aggregateExternalData, detectCostTemplateDrift, detectDiagnosisContradiction, updateSignalSourceWeight
- `packages/evolution/src/global-analyzer.ts` — 已有: 行业基线聚合。需加: analyzeGlobalPatterns, detectNciGlobalPatterns
- `packages/evolution/src/rule-version-manager.ts` — 已有: 快照/回滚/灰度。需加: checkGrayscaleHealth
- `src/routes/evolution.ts` — 已有: 5个端点。需加: 3个新端点
- `tests/evolution/` — 已有: 9个测试文件。需加: collectAllFeedback + v3 org-adapter 测试

### c) 决策
扩展已有文件，不删不改核心逻辑。

## Q1: 调研 — Anthropic 决策链
1. 规格文档: `SYNOVA-IMPL-进化体系升级-v1-20260705.md`
2. 现有代码已覆盖 60% 功能 — 只加不删
3. 每路采集独立 try/catch，单路失败不阻断整体（铁律24+31）

## Q2: 范围
**做什么**: 5 个源文件扩展 + 3 个 API 端点 + 测试
**不做什么**:
- 不改已有的核心逻辑（OrgAdapter 的 afterDiagnosis/processCorrections/adjustThresholds）
- 不改哨兵 compute 函数
- 不改本体层

## 架构层级: L0 进化层（横向切面）

## Q3: 验收
入口: `packages/evolution/src/feedback-collector.ts`
处理: 逐文件扩展，新增函数独立可测试
结果: tsc 零错误 + 83+ tests 通过 + CI 绿色

## Done 标准
- [ ] verify: `npx tsc --noEmit`
- [ ] verify: `npx vitest run tests/evolution/ | grep -q passed`
- [ ] CI on feat/evolution-v3 全部通过
