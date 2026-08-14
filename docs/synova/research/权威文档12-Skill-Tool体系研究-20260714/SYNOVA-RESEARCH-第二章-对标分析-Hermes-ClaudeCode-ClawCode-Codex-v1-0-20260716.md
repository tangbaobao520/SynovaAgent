# 第二章：对标分析 — Hermes / Claude Code / Claw Code / Codex

---

## 一、Hermes深度分析

**源码路径**：D:\Git项目研究\hermes-agent-main\

### SKILL.md结构（YAML frontmatter）
```yaml
---
name: test-driven-development
description: "TDD: enforce RED-GREEN-REFACTOR, tests before code."
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [testing, tdd, development]
    related_skills: [systematic-debugging, writing-plans]
---
# 正文：概述/使用时机/铁律/步骤流程/验证清单/反模式
```
**借鉴点**：YAML frontmatter元数据格式 → Synova manifest.json的metadata字段
**不适用点**：无权限模型、无企业多租户、无Playbook编排

### 五件套目录结构
SKILL.md + references/ + scripts/ + templates/ + tests/
**借鉴点**：文件驱动 → 新增Skill=新增目录，零代码修改
**关键发现**：Hermes没有企业/用户级别参数覆盖 — Synova在此之上创新本地自适应层

### Tool注册机制（registry.py）
使用AST扫描`tools/*.py`检测`registry.register()`调用，零手动注册。
源码位置：`D:\Git项目研究\hermes-agent-main\tools\registry.py:53-72`
**借鉴点**：AST自动发现 → Synova的ToolLoader可对标实现

### Skill加载机制（skill_commands.py）
扫描`~/.hermes/skills/`目录→YAML解析→注入为user message（非system prompt保证prompt caching）。
源码位置：`D:\Git项目研究\hermes-agent-main\agent\skill_commands.py:~188`

---

## 二、Claude Code Bundled Skills深度分析

**源码路径**：D:\Git项目研究\system_prompts_leaks-main\Anthropic\Claude Code\bundled-skills\

### dataviz — procedure checklist模式
SKILL.md包含7步流程：选图表类型→配色→验证→标记格式→交互→无障碍→最终检查。
每步有check验证。`references/palette.md` 作为可替换参数实例。
**借鉴点**：procedure checklist → Synova Playbook step编排；参数化设计 → 企业自适应层

### code-review — 多variant模式
high/medium/low/max四档，共享同一review流程，仅深度不同。
**借鉴点**：多variant → Skill的contextual loading

### run-skill-generator
SKILL.md + template.md + examples/ 的Skill生成模板
**借鉴点**：自举模式 → Agent自生成候选Skill的基础设施

---

## 三、Claw Code — AgentSpec三元组

**源码路径**：D:\Git项目研究\claw-code-main\rust\crates\claw-analog\src\agents.rs:62-69

AgentSpec结构：name + preset(Audit/Explain/Implement) + permission + model + prompt
每种preset自动映射默认权限。Audit只读/Explain只读/Implement可写。
**借鉴点**：角色→权限→推理域三元组 → Synova Skill manifest的permissions字段

---

## 四、Codex Plugin体系

plugin.json manifest + 文件驱动扩展。优先级覆盖：用户>工作区>系统。
**借鉴点**：优先级覆盖 → Synova Skill的custom>industry>builtin

---

## 五、临床路径概念参考

临床路径五要素：触发条件→检查项目→诊断标准→治疗方案→评估节点 → Playbook五要素：trigger→contextRequirements→steps→output→闭环验证

---

## 可借鉴度矩阵

| 特性 | Hermes | Claude Code | Claw Code | Codex | Synova采用 |
|------|--------|-------------|-----------|-------|-----------|
| 文件驱动Skill | ✅ | 部分 | ❌ | ✅ | ✅ 采用 |
| 五件套结构 | ✅ | ✅ | ❌ | ❌ | ✅ 采用 |
| Tool自动注册 | ✅(AST) | ❌ | ❌ | ❌ | ✅ 采用 |
| 企业参数覆盖 | ❌ 缺失 | ❌ | ❌ | ❌ | ✅ Synova创新 |
| Playbook编排 | ❌ | ✅(procedure) | ❌ | ❌ | ✅ 扩展完整Playbook |
| 权限模型 | ❌ | ❌ | ✅(AgentSpec) | ✅ | ✅ PolicyEngine |

## 三大创新空间

1. **本地自适应层**：Hermes/Claude Code/Claw Code/Codex均无企业多租户 → Synova唯一
2. **Playbook系统**：Claude Code的procedure是最接近的，但无trigger/condition/onFailure/跨专家分派 → Synova完整扩展
3. **Skill文件驱动+manifest+权限+依赖完整性**：四个对标项目各自有部分，无一完整整合 → Synova唯一
