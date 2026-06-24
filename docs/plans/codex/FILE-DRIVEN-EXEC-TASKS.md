# 文件驱动架构 — 执行任务清单 v1.0
> 基于 2026-06-24 PRD vs CODE 差距分析。目标：将 synova-file-driven-architecture.html 文档中的设计全部落地为代码。
> 当前覆盖率约 45%。以下按依赖顺序排列，每一组内部可并行。

---

## 背景速览（执行为什么按这个顺序）

文档定义了 18 个维度、Phase 0-7、执行五批。当前状态：

- **基础设施存在但未完成**：ExtensionRegistry 已接线 server.ts，但缺少 ExtensionLoader 包装层、manifest schema 校验、泛化 feature flag 系统
- **第一批 (i18n/报告/框架/通知)**：框架 100% 完成，i18n 缺 en-US expert-prompts.json，报告完全是空壳，通知缺 2 个渠道
- **第二批 (哨兵重构)**：财务域 5 个哨兵有 aggregate 但 computes/ 全是空目录，其余 11 个哨兵只有单个 compute stub、无 manifest、无 aggregate；shared/ 只有 1/3 工具文件
- **第三批 (规则文件化)**：诊断规则 JSON 有 6 个文件但缺 metadata 字段，升级策略 4 个文件完成，数据访问策略 policies/ 目录完全不存在
- **第四批 (对外扩展)**：本体类型 JSON Schema 100% 完成，行业模板全空，业务模型完成，LLM 提供商完成
- **第五批 (引擎对接)**：引擎配置未开始，tools/ 目录不存在，IM 连接器 2 个完成
- **engine-core 存量引用**：约 35 个 src/ 文件仍在直接 import engine-core

**已存在的 loader 文件（代码已从文件读取，只是文件内容是空的）**：
- `src/locale/locale-loader.ts` — 从 extensions/locales/{lang}/ 读 JSON ✅
- `src/l3/report-template-loader.ts` — 从 extensions/reports/ 读 .hbs ✅
- `src/l3/framework-loader.ts` — 从 extensions/frameworks/ 读 JSON ✅
- `src/notifications/notification-loader.ts` — 从 extensions/notifications/ 动态 import adapter ✅
- `src/sentinel/sentinel-loader.ts` — 从 extensions/sentinels/ 读 manifest + 动态 import ✅
- `src/l3/rule-loader.ts` — 从 extensions/rules/ 读 JSON ✅
- `src/l4/ontology-loader.ts` — 从 extensions/ontology/ 读 JSON Schema ✅
- `src/l4/industry-loader.ts` — 从 extensions/industries/ 读 manifest ✅
- `src/l4/adapter-loader.ts` — 从 extensions/adapters/ 动态 import ✅
- `src/init/file-driven-loaders.ts` — 在 server.ts 启动时统一调用上述所有 loader ✅

**结论**：loader 代码已全部写好并接线 server.ts。大部分"未完成"实质是**数据文件缺失**（空目录、缺 JSON、缺 .hbs），不是代码缺失。

---

## 前置检查（每条任务开始前必做）

1. 读 `AGENTS.md` — 铁律速览（零~六），特别是铁律 46（禁止新增 engine-core import）
2. 读 `docs/plans/synova-file-driven-architecture.html` — 目标架构全量设计
3. `rg -n "engine-core" src/` — 确认当前任务不新增 engine-core 引用
4. 每完成一个文件，跑 `npx vitest run --changed` 确认不破坏现有测试

---

## 组 A：补全数据文件（纯 JSON/Markdown，零风险，可并行）

