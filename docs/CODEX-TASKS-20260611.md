# Codex 任务清单 — 2026-06-11

> 项目：SynovaAgent（synova-agent）
> 分支：feat/phase0-diagnosis-demo（当前工作分支，Codex 请从 main 创建自己的分支）
> 上下文：Phase 1 代码纪律 — 从全量对齐手册第 20 章拆出
> 铁律文档：docs/CODEX-WORKFLOW.md（每次任务前必读）

---

## 任务 A：P1-3 删除空壳模块

**目标**：删除 compute 直接 return null 的占位模块

| # | 文件 | 证据 | 行数 |
|---|------|------|------|
| A1 | `packages/engine-core/src/pipeline/diagnosis/compliance-check.ts` | `compute: async (_teamId: string) => { return null; }` (line 94) | 95 |
| A2 | `packages/engine-core/src/pipeline/diagnosis/location-impact.ts` | `compute: async (_teamId: string) => { return null; }` (line 146) | 147 |

**执行步骤**：
```
[ ] 1. 删除文件: rm <文件路径>
[ ] 2. 清除引用: grep -rn "compliance-check\|location-impact" packages/engine-core/ src/
     → 每处判断：删除 import？替换为默认值？记录到 commit message
[ ] 3. 编译验证: npx tsc --noEmit → 确认零新增错误
[ ] 4. 独立 commit: "chore: 删除空壳模块 compliance-check / location-impact"
```

**Done 标准**：文件已删除 + 引用已清 + tsc 零错误

---

## 任务 B：P1-5 修复 4 处跨层违规

**目标**：每层只与相邻层通信。以下 4 处均存在跨层直接访问。

### B1：graph-store.ts — L4 直接操作 SQL DELETE

| 项目 | 内容 |
|------|------|
| 文件 | `packages/engine-core/src/pipeline/diagnosis/graph-store.ts` |
| 定位 | `grep -n "DELETE FROM graph_nodes" <文件>` |
| 违规 | L4 本体层直接执行 SQL，应通过 L5 StorageBackend 抽象 |
| 修复 | 将 DELETE 操作委托给注入的 StorageBackend 实例，不直接拼接 SQL |

### B2：pipeline-config.ts — L3 含 HTTP 配置

| 项目 | 内容 |
|------|------|
| 文件 | `packages/engine-core/src/pipeline-config.ts` |
| 违规 | L3 洞察层不应管理 HTTP 通信参数（LLM_TIMEOUT_MS 等） |
| 修复 | HTTP 相关环境变量读取移到 `src/config.ts`（L1/L2），pipeline-config.ts 改为接收配置参数 |

### B3：diagnosis-error.ts — getHttpStatus() 在 L4

| 项目 | 内容 |
|------|------|
| 文件 | `packages/engine-core/src/pipeline/diagnosis/diagnosis-error.ts` |
| 定位 | `grep -n "getHttpStatus\|HttpStatus\|status.*4\d\d\|status.*5\d\d" <文件>` |
| 违规 | L4 本体层含 HTTP 状态码映射，应属于 L1 交互层 |
| 修复 | 将 getHttpStatus() 移到 `src/routes/` 或 `src/l1-interaction/`，L4 只返回错误码字符串 |

### B4：task-store.ts — require() 调用

| 项目 | 内容 |
|------|------|
| 文件 | `packages/engine-core/src/task-store.ts` |
| 定位 | `grep -n "require(" <文件>` |
| 违规 | CJS require() 硬编码依赖 |
| 修复 | 改为参数注入：`new TaskStore(db: Database)` 而非内部 require |

**执行步骤（每个独立）**：
```
[ ] 1. 读懂违规代码上下文
[ ] 2. 做出最小改动修复跨层访问
[ ] 3. grep 确认无新增跨层引用
[ ] 4. npx tsc --noEmit
[ ] 5. 独立 commit: "fix: 跨层违规 — L4 graph-store 不再直接 DELETE SQL"
```

**Done 标准**：每处独立修改 + 独立 commit + tsc 零错误

---

## 任务 C：P1-6 修复 L1 路由直接 SQL 导入

**目标**：L1 路由不得直接 import better-sqlite3，必须通过 L4/L5 注入接口

### C1：review.ts — 删除直接数据库导入

| 项目 | 内容 |
|------|------|
| 文件 | `src/routes/review.ts` |
| 行 | line 3 |
| 违规代码 | `import Database from 'better-sqlite3'` |
| 现有合法入口 | `import { getDatabase } from '../init/engine-context'` (line 4) |
| 修复 | 删除 line 3，所有数据库操作改为 `getDatabase()`。如需 L4 查询能力 → 通过 KnowledgeStore 接口 |

### C2：sessions.ts — 删除直接数据库导入

| 项目 | 内容 |
|------|------|
| 文件 | `src/routes/sessions.ts` |
| 行 | line 11 |
| 违规代码 | `import Database from 'better-sqlite3'` |
| 现有合法入口 | `import { getDatabase } from '../init/engine-context'` (line 14) |
| 修复 | 删除 line 11，所有会话操作通过 SessionStore |

**执行步骤（每个独立）**：
```
[ ] 1. 读文件理解所有 Database 实例使用位置
[ ] 2. 将 import Database 替换为 getDatabase() 调用
[ ] 3. 如路由需要的能力 L4 未提供 → 先在 L4 补接口，再改 L1（不给 L1 开 SQL 后门）
[ ] 4. npx tsc --noEmit
[ ] 5. 接线审计: grep 新接口名 src/server.ts src/routes/
[ ] 6. 独立 commit: "fix: L1 路由 review/sessions 不再直接 import SQLite"
```

**Done 标准**：L1 零直接 SQL import + tsc 零错误 + 接线通过

---

## 执行顺序建议

```
第 1 批 (互不依赖，可并行):
  任务 A1/A2 (删空壳)
  任务 C1 (review.ts)
  任务 C2 (sessions.ts)

第 2 批 (独立，每处独立 commit):
  任务 B1 → B2 → B3 → B4
```

---

## 每批做完后的检查

```bash
# 全部执行（Codex 自检）
npx tsc --noEmit                  # 编译零错误
grep -rn "as any" src/ --include="*.ts" | grep -v ".test." | grep -v ".d.ts" | grep -v "//.*as any"  # 应零输出
bash scripts/check-secrets.sh     # 应全绿
```

---

> 创建时间: 2026-06-11
> 创建者: Claude Code
> 分配给: Codex
> 相关文档: CODEX-WORKFLOW.md、CLAUDE.md、全量对齐手册
