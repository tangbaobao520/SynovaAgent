## Q0: 定位 -- D59 ME Compute Enhance (7 items)
### a) 项目拼图
7个compute函数需追加economic_interpretation字段(管理经济学语义解读)。3个存在(break-even/marginal-contribution/learning-rate),4个需创建(DOL/NPV/HHI/agency-cost)。
### b) 文件审计
- extensions/sentinels/unit-economics/computes/break-even.ts: 存在→增强
- extensions/sentinels/unit-economics/computes/marginal-contribution.ts: 存在→增强
- extensions/sentinels/shared/computes/l2-value/compute-learning-rate.ts: 存在→增强
- 其他4个: 零存在→新建+注册到shared computes index
### c) 决策
追加economic_interpretation字段(≥3子字段),不改contractId,不改核心逻辑。

## Q1: 调研
- Auth Doc #11 Ch2 S2.2: 7个增强完整契约
- 管理经济学: BEP/DOL/NPV/HHI/学习曲线/边际分析/代理成本

## Q2: 范围
做什么: 7个compute的economic_interpretation字段(类型+计算+输出)
不做什么: 不改contractId/不改核心计算逻辑/不删旧字段

## Q3: 验收
入口: computeBreakEven(100000,50,30,8000)->economicInterpretation.bepClassification='far_below'
处理: 每个compute正常路径+降级路径均有interpretation
结果: 7个compute含≥3子字段的economicInterpretation

## 架构层:
L4(本体Compute层)

## Done 标准
- [ ] 7个compute全部追加economic_interpretation(≥3子字段)
- [ ] 不改contractId/不改核心逻辑
- [ ] 所有字段有JSDoc
- [ ] ≥14测试 / tsc零新增 / vitest零新增 / 零as any
