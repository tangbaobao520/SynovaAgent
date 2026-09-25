# @synova/dsh-dashboards — 「项目总览」（DSH Web · **全局挂载 · 单一入口**）

左侧栏一个入口 → 中央只读面板。**入口唯一**：早期版本的右侧栏三仪表盘（`shell.overlay`）
已并入本面板并**删除**，不再维护第二个入口。

| 面板区块 | 数据 | 数据源（Host 端按请求实时取数，无缓存） |
|---|---|---|
| ① 顶部四数 | 交付度 / 验证率 / 保鲜红灯 / 阻塞数 | `ledger.totals` |
| ② 26 线总览 | 每线 V1 通过 x/y、保鲜色、阻塞标签、断言明细（点行展开） | `ledger.lines` |
| ③ 阻塞清单 | 原因 + 起始 + 需要谁 + 已卡天数 | `ledger.blocked` |
| ④ 执行看板 | D# / 状态 / owner / 停滞天数（降序取前 12 + 状态分布） | `ledger.tasks`（D795 由 `task-state/*.json` 派生） |
| ⑤ 健康 | 真绕过 / 门禁拒绝 / 提交失败 + M 模式复发 + CTO 判定 | `GET /synova/dashboards/data` → `health`（`.claude/bypass.log`、`.claude/pre-commit-failures.log`、AUDIT-FINDINGS-LEDGER、CTO-HEALTH） |
| ⑥ 时间轴 | 里程碑泳道 / 计划×实际 | `ledger.timeline` |

> 原右栏「完成度」页签**已删重复**——其信息（26 线进度）由区块 ② 覆盖。
> 原「任务」「健康」两页签分别并入区块 ④ / ⑤。

**实时性**：60s 轮询 + 回到前台立即刷新 + 手动刷新；由 Host 半每次请求实时取数。

### 面板交互（D794 收口）

| 交互 | 做法 | 记忆 |
|---|---|---|
| 拖动 | 标题栏为拖拽区（Pointer Events + `setPointerCapture`），移动被夹在视口内 | `localStorage["synova.pm.panel.v1"]` |
| 缩放 | 右下角 resize 手柄；min **720×480**，max **视口-32px** | 同上（与位置同一个键） |
| 折叠 | 每个区块标题右侧 ▸/▾ 开关；「26 线总览 / 阻塞清单 / 执行看板 / 健康 / 时间轴」五块各自独立 | `localStorage["synova.pm.collapse.v1"]` |
| 断言明细 | 默认**收起**，点行展开该线断言明细 | 不记忆（会话内状态） |

- 面板为 `position:fixed` 浮动卡片（`z-index:40`），默认视口内居中，四周留 32px。
- 偏好读写失败（隐私模式/配额）只记 `console.warn` 并降级为「不记忆」，**不抛错、不白屏**（铁律 24/31）。
- 几何在写入与读取时都过 `normalizeGeo()`：无论记忆值多离谱，渲染前都被夹进 min/max 且不出视口。

### 修裁切/重叠（根因）

`.spo-body` 是 flex 列容器，子项默认 `flex-shrink:1` —— 26 线这类长列表会把每个区块**压扁并互相裁切**。
修复三件套：

```css
.spo-body>*{flex:none}                     /* ① 区块不再被压缩 */
.spo-sec{flex:none}                        /*    显式兜底 */
.spo-list{max-height:40vh;overflow-y:auto} /* ② 列表类区块自带滚动（外层 .spo-body 仍保留滚动） */
```

区块是 `.spo-body` 的**直接子项**（测试断言 `parentClass === "spo-body"`），故 `flex:none` 必然命中。

## 架构

### 挂载（全局，任意预设会话可见）

- **挂载点**：`~/.dsh/profiles/web/package.json` 的
  `dependencies["@synova/dsh-dashboards"] = "file:…/dsh/plugins/synova-dashboards"`
  \+ `dsh.profile.bundles` 追加 `"@synova/dsh-dashboards"`。
  包内 `cordis.patch.yml` 是 bundle 层（`dsh.bundle.patch` 声明），把 Host 半插进 web profile 树。
- **为什么是 bundle 而不是预设**：bundle 属于 **web profile 本身**，任何预设会话（synova-cto / cordis / 默认…）
  共用同一棵树 → 入口全局可见（D794 派发 §A.2.1）。早期版本挂在 synova-cto 预设下，仅 CTO 会话可见，已废弃。
- 包内另有进程级 `active` 护栏防并发重复挂载（`lib/index.js`）。