### A1. 英文国际化 — en-US expert-prompts.json
**目标**：`extensions/locales/en-US/` 目前只有 2 个文件（ui-strings.json, report-labels.json），缺少 expert-prompts.json
**参考**：`extensions/locales/zh-CN/expert-prompts.json` 的结构
**操作**：
1. 读取 `extensions/locales/zh-CN/expert-prompts.json` 了解字段结构
2. 创建 `extensions/locales/en-US/expert-prompts.json`，翻译为英文
3. 确认 loader 代码 `src/locale/locale-loader.ts` 中的 `loadLocale('en-US')` 能加载到该文件
**验收**：`grep -r "expertPrompts" src/locale/locale-loader.ts` 确认 en-US 路径可解析

### A2. 报告模板 — 创建 .hbs 模板文件
**目标**：`extensions/reports/` 目前只有 manifest.json，零模板
**参考**：loader 代码在 `src/l3/report-template-loader.ts`，支持 `{{key}}` 和 `{{#array}}...{{/array}}` 简单模板语法
**操作**：
1. 创建 `extensions/reports/default.hbs` — 通用诊断报告模板，包含：标题、组织概览、各专家诊断结果、行动建议、附录
2. 创建 `extensions/reports/executive-summary.hbs` — 高管简报模板，精炼版
3. 确认 `report-template-loader.ts` 的 `loadTemplate('default')` 和 `listTemplates()` 能正确返回
**验收**：`npx vitest run --changed` + 手动确认 `initFileDrivenLoaders` 中 report template loader 初始化不抛异常

### A3. 通知渠道 — 补全 email + feishu-approval
**目标**：`extensions/notifications/` 目前只有 jira/ 和 linear/
**参考**：`extensions/notifications/jira/` 的 manifest.json + adapter.ts 结构
**操作**：
1. 创建 `extensions/notifications/email/manifest.json` + `adapter.ts`（实现 NotificationAdapter 接口，send() 方法用 console.log + Nodemailer stub）
2. 创建 `extensions/notifications/feishu-approval/manifest.json` + `adapter.ts`
3. 确认 `notification-loader.ts` 的 `loadAndRegisterNotificationAdapters()` 能发现并注册这 2 个新渠道
**验收**：启动后在日志中看到 email 和 feishu-approval 注册成功

### A4. 诊断规则元数据 — 补全 metadata 字段
**目标**：`extensions/rules/diagnostic/` 6 个 JSON 文件缺少 `source`, `confidence`, `status` 字段
**操作**：
1. 读取每个 `extensions/rules/diagnostic/rule-*.json`
2. 为每个规则添加 `"metadata": { "source": "expert_template", "confidence": 0.8, "status": "active" }`
3. 对于人工编写的规则（已知其来源的）用 `expert_template`，置信度按领域调整
**验收**：`src/l3/rule-loader.ts` 的 `loadRules()` 解析不报错

### A5. 哨兵 shared 工具库 — threshold.ts + stats.ts
**目标**：`extensions/sentinels/shared/` 目前只有 baseline.ts，缺 threshold.ts 和 stats.ts
**操作**：
1. 创建 `extensions/sentinels/shared/threshold.ts` — 导出阈值判断函数（`isWarning()`, `isCritical()`, `evaluateThreshold()`）
2. 创建 `extensions/sentinels/shared/stats.ts` — 导出统计函数（`mean()`, `stddev()`, `trend()`, `percentChange()`）
3. 确保不 import engine-core，不引用 `src/sentinel/adapters/`
**验收**：2 个新文件存在 + `npx tsc --noEmit` 通过

---

## 组 B：哨兵重构（依赖组 A5 shared 工具库）

### B1. 为 11 个无 manifest 的哨兵补充 manifest.json
**目标**：`extensions/sentinels/` 下 11 个哨兵目录（collaboration-health, eob, financial-snapshot, gap-dynamics, hacd, hona, htm, path-dependency, self-awareness, seven-powers, token-economics）没有 manifest.json
**参考**：`extensions/sentinels/cost-health/manifest.json` 的格式
**操作**：
1. 为每个哨兵创建 manifest.json，包含：name, version, type, displayName, schedule, expert, computes 列表, thresholds, aggregation, context
2. expert 字段根据哨兵领域填写：组织哨兵 → "org"，财务哨兵 → "finance"，技术哨兵 → "tech"，战略哨兵 → "strategy"
3. 更新 `extensions/sentinels/manifest.json` 的 `sentinels` 字段，把 11 个新哨兵注册进去
**验收**：`src/sentinel/sentinel-loader.ts` 的 `loadSentinels()` 返回 16 个哨兵（原 4 个 + 新 11 个 + key-person-risk）

