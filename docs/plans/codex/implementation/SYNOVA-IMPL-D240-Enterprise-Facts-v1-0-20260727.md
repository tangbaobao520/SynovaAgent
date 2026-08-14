<!-- SYNOVA-IMPL-D240 v1.0 | 2026-07-27 | P0 | Auth Doc #18 Module 2+3 -->
# SynovaAgent -- D240 企业事实治理 + 三层记忆迁移 v1.0
> P0 | 权威文档 #18 模块二+三 + 修正补丁 | 代码差距 #5/#6/#7/#9 (4 gaps)
> 企业事实当前无 status/version/approval, 全部存在 SQL 而非文件

## 权威文档验证

模块二补丁 §修正一: "agent_memory 表 type: enterprise_fact → .codex/enterprise/facts/{category}/{key}.md"
模块二 §四: 事实生命周期 "pending → 管理员审核 → active → 注入专家提示词"
模块二 §六: "每次UPDATE不覆盖旧值——新建一行, 通过version_id链指向前一版本"
模块三修正版 §一: "组织记忆=.codex/enterprise/facts/ (文件驱动), 部门记忆=.codex/enterprise/departments/ (文件驱动), 个人记忆=agent-memory-store.ts (SQLite)"

代码验证:
- agent-memory-store.ts: MemoryEntry 类型有 version/supersededBy/changeReason 字段但 SQL schema 无对应列——半成品
- 无 status 字段 (pending/active/conflicted) ❌
- 三个写入入口 (runner.ts/actions-api.ts/workspace-context-bridge.ts) 直接写 active ❌
- 无 .codex/enterprise/facts/ 目录 ❌
- expert-file-loader.ts 已支持从文件加载企业事实 (_enterpriseFacts 注入) ✅

## Q0-Q4
Q0: 企业事实是注入到专家 prompt 顶部的硬约束。当前无治理——系统自动产生的事实和管理员确认的事实同权，无版本追踪，无冲突检测。存储介质与行业相反 (Hermes/Claude Code/Codex 全部文件驱动)。
Q1: 行业对标——Hermes .hermes/memory/ 五目录结构, Claude Code .codex/signals/ 文件驱动。文件天然 git 版本化+人工可编辑。
Q2: 做——创建 .codex/enterprise/facts/ 目录结构；新增 EnterpriseFactStore (文件读写)；新增 FactApprovalService (pending→active)；新增 ConflictScanner (同category 数值矛盾检测)；agent-memory-store 保留个人记忆。不做——管理员审批 UI(归 D241)、部门记忆 (归 Phase 2)。
Q3: 入口: 系统写入 .codex/enterprise/facts/{category}/{key}.md (status=pending) → 管理员查看待审批列表 → 确认(status=active) 或驳回 → expert-file-loader 扫描 active 文件注入专家。结果: 企业事实有生命周期+版本追踪+冲突检测。
Q4: 降级——文件写入失败 → 回退到 SQL agent_memory 表 + degraded=true。git 不可用 → 跳过版本追踪。L1 单元测试 + L2a 集成测试。

## 改动清单

### 1. scripts/control-tower/enterprise-fact-store.ts — 新建 (~150行)
企业事实文件 CRUD: createFact(category,key,content,metadata) → .md 文件
readFact(category,key) → { content, metadata } | null
listPendingFacts(): Fact[] / approveFact(key) / rejectFact(key,reason)
文件格式: YAML front matter (key/category/status/confidence/source/version) + Markdown body

### 2. scripts/control-tower/fact-approval-service.ts — 新建 (~80行)
扫描 .codex/enterprise/facts/ 下 status=pending 的文件
审批: pending→active (更新 front matter status + 追加 approved_by/approved_at)
驳回: pending→rejected (更新 front matter + rejected_reason)

### 3. scripts/control-tower/conflict-scanner.ts — 新建 (~100行)
定时扫描 (cron 每日或手动触发): 同 category 下 active 文件数值矛盾检测
冲突标记: 文件末尾追加 <!-- CONFLICT --> HTML 注释
冲突信号: emitSignal('enterprise-facts', 'red', 'N conflicts detected')

### 4. src/l4/agent-memory-store.ts — 修改 (保留个人记忆)
新增 status 字段到 MemoryEntry 类型 + SQL schema
enterprise_fact 类型写入时同步写文件 (双写过渡, SQL 为降级回退)
保留所有非 enterprise_fact 类型的记忆在 SQL

### 5. expert-file-loader.ts — 修改 (已有 _enterpriseFacts 注入, 微调)
确认只加载 status=active 的 .md 文件
status=pending/conflicted 文件不注入

## 测试要求
| # | 层级 | 测试 | 验证 |
|---|------|------|------|
| 1 | L1 | EnterpriseFactStore 创建/读取/列表 .md 文件 | 单元 |
| 2 | L1 | FactApprovalService pending→active→rejected | 单元 |
| 3 | L1 | ConflictScanner 检测同 category 数值矛盾 | 单元 |
| 4 | L1 | agent-memory-store status 字段持久化 | 单元 |
| 5 | L2a | 完整事实生命周期: 写入→pending→审批→active→注入 | 集成 |
| 6 | L2a | 文件写入失败 → SQL 降级 | 集成 |

## 接线验证
| 新文件 | 调用方 | 验证 |
|--------|--------|------|
| enterprise-fact-store.ts | agent-memory-store.ts (双写) | grep |
| fact-approval-service.ts | admin 审批 API (D241) | grep |
| conflict-scanner.ts | CronScheduler | grep |
| .codex/enterprise/facts/ | expert-file-loader.ts | Test-Path |

## 完成标准
| 标准 | 验证 |
|------|------|
| .codex/enterprise/facts/ 目录存在, 含至少 1 个 category 子目录 | Test-Path |
| enterprise_fact 类型写入时生成 .md 文件 (双写) | 代码+手动 |
| status 字段 (pending/active/conflicted) 在 MemoryEntry 和 SQL 中 | 代码确认 |
| 冲突检测函数存在 + 测试通过 | vitest |
| expert-file-loader 只加载 status=active 事实 | 代码确认 |
| 6 tests 通过 | vitest run |
| tsc --noEmit 零新增 | CI |
| as any = 0 | pre-commit |
