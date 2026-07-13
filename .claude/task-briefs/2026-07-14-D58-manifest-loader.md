## Q0: 定位 -- D58 manifest.json+加载器文件化
### a) 项目拼图
D53创建了9个manifest.json但无PROMPT.md。D58创建PROMPT.md文件并实现模板加载器，使提示词从文件驱动而非硬编码。
### b) 文件审计
- expert/*/PROMPT.md: 9个全部不存在 → 新建
- expert/*/manifest.json: 9个存在但不含promptTemplate → 追加
- prompt-assembler.ts: buildM*硬编码存在 → 扩展loadPromptTemplate优先加载
### c) 决策
创建9个PROMPT.md + 9个manifest追加promptTemplate + 扩展prompt-assembler.ts

## Q1: 调研
- §6.2: 6模块映射矩阵
- §6.3: 逐文件审计 — PROMPT.md全部空白
- §6.4: 嵌入式测试蓝图

## Q2: 范围
做什么: 9个PROMPT.md / manifest追加promptTemplate / loadPromptTemplate / assemblePrompt模板优先
不做什么: 不改M3/M4/M5/M6 / 不改packages/engine-core / 不改expert-registry.yaml

## Q3: 验收
入口: assemblePrompt('finance') -> M1-M6内容从PROMPT.md加载
处理: loadPromptTemplate读文件+替换占位符; 文件缺失→回退buildM*+degraded
结果: 提示词优先从PROMPT.md加载，降级路径正常

## 架构层:
L2(编排层) + extensions(文件驱动)

## Done 标准
- [ ] 9个PROMPT.md全部创建(host/strategy/org/finance/marketing/tech/action/business_model/knowledge)
- [ ] 9个manifest.json追加promptTemplate
- [ ] loadPromptTemplate: 读文件+占位符替换+降级
- [ ] assemblePrompt: 模板优先+回退buildM*
- [ ] >=12测试 / tsc零新增 / vitest零新增 / 零as any
