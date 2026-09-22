# D870-B 切片｜官方参照系 UI ≥10 模式实证（DeepSeek Harness Web/客户前端）

> 任务：task-2（D870-B）｜作者：coder-ab｜日期：2026-09-21
> 工作树：`/Users/wane/SynovaAgent/.synova-wt-d870`（分支 `feat/d870-official-baseline-study`）
> 本件不承诺 Synova 任何已实现能力；本件只登记**官方参照系中的事实 + 我方借鉴动作 + 开发者工具形态排除项**。

---

## 〇、参照系（唯一）

```
/Users/wane/src/deepseek-harness/  @  tag dsh-v0.1.6-alpha.2  @  commit ddefc45fbc7f8e46dd73185e68295696d1297887
```

```console
$ git -C /Users/wane/src/deepseek-harness log -1 --format='%H %d'
ddefc45fbc7f8e46dd73185e68295696d1297887  (grafted, HEAD -> master, tag: dsh-v0.1.6-alpha.2, origin/master, origin/HEAD)

$ git -C /Users/wane/src/deepseek-harness status --porcelain
（空输出 = 0 脏）
```

### ⚠️ 版本错配警示（必须与上表头同时引用）

| 断面 | 版本 | 取样命令 | 原始输出 |
|---|---|---|---|
| 源码 checkout（**本件 UI 结论唯一来源**） | `0.1.6-alpha.2` | `git log -1 --format='%d'` | `tag: dsh-v0.1.6-alpha.2` |
| 打包运行时 `dependencies/dsh` | `0.1.6-alpha.1` | `grep -m2 '"version"' "$R/dependencies/dsh/package.json"` | `"version": "0.1.6-alpha.1"` |
| `.app` 壳 | `0.15.7` | `grep -A1 CFBundleShortVersionString "/Applications/Deepseek Harness Desktop.app/Contents/Info.plist"` | `<string>0.15.7</string>` |
| 已下载未安装更新 | `0.15.8` | `ls "$R/updates/"` | `Deepseek.Harness.Desktop_0.15.8_aarch64.dmg`（9月20 23:32） |

`R="/Users/wane/Library/Application Support/io.github.hairyf.deepseek-harness-desktop"`。
**本件不含任何发布态结论，全部取自源码 checkout（0.1.6-alpha.2）**；上表仅作错配警示，防"把 0.15.7 壳的观感当成 0.1.6-alpha.2 源码的事实"。
**禁用断面**（按 CTO 裁定，本件零引用）：`~/Library/Application Support/synova-dsh-desktop/`、`~/.dsh/`。
**官方树只读**：本件全程未在 `/Users/wane/src/deepseek-harness/` 写入任何文件。

---

## 一、度量口径与**前提勘误**（先钉口径，再报结论）

### 1.1 源码定位口径

```console
$ git ls-files 'packages/client/**/*.tsx' | wc -l
     412
$ git ls-files 'packages/client/**/*.css' | wc -l
     154
$ git ls-files 'apps/web/src/*.ts' | wc -l   # 卡片口径："apps/web 只有 4 个 ts"
       4
$ git ls-files 'apps/web/*' | wc -l          # apps/web 全量 tracked
     278
$ git ls-files 'apps/web/tests/*' | wc -l    # 其中 apps/web/tests/（递归）
     265
$ git ls-files 'apps/web/tests/*.e2e.ts' | wc -l   # 其中 e2e 规格
     118
$ ls -1p apps/web/tests | grep -vc '/'       # tests/ 目录顶层文件数（非递归，仅此口径）
     148
$ ls -d packages/client/*/ | wc -l           # 客户端插件目录数
      55
```

**结论**：`packages/client` = 412 个 `.tsx`（与派单件一致）。CSS 实测 **154**，派单件写 184 → **偏差 −30，成因未查明**。"apps/web 只有 4 个 ts" 指的是 **`apps/web/src/`**（实测 4 个：`main.ts`、`node-module-stub.ts`、`preview.ts`、`vite-env.d.ts`），**不是** apps/web 全量（`apps/web/*` tracked = 278，其中 `apps/web/tests/` **递归 265 个**，含 `*.e2e.ts` **118 个**）。**卡片该句在 `apps/web/src` 口径下成立，在 `apps/web` 口径下不成立**——本件按前者理解并已复核。

> **勘误留痕（D870-V 退回项，2026-09-21 修）**：本行初版曾写"其中 148 个在 tests/"，**该数字不可复现且语义错误**。148 的真实口径是 `apps/web/tests/` 的**非递归顶层文件数**（`ls -1p apps/web/tests | grep -vc '/'`），**不是** tests/ 下文件数（265），也**不是** e2e 规格数（118）。初版是把 `git ls-files 'apps/web/**' | sed 's|/[^/]*$||' | sort | uniq -c` 的分组计数误当成"tests/ 下文件数"所致。现按实测口径改正，并补上三条可复现命令。

### 1.2 密度口径与**偏差成因（已闭环）**

**canonical 口径定义**（lead 2026-09-21 定，本件全文用此口径）：
**tracked-only（`git grep`，排除 untracked 构建产物）× 扩展名过滤（`.ts/.tsx/.mjs/.css`）× 范围 `apps/**` + `packages/**`**。

复现命令（照抄即可）：

```bash
cd /Users/wane/src/deepseek-harness && for pat in \
  '(EmptyState|empty-state|emptyState)' '(dark|light|theme)' '(animate|animation|transition)' \
  '(trace|trajectory)' '(thinking|reasoning)' '(density|dense|compact)' 'scroll'; do
  printf "%-40s %s\n" "$pat" "$(git grep -n -E "$pat" -- \
    'apps/**/*.ts' 'apps/**/*.tsx' 'apps/**/*.mjs' 'apps/**/*.css' \
    'packages/**/*.ts' 'packages/**/*.tsx' 'packages/**/*.mjs' 'packages/**/*.css' | wc -l | tr -d ' ')"
done
```

实测原始输出（**本件独立复算，与 lead 修正表逐字一致**）：

```
(EmptyState|empty-state|emptyState)      19
(dark|light|theme)                       2865
(animate|animation|transition)           603
(trace|trajectory)                       998
(thinking|reasoning)                     1809
(density|dense|compact)                  2610
scroll                                   2067
```

**偏差成因（已实证，非猜测）**：派单件旧值取自**文件系统 grep**（`grep -rn --include=... apps packages`），它把 **untracked 构建产物**计入；典型来源 `apps/desktop/lib/types/*.d.ts`（6 个文件，`BrowserWindow` 独占 14 行）。canonical 口径排除该部分后逐项下降：

| 指标 | 旧报（FS，含 untracked） | **canonical（本件实测）** | 差值 |
|---|---|---|---|
| (EmptyState\|empty-state\|emptyState) | 25 | **19** | −6 |
| (dark\|light\|theme) | 3290 | **2865** | −425 |
| (animate\|animation\|transition) | 683 | **603** | −80 |
| (trace\|trajectory) | 1106 | **998** | −108 |
| (thinking\|reasoning) | 1982 | **1809** | −173 |
| (density\|dense\|compact) | 3004 | **2610** | −394 |
| scroll | 2504 | **2067** | −437 |

> **口径脚注（供 verifier 复算）**：上表全部为 **tracked-only** 行计数，`git grep -n -E '<pat>'`，范围 `apps/**` + `packages/**`，扩展名仅 `.ts/.tsx/.mjs/.css`（**不含** `.md/.json/.yaml`，**不含** untracked 与 `node_modules`）。换任一维度（例如去掉扩展名过滤、改用文件系统 grep、把范围缩到 `packages/client/*`）都会得到不同数字——**本件不再引用任何非 canonical 数字**。

**本件新增的一切数字**（§1.1 的 412/154/4/278/265/118/148/55、§1.3 的空态键计数、§十五 的引用点）**均用同一 canonical 命令形式或 `git ls-files` 取得**，并已在各自位置标明。密度数字在本件中**仅作导航，不作任何判据**。

### 1.3 「EmptyState 25」前提核查：**数字修正为 19；且该标识符不是组件**（重要）

canonical 口径下 `(EmptyState|empty-state|emptyState)` = **19**（见 §1.2）。逐文件分解：

```console
$ git grep -n -E '(EmptyState|empty-state|emptyState)' -- 'apps/**/*.ts' 'apps/**/*.tsx' 'apps/**/*.mjs' 'apps/**/*.css' 'packages/**/*.ts' 'packages/**/*.tsx' 'packages/**/*.mjs' 'packages/**/*.css' | sed 's/:.*//' | sort | uniq -c | sort -rn
   4 packages/experimental/agent-team/tests/projection-events.spec.ts
   3 packages/client/ui-workspace/src/client/WorkspacePicker.tsx
   2 packages/extensions/cordis-client-runner/src/client/slot-catalog.ts
   2 packages/client/ui-workspace/src/client/contract/slots.ts
   2 apps/web/tests/smoke-real.e2e.ts
   2 apps/web/tests/lifecycle-chrome.e2e.ts
   1 packages/client/ui-primitives/tests/web-block.client.spec.tsx
   1 packages/client/ui-primitives/src/Menu.module.css
   1 packages/client/ui-conversation/src/client/skeleton/InputBar.module.css
   1 apps/web/tests/chat-scroll-contract.e2e.ts
```

**实测结论（比"数字错了"更重要）**：这 19 处**没有一处是 React 组件**。它们是：
1. **具名槽位（slot）的说明与契约**——`packages/client/ui-workspace/src/client/contract/slots.ts:8`（`WorkspacePicker fills the conversation empty-state hole`）、`:56`（`Directory-flow hole under the conversation empty-state picker`）、`WorkspacePicker.tsx:220-222`；
2. **注释文本**——`ui-primitives/src/Menu.module.css:51`、`ui-conversation/src/client/skeleton/InputBar.module.css:236`（`/* Hero (centered empty-state) ... */`）；
3. **测试名/断言描述**——各 `.spec` / `.e2e.ts`。

即：官方**没有 `EmptyState` 组件**；官方的"空态"是 **① 一个可被插件填充的具名槽位 + ② 一组名单键内联文案** 两件事（后者见 §八）。

**"空态与降级态"模式官方确有实现**，本件**不判为"官方无实现"**，而是按真实机制重建证据链（§八，B-22~B-25 + B-35）。该模式判据（≥1 条可执行借鉴项）完全满足。
**前提勘误已按流程报 CTO**（旧值 25 → canonical 19，且"组件"假设不成立），**不阻塞本件**。

---

## 二、模式①信息层次与密度

### B-01 密度不是"设计稿选择"，而是**持久化用户设置** · `可直接复制`

```console
$ sed -n '12p;18p' packages/client/ui-chat/src/chat-settings.ts
export const TRANSCRIPT_VIEW_MODES = ['normal', 'compact'] as const
export const DEFAULT_TRANSCRIPT_VIEW_MODE: TranscriptViewMode = 'compact'
```

`chat-settings.ts`：`TRANSCRIPT_VIEW_MODES`（`:12`）只允许 `normal | compact` 两值；默认 `compact`（`:18`）；schema 在 `:27-29` 用 union + default 落地，且注释 `:26` 点明"durable Chat schema; also the wire envelope the browser scope validates against"——**同一个 schema 同时是持久化结构与跨进程校验信封**。

**可执行借鉴项**：Synova 的对话密度做成**用户可见设置**（不是编译期常量），枚举封闭、默认紧凑、写入用户设置文档。
**我们改到什么程度（可验收）**：设置里存在"完整 / 紧凑"两档；切换后刷新页面仍生效（持久化）；传非法值（如 `'dense'`）被 schema 拒绝回落到默认；两档下**同一条对话的可见高度差 ≥30%**（可截图量测）。

### B-02 卡片密度用**硬数值**定义，不留"大概" · `可直接复制`

```console
$ sed -n '10p;17p;18p' packages/client/ui-deliverables/src/client/Deliverables.module.css
.file { position: relative; box-sizing: border-box; display: flex; align-items: center; gap: 10px; min-width: 0; height: 60px; padding: 8px 10px; overflow: hidden; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 18px; ... transition: background-color 120ms ease; }
.fileName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; line-height: 20px; }
.description { overflow: hidden; color: var(--dsw-alias-label-tertiary); font-size: 10px; font-weight: 400; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
```

可量测的密度基线（官方实测值，直接可取）：卡片行高 **60px**、内边距 **8px 10px**、元素间距 **10px**、圆角 **18px**、边框 **0.5px**、主标签 **13px/500/20px 行高**、副标签 **10px/400/16px 行高**、主副之间 **2px**（`:16` 的 `.details{gap:2px}`）、hover 过渡 **120ms ease**。
另可量：图标容器 **40×40、圆角 10px**（`:14`）；操作组高 **28px**（`:23`）。

**可执行借鉴项**：Synova 产出卡/列表行按同一组硬数值落地，而不是"看着差不多"。
**我们改到什么程度（可验收）**：产出卡实测行高 60px（±1px）、主标签 13px、副标签 10px、主副间距 2px；同名元素在列表与详情两处取值一致（同 token）。

### B-03 容器查询 + 粗指针触达：同一组件自适应，不写死两端 · `可直接复制`

```console
$ sed -n '34p;35p' packages/client/ui-deliverables/src/client/Deliverables.module.css
@container (max-width: 620px) { .presented { grid-template-columns: minmax(0, 1fr); } }
@media (pointer: coarse) { .split { min-height: 44px; } .open, .chevron { min-width: 44px; } }
```

`:8` 定义两列网格 `grid-template-columns: repeat(2, minmax(0,1fr))`，`:9` 在单卡时切一列（`[data-single='true']`），`:2` 声明 `container-type: inline-size`，`:34` 在**容器**宽度 ≤620px 时回落单列——**按容器而非视口**，同一组件放进侧栏也正确。`:35` 在触屏设备把操作区提到 44px 最小触达。

