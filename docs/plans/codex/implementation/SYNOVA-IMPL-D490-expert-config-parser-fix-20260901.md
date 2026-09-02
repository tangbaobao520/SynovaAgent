<!--
  SYNOVA-IMPL-D490: expert-config-loader parseSimpleYaml 死分支修复（yaml 驱动专家路由）
  状态: dev doc | 2026-09-01 | 优先级 P1
  权威文档: expert/expert-registry.yaml v2.0（D282 9→7 声明式唯一源）; D488 v2 交付报告（死分支上报）; AGENTS.md 铁律 24/31/38/47/48
  借鉴: 无 DSH 迁移直接借鉴项（自有 parser 修复）
  依赖: 无（D488 已合并，本任务独立）
  并行: 无（写集 src/agent/expert-config-loader.ts + tests/agent/，与 D556 src/loops 零交集）
-->

# SYNOVA-IMPL-D490 expert-config-loader parseSimpleYaml 死分支修复

## 1. 权威文档引用

- **expert/expert-registry.yaml v2.0**（D282 2026-07-30）：声明式专家配置，7 位专家（host / capital-cycle / customer-cycle / talent-cycle / tech / finance-structure / competitive-strategy），字段 enabled / background / model / tools。加专家 = 加 yaml 条目 + 目录，自动注册，不改代码。
- **D488 v2 交付报告**（2026-08-31）：首次上报 expert-config-loader.ts:39 parseSimpleYaml 专家键分支 `/^  [a-z_]+:$/ && !line.includes(':')` 自相矛盾恒假 → 对 v2.0 嵌套 yaml 恒解析 0 专家，上游 expert-file-loader 文件扫描静默兜底。本任务就是该缺陷的独立修复。
- **AGENTS.md 铁律**：铁律 24/31（catch 显式 log+degraded）、铁律 38（as any=0）、铁律 47/48（契约+测试非空壳）、铁律 0-2（测试先行 red→green）。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷 A：parseSimpleYaml 专家键分支自相矛盾（恒假）

src/agent/expert-config-loader.ts:39：

```ts
} else if (/^  [a-z_]+:$/.test(line) && !line.includes(':')) {
```

- 正则 `/^  [a-z_]+:$/` 要求行尾是 `:`（`:$` 锚定），则 line.includes(':') 必为真，!line.includes(':') 恒假 → 整个条件恒假，专家键分支永不执行。
- 后果：currentExpert 永不被赋值，config.experts 恒为 {}（0 专家）。

### 缺陷 B：`[a-z_]+` 不匹配连字符键

expert/expert-registry.yaml 的专家键含连字符：capital-cycle / customer-cycle / talent-cycle / finance-structure / competitive-strategy。`[a-z_]+` 只匹配小写字母+下划线，连字符 `-` 不匹配 → 即使修掉缺陷 A，这些键仍漏解析。

### 影响：消费方回退到「全专家参与诊断」

src/l3/expert-dispatcher.ts:508-516：

```ts
const { getBackgroundExperts, getEnabledDiagnosticExperts } = await import('../agent/expert-config-loader');
const allTypes = getExpertRegistry().listTypes();
const BACKGROUND_EXPERTS = getBackgroundExperts();       // 恒 Set()（空）
const enabledFromConfig = getEnabledDiagnosticExperts(); // 恒 []（空）
const expertTypes = enabledFromConfig.length > 0
  ? allTypes.filter(t => enabledFromConfig.includes(t) && !BACKGROUND_EXPERTS.has(t))
  : allTypes.filter(t => !BACKGROUND_EXPERTS.has(t));     // 回退：全部 7 专家，background 不过滤
```

当前 enabledFromConfig 恒空 → 走回退分支 → 7 位专家全部参与主诊断，background: true 的 4 位（capital-cycle/customer-cycle/talent-cycle/tech）未被排除，yaml 的声明式过滤完全失效。

### 无重复造轮子审计（S-14）

| 检查 | 结果 |
|------|------|
| 全仓 grep 现有 parser | expert-config-loader.ts 已有一套 parseSimpleYaml（自研，唯一）——复用修复，不重建 |
| yaml 库可用性 | node_modules/js-yaml 与 node_modules/yaml 存在但仅传递依赖，package.json 直接依赖只有 @types/js-yaml（devDependencies）——不引传递依赖（脆弱） |
| DSH 迁移借鉴 | 无直接借鉴项（自有 parser 修复，非 DSH 能力） |
| 结论 | 修现有 parseSimpleYaml（最小改动），不引 yaml 库、不重写 |

## 3. 实现方案

### 3.1 写集 (2 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/agent/expert-config-loader.ts | 修改 | L39 专家键分支修正：`/^  [a-z_]+:$/.test(line) && !line.includes(':')` → `/^  [a-z0-9_-]+:$/.test(line)`（去自相矛盾的 !includes(':')，regex 扩连字符/数字）；enabled/background 解析（L43-47）保持；model/tools 字段接口保留（grep 证实无消费方，不为此扩面） |
| tests/agent/expert-config-loader.test.ts | 修改（补强） | 现状仅验返回类型（Array/Set），补强为 parseSimpleYaml 断言（7 专家 + enabled/background 正确，见 §4） |

> 共享资源标注（S-8）：写集不含 VERSION.md（业务代码修复，非门禁/工具行为变化，不 bump）；与 D556（src/loops）零交集。

### 3.2 最终实现同 commit 回填（S-6）

