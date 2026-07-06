# PRD v1.9 vs 代码现状 —— 完整差距分析

> 2026-06-24 · 三个子代理并行审计后汇总 · 逐文件验证

## 一、用户侧能力（10 项）

| # | 检查项 | 状态 | 关键发现 |
|---|--------|------|---------|
| 1 | 三栏布局 HTML 页面 | ✅ 已实现 | GET /workspace, GET /, GET /dept, GET /chat — 四个路由以 inline HTML 返回完整界面 |
| 2 | 桌面打包 .exe | ⚠️ 配置就绪 | build-synova.js + electron-main.ts 存在，但 release/ 目录为空——从未执行过打包 |
| 3 | knowledge/shared/ | ⚠️ 空壳 | 目录存在但仅有 README.md，实际共享知识文件为 0 |
| 4 | 专家 OUTPUT_SCHEMA.md | ✅ 全部 | 8/8 位专家全部存在 |
| 5 | 诊断节奏控制 | ❌ 仅 1/7 | strategy/RULES.md 有"建议力度控制"，其余 6 位（org/finance/tech/marketing/action/business_model）全部缺失 |
| 6 | 投融资知识 | ✅ 已实现 | strategy/RULES.md 含完整投融资情境判断章节（11 种情境） |
| 7 | pizza-chain 零代码验收 | ❌ 未实现 | extensions/industries/ 下无 pizza-chain 目录 |
| 8 | 文件化节点/边 | ⚠️ 19+17 | 节点 19（PRD 声称 20），边 17（一致）。product/supplier/market 在 node-types/ 中缺失 |
| 9 | RBAC 中间件 | ✅ 已接线 | src/middleware/rbac.ts + server.ts L394 注册 |
| 10 | 部门工作区路由 | ✅ 已接线 | src/routes/department-workspace.ts + server.ts L38 注册 |

## 二、核心流程接线（8 项）

| # | 检查项 | 状态 | 关键发现 |
|---|--------|------|---------|
| 1 | 行动项存储 | ❌ 无持久化 | src/routes/actions-api.ts 使用内存 Map，无 AgentMemoryStore。重启即丢失 |
| 2 | 老板信箱 cron | ❌ 假接线 | setInterval 触发但 generateReport 传入空 signal/action 数组 |
| 3 | 反馈收集器 | ❌ 未接线 | collectFeedback() 在整个 src/ 下零调用方 |
| 4 | WorkspaceContextBridge | ✅ 已接线 | conversation-engine.ts L689-691 在 loadConfirmedFacts() 中调用 |
| 5 | 企业事实层加载 | ⚠️ 部分 | 仅在上下文压缩时加载，expert-dispatcher 完全不加载 |
| 6 | 上下文压缩 | ✅ 已接线 | summary 策略 + confirmedFacts 传入，1500 tokens |
| 7 | 文件化扩展 tools/engine/mcp | ❌ 不存在 | 三个目录均不存在 |
| 8 | 哨兵 manifest | ❌ 12/17 缺失 | 仅 5 个哨兵有 manifest.json，12 个运行时被静默跳过 |

## 三、文件化扩展 + 部署（11 项）

| # | 检查项 | 状态 | 关键发现 |
|---|--------|------|---------|
| 1 | expert-registry.yaml | ✅ | 被 ExpertDispatcher 加载 |
| 2 | extensions/ 11 模块 | ✅ | 全部有 manifest.json。但 industries/ 和 reports/ 是空壳 |
| 3 | 本体 JSON Schema | ✅ | 19 node + 17 edge |
| 4 | LLM 提供商 | ✅ | 10 个提供商，全部有 manifest |
| 5 | 行业模板 | ❌ | 空壳，无任何行业 JSON 文件 |
| 6 | 报告模板 | ❌ | 空壳，无任何模板文件 |
| 7 | 通知渠道 | ✅ | Jira + Linear 适配器已实现 + 已接线 |
| 8 | 框架库 | ✅ | 85 个 JSON 框架文件 |
| 9 | 国际化 | ⚠️ | en-US + zh-CN 存在，但 expert-prompts.json 未按语言分离 |
| 10 | 部署方式 | ✅ | Node/Electron/Docker 三种方式齐备 |
| 11 | "错误扣留检查" | ❌ | CLAUDE.md / AGENTS.md 自检六问中不存在此项 |

## 四、优先修复清单

| 优先级 | 任务 | 状态 | 预估工时 | 影响 |
|--------|------|------|---------|------|
| **P0** | 哨兵 manifest 补齐（12 个缺失） | 新发现 | 2h | 12 个哨兵运行时加载失败 |
| **P0** | 老板信箱 cron 信号注入 | 已知 | 2h | 老板永远收到空报告 |
| **P0** | 行动项持久化 (Map -> AgentMemoryStore) | 已知 | 1h | 重启数据全丢 |
| **P1** | 反馈收集器接线 | 已知 | 0.5h | 进化回路断开 |
| **P1** | 企业事实层在 expert-dispatcher 加载 | 新发现 | 1h | 专家运行时无制度约束 |
| **P1** | 节点类型补齐（product/supplier/market JSON） | 新发现 | 0.5h | PRD 声称 20 但只有 19 |
| **P2** | 诊断节奏控制补充 6 位专家 | 已知 | 1h | 质量完善 |
| **P2** | pizza-chain 零代码验收 | 已知 | 1h | PRD 北极星测试 |
| **P2** | CLAUDE.md "错误扣留检查" | 新发现 | 0.1h | 自检项 |

**总计：** 11 个待修复项，预估 10 小时。其中 3 个 P0（直接影响运行），4 个 P1（影响质量），4 个 P2（完善）