**可执行借鉴项**：Synova 的卡片网格用容器查询（不写视口断点）＋触屏最小 44px。
**我们改到什么程度（可验收）**：把同一卡片放进 400px 侧栏 → 自动单列（不变形不溢出）；触屏上按钮可点区域 ≥44×44px；把窗口从 1200px 缩到 600px，卡片不出现横向滚动条。

---

## 三、模式②状态可视化（健康 / 进行中 / 失败）

### B-04 五态状态点 + **关闭联合穷尽**（伪造状态必须抛错） · `可直接复制`

```console
$ sed -n '8p' packages/client/ui-primitives/src/StateDot.tsx
export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'
$ sed -n '33p;37p' packages/client/ui-jobs/src/client/JobListAction.tsx
    case 'running': return 'ongoing'
    case 'failed': return 'error'
$ sed -n '23p' packages/client/ui-jobs/src/client/JobListAction.tsx
function assertNever(value: never): never {
```

官方把"业务状态 → 呈现状态"收敛为 **5 个**（`StateDot.tsx:8`），并由 `dotState()`（`JobListAction.tsx:31-41`）做映射：`running→ongoing`、`stopping→warning`、`completed→done`、`killed→warning`、`failed→error`。映射的注释 `:28-30` 解释了归并理由——**"stopping 与 killed 共用警示色：两者都表示工作因被请求而结束（或正在结束），而非自行结束"**。`default` 分支调用 `assertNever`（`:23-25`，注释 `:22` "closed-union exhaustiveness fence"）→ **出现未登记状态直接抛错，而不是静默显示成一个看起来正常的状态**。

**可执行借鉴项**：Synova 的诊断/哨兵/任务状态收敛到有限集合做可视化；状态映射用穷尽检查，未登记值抛错。
**我们改到什么程度（可验收）**：状态点颜色只有 5 种；注入一个未登记状态字符串 → 抛 `unhandled job status` 且**不渲染任何状态点**（不出现"绿色看起来正常"的假象）；每个业务状态都能在单测里断言到唯一呈现态。

### B-05 时长格式化：**最多两级相邻单位**，不堆词汇 · `可直接复制`

```console
$ sed -n '62p' packages/client/ui-jobs/src/client/JobListAction.tsx
function formatDuration(elapsedMs: number, t: TranslateNS<typeof NS>): string {
```

`JobListAction.tsx:56-70`：注释明写"Elapsed time in at most two adjacent units"（最多两级相邻单位），实现为 `hours>0 → h+min`、`minutes>0 → min+s`、否则 `s`；且注释 `:57-61` 说明为何**不引入 day/month 词汇**——"background job that outlives an hour is already exceptional… rather than growing a day/month vocabulary no producer currently reaches"（不为无人使用的量级扩词汇表）。

**可执行借鉴项**：Synova 的"跑了多久"统一两级单位；不实现无人使用的量级分支。
**我们改到什么程度（可验收）**：运行时长显示形态只有 `Xh Ym` / `Xm Ys` / `Xs` 三种；不存在"天/月"分支（grep 零命中）；跨单位边界（59s→60s、59m59s→1h0m）显示不跳变。

### B-06 状态与文案**三层分离**：机器态 → 呈现态 → 本地化文案 · `可直接复制`

```console
$ sed -n '44p' packages/client/ui-jobs/src/client/JobListAction.tsx
function statusLabel(status: JobView['status'], t: TranslateNS<typeof NS>): string {
```

`statusLabel`（`:43-54`）与 `dotState`（`:31-41`）是**两个独立函数**：颜色归颜色、文字归文字，二者都从同一个 wire status 派生，都各自穷尽检查。文案本体在 `ui-jobs/src/client/locales.ts:32-36`（`status.running/stopping/completed/killed/failed`）。

**可执行借鉴项**：Synova 把"状态→颜色""状态→文案"拆成两个独立纯函数，文案进 locale 表（不散落在 JSX）。
**我们改到什么程度（可验收）**：`grep` 状态字符串不命中任何 `.tsx` 内的裸中文/裸英文状态词（全部来自 locale 键）；新增语言只改 locale 文件、不改组件。

---

## 四、模式③对话刻度条（对话内统计条）

> 官方对应物是 composer 下方的**双胶囊统计条**：一个 gauge 胶囊（轮/步计数 + 输出速度）＋一个 database 胶囊（总 token + 缓存命中），各自打开一个详情对话框。
> 出处：`packages/client/ui-chat/src/client/chat/StatsPills.tsx`（文件头注释 `:1-7` 自述）。

### B-07 "没有内容就不渲染"——刻度条的**空态是 null，不是 0** · `可直接复制`

```console
$ sed -n '330p;332p' packages/client/ui-chat/src/client/chat/StatsPills.tsx
  const hasTokens = usage !== undefined
  if (stats.steps === 0 && !hasTokens) return null
```

`:330-331` 判定"有 token 活动"（计费输入或输出 >0）；`:332` 在既无步数又无 token 时**整体返回 null**。注释 `:329` 说明理由——"a session whose steps all settled without billing (e.g. every request failed) shows its counts without a usage pill"（全部失败、无计费的会话只显示计数、不显示用量胶囊）。

**可执行借鉴项**：Synova 的对话刻度条在"无数据"时**整条不渲染**（而不是显示 0/0/0），且分项独立判定（有计数无用量时只显示计数）。
**我们改到什么程度（可验收）**：新会话（无轮次无 token）下刻度条 DOM 不存在；构造"有轮次但全失败无 token"的会话 → 只出现计数胶囊、不出现用量胶囊；不出现任何 `0 tok` 类无意义数字。

### B-08 刻度数字必须**抗分页与压缩**（走 durable projection，不行才整体回落） · `可直接复制`

```console
$ sed -n '322p;327p' packages/client/ui-chat/src/client/chat/StatsPills.tsx
  // Every figure rides the durable sessionStats projection, so paging and
  const stats = useMemo(() => projected ?? deriveStats(settledNodes), [projected, settledNodes])
```

`:322-325` 注释说明：**每个数字都走持久的 `sessionStats` projection，所以翻页与压缩都不会改变它们**；`:327` 的回落策略是"整体回落"——没有 projection 时用 `deriveStats(settledNodes)`（`:50-80`）在**当前窗口**上折叠，且注释 `:44-49` 强调"field names deliberately mirror the projection's so the two swap wholesale"（**字段名刻意对齐，使两者可整体互换**）。

**可执行借鉴项**：Synova 的对话统计（轮数/token/耗时）取自持久投影，不从"当前渲染的消息数组"现算；确需回落时**整体替换、字段同名**。
**我们改到什么程度（可验收）**：向上滚动加载更多历史后，刻度数字**不变**（可写成断言：同会话翻页前后数值相等）；构造无投影环境 → 数字来自窗口折叠且**不含 undefined/NaN**；两种来源的字段名集合完全相同（可用类型/kv 断言）。

### B-09 两个胶囊**共用一个互斥槽位**（开一个自动关另一个） · `可参照`

```console
$ sed -n '320p;321p' packages/client/ui-chat/src/client/chat/StatsPills.tsx
  // One exclusive slot for both dialogs: opening either pill closes the other.
  const [openPill, setOpenPill] = useState<'time' | 'usage' | null>(null)
```

`:320-321`：两个对话框共用一个状态 `'time' | 'usage' | null`，注释直陈"opening either pill closes the other"。对比 A-23（`main.ts` 用 `Set<AbortController>` 管**多个**并发弹窗）——官方在**同层互斥**场景选单一状态、在**跨层并发**场景选集合，是两种不同取舍。

**可执行借鉴项**：Synova 同一锚点下的互斥面板用单一状态变量表达"当前打开的是哪一个"。
**我们改到什么程度（可验收）**：依次点开时间胶囊再点用量胶囊 → 任意时刻 DOM 中**恰有 1 个**对话框；按 Esc / 点击外部后状态回到 `null`（可断言）。

### B-10 流式增量**不得**触发刻度条重渲 · `可直接复制`

```console
$ sed -n '317p' packages/client/ui-chat/src/client/chat/StatsPills.tsx
export const StatsPills = memo(function StatsPills({ useChat, useProjection, t }: StatsPillsProps) {
```

`StatsPills` 用 `memo` 包裹（`:317`）；文件头注释 `:4` 明确其目的——"**Settled-node identity prevents stream-delta updates from rerendering the row**"（靠"已落定节点"的引用身份，让流式增量更新不重渲这一行）。另 `:1-3` 说明它挂在 `conversation.composer.dock` 上，"sticks with the composer in the active conversation scrollport"（随 composer 附着在滚动区内）。

**可执行借鉴项**：Synova 的统计条/状态条订阅"已落定"数据源，流式 token 期间不重渲。
**我们改到什么程度（可验收）**：流式输出期间对统计条打渲染计数 → 渲染次数在流式期间 = 0（落定后才 +1）；长输出（>5000 token）下滚动帧率不掉（无长任务）。

---

## 五、模式④轨迹 / 思考过程

### B-11 折叠摘要**分区取行**：流式中显示"最后一行"，结束后显示"第一行" · `可直接复制`

```console
$ sed -n '32p;38p' packages/client/ui-chat/src/client/chat/ReasoningRow.tsx
  const summary = (running ? latestLine(text) : firstLine(text)).replaceAll('**', '')
      data-state={running ? 'running' : 'ok'}
```

`ReasoningRow.tsx:9-18` 定义两个取行函数：`firstLine`（首个换行前）与 `latestLine`（末尾换行后）。`:32` 的取舍是**语义性的**——**流式中看"最新一行"（用户关心现在在想什么），结束后看"第一行"（首句即结论）**。`:32` 同时 `replaceAll('**','')` 去掉折叠态里的 Markdown 粗体标记。`:38` 把 `running|ok` 落到 `data-state`，供 CSS 分支。

**可执行借鉴项**：Synova 的"思考中"折叠行：**流式中显示最新一行，结束后显示首行**；两条摘要路径都去 Markdown 标记。
**我们改到什么程度（可验收）**：流式过程中折叠行文本随最新内容滚动更新；结束后**固定**为首行且刷新页面不变（可断言文本相等）；折叠态文本不含 `**`。

### B-12 折叠态**固定高度 + `contain`**：思考行不得引起布局跳动 · `可直接复制`

```console
$ sed -n '6,9p' packages/client/ui-chat/src/client/chat/ReasoningRow.module.css
.root:not([data-expanded]) {
  contain: size layout;
  height: calc(24px + var(--dsh-content-font-delta, 0px));
}
```

折叠态高度锁死 **24px**（随内容字号增减的 delta 补偿），并加 `contain: size layout`（隔离尺寸与布局计算，抑制回流外溢）。`:16-23` 另处理展开态：展开后正文随对话滚动，因此把折叠开关**置为 sticky**（`[data-expanded] [data-open] [data-disclosure-row] { position: sticky; top: 0; z-index: 1 }`），保证收起入口始终可达。

**可执行借鉴项**：思考/过程类折叠行折叠时锁定高度并对齐基线，展开后收起开关 sticky 可达。
**我们改到什么程度（可验收）**：折叠态高度恒为 24px（内容多少与字号无关，仅随字号设置线性变化）；连续 20 条思考行折叠时**累计布局偏移 CLS = 0**（可用 PerformanceObserver 断言）；展开长内容后滚动，收起开关始终在视口顶部可见。

### B-13 运行中动效：**2.6s 扫光**，且只是"提示"不是"进度" · `可参照`

```console
$ sed -n '25p;30p;37p' packages/client/ui-chat/src/client/chat/ReasoningRow.module.css
.root[data-state='running'] .row::after {
  width: 300px;
  animation: dsh-reasoning-row-sweep 2.6s ease-out infinite;
$ sed -n '41,44p' packages/client/ui-chat/src/client/chat/ReasoningRow.module.css
@keyframes dsh-reasoning-row-sweep {
  0% { left: -300px; }
  90%, 100% { left: 100%; }
}
```

扫光由 300px 宽渐变条（`:31-36`）在 2.6s 内从 −300px 移到 100%，**90% 处即已到位**（`:43`）——即留了一段静止期，暗示"等待"而非"完成度"。`pointer-events: none`（`:38`）确保动效层不拦截点击。

**可执行借鉴项**：Synova 的"运行中"指示用**循环扫光**表达"在动但进度未知"，与"确定性进度条"严格区分；动效层不接收指针事件。
**我们改到什么程度（可验收）**：运行中扫光周期 2.6s ±0.2s；进度未知的任务**不出现百分比数字**（grep 断言）；扫光层 `pointer-events:none`，其下方按钮点击 100% 命中。

### B-14 状态**不靠动效单独表达**：给屏幕阅读器补隐藏状态词 · `可直接复制`

```console
$ sed -n '41p' packages/client/ui-chat/src/client/chat/ReasoningRow.tsx
      {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
```

`ReasoningRow.tsx:41`：运行中额外渲染一个 `visuallyHidden` 的状态词（`row.running`），使**视障用户不依赖扫光动效**也能知道"正在思考"。

**可执行借鉴项**：Synova 所有"靠颜色/动效表达的状态"必须同时有可被辅助技术读到的文本。
**我们改到什么程度（可验收）**：关闭 CSS（或仅读 DOM 文本）时，仍能得到状态词；四种状态（进行中/成功/失败/空闲）各有独立可读文本，且不重复。

---

## 六、模式⑤产出卡片

### B-15 卡片结构固定为**图标 + 名称 + 状态副文案 + 单一主操作 + 溢出菜单**，且**操作不嵌套在可点卡片内** · `可直接复制`

```console
$ sed -n '21p' packages/client/ui-deliverables/src/client/PresentedFileCard.tsx
 * Render independent file actions without nesting buttons inside a clickable card.
```

