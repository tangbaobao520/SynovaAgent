## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
SynovaAgent — Skill-Tool体系P0。D69：expert-prompts.ts降级。第12份权威文档第六章(补充修正)。
D65完成Skill/Tool注册中心+加载器。D66完成41个内置Skill清单。D67完成Playbook加载器。D68完成Tool原子化验证。D53完成9位专家AgentSpec文件化。

核心问题：prompt-assembler.ts当前通过`loadExpertManifest()`直接读manifest.json注入M1。这是文件驱动——但M1的提示词模板本身（角色声明文本、tone注入格式、框架列表渲染）仍硬编码在buildM1函数中。D69是将这些也文件化。

D69的定位：将prompt-assembler中的**硬编码提示词模板文本**迁移到独立的提示词模板文件（.md或.json），使专家提示词变更不需要修改TypeScript代码。由SkillLoader(D65)加载，prompt-assembler消费。

### b) 文件审计
| 审计项 | grep 结果 | 行动 |
|--------|-----------|------|
| expert-prompts.ts | 零存在 | 新建 — 提示词模板加载器 |
| prompt-assembler.ts M1 | L89: 硬编码 `## 你的角色\n...${expert.tone}`  | 迁移到模板文件 |
| prompt-assembler.ts M1 | L94: 硬编码 frameworks 渲染 | 迁移到模板文件 |
| prompt-assembler.ts M2 | L104: 硬编码工具调用模板 | 迁移到模板文件 |
| SkillLoader (D65) | 已存在 src/skill/skill-loader.ts | 复用 — 加载模板文件 |
| manifest.json (D53) | 9个文件已存在 | 新增 promptTemplate 字段指向模板路径 |
| 补充修正研究 | 第12份权威文档目录不存在(Skill-Tool-System-Research-20260716) | ⚠️ 权威文档缺失风险 |

### c) 决策
新建 expert-prompts.ts 作为提示词模板加载器。为每位专家创建模板文件(extensions/prompts/{expert}/)。manifest.json新增promptTemplate字段。prompt-assembler的M1/M2改为从模板加载（降级回退到buildM1/M2硬编码）。

## Q1: 调研 — 权威文档 / 现有接口
a) 第12份权威文档 第六章(补充修正): manifest.json Schema + 加载器修正方案 + 当前→目标架构迁移图 + expert-prompts.ts降级方案
   ⚠️ 该目录(Skill-Tool-System-Research-20260716)在文件系统中不存在。D69基于现有代码反向推导需求。
b) D53 manifest.json: 已有 moduleLoading 字段(always/on-demand) — 复用此机制
c) D65 skill-loader.ts: 已有 loadSkills() / loadManifest() — 复用
d) prompt-assembler.ts assemblePrompt(): L484-489 已有 manifestOverride 参数 — 扩展支持模板覆盖
e) 铁律47: 契约优先 — 新模块先定义输入/输出/降级

## Q2: 范围 — 做什么 / 不做什么
**做什么:**
1. `src/agent/expert-prompts.ts` — 新建，ExpertPromptLoader类：加载/缓存/降级
2. `extensions/prompts/{expert}/` — 按需为9位专家各创建提示词模板文件(.md)
3. 9个 manifest.json — 新增 `promptTemplate` 字段
4. prompt-assembler.ts M1/M2 — 优先从模板加载（模板不存在→降级到当前硬编码逻辑）
5. tests/agent/expert-prompts.test.ts — ≥8测试用例

**不做什么:**
- 不改 M3/M4/M5/M6
- 不改 SkillLoader 核心（D65）
- 不创建全部9个模板（Phase 1只建 infrastructure + 3个示例模板：host/strategy/finance）
- 不修改 manifest.json 的已有字段（只追加 promptTemplate）

## Q3: 验收 — 入口→处理→结果
**入口:** assemblePrompt('finance', context) → M1加载 → 检查manifest.promptTemplate → 存在则读文件 → 不存在则降级到buildM1硬编码
**处理:** ExpertPromptLoader.load(expertType) → 缓存命中返回 / 文件读取 → Mustache风格变量替换({tone}/{displayName}/{frameworks})
**结果:** 专家提示词模板存储在extensions/prompts/中，修改模板不需要重编译TypeScript。降级路径完整（文件损坏/缺失→回退硬编码）。

## 架构层: L2（编排层） + extensions/prompts/（文件驱动）

## Done 标准
- [ ] expert-prompts.ts: ExpertPromptLoader类 — load(expertType)/clearCache()/模板变量替换
- [ ] 降级路径: 模板文件不存在 → 回退到当前buildM1/buildM2硬编码逻辑（不改现有行为）
- [ ] 模板文件损坏 → log.error + 回退硬编码
- [ ] 3个示例模板: extensions/prompts/host/role.md, strategy/role.md, finance/role.md
- [ ] 3个 manifest.json 新增 promptTemplate 字段（host/strategy/finance）
- [ ] prompt-assembler.ts M1/M2: 优先模板，降级硬编码
- [ ] 零as any / tsc零新增 / vitest零新增
- [ ] >=8测试用例（正常加载3/降级文件不存在2/降级损坏文件1/缓存命中1/变量替换1）
