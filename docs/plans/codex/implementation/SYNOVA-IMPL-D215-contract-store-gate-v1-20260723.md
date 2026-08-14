# SynovaAgent -- D215 契约存档器补全 (Contract Store + Gate) 实施方案 v1.0

> 2026-07-23 | 权威文档 #17 第三章 Ch3 §2.2 组件清单 + §6-8 + 接线表 Line 501-504
> **控制塔 Phase 2 — Ch3 剩余 3/5 组件。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/contract-archiver.py` 存在（D208 已交付），`src/agent/diagnosis-launcher.ts` 存在（Ch3 接线表指定集成点）
- [x] Get-Content 读取：Ch3 §2.2 组件清单 68-69 — `contract-store.ts`（读写 .codex/contracts/ 目录）、`contract-gate.ts`（下游 Agent 启动时加载 contract.json 并比对）。Ch3 §7.2 — 门禁引擎自身失败的 4 步处理。Ch3 §8.1 — 存储路径 `.codex/contracts/CONTRACT-{task}-{date}-{seq}.json` + archive/ 子目录
- [x] Select-String 验证：Ch3 接线表 Line 503 — `gateCheck()` 调用方为 `src/agent/diagnosis-launcher.ts` → `launchDownstreamAgent()` 方法
- [x] 引用 — Ch3 §1.1："下游 Agent 凭'阅读理解'这些自然语言来编码，导致接线断链"

---

## 问题根因

D208 contract-archiver.py 解决了"提取契约"（CLI 工具），但没有解决"存储契约"和"消费契约"。Ch3 定义的 5 组件中缺失 3 个：contract-store.ts（持久化）、contract-gate.ts（门禁引擎）、contract-signal.ts（仪表盘信号）。下游 Agent 无法在启动时验证接口契约，接线断裂问题没有机械拦截。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 契约子系统补全。contract-store.ts 持久化契约到 `.codex/contracts/`，contract-gate.ts 在下游 Agent 启动时加载契约并比对实际代码。TypeScript 实现，集成到现有诊断管线（diagnosis-launcher.ts）。

### Q1：调研
- D208 contract-archiver.py：extract → 生成 JSON → save 到文件。contract-store.ts 替代 save/load 逻辑，提供 CRUD API
- Ch3 §8.1：存储路径 `.codex/contracts/CONTRACT-{task}-{date}-{seq}.json` + `archive/` 子目录
- Ch3 接线表 Line 503：`gateCheck()` → `src/agent/diagnosis-launcher.ts` → `launchDownstreamAgent()`
- Ch3 §7.2：门禁引擎自身失败 → catch → log.error → 返回 `{pass: false, reason: 'gate_engine_error', degraded: true}` → 仪表盘红色信号
- D208 contract-schema.json：ContractRecord 10 字段 Schema（contractId/type/name/signature/filePath/edgeIds/callerFile/confidence/sourceLine/extractedAt）

### Q2：范围
- 最小：`src/contract/contract-store.ts`（CRUD）+ `src/contract/contract-gate.ts`（门禁引擎）+ 集成到 diagnosis-launcher.ts（1 行调用）
- 不做：不修改 D208 contract-archiver.py（store 替换 save/load，但 archiver 仍可独立使用）、不建 contract-signal.ts（信号层由后续 D214 共享信号模块统一处理）

### Q3：验收
- 入口：`contractStore.save(contracts)` → 写入 `.codex/contracts/CONTRACT-*.json`
- 交互：diagnosis-launcher.ts `launchDownstreamAgent()` → 调用 `contractGate.validateAll()` → 逐条 grep 验证
- 结果：所有契约通过 → 继续启动；任一失败 → 阻断 + 返回差异清单

### Q4：契约与测试
- @input：ContractRecord[]（store.save）/ contractId（store.load/archive）
- @output：ValidationReport { pass, failures[], degraded }
- @degraded：.codex/contracts/ 目录不可写 → log.warn + degraded；grep 不可用 → degraded
- 测试：store CRUD(3) + gate validate(2) + gate degraded(1) + diagnosis-launcher 集成(1) = 7 tests

---

## 构建内容

### 1. src/contract/contract-store.ts（新建，约 120 行）

```typescript
// 持久化读写 .codex/contracts/ 目录
class ContractStore {
  save(contracts: ContractRecord[], taskId: string): string
    // 生成文件名 CONTRACT-{taskId}-{date}-{seq}.json
    // 写入 .codex/contracts/，自动创建目录
    // 降级：目录不可写 → log.warn + throw

  load(taskId?: string): ContractRecord[]
    // taskId 指定 → 加载该任务最新契约
    // taskId 未指定 → 加载全部未归档契约
    // 降级：JSON 损坏 → log.error + 跳过该文件

  archive(contractId: string): void
    // 移动到 archive/ 子目录
    // 降级：移动失败 → log.warn