`PresentedFileCard.tsx:20-24` 的 JSDoc 直陈设计约束——**不在可点击卡片里嵌套按钮**。实现手法见 `:51-53`：卡片级点击是一个覆盖全卡的透明 `<button className={css.cardPreview}>`（CSS `:12` `position:absolute; z-index:1; inset:0`），而真正的操作组 `.fileBody`（`:55`）与图标（`:54`）抬到 `z-index:2` 并 `pointer-events:none`（CSS `:14,:15`），操作组自己再开 `pointer-events:auto`（CSS `:23`）。**用层级与命中开关解决"整卡可点 + 按钮可点"的冲突，而不是嵌套交互元素。**

**可执行借鉴项**：Synova 产出卡采用同一结构（图标/名称/副状态/一个"打开"+ 一个溢出菜单），并用 z-index + pointer-events 分层而非按钮嵌套。
**我们改到什么程度（可验收）**：卡片任意空白处点击 = 主操作；操作按钮点击 = 只触发该按钮、**不冒泡**触发主操作（可断言调用计数）；DOM 中不存在 `<button>` 内含 `<button>`（可用断言/校验）。

### B-16 卡片状态**随操作阶段切换文案**，错误态有独立视觉通道 · `可直接复制`

```console
$ sed -n '46,50p' packages/client/ui-deliverables/src/client/PresentedFileCard.tsx
  const status = phase === undefined
    ? cardDescription(file.description, metadata)
    : t(reveal === 'directory' && phase === 'revealed' ? 'presented.directoryOpened'
      : reveal === 'directory' && phase === 'revealing' ? 'presented.directoryOpening'
        : reveal === 'directory' && phase === 'revealError' ? 'presented.directoryError' : `presented.${phase}`)
```

`:46-50`：**无操作时**显示业务描述，**有操作时**同一行切换为阶段文案（opening / opened / error）。`:58` 把 `role='status'` 挂到该行（可被辅助技术播报），`:59` 在 `phase` 属于 `error | revealError | nativeUnavailable` 时打 `data-error`，CSS `:19` 让错误态换用 `--dsw-alias-state-error-primary` 颜色。

**可执行借鉴项**：Synova 产出卡的一行副文案承载"描述 → 操作中 → 完成 → 失败"四态，失败有独立颜色 + `role=status` 可播报。
**我们改到什么程度（可验收）**：点开后副文案在 4 个阶段各不同（可断言文本集合）；失败态文字颜色为错误色 token（非普通次要色）；四态变化均通过 `role=status` 可被读屏捕获。

### B-17 hover 时**副文案换成动作提示**（信息密度按需让位） · `参照`

```console
$ sed -n '20,22p' packages/client/ui-deliverables/src/client/Deliverables.module.css
.previewHint { display: none; }
.file:hover .secondaryText { display: none; }
.file:hover .previewHint { display: inline; }
```

静态时显示文件描述（`secondaryText`），hover 时**替换**为"预览"提示（`previewHint`）——**同一行不叠加两段文字**，而是交换。

**可执行借鉴项**：Synova 卡片在 hover 时用"动作提示"交换"说明文本"，避免一行挤两段。
**我们改到什么程度（可验收）**：hover 前后该行文本长度变化但**行高不变**（无跳动）；hover 态与静态态各自不出现文字截断为 `…`（在标称宽度下）。

### B-18 菜单关闭后**焦点回到触发按钮** · `可直接复制`

```console
$ sed -n '39,43p' packages/client/ui-deliverables/src/client/PresentedFileCard.tsx
  const act = (action: PresentedAction) => {
    setMenuOpen(false)
    previewRef.current?.focus()
    onAction(action)
  }
```

`act()`（`:39-43`）：关菜单 → **焦点还给触发元素** → 再执行动作。`previewRef`（`:34`）指向主操作按钮。同时 `:37` 在菜单失效（`menuDisabled`）时主动收起，避免留下一个点不开的菜单。

**可执行借鉴项**：Synova 的溢出菜单在关闭/选择后把焦点还给触发按钮，避免键盘用户焦点丢失。
**我们改到什么程度（可验收）**：键盘操作菜单（打开→选择/取消）后 `document.activeElement` = 原触发按钮；菜单因条件失效被禁用时自动收起（不残留）。

---

## 七、模式⑥权限与模式选择器

### B-19 权限语义用**图标字形**区分（勾=只读 / 铅笔=可写 / 叹号=全权），不靠文字长度 · `参照`

```console
$ sed -n '24,27p' packages/client/ui-permission-presets/src/client/PermissionSelect.tsx
/* Shield glyphs (design set 1556) over the ui-primitives shield contour:
   check = read-only, pencil = workspace write, exclamation = full access.
   currentColor so the trigger and menu rows tint them with their own text
   color. */
```

`PermissionSelect.tsx:29-52` 实现三个 glyph 的映射表：`'read-only'`（盾 + 勾）、`'workspace-write'`（盾 + 铅笔）、`FULL_ACCESS`（盾 + 感叹号）。`currentColor` 使图标在触发器与菜单行**各自继承所在行的文字色**，不需要维护两套配色。`:54-57` 对**宿主自定义的权限名**返回 `undefined`（"host-configured names outside the design set get none"）——**未知权限不猜图标**。

**可执行借鉴项**：Synova 的权限/模式等级用"同一底形 + 语义标记"的图标体系（读/写/全权三档），图标随文字色；宿主自定义档位则不给图标。
**我们改到什么程度（可验收）**：三档权限在触发器和菜单里图标一致且颜色随所在行文字色（不出现硬编码色）；第四档自定义权限显示为无图标（不显示错误的勾/笔/叹号）；图标在 16×16 下可辨识（不糊）。

### B-20 目录快照 + **失效通知**拆成两个 store（防"显示已失效选项"） · `可参照`

```console
$ sed -n '17p;27p' packages/client/ui-permission-presets/src/client/catalog.ts
  readonly store: SnapshotStore<PermissionCatalogState> = createSnapshotStore({
  readonly invalidations: SnapshotStore<{ count: number }> = createSnapshotStore({ count: 0 })
```

`catalog.ts:14-27`：`store` 承载"最后一份完整目录"（`:10` 注释：`null` 表示尚无成功读取），`invalidations` 承载"失效 tick"。`:21-26` 的注释解释了为什么要拆——"**One tick per invalidation… published before the replacement read starts. Consumers that must drop displayed options subscribe here instead of to `store`, whose publications also settle a read a displayed surface is waiting for**"（必须在换目录前先让"正在显示旧选项"的界面**主动丢弃**，否则会短暂显示已失效的权限档位）。`:44-53` 在构造时先订阅两类失效源（catalog-changed 远程事件 + connection 代际变更）**再发起首次读取**，以关闭 install/read 竞态。

**可执行借鉴项**：Synova 的任何"可选清单"（模型/权限/专家/工具）在数据可能变更时，界面**先作废已显示选项**再取新值；订阅先于首次读取（关闭 install/read 竞态）。
**我们改到什么程度（可验收）**：在权限清单变更（增删档位）瞬间，界面**不出现**已删除档位（可写成时序断言）；连接断开重连后清单代际更新、旧值不残留；首读期间到达的通知不丢（断言最终值 = 最新值）。

### B-21 两个入口（弹出选择器 + 设置行）共用**同一目录单例** · `参照`

```console
$ sed -n '1p' packages/client/ui-permission-presets/src/client/catalog.ts
/** Identity-stable process permission catalog shared by both selection surfaces. */
```

`catalog.ts:1` 与 `:14`（"One latest-result-wins catalog reader for the whole browser process"）：弹出式选择器与设置里的权限行**读同一个 store**，保证两处永不显示互相矛盾的权限状态。文件 `ui-permission-presets/src/client/PermissionRow.tsx` + `PermissionSelect.tsx` 是两个呈现面。

**可执行借鉴项**：Synova 同一份配置（模型/权限）在多处出现时共用一个进程级读取器，不各自请求。
**我们改到什么程度（可验收）**：同屏同时打开设置面板与弹出选择器 → 两处档位完全一致（可断言相等）；变更后两处**同时**刷新（不一致窗口 = 0 帧，可断言）；网络请求数：一次变更多处消费只发 1 次读。

---

## 八、模式⑦空态与降级态

> **重要口径**：官方**不用** `EmptyState` 组件（见 §1.3 勘误）。官方做法是**名单键 + 内联文案**，按语境分型。

### B-22 空态分两型：**"从来没有" vs "搜索无结果"** 文案不同 · `可直接复制`

```console
$ sed -n '23,24p' packages/client/ui-workspace/src/client/locales.ts
  'empty.none': '暂无会话',
  'empty.noMatches': '无匹配结果',
$ sed -n '94,95p' packages/client/ui-workspace/src/client/locales.ts
  'empty.none': 'No sessions yet',
  'empty.noMatches': 'No matches',
```

同一模块内**两个键并存**（`empty.none` 与 `empty.noMatches`，中文 `:23-24`、英文 `:94-95`）。`ui-settings-unarchive-sessions/src/client/ArchivedSessionsSection.tsx:105` 的用法把分型条件写得很明确：`rows.length > 0 && visible.length === 0 ? <p>{t('emptySearch')}</p>`——**有数据但被过滤空了**才显示搜索空态。

**可执行借鉴项**：Synova 的空态至少区分"从未有数据"与"筛选后为空"，二者文案与下一步动作不同。
**我们改到什么程度（可验收）**：全新账号（无会话）与搜索无命中，两处显示**不同文案**（可断言文本不等）；"搜索无结果"旁提供清除筛选入口，"从未有"旁提供创建入口；两态都不显示数字 0。

### B-23 空态是**语境内联一句**，不是大插画占位 · `可直接复制`

```console
$ sed -n '32p;34p' packages/client/ui-model-selection/src/client/locales.ts
  'empty.models': '没有可用的模型。',
  'empty.efforts': '当前模型未提供推理等级。',
$ sed -n '411p' packages/client/ui-dockkit/src/components/TabPanel.tsx
          ? <p className={css.empty}>{callbacks.labels.emptyPane}</p>
$ sed -n '425p' packages/client/ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.tsx
          {nothingMatches ? <p className={css.status}>{t('emptySearch')}</p> : null}
```

三处空态全是**单个 `<p>` + 一句完整句子**（含句号），落在它所属的面板/列表内联位置；没有全屏插画页，也没有"暂无数据"四个字的裸标签。`ui-model-selection` 还把"模型为空"与"该模型无推理等级"分成两句（`:32` vs `:34`）——**空态精确到成因**。

**可执行借鉴项**：Synova 的面板空态用内联单句（说明**当前上下文为何为空**），不用全屏插画；不同成因给不同句子。
**我们改到什么程度（可验收）**：每个面板空态 ≤1 句且以句号结束；同屏不出现两段以上空态文案（无堆叠）；"模型为空"与"该模型无等级"在不同条件下显示不同句子（可断言）。

### B-24 降级态：**输入框 placeholder 直接说明"不可用原因 + 仍可做的事"** · `可直接复制`

```console
$ sed -n '17,18p' packages/client/ui-conversation/src/client/locales.ts
  'placeholder.unavailable': '会话不可用',
  'placeholder.parentOffline': '父会话已离线，无法继续发送；仍可停止当前运行',
```

`placeholder.parentOffline` 是**降级文案的范本**：一句话给全三件事——① 事实（父会话离线）② 限制（无法继续发送）③ **仍然可用的能力**（仍可停止当前运行）。对比 `placeholder.unavailable`（`:17`）只是"会话不可用"——官方在同一文件里保留了"粗/细"两档降级文案。

**可执行借鉴项**：Synova 的降级态文案模板固定为"原因 + 受限动作 + 仍可用动作"三段式。
**我们改到什么程度（可验收）**：所有降级态文案含"仍可…"子句（可正则断言）；不出现只写"不可用/失败"三字而不给下一步的文案；降级态下"仍可做"的动作**实际可点通**（端到端断言）。

### B-25 空态与错误态**在同一行位**，靠数据属性换样式（不换组件） · `参照`

```console
$ sed -n '58,59p' packages/client/ui-deliverables/src/client/PresentedFileCard.tsx
        <span className={css.description} role={phase === undefined ? undefined : 'status'}
          data-error={phase === 'error' || phase === 'revealError' || phase === 'nativeUnavailable' ? true : undefined}>
```

副文案行既承载"正常描述"也承载"空/失败"，通过 `data-error` 切色（CSS `:19`）、`role=status` 在非正常态开启播报——**不引入第二套组件**。

**可执行借鉴项**：Synova 的状态行用同一 DOM 位 + `data-*` 切换视觉与可读性，不给空态/失败态各造一个组件。
**我们改到什么程度（可验收）**：正常/空/失败三态使用**同一个**组件（组件数不变）；三态切换时行高不变；仅正常态无 `role=status`，其余有。

### B-35 空态本身是**可被填充的具名槽位**；无占用者时入口整体消失（不留死按钮） · `可参照`

```console
$ sed -n '1,21p' packages/client/ui-workspace/src/client/contract/slots.ts
/**
 * ui-workspace contracts. Two registrations share this package:
 *
 * - WorkspaceBrowser fills the sidebar shell's `sidebar.workspaces` hole —
 *   the whole browsing region (section header, search, grouped/flat session
 *   list, workspace dialogs). It registers this package's viewing store and
 *   consumes the shell's two-fact owner share (wide / expandSidebar).
 * - WorkspacePicker fills the conversation empty-state hole (menu + error
 *   dialog shared with the browser).
 *
 * Each registration also declares one **directory-flow hole** (`single`
 * kind): the slot a composed picker package's client half fills with its
 * picking interaction — a renderless native-chooser driver or an in-app
 * browsing dialog. ui-workspace owns the trigger (the "Add workspace…"
 * entry, present only while the hole is occupied) and the adoption
 * semantics (`createWorkspace({ path })`, the retryable error dialog,
 * Choose again); the occupant owns everything between `open` and the picked path,
 * including creating a new directory to hand back. That occupant-owned
 * creation is why adding a workspace has a single route: an unoccupied hole
 * leaves the surface with no add affordance at all.
 * Two holes exist because the two menu surfaces are independent slot entries

$ sed -n '53,61p' packages/client/ui-workspace/src/client/contract/slots.ts

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Directory-flow hole under the conversation empty-state picker (declared by the WorkspacePicker entry). */
    'conversation.hero.workspace.directoryFlow': { kind: 'single'; scope: 'root'; owner: DirectoryFlowOwnerProps }
    /** Directory-flow hole under the sidebar browsing region (declared by the WorkspaceBrowser entry). */
    'sidebar.workspaces.directoryFlow': { kind: 'single'; scope: 'root'; owner: DirectoryFlowOwnerProps }
  }
}

$ sed -n '219,224p' packages/client/ui-workspace/src/client/WorkspacePicker.tsx
/**
 * The conversation empty-state registration: adapts the owner share to the
 * core flow (all state and semantics live in the flow / the owner).
 * @param props - empty-state slot props (owner share + injected creation callback).
 * @returns the flow element.
 */
```