### Host 半（`lib/index.js`，dsh web 进程内 Cordis 插件）

两条**只读** GET 路由：

| 路由 | 成功 | 降级 |
|------|------|------|
| `GET /synova/pm/ledger` | 200 + `{ ...ledger, ok:true, source:"worktree"\|"origin/main"[, source_detail] }` | 200 + `{ok:false, degraded:true, error, attempts}` |
| `GET /synova/dashboards/data` | 健康区 payload（`health` 被面板区块 ⑤ 使用） | 200 + `{degraded:true, error}`（每个 section 独立降级） |

**账本三级取数**（`lib/ledger.js`，D794 收口）：

1. 工作区 `<repoRoot>/docs/synova/project/ledger.json` → `source="worktree"`
2. 否则 `git -C <repoRoot> show origin/main:docs/synova/project/ledger.json` → `source="origin/main"`
3. 两级都失败 → 显式 `degraded`，`error`/`attempts` 带上**每一级各自的原因**

> **为什么**：只读工作区文件时，谁 checkout 了别的分支账本就随之消失 →「数据不通」（实测）。
> 第 2 级以 `origin/main`（D334「main 是唯一真相」）为权威回退。
> 工作区账本**坏 JSON 也不直接判死**，会继续尝试第 2 级（并在 `source_detail` 说明）。
> 本模块**不执行 `git fetch`**：`origin/main` ref 的新鲜度依赖仓库既有 fetch 纪律（铁律 0-3 / pre-push）。

- 账本读取器 `lib/ledger.js` 纯 Node（无 cordis 依赖，可独立测试）；三级**全部不抛异常**，
  降级与回退都会 `logger.warn` 留痕（铁律 24/31：禁静默）。
- 数据收集器 `lib/collect.js` 同上，逐 section 独立 try/catch。
- **零写入**：Host 半只 `readFile` + 只读 `git show/ls-tree/log`，不写工作区/仓库/账本。

### Client 半（`lib/client.js`，浏览器）

以 `window.__ModuleLoader__.load` 工厂格式**手写，无需构建**；只 require 静态种子模块
（react / react/jsx-runtime）。注册**两处**槽位（二者成对、id 相同）：

| 槽位 | 签名 | 用途 |
|------|------|------|
| `main`（keyed） | `{key: "synova-project-overview"}` | 项目总览中央面板 |
| `sidebar.panellist`（list） | `{id: "synova-project-overview", order: 50, label: "项目总览"}` | 左侧栏入口图标（收 owner props `{size, active}`） |

样式注入会在每次 `apply` 前移除本插件此前注入的所有 `<style>` 再插当前一份 —— 保证 HMR 后
不残留旧规则。旧版按固定 key 判重会拒绝重注入（改过 CSS 仍跑旧样式）。

> **官方全局面板协议**（依据 `@deepseek-ai/dsh-client-ui-sidebar` README §全局面板入口）：
> `sidebar.panellist` 的**同一个 id** 寻址 root 作用域 `main` keyed slot 的组件；
> **选择未注册的 main key 会抛错并保留当前选中态** ⇒ 必须先注册 `main`，再注册入口行。
> 该插槽已由官方 sidebar（非第三方替换侧栏）声明，故任意环境下都在场；无注册项时整块不渲染。

面板六区块见文首表格；头部有**取数来源标记**（`源 worktree` / `源 origin/main`，验收用）。
**四态降级均显式呈现、不白屏不抛错**（铁律 24/31）：

1. 网络/HTTP 失败 → 硬降级横幅
2. 路由级 `ok:false` → 降级横幅（工作区与 `origin/main` 都无账本时的正常态）
3. 账本级 `degraded:true` → 部分降级警告 + `degraded_sources`
4. 健康路由失败 / `health.ok===false` → **仅健康区**显示降级文案（其余区块照常）

账本与健康是两条独立请求，任一失败不影响另一块（`Promise.allSettled`）。
「返回会话」走 `ctx.layout.selectPanel(null)`。

### 框架态降级（D963：DSH 版本不足 / slot 不存在 / 插件未装）

依据 DSH 锚定仓实读（不猜 API；file:line 相对 `/Users/wane/src/deepseek-harness-017`）：

