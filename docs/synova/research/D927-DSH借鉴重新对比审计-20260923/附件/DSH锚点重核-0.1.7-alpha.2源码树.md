# DSH 锚点重核表（B-11…B-15）— `0.1.7-alpha.2` **TS 源码树**断面

> **性质**：只读审计。未改 DSH 任何文件、未改安装目录、未 `npm install`、未 copy 代码（引用只到 文件路径 + 行号 + 符号 + ≤120 字符极短片段）。
> **日期**：2026-09-23
> **上一版**：[DSH锚点重核-0.1.6-alpha.2.md](DSH锚点重核-0.1.6-alpha.2.md)（错的断面：打包运行时 tarball + esbuild 产物）
> **本版纠正**：断面换成源码树；旧锚点的「npm 包名 + `lib/index.js` 产物行号」**全部作废**，换成 `packages/<组>/<包>/src/*.ts` + 行号。
> **配套**：[DSH借鉴卡重新对比审计.md](DSH借鉴卡重新对比审计.md)｜借卡原件：`/Users/wane/SynovaAgent/docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md` §4（:95-99）+ §11.3（:246-250）

---

## 〇 取证断面（钉死）

唯一断面：

```
R = /Users/wane/src/deepseek-harness-017
```

| 项 | 实测值 | 复现命令 |
|---|---|---|
| HEAD | `00102833dfaee1da9f48a3a8eae9d34005a75218` | `git rev-parse HEAD` |
| HEAD 提交 | `Merge pull request #4978 … release-dsh-0.1.7-alpha.2`，2026-09-22 23:25:38 +0800 | `git log -1 --format='%H %ad %s' --date=iso` |
| 工作树 | **0 脏**（`git status --porcelain` 空输出） | `git status --porcelain` |
| 版本 | 三处 `package.json` 均 `0.1.7-alpha.2` | 逐包读 `version` |
| 布局 | `packages/<组>/<包>/src/*.ts` | — |
| 含 `src/` 的包目录 | **307** | `find packages -mindepth 3 -maxdepth 3 -type d -name src \| wc -l` |
| 组数 | **54 个组目录** | `ls -1p packages/ \| grep '/$' \| wc -l` |
| `dsh-` 前缀包名 | 无（源码目录名无前缀，npm 名仍是 `@deepseek-ai/dsh-*`） | `node -e "console.log(require('./packages/mcp/mcp-client/package.json').name)"` |

**⚠️ 对派发口径的两处修正（实测，非推测）：**

1. **「60 个组」不准确**：`packages/` 顶层共 **60 个条目**，其中 **54 个是组目录**，另 6 个是文件（`AGENTS.md` `CLAUDE.md` `README.i18n.yaml` `README.md` `README.zh.md` `tsdown.worker.ts`）。组数应记 **54**。「307 个含 `src/` 的包目录」**完全准确**。
2. **`git log` 在本断面不可用作历史证据** —— `git rev-parse --is-shallow-repository` → **`true`**，`git rev-list --count HEAD` → **`1`**。**本仓是单 commit 浅克隆**。任何「某文件历史上是否存在过」的判断在本断面**不可证**（详见 §四 反例 2 与 §五 未核实 U1）。这一条直接推翻了上一版的「B-14 `spec.js` 自始不成立」。

**判定四值**：**命中**（文件+符号都在，行号可能变）／**位移**（符号仍在，路径或行号变了）／**被上游取代**（旧锚点消失，功能由别处承担，给定新承担者 `file:line`）／**已消失**（找不到等价物）。

---

## 一 逐卡锚点重核表