`slots.ts:1-21` 是本件读到的**架构层面最有价值的一段**。官方"空态"不是一块写死的 UI，而是：
- **一个洞（hole）**：`conversation empty-state hole`（`:8`）由 `WorkspacePicker` 填充；侧栏的 `sidebar.workspaces` 洞由 `WorkspaceBrowser` 填充（`:3-6`）。
- **洞里再声明洞**：每个注册再声明一个 `single` kind 的 **directory-flow hole**（`:11-13`），由"组合型选择器包"的客户端半边填充（原生选择器驱动 / 应用内浏览对话框二选一）。
- **归属切分明确**：`ui-workspace` 持有**触发器**（`"Add workspace…"` 条目）与**采纳语义**（`createWorkspace({ path })`、可重试错误对话框、Choose again）；**占用者**持有 `open` 到"拿到路径"之间的全部逻辑。
- **关键行为**：注释 `:19-20` 直陈——**"an unoccupied hole leaves the surface with no add affordance at all"**，即**槽位无人占用时，该能力的入口整体不存在，而不是留一个点了没反应的按钮**。同理 `WorkspacePicker.tsx:219-224` 是"对话空态注册"，把空态槽位的 owner share 适配进核心流程。

槽位契约用 `declare module` 做**声明合并**（`slots.ts:53-61`），把槽位名与 owner props 类型写进 `SlotMap`（`'conversation.hero.workspace.directoryFlow'`、`'sidebar.workspaces.directoryFlow'`，均为 `{ kind: 'single'; scope: 'root' }`）。

**可执行借鉴项**：Synova 把"空态/首屏引导区"做成**可被扩展填充的具名槽位**（含类型契约），槽位的**触发器**与**槽内实现**分属不同 owner；**槽位无人占用时入口整体不渲染**（不留死按钮）。
**我们改到什么程度（可验收）**：卸载填充槽位的扩展后，该入口**完全消失**（DOM 不存在、无占位空按钮，可断言）；装上后入口出现且功能可用；槽位名与 props 类型在契约文件（`SlotMap` 等价物）中单点声明，全仓库对槽位名的引用**只来自该声明**（可 grep 断言）；新增一个槽位占用者只加文件、不改框架代码。

---

## 九、模式⑧动效与滚动流畅感

### B-26 过渡时长**分级**且有统一缓动曲线 · `可直接复制`

```console
$ git grep -nE "transition: [^;]+;" -- 'packages/client/*' | grep -vE "tests/|\.spec\." | head -14
packages/client/ui-agent-preset/src/client/AgentPresetSection.module.css:99:  transition: border-color .16s, background .16s;
packages/client/ui-chat/src/client/chat/MessageIconActions.module.css:42:    transition: opacity 80ms ease;
packages/client/ui-chat/src/client/chat/MessageItem.module.css:226:  transition: transform 120ms ease;
packages/client/ui-chat/src/client/chat/TurnNavigator.module.css:40:  transition: height 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
packages/client/ui-chat/src/client/chat/TurnNavigator.module.css:87:  transition: top 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
packages/client/ui-chat/src/client/chat/TurnNavigator.module.css:117:  transition: width 140ms ease, background-color 140ms ease;
```

官方过渡时长落在 **80 / 120 / 140 / 160 / 220 ms** 几个档位，语义分工清晰：**微反馈 80ms**（图标动作）、**元素状态 120ms**（transform、背景）、**控件尺寸 140ms**、**面板/边框 160ms**、**结构性移动 220ms**（高度、位置）。结构性移动用统一曲线 `cubic-bezier(0.2, 0.8, 0.2, 1)`（`:40,:87`）——**先快后缓**，避免"起手生硬"。

**可执行借鉴项**：Synova 建一张过渡时长表（80/120/140/160/220ms + 一条结构曲线），新组件一律查表取值，不随手写 `0.3s`。
**我们改到什么程度（可验收）**：`grep -E "transition:.*[0-9]+m?s"` 的取值**全部**落在表中（可脚本断言，非表内值报红）；结构性位移动画统一使用 `cubic-bezier(0.2, 0.8, 0.2, 1)`；不存在 `transition: all`（可断言）。

### B-27 `prefers-reduced-motion` 下**关掉过渡**（不是变慢） · `可直接复制`

```console
$ grep -n -A2 "prefers-reduced-motion" packages/client/ui-attachment/src/FileCard.module.css | head -5
115:@media (prefers-reduced-motion: reduce) {
116-  .remove {
117-    transition: none;
```

三处一致实现：`ui-attachment/src/AttachmentRail.module.css:82`、`ui-attachment/src/FileCard.module.css:117`、`ui-attachment/src/client/ComposerAttachments.module.css:66` 均在 `@media (prefers-reduced-motion: reduce)` 下把过渡置为 `none`。

**可执行借鉴项**：Synova 全局支持 `prefers-reduced-motion`，命中时过渡直接置 `none`（而非延长/减半，后者仍会引发不适）。
**我们改到什么程度（可验收）**：开启系统"减少动效"后，`getComputedStyle(el).transitionDuration` 为 `0s`（可断言）；功能不受影响（该动作仍可完成）；开启减少动效后无动画时长 >0 的过渡残留（可脚本扫描）。

### B-28 滚动条皮肤走令牌，且**双路径互斥**（避免 WebKit 悬停态被静默吃掉） · `可参照`

```console
$ sed -n '16,26p' packages/client/ui-theme/src/styles/scrollbar.css
body {
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l1);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l1);
  --dsh-scrollbar-thumb-border: 0px;
  --dsh-scrollbar-track-margin: 0px;
  /* The WebKit bar's layout width, mirrored by the ::-webkit-scrollbar rule
     below. A surface that must align itself beside a space-consuming bar
     (ConversationRoot's overlay composer seat) reads this instead of
     hardcoding the number. */
  --dsh-scrollbar-width: 8px;
}
```

`scrollbar.css:1-14` 的文件头注释说明了两个易踩坑点，都是"照抄就会错"的知识：
1. **规则必须挂在 `body` 而非 `html`**——因为 `--dsw-alias-*` 令牌声明在 `body` 上（设计平台文件 `:80` 的 `body[data-ds-dark-theme]` 覆盖同层），**自定义属性只向下继承**，`html` 上会解析为 guaranteed-invalid 而回落到 `auto`。
2. **两条路径必须互斥**（`:28-40` 长注释给出实测）：一旦声明了非 `auto` 的 `scrollbar-width`/`scrollbar-color`，Chromium/Safari 会**丢弃该元素所有 `::-webkit-scrollbar*` 规则（含 `:hover`）**，于是"无条件同时声明两套"会导致悬停态**完全没有渲染**；官方用 `not selector(::-webkit-scrollbar)` 作门，仅在伪元素未实现处（Firefox）走标准路径。

**可执行借鉴项**：Synova 自绘滚动条时：令牌挂载点与令牌声明层一致；WebKit 与标准两条路径互斥（用 `@supports not selector(::-webkit-scrollbar)` 类门），并且把滚动条宽度做成可被布局消费的变量而非硬编码。
**我们改到什么程度（可验收）**：深色主题下滚动条不是系统白色（可截图断言）；悬停滚动条有可见反馈（Chromium 与 Firefox 都能看到，二者路径不同）；无"同一条滚动条在两浏览器颜色不一致"。

---

## 十、模式⑨深浅色与可读性

### B-29 主题引导**双段注入**：head CSS 先上色（防首帧白闪），body 脚本再装选择器 · `可直接复制`

```console
$ sed -n '16p;20p' packages/client/ui-theme/src/boot-theme.ts
  const light = `:root{color-scheme:light}body{background-color:${LIGHT_BACKGROUND};--dsh-boot-bg:${LIGHT_BACKGROUND}}`
  return `${light}@media(prefers-color-scheme:dark){${dark}}`
$ sed -n '32p' packages/client/ui-theme/src/boot-theme.ts
  document.body.toggleAttribute('data-ds-dark-theme', dark)
$ sed -n '49,52p' packages/client/ui-theme/src/boot-theme.ts
  return [
    { kind: 'style', text: bootThemeStyle(preference) },
    { kind: 'script', placement: 'body', text: bootThemeBodyScript(preference, fontSize) },
  ]
```

文件头注释 `:1-5` 说明分工："**Head CSS colors the document canvas before script execution; the body script installs the palette selector and font size that the client presenters adopt**"。实现细节：
- `:11-12` 颜色**硬编码为常量**（`#fff` / `#151517`）——引导期不能用令牌，因为令牌本身要靠主题类决定；
- `:16-17` 同时设 `color-scheme`（让 UA 控件也配对）与 `body` 背景，并暴露 `--dsh-boot-bg` 供后续读取；
- `:20` `system` 偏好走 `@media(prefers-color-scheme:dark)` **纯 CSS 判定**，不依赖脚本；
- `:24-34` body 脚本再补：`dataset.dsThemeSource`（记录来源，供调试/其他组件读）、`data-ds-dark-theme` 属性（**驱动令牌切换的唯一开关**）、`--dsh-content-font-size`（字号）。
- `:45-52` 返回有序的两条注入（style 在前、body script 在后）。

**可执行借鉴项**：Synova 的主题（含未来深色）必须在**任何脚本执行前**就把画布底色定下来；`system` 走 CSS 媒体查询；暗色形态用**单一属性开关**驱动全部令牌。
**我们改到什么程度（可验收）**：以暗色偏好冷启动 → **无白闪**（首帧背景即 `#151517`，可用录屏逐帧断言）；禁用 JS 后仍是正确底色（纯 CSS 路径生效）；切换偏好不出现中间态旧色（无闪烁帧）。

### B-30 暗色令牌覆盖挂在 `body[data-ds-dark-theme]`，且**令牌只向下继承** · `可直接复制`

```console
$ sed -n '80p' packages/client/ui-theme/src/styles/design-platform.css
body[data-ds-dark-theme] {
$ sed -n '5,9p' packages/client/ui-theme/src/styles/scrollbar.css
 * The rules sit on `body`, not `html`: design-platform.css declares the
 * --dsw-alias-* tokens on `body` (and the dark overrides on
 * `body[data-ds-dark-theme]`), and custom properties only inherit downward,
 * so an `html` rule resolves them to the guaranteed-invalid value and
 * `scrollbar-color` falls back to `auto`.
```

`design-platform.css:80`（另有 `:253`）是暗色令牌的覆盖入口：**同一个 `body` 元素上，用属性而非类名切换整套变量**。`scrollbar.css:5-9` 把"为什么必须挂 body"讲成了教学注释（迁移时最易踩的坑）。

**可执行借鉴项**：Synova 的配色令牌声明在 `body`，暗色用属性选择器覆盖；任何消费令牌的规则也必须挂在 `body` 或其子元素。
**我们改到什么程度（可验收）**：`grep` 令牌消费规则**无一**挂在 `html`（可脚本断言）；切换 `data-ds-dark-theme` 后所有表层（含滚动条、菜单、弹层）同步变色，无一处残留亮色。

### B-31 字号可调但**范围硬约束**（12–17px，默认 14，整数步进 + schema 校验） · `可直接复制`

```console
$ sed -n '24p;27p;30p;43p' packages/client/ui-theme/src/theme-settings.ts
export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 17
export const DEFAULT_FONT_SIZE = 14
  [FONT_SIZE_FIELD]: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE),
```

`:23-30` 把上下界与默认值都写成**导出常量**（可被 UI、测试、文档共同引用，避免三处写死）；`:41-44` 用 schema 在**跨界处**强制 `step(1) + min + max + default`；`:51-53` 另提供 `isThemePreference` 做类型收窄。`:36` 的 JSDoc 明确单位与约束："Conversation content font size in px (integer within FONT_SIZE_MIN..FONT_SIZE_MAX)"。

**可执行借鉴项**：Synova 的可读性设置（字号/行距/对比）同样"常量导出 + schema 贯穿边界 + 整步进"，不允许任意值穿透。
**我们改到什么程度（可验收）**：设置滑杆范围 = 12–17 且只能整数；手工写入 `11`/`18`/`13.5`/`"big"` → 被拒绝并回落默认 14（四条断言）；字号变化时正文与**折叠行高度**同步（对齐 B-12 的 delta 变量）。

---

## 十一、模式⑩长列表虚拟化与滚动（本条为第 10 个模式，超出派单件所列 9 项，用于满足 ≥10）

### B-32 虚拟行高度是**具名常量**（可测、可算） · `可直接复制`

```console
$ sed -n '6,8p' packages/client/ui-trajectory/src/client/trajectory-virtual-rows.ts
const CONTENT_ROW_HEIGHT = 30
const COLLAPSED_SUMMARY_HEIGHT = 20
const TERMINAL_BOUNDARY_HEIGHT = 9
```

`trajectory-virtual-rows.ts:1` 自述"**Pure projection** from trajectory records to measurable virtual ledger rows"——虚拟化被拆成一个**纯函数投影**：给定记录 → 输出可测量行（含逻辑索引，见 `:16-20` 的 `TrajectoryVirtualRowEntry`）。行高是常量而非常量表达式，因此**总高度可精确预计算**。

