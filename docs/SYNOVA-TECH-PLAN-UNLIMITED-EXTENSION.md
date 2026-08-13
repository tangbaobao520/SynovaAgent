# Synova 无限扩展修复计划

> **背景**: 文件化改造只做了"读文件→注册"层，未做到"加专家不改代码"。ExpertType 是 TypeScript 联合类型，BACKGROUND_EXPERTS 硬编码，DEFAULT_EXPERT_PROMPTS 是 fallback 硬编码。
> **来源**: 自检发现 + PRD v1.8 §20（Claude for Financial Services 借鉴）
> **原则**: 切片思维 + Loop Engineering v3.2 严格执行 + 一条都不能跳过

---

## 〇、这次与上次的本质区别

```
上次: 改了"调用层"的硬编码 → runAllExperts() 从 Registry 读
      没改"类型层"的硬编码 → ExpertType 还是联合类型

这次: 从根上修——类型系统、注册机制、配置层、校验层，全链路。
      做完后：加第9位专家 = 创建目录+文件 → 自动注册 → 不需要改任何 .ts 文件。
```

---

## 一、切片总览（8 个切片）

| Slice | 内容 | 解决什么问题 | 工时 |
|--------|------|------------|------|
| F1 | ExpertType → runtime string | 加专家不需要改 TS 类型 | 2h |
| F2 | expert-registry.yaml 配置化注册 | 加专家=加 yaml 条目 | 3h |
| F3 | ExpertDispatcher 全面去硬编码 | BACKGROUND_EXPERTS + fallback 配置化 | 2h |
| 20.1 | 专家输出 Schema 验证 | LLM 输出格式强校验+重试 | 3h |
| 20.2 | 共享知识单源同步 | 8 位专家不各维护一份知识 | 3h |
| 20.3 | Agent 配置化注册 | 与 F2 合并，但加模型/工具/skill 声明 | 2h |
| 20.4 | pre-commit 专家配置校验 | CI 阻断引用断裂 | 2h |
| 20.5 | SOG schema 入库校验 | 数据层合约约束 | 2h |

---

## 二、Slice F1: ExpertType 联合类型 → runtime string

**问题**: `subagent-coordinator.ts` L17
```typescript
export type ExpertType = 'strategy' | 'org' | 'finance' | 'tech' 
                        | 'marketing' | 'action' | 'business_model';
```
加一个专家就要改这行。这是**类型系统的硬编码**。

**改动**:
1. `subagent-coordinator.ts`: `ExpertType` → `string`（运行时校验替代编译时校验）
2. `expert-registry.ts`: `register(type)` → 接受任意 string，内部加 `validateExpertType()` 函数
3. 所有 `ExpertType` 引用替换为 `string` + 运行时校验

**校验逻辑**: `validateExpertType(type)` — 检查 type 在 Registry 中是否已注册。未注册的专家类型 → warn 但不阻断（允许文件优先的动态注册）。

**验收**: 
```typescript
// 之前: 编译错误
const t: ExpertType = 'supply_chain'; // ❌ TS2322

// 之后: 运行时通过
registry.register('supply_chain', prompt); // ✅ 只要文件存在就注册
```

**不可触碰**: `expert/` 目录下的文件内容、`ExpertFileLoader` 逻辑。

---

## 三、Slice F2: expert-registry.yaml 配置化注册

**问题**: 当前专家注册依赖 `ExpertFileLoader` 扫描 `expert/` 目录——但这只是"发现"。没有"配置层"。哪个专家参与诊断？哪个跳过？现在靠硬编码的 `BACKGROUND_EXPERTS`。

**参照**: Claude for Financial Services 的 `agent.yaml`——声明式配置。

**改动**:
1. 新建 `expert/expert-registry.yaml`：
```yaml
version: 1
experts:
  strategy:
    enabled: true
    model: default
    tools: [seven_powers, goal_alignment, market_gravity]
  org:
    enabled: true
    model: default
    tools: [bus_factor, agent_readiness]
  finance:
    enabled: true
    model: default
    tools: [cashflow_analysis, unit_economics]
  # ... 其余 5 位
  knowledge:
    enabled: true
    background: true          # ← 后台专家，不参与 runAllExperts()
    tools: [query_graph, manage_permissions]
```