若实现偏离（如改用 js-yaml、或 model/tools 一并解析、或增加嵌套层级校验），必须在同一提交更新本节为最终形态。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 不改 src/l3/expert-dispatcher.ts | 过滤逻辑 L514-516 已正确（空配置→回退 / 非空→过滤），缺陷在 parser 不在消费方 |
| 不改 expert/expert-registry.yaml / expert/ 目录 | D282 定稿，只读 |
| 不引 js-yaml / yaml 库 | 传递依赖，脆弱；现有 parser 1 行修复足够 |
| 不解析 model/tools（接口保留） | grep 证实 ExpertConfigEntry.model/tools 零消费方，不扩面 |
| 不改 DSH 线（scripts/、src/sentinel/） | 越界 |

## 4. 测试要求（测试优先：红 → 绿）

先写测试（red）→ 再实现（green）。测试文件 tests/agent/expert-config-loader.test.ts（补强现有弱测试，≥4 用例，覆盖正常/降级/边界）。

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| 单元 | loadExpertConfig（间接验证 parseSimpleYaml，该函数为私有） | 4 | ① 7 专家全解析（v2.0 嵌套 + 连字符键，red=现状 0 → green=7）；② enabled/background 正确（3 诊断 host/finance-structure/competitive-strategy + 4 后台 capital-cycle/customer-cycle/talent-cycle/tech）；③ yaml 缺失/空 → fail-open 返回空（loadExpertConfig 已处理）；④ 缓存/clear 语义（loadExpertConfig 缓存 + clearExpertConfigCache） |

RED 必须覆盖失败模式（S-5）：现状 parseSimpleYaml(yaml 内容) 返回 { experts: {} }（0 专家）——真实「死分支恒 0」事故场景，非 happy-path red。

## 4.5 决策参考（S-12）

- 决策点 1：修现有 parser vs 引 js-yaml？
  - 参考系：第一性原理（最小机制）+ Anthropic（最小依赖，机器可验契约）+ D488 §4.5 先例（轻量解析）。
  - 结论：修现有 parseSimpleYaml（1 行 regex），不引传递依赖 js-yaml。
- 决策点 2：是否同时修 model/tools 解析？
  - 参考系：grep 实证 ExpertConfigEntry.model/tools 零消费方。
  - 结论：不修（接口保留，不扩面）；未来有消费方再扩。

## 5. 接线要求

| export/函数 | 调用方 | 确认方式 |
|-------------|--------|---------|
| parseSimpleYaml（内部，无新 export） | loadExpertConfig | grep -n "parseSimpleYaml" src/agent/expert-config-loader.ts 命中 |
| getEnabledDiagnosticExperts / getBackgroundExperts（已 export） | src/l3/expert-dispatcher.ts:509/512/513、src/l2/expert-router.ts:54/55、src/orchestrator/subagent-coordinator.ts:90/91 | grep -rn "getEnabledDiagnosticExperts|getBackgroundExperts" src/ 命中 ≥3 生产调用点（已存在，非本任务新增） |

本任务无新 export，接线为「修复既有 parser，使既有消费方拿到正确配置」。

## 6. 完成标准（DS1..DS8）

- DS1 死分支消除：grep -n "!line.includes" src/agent/expert-config-loader.ts 零命中。
- DS2 regex 扩连字符：grep -n "a-z0-9_-" src/agent/expert-config-loader.ts 命中 L39。
- DS3 测试全绿：vitest run tests/agent/expert-config-loader.test.ts 4/4 pass，red 先行（修复前 ① 7 专家断言失败）。
- DS4 零回归：vitest run tests/agent/expert-router.test.ts tests/expert-registry.test.ts 绿；tsc --noEmit 零新增。
- DS5 范围一致：git diff --name-only HEAD^ 与 §3.1 写集一致（2 文件 + 簿记），无越界。
- DS6 as any=0：grep -rn "as any" src/agent/expert-config-loader.ts 零命中。
- DS7 无绕过：grep -n "no-verify" .claude/bypass.log 零命中。
- DS8 推送+CI：git log origin/main..HEAD --oneline 空 + CI TypeScript+Lint+Iron Laws / Vitest×2 / Architecture 绿（job 级）。

## 7. 自检清单

- [ ] 每个代码审计 claim 已 grep 实证（file:line），不是凭记忆
- [ ] 写集表标题后紧跟表格（无空行）
- [ ] 测试 red→green + 覆盖失败模式（死分支恒 0）+ 正常/降级/边界
- [ ] DS1..DS8 机器可验证，命令真实
- [ ] §5 接线含 ≥1 生产调用点（消费方已存在）
- [ ] 无越界（不碰 DSH/scripts/expert-dispatcher/expert/ 目录）
- [ ] 隔离模型（S-15）：任务走独立 clone，主工作区 Codex 专用
- [ ] 不是凭记忆，不用 --no-verify

## 8. 交付声明（声称↔证据对照，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| 死分支消除 | grep -n "!line.includes" src/agent/expert-config-loader.ts | 0 命中 |
| regex 扩连字符 | grep -n "a-z0-9_-" src/agent/expert-config-loader.ts | 命中 L39 |
| 测试全绿 | vitest run tests/agent/expert-config-loader.test.ts | 4/4 pass |
| 零回归 | vitest run tests/agent/expert-router.test.ts tests/expert-registry.test.ts + tsc --noEmit | 全绿 + 零新增 |
| as any = 0 | grep -rn "as any" src/agent/expert-config-loader.ts | 0 命中 |
| 范围一致 | git diff --name-only HEAD^ | 与写集一致无越界 |
| 无绕过 | grep -n "no-verify" .claude/bypass.log | 0 命中 |
| 推送+CI | git log origin/main..HEAD --oneline | 空 |
