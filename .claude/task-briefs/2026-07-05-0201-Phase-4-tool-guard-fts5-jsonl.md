# Task Brief: Phase 4 — 工具守卫 + CJK FTS5 + JSONL 回放 (G4/G5/G6)

> 生成: 2026-07-05 02:01 | 基于: SYNOVA-IMPL-对标补全-v1-20260703.md
> 分支: session/02 | as any: 0

---

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图

- [x] **纵向** — L3 洞察层新增 ToolGuard，L2 编排层接线改造
- [x] **扩展** — G5 CJK FTS5 是纯文件驱动（JSON 配置，零 TS 改动）
- [ ] **横向** — 不涉及包拆分

**归属系统**: 基础设施（工具安全 + 全文搜索 + 测试框架）

**触及层级**:
- **G4 ToolGuard**: L3 洞察层（`src/l3/tool-guard.ts`）— 新增模块。L2 编排层（`src/agent/tool-loop-executor.ts`）— 改造接线
- **G5 FTS5**: L5 存储层扩展（`extensions/frameworks/fts5-cjk-tokenizer.json`）
- **G6 JSONL**: 测试基础设施（`tests/fixtures/`）— 纯测试工具

**任务类型**: 新增（全部三子任务无已有实现需覆盖）

### b) 文件审计

```bash
# G4: 工具守卫 — 已有 ToolGuardrails 在 src/agent/tools.ts (L2)
#     接口: check(name, params, result) → GuardrailDecision
#     缺陷: 传入 {} 而非实际结果 → 无进展检测失效
#     文件文档要求: src/l3/tool-guard.ts (L3) with beforeCall/afterCall/getLoopDetections
grep -rn "ToolGuardrails\|class ToolGuard" src/ --include="*.ts"

# G5: CJK FTS5 — 无现存配置
ls extensions/frameworks/ 2>/dev/null || echo "目录不存在"

# G6: JSONL — 无现存测试夹具
ls tests/fixtures/ 2>/dev/null
```

**关系**:
- G4: **扩展已有模式** — `ToolGuardrails` 有 loop detection 逻辑但 API 不符合文档（`beforeCall`+`afterCall` 分离、参数校验、查询接口缺失）。新建 `ToolGuard` 不与 `ToolGuardrails` 桥接
- G5: **新建文件驱动** — 无覆盖
- G6: **新建测试基础设施** — 无覆盖

### c) 决策
全部无冲突。按文档方案新建。

---

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

```
① SPEC / Done 标准 → ② 测试 → ③ 实现 → ④ 接线 → ⑤ 验证
```

**引用依据**:
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 4: 入口→交互→结果，三环节缺一不可交付
- 铁律 24+31: 错误处理 + 降级传播（ToolGuard 的 catch 必须 log + degraded）
- 铁律 38: as any 零容忍
- memory/stub-implementation-pattern.md: 不要 stub，接线必须真实
- memory/plan-actual-closure.md: 声明完成前 grep 确认调用方存在

**Anthropic 做法**:
- 工具安全: 执行前校验（least privilege）+ 执行后审计 + 熔断模式（circuit breaker）。不多层嵌套 guard（参考 memory/streaming-pipeline-lessons 过度工程化教训）
- FTS5: 纯配置 — 不改 SQLite 源码，不改 TS，只加 JSON
- JSONL: 标准回归测试模式，不发明新框架

### b) 本任务执行约束

```json
{
  "version": "1.0",
  "principles": [
    {
      "rule": "ToolGuard 必须与 ToolGuardrails 独立，不桥接不继承",
      "reason": "ToolGuardrails 在 L2 且 API 不匹配(beforeCall/afterCall 分离)，新建 L3 ToolGuard 不走 import 桥接(铁律46)",
      "verify": "grep -rn 'ToolGuardrails\|tools.*ToolGuard' src/l3/tool-guard.ts"
    },
    {
      "rule": "ToolGuard 在 tool-loop-executor.ts 中替换 guardrails.check() 调用",
      "reason": "文档要求 L3 守卫接管工具调用安全，L2 不再直接调用 ToolGuardrails",
      "verify": "grep -n 'guardrails\.check\|toolGuard\.beforeCall' src/agent/tool-loop-executor.ts"
    },
    {
      "rule": "FTS5 配置是纯 JSON，零 TS 改动",
      "reason": "文件驱动：改配置不改代码",
      "verify": "grep -rn 'fts5.*cjk\|tokenizer' src/ --include=\"*.ts\" | wc -l | xargs test 0 -eq"
    }
  ]
}
```

---

## Q2: 范围 — 正确的最简方案

### 做什么

