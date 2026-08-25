## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
SynovaAgent — D65 Skill/Tool 注册中心 + 加载器 Phase 1。Skill-Tool 体系 P0。
当前无 Skill 注册/加载系统。Tool 已有分散的 expert-tools（7 个工具链文件）和 agent/builtin-tools.ts（注册到 agent/tools.ts 的 ToolRegistry），但无统一的 ToolDef 注册表。
D65 是 Phase 1：新体系在旧体系旁边运转，零破坏。
### b) 文件审计
- `extensions/skills/` — 不存在，需新建目录结构
- `extensions/tools/` — 不存在，需新建目录结构
- `src/skill/` — 不存在，需新建目录（区别于已有的 `src/skills/` 旧版 skill-loader）
- `src/skills/skill-loader.ts` — 旧版 Batch 2 加载器（读 SKILL.md），不改
- `src/tools/tool-registry.ts` — 不存在，需新建（区别于 `src/agent/tools.ts` 已有的 ToolRegistry）
- `src/agent/tools.ts` — 已有 ToolRegistry（register/execute/toOpenAITools），不改
- `src/tools/index.ts` — 现有工具导出，不改
- `sentinel-loader.ts` — 对标模板（147 行，文件驱动扫描→解析→缓存→注册模式）
### c) 决策
Phase 1 纯并行：新建 4 个核心文件 + 2 个目录结构。对标哨兵文件驱动模式。不修改任何现有文件。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 任务文档第12份权威文档 第三章: SkillManifest Schema (13 字段)
b) sentinel-loader.ts L1-147: 文件驱动模式（目录扫描→manifest.json→缓存→注册）
c) memory/ 铁律1(接线三环节) + 铁律37(死代码禁止) + 铁律38(零as any)
d) 约束2: Phase 1 不修改任何现有文件

## Q2: 范围 — 正确的最简方案
做什么：
1. extensions/skills/manifest.json — Skill 系统总 manifest
2. extensions/tools/manifest.json — Tool 系统总 manifest
3. extensions/skills/{builtin,industry,custom,candidates}/ 目录结构
4. src/skill/skill-loader.ts — 对标 sentinel-loader，扫描 extensions/skills/
5. src/skill/skill-registry.ts — SkillRegistry 单例，register/get/unregister/list
6. src/tools/tool-registry.ts — ToolRegistry 单例，register/get/invoke

不做什么（含文件路径）：
- 不创建具体的 Skill 子目录和 SKILL.md（归 D66）
- 不创建 Playbook 加载器（归 D67）
- 不修改 src/skills/skill-loader.ts（旧版 skill-loader 不改）
- 不修改 src/agent/tools.ts（现有 ToolRegistry 不改）
- 不修改 src/tools/ 下的任何现有文件（index.ts 及 7 个 expert-tools 不改）
- 不修改 src/sentinel/sentinel-loader.ts（对标模板，不改）

## Q3: 验收 — 入口 → 交互 → 结果
入口: SkillLoader.loadSkills() + ToolRegistry.register(toolDef)
处理: 扫描 extensions/skills/ → 解析 manifest.json → 缓存 → 注册到 Registry
结果: SkillRegistry.get('skill-name') 返回 LoadedSkill, ToolRegistry.invoke('tool-id', params) 返回结果

## 架构层: L2(编排层) — src/skill/ + src/tools/。Skill/Tool 挂载在主 Agent。
## Done 标准
- [ ] extensions/skills/manifest.json 存在
- [ ] extensions/tools/manifest.json 存在
- [ ] extensions/skills/{builtin,industry,custom,candidates}/ 目录存在
- [ ] skill-loader.ts: loadSkills() 返回 {skills, degraded, errors[]}
- [ ] skill-registry.ts: register/get/unregister/list 可用
- [ ] tool-registry.ts: register/get/invoke 可用
- [ ] loadSkills() 空目录不崩溃 (degraded: false, skills: [])
- [ ] >=8 测试用例通过
- [ ] tsc零新增错误 / vitest零新增失败 / 零as any
- [ ] pre-commit 8组全部通过