2. 新建 `src/agent/expert-config-loader.ts` — 启动时读取 yaml → 覆盖文件扫描结果

3. ExpertDispatcher 从配置决定哪些专家参与 `runAllExperts()`

**验收**: 加第 9 位专家 = 创建 `expert/supply_chain/` 目录 + 在 yaml 加 4 行 → 自动参与诊断。不需要改任何 .ts 文件。

---

## 四、Slice F3: ExpertDispatcher 全面去硬编码

**问题**: 三处残留硬编码——

| 位置 | 硬编码内容 |
|------|----------|
| `expert-dispatcher.ts` L489 | `BACKGROUND_EXPERTS = new Set(['knowledge'])` |
| `expert-registry.ts` L13-295 | `DEFAULT_EXPERT_PROMPTS`（280 行 fallback prompt） |
| `expert-registry.ts` L319 | 禁止 unregister 默认专家 |

**改动**:
1. `BACKGROUND_EXPERTS` → 从 `expert-registry.yaml` 的 `background: true` 字段读取
2. `DEFAULT_EXPERT_PROMPTS` → **删除整个对象**。文件加载失败时直接报错并阻止启动，不静默降级到硬编码
3. L319 unregister 保护 → 删除。Registry 应允许运行时增删专家

**验收**: 删除 `DEFAULT_EXPERT_PROMPTS` → `npx tsc --noEmit` 零错误 → 服务器启动时必须从文件加载专家。

---

## 五、Slice 20.1: 专家输出 Schema 验证

**问题**: 专家 LLM 返回 JSON 可能格式错误、字段缺失、类型不对。当前只在 `expert-pipeline.js` 中有简单的 JSON.parse + 重试，没有结构化 Schema 校验。

**参照**: Claude for Financial Services `researcher.yaml` L42-68 的 `output_schema`。

**改动**:
1. 为每位专家定义 `expert/*/OUTPUT_SCHEMA.yaml`（JSON Schema 格式）
2. 在 ExpertDispatcher 的输出层加 Zod 校验（`src/l3/expert-output-validator.ts`）
3. 校验失败 → 重试最多 2 次，附带校验错误信息
4. 2 次重试仍失败 → 返回 degraded 标记 + 部分结果

**示例 Schema（财务专家）**:
```yaml
type: object
required: [conclusion, findings, confidence]
properties:
  conclusion:
    type: string
    maxLength: 500
  findings:
    type: array
    maxItems: 10
    items:
      type: object
      required: [severity, title, description, evidence]
      properties:
        severity: { type: string, enum: [critical, warning, info] }
        title: { type: string, maxLength: 120 }
        cashFlowRatio: { type: number, minimum: 0, maximum: 5 }
```

**验收**: 故意让专家返回错误格式 → 自动重试 → 2 次后降级。

---

## 六、Slice 20.2: 共享知识单源同步

**问题**: `finance/KNOWLEDGE.md` 和 `strategy/KNOWLEDGE.md` 各自维护"现金流健康评分标准"。改一个，另一个不会同步。

**参照**: Claude for Financial Services `sync-agent-skills.py`（~40行）。

**改动**:
1. 审计 8 位专家 KNOWLEDGE.md → 找出重复内容 → 提取到 `knowledge/shared/`
2. 专家 KNOWLEDGE.md 改为引用格式：`参见 knowledge/shared/cash-flow-benchmarks.md`
3. 新建 `scripts/sync-expert-knowledge.sh`：
   - 检查所有专家 KNOWLEDGE.md 中引用的 `knowledge/shared/` 文件是否存在
   - 引用的文件不存在 → 报错退出
   - 引用的文件存在但内容不同 → 警告

**验收**: 运行 `sync-expert-knowledge.sh` → 输出同步状态 → 引用断裂时报错。

---

