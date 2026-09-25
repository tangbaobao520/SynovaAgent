## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
D77 = D71-D76系统集成。L2(编排层: PolicyEngine增强) + L1(e2e测试)。
权威文档§9.1 7项修改: #1 types.ts + #5 policy-engine.ts + 旧代码@deprecated + 集成测试。
### b) 文件审计
grep "actionRecommendations" → packages/engine-core/.../types.ts:1013 当前是 string[]
grep "StandardOperations" → src/security/policy-engine.ts:17 10条SOI
grep "workspace-service\|department-workspace\|workspace-context-bridge" → 3个旧文件
### c) 决策
types.ts新增ActionRecommendation接口 + policy-engine新增3条Goal SOI + 3文件标记@deprecated + 1个e2e测试

## Q1: 调研
a) 业界: 系统集成 = 接口对齐 + 权限补全 + 端到端验证
b) policy-engine采用ABAC模式，新增SOI+规则遵循现有模式

## Q2: 范围
做什么:
- packages/engine-core/.../types.ts: ActionRecommendation + StandardExpertReport更新
- src/security/policy-engine.ts: GOAL_READ/GOAL_ADJUST/GOAL_ABANDON + 3条规则
- 3个旧文件@deprecated
- tests/growth/e2e-navigation-loop.integration.test.ts
不做什么: 不修改sentinel相关、不修改expert-prompts

## Q3: 验收
入口: tsc + vitest --changed 通过
处理: ActionRecommendation接口 + PolicyEngine规则 + @deprecated + e2e
结果: 全链路集成验证通过

## 架构层:
L2(policy-engine + types) + L1(e2e测试)

## Done 标准
[ ] types.ts: ActionRecommendation 6字段 + StandardExpertReport接入
[ ] policy-engine.ts: GOAL_READ/GOAL_ADJUST/GOAL_ABANDON SOI + ≥3条规则
[ ] 3个旧文件@deprecated
[ ] e2e: 完整端到端
[ ] zero as any
[ ] tsc --noEmit零新增错误
[ ] vitest run --changed零新增失败
[ ] >=5测试
