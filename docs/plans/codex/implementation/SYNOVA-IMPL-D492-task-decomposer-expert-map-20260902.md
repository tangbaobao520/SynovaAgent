<!--
  SYNOVA-IMPL-D492: task-decomposer DIMENSION_EXPERT_MAP 对齐 7 位专家
  状态: dev doc | 2026-09-02 | 优先级 P1
  权威文档: expert/expert-registry.yaml v2.0（D282 9→7 声明式唯一源）; D491 交付报告（越界发现 DIMENSION_EXPERT_MAP 旧名）
  借鉴: 无 DSH 迁移直接借鉴项（自有映射修复）
  依赖: 无（D491 已合，本任务独立）
  并行: 无（写集 src/agent/task-decomposer.ts + tests/agent/，与 DSH 线零交集）
-->

# SYNOVA-IMPL-D492 task-decomposer DIMENSION_EXPERT_MAP 对齐 7 位专家

## 1. 权威文档引用

- **expert/expert-registry.yaml v2.0**（D282 2026-07-30）：7 位专家（host / capital-cycle / customer-cycle / talent-cycle / tech / finance-structure / competitive-strategy）。删除旧专家（strategy/org/finance/marketing/action/business_model/knowledge）。
- **D491 交付报告**（2026-09-02）：越界发现 `task-decomposer.ts:82-93` DIMENSION_EXPERT_MAP 仍映射到 D282 已删专家，生产影响链 main-agent.ts:321。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷：DIMENSION_EXPERT_MAP + fallback 映射到已删专家

`src/agent/task-decomposer.ts:82-93`：

```ts
const DIMENSION_EXPERT_MAP: Record<string, string> = {
  financial: 'finance',        // 已删 → finance-structure
  market: 'marketing',          // 已删 → customer-cycle
  organizational: 'org',        // 已删 → talent-cycle
  technology: 'tech',           // 保留
  strategic: 'strategy',        // 已删 → competitive-strategy
  operational: 'operations',    // 从未是合法专家 → host 兜底
  talent: 'org',                // 已删 → talent-cycle
  customer: 'marketing',        // 已删 → customer-cycle
  product: 'tech',              // 保留
  risk: 'finance',              // 已删 → competitive-strategy
};
```

两处 fallback 也是旧名 `'org'`：

- L139 `const expertType = DIMENSION_EXPERT_MAP[dimension] || 'org';`（decompose）
- L251 `expertType: DIMENSION_EXPERT_MAP[dimension] || 'org',`（runHandlerForDimension）

### 生产调用链（grep 实证）

```
loop-1「企业诊断」季度 cron（loop-scheduler.ts:175 `0 9 1 */3 *`）
  → main-agent.ts:174/313-327 用 TaskDecomposer
  → decompose（L136-139 设 expertType）
  → executeSubTask（L174）→ runHandlerForDimension（L245-251）
  → router.dispatch(expertType = 旧专家名)
  → expert/{旧名}/PROMPT.md 不存在 → degraded
```

后果：季度自动诊断在 financial/market/organizational/strategic/operational/talent/customer/risk 维度上**全部分派到已删专家 → degraded**，只有 technology/product（tech）维度可用。

### 无重复造轮子审计（S-14）

| 检查 | 结果 |
|------|------|
| 全仓 grep 现有维度→专家映射 | task-decomposer.ts 的 DIMENSION_EXPERT_MAP（唯一）+ expert-router.ts 的 selectExpert（D491 已修）——本任务修 DIMENSION_EXPERT_MAP，不重建 |
| 结论 | 修现有映射表（最小改动），复用 D491 已定的专家名 |

## 3. 实现方案

### 3.1 写集 (2 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/agent/task-decomposer.ts | 修改 | DIMENSION_EXPERT_MAP（L82-93）值对齐 7 位专家（见 §4.5 映射表）；L139/L251 fallback `'org'` → `'host'` |
| tests/agent/task-decomposer.test.ts | 修改 | 现有 expertType 断言从旧名改为 7 位新名；executeSubTask 2 个存量失败用例改走真实专家后转绿 |

> 共享资源标注（S-8）：写集不含 VERSION.md（映射修复，非门禁/工具行为变化，不 bump）。

### 3.2 最终实现同 commit 回填（S-6）

若映射表在实现时微调（见 §4.5），必须同 commit 回填本节。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 不改 expert-router.ts / expert-dispatcher.ts / expert-config-loader.ts | D491/D490 已修 |
| 不改 expert/ 目录 / expert-registry.yaml | D282 定稿，只读 |
| 不改 inferDimensionFromSentinel | 它是 sentinel→维度（键），不是维度→专家（值），无 bug |

