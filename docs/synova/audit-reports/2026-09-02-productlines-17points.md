# K3 独立审计报告 — 产品线 17 点批量审计（🟡 清账）

> 审计员: Kimi K3（独立会话，零上下文） | 2026-09-02
> 类型: 产品完成度独立复核（26 线 156 点中 17 点 🟡）
> 派单: `docs/synova/coordination/审计派单-20260902-产品线17点.md`（CTO，2026-09-02）
> 结论: **17 点裁决 🟢×5 / 🟡×11 / 🔴×1**（无 P0 阻断；🔴 1 点转 FIX，🟡 11 点列 blockers）
> 分支: `audit/k3-20260902-productlines`

---

## 〇、运行环境注记（claim-verifier 原则）

| 项 | 值 | 影响 |
|---|---|---|
| Node | v24.19.0（nvm，D316 同型） | 全部测试用 Node 24 实测，Node 22 better-sqlite3 ABI 假失败不采信 |
| better-sqlite3 | Node 24 下加载正常（`require` + 建表 + 查询 OK） | 排除基础 ABI 问题 |
| LLM key | **无** | 21-1/21-2 以契约/降级路径审计替代，行为未实测（如实标注） |
| 飞书凭证 | **无**（FEISHU_APP_ID/SECRET 未设置） | 4-3 真实 API 测试被 `it.runIf(!SKIP_FEISHU)` 跳过，只验到契约+降级路径 |
| 测试基线 | 本批共跑 20 个测试文件，**全绿 19 / 原生崩溃 1**（见 7-7） | 崩溃文件 `tests/cron/scheduler.test.ts` 为 Node 24 下原生级崩溃，非逻辑断言失败 |

---

## 一、裁决总表（17 点）

| # | 点 | 声称 | 裁决 | 一句话依据 |
|---|---|---|---|---|
| 10-4 | 现金流跑道计算（filter bug 修复） | 🟢 | `compute-cash-runway-months.ts:60` 无 filter + 专项测试绿 |
| 19-2 | 方向失效信号定义 | 🟢 | `direction-monitor.ts:130-132` 阈值 + invalid 规则 + 测试绿 |
| 24-4 | 防篡改（审计哈希链） | 🟢 | `audit-store.ts:212-247` verifyChain + 篡改实测 valid:false |
| 20-5 | 熔断/优雅停机/卡会话检测 | 🟢 | 三组件 file:line + 三个测试全绿 |
| 22-1 | 看门狗/熔断/健康检查 | 🟢 | watchdog 周期 + healthz degraded 语义 + 测试绿 |
| 15-1 | 专家注册表 + 7 位全注册 | 🟡 | 注册表存在但**传播未完成**：5 处硬编码旧 6-9 专家 |
| 15-3 | 工具/技能工作流接线 | 🟡 | ToolRegistry 接线存在，但"真能用"无端到端 trace；测试绑定错位 |
| 25-1 | 专家插件自动注册 | 🟡 | 扫描机制存在，测试仅 smoke（不验"加文件→注册"） |
| 25-2 | 技能插件自动发现 | 🟡 | 同上（skill-loader 扫描存在，测试 smoke-only） |
| 25-3 | 哨兵插件自动加载 | 🟡 | 扫描存在（45 哨兵实测注册），测试 smoke-only |
| 18-2 | SessionStore + 重启恢复 | 🟡 | SQLite 持久化存在，但**无重启恢复测试**；证据绑定错位 |
| 18-5 | 版本化 + superseded_by 链 | 🟡 | version 递增存在，但**superseded_by 链未接线**（恒 null）+ 旧版本覆盖不保留 |
| 21-1 | DeepSeek 适配器 | 🟡 | 契约结构完整；无 key 行为未实测 + 默认模型名存疑 |
| 7-7 | 定时任务容错 | 🟡 | 失败记录+重试代码存在，但专用测试 **Node 24 原生崩溃** |
| 2-5 | 多轮对话上下文不丢 | 🟡 | messages 历史存在，但"第 10 轮记得第 1 轮"无直接测试；套件名无匹配测试文件 |
| 4-3 | 飞书连接器 | 🟡 | 连接器+契约+降级路径存在，真实 API 未测（无凭证） |
| 21-2 | 提示词优化策略（效果可测量） | 🔴 | **未实现**：无提示词优化策略（深度优化=0），golden-case 测的是诊断 F1 非提示词 |