| B# | 旧锚点（npm 包 + lib 文件 + 符号） | 新源码路径 `file:line` | 符号是否存在 | 语义是否变化 | 判定 |
|---|---|---|---|---|---|
| **B-11**① | `dsh-mcp-client` `lib/index.js` — 双 transport（stdio / StreamableHTTP） | `packages/mcp/mcp-client/src/transport.ts:31-45`（`createTransport`）；stdio 分支 `:34`、http 分支 `:41` | ✔ | **是**。transport 层本身只是官方 SDK 类型化的薄封装，**自身不实现协议** | **位移** |
| **B-11**② | `dsh-mcp-client` `lib/index.js` — 官方 MCP SDK 依赖 | `packages/mcp/mcp-client/src/transport.ts:9-11`、`src/connection.ts:18`、`src/tools.ts:17`；依赖 `packages/mcp/mcp-client/package.json:42` | ✔ | — | **位移**（见 §二 B-11①，此为★结论根基） |
| **B-11**③ | `dsh-mcp-client` `lib/index.js` — 工具表变更通知重载 | 调用点 `packages/mcp/mcp-client/src/connection.ts:263-269`（`listChanged` 作 `Client` 构造选项）；协议通知类型在 SDK `ClientOptions.listChanged` | ✔（但**不是 DSH 自研**） | **是（重大）**。协议层 `notifications/tools/list_changed` 的接收与去抖**由官方 SDK 承担**；DSH 只提供 `onChanged` 回调（`:267`）触发自研重注册 | **被上游取代**（协议通知部分）＋ DSH 保留工具表重注册 |
| **B-11**④ | `dsh-mcp-client` `lib/index.js` — `scrubbedParentEnv` | 定义 `packages/subprocess/subprocess/src/index.ts:66`；消费 `packages/mcp/mcp-client/src/transport.ts:12`（import）＋ `:22`（调用） | ✔ | 否 | **位移** |
| **B-12**① | `dsh-webhook` + `dsh-webhook-github` — GitHub HMAC 验签 | `packages/webhook/webhook-github/src/handler.ts:5`（import）、`:101`（调用）；依赖 `packages/webhook/webhook-github/package.json:44` | ✔（但**不是自研**） | **是（重大）**。验签**完全委托** `@octokit/webhooks`；`packages/webhook/` 下 `createHmac`/`timingSafeEqual` **零命中** | **被上游取代**（新承担者 `handler.ts:101`） |
| **B-12**② | `dsh-webhook` — source / rule / delivery 三 id | `packages/webhook/webhook/src/brand.ts:6`（`WebhookRuleId`）、`:9`（`WebhookSourceId`）、`:12`（`WebhookDeliveryId`）；branded 工厂 `:19` / `:28` / `:37` | ✔ | 否（但补一条：`deliveryId` doc 明写「runtime assigns **no deduplication semantics**」`brand.ts:11` → **DSH 不做去重**） | **位移** |
| **B-12**③ | `dsh-webhook` — delivery 校验 + `deepFreeze` | `packages/webhook/webhook/src/index.ts:39`（`snapshotDelivery`）；字段校验 `:40-51`；`snapshotJsonValue` `:52`；`deepFreeze` `:54` | ✔ | 否 | **位移** |
| **B-12**④ | `dsh-webhook` — provenance 注入 `source:{kind:"webhook",…}` | `packages/webhook/webhook/src/session.ts:155-163`（`kind: 'webhook'` 在 `:156`）；类型 `packages/webhook/webhook/src/types.ts:75` | ✔ | 否（字段比旧卡更全：`provider` / `source` / `deliveryId` / `ruleId` / `form: 'notice'` / `summary`） | **位移** |
| **B-13**① | `dsh-goal` — `foldGoal` 投影 | `packages/goal/goal/src/fold.ts:339` | ✔ | 否 | **位移** |
| **B-13**② | `dsh-goal` — `GOAL_CHANGE_VERSION` 常量 + 版本拒绝 | 定义 `packages/goal/goal/src/runtime.ts:8`（**值 = `1`**）；拒绝点 `packages/goal/goal/src/fold.ts:136-138` | ✔ | 否 | **位移** |
| **B-13**③ | `dsh-goal-round-driver` — 竞态围栏 | `packages/goal/goal-round-driver/src/index.ts:75-76`（`apply` doc「Install … its race fences」）；`competingQueued` 状态 `:41`/`:86`/`:108`/`:300`；step fence `:243`；暂停围栏 `:264` | ✔ | 否 | **位移** |
| **B-13**④ | `dsh-goal-round-driver` — 续轮提示 | `packages/goal/goal-round-driver/src/prompt.ts:12`（`renderGoalRoundPrompt`）；一致性校验 `src/invariant.ts:45`/`:56` | ✔ | 否 | **位移** |
| **B-13**⑤ | `dsh-tool-goal` — 执行时 authority | `packages/goal/tool-goal/src/authority.ts:48`（`goalToolExecution`）、`:100`（`requireDirectHuman`）、`:111`（`completionAuthority`）；消费 `tool-goal/src/index.ts:207`/`:229-230`/`:264`/`:271`/`:279`/`:299` | ✔ | **是（细化）**。authority 是二值判别：`{kind:'direct-human'}` 或 `{kind:'goal-round', goal}`（`authority.ts:19` `GoalToolAuthority`） | **位移** |
| **B-14**① | `dsh-message-feedback` `types/spec.js` — 域 spec | **不存在**。`find packages/feedback/message-feedback/src -type f` → 仅 `index.ts`、`types.ts` | ✘ | — | **已消失**（本断面不存在；**「自始不成立」不可证**，见 §四 反例 2） |
| **B-14**② | `dsh-message-feedback` — 会话生命周期指纹围栏 `createdAt+cwd` | `packages/feedback/message-feedback/src/index.ts:249-255` | ✔ | **是（扩充）**。实际是**三要素** `[header.id, header.createdAt, header.cwd]`（`:250`），不是旧卡写的两要素；不匹配即 `throw`（`:254`） | **位移**＋语义扩充 |
| **B-14**③ | `dsh-message-feedback` `types/types.js` — 域词汇 | `packages/feedback/message-feedback/src/types.ts:14`（`MessageFeedbackVersion`）、`:17`（`MessageFeedbackRating`）、`:20`（`MessageFeedbackItem`）、`:139`（`MessageFeedbackFailure`） | ✔ | 否 | **位移** |
| **B-14**④ | `dsh-message-feedback` — schema 族（运行时） | **承担者不是 `spec`，是 `src/index.ts`**：`packages/feedback/message-feedback/src/index.ts:62-73`（`itemSchema` `:63`、`rating` enum `:65`、`version` uuid `:68`、`updatedAt >= createdAt` refine `:71`、`putSchema` `:72`、`deleteSchema` `:73`） | ✔ | **是**。运行时 schema 与 TS 域类型**分居两个文件**（`index.ts` 承 zod，`types.ts` 承类型） | **位移** |
| **B-15**① | `dsh-permission-presets` — 预设 = `sandbox-mode` + `approval-policy` 旋钮打包 | `packages/interaction/permission-presets/src/index.ts:2-3`（doc comment）；`PresetSpec` `:64-70`（`sandbox` `:66`、`approval` `:68`） | ✔ | 否 | **命中** |
| **B-15**② | `dsh-permission-presets` — 写穿 + 预设不成为第二真相源 | `packages/interaction/permission-presets/src/index.ts:3-5`（写穿原文）；`:53-58`（预设事件 doc：knob 事件「control execution」）；写侧 `:393`/`:404`/`:435-436`/`:445-448` | ✔ | **是（需标注）**。语义成立，但**原句 "second source of truth" 不是 DSH 源码原文**——全包 grep 零命中，那是旧卡的**释义** | **命中**（释义层面；见 §二 B-15②） |
| **B-15**③ | `dsh-permission-presets` — knob schema | `SANDBOX_MODES` `packages/sandbox/sandbox-policy/src/session-mode.ts:42` = `['read-only','workspace-write','danger-full-access']`；`APPROVAL_POLICIES` `packages/interaction/user-approval/src/index.ts:70` = `['ask','never']` | ✔ | 否 | **位移** |
| **B-15**④ | `dsh-permission-presets` — approval / policy 事件折叠（fold） | sandbox 投影 apply `packages/sandbox/sandbox-policy/src/index.ts:138`；permission 投影 apply `packages/interaction/permission-presets/src/index.ts:124`（状态 shape doc `:91`）；user-approval 有效策略 fold `packages/interaction/user-approval/src/index.ts:237` | ✔ | 否 | **位移** |
| **B-15**⑤ | `dsh-permission-presets` — 写侧 setter 来源 | `setSandboxMode` 定义 `packages/sandbox/sandbox-policy/src/session-mode.ts:53`；`setApprovalPolicy` 定义 `packages/interaction/user-approval/src/index.ts:100`；两处 import `permission-presets/src/index.ts:25`/`:30` | ✔ | 否（**旋钮的所有权在各自 owner 包，预设包不拥有旋钮状态**） | **位移** |

**判定分布（25 个锚点）：命中 3 / 位移 19 / 被上游取代 2 / 已消失 1。**

---

## 二 逐卡「必须回答」（★ 优先）

### B-11 ① 该包是否 import 官方 MCP SDK？——**是，且是运行时依赖**

**证据链（三段全齐，非间接推断）：**

```
$ grep -rn "@modelcontextprotocol" packages/mcp/mcp-client/src/*.ts packages/mcp/mcp-resources/src/*.ts
packages/mcp/mcp-client/src/connection.ts:18:import { Client, type Transport } from '@modelcontextprotocol/client'
packages/mcp/mcp-client/src/tools.ts:17:import { specTypeSchemas, type Client, type ImageContent } from '@modelcontextprotocol/client'
packages/mcp/mcp-client/src/transport.ts:9:import type { Transport } from '@modelcontextprotocol/client'
packages/mcp/mcp-client/src/transport.ts:10:import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
packages/mcp/mcp-client/src/transport.ts:11:import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
```

```
$ grep -n "@modelcontextprotocol/client" packages/mcp/mcp-client/package.json
42:    "@modelcontextprotocol/client": "2.0.0",
```

```
$ node -e "const p=require('./packages/mcp/mcp-client/package.json');
  console.log('in dependencies:', '@modelcontextprotocol/client' in p.dependencies);
  console.log('in devDependencies:', '@modelcontextprotocol/client' in p.devDependencies)"
→ 实为 dependencies 段（第 42 行位于 "dependencies" 块内），非 devDependencies
```

包名 **`@modelcontextprotocol/client`**，版本 **`2.0.0`**（精确锁定，非 `^`）。已安装：`node_modules/.pnpm/@modelcontextprotocol+client@2.0.0`。

> **★ 结论（高置信）**：**「借用 B-11 transport 层」无意义**这条结论**成立且证据是直接的**——DSH 的 `transport.ts` 全部 46 行里，两个 transport 类的构造是**官方 SDK 的类**（`StdioClientTransport` / `StreamableHTTPClientTransport`），DSH 自己写的只有 `buildChildEnv`（9 行，`transport.ts:21-23`）。**抄 DSH 等于抄官方 SDK 的调用方**，直接依赖官方 SDK 即可。
>
> **且 DSH 自己写明了这一点**（`transport.ts:16-19` doc comment 原文）：
> 「The MCP SDK owns the actual spawn, so this transport **shares the scrub definition rather than the spawn path**.」——「SDK 拥有实际 spawn」。

**② 双 transport 构造点**：`packages/mcp/mcp-client/src/transport.ts:31-45`，`createTransport(config)` 按 `config.transport` 判别式分流 —— `case 'stdio'` → `new StdioClientTransport({...})`（`:34-39`）；`case 'streamable-http'` → `new StreamableHTTPClientTransport(new URL(config.url), {...})`（`:41-44`）。消费处：`packages/mcp/mcp-client/src/connection.ts:307`（`transport = createTransport(config)`）。

