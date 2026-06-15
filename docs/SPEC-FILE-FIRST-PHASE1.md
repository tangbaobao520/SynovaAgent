# SPEC: 文件优先范式 — Phase 1 任务规格

> 给另一个 Claude Code 实例。每个任务含接口签名、Done 标准、不能碰的代码。
> 版本: v1.0 — 2026-06-15
> 分支: `feat/file-first-phase1` (从 `feat/prompt-architecture` 分出)
> 前置: 已读 CLAUDE.md + LOOP-ENGINEERING-SETUP-GUIDE.md

---

## 通用约束（所有任务遵守）

### 铁律（pre-commit 38 项物理阻断）
```
❌ as any         — 零容忍
❌ Mock/TODO 残留  — 零容忍
❌ 空 catch 无 log  — 阻断, 必须 log.warn/log.error + degraded
❌ 新文件无测试    — 阻断, 每条 export 必须对应 expect()
❌ 新 export 零引用 — 阻断, 必须在 src/server.ts 或 src/routes/ 中有调用点
```

### 架构边界
```
新代码放在 src/ 下对应层级:
- L1 (交互): src/routes/
- L2 (编排): src/agent/ 或 src/orchestrator/
- L3 (洞察): src/l3/
- L4 (本体): src/l4/  ← 不要直接写 SQL, 走 GraphStore 接口
- L5 (存储): src/store/ 或 src/services/

禁止跨层引用: L1→L3/L4/L5, L2→L4/L5, L3→L5
```

### 误差处理
```typescript
// 每个 catch 必须:
catch (err: unknown) {
  log.warn({ err }, '描述 — degraded');  // 或者 log.error
  return { degraded: true, ... };         // 返回降级值
}
```

---

## 任务 C2: 上下文预算追踪器

### 目标
追踪每次 LLM 调用的 token 消耗，提供预算感知能力。
对标: OpenClaw 的 context-budget.ts

### 新建文件
```
src/services/context-budget-tracker.ts         ← 主模块
tests/services/context-budget-tracker.test.ts  ← 测试
```

### 接口签名（必须精确匹配）

```typescript
// src/services/context-budget-tracker.ts

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** 缓存命中的 prompt tokens (OpenAI-compatible) */
  cachedPromptTokens?: number;
}

export interface BudgetSnapshot {
  /** 当前累计 token 消耗 */
  totalSpent: number;
  /** 调用次数 */
  callCount: number;
  /** 缓存命中率 (0-1) */
  cacheHitRate: number;
  /** 按模型分组的消耗 */
  byModel: Record<string, { spent: number; calls: number }>;
  /** 时间窗口内的消耗速率 (tokens/min) */
  burnRate: number;
}

export class ContextBudgetTracker {
  /**
   * 记录一次 LLM 调用的 token 消耗。
   * provider.chat() / provider.stream() 返回的 usage 字段传入此处。
   */
  record(usage: TokenUsage, model?: string): void;

  /**
   * 返回当前预算快照。
   * 典型用法: GET /api/status/budget 路由调用。
   */
  snapshot(): BudgetSnapshot;

  /**
   * 检查是否会超出预算。
   * @param limit — 预算上限 (tokens)
   * @param estimatedNextCall — 预估下次调用消耗
   * @returns true 如果超出
   */
  wouldExceed(limit: number, estimatedNextCall: number): boolean;

  /** 重置追踪器 (用于测试) */
  reset(): void;
}

/** 获取全局单例 */
export function getBudgetTracker(): ContextBudgetTracker;
```

### 接线要求（Done 标准的一部分）
- [ ] `src/server.ts` 中 `app.locals.budgetTracker = getBudgetTracker()`
- [ ] `src/routes/` 中新增 `GET /api/status/budget` 返回 `budgetTracker.snapshot()`
- [ ] 在 `src/adapters/engine-core-adapter.ts` 的 LLM 调用后调用 `budgetTracker.record()`

### 不能碰的文件
- `src/l4/*` — 不涉及本体层
- `src/l3/*` — 不涉及专家系统
- `packages/engine-core/*` — vendor 包，不动

---

## 任务 C3: 渐进式技能加载器

### 目标
技能注册时先只注入 name + description（~100 chars）。专家 ReAct 循环中请求使用该技能时，再加载完整 prompt。
对标: OpenClaw 的三级 Skill 加载 (workspace > user-global > built-in)

### 新建文件
```
src/agent/skill-lazy-loader.ts         ← 主模块
tests/agent/skill-lazy-loader.test.ts  ← 测试
```

### 接口签名