**汇总**: 🟢 5 / 🟡 11 / 🔴 1。🟢 翻绿后完成度 🟢 15→20；🔴 转 FIX；🟡 列 blockers。

---

## 二、逐点审计（命令 + 断言 + 预期 + file:line）

### 组 A：专家与插件体系

#### 15-1 专家注册表 + 文件驱动自动发现（7 位全注册）— 🟡

- **命令**: `ls expert/ && grep -n "experts:" -A50 expert/expert-registry.yaml && grep -rn "EXPERT_NAMES\|BUILTIN_EXPERTS\|ALL_EXPERTS" src/ --include="*.ts" --include="*.tsx"`
- **断言**: 7 位专家目录存在 + registry 声明 7 位 + 无旧 6 专家硬编码残留。
- **预期**: 7 目录（host/capital-cycle/customer-cycle/talent-cycle/tech/finance-structure/competitive-strategy）；registry 7 条目；硬编码零残留。
- **实测**:
  - ✅ 7 专家目录存在：`expert/` 下 7 个（另有 `_deprecated`/`_template`）。
  - ✅ `expert/expert-registry.yaml:12-53` 声明 7 专家（host + 6 后台），`enabled: true`。
  - ✅ `src/l3/expert-registry.ts:17` 从空 Map 启动，`src/agent/expert-file-loader.ts:190` 文件驱动 `registry.register()`。
  - ❌ **传播未完成**：`src/tui-v2/chat.tsx:409-411` 硬编码旧 6 专家（strategy/org/finance/tech/marketing/action）——即派单点名的"V5 视图硬编码旧 6 专家"**属实**。
  - ❌ 另有 4 处同型残留：`src/cli/commands/expert.ts:16-18`（8 旧）、`src/agent/cross-validator.ts:75`（9 旧）、`src/l3/synova-diagnosis-engine-impl.ts:528-534`、`src/sentinel/runner.ts:643`。
- **裁决**: 🟡。注册表+发现机制成立（7 位），但 D282 的 9→7 迁移**未全量传播**——V5 视图及 4 处文件仍硬编码旧专家，是"新专家加文件"能力之外的实际断裂点。

#### 15-3 工具/技能工作流接线（专家真能用工具）— 🟡

- **命令**: `grep -n "toolRegistry\|withToolRegistry" src/l3/expert-dispatcher.ts src/l3/expert-autonomy.ts`
- **断言**: ExpertDispatcher → ToolRegistry → ExpertAutonomyEngine 链路存在。
- **预期**: ToolRegistry 被注入，专家引擎可 execute/listTools。
- **实测**:
  - ✅ `src/tools/tool-registry.ts:89,243`（ToolRegistry 类 + 单例）。
  - ✅ `src/l3/expert-dispatcher.ts:259-260`（`engine.withToolRegistry(this.toolRegistry)`）。
  - ✅ `src/l3/expert-autonomy.ts:231,237`（withToolRegistry + Path 1 ToolRegistry 优先）。
  - ⚠️ 绑定测试 `test:tool-registration` 被 A2 脚本映射到 `tests/architecture/graphstore-unify.test.ts`（测图存储，非工具注册）——证据错位，无端到端"专家真用工具"trace。
- **裁决**: 🟡。接线存在（file:line），但"真能用工具"缺一次真实调度 trace；测试绑定错位。

#### 25-1 / 25-2 / 25-3 插件化（新专家/技能/哨兵 = 加文件自动加载）— 🟡×3