## 4. 测试要求（测试优先：红 → 绿）

先改测试跑红（现状 2 failed）→ 再改映射跑绿。测试文件 `tests/agent/task-decomposer.test.ts`。

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| 单元 | decompose + executeSubTask + 映射 | ≥4 | ① decompose financial→finance-structure ② executeSubTask financial 转绿（旧 finance→degraded，新 finance-structure→completed）③ talent/org→talent-cycle ④ operational→host 兜底；旧名断言全改新名 |

RED 必须覆盖失败模式（S-5）：现状 executeSubTask('financial') 走 DIMENSION_EXPERT_MAP['financial']='finance'（已删）→ degraded，2 个存量失败 = 真实「旧专家名已删」事故场景。

## 4.5 决策参考（S-12）

- 决策点：10 个维度 → 7 位专家的映射？
  - 参考系：第一性原理（7 位专家语义）+ D491 §4.5 已定的 selectExpert 映射（保持一致）。
  - 结论（默认映射，实现时可按 tools 语义微调并回填 §3.2）：
    - financial → finance-structure
    - market → customer-cycle
    - organizational → talent-cycle
    - technology → tech（保留）
    - strategic → competitive-strategy
    - operational → host（无对应专家，兜底）
    - talent → talent-cycle
    - customer → customer-cycle
    - product → tech（保留）
    - risk → competitive-strategy

## 5. 接线要求

| export/函数 | 调用方 | 确认方式 |
|-------------|--------|---------|
| DIMENSION_EXPERT_MAP（内部，无新 export） | decompose（L139）+ runHandlerForDimension（L251） | grep -n "DIMENSION_EXPERT_MAP" src/agent/task-decomposer.ts 命中 ≥2 |
| TaskDecomposer.executeSubTask（已 export） | main-agent.ts:321 | grep -n "executeSubTask" src/agent/main-agent.ts 命中（生产调用点） |

本任务无新 export，接线为「修映射使既有生产调用方拿到正确专家」。

## 6. 完成标准（DS1..DS8）

- DS1 旧名消除：grep -n "return 'finance'\|'marketing'\|'org'\|'strategy'\|'operations'" src/agent/task-decomposer.ts 0 命中（DIMENSION_EXPERT_MAP 值为新名）。
- DS2 映射对齐：grep -n "finance-structure\|competitive-strategy\|talent-cycle\|customer-cycle\|host" src/agent/task-decomposer.ts 命中。
- DS3 测试全绿：vitest run tests/agent/task-decomposer.test.ts 全 pass（red 先行 2 failed → green）。
- DS4 零回归：vitest run tests/agent/expert-router.test.ts tests/agent/expert-config-loader.test.ts 绿；tsc --noEmit 零新增。
- DS5 范围一致：git diff --name-only HEAD^ 与 §3.1 写集一致（2 文件 + 簿记）。
- DS6 as any=0：grep -rn "as any" src/agent/task-decomposer.ts 零命中。
- DS7 无绕过：grep -n "no-verify" .claude/bypass.log 零命中。
- DS8 推送+CI：git log origin/main..HEAD --oneline 空 + CI TypeScript+Lint+Iron Laws / Vitest×2 绿。

## 7. 自检清单

- [ ] 每个代码审计 claim 已 grep 实证（file:line），不是凭记忆
- [ ] 写集表标题后紧跟表格（无空行）
- [ ] 测试 red→green + 覆盖失败模式（旧名已删 2 failed）
- [ ] DS1..DS8 机器可验证
- [ ] §5 接线真实（decompose/runHandlerForDimension + main-agent 生产调用）
- [ ] 无越界（不碰 expert-router/dispatcher/expert 目录）
- [ ] 隔离模型（S-15）：独立 clone，主工作区 Codex 专用
- [ ] 不是凭记忆，不用 --no-verify

## 8. 交付声明（声称↔证据对照，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| 旧名消除 | grep -n "finance\|marketing\|org\|strategy\|operations" src/agent/task-decomposer.ts | 0 命中（值为新名） |
| 映射对齐 | grep -n "finance-structure\|competitive-strategy" src/agent/task-decomposer.ts | 命中 |
| 测试全绿 | vitest run tests/agent/task-decomposer.test.ts | 全 pass |
| 零回归 | vitest run tests/agent/expert-router.test.ts + tsc --noEmit | 全绿 + 零新增 |
| as any = 0 | grep -rn "as any" src/agent/task-decomposer.ts | 0 命中 |
| 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| 无绕过 | grep -n "no-verify" .claude/bypass.log | 0 命中 |
| 推送+CI | git log origin/main..HEAD --oneline | 空 |
