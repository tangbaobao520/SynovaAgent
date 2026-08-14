# Agent 基础设施物理扫描报告

> 执行者：Claude Code
> 日期：2026-08-14
> 方法：8 项 Bash grep + 文件抽查
> 术语说明：GA = 增长顾问（原 FDE）
> 执行环境：Windows 11 + Git Bash；数据库读取用 python 3.11.15（sqlite3 CLI 未安装，见下方命令适配说明）

## 命令适配说明（诚实记录，不影响证据）

1. **find `--include="*.ts"` 非合法选项**（find 不支持 `--include`，那是 grep 的选项）。能力 4、能力 5 两处改为 `-name "*.ts"`，语义等价。
2. **sqlite3 CLI 未安装**（`which sqlite3` 退出码 1）。任务书内所有 `sqlite3 data/synova.db ...` 命令在 `2>/dev/null` 下**静默失败**（stdout 为空，bash 报 "command not found" 被吞）。原始输出中 `exit=127` 即 "command not found" 的物理证据。改用 python3 内置 sqlite3 模块执行等价查询（schema / 表清单 / 行数 / 租户列），结果标注"python 回退"。
3. 能力 7 任务书指定的 `grep runGA|runDiagnosis|runAdvisor|orchestrate src/orchestrator/` 零命中，第二轮补查扩大范围到 `src/`，确认 6 阶段实现在 `src/agent/conversation-engine.ts` + `src/agent/diagnosis-launcher.ts`（L2），而非 orchestrator/ 目录。

---

## 扫描结果汇总

| # | 能力 | 状态 | 证据摘要 | 空壳风险 |
|---|------|:---:|---------|:-------:|
| 1 | 存在与身份（多企业隔离） | **PASS** | 288+267 处 tenant/org/workspace 引用；路由从 body/query/header 提取 orgId/workspaceId/tenantId；DB 实测 5 表含 org_id 列 | 低 |
| 2 | 上下文管理（对话状态机） | **PASS** | `conversation-engine.ts:258` 真实类；Phase 0→1-5 状态机 + turnCount + maxTurns；506 处 turn/session 管理；0 TODO/FIXME | 低 |
| 3 | 状态持久化（跨会话记忆） | **PASS** | session-store.ts 314 行：CREATE TABLE agent_sessions/agent_messages + INSERT/UPDATE + FTS 触发器；DB 实测表存在；无 migrations/ 目录但有代码内 schema-migration.ts | 低 |
| 4 | LLM 网关（Provider 降级） | **PARTIAL** | 10 个 provider 文件 + 启动时检测切换（detect.ts）+ 超时/retryable 错误分类；**无运行时 failover**（catch→切 provider 不存在，"fallback" 仅出现于注释，无 circuit breaker） | 中 |
| 5 | MCP 协议（工具标准化） | **PARTIAL** | src/mcp/ 5 文件：MCPBridge 子进程 JSON-RPC 调 vendor MCP server + MCPToolRegistry 接线（bootstrap.ts:1241）；**ModelContextProtocol 字面量 0 命中** → 非官方 SDK 实现 | 中 |
| 6 | Skill 动态加载 | **PASS** | readdirSync 扫描 + `await import()` 动态加载 + skillRegistry.register；42 个 manifest.json；静态 SKILLS 数组仅 2 处命中 | 低 |
| 7 | GA 6阶段流程完整执行 | **PASS（有保留）** | 状态机 Phase 0（访谈）→ Phase 1-5（诊断流水线）真实（conversation-engine.ts:8）；Phase 1 GraphBridge / Phase 3 Corroboration / Phase 4 ReportGraphAdapter / Phase 5 DecisionCapture 全部接线；阶段实现在 agent/ 而非 orchestrator/ | 低 |
| 8 | 执行跟踪与闭环反馈 | **PARTIAL** | tickets 表 schema + INSERT/UPDATE 路径真实（runner.ts:423/457）；feedback collector + evolution 代码存在；**生产库 sentinel_tickets=0 行、actions 表不存在、feedback_log 未初始化 → 闭环从未运转** | 中 |

---

## 详细扫描输出