- **命令**: `grep -n "readdirSync\|scanExperts\|loadSkills\|loadSentinels" src/agent/file-scanner.ts src/skill/skill-loader.ts src/sentinel/sentinel-loader.ts`
- **断言**: 三个发现器均扫描目录 → 读 manifest/文件 → 自动注册。
- **预期**: 加目录即被发现，零改 TypeScript。
- **实测**:
  - ✅ 25-1 专家：`src/agent/file-scanner.ts:243-252` 扫描 `expert/{name}/`。
  - ✅ 25-2 技能：`src/skill/skill-loader.ts:77-79,99-114` 扫描 `extensions/skills/{custom,industry,builtin}`。
  - ✅ 25-3 哨兵：`src/sentinel/sentinel-loader.ts:54-96` 扫描 `extensions/sentinels/`（跳过 shared/`_` 前缀），实测注册 **45 哨兵**（测试日志 `registered:45, errors:0`）。
  - ⚠️ 绑定测试 `test:file-driven` → `tests/init/file-driven-loaders.test.ts` 仅 3 条 smoke（"不抛异常/幂等"），**不验证"加文件→注册"**。
- **裁决**: 🟡×3。发现机制存在（file:line + 45 哨兵实证），但绑定测试是 smoke-only，插件行为未被测试锁定。

### 组 B：企业事实与记忆

#### 18-2 SessionStore + 重启恢复（重启后记忆还在）— 🟡

- **命令**: `grep -n "CREATE TABLE\|getSession" src/store/session-store.ts`
- **断言**: 会话持久化到 SQLite，重建实例可恢复。
- **预期**: 写会话 → 关库 → 重开 → 读到同一条。
- **实测**:
  - ✅ `src/store/session-store.ts:122-140`（`agent_sessions` 表 + `initSchema`）、`:244`（getSession 读库）。
  - ❌ **无重启恢复测试**：`tests/store/session-store.test.ts` 实际只测 D250 线程改名（PATCH/renameSession/ALTER），无"关库重开恢复"断言。
  - ⚠️ 绑定测试 `test:session-store` → A2 映射到 `tests/security/org-isolation-audit.test.ts`（测租户隔离，非重启）——证据错位。
- **裁决**: 🟡。持久化机制存在，但"重启后记忆还在"这一关键行为**未被任何测试锁定**，证据错位。

#### 18-5 版本化 + superseded_by 链（事实更新可追溯）— 🟡

- **命令**: `grep -n "version\|supersededBy\|writeFileSync" scripts/control-tower/enterprise-fact-store.ts`
- **断言**: 事实更新 → version 递增 → 旧版本保留 + superseded_by 反向链。
- **预期**: 更新后旧事实可追溯，新事实 supersededBy 指向旧。
- **实测**:
  - ✅ `enterprise-fact-store.ts:72`（`version = existing ? existing.metadata.version + 1 : 1`）——version 递增。
  - ❌ **superseded_by 链未接线**：`:81` `supersededBy: metadata?.supersededBy ?? null` 恒为 null，全仓库无任何代码将其设为非 null（`grep -rn "supersededBy[:=][^n]"` 仅命中 ga-calibration.ts 的**另一个**机制）。
  - ❌ **旧版本不保留**：`:91-92` 注释声称"旧文件保留为历史版本（不覆盖）"，但 `:95` `writeFileSync(filePath, ...)` 写**同一路径**——注释与代码矛盾，历史版本实际被覆盖。
- **裁决**: 🟡。version 字段存在但"superseded_by 链 + 可追溯"**实质未实现**——supersededBy 恒 null、旧版本覆盖。这是"声称 vs 现实"最显著的半实现点。

### 组 C：LLM 与 providers

#### 21-1 DeepSeek 适配器（标准 API 接入）— 🟡