**G4 — ToolGuard (L3)**:
- `src/l3/tool-guard.ts`: class `ToolGuard` with:
  - `beforeCall(tool, args, history) → {allow, reason}` — 循环检测（同一工具+相同参数连续3次→阻断）、参数校验
  - `afterCall(tool, result, duration)` — 记录执行结果和耗时
  - `getLoopDetections()` → 返回所有被阻断的记录
- `src/agent/tool-loop-executor.ts`: 将 `guardrails.check()` 替换为 `toolGuard.beforeCall()` + `toolGuard.afterCall()`
- `tests/l3/tool-guard.test.ts`: 循环检测/失败阻断/参数校验/正常放行

**G5 — CJK FTS5 分词器 (L5 扩展)**:
- `extensions/frameworks/fts5-cjk-tokenizer.json`: CJK 分词器配置 JSON

**G6 — JSONL 回放测试框架 (测试基础设施)**:
- `tests/fixtures/jsonl/`: 示例回放数据目录，放 1 条示例对话 JSONL
- `tests/fixtures/jsonl-runner.ts`: 回放执行器 — 读 JSONL → 重放对话 → 对比输出 → diff

### 不做什么

- ❌ 不改 `src/agent/tools.ts`（ToolGuardrails 所在文件）— 保留 L2，新路径走 L3 ToolGuard
- ❌ 不修 FTS5 的 C 扩展或 SQLite 代码 — 纯 JSON 配置
- ❌ 不将 JSONL runner 集成到 CI — 这是纯工具脚本，CI 集成留后续
- ❌ 不碰 `packages/engine-core/`
- ❌ 不改 `src/agent/tools.ts` 已有逻辑

---

## Q3: 验收 — 入口 → 交互 → 结果

### G4 — ToolGuard

| 环节 | 说明 |
|------|------|
| 入口 | 工具调用时 `tool-loop-executor.ts` 自动触发 `toolGuard.beforeCall()` |
| 处理 | beforeCall 检查循环/参数 → allow/block | afterCall 记录耗时和结果 |
| 结果 | 阻断时日志记录 + `getLoopDetections()` 可查询全部阻断记录 |

### G5 — CJK FTS5

| 环节 | 说明 |
|------|------|
| 入口 | 文件 `extensions/frameworks/fts5-cjk-tokenizer.json` |
| 处理 | JSON schema 有效，tokenizer 配置完整 |
| 结果 | 可通过 `json5` 等工具读取验证 |

### G6 — JSONL 回放

| 环节 | 说明 |
|------|------|
| 入口 | CLI: `npx tsx tests/fixtures/jsonl-runner.ts <jsonl-file>` |
| 处理 | 读 JSONL → 重放每条对话 → 对比当前输出 |
| 结果 | 输出 diff 或 "所有回放一致" |

---

## 架构层级

L3（ToolGuard）+ L5 扩展（FTS5 配置）+ 测试基础设施（JSONL）

---

## Done 标准

### G4 — 工具守卫
- [x] verify: test -f src/l3/tool-guard.ts && grep -q 'export class ToolGuard' src/l3/tool-guard.ts
- [x] verify: grep -q 'beforeCall' src/l3/tool-guard.ts && grep -q 'allow.*false' src/l3/tool-guard.ts
- [x] verify: grep -q 'afterCall' src/l3/tool-guard.ts
- [x] verify: grep -q 'getLoopDetections' src/l3/tool-guard.ts
- [x] verify: grep -c 'toolGuard.beforeCall' src/agent/tool-loop-executor.ts | xargs test 2 -eq
- [x] verify: grep -cE 'expect' tests/l3/tool-guard.test.ts | xargs test 10 -le
- [x] verify: grep -c 'as[[:space:]]any' src/l3/tool-guard.ts | xargs test 0 -eq

### G5 — CJK FTS5
- [x] verify: test -f extensions/frameworks/fts5-cjk-tokenizer.json
- [x] verify: test -s extensions/frameworks/fts5-cjk-tokenizer.json && head -3 extensions/frameworks/fts5-cjk-tokenizer.json | grep -q 'tokenizer'
- [x] verify: grep -rn 'fts5-cjk' src/ --include='*.ts' 2>/dev/null | wc -l | xargs test 0 -eq

### G6 — JSONL 回放
- [x] verify: test -f tests/fixtures/jsonl-runner.ts
- [x] verify: test -d tests/fixtures/jsonl && ls tests/fixtures/jsonl/*.jsonl > /dev/null 2>&1
- [x] verify: npx tsx tests/fixtures/jsonl-runner.ts tests/fixtures/jsonl/ > /dev/null 2>&1

### 全量验证
- [x] verify: test -f src/l3/tool-guard.ts && test -f src/agent/tool-loop-executor.ts && test -f tests/l3/tool-guard.test.ts
