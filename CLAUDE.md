# CLAUDE.md — SynovaAgent 组织智能诊断

> 独立 Agent 进程。六阶段诊断 → 组织数字孪生 → 持续进化。
> 不依赖 Novis/ClawOrg 桌面端、Gateway 或前端。

---

## ⚠️ 每次工作前必读 — 铁律速览

> 以下铁律来自 2026-05 至今的全部实际错误。按优先级排列。

### 零、协作与流程

**铁律 0. 协作对齐前置——先对齐再动手，禁止假设共识。**

**铁律 0-2. 测试先行 + 接线验收——spec → test → impl → wire → review → merge。**
Step 5 WIRE CHECK 是硬门禁：`grep -rn "新函数名" src/` — 零结果 = 未完成。
历史：4 次接线失败（组件通过单元测试但从未被生产代码调用）。

### 一、接线铁律

**铁律 1. 垂直切片交付。** 按用户可见的行为拆，不按技术层拆。
**铁律 4. 交付不完整——写了代码没接线。** 入口 → 交互 → 结果，三环节缺一不可交付。
**铁律 5. 后端能力 ≠ 用户可用的功能。** 追踪调用链：谁 import？谁调用？结果在哪呈现？
**铁律 7. 每次接受任务确认 Done 标准。** 默认：入口可触达 + 完整链路走通 + 结果可见。

### 二、代码质量

**铁律 8. Mock/TODO 不留到交付代码。** pre-commit 硬阻断。
**铁律 9. 关键变更 grep 全仓库传播。** 改完核心定义后检查所有引用。
**铁律 11. 静默降级禁止。** catch 必须 `log.warn/error` + 返回 `degraded: true`。pre-commit 警告存量。
**铁律 12. 集成测试 cover 真实路由，不 mock 管线。**

### 三、错误处理与降级

**铁律 24. 异常处理审计——写 catch 时必须确认：**
- [ ] 有 log.error/warn（不能空吞）
- [ ] 返回 degraded: true（后端）或显示错误 UI（前端）
- [ ] 区分 ENOENT（正常默认）和 JSON.parse 失败（打 log + degraded）

**铁律 31. 降级信号传播。** 每个可独立失败的模块必须返回 degraded 标记，调用方检查，前端展示。
**铁律 32. 错误分类强制。** catch 块包装为 `.code` + `.phase` + `.retryable` 的 Error 子类。

### 四、自动化优先

**铁律 35. 自动化优先。** 能变 tsc/oxlint/ESLint 规则的不靠文档，能写 check-*.sh 的不靠 review。
**铁律 33. 测试命名约定。** `*.test.ts` (单元) / `*.integration.test.ts` (集成) / `*.e2e.test.ts` (E2E)。
**铁律 34. Feature Branch 强制。** `feat/` `fix/` `chore/` 分支，禁止直接在 main 上 commit。
**铁律 36. vitest 必须全量通过。** 零失败才合并。
**铁律 37. Dead code 入仓库即违规。** 删除旧文件 + grep 零引用确认。

### 五、类型安全与架构

**铁律 38. `as any` 零容忍。** 47 次历史教训。pre-commit 硬阻断，`as any` 代码中零存在。
替代：内联类型 `as { field?: string }` / `Record<string, unknown>` / `unknown` + 类型守卫。

**铁律 39. 五层架构边界。** 每层只与相邻层通信：
```
L1 交互 (TUI/CLI/Web) → L2
L2 编排 (ConversationEngine) → L1 + L3
L3 洞察 (ExpertAutonomy/Corroboration) → L2 + L4
L4 本体 (GraphBridge/GraphStore) → L3 + L5
L5 存储 (SQLite) → L4
```
pre-commit `check-architecture.sh` 检测 L2→L4 / L3→L5 跨层违规。

---

## 项目身份

**产品**: SynovaAgent — 组织数字孪生诊断引擎
**定位**: 独立 Agent 进程，通过 HTTP API + MCP 对外服务
**市场**: 5-300 人团队的组织诊断