- **命令**: `grep -n "DEFAULT_BASE_URL\|DEFAULT_MODEL\|onError\|validateResponse\|healthCheck" src/providers/deepseek.ts`
- **断言**: 标准 API 接入 + 错误分类 + 降级 + 健康检查。
- **预期**: OpenAI-compat base + 结构化错误码 + 401 专项。
- **实测**（契约/降级审计，**行为未实测——无 key**）:
  - ✅ `src/providers/deepseek.ts:12-13`（base `https://api.deepseek.com/v1`，model `deepseek-v4-flash`）。
  - ✅ `:28` sanitizeMessages；`:31-42` onError → `DiagnosticAgentError`（429→RATE_LIMITED，5xx→NETWORK）；`:59-78` validateResponse；`:97-103` healthCheck 401 专项。
  - ✅ `tests/llm-resilience.test.ts` 实测（mock 503/401/ECONNREFUSED）通过：重试中间件 + 熔断器触发（日志 `熔断器触发 → OPEN`）。
  - ⚠️ **存疑**：`DEFAULT_MODEL='deepseek-v4-flash'` 非 DeepSeek 官方模型名（官方为 `deepseek-chat`/`deepseek-reasoner`），`.env.example` 同值——疑为占位，真实接入需核实。
- **裁决**: 🟡。契约/结构/降级完整，但无 key 行为未实测，默认模型名存疑。

#### 21-2 提示词优化策略（效果可测量）— 🔴

- **命令**: `grep -rn "prompt.*optimi\|A/B\|promptVersion" src/ --include="*.ts" -il && grep -n "F1\|命中率" scripts/ci/golden-case-checker.ts`
- **断言**: 存在提示词优化策略 + 效果可测量。
- **预期**: A/B/版本化提示词 + 效果指标。
- **实测**:
  - ❌ **无提示词优化策略**：全仓库 grep 无 prompt 版本化/A/B/优化机制命中（`深度优化=0` 自认属实）。
  - ⚠️ `scripts/ci/golden-case-checker.ts:3-7,133-157` 是**诊断 F1 门禁**（关键边命中率/根因节点匹配/告警级别一致），测的是诊断准确性，**非提示词优化效果**。
- **裁决**: 🔴 **不实**。证据记录自认"深度优化=0"得到确认——该点无对应实现。**转 FIX**（禁止直接改状态）。

### 组 D：循环与运行时

#### 7-7 定时任务容错（失败有记录、可重试）— 🟡

- **命令**: `sed -n '383,397p' src/cron/scheduler.ts && node_modules/.bin/vitest run tests/cron/scheduler.test.ts`
- **断言**: cron 失败 → 记录 + 重试。
- **预期**: failures 计数 + last_error 持久化 + 失败后 60s 重排。
- **实测**:
  - ✅ `src/cron/scheduler.ts:383-391`（catch 内 `job.failures++`、`job.lastError=msg`、`job.nextRun = Date.now() + 60000` 重试）、`:396-397`（persistRun 持久化）。
  - ❌ **专用测试原生崩溃**：`tests/cron/scheduler.test.ts` 在 Node 24 下 `Worker exited unexpectedly`（原生栈：`uv_stream_io`/`MessagePort::OnMessage`），forks 与 threads 两 pool 均复现，8 测试 0ms 未执行。非逻辑断言失败，疑为 better-sqlite3 原生模块 + 定时器与 vitest worker 交互崩溃（待排查）。
  - ⚠️ 绑定测试 `test:cron-scheduler` → A2 映射到 `tests/sentinel/sentinel-runner-auto-ticket.test.ts`（非本测试）——A2 证据从未真正跑 cron 容错测试。
- **裁决**: 🟡。容错代码存在（file:line），但专用测试原生崩溃 + A2 证据错位，无法以测试锁定。

#### 10-4 现金流跑道计算正确（filter bug 修复）— 🟢