**③ 工具表变更通知重载 —— 协议通知归 SDK，重注册归 DSH（这条旧卡说错了方向）**

`packages/mcp/mcp-client/src/connection.ts:258-271`：

```ts
const generation = new Client(
  { name: 'dsh-mcp-client', version: '0.0.1' },
  {
    capabilities: {},
    versionNegotiation: { mode: 'auto' },
    listChanged: {
      tools: {
        autoRefresh: false,
        debounceMs: 0,
        onChanged: () => { void refreshTools() },
      },
    },
  },
)
```

`listChanged` 是 **`Client` 构造函数的选项**，不是 DSH 自己实现的监听。SDK 侧类型证据（只读 SDK 安装包）：

```
$ grep -n "listChanged" node_modules/.pnpm/@modelcontextprotocol+client@2.0.0/node_modules/@modelcontextprotocol/client/dist/index.d.mts
1716:  listChanged?: ListChangedHandlers;
1670-1698: ClientOptions.listChanged 的文档示例
1987: Handlers are silently skipped if the server doesn't advertise the corresponding listChanged capability.
```

→ **`ClientOptions.listChanged` / `ListChangedHandlers` 是官方 SDK 的公开 API**（`dist/index.d.mts:1716`），协议层 `notifications/tools/list_changed` 的接收、capability 判定、去抖定时器（SDK 内部 `_listChangedDebounceTimers`，`:1911`）**全在 SDK 里**。

**DSH 真正自己写的部分**（这才是增值点）：`autoRefresh: false` 主动**关掉** SDK 的自动刷新，改用自研重注册 —— `onChanged` → `refreshTools()`（`connection.ts:296-300`，含日志 `:298` 「tool list changed, re-syncing」）→ `enqueueSync`（串行化，doc `:163`）→ `syncTools`（`packages/mcp/mcp-client/src/tools.ts:113`，内部用 `createHash`（`tools.ts:15`）/`isDeepStrictEqual`（`:16`）做差异比对）。

> **判定修正**：旧卡把「工具表变更通知重载」整体算作 DSH 的借鉴物。实测**协议通知是 SDK 给的**，DSH 的增值只在「收到通知后如何把服务器工具表**重新注册进 `ctx.tools`**」。借这一条的**借鉴价值在于重注册的注册表语义**（工具生命周期、disposer 管理），**不在于通知机制**。

**④ `scrubbedParentEnv` 定义处与消费处**

| | `file:line` |
|---|---|
| **定义** | `packages/subprocess/subprocess/src/index.ts:66`（`export function scrubbedParentEnv(): Record<string, string>`） |
| 擦除规则常量 | 同文件 `:47` `SENSITIVE_ENV_PATTERN = /KEY\|PASSWORD\|SECRET\|TOKEN/i` |
| **消费（B-11 内）** | `packages/mcp/mcp-client/src/transport.ts:12`（import）、`:22`（`return { ...scrubbedParentEnv(), ...extra }`） |
| 全仓消费点（部分） | `packages/subprocess/subprocess-local/src/spawn.ts:45`；`packages/subagent/subagent-claude-code/src/process.ts:34`；`packages/host/open-in-app/src/resolver.ts:80`；`packages/boot/plugin-manager/src/operations.ts:119/227/259`；`packages/bundle/web-app/src/index.ts:179` |

定义处 doc comment 直接点名本卡场景（`subprocess/src/index.ts:58-60`）：**「Exported as a plain function so spawners that cannot route through the service (node-pty backends, SDK-managed transports) share the one scrub definition.」** —— 「SDK-managed transports」就是 MCP client 这条路径。这解释了为什么 MCP client 用的是**函数**而不是 subprocess **服务**：因为 spawn 由 SDK 做，DSH 的服务接口穿不进去。

**另答：`packages/mcp/` 下有几个包？各自职责？DSH 侧 server 与 client 分别落在哪？**

`packages/mcp/` 下 **恰好 2 个包**（`ls -1 packages/mcp/` → `mcp-client`、`mcp-resources`，另有 3 个 README 文件）：

| 包 | npm 名 | 职责（`packages/mcp/README.md` 原文摘要 + package.json description） |
|---|---|---|
| `mcp-client` | `@deepseek-ai/dsh-mcp-client` | 「Connect one MCP server, expose its tools and instructions, and provide its resource operations」；description: "MCP client bridge: connects to MCP servers and registers their tools on `ctx.tools`" |
| `mcp-resources` | `@deepseek-ai/dsh-mcp-resources` | 「Discover and read resources through shared tools with explicit server selection」——跨连接共享的资源工具面 |

**★ DSH 侧没有 MCP server 包。** 证据：

```
$ grep -rn "McpServer\|serveStdio\|createMcpHandler" packages/ --include=*.ts | grep -v node_modules | grep -v "/lib/" | grep -v "/tests/"
packages/acp/acp/src/mcp.ts:7:import type { McpServer } from '@agentclientprotocol/sdk'
packages/acp/acp/src/mcp.ts:26:export async function mountAcpMcpServers(
packages/acp/acp/src/mcp.ts:28:  servers: readonly McpServer[],
packages/acp/acp/src/session.ts:135/159: await mountAcpMcpServers(agentCtx, options.mcpServers, options.cwd)
```

唯一命中是 `packages/acp/acp/src/mcp.ts`，而那里的 `McpServer` 是 `@agentclientprotocol/sdk` 的**声明类型**（ACP 编辑器传进来的 server 配置），DSH 的职责是把它**转换成 `mcp-client` 配置并 mount**（`mcp.ts:31-32`：`resolveMcpConfigs(...)` → `agentCtx.plugin(McpClient, config)`），**依旧是 client 侧**。`@modelcontextprotocol/server` / `serveStdio` 只出现在 `mcp-client/tests/`（测试夹具）与 devDependencies（`package.json:53-58`）。

> **对 Synova 的落点澄清**：我方仓 `src/mcp/` 是 **Synova 自己的 MCP server**（把能力对外暴露）；B-11 卡面是「Synova 作为 **client** 连企业系统」。**两者不是一回事，DSH 侧只能给 client 侧的参考**——DSH 在 MCP 上是**纯消费方**，整个 `packages/mcp/` 组没有一行 server 实现代码。若要参考「如何对外做 MCP server」，DSH **没有对应物**，参照系是官方 SDK 自己的 server 侧（`@modelcontextprotocol/server`）。

### B-12 ① HMAC 验签：自研还是委托？——**完全委托 `@octokit/webhooks`**

```
$ grep -rn "octokit" packages/webhook/webhook-github/src/*.ts
packages/webhook/webhook-github/src/handler.ts:5:import { Webhooks } from '@octokit/webhooks'
packages/webhook/webhook-github/src/handler.ts:101:        verified = await new Webhooks({ secret: credential.value }).verify(body, signature)
packages/webhook/webhook-github/src/types.ts:22:export type { EmitterWebhookEvent, EmitterWebhookEventName } from '@octokit/webhooks'
```

```
$ grep -n "@octokit/webhooks" packages/webhook/webhook-github/package.json
44:    "@octokit/webhooks": "^14.2.0"

$ node -e "const p=require('./packages/webhook/webhook-github/package.json');
  console.log('in dependencies:', '@octokit/webhooks' in p.dependencies);
  console.log('in devDependencies:', '@octokit/webhooks' in p.devDependencies)"
in dependencies: true
in devDependencies: false
```

**反证（关键）**：`packages/webhook/` 全目录下 `createHmac` / `timingSafeEqual` **零命中**：

