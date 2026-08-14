# 补充修正：文件驱动架构升级

> 第10份权威文档（专家提示词工程规范）在"文件驱动"约束下进行修正。核心原则：增加专家不能要求改TypeScript代码。

---

## 第一章修正：AgentSpec四元组 → manifest.json

不再通过expert-prompts.ts的TypeScript接口定义专家。改为文件驱动：

```
expert/finance/manifest.json:
{
  "name": "finance",
  "type": "expert",
  "displayName": "财务专家",
  "description": "看家底——钱花得值不值，现金流能不能撑住",
  "tone": "精确、审慎、量化",
  "boundaries": ["不替代专业财务审计","所有金额标注误差范围"],
  "frameworks": ["诊断→财务映射矩阵","Token经济学","ROI排序"],
  "edges": ["E-05","E-13","E-23","E-30","E-31","E-34","E-37"],
  "computes": ["computeBreakEven","computeDOL","computeNPV"],
  "crossDomainRule": "当遇到战略类问题时回复：'这不在我的诊断范围内，建议咨询战略专家'",
  "analytical_lens": {
    "default_dimension": "cost_structure",
    "primary_edges": ["E-23","E-13","E-34","E-37"],
    "blind_spots": ["竞争位势(战略)","组织效率(组织)"]
  },
  "priority": 1,
  "loading": "always"
}
```

## 第二章修正：模块化组装 → 文件系统加载器

不再通过buildSystemPrompt函数硬编码组装。启动时：
1. 扫描expert/目录 → 读取每个manifest.json
2. 按需加载IDENTITY.md/RULES.md/TOOLS.md/THEORY.md
3. 对标sentinel-loader.ts的扫描+缓存模式

## 第六章修正：当前→目标架构迁移

**当前**：expert-prompts.ts硬编码DEFINITIONS（6位专家）+ buildSystemPrompt组装
**目标**：纯文件驱动 + expert-prompts.ts降级为ExpertPromptLoader（只读文件不持定义）

**expert-prompts.ts降级方案**：
- 保留：buildSystemPrompt的组装逻辑（注入tone/boundaries/frameworks/outputFormat）
- 删除：DEFINITIONS硬编码（6位专家的全部静态定义）
- 新增：readExpertManifest()函数 — 从文件系统读取manifest.json
- 新增：loadIdentityMd()/loadRulesMd()/loadTheoryMd() — 按需加载各模块
- 结果：expert-prompts.ts从"持有者"变为"加载器"
