# SynovaAgent — D58 manifest.json+加载器文件化 实施方案 v1.0

> 2026-07-14 | 第10份权威文档（专家提示词工程）第六章 + 补充修正
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在，不是"我相信会有人调"）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38 — pre-commit 硬阻断）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-14 审计确认）

- 分支: `feat/prompt-architecture`
- D53: 9位专家AgentSpec文件化 ✅ — `expert/{name}/manifest.json` 已创建
- D54: 6模块提示词组装 ✅ — `prompt-assembler.ts` 已实现6模块
- D55: 推理链+交叉验证 ✅
- D56: 数据冲突+交互协议 ✅
- D57: Tone四源融合+角色一致性 ✅
- **关键审计发现（grep确认的真实状态）:**
  - `expert/{name}/PROMPT.md` — 9个文件**全部不存在**（权威文档第六章标注为 `➕ 空白文件`）
  - `expert/{name}/manifest.json` — 9个存在，但**不含 promptTemplate 字段**
  - `expert/expert-registry.yaml` — 存在，依赖TOOLS.md/IDENTITY.md等
  - `packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts` — 旧硬编码定义（6位专家），D58不改此文件
  - `prompt-assembler.ts:308` — `MODULE_ORDER = ['M1','M2','M3','M4','M5','M6']` — 模块顺序已定义
  - `prompt-assembler.ts:557` — `moduleLoading` 从 manifest.json 驱动，而非硬编码
- **补充修正要求**（第10份权威文档）: "expert-prompts.ts降级为ExpertPromptLoader — 只读文件不持定义。从持有者变为加载器。"

---

## 做了什么

### 1. 为9位专家创建 PROMPT.md 文件（新建 ×9）

目标目录: `expert/{name}/PROMPT.md`

每个 PROMPT.md 包含6模块完整提示词（权威文档6.2映射矩阵+6.4测试蓝图定义的格式）:

```markdown
# {displayName} — 诊断提示词

## M1: 角色定义
你是{displayName}。{description}。
语调: {tone}
框架: {frameworks}
权限边界: {boundaries}

## M2: 工具调用
可用的因果边: {edges}
可调用的计算模块: {computes}

## M3: 推理链
四层追溯协议：信号确认 → 传导路径 → 结构原因 → 根因定位

## M4: 交叉验证
引用其他专家时使用 [source: expert_name, evidence_id: XXX] 格式

## M5: 边界识别
信息不足时输出"当前数据不足以支持[领域]诊断。需要补充：[具体数据需求]"

## M6: 数据冲突
检测到冲突时标注 has_conflict，展示两版本，分别诊断，不默认选择
```

**占位符说明**: 文件中的 `{displayName}` / `{tone}` / `{edges}` 等为模板变量，由 prompt-assembler.ts 在 assemblePrompt() 时替换为 manifest.json 的真实值。

### 2. 9个 manifest.json 新增 promptTemplate 字段（修改 ×9）

在每个 `expert/{name}/manifest.json` 中新增:
```json
"promptTemplate": "./PROMPT.md"
```

**消费方式**: prompt-assembler.ts 的 `loadExpertManifest()` 读取 manifest.json → 检查 `promptTemplate` 字段 → 加载对应 PROMPT.md → 替换占位符变量 → 注入 assemblePrompt。

### 3. prompt-assembler.ts 扩展模板加载（修改）

**当前**: `loadExpertManifest()` → 从 manifest.json 读 `tone/frameworks/edges` 等字段 → 硬编码 buildM1/M2/M3/M4/M5/M6 函数组装。

**改为**: `loadExpertManifest()` → 检查 `promptTemplate` → 存在则读取 PROMPT.md → 替换占位符 → 返回完整提示词。不存在则降级到现有 buildM* 函数（保持向后兼容）。

```typescript
// 新增函数
function loadPromptTemplate(expert: ExpertManifest): string
// 替换策略
// 1. 读取 promptTemplate 指向的文件
// 2. 替换模板变量: {displayName} → expert.displayName
// 3. 文件不存在/损坏 → 回退 buildM1-M6 硬编码
// 4. 降级标记: degraded: true + log.warn
```

### 4. prompt-assembler.ts 降级路径（铁律24+31）

