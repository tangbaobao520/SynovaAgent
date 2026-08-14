# SynovaAgent — D69 expert-prompts.ts降级 实施方案 v1.0

> 2026-07-14 | 第12份权威文档（Skill-Tool体系）补充修正
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（铁律 48）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-14 审计确认）

- D53: 9位专家AgentSpec文件化 ✅ — `expert/{name}/manifest.json` 已存在
- D58: manifest.json+PROMPT.md文件驱动 ✅ — 9个PROMPT.md已创建
- 当前 `packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts`: **硬编码6位专家DEFINITIONS** — strategic_analyst/org_diagnostician/financial_analyst/marketing_analyst/tech_architect/action_coordinator
- 补充修正核心要求: "删除DEFINITIONS硬编码，改为readExpertManifest()从文件系统读取。expert-prompts.ts从持有者变为加载器。"
- 9个manifest.json中已含所有需要的字段（displayName/description/tone/boundaries/frameworks/edges/computes）

---

## 做了什么

### 1. expert-prompts.ts 重构 — 删除DEFINITIONS，新增文件加载器（修改）

**删除:**
- `const DEFINITIONS: Record<ExpertType, ExpertDefinition>` (L45-280, 约235行)
- 6位专家的全部硬编码定义

**保留:**
- `ExpertPromptContext` 接口
- `ExpertPrompt` 接口
- `buildSystemPrompt()` 组装逻辑
- 所有导出函数签名不变

**新增:**
```typescript
// 文件驱动加载器 — 对标 D53 manifest.json + D58 PROMPT.md
function readExpertManifest(expertType: string): ExpertDefinition
// 从 expert/{name}/manifest.json 读取
// 降级: manifest不存在 → 返回默认最小定义 + log.warn + degraded
function loadIdentityMd(expertType: string): string  
// 从 expert/{name}/IDENTITY.md 读取角色声明
function loadPromptTemplate(expertType: string): string
// 从 expert/{name}/PROMPT.md 读取完整提示词模板（D58产物）
```

**数据来源变更:**
| 旧（硬编码） | 新（文件驱动） |
|------------|-------------|
| DEFINITIONS[type].name | manifest.json.displayName |
| DEFINITIONS[type].description | manifest.json.description |
| DEFINITIONS[type].tone | manifest.json.tone |
| DEFINITIONS[type].boundaries | manifest.json.boundaries |
| DEFINITIONS[type].frameworks | manifest.json.frameworks |

### 2. expert-prompts.ts 降级路径（铁律24+31）

- manifest.json不存在 → 返回最小默认定义 + log.warn + degraded标记
- manifest.json存在但缺字段 → 使用默认值填充 + warnings[]
- IDENTITY.md不存在 → 跳过角色声明加载，不阻断组装
- PROMPT.md不存在 → 回退buildSystemPrompt硬编码组装（D58兼容路径）

### 3. 测试文件更新

`packages/engine-core/src/pipeline/diagnosis/__tests__/expert-prompts.test.ts`: 更新为测试文件驱动加载而非硬编码定义。

---

## 不做什么

- 不修改 manifest.json（D53产物，只读）
- 不修改 PROMPT.md（D58产物，只读）
- 不修改 IDENTITY.md（只读加载）
- 不修改 buildSystemPrompt 组装逻辑（保留不变）
- 不修改 expert-prompts.ts 的导出函数签名
- 不删除 engine-core 其他文件

---

## 架构层

L2（编排层: `packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts` — 从硬编码持有者降级为文件驱动加载器）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | 删除DEFINITIONS + 新增readExpertManifest | 2h | expert-prompts.ts |
| 2 | 新增loadIdentityMd/loadPromptTemplate | 1h | expert-prompts.ts |
| 3 | 降级路径实现 | 1h | expert-prompts.ts |
| 4 | 测试更新 | 1h | expert-prompts.test.ts |

**总工时: 5h（半天）**

---

## 完成标准

```
[ ] DEFINITIONS硬编码完全删除（grep确认 'DEFINITIONS' 在expert-prompts.ts中零存在）
[ ] readExpertManifest() — 从 expert/{name}/manifest.json 读取，返回 ExpertDefinition
[ ] manifest不存在 → 返回最小默认定义 + log.warn + {degraded:true}
[ ] manifest字段缺失 → 默认值填充 + warnings[]
[ ] buildSystemPrompt() 行为不变 — 消费文件驱动的 ExpertDefinition，输出同格式 ExpertPrompt
[ ] 9位专家全部可从文件加载（含D53新增的business_model/knowledge/host）
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误（engine-core路径）
[ ] npx vitest run packages/engine-core/ 零新增失败
[ ] >=10测试: 加载成功5(host/strategy/finance/org/knowledge) + 降级3(不存在/缺字段/损坏) + 回退2(无PROMPT.md/无IDENTITY.md)
```

---

## 权威文档引用

- 第12份权威文档: Skill-Tool体系研究 补充修正（文件驱动架构升级）
  - 第一章修正: AgentSpec四元组 → manifest.json（不再通过TypeScript硬编码）
  - 第二章修正: 模块化组装 → 文件系统加载器（对标sentinel-loader.ts模式）
  - 第六章修正: 当前→目标架构迁移 — expert-prompts.ts从持有者变为加载器
- 代码依赖:
  - `expert/{name}/manifest.json` — D53产物，9个存在
  - `expert/{name}/PROMPT.md` — D58产物，9个存在
  - `expert/{name}/IDENTITY.md` — 专家角色声明文件