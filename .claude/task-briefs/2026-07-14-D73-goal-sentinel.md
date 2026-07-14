## Q0: 定位 -- D73 方案级哨兵系统
### a) 项目拼图
D71+D72已完成Goal存储/生命周期/Proposal引擎。D73为active状态的Goal注册方案哨兵，三因子偏离检测(阈值/趋势/基线)监控指标偏离。
### b) 文件审计
- src/growth/goal-sentinel.ts: 零存在→新建
- src/growth/goal-sentinel-lifecycle.ts: 零存在→新建
- src/growth/goal-lifecycle.ts: transitionGoal需加哨兵钩子
### c) 决策
新建goal-sentinel.ts(核心)+goal-sentinel-lifecycle.ts(生命周期)+修改goal-lifecycle.ts(集成)

## Q1: 调研
- §3: 三因子偏离检测(阈值/趋势/基线)
- §4: 基线建立期(2-4周)→active
- SentinelRegistry: register/unregister接口
- Goal: 含metrics(curentValue/targetValue)

## Q2: 范围
做什么: 三因子检测/注册上限(≤5)/基线期/告警升级/生命周期钩子
不做什么: 不改SentinelRegistry核心/不改sentinel-loader/不改goal-store

## Q3: 验收
入口: registerGoalSentinel(goal, registry)→goal-goalId命名空间注册
处理: computeDeviations(actual,target,baseline,samples)→三因子偏离检测
结果: 基线期只采集不告警/单因子记录/双因子P2/三因子P1→P0

## 架构层:
L3(洞察层: goal-sentinel.ts + SentinelRegistry集成)

## Done 标准
- [ ] registerGoalSentinel: 命名空间goal-{goalId}-, 上限≤5
- [ ] computeDeviations: 三因子(阈值/趋势/基线)
- [ ] 基线建立期: 2-4周collecting→active
- [ ] 告警规则: 单因子记录/双因子P2/三因子P1→P0升级
- [ ] lifecycle: registerOnGoalActive/unregisterOnGoalClosed/pause/resume
- [ ] transitionGoal: active→注册/closed→注销钩子
- [ ] >=11测试 / tsc零新增 / vitest零新增 / 零as any