```typescript
// src/agent/skill-lazy-loader.ts

export interface SkillStub {
  name: string;
  description: string;         // ≤ 200 chars — 注入到上下文的摘要
  fullPrompt?: string;         // 完整 prompt — 按需加载
  /** 加载来源 */
  source: 'builtin' | 'workspace' | 'custom';
  /** 文件路径 (workspace 来源时) */
  filePath?: string;
  /** 激活条件 — 什么情况下这个 skill 应该被加载 */
  activationKeywords?: string[];
}

export class SkillLazyLoader {
  /**
   * 注册一个 skill (只存 stub)。
   * 来源: 扫描 expert/{name}/SKILLS.md 或 knowledge/ 目录
   */
  register(stub: SkillStub): void;

  /**
   * 根据专家查询, 返回匹配的 skill stub 列表 (不含 fullPrompt)。
   * 用于注入到专家的 system prompt 中作为"可用技能目录"。
   */
  listForExpert(expertType: string): SkillStub[];

  /**
   * 按需加载完整 prompt — 专家 ReAct 循环中调用。
   * 命中则返回 fullPrompt, 未命中返回 null。
   */
  loadFull(name: string): string | null;

  /**
   * 从文件系统扫描 skills (workspace > built-in 优先级)。
   * 扫描路径: expert/{name}/SKILLS.md, knowledge/*.md
   */
  scanFromFiles(baseDir: string): number;  // 返回加载的 skill 数量

  /** 获取可注入上下文的摘要文本 (用于拼接到 system prompt) */
  buildCatalogText(expertType: string): string;

  /** 三级加载: workspace > user-global > built-in */
  resolveWithPriority(name: string): SkillStub | null;
}
```

### 接线要求
- [ ] `SkillLazyLoader` 在 `src/server.ts` 中初始化, 存入 `app.locals`
- [ ] `ExpertDispatcher` 在构建专家上下文时调用 `loader.buildCatalogText(expertType)`
- [ ] `ExpertAutonomy` ReAct 循环中: 匹配到 skill 关键词 → `loader.loadFull(name)` → 注入

### 不能碰的文件
- `packages/engine-core/*` — vendor 包
- `src/l3/expert-autonomy.ts` — 只新增调用, 不改内部逻辑
- `src/l3/expert-dispatcher.ts` — 只新增一行 `buildCatalogText` 调用

---

## 任务 C4: 多策略上下文压缩器

### 目标
当前单一压缩策略撑不住长时间对话。实现 3 种可选策略。
对标: OpenClaw 的 context-compression.ts

### 新建文件
```
src/orchestrator/context-compressor.ts         ← 主模块
tests/orchestrator/context-compressor.test.ts  ← 测试
```

### 接口签名

```typescript
// src/orchestrator/context-compressor.ts
import type { LLMMessage } from '../providers/types';

export type CompressionStrategy = 'sliding-window' | 'summary' | 'selective';

export interface CompressionConfig {
  strategy: CompressionStrategy;
  /** 滑动窗口: 保留最近 N 条消息 */
  windowSize?: number;
  /** summary: 压缩后保留的最大 token 数 */
  maxSummaryTokens?: number;
  /** selective: 保留的关键词列表 (匹配到的消息不压缩) */
  selectiveKeywords?: string[];
}

export interface CompressionResult {
  messages: LLMMessage[];
  discardedCount: number;
  strategy: CompressionStrategy;
  /** 压缩后 token 估算 */
  estimatedTokens: number;
}

export class ContextCompressor {
  /**
   * 压缩消息列表。
   * @param messages — 完整消息历史
   * @param systemPrompt — system prompt (不参与压缩)
   * @param config — 压缩策略配置
   */
  compress(
    messages: LLMMessage[],
    systemPrompt: string,
    config: CompressionConfig,
  ): CompressionResult;

  /**
   * 估算消息列表的 token 数。
   * 粗略规则: 英文 1 token/4 chars, 中文 1 token/1.5 chars
   */
  estimateTokens(messages: LLMMessage[]): number;

  /** 获取当前策略的名称 */
  getActiveStrategy(): CompressionStrategy;
}
```

### 接线要求
- [ ] `ConversationEngine` 在 `processMessage()` 中, 消息数 > 阈值时调用 `compressor.compress()`
- [ ] 压缩策略通过 `synova.json` 配置 (与 C5 配合)
- [ ] `GET /api/status/context` 返回当前上下文状态 (消息数 + token 估算)

### 不能碰的文件
- `src/l3/*` — 不涉及专家层
- `src/l4/*` — 不涉及本体层
- `packages/engine-core/*` — vendor 包

---

## 任务 C5: synova.json 集中配置 + last-good 回滚