- **命令**: `node_modules/.bin/vitest run tests/sentinels/cash-runway/compute-cash-runway-months.test.ts`
- **断言**: queryNodes 不再传永不匹配的 filter。
- **预期**: `queryNodes('Financial')` 无 filter 参数；修复前 `{teamId:'team1'}` 永不匹配。
- **实测**:
  - ✅ `extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts:60`（`store.queryNodes('Financial')` 无 filter）。
  - ✅ `tests/sentinels/cash-runway/compute-cash-runway-months.test.ts:58-67`（"D355 fix" 专项：`expect(capturedFilter).toBeUndefined()`）。
  - ✅ 测试通过（6 用例：traversal/降级/Infinity/fallback/D355/exceptions）。
- **裁决**: 🟢。bug 修复 + 专项测试锁定，通过。

#### 19-2 方向失效信号定义（规则明确）— 🟢

- **命令**: `node_modules/.bin/vitest run tests/loops/direction-monitor.test.ts`
- **断言**: 失效判定规则明确。
- **预期**: 2+ 类别偏离 ≥50% → invalid；任一 ≥30% → risk；否则 valid。
- **实测**:
  - ✅ `src/loops/direction-monitor.ts:130-132`（THRESHOLD_RISK=0.3 / THRESHOLD_INVALID=0.5 / INVALID_CATEGORY_COUNT=2）、`:143-146`（规则文档）、`:258-259`（invalid 判定）。
  - ✅ 测试通过（5 用例：valid/risk/invalid/degraded/无数据）。
- **裁决**: 🟢。规则明确 + 测试锁定，通过。

#### 20-5 熔断/优雅停机/卡会话检测（异常自愈）— 🟢

- **命令**: `node_modules/.bin/vitest run tests/circuit-breaker.test.ts tests/services/graceful-shutdown.test.ts tests/services/stuck-session-detector.test.ts`
- **断言**: 三组件各自实现 + 触发条件。
- **预期**: 熔断三态机 / 停机 drain / 卡会话 5min 检测。
- **实测**:
  - ✅ 熔断 `src/llm/circuit-breaker.ts:17,24-70`（CLOSED→OPEN→HALF_OPEN，threshold 3/30）。
  - ✅ 优雅停机 `src/services/graceful-shutdown.ts`（noteActive/forgetActive/drain）。
  - ✅ 卡会话 `src/services/stuck-session-detector.ts`（>5min 无新消息）。
  - ✅ 三测试全绿（本批 batch 内 48 tests 通过的一部分）。
- **裁决**: 🟢。三组件 + 测试锁定，通过。

#### 22-1 看门狗/熔断/健康检查（自我健康机制）— 🟢

- **命令**: `node_modules/.bin/vitest run tests/deploy/system-self-ops.test.ts tests/monitoring/system-health.test.ts tests/routes/healthz.test.ts`
- **断言**: 看门狗周期 + 熔断阈值 + healthz degraded 语义。
- **预期**: 看门狗 5min 周期 + healthz 三态（healthy/degraded/down）。
- **实测**:
  - ✅ 看门狗 `src/deploy/watchdog-entry.ts:20-23`（CHECK_INTERVAL_MS=5min，HEALTH_URL）。
  - ✅ 熔断 `src/llm/circuit-breaker.ts`（同 20-5）。
  - ✅ healthz `src/routes/healthz.ts:72`（hasDown→down / hasDegraded→degraded / else healthy）；`:87-105`（db 检查）；CTO 冒烟已证 degraded 语义。
  - ✅ 三测试全绿。
- **裁决**: 🟢。三组件 + 测试锁定，通过。

#### 24-4 防篡改（审计哈希链）— 🟢

- **命令**: `node_modules/.bin/vitest run tests/l4/audit-store.test.ts`
- **断言**: 哈希链 append + verifyChain + 篡改检测。
- **预期**: 篡改中间一条 current_hash → verifyChain 返回 valid:false。
- **实测**:
  - ✅ `src/l4/audit-store.ts:114-151`（SHA-256 prev_hash→current_hash 链构建，创世块 `'0'*64`）、`:212-247`（verifyChain 逐条比对）。
  - ✅ `tests/l4/audit-store.test.ts:327-338`（"中间篡改 → valid:false, brokenAt:N"）——**篡改一位实测失败**，正是派单要求的复现。
  - ✅ 24 测试全绿。