## 七、Slice 20.3: Agent 配置化注册

**问题**: 与 F2 重叠但范围更广——不仅是专家列表，还包括每个专家的 model/tools/skills 声明。

**改动**:
1. 扩展 `expert/expert-registry.yaml`（与 F2 合并）：
```yaml
experts:
  strategy:
    enabled: true
    model: deepseek-v4-flash      # 可覆盖默认模型
    tools: [seven_powers, goal_alignment]
    skills: [market-gravity, seven-powers]
    output_schema: OUTPUT_SCHEMA.yaml  # Slice 20.1
```

2. ExpertDispatcher 从配置加载每个专家的 tools/skills/output_schema

**验收**: 修改 yaml → `POST /api/reload` → 下次诊断使用新配置。

---

## 八、Slice 20.4: pre-commit 专家配置校验

**问题**: 有人改了 expert yaml 或 KNOWLEDGE.md 引用，但没有 CI 检查。

**参照**: Claude for Financial Services `check.py` + `validate.py`。

**改动**:
1. 扩展现有 `scripts/pre-commit-check.sh` 第 9 项：
```bash
# 9. 专家配置引用校验
# - expert-registry.yaml 中引用的 tools/skills 是否存在
# - KNOWLEDGE.md 中引用的 knowledge/shared/ 文件是否存在
# - OUTPUT_SCHEMA.yaml 格式是否有效
```

2. 新建 `scripts/validate-expert-config.sh` — 独立的校验脚本，pre-commit 和 CI 共用

**验收**: 故意写一个不存在的引用 → `git commit` → pre-commit 阻断。

---

## 九、Slice 20.5: SOG schema 入库校验

**问题**: SOG 数据入库前无 schema 校验。和 expert output_schema 使用同一套校验逻辑。

**改动**:
1. 复用 Slice 20.1 的 Zod 校验库
2. 在 `src/l4/graph-store.ts` 的 `createNode()` / `createEdge()` 加 schema 校验
3. SOG schema 定义在 `knowledge/RULES.md` 已有 → 提取为 `sog-core-schema.yaml`

**验收**: 插入不符合 schema 的节点 → 拒绝写入 + 日志告警。

---

## 十、每个切片的 Loop Engineering v3.2 流程

```
1. task-start.sh "Slice XX: 描述"
2. scope-check.sh 自动触发 → 阅读仪表盘
3. 填写 task brief Q1-Q3
4. 写代码
5. npx tsc --noEmit → 零错误
6. Agent 自检 6 问（含架构合规）
7. git commit（pre-commit 8+1 项全过）
8. 下一个切片
```

---

## 十一、禁止触碰清单

```
❌ expert/*/SOUL.md, RULES.md, IDENTITY.md, KNOWLEDGE.md 内容（另一个 Claude）
❌ packages/engine-core/ 诊断管线
❌ src/sentinel/adapters/ 哨兵适配器
❌ src/routes/diagnosis-upload-v2.ts 演示上传路径
❌ src/agent/conversation-engine.ts 对话引擎
```

---

## 十二、验收标准

```
✅ 加第 9 位专家 = 创建目录 + yaml 4 行 + POST /api/reload
✅ 不需要改任何 .ts 文件
✅ DEFAULT_EXPERT_PROMPTS 物理删除
✅ ExpertType 联合类型改为 string
✅ 专家输出 Schema 校验 + 重试
✅ 共享知识单源同步脚本
✅ pre-commit 第 9 项：专家配置校验
✅ SOG 入库 Schema 校验
```

---

## 十三、为什么这次会不一样

上次：修了调用层就觉得"完成了"，没追问类型层。

这次：
1. 每个切片有明确的"验收标准"——不是"代码写完了"，是"加一个供应链专家试试，需要改几行代码"
2. Slice F1 从根上修类型系统——这个不改，后面全是补丁
3. Slice F2/F3 完成后立即验证：加一个假专家看是否真的不需要改 .ts
4. Slice 20.4 加了 pre-commit 阻断——防止未来再次硬编码
