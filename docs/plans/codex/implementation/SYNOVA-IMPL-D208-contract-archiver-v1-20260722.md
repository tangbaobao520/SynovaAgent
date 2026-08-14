# SynovaAgent -- D208 契约存档器 (Contract Archiver) 实施方案 v1.0

> 2026-07-22 | 权威文档 #17 第三章：契约存档器
> **控制塔 5 组件并行部署 — 第 1/5 项。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：权威文档 #17 Ch3 文件存在（19KB），`scripts/control-tower/` 目录存在
- [x] Get-Content 读取：Ch3 §3.1 提取正则规则 — `export function` / `export class` / `@input` / `@output` / `E-\d{2}` / `src/` / `packages/` 路径模式
- [x] Select-String 验证：Ch3 §4.1 TypeScript Interface 定义完整 (ContractRecord 4 字段 + ExtractedContract 10 字段)
- [x] 引用 — Ch3 §1.1 核心矛盾："Agent 之间的接口契约必须是可被机器消费的 JSON，不能依赖自然语言"

---

## 问题根因

多 Agent 协作时，上游产出的接口（新函数名、Edge ID、文件路径）仅存在于 Markdown 自然语言中。下游 Agent 凭"阅读理解"编码，导致接线断裂（铁律 4）。契约存档器从上游产出中自动提取结构化 contract.json，让下游可以机械验证。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 契约存档器。Python CLI 工具：从 Agent 任务产出 Markdown 中提取接口契约 → 生成结构化 contract.json → 下游 Agent 门禁引擎比对。

### Q1：调研
- Ch3 §3.1：5 条正则提取规则 — export function、export class、@input/@output 注解、E-XX Edge ID、文件路径
- Ch3 §4.1：ContractRecord Schema（10 字段：contractId/type/name/signature/filePath/edgeIds/callerFile/confidence/sourceLine/extractedAt）
- Ch3 §6：下游门禁引擎启动时检查 contract.json → 对比实际 grep 结果 → 不一致报警

### Q2：范围
- 最小：`contract-archiver.py` CLI — `extract` 命令从 Markdown 提取契约 + `validate` 命令对比实际代码
- 不做：不实现创始人 Web 确认界面（Ch3 §5 后续）、不实现 Agent 自动触发（先手工 CLI）

### Q3：验收
- 入口：`python contract-archiver.py extract --input task-output.md --output contract.json`
- 交互：从 D21-FIX dev doc 中提取 → contract.json 包含 `setActionStore`/`createAction`/`ProactivePush` 等契约
- 结果：`python contract-archiver.py validate --contract contract.json` → 对比实际 grep 结果输出 PASS/FAIL

### Q4：契约与测试
- @input：Markdown 文件路径（Agent 任务产出）
- @output：`contract.json`（ContractRecord[]）
- @degraded：输入非 Markdown → 警告 + 空输出；grep 不可用 → 跳过 validate + degraded
- 测试：extract 函数提取(2) + validate 函数对比(2) + edge ID 验证(1) + 路径验证(1) = 6 tests

---

## 构建内容

### 1. scripts/control-tower/contract-archiver.py（新建，约 250 行）

```
class ContractArchiver:
  extract(md_path: str) -> ContractRecord[]
    - 扫描 export function/class 声明
    - 提取 @input/@output/@degraded JSDoc
    - 提取 E-XX Edge ID
    - 提取 src/packages/app 文件路径
    - 计算置信度 (来源行数/唯一性)

  validate(contract_path: str) -> ValidationReport
    - 逐条 grep contract.name 确认函数存在
    - 逐条 grep contract.edgeIds 确认边存在
    - 逐条 Test-Path contract.filePath 确认文件存在
    - 输出 PASS/FAIL + 具体差异

  save(contracts: ContractRecord[], output_path: str) -> void
  load(contract_path: str) -> ContractRecord[]
```

### 2. scripts/control-tower/contract-schema.json（新建，约 40 行）

JSON Schema 定义 ContractRecord 结构，供外部验证。

---

## 不做什么

- 不实现 Web 确认界面（Ch3 §5）
- 不实现 Agent 自动触发（先手工 CLI，后续 hook 集成）
- 不实现置信度 AI 评分（先规则评分）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `extract()` 从 D21-FIX dev doc 提取 → 至少 3 条 ContractRecord (setActionStore/createAction/ProactivePush)
- `extract()` 空 Markdown → 空列表 + warning
- `validate()` 正确 contract → ALL PASS
- `validate()` 错误 contract → FAIL + 差异详情
- Edge ID 验证：E-99（不存在）→ FAIL
- 文件路径验证：nonexistent.ts → FAIL
- 6 个测试，每测试 ≥3 expect()

### L2a：接线测试
- contract-archiver.py 可独立运行（`python contract-archiver.py --help` 退出码 0）

---

## 接线验证（铁律 4）

| 组件 | 触发方式 | 验证方式 |
|------|------|------|
| contract-archiver.py extract | 开发者手工运行 | `python contract-archiver.py extract --help` |
| contract-archiver.py validate | 开发者手工运行 / pre-commit hook 调用 | `python contract-archiver.py validate --help` |
| contract.json | 下游 Agent 门禁读取 | 文件存在于 `.codex/contracts/` |

---

## 完成标准

```
[ ] contract-archiver.py: extract 命令实现（5 条正则规则）
[ ] contract-archiver.py: validate 命令实现（grep 对比）
[ ] contract-schema.json: ContractRecord Schema 定义
[ ] extract 测试：D21-FIX dev doc → ≥3 条 ContractRecord
[ ] validate 测试：正确 contract → PASS / 错误 contract → FAIL
[ ] Edge ID E-99 不存在 → validate FAIL
[ ] 降级：非 Markdown 输入 → warning + 空输出
[ ] 零 as any（Python 无需检查）
[ ] python --help 退出码 0
[ ] ≥6 个测试
```

---

## 权威文档引用

- 权威文档 #17 第三章：契约存档器 — §3.1 提取正则规则 / §4.1 Schema 定义 / §6 下游门禁引擎
- AGENTS.md 铁律 4（接线交付不完整）
- AGENTS.md Iron Law 0-5 错误 #3（不写接线要求）、#5（Edge ID 错误）、#22（引用不存在文件）