  list(): string[]
    // 列出所有未归档的契约文件名
}
```

### 2. src/contract/contract-gate.ts（新建，约 100 行）

```typescript
// 下游 Agent 启动时加载并验证契约
class ContractGate {
  constructor(private store: ContractStore) {}

  async validateAll(): Promise<ValidationReport>
    // 加载全部未归档契约 → 逐条 grep 验证
    // 验证规则（与 D208 contract-archiver.py validate 一致）：
    //   export_function → grep "function NAME\|export function NAME" src/
    //   export_class → grep "class NAME\b" src/
    //   edge_id → grep NAME extensions/ontology/edge-types/ extensions/sentinels/ packages/ontology/
    //   file_path → fs.existsSync(path)
    // 任一失败 → ValidationReport { pass: false, failures[] }
    // 降级：grep 不可用 → degraded: true + 继续（不阻断）

  async validateOne(contract: ContractRecord): Promise<ValidationItem>
    // 单条契约验证
}
```

### 3. 修改 src/agent/diagnosis-launcher.ts — 集成门禁（1 行）

在 `launchDownstreamAgent()` 方法开头追加：

```typescript
// D215: 契约门禁 — 启动前验证跨 Agent 接口契约
const gate = new ContractGate(new ContractStore());
const validation = await gate.validateAll();
if (!validation.pass && !validation.degraded) {
  throw new Error(`契约门禁未通过: ${validation.failures.length} 项失败`);
}
```

### 4. TypeScript 类型定义（追加到现有 contract-schema 或新建 types.ts）

复用 D208 contract-schema.json 的 ContractRecord 接口，转为 TypeScript：

```typescript
interface ContractRecord {
  contractId: string;
  type: 'export_function' | 'export_class' | 'edge_id' | 'file_path' | 'api_endpoint';
  name: string;
  signature: string;
  filePath?: string;
  edgeIds?: string[];
  callerFile?: string;
  confidence: number;
  sourceLine: number;
  extractedAt: string;
}

interface ValidationReport {
  pass: boolean;
  failures: ValidationItem[];
  degraded: boolean;
  checkedAt: string;
}
```

---

## 不做什么

- 不修改 D208 contract-archiver.py（保持独立 CLI 工具可用）
- 不建 contract-signal.ts（D214 共享信号模块统一处理）
- 不实现创始人 Web 确认界面（Ch3 §5 — 后续任务）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- store.save() → 文件写入 `.codex/contracts/` + 返回正确文件名
- store.load(taskId) → 返回该任务契约列表
- store.archive(contractId) → 文件移动到 archive/
- gate.validateAll() — 全部通过 → { pass: true, failures: [] }
- gate.validateAll() — edge ID 不存在 → { pass: false, failures: [E-99] }
- store 降级：目录不可写 → throw + 日志
- gate 降级：grep 不可用 → degraded: true + 不阻断
- 7 个测试，每测试 ≥3 expect()

### L2a：接线测试
- diagnosis-launcher.ts 包含 `ContractGate` 引用（grep "ContractGate" src/agent/diagnosis-launcher.ts）
- diagnosis-launcher.ts 包含 `ContractStore` 引用（grep "ContractStore" src/agent/diagnosis-launcher.ts）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| ContractStore | ContractGate (DI) + diagnosis-launcher.ts | grep "ContractStore" src/agent/diagnosis-launcher.ts |
| ContractGate.validateAll | diagnosis-launcher.ts → launchDownstreamAgent() | grep "validateAll\|ContractGate" src/agent/diagnosis-launcher.ts |
| ContractRecord type | contract-store.ts + contract-gate.ts | grep "ContractRecord" src/contract/ |

---

## 完成标准

```
[ ] contract-store.ts: save/load/archive/list 4 方法 + 降级路径
[ ] contract-gate.ts: validateAll/validateOne 2 方法 + grep 验证逻辑
[ ] ContractRecord TypeScript 类型（与 D208 schema 对齐）
[ ] diagnosis-launcher.ts: launchDownstreamAgent() 启动前调用 validateAll()
[ ] 降级: .codex/contracts/ 不可写 → log.warn + throw
[ ] 降级: grep 不可用 → degraded + 不阻断
[ ] 降级: JSON 损坏 → log.error + 跳过该文件
[ ] edge_id grep 搜索路径包含 extensions/ontology/edge-types/（修复 D208 相同 bug）
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] ≥7 个测试: store(3) + gate(2) + degraded(1) + 集成(1)
```

---

## 权威文档引用

- 权威文档 #17 第三章：契约存档器 — §2.2 组件清单(68-69) / §7.2 门禁引擎失败处理 / §8.1 存储路径与生命周期 / 接线表 501-504
- D208 dev doc + contract-archiver.py + contract-schema.json（ContractRecord 定义）
- AGENTS.md 铁律 4（接线交付不完整）、铁律 24（异常处理审计）、铁律 31（降级信号传播）