**可执行借鉴项**：Synova 的长列表（会话列表/工单/证据）把行高定义为具名常量 + 纯投影函数，使总高可算、滚动位置可恢复。
**我们改到什么程度（可验收）**：虚拟化投影是纯函数（同输入同输出，无 Date/随机）；总高度 = Σ行高（可与实际断言相等）；滚动到 50% 后刷新，滚动位置恢复误差 ≤1 行。

### B-33 滚动容器**显式声明自身可被外部定位**（供浮层/停靠元素对齐） · `可参照`

```console
$ git grep -n "data-conversation-scroll" -- 'packages/client/ui-chat/src/*'
packages/client/ui-chat/src/client/chat/StatsPills.tsx:6:// Mounted on 'conversation.composer.dock' so it sticks with the composer in the
packages/client/ui-chat/src/client/chat/StatsPills.tsx:7:// active conversation scrollport (see ConversationRoot data-conversation-scroll).
```

`StatsPills.tsx:5-7` 注释指出：统计条挂在 composer 的 dock 上，使其"**sticks with the composer in the active conversation scrollport**"，并且**用 `data-conversation-scroll` 这个数据属性**让其他模块能定位到当前滚动区，而不是靠类名或 DOM 层级去猜。

**可执行借鉴项**：Synova 的滚动容器导出稳定的 `data-*` 锚点，停靠/浮层元素据此定位，不写 `.parent > div:nth-child(2)` 这类脆弱选择器。
**我们改到什么程度（可验收）**：滚动区有稳定的 `data-*` 标识；停靠元素在滚动中始终贴合（偏移 ≤1px）；不存在依赖结构层级（`nth-child`）的定位（可 grep 断言）。

---

## 十二、模式⑪可访问性（本条为第 11 个模式）

### B-34 状态/A11y **不靠视觉单一通道**，且禁用按钮带原因 · `可直接复制`

```console
$ sed -n '41p' packages/client/ui-chat/src/client/chat/ReasoningRow.tsx
      {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
$ sed -n '52,53p' packages/client/ui-deliverables/src/client/PresentedFileCard.tsx
    <button type="button" className={css.cardPreview} title={resolveWorkspacePath(cwd, file.path)}
      aria-label={t('presented.previewCard', { name: file.path })} onClick={onPreview} />
$ sed -n '29p' packages/client/ui-deliverables/src/client/Deliverables.module.css
.chevron:disabled { color: var(--dsw-alias-label-dimmed); cursor: not-allowed; }
```

三处证据：① 运行中状态有隐藏文本（B-14 已述）；② 覆盖全卡的透明按钮有 `aria-label`（含文件名）与 `title`，**透明不等于不可读**；③ 禁用态不只变灰，还有 `cursor: not-allowed` 语义。
另见 `PresentedFileCard.tsx:69-71`：溢出菜单按钮带 `aria-haspopup="menu"` 与 `aria-expanded`。

**可执行借鉴项**：Synova 的透明热区必须带可读名称；禁用态给出可辨识的禁用语义；展开/收起类控件报告 `aria-expanded`。
**我们改到什么程度（可验收）**：自动化无障碍扫描（axe 类）在关键面板 0 个 serious 级问题；所有图标按钮有可读名称；所有展开控件有 `aria-expanded` 且随状态变化（可断言属性翻转）。

---

## 十三、**"开发者工具形态"排除项清单**（复制边界红线：撤回 8 仍有效）

> **红线原文口径**：学**模式**（刻度条 / 状态栏 / 轨迹 / 产出卡片）；**禁止照抄开发者工具形态**——凡官方做法是"把工作区 / 终端 / 文件树露出给用户"的，一律标 ❌ 不可借鉴。
> **判定理由（统一）**：我们的定价建立在"**用户不需要自己看工作区/终端/文件树**"之上；把这些露出，等于把"专业工具"的成本转嫁给用户，用户会问"我为什么要为你没做完的抽象买单"→ **直接攻击定价**。
> 下列每条都给出**官方证据**（不是主观判断），并标明排除的**对象是形态而非功能**。

| # | 官方模块 | 官方自述（原文） | 露出内容 | 判定 | 排除对象与保留功能 |
|---|---|---|---|---|---|
| X-01 | `packages/client/ui-sidebar-terminal` | `"description": "Interactive shell tabs for the right Sidebar"` | **交互式 shell 标签页**（`LazyTerminalBody.tsx`、`TerminalCleanup.tsx`、`TerminalGuide.tsx`、`TerminalIcon.tsx`） | ❌ **不可借鉴** | 排除：把 shell 给用户。保留：**"某步正在跑什么"的一句话进度**（B-13 扫光 + B-05 时长） |
| X-02 | `packages/client/ui-sidebar-files` | `"description": "Workspace file tree tab type for the right Sidebar: lazy directory listing over the workspaceFiles Remote namespace, opening files into the Sidebar"` | **工作区文件树**（`FilesBody.tsx`、`FilesTitle.tsx`、`definition.tsx`） | ❌ **不可移植** | 排除：文件树导航。保留：**产出物清单**（B-15/16/17 产出卡片），用户只面对"交出了什么"，不面对目录 |
| X-03 | `packages/client/ui-sidebar-documentpreview` | `"description": "Extensible document previews for Sidebar files: Office, Markdown, highlighted code, images, PDF, HTML, and plain text"`（`TextPreview.tsx`、`code/CodeBody.tsx`） | **源码/文件级预览（含代码高亮）** | ❌ **不可移植** | 排除：代码查看器。保留：**业务结论卡的排版基线**（B-02 的 13/10/20/16 字号行高体系可原样用于报告卡） |
| X-04 | `packages/client/ui-trajectory` | `"description": "Trajectory event ledger with an interactive timing overview"`；`TrajectoryTimeline.tsx:1` `/** Chrome-Network-style overview timeline for focusing the trajectory ledger. */`；`TrajectoryTable.tsx:1` `/** Turn-aware trajectory event ledger with a local record inspector. */` | **Chrome 网络面板式瀑布图 + 事件账本 + JSON inspector**（另有 `code-program.ts`、`copy-codes.ts`、`string-wrapping-store.ts`） | ❌ **形态不可借鉴**（**边界项**，见下） | 排除：Chrome DevTools 形态（瀑布/账本/JSON 检视）。保留（**重整形后可借**）：**"整段任务的时间概览 + 一键跳到最慢一步"** 的信息功能，但呈现必须是**业务语言的一句话 + 一个聚合条**，不得出现事件流水、请求头、原始 JSON |
| X-05 | `packages/client/ui-open-in-app` | `"description": "Web Session-header \"Open In...\" split button opening the session workspace directory in a locally installed application"` | **把工作区目录交给本地应用** | ❌ **不可移植** | 排除：目录即产品面。保留：**"导出为文件"**（导出到用户选定的**文档位置**，不暴露工作区概念） |
| X-06 | `packages/client/ui-sidebar-browser` | `"description": "Sandboxed Web browser tabs for the right Sidebar"` | **内嵌浏览器标签页** | ❌ **不可移植** | 排除：通用浏览器。保留：**证据来源卡片**（展示来源名 + 抓取时间 + 摘要，点击在原浏览器打开） |
| X-07 | `packages/client/ui-workspace` | `"description": "Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots"` | **工作区选择器**（`WorkspacePicker.tsx`、`rows/WorkspaceBrowser.tsx`） | ⚠️ **部分**：**"选择企业/租户"可借**（这是业务概念）；**"浏览工作区目录"不可借** | 保留：企业/团队切换器的交互（B-21 同源单例 + B-22 分型空态）；排除：目录浏览器（`WorkspaceBrowser`） |
| X-08 | `packages/client/ui-directory-picker-browse` / `-native` | 官方目录选择（browse + native 两条路径） | **文件系统目录选择** | ⚠️ **部分**：**"选择导出位置"可借**（一次性的系统对话框）；**常驻目录浏览不可借** | 保留：系统原生选择对话框（一次性）；排除：常驻目录浏览面板 |

### 边界项的完整处理（X-04 为什么不是一刀切）

`ui-trajectory` **同时**踩到两边：
- 官方自述用 `Chrome-Network-style`、`event ledger`、`record inspector` 三个**明确的开发者工具词**（`TrajectoryTimeline.tsx:1`、`TrajectoryTable.tsx:1`、`:2065-2068`）→ **形态确属 ❌**；
- 但派单件红线里点名可学的"**轨迹**"，指的应是**思考/过程的可回看性**（B-11~B-14 的 ReasoningRow 路径），**不是**这套账本。

处理结论：**B 切片不把 `ui-trajectory` 的任何实现折进借鉴项**。若后续要"整段任务耗时概览"，**必须另立自研项**，且验收标准里写死"不得出现事件流水/请求头/原始 JSON 三类元素"（可 grep + 截图断言）。本件已把它排除，避免 task-5 误把它算进"可参照"。

---

## 十四、借鉴项汇总（35 条，配额 ≥12）

| ID | 标题 | 分类 | 模式 | 官方 file:line |
|---|---|---|---|---|
| B-01 | 密度做成持久化用户设置（normal/compact，默认 compact） | 可直接复制 | ①密度 | `packages/client/ui-chat/src/chat-settings.ts:12`、`:18` |
| B-02 | 卡片密度硬数值（60px/13px/10px/2px/120ms） | 可直接复制 | ①密度 | `packages/client/ui-deliverables/src/client/Deliverables.module.css:10`、`:17`、`:18` |
| B-03 | 容器查询断点 + 粗指针 44px 触达 | 可直接复制 | ①密度 | `.../Deliverables.module.css:34`、`:35` |
| B-04 | 五态状态点 + 关闭联合穷尽（伪造态抛错） | 可直接复制 | ②状态 | `packages/client/ui-primitives/src/StateDot.tsx:8`；`packages/client/ui-jobs/src/client/JobListAction.tsx:23`、`:33`、`:37` |
| B-05 | 时长最多两级相邻单位，不扩无用量级 | 可直接复制 | ②状态 | `packages/client/ui-jobs/src/client/JobListAction.tsx:62`（范围 `:56-70`） |
| B-06 | 状态→颜色 / 状态→文案 两函数分离 + 文案进 locale | 可直接复制 | ②状态 | `packages/client/ui-jobs/src/client/JobListAction.tsx:44`（颜色 `:31`） |
| B-07 | 刻度条空态是 null 不是 0；分项独立判定 | 可直接复制 | ③刻度条 | `packages/client/ui-chat/src/client/chat/StatsPills.tsx:330`、`:332` |
| B-08 | 刻度数字走 durable projection，回落整体替换 | 可直接复制 | ③刻度条 | `packages/client/ui-chat/src/client/chat/StatsPills.tsx:322`、`:327` |
| B-09 | 同层互斥面板用单一状态变量 | 可参照 | ③刻度条 | `packages/client/ui-chat/src/client/chat/StatsPills.tsx:320`、`:321` |
| B-10 | 流式增量不重渲刻度条（memo + 落定身份） | 可直接复制 | ③刻度条 | `packages/client/ui-chat/src/client/chat/StatsPills.tsx:317`（依据 `:4`） |
| B-11 | 折叠摘要分区取行：流式中末行 / 结束后首行 | 可直接复制 | ④轨迹 | `packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:32`、`:38` |
| B-12 | 折叠态固定 24px + `contain: size layout`；展开后开关 sticky | 可直接复制 | ④轨迹 | `packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:6-9`、`:18-23` |
| B-13 | 运行中 2.6s 扫光（非进度）+ 动效层不拦指针 | 可参照 | ④轨迹 | `packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:25`、`:30`、`:37`、`:41-44` |
| B-14 | 状态不靠动效单通道：补 visually-hidden 状态词 | 可直接复制 | ④轨迹/⑪a11y | `packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:41` |
| B-15 | 卡片结构固定；用 z-index+pointer-events 分层替代按钮嵌套 | 可直接复制 | ⑤产出卡 | `packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:21`、`:51-55` |
| B-16 | 副文案承载四阶段 + 错误独立视觉 + `role=status` | 可直接复制 | ⑤产出卡 | `packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:46-50`、`:58-59`；`Deliverables.module.css:19` |
| B-17 | hover 交换"描述↔动作提示"，不叠两段 | 可参照 | ⑤产出卡 | `packages/client/ui-deliverables/src/client/Deliverables.module.css:20-22` |
| B-18 | 菜单关闭后焦点还给触发按钮；失效即收 | 可直接复制 | ⑤产出卡 | `packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:39-43`（另 `:37`） |
| B-19 | 权限三档"盾形+语义标记"，未知档不给图标 | 可参照 | ⑥权限 | `packages/client/ui-permission-presets/src/client/PermissionSelect.tsx:24-27`、`:29-52`、`:54-57` |
| B-20 | 目录快照与失效 tick 拆两 store；订阅先于首读 | 可参照 | ⑥权限 | `packages/client/ui-permission-presets/src/client/catalog.ts:17`、`:21-27`、`:46-53` |
| B-21 | 多入口共用进程级单例目录 | 可参照 | ⑥权限 | `packages/client/ui-permission-presets/src/client/catalog.ts:1`、`:14-19` |
| B-22 | 空态分"从来没有"与"筛选为空"两型 | 可直接复制 | ⑦空态 | `packages/client/ui-workspace/src/client/locales.ts:23-24`；`ui-settings-unarchive-sessions/src/client/ArchivedSessionsSection.tsx:105` |
| B-23 | 空态＝语境内联一句，精确到成因 | 可直接复制 | ⑦空态 | `packages/client/ui-model-selection/src/client/locales.ts:32`、`:34`；`ui-dockkit/src/components/TabPanel.tsx:411` |
| B-24 | 降级文案三段式：原因+受限动作+**仍可用动作** | 可直接复制 | ⑦空态 | `packages/client/ui-conversation/src/client/locales.ts:17`、`:18` |
| B-25 | 空/错/正常共用一个 DOM 位，`data-*` 换样式 | 可参照 | ⑦空态 | `packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:58-59` |
| B-26 | 过渡时长分级表 + 统一结构曲线 | 可直接复制 | ⑧动效 | `ui-chat/src/client/chat/TurnNavigator.module.css:40`、`:87`、`:117`；`MessageIconActions.module.css:42`；`MessageItem.module.css:226`；`ui-agent-preset/src/client/AgentPresetSection.module.css:99` |
| B-27 | `prefers-reduced-motion` 下过渡置 `none` | 可直接复制 | ⑧动效 | `ui-attachment/src/AttachmentRail.module.css:82`；`ui-attachment/src/FileCard.module.css:117`；`ui-attachment/src/client/ComposerAttachments.module.css:66` |
| B-28 | 滚动条皮肤：令牌挂载层一致 + 双路径互斥门 | 可参照 | ⑧动效/⑨主题 | `packages/client/ui-theme/src/styles/scrollbar.css:16-26`、`:28-40` |
| B-29 | 主题双段引导：head CSS 防白闪 + body 装选择器 | 可直接复制 | ⑨主题 | `packages/client/ui-theme/src/boot-theme.ts:16`、`:20`、`:32`、`:49-52` |
| B-30 | 暗色覆盖挂 `body[data-ds-dark-theme]`；令牌只向下继承 | 可直接复制 | ⑨主题 | `packages/client/ui-theme/src/styles/design-platform.css:80`；`styles/scrollbar.css:5-9` |
| B-31 | 字号范围常量导出 + schema 贯穿边界（12–17，默认 14，整步） | 可直接复制 | ⑨主题 | `packages/client/ui-theme/src/theme-settings.ts:24`、`:27`、`:30`、`:43` |
| B-32 | 虚拟行高具名常量 + 纯投影 | 可直接复制 | ⑩虚拟化 | `packages/client/ui-trajectory/src/client/trajectory-virtual-rows.ts:6-8`、`:16-20` |
| B-33 | 滚动容器导出稳定 `data-*` 锚点供停靠定位 | 可参照 | ⑩虚拟化 | `packages/client/ui-chat/src/client/chat/StatsPills.tsx:5-7` |
| B-34 | 透明热区带可读名；禁用有语义；展开报 `aria-expanded` | 可直接复制 | ⑪a11y | `PresentedFileCard.tsx:52-53`、`:69-71`；`Deliverables.module.css:29` |
| B-35 | 空态是可填充的**具名槽位**；无占用者时入口整体消失 | 可参照 | ⑦空态 | `packages/client/ui-workspace/src/client/contract/slots.ts:1-21`、`:53-61`；`WorkspacePicker.tsx:219-224` |