- **裁决**: 🟢。哈希链 + 篡改实测锁定，通过。

### 组 E：数据接入与对话

#### 2-5 多轮对话上下文不丢（第 10 轮记得第 1 轮）— 🟡

- **命令**: `grep -n "messages\|getMessageHistory\|shouldCompress" src/agent/conversation-engine.ts`
- **断言**: 多轮消息历史累积 + 长会话不丢首轮。
- **预期**: messages 数组累积；第 10 轮仍含第 1 轮内容。
- **实测**:
  - ✅ `src/agent/conversation-engine.ts:338,497-499,572`（messages 数组 + getMessageHistory + push 累积）。
  - ⚠️ `:576-580` 有 ContextEngine 压缩（token 超预算时 compress/discard）——**"第 10 轮记得第 1 轮"并非无条件成立**，取决于压缩是否丢弃首轮原始消息。
  - ❌ 无"第 10 轮记得第 1 轮"直接测试；绑定套件 `test:会话线程`（中文名）在 A2 脚本 grep 中**零匹配测试文件**（被跳过）。
- **裁决**: 🟡。历史机制存在，但长会话保真未锁定 + 套件名无法匹配测试 + 压缩可能丢首轮。

#### 4-3 飞书连接器 — 🟡

- **命令**: `grep -n "class FeishuConnector\|healthCheck\|fetchMessages\|未配置" src/connectors/feishu.ts && node_modules/.bin/vitest run tests/data-pipeline.feishu.integration.test.ts`
- **断言**: 连接器 + 数据契约 + mock/降级路径。
- **预期**: DataConnector 实现 + 无凭证降级返回空。
- **实测**:
  - ✅ `src/connectors/feishu.ts:55-57`（凭证未配置 → log.warn + 返回空，降级诚实）、`:40-53`（FeishuConnector implements DataConnector + healthCheck）。
  - ✅ `src/connectors/feishu-bridge.ts:57`（feishuHealthCheck）。
  - ⚠️ 集成测试 `tests/data-pipeline.feishu.integration.test.ts:39,58,66` 用 `it.runIf(!SKIP_FEISHU)`——无凭证时**真实 API 测试被跳过**，本批"通过"实为 skip，仅 PythonBridge health 跑了。
- **裁决**: 🟡。连接器+契约+降级路径存在（file:line），真实 API 拉取未实测（无凭证，审计员严重问题-2 遗留线索未闭环）。

---

## 三、L1-L4 四层审计要点

### L1 代码审计（接口/架构/数据流/测试/降级）

- **接口真实性**: 17 点引用的函数/类全部 grep 命中（0 虚假接口）。
- **降级诚实性**: 10-4/19-2/21-1/4-3/7-7 均见 catch + log + degraded；18-5 的 superseded_by 半实现是唯一"注释与代码矛盾"点。
- **测试非空壳**: 本批实跑 19 文件全绿、断言真实（如 24-4 篡改实测、10-4 D355 专项）。

### L2 偏离审计（dev doc vs 现实）

- 本批为"清账"型（无 dev doc 写集可对），偏离审计落在**证据绑定 vs 实际测试**：见 L4。

### L3 执行审计（控制塔/CI）

- **A2 机器证据管线存在名义绑定缺陷**（见 L4-1）：`run-machine-evidence.sh` 用 `grep -l "$suite"` 做套件名→测试文件映射，宽松且错位，但证据 quote 统一写"vitest 套件全绿"。
- CI 侧：`test-2026-08-17/18.json` 两份证据覆盖全部 test 绑定点，其中本批 17 点**全部标 pass**，但实际多数点的绑定套件映射错位或被跳过（见下）。

### L4 防线缺口收割