**五层架构**:
```
src/
├── l1-interaction/   L1 交互层 (ViewAdapter 接口)
├── agent/            L2 编排层 (ConversationEngine, ToolLoop)
├── l3/               L3 洞察层 (ExpertAutonomy, QualityFirewall)
├── l4/               L4 本体层 (GraphBridge, EntityResolver, CommunityReports)
├── orchestrator/     L2-L3 桥接 (SubAgentCoordinator, ModuleRunner)
├── providers/        LLM Provider (DeepSeek, OpenAI, Gateway)
├── routes/           HTTP API (diagnosis, ontology, sessions, chat)
├── store/            持久化 (SessionStore)
├── cron/             定时任务 (CronScheduler)
├── evidence/         证据引擎 (Collector, Corroboration)
├── security/         安全 (PIIScrubber, DataBoundary)
├── tui/              TUI 终端界面 (neo-blessed)
├── mcp/              MCP 协议服务
└── services/         基础设施 (update-checker)
```

**引擎依赖**: `../server/vendor/@synova/engine-core/` (772 文件，动态 import 加载)

---

## 常用命令

```bash
npm run dev              # 开发模式 (tsx src/index.ts)
npm run test             # 全量测试 (vitest run)
npm run tui              # TUI 终端界面
npm run lint             # TypeScript 检查 (tsc --noEmit)
npm run check:iron-laws   # 铁律门禁 (6 硬阻断)
npm run check:architecture # 架构边界检查
npm run check:all         # pre-push 全部门禁 (tsc + vitest + iron-laws)
npm run hooks:install     # 安装 Git hooks
npm run workflow:start    # 任务启动检查点 (开始写代码前)
npm run workflow:impl     # 实现完成检查点 (声称完成前)
npm run workflow:design   # 设计对齐检查点 (写代码前)
npm run workflow:deploy   # 部署后验证
```

---

## ⚡ Anthropic 工程工作流 (7 节点自动触发)

> 详细设计: `docs/workflow/ANTHROPIC-WORKFLOW.md`

### 触发机制

```
① 任务开始 → AI 自律 (CLAUDE.md 指令)
② 设计完成 → 人工触发
③ 实现完成 → AI 自律 (CLAUDE.md 指令) ← 最关键
④ 提交前   → Git Hook (.git/hooks/pre-commit)
⑤ 推送前   → Git Hook (.git/hooks/pre-push)
⑥ 部署后   → 人工触发
⑦ 线上     → Cron
```

### AI 自律指令 (每次启动自动执行)

```
⚠️ 每次接受新任务时，必须先执行:
   bash scripts/workflow/task-start.sh "任务描述"
   → 生成 Task Brief → 确认用户旅程 → 确认 Done 标准 → 才能写代码

⚠️ 声称"完成"之前，必须执行:
   bash scripts/workflow/checkpoint-impl.sh <新函数名>
   → 接线审计 → 测试全绿 → tsc 零错误 → 铁律门禁 → 才能 commit

⚠️ 每次 git push 成功后，必须提醒:
   "部署已完成。请运行: bash scripts/workflow/checkpoint-deploy.sh [服务器URL]"
```

### 人工触发命令

```bash
# 节点 ②: 设计文档写完后
bash scripts/workflow/checkpoint-design.sh docs/research/my-feature.html

# 节点 ⑥: 部署到服务器后
bash scripts/workflow/checkpoint-deploy.sh https://your-server.com

# 节点 ⑦: 设置定时监控
crontab -e  # 添加: */30 * * * * bash /path/to/scripts/workflow/checkpoint-runtime.sh
```

---

## Git Hooks (自动触发)

| Hook | 触发时机 | 内容 |
|------|---------|------|
| pre-commit | `git commit` | 6 硬阻断 (as any/Mock/CJS/.only/.env/console) + 架构检查 + 技术债务提醒 |
| commit-msg | `git commit` | Conventional Commits 格式强制 (`feat:` `fix:` `chore:`) |
| pre-push | `git push` | tsc + vitest + iron-laws 三道门禁 |

---

## 执行原则

- **先读再改** — 不假设代码内容
- **任务启动先跑 workflow** — `bash scripts/workflow/task-start.sh "任务"`
- **每批验证** — `npx vitest run` 全绿 + `npm run check:iron-laws` 通过
- **接线审计是硬门禁** — `bash scripts/workflow/wire-check.sh <函数名>` 零结果=未完成
- **逐项 commit** — 单模块独立提交，不批量
- **改完列清单** — 文件 + 行号 + 为什么改
- **部署后验证** — `bash scripts/workflow/checkpoint-deploy.sh` curl 外部 URL