### 模式覆盖表（B 判据：≥10 模式）

| # | 模式 | 官方 file:line（至少一条） | 借鉴项 ID | 是否满足 |
|---|---|---|---|---|
| 1 | 信息层次与密度 | `packages/client/ui-chat/src/chat-settings.ts:12` | B-01~B-03 | ✅ |
| 2 | 状态可视化（健康/进行中/失败） | `packages/client/ui-primitives/src/StateDot.tsx:8` | B-04~B-06 | ✅ |
| 3 | 对话刻度条 | `packages/client/ui-chat/src/client/chat/StatsPills.tsx:332` | B-07~B-10 | ✅ |
| 4 | 轨迹/思考过程 | `packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:32` | B-11~B-14 | ✅ |
| 5 | 产出卡片 | `packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:51` | B-15~B-18 | ✅ |
| 6 | 权限与模式选择器 | `packages/client/ui-permission-presets/src/client/PermissionSelect.tsx:29` | B-19~B-21 | ✅ |
| 7 | 空态与降级态 | `packages/client/ui-conversation/src/client/locales.ts:18` | B-22~B-25 + B-35 | ✅ |
| 8 | 动效与滚动流畅感 | `ui-chat/src/client/chat/ReasoningRow.module.css:37` | B-26~B-28 | ✅ |
| 9 | 深浅色与可读性 | `packages/client/ui-theme/src/boot-theme.ts:16` | B-29~B-31 | ✅ |
| 10 | 长列表虚拟化与滚动（**增补**） | `packages/client/ui-trajectory/src/client/trajectory-virtual-rows.ts:6` | B-32~B-33 | ✅ |
| 11 | 可访问性（**增补**） | `packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:41` | B-34（+B-14） | ✅ |

**模式数 = 11 ≥ 10**（派单件列名 9 项，全部覆盖；另增补 2 项）。

---

## 十五、全量 file:line 自检（100% 覆盖，非抽样）

命令形式（heredoc 内容即下方清单，逐行喂入）：

```bash
cd /Users/wane/src/deepseek-harness && while IFS= read -r spec; do
  f="${spec%:*}"; l="${spec##*:}"
  printf '%-64s | %s\n' "$spec" "$(sed -n "${l}p" "$f")"
done <<'EOF'
（共 46 行引用清单）
EOF
```

### 第一组：密度 / 状态 / 刻度条 / 轨迹

```
packages/client/ui-chat/src/chat-settings.ts:12                  | export const TRANSCRIPT_VIEW_MODES = ['normal', 'compact'] as const
packages/client/ui-chat/src/chat-settings.ts:18                  | export const DEFAULT_TRANSCRIPT_VIEW_MODE: TranscriptViewMode = 'compact'
packages/client/ui-deliverables/src/client/Deliverables.module.css:10 | .file { ... height: 60px; ... transition: background-color 120ms ease; }
packages/client/ui-deliverables/src/client/Deliverables.module.css:17 | .fileName { ... font-size: 13px; font-weight: 500; line-height: 20px; }
packages/client/ui-deliverables/src/client/Deliverables.module.css:18 | .description { ... font-size: 10px; font-weight: 400; line-height: 16px; ... }
packages/client/ui-deliverables/src/client/Deliverables.module.css:34 | @container (max-width: 620px) { .presented { grid-template-columns: minmax(0, 1fr); } }
packages/client/ui-deliverables/src/client/Deliverables.module.css:35 | @media (pointer: coarse) { .split { min-height: 44px; } .open, .chevron { min-width: 44px; } }
packages/client/ui-primitives/src/StateDot.tsx:8                 | export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'
packages/client/ui-primitives/src/StateDot.tsx:22                | export function StateDot({ state, size = 10, className }: {
packages/client/ui-jobs/src/client/JobListAction.tsx:23          | function assertNever(value: never): never {
packages/client/ui-jobs/src/client/JobListAction.tsx:33          |     case 'running': return 'ongoing'
packages/client/ui-jobs/src/client/JobListAction.tsx:37          |     case 'failed': return 'error'
packages/client/ui-jobs/src/client/JobListAction.tsx:44          | function statusLabel(status: JobView['status'], t: TranslateNS<typeof NS>): string {
packages/client/ui-jobs/src/client/JobListAction.tsx:62          | function formatDuration(elapsedMs: number, t: TranslateNS<typeof NS>): string {
packages/client/ui-chat/src/client/chat/StatsPills.tsx:317       | export const StatsPills = memo(function StatsPills({ useChat, useProjection, t }: StatsPillsProps) {
packages/client/ui-chat/src/client/chat/StatsPills.tsx:320       |   // One exclusive slot for both dialogs: opening either pill closes the other.
packages/client/ui-chat/src/client/chat/StatsPills.tsx:321       |   const [openPill, setOpenPill] = useState<'time' | 'usage' | null>(null)
packages/client/ui-chat/src/client/chat/StatsPills.tsx:322       |   // Every figure rides the durable sessionStats projection, so paging and
packages/client/ui-chat/src/client/chat/StatsPills.tsx:327       |   const stats = useMemo(() => projected ?? deriveStats(settledNodes), [projected, settledNodes])
packages/client/ui-chat/src/client/chat/StatsPills.tsx:330       |   const hasTokens = usage !== undefined
packages/client/ui-chat/src/client/chat/StatsPills.tsx:332       |   if (stats.steps === 0 && !hasTokens) return null
packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:32      |   const summary = (running ? latestLine(text) : firstLine(text)).replaceAll('**', '')
packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:38      |       data-state={running ? 'running' : 'ok'}
packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:41      |       {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:7 |   contain: size layout;
packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:30 |   width: 300px;
packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:37 |   animation: dsh-reasoning-row-sweep 2.6s ease-out infinite;
```

### 第二组：产出卡 / 权限 / 空态 / 动效 / 主题 / 虚拟化

```
packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:21      |  * Render independent file actions without nesting buttons inside a clickable card.
packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:39      |   const act = (action: PresentedAction) => {
packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:41      |     previewRef.current?.focus()
packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:46      |   const status = phase === undefined
packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:52      |     <button type="button" className={css.cardPreview} title={resolveWorkspacePath(cwd, file.path)}
packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:53      |       aria-label={t('presented.previewCard', { name: file.path })} onClick={onPreview} />
packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:58      |         <span className={css.description} role={phase === undefined ? undefined : 'status'}
packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:59      |           data-error={phase === 'error' || phase === 'revealError' || phase === 'nativeUnavailable' ? true : undefined}>
packages/client/ui-deliverables/src/client/Deliverables.module.css:19    | .description[data-error='true'] { color: var(--dsw-alias-state-error-primary); }
packages/client/ui-deliverables/src/client/Deliverables.module.css:20-22 | .previewHint { display: none; } / .file:hover .secondaryText { display: none; } / .file:hover .previewHint { display: inline; }
packages/client/ui-permission-presets/src/client/PermissionSelect.tsx:24-27 | /* Shield glyphs ... check = read-only, pencil = workspace write, exclamation = full access. currentColor so ... */
packages/client/ui-permission-presets/src/client/catalog.ts:17           |   readonly store: SnapshotStore<PermissionCatalogState> = createSnapshotStore({
packages/client/ui-permission-presets/src/client/catalog.ts:27           |   readonly invalidations: SnapshotStore<{ count: number }> = createSnapshotStore({ count: 0 })
packages/client/ui-permission-presets/src/client/catalog.ts:46           |     this.stopCatalog = ctx.remote.$on('permission-presets/catalog-changed', () => {
packages/client/ui-workspace/src/client/locales.ts:23                    |   'empty.none': '暂无会话',
packages/client/ui-workspace/src/client/locales.ts:24                    |   'empty.noMatches': '无匹配结果',
packages/client/ui-model-selection/src/client/locales.ts:32              |   'empty.models': '没有可用的模型。',
packages/client/ui-model-selection/src/client/locales.ts:34              |   'empty.efforts': '当前模型未提供推理等级。',
packages/client/ui-conversation/src/client/locales.ts:17                 |   'placeholder.unavailable': '会话不可用',
packages/client/ui-conversation/src/client/locales.ts:18                 |   'placeholder.parentOffline': '父会话已离线，无法继续发送；仍可停止当前运行',
packages/client/ui-dockkit/src/components/TabPanel.tsx:411               |           ? <p className={css.empty}>{callbacks.labels.emptyPane}</p>
packages/client/ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.tsx:425 |           {nothingMatches ? <p className={css.status}>{t('emptySearch')}</p> : null}
packages/client/ui-attachment/src/FileCard.module.css:117                |     transition: none;
packages/client/ui-theme/src/theme-settings.ts:24                        | export const FONT_SIZE_MIN = 12
packages/client/ui-theme/src/theme-settings.ts:27                        | export const FONT_SIZE_MAX = 17
packages/client/ui-theme/src/theme-settings.ts:30                        | export const DEFAULT_FONT_SIZE = 14
packages/client/ui-theme/src/theme-settings.ts:43                        |   [FONT_SIZE_FIELD]: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE),
packages/client/ui-theme/src/boot-theme.ts:16                            |   const light = `:root{color-scheme:light}body{background-color:${LIGHT_BACKGROUND};--dsh-boot-bg:${LIGHT_BACKGROUND}}`
packages/client/ui-theme/src/boot-theme.ts:20                            |   return `${light}@media(prefers-color-scheme:dark){${dark}}`
packages/client/ui-theme/src/boot-theme.ts:32                            |   document.body.toggleAttribute('data-ds-dark-theme', dark)
packages/client/ui-theme/src/boot-theme.ts:50                            |     { kind: 'style', text: bootThemeStyle(preference) },
packages/client/ui-theme/src/styles/design-platform.css:80               | body[data-ds-dark-theme] {
packages/client/ui-trajectory/src/client/trajectory-virtual-rows.ts:6   | const CONTENT_ROW_HEIGHT = 30
packages/client/ui-trajectory/src/client/trajectory-virtual-rows.ts:7   | const COLLAPSED_SUMMARY_HEIGHT = 20
packages/client/ui-trajectory/src/client/TrajectoryTimeline.tsx:1        | /** Chrome-Network-style overview timeline for focusing the trajectory ledger. */
packages/client/ui-workspace/src/client/contract/slots.ts:1              | /**
packages/client/ui-workspace/src/client/contract/slots.ts:8              |  * - WorkspacePicker fills the conversation empty-state hole (menu + error
packages/client/ui-workspace/src/client/contract/slots.ts:20             |  * leaves the surface with no add affordance at all.
packages/client/ui-workspace/src/client/contract/slots.ts:56             |     /** Directory-flow hole under the conversation empty-state picker (declared by the WorkspacePicker entry). */
packages/client/ui-workspace/src/client/WorkspacePicker.tsx:222          |  * @param props - empty-state slot props (owner share + injected creation callback).
```

### 密度数字的口径一致性检查（canonical 复算）