```
$ grep -rn "createHmac\|timingSafeEqual" packages/ --include=*.ts | grep -v node_modules | grep -v "/tests/"
（packages/webhook/ 下 0 条；全仓命中在 speech-to-text-sensevoice、client/connection/browser-auth、
 credentials/deepseek-account-platform —— 均与 webhook 无关）
```

调用点：`packages/webhook/webhook-github/src/handler.ts:101`（`verify(body, signature)`），依赖声明 `package.json:44`，版本 **`^14.2.0`**（**脱字符，非精确锁定**——与 B-11 的 `2.0.0` 精确锁定形成对比）。

> **★ 结论（高置信）**：「**需改法**」判定**成立，根基已钉死**——GitHub 验签不在 DSH 里，DSH 只是 `@octokit/webhooks` 的一行调用方。Synova 若要接 GitLab / 通用 HMAC webhook，**借 DSH 这段代码得不到任何验签实现**（DSH 自己也没有），必须自己写 `createHmac('sha256', secret).update(body).digest()` + `timingSafeEqual` 定长比较，或按供应商分别引入官方 SDK。注意本卡**唯一真正 DSH 自研的安全逻辑是 delivery 快照 + `deepFreeze`（`index.ts:39-54`）与 provenance 注入（`session.ts:155-163`）**。
>
> **附加发现**：B-12 的可复用部分**集中在 `dsh-webhook`（adapter 无关的规则运行时），而不在 `dsh-webhook-github`**。判断依据：`webhook/src/brand.ts`、`webhook/src/index.ts`（`WebhookRuntime extends Service`，`:58`）、`webhook/src/session.ts` 全部与 GitHub 无关；`webhook-github/` 只有 4 个源文件且其中一个是纯 octokit 类型 re-export。

### B-12 ②③④ 三 id / delivery 校验 + deepFreeze / provenance（行号见 §一表）

**②** `packages/webhook/webhook/src/brand.ts:6/9/12` 三 id 的 brand 类型，`:19/28/37` 三个 branded 工厂函数。

**③** `packages/webhook/webhook/src/index.ts:39` `snapshotDelivery()`：校验 `kind`（`:40`）、`source`（`:43`）、`deliveryId`（`:46`）非空字符串，`receivedAt` 非负安全整数（`:49`），`snapshotJsonValue` 无损 JSON（`:52`），`deepFreeze(snapshot)`（`:54`）。设计意图 doc（`:38`）：「**Validate and detach** one delivery **before sharing it across arbitrary rules**」——跨任意规则共享前先冻结，防规则间互相污染。

**④** `packages/webhook/webhook/src/session.ts:155-163`，`kind: 'webhook'` 在 `:156`，同 turn 内先 `ctx.permissionPresets.set(...)`（`:151`）再 `sessionTitle.rename`（`:152`）再注入 provenance（`:153`）。

> 顺带核实：B-12 的 deliver 校验里 **`deliveryId` 明确不去重**（`brand.ts:11`「The runtime assigns **no deduplication semantics**」）→ 若 Synova 需要「同一 GitHub delivery 重放只触发一次」，**这不是白拿的，要自建**。这是旧卡没说的一条缺口。

### B-13 四件套（行号见 §一表）

| 锚点 | `file:line` | 备注 |
|---|---|---|
| `foldGoal` | `packages/goal/goal/src/fold.ts:339` | `export function foldGoal(events: readonly SessionEvent[]): FoldedGoal` |
| `GOAL_CHANGE_VERSION` 常量 | `packages/goal/goal/src/runtime.ts:8` | **值 = `1`**：`export const GOAL_CHANGE_VERSION = 1` |
| 版本拒绝点 | `packages/goal/goal/src/fold.ts:136-138` | `if (value['version'] !== GOAL_CHANGE_VERSION) throw new Error(\`unsupported goal change version …\`)` —— **fail-loud 拒绝**，非降级 |
| 竞态围栏 | `packages/goal/goal-round-driver/src/index.ts:75-76` | `apply` doc：「Install automatic same-session continuation and **its race fences**」；状态位 `competingQueued` `:41`/`:86`/`:108`/`:300`；step fence `:243`；暂停围栏 `:264`「Fence the pause to the exact dropped attempt's ref」 |
| 续轮提示 | `packages/goal/goal-round-driver/src/prompt.ts:12` | `renderGoalRoundPrompt(goal: GoalView, round: number): ContentBlock[]`；module doc `:1`「Model-visible continuation prompt for one same-session goal round」；一致性校验 `src/invariant.ts:45`/`:56` |
| 执行时 authority | `packages/goal/tool-goal/src/authority.ts:48`/`:100`/`:111` | `goalToolExecution()` 取「不可变事件切点 + open-turn 起始 seq」（`:11-12` doc）；`requireDirectHuman()`；`completionAuthority()` 返回 `{kind:'direct-human'}` 或 `{kind:'goal-round', goal}`（`:112`/`:115`），否则 `reject`（`:117`） |
| authority 消费点 | `packages/goal/tool-goal/src/index.ts:207`/`:229-230`/`:264`/`:271`/`:279`/`:299` | create/edit 走 `requireDirectHuman`；complete/blocked 走 `completionAuthority` |

**语义变化**：`GoalToolAuthority`（`authority.ts:19`）是一个**显式的二值授权形状**，比旧卡「authority 检查」的笼统描述更具体——DSH 把「人直接下的指令」与「同一 goal round 内的续轮」判为**两种不同的授权来源**，并且是**执行时**（`goalToolExecution` 读 `ToolRunContext`）而非注册时判定。这一条对我方 Sentinel 工单状态机有直接参考价值。

### B-14 ① 有没有 `spec.ts`？——**本断面没有**（原始输出）

```
$ find packages/feedback/message-feedback/src -type f | sort
packages/feedback/message-feedback/src/index.ts
packages/feedback/message-feedback/src/types.ts

$ ls -la packages/feedback/message-feedback/src/
total 48
drwxr-xr-x@  4 wane  staff   128 Sep 22 23:45 .
drwxr-xr-x@ 11 wane  staff   352 Sep 23 14:27 ..
-rw-r--r--@  1 wane  staff  13480 Sep 22 23:45 index.ts
-rw-r--r--@  1 wane  staff   6651 Sep 22 23:45 types.ts

$ find packages/feedback -name "spec.ts" -not -path "*/node_modules/*" | wc -l
0

$ ls packages/feedback/message-feedback/lib/types/
index.d.ts  index.d.ts.map  index.js  index.js.map
types.d.ts  types.d.ts.map  types.js  types.js.map
```

**派发口径得到确认**：`src/` 下只有 `index.ts` 与 `types.ts`，**没有 `spec.ts`**；产物 `lib/types/` 下也只有 `index.*` 与 `types.*`，**没有 `spec.js`**。

**但「自始不成立」这一条必须撤回**（`git log` 在本断面不可用）：

```
$ git log --oneline -- packages/feedback/message-feedback/src/
00102833 Merge pull request #4978 from deepseek-harness/worktree/release-dsh-0.1.7-alpha.2

$ git rev-parse --is-shallow-repository
true
$ git rev-list --count HEAD
1
$ git log --reverse --format='%h %ad %s' --date=short | head -3
00102833 2026-09-22 Merge pull request #4978 …
```

`git log` 对该路径只返回**唯一那个 commit**（就是 HEAD 本身），因为**整个仓库只有 1 个 commit**。上一版据此写「`spec.js` 自始不成立」是**把「浅克隆看不到历史」误读成「历史上不存在」**——这是典型的取证陷阱（观测不到 ≠ 不存在）。本版更正为：**「`0.1.7-alpha.2` 断面不存在 `spec.ts`/`spec.js`」，历史存在性标注为未核实（U1）。**