**L4-1（P1，归因 control-tower）**: A2 `run-machine-evidence.sh` 的套件名→测试文件映射不可靠。
- 证据：`scripts/product-lines/run-machine-evidence.sh`（`grep -l "$s"` 语义匹配 + 文件名 glob 兜底）。
- 实测映射错位/缺失：
  - `会话线程`(2-5)、`audit-chain`(24-4) → **零测试文件**（被跳过，但证据仍写 pass）。
  - `session-store`(18-2) → org-isolation-audit.test.ts（错位）；`tool-registration`(15-3) → graphstore-unify.test.ts（错位）；`agent-memory`(18-5) → org-isolation-audit.test.ts（错位）；`expert-registry`(15-1) → e2e-autonomy.integration.test.ts（错位）；`cron-scheduler`(7-7) → sentinel-runner-auto-ticket.test.ts（错位）。
  - 即便某套件无匹配文件，证据仍对**全部** test 绑定点写 pass。
- 缺口：缺"套件名 → 测试文件"的**显式注册表**（suite-registry.yaml，派单 B.2 曾提议但未落地），导致机器证据"名义绑定、实际验不到"。

**L4-2（P1，归因 implement）**: D282 专家 9→7 迁移未全量传播。
- 证据：`src/tui-v2/chat.tsx:409-411`、`src/cli/commands/expert.ts:16-18`、`src/agent/cross-validator.ts:75`、`src/l3/synova-diagnosis-engine-impl.ts:528-534`、`src/sentinel/runner.ts:643`。
- 缺口：缺"改核心定义后 grep 全仓库传播"的硬门禁（铁律 9）对"专家名枚举"类符号的覆盖。

**L4-3（P1，归因 implement）**: 18-5 superseded_by 链声明与实现脱节。
- 证据：`enterprise-fact-store.ts:91-92` 注释"不覆盖/版本链追溯" vs `:95` 同路径覆盖 + `:81` supersededBy 恒 null。
- 缺口：缺"注释声称 vs 代码行为"的语义审计（bash 无法拦，需 K3 类语义核）。

**L4-4（P2，归因 implement）**: 7-7 `tests/cron/scheduler.test.ts` Node 24 原生崩溃。
- 证据：forks/threads 双 pool 复现 `Worker exited unexpectedly`，8 测试 0ms。
- 缺口：疑 better-sqlite3 原生模块 + 定时器与 vitest worker 交互，待排查（可能需 `--pool=forks --no-file-parallelism` 或 fake timers）。

---

## 四、错误归因与防再犯（守门人）

| 问题 | 归因 | 防再犯机制（收敛，不加新脚本） |
|---|---|---|
| A2 套件映射错位/缺失（L4-1） | control-tower | 落地 `suite-registry.yaml` 显式映射，`run-machine-evidence.sh` 改为查表失败即 fail-closed（**不写** pass） |
| 专家名迁移传播不全（L4-2） | implement | 铁律 9 grep 传播检查覆盖"专家名枚举"符号（强化既有 M 类，非新类） |
| superseded_by 声明/实现脱节（L4-3） | implement | 契约优先（铁律 47）+ K3 语义审计持续覆盖（已命中 M 类） |
| cron 测试原生崩溃（L4-4） | implement | vitest config 明确 pool 策略（纳入既有测试基建，非新类） |

> 原则：命中既有 M 类（接线传播/契约/测试基建），强化既有防线，不新增免疫细胞类。

---

## 五、产出物与后续

1. **本报告**（git 跟踪）。
2. **k3 evidence 回填**：`docs/synova/product-lines/evidence/k3-2026-09-02-productlines.json`（5 🟢 点 pass 裁决），触发 calc-progress 翻绿。
3. **product-progress.html 翻转**：5 🟢 翻绿；21-2 标注 🔴 + FIX 指针；11 🟡 保持待确认（blockers 已在各点列明）。
4. **待 FIX 任务**：21-2（提示词优化策略）——建议立项 D-FIX；18-5 superseded_by 链、15-1 专家名传播可随相关迭代补。

> 红线遵守：本批仅改独立审计分支的仪表盘 + evidence + 报告；未改任何产品代码/审计脚本/审计标准。