### 目标
从环境变量驱动 → 文件驱动。配置文件像代码一样版本管理。
对标: OpenClaw 的 openclaw.json + openclaw.json.last-good

### 新建文件
```
synova.json                              ← 项目根目录, 默认配置模板
src/config-file.ts                       ← 配置文件加载器
tests/config-file.test.ts                ← 测试
```

### 配置结构（synova.json 模板）

```json
{
  "version": 1,
  "server": {
    "port": 18789
  },
  "llm": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "baseUrl": "https://api.deepseek.com/v1"
  },
  "database": {
    "path": "./data/synova.db"
  },
  "diagnosis": {
    "maxExpertConcurrency": 6,
    "maxToolRounds": 3,
    "toolTimeoutMs": 60000
  },
  "context": {
    "compressionStrategy": "sliding-window",
    "maxMessagesBeforeCompression": 30,
    "windowSize": 20
  },
  "devMode": false
}
```

### 接口签名

```typescript
// src/config-file.ts

export interface SynovaFileConfig {
  version: number;
  server: { port: number };
  llm: { provider: string; model: string; baseUrl: string };
  database: { path: string };
  diagnosis: {
    maxExpertConcurrency: number;
    maxToolRounds: number;
    toolTimeoutMs: number;
  };
  context: {
    compressionStrategy: 'sliding-window' | 'summary' | 'selective';
    maxMessagesBeforeCompression: number;
    windowSize: number;
  };
  devMode: boolean;
}

/**
 * 加载 synova.json, 失败则降级到环境变量。
 * 加载顺序: synova.json > synova.json.last-good (如果主文件损坏) > 环境变量
 */
export function loadFileConfig(): SynovaFileConfig;

/**
 * 保存当前配置到 synova.json。
 * 保存前自动备份: synova.json → synova.json.last-good
 */
export function saveFileConfig(config: SynovaFileConfig): void;

/**
 * 回滚到上一次正常配置。
 * synova.json.last-good → synova.json
 */
export function rollbackConfig(): SynovaFileConfig;

/**
 * 验证配置文件结构和值范围。
 * 返回错误列表, 空数组 = 有效。
 */
export function validateConfig(config: unknown): string[];
```

### 接线要求
- [ ] `src/config.ts` 中 `loadConfig()` 优先调用 `loadFileConfig()`, 失败降级环境变量
- [ ] `POST /api/reload` (F3 任务) 调用 `loadFileConfig()` 重新加载
- [ ] 启动时如果 `synova.json` 损坏, 自动回滚到 `synova.json.last-good` + 打 log.error
- [ ] `synova.json` 加入 `.gitignore`? 不 — 模板提交, 密钥不提交 (API Key 仍走环境变量)

### 不能碰的文件
- `src/l4/*` — 不涉及本体层
- `packages/engine-core/*` — vendor 包

---

## 任务 C6: CLI 管理体系

### 目标
`synova` CLI 命令行工具, 覆盖管理操作。
对标: OpenClaw 的 60+ 子命令 CLI

### 新建文件
```
src/cli-manager.ts                  ← CLI 入口 (注册命令)
src/cli/commands/expert.ts          ← expert 子命令
src/cli/commands/measurer.ts        ← measurer 子命令
src/cli/commands/knowledge.ts       ← knowledge 子命令
src/cli/commands/config-cmd.ts      ← config 子命令
tests/cli-manager.test.ts           ← 测试
```

### 命令结构

```
synova expert list                  # 列出所有已注册专家
synova expert show <type>           # 查看某专家的 prompt
synova expert create <type>         # 交互式创建新专家 (写文件到 expert/{type}/)
synova expert edit <type>           # 编辑某专家的 SOUL.md (打开编辑器)
synova expert delete <type>         # 删除自定义专家 (不能删内置 7+ 专家)

synova measurer list                # 列出所有测量器
synova measurer show <id>           # 查看某测量器的配置
synova measurer set-threshold <id> <value>  # 设置阈值

synova knowledge add <industry> <file>  # 添加行业知识文件
synova knowledge list                   # 列出所有行业知识

synova config show                  # 显示当前完整配置
synova config set <key> <value>     # 修改配置项
synova config rollback              # 回滚到 last-good

synova reload                       # 热加载 (等价于 POST /api/reload)
synova status                       # 显示系统状态 (预算/上下文/哨兵/专家)
```

### 接口签名

```typescript
// src/cli-manager.ts

export interface CLICommand {
  name: string;
  description: string;
  /** 子命令: 'list' | 'show' | 'create' | 'edit' | 'delete' | 'set' */
  subcommands: string[];
  handler: (args: string[]) => Promise<void>;
}

export class CLIManager {
  /** 注册一个顶级命令 */
  register(command: CLICommand): void;

  /** 解析并执行命令行参数 */
  execute(argv: string[]): Promise<void>;

  /** 打印帮助信息 */
  printHelp(): void;
}
```

