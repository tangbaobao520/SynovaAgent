# OpenClaw Skills 参考笔记

## 与 MCP Server 的区别

| | MCP Server | Skill |
|---|---|---|
| 本质 | 可调用工具 | 知识包 + 可选脚本 |
| 安装 | `npm install` | `clawhub install <slug>` |
| 安全 | npm 完整性校验 | 手动审查 SKILL.md + scripts/ |
| 专家用途 | 搜索、读文件、API | 分析框架、报告模板、SOP |

## 对我们有价值的 Skill 知识

（不需要安装，提取知识部分注入专家 PKB）

**财务分析：**
- 量化策略构建流程 → 财务专家的 analyze_cost_structure
- 研报自动生成模板 → 报告装配管线的模板
- 财报数据提取方法 → 财务专家 PKB

**市场分析：**
- 竞品监控框架 → 市场专家的 competitive_landscape
- 行业趋势分析方法 → 市场专家 PKB

**执行跟踪：**
- 工作流链式编排 → 执行专家的 prioritize_by_impact

## 安全注意事项

- 386+ 恶意 Skill 已被 Snyk 发现
- 官方建议：隔离环境运行，审查 scripts/ 目录
- 我们只提取知识（SKILL.md 正文），不执行脚本
- 知识注入专家 PKB 的方式比直接安装更安全