### B-14 ② 指纹围栏 —— 实际是**三要素**，不是两要素

`packages/feedback/message-feedback/src/index.ts:246-255`：

```ts
const handle = await this.ctx.sessionPersistence.open(sessionId, 'read')
try {
  const { events: stored } = await handle.read(last?.seq ?? 0, 1)
  if (!isDeepStrictEqual(
    [handle.header.id, handle.header.createdAt, handle.header.cwd],
    [live.header.id, live.header.createdAt, live.header.cwd],
  )
    || (last !== undefined && !isDeepStrictEqual(stored[0], last))) {
    throw new Error(`message-feedback: feedback prefix is not durable for live session '${sessionId}'`)
  }
} finally { await handle.close() }
```

- 指纹三元组：`[id, createdAt, cwd]` —— `:250`（持久化侧） vs `:251`（活会话侧）
- 比较方式：`isDeepStrictEqual`（`:249`）
- 失败姿态：**throw**（`:254`），fail-loud
- **旧卡写的是 `createdAt+cwd`，漏了 `id`**。这是语义扩充，不是文字游戏：`id` 参与比对意味着**「同 cwd、同 createdAt 但不同 session id」也会被拒**，防的是比旧卡描述更强的场景。

**:245 的 doc comment 说明围栏要防的具体缺陷**：「Listener participation alone does not prove this Session has a persistence writer.」——即「有 listener 参与」不足以证明「这个会话真的落盘了」，所以要在读回时逐字核对前缀。

### B-14 ③ 域词汇与运行时 schema 的承担者分别是哪个文件哪一行

| 层面 | 承担者 | `file:line` |
|---|---|---|
| **域词汇（TS 类型 / brand）** | `packages/feedback/message-feedback/src/types.ts` | `:14` `MessageFeedbackVersion`(brand)、`:17` `MessageFeedbackRating = 'positive' \| 'negative'`、`:20` `MessageFeedbackItem`、`:38` `MessageFeedbackPut`、`:46` `MessageFeedbackDelete`、`:139` `MessageFeedbackFailure`（union）、`:159/164/175` 三个 Result 类型 |
| **会话事件声明** | 同 `types.ts` | `:54` `interface SessionEventMap`（模块增补） |
| **运行时 schema（zod）** | `packages/feedback/message-feedback/src/index.ts` | `:62` `timestamp`、`:63` `itemSchema`、`:65` rating `z.enum`、`:68` version `z.uuid()`、`:71` `updatedAt >= createdAt` refine、`:72` `putSchema`、`:73` `deleteSchema` |
| 跨包词汇依赖 | `types.ts:11` | `import type { FeedbackCategory } from '@deepseek-ai/dsh-command-feedback/types'` —— 分类词汇在**另一个包** `packages/feedback/command-feedback/` |

> **结论**：**运行时 schema 的承担者不是 `spec.ts`，而是 `index.ts`**（`:62-73`）；域词汇在 `types.ts`。旧卡的 `types/{spec,types}.js` 二分法在本断面**没有对应物**——正确表述是「`types.ts` 承类型 + `index.ts` 承 zod schema」。若要借鉴，**借的是这个二分结构，不是某个 `spec` 文件**。

### B-15 ① 预设 = 旋钮打包（出处原文）

`packages/interaction/permission-presets/src/index.ts:1-13` module doc comment 原文（`:2-3` 为关键句）：

> 「User-facing permission presets **over the independent sandbox-mode and approval-policy knobs**. A switch records the selected preset, then **writes changed knobs through their canonical setters**. Execution, prompt narration, and replay keep reading their knob folds.」

配套类型 `PresetSpec`（`:64-70`）：`sandbox: SandboxMode`（`:66`，「The `sandbox/mode` value the preset **writes through**」）、`approval: ApprovalPolicy`（`:68`，同措辞）。→ **预设 = 两个既有旋钮值的一对打包**，这个语义在本断面**完整保留**。

### B-15 ② 「写穿 + 预设不是第二真相源」——原文与行号（含一条重要更正）

**写穿原文**：`packages/interaction/permission-presets/src/index.ts:3-4`

> 「A switch **records** the selected preset, then **writes changed knobs through their canonical setters**.」

**「预设不是第二真相源」的等价原文**：`packages/interaction/permission-presets/src/index.ts:53-58`（`SessionEventMap` 上 `'permission/preset'` 事件的 doc comment）

> 「Records the selected preset as **durable, log-only user intent**. The **knob events follow in the same turn and control execution**; this event **stays out of the model transcript** and lets the permission projection unit preserve a selection when bundles match.」

**权威归属的证据（不只是文字声明）**：
- 执行侧读的是 knob fold，不是预设事件 —— `presets/src/index.ts:344`（`const sandbox = state.sandbox ?? this.ctx.shell.sandboxMode`）、`:403`（`spec.sandbox !== (knobs.sandbox ?? …)`）
- 旋钮的 setter **不在预设包里** —— 定义在 owner 包：`packages/sandbox/sandbox-policy/src/session-mode.ts:53`（`setSandboxMode`）、`packages/interaction/user-approval/src/index.ts:100`（`setApprovalPolicy`）；预设包只 import 并调用（`presets/src/index.ts:25`/`:30`/`:393`/`:404`/`:435-436`）
- 预设事件是 **log-only**（`stays out of the model transcript`），且预设名 `custom`/`auto` 被保留给**派生状态**（`:210`：`throw` reserved for「the derived not-a-preset state」）→ 派生值不能伪装成配置项

> **⚠️ 必须标注的更正**：「预设**不成为第二真相源**」这句**不是 DSH 源码原文**。实测全包 grep：
>
> ```
> $ grep -rn "second source\|source of truth\|write-through\|writes through" packages/interaction/permission-presets/src/*.ts
> （"second source" / "source of truth" 零命中；仅 "writes through" 命中 :3、:65、:67）
> ```
>
> 所以旧卡 §4 的「**预设不成为第二真相源**」（借卡原件加粗处）是**审计者的释义/归纳**，语义上**成立**且有上述行为证据支撑，但**引号引用它会错**。写路线图时应引用 `presets/src/index.ts:53-58` 的实际文字。

### B-15 ③④⑤ knob schema / fold / setter