### B2. 为 11 个哨兵创建 aggregate.ts
**目标**：这 11 个哨兵只有 `computes/something.ts`（单个 compute），没有 aggregate.ts
**操作**：
1. 为每个哨兵创建 `aggregate.ts`，导出 `aggregate(metrics, thresholds)` 函数
2. aggregate 负责：读取 N 个 compute 结果 → 与 thresholds 比较 → 合成 1 条 Finding（含 severity + 具体描述）
3. 目前每个哨兵只有 1 个 compute，aggregate 就是单指标阈值判断的包装；后续可扩展为多指标综合
**验收**：16 个哨兵目录全部有 aggregate.ts

### B3. 为 5 个财务哨兵填充 computes/ 目录
**目标**：cost-health, revenue-health, cash-runway, profit-health, key-person-risk 这 5 个有 aggregate.ts 的哨兵，computes/ 全是空目录
**参考**：文档 3b 节"以财务专家为例"列出了每个哨兵下应有的 compute 指标
**操作**：
1. cost-health: 创建 `gross-margin.ts`, `fixed-variable-ratio.ts`, `cost-per-head.ts`
2. revenue-health: 创建 `revenue-growth.ts`, `customer-concentration.ts`, `avg-deal-size.ts`
3. cash-runway: 创建 `cash-runway-months.ts`, `receivable-overdue.ts`, `operating-cashflow.ts`
4. profit-health: 创建 `margin-change.ts`, `margin-vs-benchmark.ts`
5. key-person-risk: 创建 `bus-factor.ts`, `knowledge-concentration.ts`, `succession-readiness.ts`
6. 每个 compute 函数：`(data: GraphData) => { value: number; trend: 'up'|'down'|'flat'; timestamp: string }` — 通过 L4 GraphStore 接口拿数据（不直接查 SQLite）
**验收**：5 个哨兵的 computes/ 目录各有 ≥2 个 .ts 文件

### B4. 删除旧哨兵适配器中已迁移的对应文件
**目标**：`src/sentinel/adapters/` 还有 26 个旧适配器。对应关系已迁移到 extensions/sentinels/ 的，旧适配器应标记 @deprecated
**操作**：
1. 映射 extensions/sentinels/ 的 16 个哨兵与 `src/sentinel/adapters/` 的 26 个文件
2. 对已迁移的，在文件头加 `/** @deprecated 使用 extensions/sentinels/{name}/ 替代 */`
3. **不删文件** — 等 feature flag 切换验证完后再删
**验收**：`rg "@deprecated.*extensions/sentinels" src/sentinel/adapters/` 有匹配结果

---

## 组 C：行业模板（真正卡收入的）

### C1. 创建 4 个行业模板
**目标**：`extensions/industries/` 目前只有 manifest.json，零行业子目录
**操作**：
1. 创建 `extensions/industries/general-enterprise/` — manifest.json（extends: null）+ 空 node-types/ + edge-types/ + rules/ + metrics/
2. 创建 `extensions/industries/saas-tech/` — manifest.json（extends: general-enterprise）+ node-types/（含 subscription, tenant, deployment 等特有类型）+ rules/（含 churn-rate.json, mrr-growth.json）
3. 创建 `extensions/industries/manufacturing/` — extends general-enterprise + 特有节点（equipment, production-line, supplier, warehouse）
4. 创建 `extensions/industries/financial-services/` — extends general-enterprise + 特有节点（product, compliance-report, regulatory-body）+ 特有规则
5. 更新 `extensions/industries/manifest.json` 注册所有 4 个行业
**验收**：`src/l4/industry-loader.ts` 的 `loadIndustries()` 返回 4 个行业

