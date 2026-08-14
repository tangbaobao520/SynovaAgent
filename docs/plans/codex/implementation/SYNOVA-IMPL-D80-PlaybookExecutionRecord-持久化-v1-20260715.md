# SynovaAgent — D80 PlaybookExecutionRecord+持久化 实施方案 v1.0

> 2026-07-15 | 第12份权威文档（Skill-Tool体系研究）第三章 §5
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

- D65: Skill/Tool注册中心 ✅
- D66: 41个内置Skill清单 ✅
- D67: Playbook加载器 ✅ — `src/playbook/playbook-loader.ts` 已实现
- D68: Tool原子化验证 ✅
- `src/playbook/playbook-types.ts` — PlaybookDefinition接口已存在，但**不含PlaybookExecutionRecord**
- PlaybookExecutionRecord: **零存在** — 全部新建
- 权威文档12 §5完整定义了15字段接口（含stepResults/crossExpertInteractions/finalOutput/tokenUsage）
- 持久化: L5 SQLite `playbook_executions` 表，保留90天

---

## 做了什么

### 1. src/playbook/playbook-types.ts — 追加PlaybookExecutionRecord接口（修改）

在现有PlaybookDefinition接口后面追加完整的 `PlaybookExecutionRecord`:

```typescript
export interface PlaybookExecutionRecord {
  executionId: string;
  playbookId: string;
  playbookVersion: string;
  enterpriseId: string;
  triggerType: "sentinel" | "cron" | "manual" | "event";
  triggerDetail: { sentinelId?: string; severity?: string; manualBy?: string };
  startTime: string; endTime: string; durationMs: number;
  appliedOverrides: Record<string, unknown>;
  
  stepResults: Array<{
    stepId: string; stepIndex: number; expert: string;
    toolCalled: string; startTime: string; endTime: string; durationMs: number;
    status: "success" | "degraded" | "skipped" | "failed" | "halted";
    output?: { evidenceRefs?: string[]; confidence?: number; summary?: string };
    error?: { code: string; message: string; retryable: boolean };
    retryCount: number;
  }>;
  
  crossExpertInteractions: Array<{
    fromExpert: string; toExpert: string;
    interactionType: "RequestValidation" | "Endorse" | "Challenge";
    timestamp: string; findingRef: string;
  }>;
  
  finalOutput: {
    reportRef: string; confidence: number;
    degradedSteps: number; failedSteps: number;
  };
  
  tokenUsage: { totalInput: number; totalOutput: number };
  costEstimate: number;
}
```

### 2. src/playbook/execution-store.ts — 执行记录持久化（新建）

```typescript
// L5 SQLite存储，保留90天
createExecutionRecord(record: PlaybookExecutionRecord): Promise<string>  // 返回executionId
getExecutionRecord(executionId: string): Promise<PlaybookExecutionRecord | null>
listExecutionsByPlaybook(playbookId: string, limit?: number): Promise<PlaybookExecutionRecord[]>
listExecutionsByEnterprise(enterpriseId: string, limit?: number): Promise<PlaybookExecutionRecord[]>
cleanExpiredRecords(): Promise<number>  // 删除 >90天记录，返回删除数
```

**DDL**: 
```sql
CREATE TABLE IF NOT EXISTS playbook_executions (
  execution_id TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL,
  enterprise_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  status TEXT NOT NULL,
  record_json TEXT NOT NULL,  -- 完整JSON
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_playbook_executions_playbook ON playbook_executions(playbook_id);
CREATE INDEX idx_playbook_executions_enterprise ON playbook_executions(enterprise_id);
CREATE INDEX idx_playbook_executions_created ON playbook_executions(created_at);
```

### 3. D67 playbook-loader.ts 集成（修改）

在PlaybookLoader执行完成后调用 `createExecutionRecord()` 写入执行轨迹。

---

## 不做什么

- 不修改PlaybookDefinition接口（只追加新接口）
- 不修改D67 loader核心逻辑（只在执行后增加记录写入）
- 不实现前端查询界面

---

## 架构层

L5（存储层: `src/playbook/execution-store.ts` SQLite持久化）+ L4（本体层: `src/playbook/playbook-types.ts` 类型定义）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | playbook-types.ts 追加接口 | 0.5h | playbook-types.ts |
| 2 | execution-store.ts | 2h | execution-store.ts |
| 3 | playbook-loader.ts 集成 | 0.5h | playbook-loader.ts |
| 4 | 测试文件 | 1.5h | tests/playbook/execution-store.test.ts |

**总工时: 4.5h（半天）**

---

## 完成标准

```
[ ] playbook-types.ts: PlaybookExecutionRecord 15字段完整接口
[ ] execution-store.ts: DDL建表+3索引
[ ] execution-store.ts: createExecutionRecord — 写入SQLite
[ ] execution-store.ts: getExecutionRecord — 查询单条
[ ] execution-store.ts: listExecutionsByPlaybook/Enterprise — 查询列表
[ ] execution-store.ts: cleanExpiredRecords — 删除>90天
[ ] playbook-loader.ts: 执行完成后调用createExecutionRecord
[ ] 降级: SQLite写入失败→log.warn+不阻断Playbook执行
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=10测试: store 6(创建/查询/列/企业/清理/空) + 类型 2(完整/最小) + 集成 2(loader写入/降级)
```

---

## 权威文档引用

- 第12份权威文档: Skill-Tool体系研究 第三章 §5（PlaybookExecutionRecord）
  - 15字段完整接口定义
  - 存储: L5 SQLite playbook_executions表, 保留90天
  - stepResults含每个step的完整审计轨迹(expert/tool/status/duration/error)
  - crossExpertInteractions含专家间交互(validate/endorse/challenge)
  - finalOutput含报告引用+退化统计+专家贡献度