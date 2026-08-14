<!--
  Synova Skill/Tool体系研究 第六章 — 与现有体系对齐
  版本: v1.0 | 日期: 2026-07-16
-->

# 第六章：与现有体系对齐

> 6个对齐分析：expert-prompts.ts降级方案 / expert/目录升级 / 哨兵体系集成接口 / PolicyEngine集成点 / 改动清单 / 三阶段迁移策略。

---

## 对齐一：expert-prompts.ts 降级方案 -> ExpertPromptLoader

### 现状

packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts 包含约280行硬编码的专家提示词（Strategic/Org/Finance/Marketing/Tech/Action六位专家），通过 buildExpertPrompt(type, context) 函数生成 systemPrompt 和 userMessage。

---

## 对齐二：expert/目录升级方案

### 现状
9个expert目录（action/business_model/finance/host/knowledge/marketing/org/strategy/tech/_template），每个含IDENTITY.md/RULES.md/THEORY.md/TOOLS.md/CROSS_EXPERT.md。expert-registry.yaml注册专家。

### 目标
每个expert/{name}/增加manifest.json，声明该专家的skill权限/tool白名单/推理域。TOOLS.md内容迁移到manifest.json的tools字段。IDENTITY.md增加analytical_lens字段。

### 迁移路径
1. 增加manifest.json（保留TOOLS.md并行运行）→ 主Agent从manifest.json读取 → 逐步弃用TOOLS.md
2. IDENTITY.md增加analytical_lens：default_dimension/primary_edges/blind_spots（见深度分析文档）

## 对齐三：与哨兵体系集成

- Playbook的trigger消费哨兵Finding（sentinelId+severity条件）
- SkillLoader和SentinelLoader同模式启动（SentinelLoader先于SkillLoader）
- 哨兵的compute函数通过manifest.json的dependencies.computes字段被Skill引用
- 方案哨兵注册到SentinelRegistry独立命名空间（goal-{goalId}-前缀）

## 对齐四：PolicyEngine(D38)集成

每次Skill执行前：PolicyEngine检查(dimension, sensitiveAccess, expert)三元组 → 放行/降级/拒绝
每次Tool调用前：PolicyEngine检查当前专家是否有权限调用该Tool
拒绝时返回标准Error子类（.code + .phase + .retryable）

## 对齐五：改动清单

**需修改**：
- `packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts` — 降级为ExpertPromptLoader
- `expert/expert-registry.yaml` — 增加manifest.json引用

**需新增**：
- `src/skill/skill-loader.ts` — SkillLoader（对标sentinel-loader.ts）
- `src/skill/tool-registry.ts` — ToolRegistry
- `src/playbook/playbook-loader.ts` — PlaybookLoader
- `src/growth/context-loader.ts` — ContextLoader
- `skills/builtin/*/manifest.json` — 约35个Skill的manifest
- `playbooks/builtin/*.yaml` — 约21个Playbook YAML

**可废弃**：无（渐进迁移）

## 对齐六：三阶段迁移策略

### Phase 1：并行运行
新Skill体系在老系统旁运行，不影响现有诊断。loadSkills()和现有expert-prompts.ts并行。

### Phase 2：切换
主Agent切换到Skill体系。expert-prompts.ts降级为加载器（只做文件读取组装，不持有DEFINITIONS硬编码）。

### Phase 3：清理
删除DEFINITIONS硬编码（6位专家定义）。TOOLS.md归档。expert-registry.yaml更新为引用manifest.json。