### C2. 验证 pizza-chain 测试
**目标**：确保 `tests/acceptance/zero-code-industry.test.ts` 仍然通过
**操作**：
1. 运行 `npx vitest run tests/acceptance/zero-code-industry.test.ts`
2. 如果失败，根据错误信息修复 industry-loader 或 pizza-chain 测试数据
**验收**：测试绿色

---

## 组 D：引擎配置 + 数据策略

### D1. 创建 extensions/engine/ 目录
**目标**：`extensions/engine/` 完全不存在
**操作**：
1. 创建 `extensions/engine/diagnosis.json` — phases, gates, maxToolRounds, prompt 模板路径等配置
2. 创建 `extensions/engine/prompt.md` — 引擎系统提示词
3. 创建 `extensions/engine/manifest.json`
**验收**：文件存在 + JSON 格式合法

### D2. 创建 extensions/policies/data-access.yaml
**目标**：替代 `packages/engine-core/src/pipeline/diagnosis/expert-data-policy.ts` 中的 DEFAULT_POLICIES 硬编码
**参考**：`expert-data-policy.ts` 中的 POLICIES 记录，以及 `expert/expert-registry.yaml` 中的工具声明
**操作**：
1. 创建 `extensions/policies/data-access.yaml` — YAML 格式，每个专家一个条目，声明 allowedDimensions, allowedTools, allowedSources, sensitivityLevel
2. 覆盖全部 8 个专家（strategy, org, finance, tech, marketing, action, business_model, knowledge）
3. knowledge 专家目前没有对应策略（`expert-data-policy.ts` 中缺失），需要补充
**验收**：YAML 可被 js-yaml 解析

---

## 组 E：创建 extensions/tools/（低优先级，依赖引擎迁移接口稳定）

### E1. 创建工具定义文件
**目标**：`extensions/tools/` 不存在
**操作**：
1. 创建 `extensions/tools/manifest.json`
2. 创建 `extensions/tools/definitions/` — 从现有 tool 定义中提取 24 个工具的 MCP Tool JSON 定义（21 模块 + 3 FDE 工具）
3. 创建 `extensions/tools/implementations/` — 每个工具的 TS 实现 stub
**注意**：这一步需要深入的引擎内部知识，建议等 engine-core 迁移稳定后再做。目前先建目录结构 + manifest。
**验收**：目录结构存在 + manifest.json 合法

---

## 组 F：安全边际（做完上述任何一组后必跑）

1. `npx tsc --noEmit` — 零错误
2. `npx vitest run` — 零失败（特别是 `tests/acceptance/zero-code-industry.test.ts`）
3. `npm run check:iron-laws` — 全部通过
4. `rg "engine-core" src/ --count` — 数量不增加（允许减少）
5. `rg "as any" src/ --count` — 数量不增加

---

## 总览

| 组 | 内容 | 预计工时 | 当前完成度 | 依赖 |
|----|------|---------|-----------|------|
| A | 数据文件补全（i18n/报告/通知/规则/工具库） | 1-2天 | 0% | 无 |
| B | 哨兵重构（manifest + aggregate + compute + deprecation） | 3-4天 | ~30% | A5 |
| C | 行业模板 + pizza-chain 验证 | 2-3天 | 0% | 无（独立） |
| D | 引擎配置 + 数据策略 | 0.5-1天 | 0% | 无 |
| E | 工具文件化 | 1-2天 | 0% | engine-core 迁移完成 |
| F | 质量门禁 | 每次提交 | — | 每组完成 |

**推荐执行顺序**：A1→A2→A3→A4→A5（可全并行）→ B1→B2→B3→B4（顺序）→ C1→C2（可与 D 并行）