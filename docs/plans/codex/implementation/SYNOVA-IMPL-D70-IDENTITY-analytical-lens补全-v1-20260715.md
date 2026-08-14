# SynovaAgent — D70 IDENTITY.md analytical_lens字段补全 实施方案 v1.0

> 2026-07-15 | 第12份权威文档（Skill-Tool体系）第六章 "对齐二：expert/目录升级方案"
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

## 当前状态（2026-07-15 审计确认）

- D53: 9个expert manifest.json已创建 ✅ — 含displayName/tone/boundaries/frameworks/edges/computes
- D58: 9个PROMPT.md已创建 ✅ — 6模块完整提示词模板
- D69: expert-prompts.ts降级 ✅ — 从硬编码改为文件驱动
- **缺失**: IDENTITY.md尚未增加 `analytical_lens` 字段（权威文档12第六章 "对齐二" 明确要求）
- 权威文档要求: IDENTITY.md增加 `analytical_lens: { default_dimension, primary_edges, blind_spots }`

---

## 做了什么

### 1. 9个 expert/{name}/IDENTITY.md — 追加analytical_lens字段（修改 ×9）

在每个专家的IDENTITY.md末尾追加 `## analytical_lens` 章节:

```markdown
## analytical_lens
- default_dimension: cost_structure
- primary_edges: E-23, E-13, E-34, E-37
- blind_spots: 竞争位势(战略), 组织效率(组织)
```

**每位专家的analytical_lens**（基于manifest.json已有的tone/frameworks/boundaries推断）:

| 专家 | default_dimension | primary_edges | blind_spots |
|------|-----------------|---------------|-------------|
| finance | cost_structure | E-23, E-13, E-34, E-37 | 竞争位势, 组织效率 |
| strategy | competitive_position | E-33, E-36, E-01, E-03 | 财务精算, 技术选型 |
| org | organizational_capacity | E-07, E-14, E-15, E-17 | 财务精算, 技术选型 |
| marketing | market_demand | E-25, E-30, E-31, E-33 | 财务精算, 技术架构 |
| tech | technology_readiness | E-09, E-24, E-29, E-35 | 财务精算, 品牌策略 |
| action | execution_velocity | E-13, E-23, E-28, E-42 | 战略方向, 品牌策略 |
| business_model | value_capture | E-25, E-30, E-36, E-37 | 技术选型, 组织架构 |
| knowledge | knowledge_accessibility | E-09, E-19, E-20, E-35 | 实时决策, 品牌策略 |
| host | intent_routing | E-01, E-02, E-16 | 深度诊断(委托专家) |

### 2. src/agent/expert-file-loader.ts — analytical_lens加载验证（修改，如有此文件）
或
prompt-assembler.ts — 在loadExpertManifest中增加analytical_lens读取（修改）

确保 `analytical_lens` 被prompt-assembler的M1模块加载并注入到专家提示词中。

---

## 不做什么

- 不修改manifest.json（D53产物，只读）
- 不创建新文件（只追加IDENTITY.md内容）
- 不修改PROMPT.md（D58产物）

---

## 架构层

扩展（`expert/{name}/IDENTITY.md` — 文件驱动配置）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | 9个IDENTITY.md追加analytical_lens | 1.5h | expert/*/IDENTITY.md ×9 |
| 2 | prompt-assembler加载验证 | 0.5h | prompt-assembler.ts |
| 3 | IDENTITY.md一致性验证测试 | 0.5h | tests/expert/analytical-lens.test.ts |

**总工时: 2.5h（半天）**

---

## 完成标准

```
[ ] 9个IDENTITY.md全部追加 ## analytical_lens 章节
[ ] 每个含 default_dimension + primary_edges(3-4条) + blind_spots(2-3个)
[ ] primary_edges指向真实42边ID（在42边清单中grep确认存在）
[ ] blind_spots标注该专家不应涉入的领域
[ ] zero as any（Markdown文件，不适用）
[ ] >=5测试: analytical_lens存在性9 + primary_edges有效性+盲点合理性
```

---

## 权威文档引用

- 第12份权威文档: Skill-Tool体系研究 第六章（与现有体系对齐）
  - 对齐二: expert/目录升级方案 — IDENTITY.md增加analytical_lens字段
  - 迁移路径: manifest.json + IDENTITY.md analytical_lens → 主Agent从文件读取
  - 深度分析文档: 跨专家Skill差异化产出机制 — analytical_lens驱动差异化推理视角