| 态 | 插件可否自报 | 行为 |
|---|---|---|
| `ctx.slots` API 面缺失（旧版宿主调用了 apply） | ✅ 可检测 | `console.warn` 显式提示「DSH 版本不足…两块面板均未注册」，apply 提前返回（lib/client.js `apply` 头部防御探测） |
| slot 未声明（`main` / `sidebar.panellist` 不存在） | ✅ 可检测 | `slots.specDynamic`/`spec` 探测（SlotCore 公共查询面，api-catalog.ts SlotCore 声明；guard.ts:127 框架自身同样用法）→ 未声明则 `console.warn`；`slots.inject` 保留（声明稍后出现时回调照常跑）。`register` 对未声明 slot 同步抛错（client/ui-slots/src/index.ts:1206）→ `guardedRegister` 捕获 + warn，禁穿透宿主 fiber |
| 插件 inject 声明的 service 缺失（DSH 版本不足，service 级） | ❌ 框架侧 | apply 挂起等待、根本不执行（cordis-client-runner/src/client/runtime.ts:393 `waitingFor` 投影）——插件无代码执行点，无法自报；由框架状态面呈现 |
| 插件未装 | ❌ 框架侧 | 插件代码不在运行，逻辑上不可能由插件自报（无任何执行点）；「左栏无入口」即该态的唯一表现，宿主/用户侧判断 |

另：`slots.inject` 对永不声明的 slot **静默不执行回调且不报错**（client/ui-renderer/src/client/registry.ts `inject()` 内 reconcile `if (spec === undefined) return`）——这正是插件必须在 apply 时主动探测并 warn 的原因（禁静默，铁律 24/31）。


## 安装

```bash
bash dsh/plugins/synova-dashboards/scripts/install-dashboards.sh
# 生效（两步）：
#   1) 重启 dsh web：bash dsh/plugins/synova-dashboards/scripts/restart-dsh-web.sh
#      （该脚本 kill 占用 3080 的进程 —— 若你在某个 session 里，请从会话外执行）
#   2) 刷新浏览器 → 左侧栏出现「项目总览」入口
```

安装脚本**幂等**（可重复执行，第二次为 no-op），只写 `$DSH_HOME`，仓库零写入。四步：
① 复制包到 `~/.dsh/profiles/web/node_modules/@synova/dsh-dashboards`（bundle 名解析锚点）；
② 把副本 `cordis.patch.yml` 的 `repoRoot` 改写成本机实际仓库根；
③ profile `package.json`：`dependencies` + `dsh.profile.bundles`；
④ 删除 synova-cto 预设里的旧 loader 块（避免与 bundle 层重复挂载）。脚本尾部打印回滚步骤，
并已备份 profile `package.json` 到 `package.json.synova-bak`。

> 注：DSH 的 client 模块扫描在进程启动时缓存包元数据 → **必须重启 dsh web** 才生效
> （HMR 只热更已知行，不新增包）。用 `dsh --profile web --dump-config` 可重启前先验证合成树。

## 验证

```bash
cd dsh/plugins/synova-dashboards && npm test     # 31 条：三级取数 / Host 路由 / 面板渲染 / 拖动缩放记忆 / 折叠记忆 / 裁切修复

# 合成树（不启动服务即可证明 bundle 层挂载）
dsh --profile web --dump-config | grep -A5 "@synova/dsh-dashboards"

# 运行中进程验证路由
curl -s http://127.0.0.1:3080/synova/pm/ledger | head -c 200
curl -s http://127.0.0.1:3080/synova/dashboards/data | head -c 300
```

## 卸载 / 回滚

```bash
cp ~/.dsh/profiles/web/package.json.synova-bak ~/.dsh/profiles/web/package.json
rm -rf ~/.dsh/profiles/web/node_modules/@synova/dsh-dashboards
# 重启 dsh web
```

## 已知限制

- 安装/升级后需**重启 dsh web**才生效（进程启动时缓存 client 包元数据）。
- **`origin/main` 回退要真正生效，前提是 `docs/synova/project/ledger.json` 已提交进 main**。
  该文件目前只存在于工作区（D795 尚未把产物提交进 main）→ 此时工作区文件一旦消失
  （改名/切换分支）仍会走第 3 级显式降级。D795 提交后回退即自动可用（代码路径已由测试覆盖）。
- 本模块不执行 `git fetch`：`origin/main` ref 若陈旧，回退到的就是陈旧账本。
- 项目总览面板为**只读视图**：不写工作区/仓库/账本，也不写 localStorage（面板状态仅存在于内存）。
- 数据为轮询快照（60s），非推送流。
- 执行看板取 `ledger.tasks`（D795 由 `task-state/*.json` 派生），不再独立扫 task-state —— 单一真相源，避免两套口径。
- 重新安装 DSH CLI（npm -g）不影响本插件（装在 profile 层）；profile 目录被删除重建时重跑安装脚本。
