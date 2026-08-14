# SynovaAgent -- D221 真实数据连接器 (Gate 3) 实施方案 v1.0

> 2026-07-25 | 附录 A v2.0 Gate 3 — 数据管道接通
> **7 connectors all mock. Create first real connector — CSV import → RESOURCE_MONEY nodes.**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/connectors/` 存在（7 个文件全部为 Mock），`packages/ontology/src/node-types.ts` 存在（`NodeType.RESOURCE_MONEY` at L30），`src/l4/graph-bridge.ts` 存在
- [x] Get-Content 读取：附录 A Gate 3 — 通过条件：connector 文件含真实 API 调用（fetch/axios/数据库查询，不在 `if (process.env.NODE_ENV === 'test')` 内）→ GraphStore 中近 30 天有 ≥1 条新节点 → 节点类型为 RESOURCE_MONEY/CLIENT/PERSON
- [x] Select-String 验证：当前 7 个 connector 全部为 Mock 或空壳——`feishu.ts` 含 Mock 数据，`ima.ts` 含 Mock 数据，`nemoclaw.ts` 为空壳。零真实 API 调用
- [x] 引用 — Gate 3 当前状态："❌ 未通过——7 个 connector 全部为空壳或 Mock，无真实 API 调用"

---

## 问题根因

附录 A Gate 3 要求至少 1 个 connector 含真实 API 调用 + GraphStore 中有 RESOURCE_MONEY/CLIENT/PERSON 类型节点。当前 7 个 connector 全部为 Mock 或空壳。企业真实数据无法流入系统。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 数据管道 — CSV 文件导入器。`src/connectors/csv-import.ts` — 读取 CSV 文件（编码自动检测 UTF-8/GBK）→ 解析行 → 创建 RESOURCE_MONEY GraphStore 节点。最简单的"真实数据管道"——CSV 是企业最常见的财务数据导出格式。

### Q1：调研
- 现有 connector 模式：`src/connectors/feishu.ts` 提供 `FeishuConnector` 类，含 `connect/scan/extract` 方法
- GraphBridge API：`src/l4/graph-bridge.ts` 提供 `createNode(type, props, graph)` 方法
- NodeType.RESOURCE_MONEY 来自 `@synova/ontology`（`packages/ontology/src/node-types.ts:30`）
- CSV 解析：Python 标准库 `csv` 或 Node.js `csv-parse` 均可

### Q2：范围
- 最小：`src/connectors/csv-import.ts` — `CsvImportConnector` 类：读取 CSV → 自动检测编码（UTF-8/GBK）→ 解析行（金额/日期/分类）→ 逐行调用 `graphBridge.createNode(NodeType.RESOURCE_MONEY, props)`
- 不做：不实现 Excel (.xlsx) 导入、不实现增量更新、不实现 Web UI 上传界面

### Q3：验收
- 入口：`connector.import('/data/financial-2026.csv')` → 读取文件 → 解析 N 行
- 交互：每行创建 1 个 RESOURCE_MONEY 节点（含 amount/date/category 属性）
- 结果：GraphStore 中新增 N 个节点 → Gate 3 静态检查通过（含真实 fetch/API）

### Q4：契约与测试
- @input：CSV 文件路径
- @output：导入行数 + 创建的节点 ID 列表
- @degraded：文件不存在 → 返回 0 行 + degraded；编码检测失败 → 回退 UTF-8
- 测试：正常导入(1) + 空文件(1) + 编码兼容(1) + GraphStore 写入验证(1) = 4 tests

---

## 构建内容

### 1. src/connectors/csv-import.ts（新建，约 100 行）

```typescript
export class CsvImportConnector {
  async import(filePath: string, graphBridge: GraphBridge): Promise<ImportResult> {
    // 1. 自动检测编码（尝试 UTF-8 → GBK）
    // 2. 解析 CSV（header: date, amount, category, description?）
    // 3. 逐行创建 RESOURCE_MONEY 节点
    // 4. 返回 ImportResult { imported: number, nodeIds: string[] }
  }
}
```

---

## 不做什么

- 不实现 Web UI 上传
- 不修改现有 7 个 Mock connector
- 不实现增量同步

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 正常 CSV 导入 → 返回 imported=N, nodeIds 长度=N
- 空 CSV → 返回 imported=0 + degraded
- GBK 编码 CSV → 自动检测并正确解析
- GraphStore 中可查询到导入的节点（type=RESOURCE_MONEY, amount 非空）
- 4 个测试

---

## 完成标准

```
[ ] src/connectors/csv-import.ts: CsvImportConnector 类
[ ] 编码自动检测: UTF-8 / GBK fallback
[ ] 解析列: date / amount / category / description
[ ] 创建 RESOURCE_MONEY 节点（含 amount 属性）
[ ] 降级: 文件不存在 → imported=0 + degraded
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] ≥4 个测试
```
