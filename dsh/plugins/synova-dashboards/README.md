# @synova/dsh-dashboards — Synova 全局跟踪三仪表盘 + 项目总览（DSH Web · **全局挂载**）

两块能力，同一个包、同一个 Host 半：

| 区域 | 形态 | 数据源（Host 端按请求实时读盘，无缓存） |
|------|------|----------------------------------------|
| **项目总览**（D794，左侧栏入口 → 中央面板） | `sidebar.panellist` 图标行 + `main` keyed cell | `docs/synova/project/ledger.json`（D795 派生器产出，**只读**） |
| **三仪表盘**（右侧栏 52px ↔ 372px） | `shell.overlay` | 见下表 |

三仪表盘页签：

| 页签 | 数据 | 数据源 |
|------|------|--------|
| ① 完成度 | 26 条产品线进度（总体 % + 逐线 bar + 已验证点数） | `docs/synova/product-lines/product-progress.json` |
| ② 任务 | 在途任务卡片（D#/状态/更新人/提交/审计）+ 最近任务 | `task-state/*.json` + `docs/synova/DASHBOARD-CN.md` |
| ③ 健康 | 真绕过/门禁拒绝/提交失败计数 + M 模式复发 + CTO 判定 | `.claude/bypass.log`、`.claude/pre-commit-failures.log`、`docs/synova/audit-reports/`、`docs/synova/CTO-HEALTH.md` |

**实时性**：项目总览 60s 轮询 + 回到前台刷新 + 手动刷新；右栏三仪表盘 15s。两者均由 Host 半每次请求实时读盘。

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
| `GET /synova/dashboards/data` | 三仪表盘 payload | 200 + `{degraded:true, error}`（每个 section 独立降级） |
| `GET /synova/pm/ledger` | `docs/synova/project/ledger.json` **原文**（原样透传） | 200 + `{ok:false, degraded:true, error, path}` |

- 账本读取器 `lib/ledger.js` 纯 Node（无 cordis 依赖，可独立测试）；
  三条降级路径（ENOENT / BAD_JSON / 其它 I/O）**全部不抛异常**，且都会 `logger.warn` 留痕（铁律 24/31）。
- 数据收集器 `lib/collect.js` 同上，逐 section 独立 try/catch。
- **零写入**：Host 半只 `readFile` + 只读 `git show/ls-tree/log`，不写工作区/仓库/账本。

### Client 半（`lib/client.js`，浏览器）

以 `window.__ModuleLoader__.load` 工厂格式**手写，无需构建**；只 require 静态种子模块
（react / react/jsx-runtime）。注册三处槽位：

| 槽位 | 签名 | 用途 |
|------|------|------|
| `main`（keyed） | `{key: "synova-project-overview"}` | 项目总览中央面板 |
| `sidebar.panellist`（list） | `{id: "synova-project-overview", order: 50, label: "项目总览"}` | 左侧栏入口图标（收 owner props `{size, active}`） |
| `shell.overlay`（list） | `{id: "synova-dashboards", order: 200}` | 右侧栏三仪表盘 |

> **官方全局面板协议**（依据 `@deepseek-ai/dsh-client-ui-sidebar` README §全局面板入口）：
> `sidebar.panellist` 的**同一个 id** 寻址 root 作用域 `main` keyed slot 的组件；
> **选择未注册的 main key 会抛错并保留当前选中态** ⇒ 必须先注册 `main`，再注册入口行。
> 该插槽已由官方 sidebar（非第三方替换侧栏）声明，故任意环境下都在场；无注册项时整块不渲染。

项目总览面板四区块：① 顶部四数（交付度 / 验证率 / 保鲜红灯 / 阻塞数）② 26 线总览（点行展开断言明细）
③ 阻塞清单（原因 + 起始 + 需要谁 + 已卡天数）④ 时间轴（`ledger.timeline` 缺失时显式显示「待数据（D795）」）。
三态降级均显式呈现、不白屏不抛错：网络/HTTP 失败、路由级 `ok:false`、账本级 `degraded:true`（含 `degraded_sources`）。
「返回会话」走 `ctx.layout.selectPanel(null)`。

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
cd dsh/plugins/synova-dashboards && npm test     # 21 条：ledger 读取 / Host 路由 / 面板渲染

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
- 项目总览的数据依赖 D795 的 `docs/synova/project/ledger.json`；该文件未产出时面板显示
  **显式降级文案**（不白屏、不崩、不静默填 0），这是预期态而非故障。
- 项目总览面板为**只读视图**：不写工作区/仓库/账本，也不写 localStorage（面板状态仅存在于内存）。
- 右栏三仪表盘为悬浮层（`shell.overlay`），不挤压对话区；宽度 372px。
- 数据为轮询快照，非推送流。
- 重新安装 DSH CLI（npm -g）不影响本插件（装在 profile 层）；profile 目录被删除重建时重跑安装脚本。
