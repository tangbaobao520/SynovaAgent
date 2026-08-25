## Q0: 定位 -- D69 expert-prompts.ts降级为文件驱动加载器
### a) 项目拼图
expert-prompts.ts原硬编码6位专家DEFINITIONS(235行)。D53+D58已实现文件驱动(PROMPT.md+manifest.json)。D69将expert-prompts.ts从持有者降级为加载器——删除DEFINITIONS，改为readExpertManifest()从文件系统读取。
### b) 文件审计
- packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts: DEFINITIONS硬编码存在(235行) → 删除, 新增readExpertManifest
- packages/engine-core/__tests__/expert-prompts.test.ts: 测试依赖硬编码定义 → 更新
- expert/*/manifest.json: D53产物, 含displayName/tone/boundaries等字段
- expert/*/PROMPT.md: D58产物
### c) 决策
删除DEFINITIONS, 新增readExpertManifest/loadIdentityMd/loadPromptTemplate。保留所有导出函数签名不变。

## Q1: 调研
- 第12份权威文档补充修正: expert-prompts.ts从持有者变为加载器
- D53 manifest.json: 6位专家+3新增(business_model/knowledge/host)
- D58 PROMPT.md: 9个模板文件
- 铁律38: 零as any; 铁律24+31: 降级路径

## Q2: 范围
做什么: 删除DEFINITIONS / 新增readExpertManifest+loadIdentityMd+loadPromptTemplate / 更新测试
不做什么: 不改manifest.json / 不改PROMPT.md / 不改buildSystemPrompt逻辑 / 不改导出签名 / 不改engine-core其他文件

## Q3: 验收
入口: getExpertDefinition('strategic_analyst') -> 从expert/strategy/manifest.json加载
处理: manifest不存在/字段缺失 -> 默认值+log.warn; 文件加载 -> 缓存
结果: 全部导出API行为不变, 数据源从代码变为文件系统

## 架构层:
L2(编排层: engine-core/expert-prompts.ts)

## Done 标准
- [ ] DEFINITIONS硬编码完全删除(grep零存在)
- [ ] readExpertManifest()从manifest.json读取
- [ ] 降级路径: 不存在/字段缺失 -> 默认值+console.warn
- [ ] buildSystemPrompt/buildUserMessage行为不变
- [ ] 6位专家全部可从文件加载
- [ ] >=10测试 / tsc零新增 / vitest零新增 / 零as any
