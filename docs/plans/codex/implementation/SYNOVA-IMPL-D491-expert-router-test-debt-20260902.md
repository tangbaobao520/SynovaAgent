<!--
  SYNOVA-IMPL-D491: expert-router 测试债修复（selectExpert 映射 + 测试对齐 7 位专家）
  状态: dev doc | 2026-09-02 | 优先级 P1
  权威文档: expert/expert-registry.yaml v2.0（D282 9→7 声明式唯一源）; D490 dev doc/交付（D282 迁移后测试债上报）
  借鉴: 无 DSH 迁移直接借鉴项（自有测试/映射修复）
  依赖: 无
  并行: 无（写集 src/agent/expert-router.ts + tests/agent/，与 DSH 线零交集）
-->

# SYNOVA-IMPL-D491 expert-router 测试债修复（selectExpert 映射 + 测试对齐 7 位专家）

## 1. 权威文档引用

- **expert/expert-registry.yaml v2.0**（D282 2026-07-30）：7 位专家（host / capital-cycle / customer-cycle / talent-cycle / tech / finance-structure / competitive-strategy）。删除 7 位旧专家（strategy / org / finance / marketing / action / business_model / knowledge）。
- **D490 交付报告**（2026-09-02）：上报 `tests/agent/expert-router.test.ts` 4 个基线失败——指向 D282 已删除的 finance/strategy 专家。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷：expert-router.ts 与测试仍用 D282 已删的旧专家名

`src/agent/expert-router.ts:136-151` `selectExpert` 返回旧专家名：

```ts
if (s.includes('finance') || ...) return 'finance';      // 旧名，已删 → 应 finance-structure
if (s.includes('market') || ...) return 'marketing';      // 旧名，已删 → 应 customer-cycle
if (s.includes('talent') || ...) return 'org';            // 旧名，已删 → 应 talent-cycle
if (s.includes('strategy') || ...) return 'strategy';     // 旧名，已删 → 应 competitive-strategy
if (s.includes('action') || ...) return 'action';         // 旧名，已删 → 无对应
if (s.includes('business') || ...) return 'business_model'; // 旧名，已删 → 无对应
if (s.includes('knowledge') || ...) return 'knowledge';    // 旧名，已删 → 无对应
```

`tests/agent/expert-router.test.ts` 4 个失败用例（实测）：

- `dispatch({expertType:'finance'})` → 加载 `expert/finance/manifest.json`（不存在）→ degraded。
- `dispatch({expertType:'strategy'})` → 同上。
- `loadExpertManifest('finance')` → null（`expert/finance/` 已删）。
- `TaskDecomposer.executeSubTask({expertType:'finance'})` → 非 completed。

### 生产使用范围（grep 实证）

- `ExpertRouter.dispatch` 生产调用方：`cross-validator.ts:158`、`task-decomposer.ts:249`。
- `ExpertRouter.selectExpert` **零生产调用**（仅测试用，死代码——但为一致性仍须修）。

### 无重复造轮子审计（S-14）

| 检查 | 结果 |
|------|------|
| 全仓 grep 现有专家路由 | `expert-router.ts`（MVP 映射）+ `expert-dispatcher.ts`（yaml 驱动，D490 已修）——本任务只修 expert-router 的 selectExpert 旧名 + 测试，不重建 dispatcher |
| 结论 | 修现有映射（最小改动），不引 yaml 库、不重写 |

## 3. 实现方案

### 3.1 写集 (2 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/agent/expert-router.ts | 修改 | `selectExpert`（L136-151）映射旧专家名 → 7 位新专家名（见 §4.5 映射表）；fallback 'org' → 'host'；action/business_model/knowledge 旧名分支删除（无对应专家） |
| tests/agent/expert-router.test.ts | 修改 | 4 个失败用例 + selectExpert 用例全部改用 7 位专家名（finance→finance-structure、strategy→competitive-strategy、org→talent-cycle、marketing→customer-cycle） |

> 共享资源标注（S-8）：写集不含 VERSION.md（测试/映射修复，非门禁/工具行为变化，不 bump）。

### 3.2 最终实现同 commit 回填（S-6）

若映射表在实现时调整（见 §4.5 决策点），必须同 commit 回填本节。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 不改 expert-dispatcher.ts / expert-config-loader.ts | D490 已修，yaml 驱动，不重复 |
| 不改 expert/ 目录 / expert-registry.yaml | D282 定稿，只读 |
| 不重写 selectExpert 为 yaml 驱动 | selectExpert 是死代码，MVP 映射修名即可（避免扩面） |

## 4. 测试要求（测试优先：红 → 绿）