（每项粘贴命令输出，保留原始 grep 结果，不做主观过滤）

### 1. 存在与身份

```bash
=== 1. 企业/租户标识 ===
288
267
---
=== 1.1 路由/中间件中的身份提取 ===
src/routes/actions-api.ts:45:  const { workspaceId, title, description, priority } = req.body as Record<string, string>;
src/routes/actions-api.ts:57:  const wsId = String(req.query.workspaceId || '');
src/routes/admin-knowledge.ts:111:    const { text, orgId } = req.body as { text?: string; orgId?: string };
src/routes/audit.ts:45:    const orgId: string = typeof req.query.orgId === "string" ? req.query.orgId : authCtx.orgId || "default";
src/routes/audit.ts:75:    const orgId: string = typeof req.query.orgId === "string" ? req.query.orgId : authCtx.orgId || "default";
src/routes/auth.ts:69:    const { email, phone, wechatId, password, role, orgId } = req.body as
src/routes/chat.ts:66:      orgId: (req.body as Record<string, unknown>)?.orgId as string || 'default',
src/routes/data-lifecycle.ts:32:  const { tenantId, role = 'boss' } = req.body as { tenantId?: string; role?: string };
src/routes/data-lifecycle.ts:59:  const { tenantId, role = 'boss', immediate = false } = req.body as {
src/routes/department-workspace.ts:13:  const token = String(_req.headers['x-synova-token'] || _req.query.token || '');
---
=== 1.2 数据库表中的租户字段 ===
exit=0
（原始命令 sqlite3 未安装，静默失败——exit=0 是管道末端 head 的退出码，非 sqlite3 退出码。python 回退结果如下）
```

**python 回退（1.2 等价查询）** — 含 org_id 列的表：

```
agent_memory -> ['org_id']
agent_sessions -> ['org_id']
audit_log -> ['org_id']
delivery_queue -> ['org_id']
knowledge_chunks -> ['org_id']
```

判定依据：任务书标准"≥10 处引用 tenant/enterprise/workspace"（实际 288+267）+ "数据库 schema 有租户字段"（5 表 org_id 列）→ **PASS**。

### 2. 上下文管理

```bash
=== 2. ConversationEngine 存在性与内容 ===
src/agent/conversation-engine.ts
conversation-engine.ts
---
=== 2.1 状态机或 turn 管理 ===
506
src/agent/convergence-engine.ts:61:export class ConvergenceEngine {
src/agent/conversation-engine.ts:258:export class ConversationEngine {
---
=== 2.2 上下文注入/提取 ===
13
0
```

文件抽查（conversation-engine.ts:256-349）——真实类实现，非接口空壳：

- `export class ConversationEngine`（:258），持有 provider/messages/phase/orgId/turnCount/toolRegistry + 20 余个编排组件字段
- 头部注释：`状态机: Phase 0 (访谈) → Phase 1-5 (诊断流水线)`（:8）
- 构造器真实接线：DiagnosisLauncher / OntologySyncer / ContextEngine / PhaseStateMachine 等子组件实例化（:294-349）
- `buildSystemPrompt(phase, turnCount, coverage, ...)` 按阶段组装系统提示（:240-254）
- 阶段推进逻辑存在降级路径：`if (this.phaseStateMachine && ...) advance() else this.phase++`（:398-406）
- TODO/FIXME/not implemented 计数 = **0**

判定依据：有 ConversationEngine 类 + 真实 turn/phase 管理 + 0 TODO → **PASS**。

### 3. 状态持久化（跨会话记忆）

```bash
=== 3. SessionStore / MemoryStore ===
src/store/session-store.ts
schema-migration.ts
session-store.ts
storage-backend.ts
packages/evolution/src/session-learner.ts
packages/test-kit/node_modules/typescript/lib/lib.es2017.sharedmemory.d.ts
packages/test-kit/node_modules/typescript/lib/lib.es2020.sharedmemory.d.ts
packages/test-kit/node_modules/typescript/lib/lib.es2024.sharedmemory.d.ts
packages/test-kit/node_modules/typescript/lib/lib.esnext.sharedmemory.d.ts
---
=== 3.1 持久化实现（SQLite/文件/Redis） ===
23
0
---
=== 3.2 数据库表结构 ===
tables-exit=1
schema-sessions-exit=127
schema-session-exit=127
---
=== 3.3 迁移文件 ===
0
```