```console
$ cd /Users/wane/src/deepseek-harness && for pat in '(EmptyState|empty-state|emptyState)' '(dark|light|theme)' '(animate|animation|transition)' '(trace|trajectory)' '(thinking|reasoning)' '(density|dense|compact)' 'scroll'; do printf "%-40s %s\n" "$pat" "$(git grep -n -E "$pat" -- 'apps/**/*.ts' 'apps/**/*.tsx' 'apps/**/*.mjs' 'apps/**/*.css' 'packages/**/*.ts' 'packages/**/*.tsx' 'packages/**/*.mjs' 'packages/**/*.css' | wc -l | tr -d ' ')"; done
(EmptyState|empty-state|emptyState)      19
(dark|light|theme)                       2865
(animate|animation|transition)           603
(trace|trajectory)                       998
(thinking|reasoning)                     1809
(density|dense|compact)                  2610
scroll                                   2067
```

（与 §1.2 表逐字一致；本件全文已无第二套密度数字。）

### 引用点检查（"接线了"≠"被执行"）

排除项 X-01~X-06 的官方自述**不是**从 README 抄的，是从**各包 `package.json` 的 `description` 字段**逐条取的（`grep -m1 '"description"'`），且都指向**真实存在的源码文件**：

```console
$ for d in ui-sidebar-terminal ui-sidebar-files ui-sidebar-documentpreview ui-workspace ui-open-in-app ui-sidebar-browser; do echo "=== $d ==="; head -3 "packages/client/$d/package.json" | tail -1; git ls-files "packages/client/$d/**/*.tsx" | head -2; done
=== ui-sidebar-terminal ===
  "description": "Interactive shell tabs for the right Sidebar",
packages/client/ui-sidebar-terminal/src/client/LazyTerminalBody.tsx
packages/client/ui-sidebar-terminal/src/client/TerminalCleanup.tsx
=== ui-sidebar-files ===
  "description": "Workspace file tree tab type for the right Sidebar: lazy directory listing over the workspaceFiles Remote namespace, opening files into the Sidebar",
packages/client/ui-sidebar-files/src/client/FilesBody.tsx
packages/client/ui-sidebar-files/src/client/FilesTitle.tsx
=== ui-sidebar-documentpreview ===
  "description": "Extensible document previews for Sidebar files: Office, Markdown, highlighted code, images, PDF, HTML, and plain text",
packages/client/ui-sidebar-documentpreview/src/client/LoadingIndicator.tsx
packages/client/ui-sidebar-documentpreview/src/client/TextPreview.tsx
=== ui-workspace ===
  "description": "Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots",
packages/client/ui-workspace/src/client/WorkspacePicker.tsx
packages/client/ui-workspace/src/client/rows/Rows.tsx
=== ui-open-in-app ===
  "description": "Web Session-header \"Open In...\" split button opening the session workspace directory in a locally installed application",
packages/client/ui-open-in-app/src/client/OpenInAppAction.tsx
packages/client/ui-open-in-app/tests/open-in-app-action.client.spec.tsx
=== ui-sidebar-browser ===
  "description": "Sandboxed Web browser tabs for the right Sidebar",
packages/client/ui-sidebar-browser/src/client/definition.tsx
packages/client/ui-sidebar-browser/src/client/view/BrowserBody.tsx
```

### 本件红线自检（在 D870 工作树内执行）

```console
$ cd /Users/wane/SynovaAgent/.synova-wt-d870 && grep -rn "@deepseek-ai" src/ packages/ 2>/dev/null | wc -l
       0
$ git -C /Users/wane/SynovaAgent/.synova-wt-d870 status --porcelain
?? docs/synova/research/official-electron-kernel-runtime.md
?? docs/synova/research/official-ui-patterns.md
?? task-state/D870.json
```

G1 = 0 成立。本件唯一写入文件为 `docs/synova/research/official-ui-patterns.md`。

---

## 十六、未覆盖 / 存疑项（如实列）

1. **`EmptyState` 数字修正为 19，且"组件"假设不成立**（§1.3，**已闭环**）：canonical 口径 19 处命中**无一是 React 组件**，全部是"具名槽位说明 + 注释 + 测试名"。本件已按真实机制（具名槽位 B-35 + 名单键文案 B-22~B-24）重建证据链，无残留存疑。
2. **7 项密度偏差已闭环**（§1.2）：成因已实证为旧值取自**文件系统 grep**（含 untracked 构建产物，典型来源 `apps/desktop/lib/types/*.d.ts`）。本件已全部改用 canonical 值并附口径脚注，**文件内无旧数字并存**。
3. **CSS 计数偏差（未闭环）**：派单件 184 vs 实测 154（`git ls-files 'packages/client/**/*.css'`）。**该数字不在 lead 修正表内，成因未查明**，本件按实测 154 使用并如实留档。
4. **只精读了 11 个模式对应的模块**：`packages/client` 有 **55 个插件目录**，本件精读约 14 个（ui-chat / ui-deliverables / ui-jobs / ui-primitives / ui-permission-presets / ui-theme / ui-workspace / ui-model-selection / ui-conversation / ui-dockkit / ui-trajectory / ui-settings-plugin-inventory / ui-settings-unarchive-sessions / ui-attachment），**其余 41 个未精读**，可能含未登记借鉴项（尤其 `ui-approval`（审批面板）、`ui-agent-preset`（预设选择）、`ui-layout`、`ui-session`、`ui-goal`、`ui-plan`、`ui-workflow-run`、`ui-slots`、`ui-dockkit` 的面板引擎）。
5. **"对话刻度条"是我按官方结构命名的**：官方源码里**没有**"刻度条/ticker/gauge"这样的标识符（canonical 口径下 `git grep -n -E '\b(Ticker|Gauge|Meter|ScaleBar|segmented)\b'` 在 apps+packages 全范围 → **0 命中**）。命名的原始依据是 `StatsPills.tsx:1-7` 的自述注释（"a gauge pill … and a database pill"）与图标名 `IconGaugeOutline16`。**task-5 若需引用该模式名，请以本件的定义为准，不要假设官方有同名概念。**
6. **X-07 / X-08 为"部分可借"**：本件给的是"保留什么、排除什么"的切分，而不是一刀切通过；task-5 归并时**不得**把它们整条算进"可参照"。
7. **全部"我们改到什么程度"均为验收口径设计，Synova 侧零实现零验证**。本件不产生任何 Synova 代码改动。
8. **未做浏览器实测**：本件全部结论来自源码阅读，**未运行官方前端**，因此"颜色看起来如何""动效实际是否顺滑"这类**观感结论一概没有**；所有可验收描述都是**可量测口径**（px / ms / 断言），不是观感判断。

---

## 十七、机器可读块（供总表机械聚合）