先改测试跑红（现状 4 failed）→ 再改 selectExpert 映射跑绿。测试文件 `tests/agent/expert-router.test.ts`。

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| 单元 | selectExpert + dispatch + loadExpertManifest | 4（修复） | ① finance-structure 映射（finance/margin→finance-structure）② competitive-strategy（strategy/competition→competitive-strategy）③ talent-cycle（talent/org→talent-cycle）④ customer-cycle（market/customer→customer-cycle）；dispatch/loadExpertManifest 用 7 位专家名验证非 degraded/非 null |

RED 必须覆盖失败模式（S-5）：现状 dispatch('finance') / loadExpertManifest('finance') / TaskDecomposer(finance) 4 个失败 = 真实「旧专家名已删」事故场景，非 happy-path red。

## 4.5 决策参考（S-12）

- 决策点：旧专家名 → 新专家名的映射表？
  - 参考系：第一性原理（7 位专家语义）+ expert-registry.yaml 各专家 tools 语义。
  - 结论（默认映射，实现时可按 tools 语义微调并回填 §3.2）：
    - finance/cash/margin/cost/revenue/break/dol/npv → `finance-structure`
    - capital → `capital-cycle`
    - market/customer/churn/brand/channel → `customer-cycle`
    - competition/hhi/position/strategy/governance/risk/seven/power → `competitive-strategy`
    - talent/hr/people/org/culture → `talent-cycle`
    - tech/product/innovation/data/system/software/infra → `tech`
    - fallback → `host`
    - action/business_model/knowledge/learn/skill → 删除（无对应专家，回退 fallback）

## 5. 接线要求

| export/函数 | 调用方 | 确认方式 |
|-------------|--------|---------|
| selectExpert（已 export） | 零生产调用（仅测试） | grep -rn "selectExpert" src/ --include="*.ts" 非 test 零命中 |
| dispatch（已 export） | cross-validator.ts:158 / task-decomposer.ts:249 | grep 命中（不改 dispatch，仅保证 expertType 用新名时非 degraded） |

本任务无新 export，接线为「修 selectExpert 旧名映射 + 测试对齐」。

## 6. 完成标准（DS1..DS8）

- DS1 旧名消除：grep -n "'finance'\|'strategy'\|'org'\|'marketing'\|'business_model'\|'action'\|'knowledge'" src/agent/expert-router.ts 零命中（selectExpert 返回新名）。
- DS2 测试对齐：grep -n "finance-structure\|competitive-strategy\|talent-cycle\|customer-cycle" tests/agent/expert-router.test.ts 命中。
- DS3 测试全绿：vitest run tests/agent/expert-router.test.ts 全 pass（red 先行 4 failed → green）。
- DS4 零回归：vitest run tests/agent/expert-config-loader.test.ts tests/agent/task-decomposer.test.ts（或对应真实文件）绿；tsc --noEmit 零新增。
- DS5 范围一致：git diff --name-only HEAD^ 与 §3.1 写集一致（2 文件 + 簿记）。
- DS6 as any=0：grep -rn "as any" src/agent/expert-router.ts 零命中。
- DS7 无绕过：grep -n "no-verify" .claude/bypass.log 零命中。
- DS8 推送+CI：git log origin/main..HEAD --oneline 空 + CI TypeScript+Lint+Iron Laws / Vitest×2 绿。

## 7. 自检清单

- [ ] 每个代码审计 claim 已 grep 实证（file:line），不是凭记忆
- [ ] 写集表标题后紧跟表格（无空行）
- [ ] 测试 red→green + 覆盖失败模式（旧名已删 4 failed）
- [ ] DS1..DS8 机器可验证
- [ ] §5 接线真实（selectExpert 死代码 + dispatch 生产调用方）
- [ ] 无越界（不碰 dispatcher/expert 目录）
- [ ] 隔离模型（S-15）：独立 clone，主工作区 Codex 专用
- [ ] 不是凭记忆，不用 --no-verify

## 8. 交付声明（声称↔证据对照，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| 旧名消除 | grep -n "'finance'\|'strategy'\|'org'" src/agent/expert-router.ts | 0 命中 |
| 测试对齐 | grep -n "finance-structure\|competitive-strategy" tests/agent/expert-router.test.ts | 命中 |
| 测试全绿 | vitest run tests/agent/expert-router.test.ts | 全 pass |
| 零回归 | vitest run tests/agent/expert-config-loader.test.ts + tsc --noEmit | 全绿 + 零新增 |
| as any = 0 | grep -rn "as any" src/agent/expert-router.ts | 0 命中 |
| 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| 无绕过 | grep -n "no-verify" .claude/bypass.log | 0 命中 |
| 推送+CI | git log origin/main..HEAD --oneline | 空 |