（3.2 原始命令 sqlite3 未安装，exit=127 = command not found。python 回退结果见下。3.3：`src/store/migrations/` 目录不存在，但代码内有 `src/store/schema-migration.ts` 88 行 + session-store.ts 内联 `CREATE TABLE IF NOT EXISTS` 建表语句。）

**python 回退（3.2 等价查询）** — DB 共 52 张表，关键表 schema：

```sql
-- agent_sessions: 真实存在
CREATE TABLE agent_sessions (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        user_id TEXT,
        phase INTEGER DEFAULT 0,
        state_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )

-- agent_memory: 真实存在（含 org_id 隔离 + FTS5 全文索引表族）
CREATE TABLE agent_memory (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('fact','preference','decision','pattern','entity')),
        confidence REAL NOT NULL DEFAULT 0.5,
        source TEXT NOT NULL DEFAULT 'manual',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT,
        access_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(org_id, key)
      )
```

行数实测：`agent_sessions` 表存在（本次未查行数）、`agent_memory: 0`、`sentinel_baselines: 580`。

文件抽查（session-store.ts）——INSERT/UPDATE 路径真实：

```
session-store.ts:69:   CREATE TABLE IF NOT EXISTS agent_sessions (
session-store.ts:81:   CREATE TABLE IF NOT EXISTS agent_messages (
session-store.ts:102:  this.db.exec(`CREATE TABLE IF NOT EXISTS diagnosis_checkpoints (
session-store.ts:115:  CREATE TRIGGER IF NOT EXISTS agent_msg_fts_insert AFTER INSERT ON agent_messages ...
session-store.ts:129:  INSERT INTO agent_sessions (id, org_id, user_id, phase, created_at, updated_at) VALUES (?,?,?,0,?,?)
session-store.ts:146:  UPDATE agent_sessions SET phase=?, updated_at=? WHERE id=?
session-store.ts:199:  INSERT INTO agent_messages (session_id, role, content) VALUES (?,?,?)
session-store.ts:218:  UPDATE agent_sessions SET state_json=?, phase=?, updated_at=? WHERE id=?
```

判定依据：SQLite INSERT/UPDATE 23 处 + sessions 表（agent_sessions）+ FTS 触发器 + 代码内 schema-migration → **PASS**。备注：`agent_memory` 表 0 行——记忆表结构真实但写入路径在生产库未激活（与 K3 P2-3"findings 仅存内存"互证，见交叉引用）。

### 4. LLM 网关（Provider 切换 + 降级）

（原命令 `find src/providers/ -type f --include="*.ts"` 非法，改为 `-name "*.ts"`，等价。）

```bash
=== 4. LLM Gateway ===
src/providers/base.ts
src/providers/deepseek.ts
src/providers/detect.ts
src/providers/ernie.ts
src/providers/gateway.ts
src/providers/index.ts
src/providers/llm-provider-loader.ts
src/providers/message-sanitizer.ts
src/providers/openai.ts
src/providers/python-bridge.ts
src/providers/registry.ts
src/providers/types.ts
base.ts
deepseek.ts
detect.ts
ernie.ts
gateway.ts
index.ts
llm-provider-loader.ts
message-sanitizer.ts
openai.ts
python-bridge.ts
registry.ts
types.ts
---
=== 4.1 Provider 切换逻辑 ===
src/providers/base.ts:4: * 封装三个 Provider (deepseek/openai/gateway) 的 82 行重复代码:
src/providers/deepseek.ts:2: * providers/deepseek.ts — DeepSeek Provider 适配器
src/providers/deepseek.ts:12:const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
src/providers/deepseek.ts:13:const DEFAULT_MODEL = 'deepseek-v4-flash';
src/providers/deepseek.ts:21:    name: 'deepseek',
src/providers/deepseek.ts:93:      return [model, 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-r1'];
src/providers/detect.ts:5: * 优先顺序: Gateway > 国产模型(按检测顺序) > OpenAI > DeepSeek (默认)
src/providers/detect.ts:22:  if (process.env.LLM_BASE_URL?.includes('openai.com')) return 'openai';
src/providers/detect.ts:23:  if (process.env.OPENAI_API_KEY) return 'openai';
src/providers/detect.ts:26:  return 'deepseek';
src/providers/gateway.ts:2: * providers/gateway.ts — OpenClaw Gateway Provider 适配器
src/providers/gateway.ts:9:export function createGatewayProvider(config: ProviderConfig): LLMProvider {
src/providers/gateway.ts:20:    getHeaders: () => ({}), // Gateway 无需认证
src/providers/index.ts:5: * listProviderTypes() → ['deepseek', 'qwen', 'glm', 'kimi', 'yi', 'minimax', 'step', 'ernie', 'openai', 'gateway']
src/providers/index.ts:10:export { createDeepSeekProvider } from './deepseek';
src/providers/index.ts:11:export { createOpenAIProvider } from './openai';
src/providers/index.ts:12:export { createGatewayProvider } from './gateway';
src/providers/index.ts:16:import { createDeepSeekProvider } from './deepseek';
src/providers/index.ts:17:import { createOpenAIProvider } from './openai';
src/providers/index.ts:18:import { createGatewayProvider } from './gateway';
src/providers/index.ts:12:export { createGatewayProvider } from './gateway';
src/providers/index.ts:22:export type ProviderType = 'deepseek' | 'qwen' | 'glm' | 'kimi' | 'yi' | 'minimax' | 'step' | 'ernie' | 'openai' | 'gateway';
---
=== 4.2 降级策略 ===
18
src/providers/llm-provider-loader.ts:32:      catch (err: any) { errors.push(`${entry.name}: 解析失败`); }
src/providers/llm-provider-loader.ts-33-    }
src/providers/llm-provider-loader.ts-34-    log.info({ count: providers.length }, 'LLM 提供商加载完成');
src/providers/llm-provider-loader.ts-35-    cache = providers;
--
src/providers/llm-provider-loader.ts:37:  } catch (err: any) { log.error({ err }, 'LLM 提供商加载失败'); return { providers: [], degraded: true, errors: [err.message] }; }
src/providers/llm-provider-loader.ts-38-}
src/providers/llm-provider-loader.ts-39-export function getLLMProvider(name: string): LLMProviderManifest | null {
src/providers/llm-provider-loader.ts-40-  return loadLLMProviders().providers.find(p => p.name === name) || null;
```

补查（fallback 相关代码行全量）：

```
src/providers/base.ts:105:      signal: opts?.signal ?? AbortSignal.timeout(120_000),
src/providers/base.ts:152:        signal: AbortSignal.timeout(healthTimeout),
src/providers/deepseek.ts:40:        phase: 0, retryable: isRetryable(code),
src/providers/ernie.ts:43:    signal: AbortSignal.timeout(10_000),
src/providers/ernie.ts:126:          code, phase: 0, retryable: isRetryable(code),
src/providers/llm-provider-loader.ts:4: * ProviderType union 保留为 fallback，不删。
src/providers/llm-provider-loader.ts:21:export function loadLLMProviders(): { providers: LLMProviderManifest[]; degraded: boolean; errors: string[] } {
```

判定依据：有 Gateway 适配器（createGatewayProvider）+ 10 个 ProviderType + 启动时检测切换（detect.ts 按环境变量选择）+ 超时与 retryable 错误分类。**但**：① 无 `class Gateway`（grep `class.*Gateway` 零命中，网关是工厂函数式）；② 运行中主 Provider 失败后 catch→切换备用 Provider 的代码**不存在**——"fallback" 字面量仅出现在注释（llm-provider-loader.ts:4）；③ 无 circuit breaker。→ **PARTIAL**（切换在启动时做，不在失败时做）。

### 5. MCP 协议（工具调用标准化）

（原命令 `find src/ -name "*mcp*" --include="*.ts"` 非法，改为 `-name "*.ts"` 与 `-name "*mcp*"` 组合；find 结果为空是真实的——mcp 相关文件名不含 "mcp" 字样，mcp 是目录名。）

```bash
=== 5. MCP 协议 ===
5
bridge.ts
index.ts
skill-audit-gate.ts
skill-installer.ts
tool-registration.ts
---
=== 5.1 MCP 相关代码 ===
48
src/agent/builtin-tools.ts:271:        const { getSkillInstaller } = await import('../mcp/skill-installer');
src/agent/builtin-tools.ts:272:        const { getMCPBridge } = await import('../mcp/bridge');
src/agent/builtin-tools.ts:274:        const installer = getSkillInstaller('vendor/mcp-servers');
src/agent/builtin-tools.ts:280:          `vendor/mcp-servers/${skillName}`,
src/agent/tools.ts:252:    const PREFIXES: readonly string[] = ['browser_', 'mcp_', 'connector_'];
src/agent-observer/types.ts:21:  | 'mcp'
src/deploy/bootstrap.ts:1239:            const { registerMCPTools } = await import('../mcp/tool-registration');
src/deploy/bootstrap.ts:1241:            const mcpRegistry = new MCPToolRegistry();
src/deploy/bootstrap.ts:1242:            ctx.set('mcpToolRegistry', mcpRegistry);
src/deploy/bootstrap.ts:1244:            registerMCPTools(mcpRegistry).then(() => {
---
=== 5.2 工具注册方式 ===
77
31
```

补查（ModelContextProtocol 字面量）：

```
MCP-literal-count=0
```

文件抽查（mcp/bridge.ts 头部）——真实桥接实现：

```
 * mcp/bridge.ts — MCP 桥接层 (Task 1)
 * 铁律 39: L5 组件。通过子进程 JSON-RPC 调用 MCP Server。
 * ToolRegistry 通过此桥接层将 MCP 工具暴露为 agent tools。
 * 架构:
 *   ToolRegistry → MCPBridge → child_process (stdio) → MCP Server (vendor/mcp-servers/)
 * 支持的 MCP Server:
 *   - Brave Search: 网页搜索
 *   - GitHub: 仓库/PR/Issue 访问
 *   - Filesystem: 文件操作 (受限 sandbox)
 *   - Memory: 知识图谱持久化
```

判定依据：有 src/mcp/ 目录 5 文件 + MCPToolRegistry + registerMCPTools 生产接线（bootstrap.ts:1241）+ 子进程 JSON-RPC 桥接 4 类 vendor MCP server。**但** ModelContextProtocol 官方协议字面量 0 命中——是自研 JSON-RPC 桥接（架构同 MCP 模式），未用官方 MCP SDK。→ **PARTIAL**。

### 6. Skill 动态加载

```bash
=== 6. Skill 动态加载 ===
29
2
---
=== 6.1 Skill 目录结构 ===
3
41
42
---
=== 6.2 Skill 加载代码 ===
src/agent/builtin-tools.ts:277:        if (!match) return { error: `未找到 Skill: ${skillName}。可用: ${manifests.map(m => m.name).join(', ') || '无'}` };
src/agent/expert-router.ts:72:   * 1. 加载 expert/{type}/manifest.json
src/agent/expert-router.ts:137:      const manifestPath = path.join(this.expertsDir, expertType, 'manifest.json');
src/agent/expert-router.ts:139:        log.warn({ expertType }, '专家 manifest.json 不存在');
src/agent/prompt-assembler.ts:4: * 消费 D53 expert manifest.json，按专家类型+任务类型按需组装6个
src/agent/prompt-assembler.ts:24: /** D53专家manifest结构（核心字段，manifest.json的可消费子集） */
src/agent/prompt-assembler.ts:543:  const manifestPath = join(root, 'expert', expertType, 'manifest.json');
src/agent/prompt-assembler.ts:598: * @param expertType - 专家类型名，对应 expert/{type}/manifest.json（如 finance, tech, org）
src/l3/business-model-loader.ts:21:    for (const file of readdirSync(BM_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json')) {
src/l3/framework-loader.ts:44: /** 从 manifest.json 动态读取类别列表，不硬编码 */
src/agent/builtin-tools.ts:271:        const { getSkillInstaller } = await import('../mcp/skill-installer');
src/agent/skill-lazy-loader.ts:100:      const { readdirSync } = require('fs') as typeof import('fs');
src/deploy/bootstrap.ts:412:      const { loadSkills, registerLoadedSkills } = await import('../skill/skill-loader');
src/mcp/skill-installer.ts:61:        const content = fs.readFileSync(skillMdPath, 'utf-8');
src/mcp/skill-installer.ts:115:            const impl = await import(path.resolve(skillDir, manifest.entryPoint || 'index.js'));
src/mcp/skill-installer.ts:126:        const { getExpertRegistry } = await import('../l3/expert-registry');
src/skill/skill-loader.ts:189:      const { skillRegistry } = await import('./skill-registry');
src/skills/skill-loader.ts:55:  for (const entry of fs.readdirSync(skillsDir)) {
src/skills/skill-loader.ts:59:        const content = fs.readFileSync(skillPath, 'utf-8'); 
```

补查（skill-loader.ts 动态加载核心）：

```
skill-loader.ts:15:   import { readdirSync, readFileSync, existsSync } from 'fs';
skill-loader.ts:114:  const entries = readdirSync(root, { withFileTypes: true });
skill-loader.ts:181:  export async function registerLoadedSkills(): Promise<{ registered: number; errors: string[] }> {
skill-loader.ts:189:        const { skillRegistry } = await import('./skill-registry');
skill-loader.ts:190:        skillRegistry.register(skill);
skill-loader.ts:199:  if (registered > 0) log.info({ registered, errors: errors.length }, '文件驱动 Skill 已注册');
```

判定依据：动态加载类命中 29 处（SkillRegistry / await import / loadSkill），静态硬编码类（const SKILLS / require skill）仅 2 处；extensions/skills/builtin/ 41 个技能 + 42 个 manifest.json；加载路径 = 文件系统扫描（readdirSync）→ 动态 import → registry.register。→ **PASS**。

### 7. GA（增长顾问）6阶段流程完整执行

```bash
=== 7. GA（增长顾问）流程阶段 ===
67
97
---
=== 7.1 GA 编排函数 ===
src/orchestrator/hook-runner.ts:113:export function createPermissionHook(allowedTools?: string[]): PreToolUseHook {
src/orchestrator/hook-runner.ts:126:export function createEvidenceHook(onEvidence: (toolName: string, content: string) => void): PostToolUseHook {
src/orchestrator/hook-runner.ts:136:export function createAuditHook(onAudit: (toolName: string, action: string, result: string) => void): PostToolUseHook {
src/orchestrator/phase-gate-check.ts:45:export function registerPhaseGateChecks(
src/orchestrator/wiring.ts:57:export function createOrchestrationWiring(
---
=== 7.2 阶段间数据传递 ===
0
```

（7.1 第一条 grep `runGA|runDiagnosis|runAdvisor|orchestrate` 在 src/orchestrator/ 零命中；7.2 的 `context.*pass|state.*transfer|result.*next` 零命中。补查结果见下——阶段实现在 src/agent/，不在 orchestrator/。）

补查（6 阶段真实位置 + 各阶段接线证据）：

```
src/agent/conversation-engine.ts:8:   * 状态机: Phase 0 (访谈) → Phase 1-5 (诊断流水线)
src/agent/conversation-engine.ts:75:  /** L4: GraphBridge (Phase 1 自动写入本体图) */
src/agent/conversation-engine.ts:79:  /** L4: ReportGraphAdapter (Phase 4 报告从图读取) */
src/agent/conversation-engine.ts:81:  /** L3: CorroborationEngine (Phase 3 矛盾检测+交叉验证) */
src/agent/conversation-engine.ts:83:  /** L3: DecisionCapture callback (Phase 5 用户确认/驳回根因) */
src/agent/conversation-engine.ts:87:  /** L4: enable automated entity resolution after diagnosis (Phase 3a) */
src/agent/conversation-engine.ts:89:  /** L4: enable community reports after GraphBridge sync (Phase 2b) */
src/agent/conversation-engine.ts:91:  /** L4: enable triple reflection after diagnosis (Phase 3b) */
src/agent/conversation-engine.ts:106: /** Phase 0 是否完成，可以推进到 Phase 1 */
src/agent/conversation-engine.ts:179:      return `## 当前阶段：Phase 1（数据采集）
src/agent/conversation-engine.ts:369:  /** Phase 5: Record user decision on a root cause node */
src/agent/conversation-engine.ts:470:   * Phase 1-5: tool-call loop.
src/agent/conversation-engine.ts:601:    // Phase 1-5: 工具调用循环
src/agent/conversation-engine.ts:38:import { DiagnosisLauncher, type DiagnosisEvent, type ConsultationResult } from './diagnosis-launcher';
src/agent/conversation-engine.ts:295:  private diagnosisLauncher: DiagnosisLauncher;
src/agent/conversation-engine.ts:360:    this.diagnosisLauncher = new DiagnosisLauncher(engineCtx, diagnosisEngine);
src/agent/conversation-engine.ts:660:  // ═══ Diagnosis Orchestrator Integration (delegated to DiagnosisLauncher) ═══
src/agent/diagnosis-launcher.ts:47:export class DiagnosisLauncher {
```

判定依据：6 阶段全部有代码（Phase 0 访谈、Phase 1 数据采集+写本体图、Phase 2b 社区报告、Phase 3 矛盾检测+交叉验证、Phase 4 报告从图读取、Phase 5 用户确认根因）+ PhaseStateMachine 推进 + DiagnosisLauncher 编排集成（:660）。→ **PASS**，保留两点：① 阶段实现在 `src/agent/`（L2），不在任务书指定的 orchestrator/ 目录，故该目录 grep 零命中是目录假设错误而非实现缺失；② 阶段间数据传递无显式 `state.transfer` 命名函数，走共享 `EngineContext` + `this.messages` 传递——K3 全链路审计已证明此管线在 L4 契约/L5 连接器处断裂（见交叉引用），但断裂点不在阶段编排本身。

### 8. 执行跟踪与闭环反馈

```bash
=== 8. 执行跟踪 ===
128
2
---
=== 8.1 反馈与进化 ===
99
5
---
=== 8.2 数据库中的跟踪表 ===
tables-exit=1
tickets-exit=127
actions-exit=127
```

（8.2 原始命令 sqlite3 未安装，exit=127 = command not found。python 回退结果见下。）

**python 回退（8.2 等价查询）**：

```
=== schema sentinel_tickets（表存在，结构真实） ===
CREATE TABLE sentinel_tickets (
          id TEXT PRIMARY KEY,
          signal_id TEXT NOT NULL,
          severity TEXT NOT NULL CHECK(severity IN ('critical','warning','info')),
          expert_type TEXT NOT NULL,
          diagnosis TEXT,
          suggested_actions TEXT,
          status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','dismissed')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          resolved_at TEXT
        )

=== 行数实测 ===
sentinel_tickets: 0
actions: ERROR no such table: actions
feedback_log: ERROR no such table: feedback_log
sentinel_baselines: 580
```

补查（tickets 写入/状态流转代码路径 + 反馈表代码）：

```
src/routes/sentinel.ts:86:// ═══ GET /api/sentinel/tickets ═══
src/sentinel/runner.ts:154:        CREATE TABLE IF NOT EXISTS sentinel_tickets (
src/sentinel/runner.ts:423:          `INSERT OR REPLACE INTO sentinel_tickets (id, signal_id, severity, expert_type, diagnosis, suggested_actions, status, created_at)
src/sentinel/runner.ts:457:            `UPDATE sentinel_tickets SET status = 'resolved', resolved_at = datetime('now')
src/growth/feedback-collector.ts:104:CREATE TABLE IF NOT EXISTS feedback_log (
src/growth/feedback-collector.ts:120:CREATE TABLE IF NOT EXISTS schema_version (version TEXT PRIMARY KEY);
```

判定依据：跟踪代码真实（tickets 表 + open/acknowledged/resolved/dismissed 状态机 + INSERT/UPDATE 路径 + feedback_log/evolution 代码）。**但生产库实测**：sentinel_tickets **0 行**、actions 表**不存在**、feedback_log 表**未初始化**（代码内 CREATE TABLE IF NOT EXISTS 惰性建表，从未执行）→ 闭环机制存在但**从未真实运转**。→ **PARTIAL**。

---

## 总体判定

- **真实能力数**：**5/8**（#1 身份隔离、#2 上下文状态机、#3 状态持久化、#6 Skill 动态加载、#7 GA 6 阶段）
- **部分实现数**：**3/8**（#4 LLM 网关、#5 MCP 协议、#8 执行跟踪闭环）
- **疑似空壳数**：**0/8** —— 8 项能力全部有真实代码，无文档虚构
- **关键缺口**：
  1. **LLM 网关无运行时降级**：Provider 切换只在启动时按环境变量检测（detect.ts），主 Provider 调用失败时无 catch→切换备用 Provider 的 failover 逻辑，无 circuit breaker。"DeepSeek 挂了自动切 OpenAI"当前**不成立**。
  2. **MCP 是自研 JSON-RPC 桥接**，非官方 ModelContextProtocol SDK（字面量 0 命中）。标准化模式在，协议互通性不在。
  3. **执行跟踪闭环从未运转**：sentinel_tickets 0 行 + actions 表不存在 + feedback_log 未初始化。代码是真代码，但生产数据证明"建议发出→跟踪→回流"从未发生（与 K3 P0-1/P2-3 互证）。
  4. 附带发现：`agent_memory` 表 0 行——跨会话记忆的表结构真实，但生产库无任何记忆写入。

## 与诊断链路审计的交叉引用

| 基础设施能力 | 诊断链路审计关联 |
|------------|----------------|
| 状态持久化 | K3 报告：哨兵基线 580 行 ✅，但 findings 内存丢失 ❌。本次 DB 实测**复现**：`sentinel_baselines = 580`（基线写入路径活着），同时 `agent_memory = 0`、findings 无持久化表（K3 P2-3 确认仅存 runner 内存） |
| 执行跟踪 | K3 报告：sentinel_tickets 表 0 行 → 与 P0-1 死代码互证。本次 DB 实测**复现并加深**：sentinel_tickets = 0 行，且 actions 表**根本不存在**、feedback_log 表未初始化（K3 P2-3 仅提到 tickets 0 行，未覆盖 actions/feedback_log 缺失） |
| GA 6阶段 | K3 未判 6 阶段为空壳（其 FAIL 结论断裂点在 L4 数据契约 + L5 连接器，0/3 循环贯通）。本次确认阶段编排代码真实（conversation-engine.ts Phase 0→1-5），与 K3 结论**一致**：阶段管线存在，断在数据契约而非阶段缺失 |
| LLM 网关 | 与 K3 §2.2 同构模式：L5 管线架构存在（connector-pipeline 已接线）但连接器缺失——本次发现网关同样"骨架真实、关键韧性缺失"（无运行时 failover） |

---

## 验收自查

1. ✅ 8 项命令全部执行，输出粘贴到报告（含 3 处命令适配的诚实说明 + python 回退等价查询）
2. ✅ 每项有 PASS/PARTIAL/FAIL 判定（5 PASS / 3 PARTIAL / 0 FAIL）
3. ✅ 原始 grep 结果保留，不做主观过滤（sqlite3 静默失败的 exit 码同样保留并解释）
4. ✅ 输出文件：`docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md`

## 交接

- 本报告为**物理扫描证据**，不做最终审计判定。最终判定由 Kimi K3（代码审计 session）输出 `AGENT-INFRASTRUCTURE-AUDIT-20260814.md`。
- K3 可复核入口：
  - `grep -rn "tenantId\|enterpriseId\|orgId\|workspaceId" src/agent/ src/routes/ src/store/ --include="*.ts" | wc -l` → 288
  - `grep -c "ModelContextProtocol" src/ --include="*.ts"` → 0
  - `python -c "import sqlite3; print(sqlite3.connect('data/synova.db').execute('SELECT COUNT(*) FROM sentinel_tickets').fetchone())"` → (0,)
  - `grep -rn "fallback" src/providers/ --include="*.ts"` → 仅注释 1 处