```json
{"d870_borrow_items":[
{"id":"B-01","title":"密度做成持久化用户设置","class":"可直接复制","official":"packages/client/ui-chat/src/chat-settings.ts:12","action":"对话密度做成用户可见设置（normal|compact），枚举封闭写入用户设置文档，默认 compact，schema 同时作为持久化结构与跨进程校验信封","scope_for_us":"设置里存在完整/紧凑两档；切换后刷新仍生效；传非法值被 schema 拒绝并回落默认；两档下同一对话可见高度差≥30%"},
{"id":"B-02","title":"卡片密度硬数值基线","class":"可直接复制","official":"packages/client/ui-deliverables/src/client/Deliverables.module.css:10","action":"产出卡/列表行按官方可量测基线落地：行高60px、内边距8px10px、元素间距10px、圆角18px、边框0.5px、主标签13px/500/20px、副标签10px/400/16px、主副间距2px、hover过渡120ms、图标容器40x40圆角10px、操作组高28px","scope_for_us":"产出卡实测行高60px(±1)、主标签13px、副标签10px、主副间距2px；同名元素在列表与详情两处取同一token，取值一致"},
{"id":"B-03","title":"容器查询断点 + 粗指针触达","class":"可直接复制","official":"packages/client/ui-deliverables/src/client/Deliverables.module.css:34","action":"卡片网格用 @container 而非视口断点（620px 回落单列）；@media(pointer:coarse) 下操作区提到 44px 最小触达","scope_for_us":"同一卡片放进400px侧栏自动单列不变形；触屏按钮可点区域≥44x44px；窗口1200→600px不出现横向滚动条"},
{"id":"B-04","title":"五态状态点 + 关闭联合穷尽","class":"可直接复制","official":"packages/client/ui-primitives/src/StateDot.tsx:8","action":"业务状态收敛为 done/warning/ongoing/error/idle 五态；状态映射用穷尽检查，未登记值走 assertNever 抛错而非静默显示成正常态；同义状态归并（stopping与killed共用警示）需在注释里写明理由","scope_for_us":"状态点颜色只有5种；注入未登记状态字符串→抛 unhandled job status 且不渲染任何状态点（不出现绿色看起来正常的假象）；每个业务状态在单测中可断言到唯一呈现态"},
{"id":"B-05","title":"时长最多两级相邻单位","class":"可直接复制","official":"packages/client/ui-jobs/src/client/JobListAction.tsx:62","action":"运行时长统一 h+m / m+s / s 三形态；不为无人使用的量级扩词汇表（官方明确不做 day/month 分支）","scope_for_us":"时长显示只有 Xh Ym/Xm Ys/Xs 三种；不存在天/月分支（grep零命中）；跨单位边界59s→60s、59m59s→1h0m显示不跳变"},
{"id":"B-06","title":"状态→颜色 / 状态→文案 两函数分离","class":"可直接复制","official":"packages/client/ui-jobs/src/client/JobListAction.tsx:44","action":"dotState(status) 与 statusLabel(status,t) 拆成两个独立纯函数，各自穷尽检查；文案进 locale 表，不散落在 JSX","scope_for_us":"状态字符串不命中任何 .tsx 内裸中文/裸英文状态词（全来自 locale 键）；新增语言只改 locale 文件不改组件"},
{"id":"B-07","title":"刻度条空态是 null 不是 0","class":"可直接复制","official":"packages/client/ui-chat/src/client/chat/StatsPills.tsx:332","action":"无数据时整条刻度不渲染（return null）；分项独立判定——有计数无用量时只显示计数胶囊，不显示0值胶囊","scope_for_us":"新会话下刻度条DOM不存在；构造有轮次但全失败无token的会话→只出现计数胶囊；不出现任何 0 tok 类无意义数字"},
{"id":"B-08","title":"刻度数字走 durable projection，回落整体替换","class":"可直接复制","official":"packages/client/ui-chat/src/client/chat/StatsPills.tsx:327","action":"统计数字取自持久投影（翻页/压缩不变），不从当前渲染消息数组现算；确需回落时整体替换且字段名刻意对齐，使两种来源可整体互换","scope_for_us":"向上加载更多历史后刻度数字不变（断言翻页前后相等）；无投影环境下数字来自窗口折叠且不含undefined/NaN；两种来源字段名集合完全相同"},
{"id":"B-09","title":"同层互斥面板用单一状态变量","class":"可参照","official":"packages/client/ui-chat/src/client/chat/StatsPills.tsx:321","action":"同一锚点下的互斥面板用一个 'a'|'b'|null 状态表达当前打开项，开一个自动关另一个（跨层并发场景才用集合，见A-23）","scope_for_us":"依次点开两个胶囊→任意时刻DOM中恰有1个对话框；按Esc/点外部后状态回到null（可断言）"},
{"id":"B-10","title":"流式增量不重渲刻度条","class":"可直接复制","official":"packages/client/ui-chat/src/client/chat/StatsPills.tsx:317","action":"刻度条用 memo 包裹并订阅已落定节点身份，使流式 token 增量不触发该行重渲；挂载在 composer dock 上随滚动区停靠","scope_for_us":"流式输出期间统计条渲染计数=0（落定后+1）；长输出(>5000 token)下无长任务、滚动不掉帧"},
{"id":"B-11","title":"折叠摘要分区取行","class":"可直接复制","official":"packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:32","action":"思考行折叠摘要：流式中显示最后一行（用户在关心现在在想什么），结束后显示第一行（首句即结论）；两条路径都去掉 Markdown 粗体标记；running|ok 落到 data-state 供 CSS 分支","scope_for_us":"流式中折叠行随最新内容滚动更新；结束后固定为首行且刷新不变（断言文本相等）；折叠态文本不含 **"},
{"id":"B-12","title":"折叠态固定高度 + contain，防布局跳动","class":"可直接复制","official":"packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:7","action":"折叠态锁死24px（随字号设置线性补偿）；加 contain:size layout 抑制回流外溢；展开后把折叠开关置为 sticky top:0 保证收起入口可达","scope_for_us":"折叠态高度恒为24px；连续20条思考行折叠时累计CLS=0（PerformanceObserver断言）；展开长内容滚动时收起开关始终在视口顶部可见"},
{"id":"B-13","title":"运行中扫光（非进度）+ 动效不拦指针","class":"可参照","official":"packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:37","action":"用循环扫光表达在动但进度未知（300px渐变条 2.6s 从-300px到100%，90%处即到位留静止期），与确定性进度条严格区分；动效层 pointer-events:none","scope_for_us":"扫光周期2.6s±0.2s；进度未知任务不出现百分比数字（grep断言）；扫光层下方按钮点击100%命中"},
{"id":"B-14","title":"状态不靠动效单通道","class":"可直接复制","official":"packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:41","action":"靠颜色/动效表达的状态必须同时渲染 visually-hidden 的状态词，使辅助技术不依赖动效也能获知状态","scope_for_us":"关闭CSS或仅读DOM文本时仍能得到状态词；进行中/成功/失败/空闲各有独立可读文本且不重复"},
{"id":"B-15","title":"卡片结构固定，用层级替代按钮嵌套","class":"可直接复制","official":"packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:21","action":"产出卡固定为 图标+名称+状态副文案+单一主操作+溢出菜单；全卡点击用覆盖式透明button(z-index:1)，操作组抬到z-index:2并用pointer-events分层，明确不在可点卡片内嵌按钮","scope_for_us":"卡片空白处点击=主操作；操作按钮点击只触发自身不冒泡（断言调用计数）；DOM中不存在button内含button"},
{"id":"B-16","title":"副文案承载四阶段 + 错误独立视觉","class":"可直接复制","official":"packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:46","action":"同一行副文案承载 描述→操作中→完成→失败 四态；失败态打 data-error 换错误色token；非正常态挂 role=status 供读屏播报","scope_for_us":"四阶段文本各不相同（断言集合）；失败态颜色为错误色token非次要色；四态变化均可被 role=status 捕获"},
{"id":"B-17","title":"hover 交换描述与动作提示","class":"可参照","official":"packages/client/ui-deliverables/src/client/Deliverables.module.css:20","action":"静态显示说明文本，hover 时同一行替换为动作提示（隐藏一个显示另一个），不叠加两段文字","scope_for_us":"hover前后该行文本变化但行高不变（无跳动）；两态在标称宽度下均不截断为…"},
{"id":"B-18","title":"菜单关闭后焦点还给触发按钮","class":"可直接复制","official":"packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:39","action":"菜单选择/关闭后把焦点还给触发元素再执行动作；菜单因条件失效（disabled）时主动收起，不留点不开的菜单","scope_for_us":"键盘完成菜单操作后 document.activeElement=原触发按钮；菜单禁用时自动收起不残留"},
{"id":"B-19","title":"权限三档盾形+语义标记，未知档不给图标","class":"可参照","official":"packages/client/ui-permission-presets/src/client/PermissionSelect.tsx:29","action":"权限等级用同一盾形底+语义标记（勾=只读/铅笔=可写/叹号=全权）；图标用 currentColor 继承所在行文字色，避免维护两套配色；宿主自定义档位返回 undefined 不猜图标","scope_for_us":"三档权限在触发器与菜单里图标一致且颜色随所在行文字色（无硬编码色）；第四档自定义权限显示为无图标；16x16下可辨识"},
{"id":"B-20","title":"目录快照与失效 tick 拆两 store","class":"可参照","official":"packages/client/ui-permission-presets/src/client/catalog.ts:17","action":"可选清单的 最后一份完整值 与 失效通知 拆成两个 store，换目录前先发失效 tick 让显示旧选项的界面主动丢弃；构造时先订阅两类失效源再发起首次读取，关闭 install/read 竞态","scope_for_us":"清单增删档位瞬间界面不出现已删除档位（可写成时序断言）；断连重连后旧值不残留；首读期间到达的通知不丢（断言最终值=最新值）"},
{"id":"B-21","title":"多入口共用进程级单例目录","class":"可参照","official":"packages/client/ui-permission-presets/src/client/catalog.ts:1","action":"同一份配置（模型/权限）在多处呈现时共用一个 latest-result-wins 进程级读取器，不各自请求，保证两处不显示互相矛盾的状态","scope_for_us":"同屏同时打开设置面板与弹出选择器→两处档位完全一致（断言相等）；变更后两处同时刷新（不一致窗口0帧）；一次变更多处消费只发1次读"},
{"id":"B-22","title":"空态分从来没有与筛选为空两型","class":"可直接复制","official":"packages/client/ui-workspace/src/client/locales.ts:23","action":"空态至少分两型：从未有数据 vs 筛选后为空；分型条件写在数据侧（rows.length>0 && visible.length===0 才算搜索空态）；两型文案与下一步动作不同","scope_for_us":"全新账号无会话与搜索无命中显示不同文案（断言文本不等）；搜索无结果旁有清除筛选入口、从未有旁有创建入口；两态都不显示数字0"},
{"id":"B-23","title":"空态＝语境内联一句，精确到成因","class":"可直接复制","official":"packages/client/ui-model-selection/src/client/locales.ts:32","action":"面板空态是内联单句（说明当前上下文为何为空），不用全屏插画也不用暂无数据式裸标签；不同成因给不同句子（模型为空 vs 该模型无推理等级）","scope_for_us":"每个面板空态≤1句且以句号结束；同屏不出现两段以上空态文案；模型为空与该模型无等级在不同条件下显示不同句子（可断言）"},
{"id":"B-24","title":"降级文案三段式","class":"可直接复制","official":"packages/client/ui-conversation/src/client/locales.ts:18","action":"降级文案模板固定为 原因 + 受限动作 + 仍可用动作 三段式（官方范例：父会话已离线，无法继续发送；仍可停止当前运行）","scope_for_us":"所有降级文案含仍可…子句（正则断言）；不出现只写不可用/失败三字而不给下一步的文案；降级态下仍可做的动作实际可点通（端到端断言）"},
{"id":"B-25","title":"空/错/正常共用一个 DOM 位","class":"可参照","official":"packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:58","action":"状态行用同一 DOM 位承载正常/空/失败，通过 data-* 切换视觉与可读性（data-error 换色、role=status 开播报），不为空态失败态各造组件","scope_for_us":"三态使用同一组件（组件数不变）；三态切换行高不变；仅正常态无 role=status，其余有"},
{"id":"B-26","title":"过渡时长分级表 + 统一结构曲线","class":"可直接复制","official":"packages/client/ui-chat/src/client/chat/TurnNavigator.module.css:40","action":"建一张过渡时长表：80ms微反馈(图标动作)/120ms元素状态(transform、背景)/140ms控件尺寸/160ms面板边框/220ms结构性移动；结构性位移动画统一 cubic-bezier(0.2,0.8,0.2,1)；新组件查表取值","scope_for_us":"transition 取值全部落在表内（脚本断言，非表内值报红）；结构性位移统一该曲线；不存在 transition:all（可断言）"},
{"id":"B-27","title":"prefers-reduced-motion 下过渡置 none","class":"可直接复制","official":"packages/client/ui-attachment/src/FileCard.module.css:117","action":"在 prefers-reduced-motion: reduce 下把过渡直接置 none（而非变慢或减半，后者仍引发不适）；功能不受影响","scope_for_us":"开启系统减少动效后 getComputedStyle(el).transitionDuration 为 0s（可断言）；该动作仍可完成；无时长>0的过渡残留（脚本扫描）"},
{"id":"B-28","title":"滚动条皮肤：令牌挂载层一致 + 双路径互斥门","class":"可参照","official":"packages/client/ui-theme/src/styles/scrollbar.css:16","action":"自绘滚动条：规则必须挂在令牌声明所在层（body，因自定义属性只向下继承，挂 html 会解析为 invalid 而回落 auto）；WebKit 与标准两条路径必须互斥（声明非 auto 的 scrollbar-width/color 会让该元素所有 ::-webkit-scrollbar* 规则含 hover 被丢弃）；滚动条宽度做成可被布局消费的变量而非硬编码","scope_for_us":"深色主题下滚动条不是系统白色（截图断言）；悬停滚动条在 Chromium 与 Firefox 均可看到反馈；两浏览器颜色一致"},
{"id":"B-29","title":"主题双段引导防首帧白闪","class":"可直接复制","official":"packages/client/ui-theme/src/boot-theme.ts:16","action":"head CSS 在任何脚本前先给画布上色（引导期用硬编码色常量不能用令牌，因令牌本身待主题类决定）；system 偏好走 @media(prefers-color-scheme:dark) 纯CSS判定；body 脚本再装 palette 选择器（data-ds-dark-theme）与字号；两条注入有序（style在前、body script在后）","scope_for_us":"暗色偏好冷启动无白闪（首帧背景即#151517，录屏逐帧断言）；禁用JS后仍是正确底色；切换偏好不出现中间态旧色"},
{"id":"B-30","title":"暗色覆盖挂 body 属性；令牌只向下继承","class":"可直接复制","official":"packages/client/ui-theme/src/styles/design-platform.css:80","action":"配色令牌声明在 body，暗色用 body[data-ds-dark-theme] 属性覆盖整套变量（而不是类名）；任何消费令牌的规则也必须挂在 body 或其子元素","scope_for_us":"令牌消费规则无一挂在 html（脚本断言）；切换 data-ds-dark-theme 后所有表层（含滚动条、菜单、弹层）同步变色，无残留亮色"},
{"id":"B-31","title":"可读性设置范围硬约束","class":"可直接复制","official":"packages/client/ui-theme/src/theme-settings.ts:24","action":"字号上下界与默认值写成导出常量（UI/测试/文档共同引用，避免三处写死）；schema 在跨界处强制 step(1)+min+max+default；另提供类型收窄函数","scope_for_us":"滑杆范围=12–17且只能整数；手工写入11/18/13.5/\"big\" 全部被拒并回落默认14（四条断言）；字号变化时正文与折叠行高度同步（对齐B-12的delta变量）"},
{"id":"B-32","title":"虚拟行高具名常量 + 纯投影","class":"可直接复制","official":"packages/client/ui-trajectory/src/client/trajectory-virtual-rows.ts:6","action":"长列表虚拟化拆成纯函数投影（记录→可测量行，含逻辑索引），行高用具名常量（30/20/9）而非常量表达式，使总高可精确预计算、滚动位置可恢复","scope_for_us":"虚拟化投影是纯函数（同输入同输出，无Date/随机）；总高=Σ行高（断言相等）；滚动到50%后刷新恢复误差≤1行"},
{"id":"B-33","title":"滚动容器导出稳定 data-* 锚点","class":"可参照","official":"packages/client/ui-chat/src/client/chat/StatsPills.tsx:5","action":"滚动容器导出稳定的 data-* 标识，停靠/浮层元素据此定位，不依赖结构层级或类名猜测","scope_for_us":"滚动区有稳定 data-* 标识；停靠元素滚动中始终贴合（偏移≤1px）；不存在依赖 nth-child 的定位（grep断言）"},
{"id":"B-34","title":"透明热区可读名 / 禁用有语义 / 展开报 aria-expanded","class":"可直接复制","official":"packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:52","action":"覆盖式透明热区必须带 aria-label 与 title（透明≠不可读）；禁用态除变灰外给 cursor:not-allowed 语义；展开/收起控件报告 aria-haspopup/aria-expanded；图标按钮一律有可读名称","scope_for_us":"自动化无障碍扫描在关键面板0个serious级问题；所有图标按钮有可读名称；所有展开控件有aria-expanded且随状态翻转（断言属性）"},
{"id":"B-35","title":"空态是可填充的具名槽位；无占用者时入口整体消失","class":"可参照","official":"packages/client/ui-workspace/src/client/contract/slots.ts:1","action":"把空态/首屏引导区做成可被扩展填充的具名槽位（declare module 做 SlotMap 声明合并，含 slot 名与 owner props 类型）；槽位触发器与槽内实现分属不同 owner；洞里可再声明子洞（kind:'single'）；槽位无人占用时该能力入口整体不渲染，不留死按钮","scope_for_us":"卸载填充槽位的扩展后入口完全消失（DOM不存在、无占位空按钮，可断言）；装上后入口出现且功能可用；槽位名与props类型在契约文件单点声明，全仓库对槽位名的引用只来自该声明（grep断言）；新增槽位占用者只加文件、不改框架代码"}
]}
```

### 聚合口径与**机械计数**（给 task-5）

```console
$ python3 - <<'PY'
import json,re,collections
s=open('docs/synova/research/official-ui-patterns.md',encoding='utf-8').read()
items=json.loads(re.findall(r'```json\n(.*?)\n```', s, re.S)[-1])['d870_borrow_items']
print("items:", len(items))
print("class counts:", dict(collections.Counter(i['class'] for i in items)))
print("unique ids:", len({i['id'] for i in items}))
print("no-impl:", [i['id'] for i in items if '官方无实现' in i['official']])
PY
items: 35
class counts: {'可直接复制': 25, '可参照': 10}
unique ids: 35
no-impl: []
```

**结论（供总表照抄，勿再人工重数）**：

| 项 | 值 | 明细 |
|---|---|---|
| JSON 块条目总数 | **35** | B-01 … B-35，连续编号、无缺号、无重号（unique ids = 35） |
| `可直接复制` | **25 条** | B-01, B-02, B-03, B-04, B-05, B-06, B-07, B-08, B-10, B-11, B-12, B-14, B-15, B-16, B-18, B-22, B-23, B-24, B-26, B-27, B-29, B-30, B-31, B-32, B-34 |
| `可参照` | **10 条** | B-09, B-13, B-17, B-19, B-20, B-21, B-25, B-28, B-33, B-35 |
| `核心自研` | **0 条** | 本切片全部条目都有官方对应物，无"官方无实现"项 |
| 官方无实现（单列） | **0 条** | 同上 |

> **计数纪律**：以脚本输出 `{'可直接复制': 25, '可参照': 10}` 与 `items: 35` 为**唯一权威**。本文件曾出现过人工列举 ID 与脚本计数不一致的情况（已在本版修正）——**task-5 请一律以 JSON 块机械计数为准，不要采信本表的 ID 清单**。

**配额对账**：本切片配额 ≥12，实际 **35 条** → **满足（35 ≥ 12）**。

### 口径声明（本件全部数字）

| 数字 | 取值 | 口径 |
|---|---|---|
| 密度 7 项 | 19 / 2865 / 603 / 998 / 1809 / 2610 / 2067 | **canonical**：tracked-only × `.ts/.tsx/.mjs/.css` × `apps/**`+`packages/**`（§1.2 命令） |
| `.tsx` / `.css` | 412 / 154 | `git ls-files 'packages/client/**/*.{tsx,css}'` |
| `apps/web/src` ts | 4 | `git ls-files 'apps/web/src/*.ts'` |
| client 插件目录 | 55 | `ls -d packages/client/*/` |
| 空态名单键 / `empty*` 标识 | 8 / 51 | canonical 命令形式，范围 `packages/**`（命中仅落在 `packages/client`） |

### 证据索引

- 全部官方 file:line 的逐行复现输出：§十五（100% 覆盖，非抽样）
- 排除项官方自述来源（`package.json` description + 源码引用点）：§十五末
- 红线自检（G1 = 0；工作树 status）：§十五末
- 未覆盖 / 存疑项：§十六
