# SynovaAgent 交付执行入口
> 给编码 Claude Code 的完整上下文
> 来源: 12 份研究报告 (docs/research/) + MASTER-REPORT
> 时间: 2026-06-04 · 7 天交付计划

## 0. 必须先读的文档（按顺序）

1. `CLAUDE.md` — 40 条铁律（尤其是铁律 0-2 测试先行、铁律 1-7 接线铁律、铁律 35 自动化优先）
2. `MASTER-REPORT-审计架构模块化综合报告-20260603.html` — L1-L5 权威架构、模块化方案、执行路线
3. `docs/research/DEVELOPMENT-PLAN-7DAYS.html` — **7 天交付的完整任务清单（36 个任务），作为执行主文档**
4. `docs/research/SYNOVA-COMPREHENSIVE-RESEARCH-REPORT.html` — 总论（薄弱环节矩阵、跨层问题）
5. `docs/research/DEEPSEEK-V4-OPTIMIZATION.html` — DeepSeek V4 架构适配

## 1. 已完成的修复（不需要再做）

- `src/providers/deepseek.ts` — 默认模型 deepseek-chat → deepseek-v4-flash ✅
- `src/config.ts` — 默认模型名更新 ✅
- `src/agent/conversation-engine.ts` — 修复 generateCommunityReports + resolveEntitiesL3 import 崩溃 ✅
- `src/expert-platform/types.ts` — 修复孤立注释编译错误 ✅
- `src/providers/index.ts` — Provider 标签更新 ✅
- `../packages/extension-registry/src/types.ts` — 修复孤立注释 ✅

## 2. 技术栈决策速查

| 模块 | 语言 | 理由 |
|------|------|------|
| L1 交互层（Web/TUI/SSE） | TypeScript | Express + 前端 TS 天然适合 |
| L2 编排层（状态机/EventBus/ConversationEngine） | TypeScript | 核心流程控制，TDD 友好 |
| L3 专家 Agent（ReAct 循环） | TypeScript | 调 LLM API 为主 |
| L3 因果推断 / 社区检测 | Python | statsmodels / networkx，TS 无可替代生态 |
| L4 GraphStore / SOG Schema | TypeScript | better-sqlite3 同步操作 |
| L4 中文实体解析 | Python（拼音 TS 垫底） | sentence-transformers |
| L5 飞书/GitHub/Jira 连接器 | Python | 官方 SDK 成熟 |
| L5 知识摄取 PDF | TypeScript | 先用 @synova/knowledge-ingest |
| 跨层 ToolRegistry / ExtensionRegistry | TypeScript | 注册中心逻辑 |
| Python Bridge 通信 | 子进程 spawn stdin/stdout JSON | 同 Docker 容器内 |
| 部署 | Docker 单容器（Node 20 + Python 3.12） | on-prem 最小化运维 |

## 3. 接线验证速查（每个任务完成后执行）

```bash
# 通用接线验证命令
grep -rn "<新函数名>" src/ --include="*.ts" | grep -v "test" | grep -v "\.d\.ts"
# 零结果 = 未接线 = 任务未完成
```

## 4. 质量门禁（每次声称完成前执行）

```bash
npx tsc --noEmit
npx vitest run
npm run check:iron-laws
# 三道门禁全绿后才算完成
```

## 5. 关键发现汇总（避免重复踩坑）

### 🚨 运行时崩溃（必须优先修复）
1. `conversation-engine.ts:265` — generateCommunityReports 只导入了类型 ✅ 已修复
2. `conversation-engine.ts:277` — resolveEntitiesL3 只导入了类型 ✅ 已修复
3. `routes/chat.ts:183` — `split('\\n')` 应为 `split('\n')`
4. `tool-loop-executor.ts` — streamWithToolLoop 绕过所有 hooks

### 🏗️ 架构断层
1. **两层编排系统并存**：ConversationEngine（生产中） + DiagnosisOrchestrator（~600行，从未接线）
2. **L4 三大致命断层**：图存储未被诊断管线调用、图构建手动触发、图查询未优化
3. **5 个连接器全是存根**：含 TypeScript 编译错误

### 🛡️ 降级信号链（4 个断点）
- L4 模块 `degraded: true` → L2 路由检查标记 → SSE 事件 → 前端 DegradedBanner
- 当前全线断裂，需要逐个修复

### 💰 最大成本优化机会
- DeepSeek Prefix Cache：不可变前缀 + 只追加日志 → 50 倍输入降价
- 默认模型：deepseek-v4-flash（$0.14/1M input，缓存命中 $0.0028/1M）

## 6. 联系方式

本研究报告由研究智能体完成，编码由执行智能体完成。如有架构层级的疑问，参照 MASTER-REPORT 的架构决策（8 项冻结决策）执行，不得自行取舍。