| 问 | `file:line` |
|---|---|
| ③ knob schema（sandbox 侧） | `packages/sandbox/sandbox-policy/src/session-mode.ts:42`：`export const SANDBOX_MODES: readonly SandboxMode[] = ['read-only', 'workspace-write', 'danger-full-access']` |
| ③ knob schema（approval 侧） | `packages/interaction/user-approval/src/index.ts:70`：`export const APPROVAL_POLICIES: readonly ApprovalPolicy[] = ['ask', 'never']` |
| ③ 运行时校验（不变量） | `packages/sandbox/sandbox-policy/src/invariant.ts:18`；`packages/interaction/user-approval/src/invariant.ts:46`（均校验事件值在 schema 内） |
| ④ fold（sandbox 投影） | `packages/sandbox/sandbox-policy/src/index.ts:138`：`apply: (state, event) => (event.type === 'sandbox/mode' ? event.data.mode : state)` |
| ④ fold（approval 有效策略） | `packages/interaction/user-approval/src/index.ts:237`（session 自有的 `approval/policy` fold，否则回落到配置默认） |
| ④ fold（permission 投影） | `packages/interaction/permission-presets/src/index.ts:124`（「One-event permission-state transition (the projection unit's `apply`)」），状态 shape doc `:91` |
| ⑤ setter（sandbox） | `packages/sandbox/sandbox-policy/src/session-mode.ts:53` `setSandboxMode(session, mode)`；re-export `sandbox-policy/src/index.ts:33` |
| ⑤ setter（approval） | `packages/interaction/user-approval/src/index.ts:100` `setApprovalPolicy(session, policy)` |

**归属结论**：预设包 `@deepseek-ai/dsh-permission-presets`（`0.1.7-alpha.2`）**既不拥有 knob 状态、也不拥有 knob 的 schema、也不拥有 fold**，它只拥有：(a) 预设表（`PresetSpec` 组合）、(b) `permission/preset` log-only 事件、(c) `/permission` 命令写侧。**这才是「写穿」的结构性保证**——要让预设变成第二真相源，必须先把 setter 搬进预设包，而代码布局使这一步在架构上显眼。

---

## 三 复现命令与输出摘要（全部原始命令，可逐条重跑）

| # | 命令 | 输出摘要 |
|---|---|---|
| 1 | `git rev-parse HEAD; git status --porcelain; git log -1 --format='%H %ad %s' --date=iso` | `00102833…`；工作树空（0 脏）；`Merge pull request #4978 … 2026-09-22 23:25:38 +0800` |
| 2 | `git rev-parse --is-shallow-repository; git rev-list --count HEAD` | `true`；`1` ← **本断面历史不可用** |
| 3 | `find packages -mindepth 3 -maxdepth 3 -type d -name src \| wc -l` | `307` |
| 4 | `ls -1p packages/ \| grep '/$' \| wc -l`；`ls -1 packages/ \| wc -l` | `54` 组目录；`60` 顶层条目（差 6 = `AGENTS.md` `CLAUDE.md` `README.i18n.yaml` `README.md` `README.zh.md` `tsdown.worker.ts`） |
| 5 | `grep -rn "@modelcontextprotocol" packages/mcp/mcp-client/src/*.ts packages/mcp/mcp-resources/src/*.ts` | 5 条命中（`connection.ts:18`、`tools.ts:17`、`transport.ts:9/10/11`） |
| 6 | `grep -n "@modelcontextprotocol/client" packages/mcp/mcp-client/package.json` | `42: "@modelcontextprotocol/client": "2.0.0"` |
| 7 | `grep -rn "modelcontextprotocol" --include=package.json packages/` | `mcp-client:42/53/54/57/58`；`subagent-claude-code:48`（`@modelcontextprotocol/sdk ^1.29.0`） |
| 8 | `ls -d node_modules/.pnpm/@modelcontextprotocol+client@*` | `@modelcontextprotocol+client@2.0.0`（已安装） |
| 9 | `grep -n "listChanged" …/@modelcontextprotocol/client/dist/index.d.mts` | `1716: listChanged?: ListChangedHandlers;`（+ doc `1670-1698`、capability 说明 `1987`） |
| 10 | `grep -rn "scrubbedParentEnv" packages/subprocess/subprocess/src/*.ts` | 定义 `index.ts:66`；doc 引用 `types.ts:101` |
| 11 | `grep -rn "scrubbedParentEnv" packages/ --include=*.ts \| grep -v node_modules \| grep -v /tests/` | 全仓 11 个消费点（含 `mcp/mcp-client/src/transport.ts:12/22`） |
| 12 | `grep -rn "octokit" packages/webhook/webhook-github/src/*.ts` | `handler.ts:5`（import）、`handler.ts:101`（`new Webhooks({secret}).verify(body, signature)`）、`types.ts:22`（类型 re-export） |
| 13 | `grep -n "@octokit/webhooks" packages/webhook/webhook-github/package.json` | `44: "@octokit/webhooks": "^14.2.0"` |
| 14 | `grep -rn "createHmac\|timingSafeEqual" packages/ --include=*.ts \| grep -v node_modules \| grep -v /tests/` | **`packages/webhook/` 下 0 条**（其余命中在 speech-to-text / browser-auth / account-platform，与 webhook 无关） |
| 15 | `grep -rn "deepFreeze" packages/webhook/ --include=*.ts` | `webhook/src/index.ts:5`（import）、`:54`（调用） |
| 16 | `grep -rn "McpServer\|serveStdio\|createMcpHandler" packages/ --include=*.ts \| grep -v node_modules \| grep -v /lib/ \| grep -v /tests/` | 仅 `acp/acp/src/{mcp,session}.ts`（**类型** `McpServer` from ACP SDK，非 MCP server 实现） |
| 17 | `find packages/feedback/message-feedback/src -type f \| sort`；`find packages/feedback -name "spec.ts" \| wc -l` | 仅 `index.ts` `types.ts`；`0` |
| 18 | `ls packages/feedback/message-feedback/lib/types/` | `index.*` ×4 + `types.*` ×4，**无 `spec.*`** |
| 19 | `git log --oneline -- packages/feedback/message-feedback/src/` | 仅返回 HEAD 自身（因浅克隆，**不可用于历史判断**） |
| 20 | `grep -rn "second source\|source of truth" packages/interaction/permission-presets/src/*.ts` | **0 条** ← 旧卡该句为释义非原文 |
| 21 | `grep -rn "SANDBOX_MODES" packages/sandbox/sandbox-policy/src/*.ts`；`grep -rn "APPROVAL_POLICIES" packages/interaction/user-approval/src/*.ts` | `session-mode.ts:42`；`index.ts:70` |
| 22 | `grep -rn "setSandboxMode\|setApprovalPolicy" packages/ --include=*.ts \| grep -v node_modules \| grep -v /lib/ \| grep -v /tests/` | 定义 `session-mode.ts:53` / `user-approval/src/index.ts:100`；预设包仅调用 |
| 23 | 逐包 `node -e "console.log(require('./packages/<p>/package.json').name, .version)"` | 10 个目标包 npm 名 + 版本均 `0.1.7-alpha.2` |
| 24 | `grep -rn "foldGoal\|GOAL_CHANGE_VERSION" packages/ --include=*.ts \| grep -v node_modules \| grep -v /lib/` | 定义 `goal/src/fold.ts:339`、`goal/src/runtime.ts:8`；拒绝 `fold.ts:136`；driver 消费 `goal-round-driver/src/invariant.ts:5/20` |

---

## 四 反例与失效条件

### 反例 1：**B-11 与 B-12 两条★结论的证据强度**（派发明确要求作答）

**结论：两条★的证据强度都是「直接证据」，不是间接证据。但两者的「强度性质」不同，我分开说。**

| 卡 | 派发担心的弱点 | 实测 | 强度判定 |
|---|---|---|---|
| **B-11**「transport 无需借」 | 「会不会只看到 `dependencies` 声明而没看到 `import`？」 | **直接看到了 `import` 行**（`transport.ts:9/10/11`、`connection.ts:18`、`tools.ts:17`），**且**看到 `dependencies` 声明（`package.json:42`），**且**看到已安装实体（`.pnpm/@modelcontextprotocol+client@2.0.0`）。三段齐全 | **强（直接证据）**。派发提示的「可能用别名」已排除——`src/` 下 5 个文件全部 import 完毕，无别名、无间接再导出。**唯一未做的是实际运行验证**（未跑测试、未起 MCP server），但本结论是**静态依赖事实**，不需要运行验证 |
| **B-12**「需改法」 | 「会不会是自研 `createHmac` 而我没看到？」 | **反证法给了强证据**：全仓 `createHmac`/`timingSafeEqual` 在 `packages/webhook/` 下**零命中**（一个都没有），同时 `handler.ts:101` 有唯一一次 `verify()` 调用。**零命中 + 单点委托调用 = 验签不可能在 DSH 内完成** | **强（直接证据 + 反证）**。这条比 B-11 更强，因为「零命中」是排除性证据 |
| **B-11③「通知重载」** | — | **相对较弱**：我看到了 `listChanged` 作构造选项传入（`connection.ts:263`）**并**在 SDK 的 `.d.mts:1716` 找到 `ClientOptions.listChanged?: ListChangedHandlers` 类型声明。但**我没有读 SDK 的 `.mjs` 实现体**去确认「去抖与通知解析确实在 SDK 内部执行」——只从类型名、SDK doc comment（`:1987`）和 DSH 的 `autoRefresh: false` 语义推断 | **中（类型声明级证据，非实现级）**。若要用这条做路线图决策，建议补一步：读 `dist/index.mjs` 中 `listChanged` 的实现 |
| **B-11④ / B-12②③④ / B-13 / B-15** | — | 均为「定义点 + 消费点双端命中」的直接行号证据 | **强**，唯一共性弱点是**未运行验证** |

**共同的强度上限（对全部 25 个锚点成立）**：本审计是**纯静态只读**——未执行任何测试、未起进程、未 `npm install`。因此所有判定都是**「符号与语义的静态事实」**，不是**「行为事实」**。例如我能证明 `deepFreeze` 在 `index.ts:54` 被调用，但**没有实测**「被冻结的 delivery 在运行时是否真的抛错」。行为层面的断言全部落在 §五 未核实项。

### 反例 2：**源码树 vs tarball 断面的差异**（举例）

**差异 1（最严重）：产物行号 ≠ 源码行号，「自始不成立」类结论在两个断面上的可证性完全不同。**

- 上一版断面（tarball `0.1.6-alpha.2`，`lib/index.js`）与本节断面（源码树）是**两个不同的物理对象**，行号体系不通用。
- 具体：`scrubbedParentEnv` 在**源码树**是 `packages/subprocess/subprocess/src/index.ts:66`；在同一包的**产物**是 `packages/subprocess/subprocess/lib/types/index.d.ts:40`（仅类型声明）+ `lib/index.js` 内某行（esbuild 打包后与源码行号无对应关系）。**跨断面搬行号会系统性出错。**
- **更关键**：上一版在 tarball 断面写「B-14 `spec.js` **自始不成立**」。本断面实测**只能支持「不存在」**，**不能支持「自始」**——原因是 `git rev-list --count HEAD = 1`（浅克隆）。这是一个**断面属性导致的结论强度差异**：同一句判断，在能读历史的断面可证，在本断面不可证。**同一份观察，结论从「自始不成立」降级为「本断面不存在」。**

**差异 2：`lib/` 与 `src/` 并存在源码树里，极易再犯上一版的错。**

`packages/feedback/message-feedback/` 下**同时存在** `src/*.ts` 与 `lib/*.js` + `lib/types/*.d.ts`（构建产物被检入）。`find` 不带过滤会**同时列出两套**：

```
$ find packages/feedback/message-feedback -type f -not -path "*/node_modules/*"
… src/index.ts  src/types.ts  lib/index.js  lib/types/index.js  lib/types/types.js …
```

**这是上一版把产物当断面的物理原因**——源码树里**混着 `lib/`**，`packages/mcp/mcp-client/package.json:26-28` 还写着 `"main": "lib/index.js"` / `"exports": {".": {"default": "./lib/index.js"}}`，**从 `package.json` 看不出源码在哪**。任何 grep 不加 `src/` 限定或 `-not -path "*/lib/*"` 就会重蹈覆辙。本审计全部命令均已做此限定（见 §三 中 `| grep -v /lib/` 出现处）。

**差异 3：`node_modules` 在源码树内是「软链 + 硬链接混合」，跨包 grep 会产生假命中。**

`packages/mcp/mcp-client/node_modules/.bin/mcp-server-filesystem` 是**真实文件**（cmd-shim 脚本），内含 `@modelcontextprotocol+server-filesystem@2026.7.10` 的**绝对路径**。所以：

```
$ grep -rn "modelcontextprotocol" packages/mcp/
（未加过滤时命中大量 node_modules/.bin 与 .pnpm 路径 —— 全是噪声）
```

→ 本审计的★结论①（是否 import 官方 SDK）**必须限定 `src/*.ts`** 才是有效证据。派发提示建议的 `grep -rn "modelcontextprotocol\|@mcp" "$R/packages/mcp"` **在本断面会返回 40+ 行噪声**，其中真正有效的仅 5 行（在 `src/`），其余是 README 示例、测试文件、node_modules shim。**这条命令需要加 `grep -v node_modules` 才有用。**

**差异 4：源码树里 `dsh-` 前缀的「不存在」是目录名层面的，不是包名层面的。**

源码目录名是 `mcp-client`（无前缀），npm 名才是 `@deepseek-ai/dsh-mcp-client`（`packages/mcp/mcp-client/package.json:2`），而 `main` 又指回 `lib/index.js`。**旧锚点用的 npm 名在本断面无法直接 `find`**——必须走 `package.json` 的 `name` 字段反查。这是「旧锚点 → 新锚点」映射的第一个动作。

### 反例 3：**会推翻本表的条件**

| # | 条件 | 会推翻什么 | 为什么 |
|---|---|---|---|
| C1 | **断面 HEAD 变化**（`git rev-parse HEAD` ≠ `00102833…`）或工作树变脏 | **全表** | 所有行号绑定该 commit。DSH 是周级发版（`0.1.7-alpha.1` → `alpha.2` 间隔可见），行号漂移是常态 |
| C2 | 获知**真实的 deep clone 历史**（含 `packages/feedback/message-feedback/src/spec.ts` 的 commit） | **B-14① 判定**从「本断面不存在」升级为「曾经存在后被删」→ 判定由 **已消失** 变 **被上游取代**（承担者变成 `index.ts:62-73` 的 zod schema） | 本表因浅克隆**主动放弃**了历史判断；补上历史即可恢复该维度 |
| C3 | **`@modelcontextprotocol/client` 的类型声明与运行时实现不一致**（读了 `dist/index.mjs` 后发现 `listChanged` 的实际执行体在 DSH 侧的包装层） | **B-11③ 判定**由「被上游取代」改回「位移」 | 我目前只有 `.d.mts:1716` 的类型证据 + SDK doc comment。若实现体另有蹊跷，归属判断会翻转（见 §四 反例 1 的「中」评级） |
| C4 | **`@octokit/webhooks` 内部对 GitHub 的验签被实测为非恒定时间比较，或 DSH 在别处另有一层自研验签**（例如 profile / bundle 层） | **B-12① 判定**由「被上游取代」变「位移 + 上游委托并存」；「需改法」的**理由**改变（从「无实现可借」变成「有但不安全」） | 我只 grep 了 `packages/`，未 grep 构建产物之外的 profile/bundle 配置层 |
| C5 | **Synova 侧另有一份 `@modelcontextprotocol/sdk` 的 MCP server 实现**（我方仓 `src/mcp/` 实测未做） | **§二 B-11「另答」的落点澄清**需要重写：DSH 无 server 参照系，但我方已有 → 该澄清的战略含义改变 | 本表未读 SynovaAgent 的 `src/mcp/` 内容（**超出本次授权断面**，只核 DSH 侧） |
| C6 | **派发口径的「60 组」被证明有第三方出处且定义不同**（如把 README 也算组） | §〇 修正 1 | 我按「组 = 目录」实测得 54。若「组」在院内有别的定义，数字需按定义重述 |
| C7 | **MCP 官方 SDK 2.0.0 的 `listChanged` 被从公开 API 移除**（版本迭代） | **B-11③** 判定需重新取材 | 引用了 SDK 内部 `.d.mts` 行号，属**第三方产物**，其行号有效期 ≈ 该 SDK 版本 |

---

## 五 未核实项与置信度自评

### 未核实项

| # | 未核实事项 | 为什么没核 | 影响面 |
|---|---|---|---|
| **U1** | `spec.ts` / `spec.js` **在 DSH 历史上是否曾存在** | `git rev-parse --is-shallow-repository` = `true`，`git rev-list --count HEAD` = `1`。**浅克隆无法提供历史** | B-14① 判定只能给「本断面不存在」；「自始不成立」不可证。**上一版结论由此撤回** |
| **U2** | MCP SDK `listChanged` 的**运行时实现体** | 只读了 `.d.mts` 类型声明与 doc comment，未读 `dist/index.mjs` 实现（会大幅扩大引用面） | B-11③ 归属判定为「中」而非「高」 |
| **U3** | 任何锚点的**行为层面**事实（测试是否通过、冻结是否真抛错、围栏是否真拦住竞态） | 本审计为**纯静态只读**，未运行测试、未起进程（红线要求） | 全表 25 项的判定均限于「符号 + 语义的静态事实」 |
| **U4** | Synova 侧 `src/mcp/` 的实际内容 | **超出授权断面**（本任务只核 DSH 侧 `R`） | B-11「另答」中「我方是 server / 卡面是 client」按派发给定信息转述，未独立验证 |
| **U5** | `dsh-webhook-github` 之外的 webhook adapter（是否有第二家已实现） | 只列了 `packages/webhook/`（2 包），未全仓搜 adapter 实现 | 若存在第二家 adapter，则 B-12「需改法」的参考面更宽 |
| **U6** | profile / bundle / patch 层是否对 MCP 或 webhook 有**额外覆盖实现** | 未展开 `packages/preset/`（34 组之一）与 bundle 层的组合关系 | 可能推翻 C4（webhook 另有验签层） |
| **U7** | `packages/` 顶层 60 条目对「组」的定义在院内是否另有出处 | 仅按「目录 = 组」实测 | §〇 修正 1 的口径 |
| **U8** | 借卡原件 §11.3 建议验收点与本次锚点的**逐条对应** | 派发要求是「核验 B-11…B-15 的锚点」，§11.3（`DSH借鉴指引-v2-20260904.md:234-250`）的回写状态未核 | 不影响锚点判定；影响「回写清单」现状描述 |
| **U9** | `packages/mcp/mcp-resources` 是否 import 官方 SDK | 实测其 `src/` 下 `@modelcontextprotocol` **零命中**（`render.ts`/`tools.ts`/`index.ts`），仅通过 `dsh-mcp-client` 的 `ctx` 接口拿资源能力（`server-context.ts:8`）→ **推断**为不直接依赖，但未逐行读完 3 个文件 | B-11「另答」的包职责描述 |

### 置信度自评

| 结论块 | 置信度 | 依据与理由 |
|---|---|---|
| §〇 断面钉死（HEAD / 0 脏 / 307 包 / 版本） | **高** | 全部为单条命令的直接输出，可逐条重跑 |
| §〇 修正 1（54 组 vs 60 条目） | **高** | `ls -1p` 实测，6 个非目录条目已列名 |
| §〇 修正 2（浅克隆 → 历史不可用） | **高** | `--is-shallow-repository` = `true`、`rev-list --count` = `1`，两条独立命令互证 |
| **B-11①「官方 SDK」★** | **高** | **import 行 + dependencies 声明 + 已安装实体，三段直接证据**，无别名、无间接再导出（见反例 1） |
| B-11② 双 transport 构造点 | **高** | 定义点 `transport.ts:31-45` + 消费点 `connection.ts:307` 双端命中 |
| B-11③ listChanged 归属「被上游取代」 | **中** | 类型声明级证据（`SDK .d.mts:1716`）＋ SDK doc，但**未读实现体**（U2） |
| B-11④ scrubbedParentEnv 定义/消费 | **高** | 定义 `subprocess/src/index.ts:66` + 消费 `transport.ts:12/22`，且定义处 doc 显式点名「SDK-managed transports」（语义自洽） |
| B-11 另答（`packages/mcp/` 2 包 / DSH 无 MCP server） | **高** | `ls` + README 表 + 全仓 grep `McpServer`（唯一命中为 ACP 类型导入，已读原文确认非 server 实现） |
| **B-12①「委托 @octokit/webhooks」★** | **高** | **import 行 + 调用点 + dependencies（非 dev）＋ 反证：`packages/webhook/` 下 `createHmac`/`timingSafeEqual` 零命中** |
| B-12②③④ 三 id / 校验+deepFreeze / provenance | **高** | 均在 `src/*.ts` 直接命中，行号已双端确认 |
| B-12「需改法」**判定** | **高** | 建立在 B-12① 高置信之上；理由（无验签实现可借）由「零命中」反证支撑 |
| B-13 六项（foldGoal / 常量 / 拒绝点 / 围栏 / 续轮提示 / authority） | **高** | 每项均有 `export` 定义行 + 至少一处消费行。竞态围栏的相对弱项是「围栏」本身是 doc 措辞（`:75`「its race fences」）+ 状态位集合，非单一命名函数——已在表中如实标注 |
| B-14①「本断面无 spec.ts」 | **高** | `find` + `ls -la` + `find -name` + `lib/types/` 四处独立输出一致 |
| **B-14①「自始不成立」→ 撤回** | **高（撤回本身）** | 浅克隆是硬事实，两条命令互证。**撤回动作本身置信度高**；`spec.ts` 历史存在性 = 未核实（U1） |
| B-14② 指纹三要素 | **高** | `:250`/`:251` 数组字面量逐字可读，`id` 参与比对无歧义 |
| B-14③ 域词汇 / schema 承担者 | **高** | `types.ts` 的 TS 类型与 `index.ts:62-73` 的 zod 均已逐行读出 |
| B-15①② 预设=旋钮打包 / 写穿 | **高** | doc comment 原文 + `PresetSpec` 字段注释（`:66`/`:68`）双处「writes through」 |
| **B-15②「第二真相源」非原文** | **高** | grep `second source` / `source of truth` 零命中，负结果明确 |
| B-15③④⑤ schema / fold / setter | **高** | 定义与消费双端命中；setter 归属经「定义在 owner 包、预设包仅 import」确认 |
| §四 反例 1（两条★证据强度） | **高**（B-12）/ **高**（B-11①）/ **中**（B-11③） | 已逐条标注强度性质，未把间接证据说成直接证据 |
| §四 反例 2（断面差异 4 例） | **高** | 均为实测输出（`lib/` 并存、`node_modules` 假命中、`package.json` 的 `main` 指向产物） |
| §四 反例 3（C1–C7 推翻条件） | **高**（条件本身明确）/ **中**（C3、C4 的发生概率未知） | 条件已具体化到「用什么命令能验伪」 |

**总评：25 个锚点判定 = 命中 3 / 位移 19 / 被上游取代 2 / 已消失 1。两条★结论（B-11 transport 无需借、B-12 需改法）均为高置信直接证据。本表最大的方法论价值是两处纠正：① 断面对（源码树，非 tarball）；② 「自始不成立」因浅克隆不可证而撤回——观测不到 ≠ 不存在。**

---

## 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-09-23 | 首版。断面 `R=/Users/wane/src/deepseek-harness-017` @ `00102833`（`0.1.7-alpha.2`，0 脏）。B-11…B-15 共 25 个锚点重核；两条★（官方 MCP SDK / octokit 验签）钉死为直接证据；纠正派发口径 2 处（54 组而非 60；浅克隆致历史不可用）；撤回上一版「B-14 `spec.js` 自始不成立」；指出「预设不成为第二真相源」为释义非 DSH 原文；7 项推翻条件、9 项未核实 |
