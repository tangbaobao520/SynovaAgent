# D927 — DSH 借鉴卡 B-01…B-20 重新对比审计（按 `0.1.7-alpha.2` 源码树重锚）

> **版本**：v2.0（**取代 v1.0**）｜**日期**：2026-09-23｜**执行**：山河研究院（技术线 · 原对比研究作者）
> **性质**：只读对比审计。未改 DSH 树、未 `npm install`、未 copy 代码。发现"不能运行"→ 登记 FIX 卡，不自行修复。

## ⚠️ v1.0 作废声明（断面错误）

v1.0 把**打包运行时**（`…/deepseek-harness-desktop/dependencies/dsh/node_modules/@deepseek-ai/*`，tarball 布局 + esbuild 产物 `lib/index.js`）当成了对比断面。**该断面错误，v1.0 的三档结论全部作废。**

**今天发生的是两件不同的事，此前混淆了：**

| 轨 | 变动 | 断面 | 是否本次判据 |
|---|---|---|---|
| **① DSH 内核** | `0.1.7-alpha.1` → **`0.1.7-alpha.2`** | `/Users/wane/src/deepseek-harness-017`<br>HEAD `00102833` "Merge PR #4978 release-dsh-0.1.7-alpha.2"<br>`package.json` / `apps/desktop` / `apps/web` = `0.1.7-alpha.2` | ✅ **本次唯一判据** |
| **② Desktop 封装** | `0.1.7-alpha.1` → `0.1.6-alpha.2`（**回滚**） | `.store.dat.before-kernel-rollback`（01:05）tag=`dsh-0.1.7-alpha.1-35696077623`<br>→ `.store.dat`（01:12）tag=`dsh-0.1.6-alpha.2-35295560626` | ❌ 不作判据 |

①是**源码树**（`.ts` 源 + 测试 + skills），②是第三方封装方打出的运行产物。借鉴锚点必须取①。

**断面物理事实（实测）**：
```
$ git -C /Users/wane/src/deepseek-harness-017 log -1 --format='%H %s'
00102833dfaee1da9f48a3a8eae9d34005a75218 Merge pull request #4978 … release-dsh-0.1.7-alpha.2
$ git -C … status --porcelain | wc -l
       0
$ ls /Users/wane/src/deepseek-harness-017/packages | wc -l
      60          ← 60 个顶层条目 = 54 个组目录 + 6 个文件(AGENTS.md/CLAUDE.md/README×3/tsdown.worker.ts)
$ ls …/packages | grep -c '^dsh-'
       0          ← 源码树无 dsh- 前缀
```
307 个含 `src/` 的包目录。布局 = `packages/<组>/<包>/src/*.ts`。

**两个必须记住的陷阱**（v1.0 出错与易再犯的物理原因）：
1. **`lib/` 与 `src/` 在源码树里并存**，且 `package.json` 的 `main` 指回 `lib/index.js` → 任何 grep 不加 `src/` 限定或 `-not -path "*/lib/*"` 就会读成产物。
   - 精确事实：源码树里有 **307 个 `lib/index.js`**（`find $R/packages -path '*/lib/index.js' | wc -l` = 307），但它们**是被 gitignore 的本地构建产物**——`git ls-files packages/util/atomic-write/` 不含 `lib`，`git check-ignore -v …/lib/index.js` → **`.gitignore:7:lib/`**。
   - **因此工作树"干净"（`git status` = 0 脏）并不等于"没有产物"**——这是 v1.0 误判断面的物理根因。
   - 副产品：源码树的 `lib/` 可与 npm tarball 直接对拍（见 `②锚点重核表.md` §B-08，两断面 `lib/index.js` **md5 相同**）。
2. **源码目录名无 `dsh-` 前缀** → 按 npm 包名 `find`/`grep` 全部失效，必须走 `package.json` 的 `name` 字段反查。

**一条方法论纠正**：本断面是**单 commit 浅克隆**（`--is-shallow-repository` = `true`，`rev-list --count HEAD` = **1**）→ **`git log` 不可用作历史证据**。v1.0 的「B-14 `spec.js` **自始**不成立」因此**撤回**：只能证"本断面不存在"，证不了"自始"。**观测不到 ≠ 不存在。**

---

## 结论先行：回答创始人三句

### 第一句：哪些不用做了

**卡级 1 张：B-09（preset=目录）——上游自己宣布该范式已死。**

DSH 随包发布的迁移指引原文（`packages/preset/agent-preset/skills/editing-cordis-compositions/SKILL.md:70`）：

> Before declaration rows, a user preset was a directory `$DSH_HOME/.agent-presets/<id>/` holding `preset.yml` … and `agent.cordis.yml` … **Nothing reads that directory any more.**