### 实现要求
- **零外部依赖**: 不用 commander/yargs。用 `process.argv` 手动解析。保持轻量。
- **文件操作**: 通过命令行直接读写文件系统。不经过 HTTP API（CLI 是本地工具）。
- **错误处理**: 文件不存在 → 友好提示, 不崩。权限不够 → 友好提示。
- **交互式创建**: `synova expert create` 用 readline 逐字段询问 (名称/描述/维度/风格)。

### package.json 修改
```json
{
  "bin": {
    "synova": "./dist/cli-manager.js"
  }
}
```
使 `npm link` 后 `synova` 命令全局可用。

### 接线要求
- [ ] `package.json` 中添加 `"bin": { "synova": "./dist/cli-manager.js" }`
- [ ] CLI 命令不能依赖 Express server 运行
- [ ] `synova status` 通过 HTTP 调 `localhost:{port}/api/status/budget` (与 C2 配合)

### 不能碰的文件
- `src/cli.ts` — 现有 TUI CLI, 不动（C6 是新增管理 CLI, 不同的工具）
- `src/server.ts` — 不动
- `packages/engine-core/*` — vendor

---

## 任务 E2: 专家文件模板 + Tool Profiles

### 新建文件
```
expert/_template/
├── IDENTITY.md          ← 模板: 角色名称 + 诊断领域
├── SOUL.md              ← 模板: 诊断风格 + 方法论
├── TOOLS.md             ← 模板: 可用工具列表
├── RULES.md             ← 模板: 诊断规则 + 评分指南
└── KNOWLEDGE.md         ← 模板: 依赖的领域知识

src/agent/tool-profiles.ts          ← Tool Profiles 分级
tests/agent/tool-profiles.test.ts   ← 测试
```

### Tool Profiles 接口

```typescript
// src/agent/tool-profiles.ts

export type ToolProfile = 'minimal' | 'diagnosis' | 'full';

export interface ProfileConfig {
  /** 允许的工具名列表 */
  allowedTools: string[];
  /** 最大工具调用轮次 */
  maxRounds: number;
  /** 允许的 ToolGuardrails 级别 */
  guardLevel: 'strict' | 'moderate' | 'permissive';
}

export const TOOL_PROFILES: Record<ToolProfile, ProfileConfig>;

/**
 * 根据角色获取工具配置。
 * admin → full, FDE → diagnosis, employee → minimal
 */
export function getProfileForRole(role: string): ProfileConfig;
```

### 接线
- [ ] Tool Profiles 在 `ToolGuardrails` 中消费 — 不同角色不同工具权限
- [ ] 模板文件是纯 Markdown, FDE 可以直接编辑

---

## 验收清单（另一个 Claude 完成全部 6 个任务后）

- [ ] `npx tsc --noEmit` — 零错误
- [ ] `npm run test` — 全量通过
- [ ] `npm run check:iron-laws` — 全部通过
- [ ] `npm run check:wire-full` — 全部通过
- [ ] `npm run check:vertical-slice` — 全部通过
- [ ] 每个新文件有对应测试, 每个 export 有 expect() 断言
- [ ] 每个 catch 有 log.warn/log.error + degraded
- [ ] `src/server.ts` 中可见新模块的导入和使用
- [ ] 无 as any, 无 Mock/TODO

---

## 需要的现有接口参考（已确认真实存在）

```typescript
// 你可以直接 import 的:

// 日志
import { createLogger } from '../logger';
const log = createLogger('your-module');

// LLM Provider (用于 token 统计)
import type { LLMProvider, LLMMessage } from '../providers/types';
// LLMProvider.chat(messages, options?) → Promise<ChatResult>
// ChatResult.content, ChatResult.usage?.prompt_tokens, completion_tokens

// 配置
import { loadConfig, type SynovaConfig } from '../config';

// 专家注册
import { getExpertRegistry } from '../l3/expert-registry';
const registry = getExpertRegistry();
// registry.register(type, prompt)
// registry.getPrompt(type) → string | undefined
// registry.listTypes() → string[]

// 工具注册
import { ToolRegistry } from '../agent/tools';
// registry.register(tool)
// registry.list() → ToolDefinition[]

// 会话存储
import type { SessionStore } from '../store/session-store';
// store.saveDiagnosisCheckpoint(...)
// store.getDiagnosisCheckpoint(id)

// 数据库 (如果需要)
import { getDatabase } from '../init/engine-context';
const db = getDatabase();  // → Database.Database
```
