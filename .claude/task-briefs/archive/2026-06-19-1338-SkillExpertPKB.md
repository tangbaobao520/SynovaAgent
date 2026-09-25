# Task Brief: 修复Skill→Expert映射断裂+PKB注入断裂

> 生成: 2026-06-19 13:38 | 分支: feat/prompt-architecture | as any: 0

## 项目身份
SynovaAgent = 组织诊断Agent。五层架构 L1-L5。8位专家。

## Q1: 调研
- a) scanFromFiles未递归子目录→46个skill文件未被发现
- b) linkToExpert()全代码库零调用→skill未关联到任何专家
- c) 铁律4:交付不完整。铁律0-2:测试先行+接线验收

## Q2: 范围
修复 scanFromFiles + ExpertDispatcher接线。不做: 完整集成测试(后续)。

## Q3: 验收
下次诊断时专家system prompt包含技能目录+行业知识。

## Done
- [x] skill-lazy-loader scanFromFiles重写
- [x] knowledge-injector 增加getKnowledgeInjector单例
- [x] expert-dispatcher 接线PKB注入
