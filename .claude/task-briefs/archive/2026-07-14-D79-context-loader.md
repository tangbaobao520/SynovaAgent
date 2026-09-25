## Q0: 定位 -- D79 ContextLoader企业参数合并器
### a) 项目拼图
三层参数覆盖(全局→行业→企业): ContextLoader从extensions/industries/{sector}/thresholds.json加载行业基准,从extensions/skills/custom/{enterpriseId}/overrides.json加载企业覆盖, merge合并为最终参数。
### b) 文件审计
- src/growth/context-loader.ts: 零存在→新建
- extensions/industries/: thresholds.json存在(saas-tech/financial-services等)
- extensions/skills/custom/: 空目录(等待D85创建示例)
### c) 决策
新建ContextLoader类: loadEnterpriseOverrides/loadIndustryBaseline/merge/reload + 5条降级路径

## Q1: 调研
- §6.2: 企业参数覆盖表——Synova相对于Hermes的核心创新
- extensions/industries/*/thresholds.json格式(industry/aggregatedAt/thresholdOverrides)
- 铁律24+31: 5条降级路径/铁律38: 零as any

## Q2: 范围
做什么: ContextLoader类(4方法)+5条降级路径+类型校验+范围检查
不做什么: 不改SkillLoader/SentinelLoader/D66 manifest/不创建示例覆盖表

## Q3: 验收
入口: new ContextLoader('enterprise').merge(baseline) -> 合并参数
处理: loadIndustryBaseline('saas-tech') -> thresholds / loadEnterpriseOverrides -> overrides
结果: 企业阈值覆盖行业同名参数,类型不匹配跳过+log.warn,值越界clamp+warnings

## 架构层:
L4(本体层: context-loader.ts) + L2(编排层: 被各Loader调用)

## Done 标准
- [ ] loadEnterpriseOverrides: 从extensions/skills/custom/{id}/overrides.json
- [ ] merge: 行业基准×企业覆盖×类型校验=最终参数
- [ ] loadIndustryBaseline: 从extensions/industries/读取
- [ ] reload: 清空缓存
- [ ] 5条降级路径全部实现
- [ ] >=10测试 / tsc零新增 / vitest零新增 / 零as any