B-09 卡面让抄的正是这个目录范式（`agent.cordis.yml` 组合行 + `preset.yml` 元数据）。**上游已改为「Cordis composition 里的 declaration row」**（`preset/agent-preset/src/index.ts:1,12-23`）。
**保留项**：注册表语义仍活——`mountPreset`（`preset/agent-preset-registry/src/mount.ts:254`）与 `leakedServices` 泄漏审计（`mount.ts:85`）都在，可改用。

另有一处**子机制**判"已无必要"：**B-10 的 `patchNode` + `dsh-settings-file` 包整体消失**（全树 `patchNode` 零命中、"keeps its comments, anchors, and formatting" 原文零命中、`settings/` 下只剩 `settings/` 一个包）。上游改为 **profile patch list**（`boot/config-editor` 包 description："Persist plugin configuration through **profile patches** and Loader reconciliation"；`boot/app-boot/src/config-schema/document.ts:158` 提到 `$defs.patchList`）。**不要按 `patchNode` 原样实现。**

### 第二句：哪些要改法

**仍成立 7 / 需改法 12 / 已无必要 1。**

| 判定 | 卡 | 数量 |
|---|---|---|
| **仍成立**（机制与形态都活，只需把 npm 包路径换成源码路径） | B-02 / B-04 / B-08 / B-13 / B-15 / B-17 / B-20 | **7** |
| **需改法**（除换锚点外，机制／形态／口径有实质变化） | B-01 / B-03 / B-05 / B-06 / B-07 / B-10 / B-11 / B-12 / B-14 / B-16 / **B-18** / B-19 | **12** |
| **已无必要**（上游已内建或范式已变，不要按原样做） | **B-09** | **1** |

> **B-18 由"仍成立"改判"需改法"**：机制完整（200 行服务 / 38 个 companion / 12+ 注册点全实证），**但卡面只写了"借注册表"，没写"借装配"** —— `dsh-invariants` **只被 `sdk-minimal` 挂载**（`bundle/sdk-minimal/cordis.patch.yml:106-119`），`base`/`web-app`/`headless`/`acp-app` **零挂载**，而 companion 一律 `inject:['invariants']` → **服务缺席即静默不激活、不报错**。**照抄机制不照抄装配 = 抄了一个不会运行的正确检查。**

**只有两档要动代码**：
- **A 档｜只改文档锚点**（8 张）：B-03 / B-05 / B-06 / B-10 / B-11 / B-14 / B-18 / B-19 —— 不动 `src/`。
- **B 档｜锚点注释需按 M3/D797 补现验命令**（4 个文件）：`src/llm/tool-result-pruner.ts`、`src/llm/timeout.ts`、`src/agent/context-compaction.ts`、`src/store/session-projection.ts`（现存注释引 **Win 路径 + `0.1.1-rc.2`**，属 §10.4 已登记存量缺口）→ **须另立编码卡**。
- **C 档｜卡面重写**（3 张）：B-09（改 borrow 注册表语义）、B-11（切 client + 换蓝本）、B-12（验签要自研，不要抄）。

### 第三句：没动手的按最新怎么做

**B-08（原子写+文件锁）——现在能做。原方案成立，但"两断面字节相同"这条理由已作废，换成源码树事实。**

新断面事实：`packages/util/atomic-write/src/index.ts`，**191 行**（tarball 产物是 152 行，差 39 行来自类型与注释被剥离，非逻辑差异）。
- `:78` `export async function writeFileAtomic(filename, content, options)`；`:29` `renameAtomicTemp`
- `:158` `export async function withFileLock<T>(...)`
- `:3`/`:6` 头注自述机制：随机后缀同目录兄弟文件 + 独占创建 + 带权限 rename；`withFileLock` 跨进程串行化
- `:45` 注释明确 **`mode` is required**（防 umask 改权限）

**结论不变：按原方案做，1 天量级。** 但**开卡前置是 M2**——`scripts/control-tower/` 至今**零线归属 = 无从回写 = 不得开卡**（指引 §12.2）。