- 模板文件缺失 → 回退现有 buildM1-M6 逻辑，输出含 degraded 标记
- 模板文件语法错误（无法读取/JSON解析失败）→ log.warn + 回退
- 模板文件为空 → 视为缺失，回退
- 占位符替换失败 → 使用原始文本，warnings[] 记录未替换的占位符

### 5. 测试文件

`tests/agent/prompt-assembler.test.ts` — 新增测试:
- 模板加载: finance/strategy host PROMPT.md 存在→加载成功
- 模板降级: PROMPT.md 不存在 → 回退 buildM1-M6
- 占位符替换: `{displayName}`/`{tone}`/`{edges}` 全部替换
- 模板为空: 回退
- 混合场景: M1来自模板，M2来自硬编码（部分模板存在）

---

## 不做什么

- 不创建 PROMPT.md for `_template` 目录（模板目录，跳过）
- 不修改 `packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts`（那是 D69 的工作，D58只做文件驱动基础）
- 不修改 `expert/expert-registry.yaml`（D70统一处理）
- 不修改 manifest.json 已有字段（只追加 promptTemplate）
- 不改变现有 M3/M4/M5/M6 逻辑（D54-D57已完善）
- 不删除任何现有文件

---

## 架构层

L2（编排层: `prompt-assembler.ts` 扩展模板加载）+ extensions（文件驱动: `expert/{name}/PROMPT.md` + `manifest.json` 补字段）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | 创建9个 PROMPT.md 模板文件 | 2h | expert/{name}/PROMPT.md ×9 |
| 2 | 9个 manifest.json 追加 promptTemplate | 0.5h | expert/{name}/manifest.json ×9 |
| 3 | prompt-assembler.ts 模板加载+降级 | 2h | loadPromptTemplate + assemblePrompt修改 |
| 4 | 测试文件 | 1.5h | prompt-assembler.test.ts 扩展 |

**总工时: 6h（1个工作日）**

---

## 完成标准

```
[ ] 9个 PROMPT.md 全部创建: host/strategy/org/finance/marketing/tech/action/business_model/knowledge
[ ] 每个 PROMPT.md 含完整的6模块(M1-M6)提示词结构
[ ] 每个 PROMPT.md 使用 {displayName}/{tone}/{frameworks}/{edges}/{computes}/{boundaries} 占位符
[ ] 9个 manifest.json 全部新增 "promptTemplate": "./PROMPT.md"
[ ] prompt-assembler.ts: loadPromptTemplate() 实现完整（读文件+占位符替换+降级）
[ ] prompt-assembler.ts: assemblePrompt() 优先模板，降级硬编码
[ ] 降级路径: 文件不存在→回退 buildM1-M6 + log.warn
[ ] 降级路径: 模板文件为空/损坏→回退 + log.error + degraded
[ ] 占位符替换: 全部 {placeholder} → 实际值，未替换的→warnings[]
[ ] 不改 M3/M4/M5/M6 (D55-D57产物)
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=12测试: 模板加载 5(host/strategy/finance/org/marketing) + 降级 4(不存在/为空/损坏/占位符未替换) + 混合 3(模板M1+硬编码M2/全部模板/全部降级)
```

---

## 权威文档引用

- 第10份权威文档: 专家提示词工程规范
  - 第六章 §6.2: 32×N映射矩阵 — 每个验证用例→提示词模块对应关系
  - 第六章 §6.3: 逐文件审计 — PROMPT.md 8个文件全部空白，需按本规范新建
  - 第六章 §6.4: 嵌入式测试蓝图 — 每个模块附带自动化判定标准
  - 补充修正: 文件驱动架构升级 — manifest.json Schema + 加载器修正 + 当前→目标迁移
  - 补充修正: expert-prompts.ts降级方案 — 保留组装逻辑，删除硬编码，改为文件加载

- 代码依赖（grep验证过的真实接口）:
  - `prompt-assembler.ts:308` — `MODULE_ORDER = ['M1','M2','M3','M4','M5','M6']`
  - `prompt-assembler.ts:557` — `moduleLoading` 从 manifest.json 驱动
  - `expert/{name}/manifest.json` — D53 产出，9个文件存在