**B-11（MCP client）——现在能做，但"要借什么"必须重新定义。**
- transport 层**借来无意义**：`mcp-client` 自己 import 官方 SDK `@modelcontextprotocol/client@2.0.0`（`src/transport.ts:9-11`、`connection.ts:18`、`tools.ts:17`；`package.json:42` 在 **dependencies** 段）。DSH 在 `transport.ts` 全 46 行里自己写的只有 9 行 `buildChildEnv`，且自述："**The MCP SDK owns the actual spawn**"（`transport.ts:16-19`）。
- **旧卡方向还说反了一处**：`listChanged`（工具表变更通知）是 **SDK 的 `Client` 构造选项**（`connection.ts:263-269`；SDK 类型 `@modelcontextprotocol/client` `dist/index.d.mts:1716`），不是 DSH 自研。DSH 真正自研的是 `autoRefresh:false` → `onChanged` → `refreshTools()` → `syncTools`（`tools.ts:113`，用 `createHash`/`isDeepStrictEqual` 做差异）的**重注册注册表语义**。**该条置信度为中**（仅类型声明级证据，未读 SDK 实现体）。
- **★ DSH 侧没有 MCP server 包**：`packages/mcp/` 恰好 2 个包（`mcp-client`、`mcp-resources`），**全为 client 侧**；全仓 `McpServer` 唯一命中是 `acp/acp/src/mcp.ts:7` 的 ACP **类型**。→ **我方 `src/mcp/`（Synova 自己的 MCP server）在 DSH 无参照物**，DSH 只能给 client 侧面参考。**这一刀必须先切**。

**B-12…B-20（9 张）**：全部未落，锚点**全部命中**。按原方案推进，三处微调：**B-12** 验签要**自研**（上游委托 `@octokit/webhooks`，我们不引依赖）；**B-19** 对照对象由 `jobs` 换成 `jobs-local`（`jobs` 是抽象 seam，构造即抛错）；**B-20** 第 6 项 `session-checkpoint-policy` 归属需先裁（B-07 还是 B-20）。

**⚠️ 三句之外必须先说的一条**：**B-01…B-10 目前一张都没"通过"。** 按 M2，借鉴卡交付以「回写验收点 + 绑定证据」为准：现只有 1 个真证据文件（`D806-borrow-cards-20260918.json`，覆盖 8 张卡）；**B-03/B-05/B-09/B-10 零审计**；**B-07 仍是 CONDITIONAL PASS 且修复卡 D597 自 2026-09-08 停在 `impl_done`**。**这比锚点漂移更卡进度。**

---

## 四件交付（本目录）

| # | 文件 | 内容 |
|---|---|---|
| ① | [①现状矩阵.md](①现状矩阵.md) | B-01…B-20 三态矩阵：D# / 代码在 main / grep 证据 / 审计 verdict / 证据回写 / 今日能否运行 |
| ② | [②锚点重核表.md](②锚点重核表.md) | 逐卡旧锚点（npm tarball）→ 新源码路径 `file:line` → 四值判定 + 复现命令 |
| ③ | [③过时判定.md](③过时判定.md) | 仍成立 8 / 需改法 11 / 已无必要 1，逐项附新断面依据 |
| ④ | [④处置建议.md](④处置建议.md) | 未动手的按最新重写方案；已动手的只列"能否运行"；欠账清单 |
| 附 | [附录-冒烟验证原始输出.md](附录-冒烟验证原始输出.md) | `npx vitest run` 原始输出 + 跑在哪个 checkout |

**详细锚点附件**（B-11…B-15 逐符号，24 条复现命令）：`04-技术研究/DSH锚点重核-0.1.7-alpha.2源码树.md`

---

## 复核清单（逐项可点）

- [ ] 断面：`git -C /Users/wane/src/deepseek-harness-017 log -1 --format='%H %s'` → `00102833 … release-dsh-0.1.7-alpha.2`
- [ ] 断面：`git -C … status --porcelain | wc -l` → `0`
- [ ] 浅克隆：`git -C … rev-parse --is-shallow-repository` → `true`
- [ ] B-09 作废原文：`sed -n '70p' /Users/wane/src/deepseek-harness-017/packages/preset/agent-preset/skills/editing-cordis-compositions/SKILL.md`
- [ ] B-10 patchNode 零命中：`grep -rn "patchNode" /Users/wane/src/deepseek-harness-017/packages | grep -v node_modules`
- [ ] B-11 官方 SDK：`grep -rn "@modelcontextprotocol" /Users/wane/src/deepseek-harness-017/packages/mcp/mcp-client/src`
- [ ] B-12 octokit：`grep -rn "octokit\|createHmac" /Users/wane/src/deepseek-harness-017/packages/webhook`
- [ ] 附录冒烟：`cd /Users/wane/SynovaAgent && npx vitest run <10 个测试文件>`

---

## 修订记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-23 | v1.0 | 首版。**断面错误**（用了 Desktop 打包运行时 `0.1.6-alpha.2`），三档结论作废 |
| 2026-09-23 | **v2.0** | **按 `0.1.7-alpha.2` 源码树全部重锚**。断面改为 `/Users/wane/src/deepseek-harness-017`；锚点由 npm 包 + `lib/*.js` 改为 `packages/<组>/<包>/src/*.ts`；三档重出（8/11/1）；撤回"spec.js 自始不成立"（浅克隆不可证）；新增 B-09 范式作废、B-10 `patchNode` 消失两项发现 |
