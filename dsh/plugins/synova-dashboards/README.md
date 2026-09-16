# @synova/dsh-dashboards — Synova 全局跟踪三仪表盘（DSH Web 右侧栏 · CTO 预设专属）

把 Synova 控制体系的**三仪表盘**实时可视化到 DSH Web GUI 的右侧栏（对话旁）。
**按创始人指示：挂载在 synova-cto 预设之下**（CTO 模式），非全局——只有 CTO 会话
激活时右侧栏才出现。

| 页签 | 数据 | 数据源（Host 端按请求实时读取） |
|------|------|------------------------------|
| ① 完成度 | 26 条产品线进度（总体 % + 逐线 bar + 已验证点数） | `docs/synova/product-lines/product-progress.json` |
| ② 任务 | 在途任务卡片（D#/状态/更新人/提交/审计）+ 最近任务 | `task-state/*.json` + `docs/synova/DASHBOARD-CN.md` |
| ③ 健康 | 真绕过/门禁拒绝/提交失败计数 + M 模式复发 + CTO 判定 | `.claude/bypass.log`、`.claude/pre-commit-failures.log`、`docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md`、`docs/synova/CTO-HEALTH.md` |

**实时性**：15s 自动轮询 + 页面回到前台立即刷新 + 手动刷新按钮；数据由 Host 半每次请求实时读盘，无缓存。

## 架构

- **挂载点**：`~/.dsh/.agent-presets/synova-cto/agent.cordis.yml` 末尾追加一行
  `- id: synova-dashboards / name: '@synova/dsh-dashboards' / inject: [webServer] / config.repoRoot`。
  synova-cto 是 standing-scope 预设（每进程挂载一次，多会话共享）→ 数据路由只注册一次；
  包内另有进程级 `active` 护栏防并发重复挂载（`lib/index.js`）。
- **Host 半**（`lib/index.js`，dsh web 进程内 Cordis 插件）：注册 `GET /synova/dashboards/data`
  路由。数据收集器 `lib/collect.js` 为纯 Node（无 cordis 依赖，可独立测试），每个 section
  独立降级（`ok:false + degraded:true + error`，铁律 24/31）。
- **Client 半**（`lib/client.js`，浏览器）：以 `window.__ModuleLoader__.load` 工厂格式**手写，
  无需构建**；只 require 静态种子模块（react / react/jsx-runtime）；注册进 `shell.overlay`
  插槽（layout 已声明为 list，**零核心补丁、顺序无关**）。
- **右栏形态**：52px 📊 窄栏 ↔ 372px 面板双态（localStorage 记忆）；
  工具详情列打开时自动收窄为窄栏（MutationObserver 监听 `data-details-collapsed`），互不遮挡。

## 安装

```bash
bash dsh/plugins/synova-dashboards/scripts/install-dashboards.sh
# 生效（三步）：
#   1) 重启 dsh web（停掉当前进程 → dsh web）
#   2) 打开/恢复 CTO 会话（synova-cto 预设挂载后，插件行随预设进入 loader）
#   3) 刷新浏览器 → 右侧出现 📊 窄栏
```

安装脚本幂等：① 复制包到 `~/.dsh/profiles/web/node_modules/@synova/dsh-dashboards`
（loader 解析基准）；② 在 synova-cto 预设追加 loader 行；③ 清理早期"全局 web profile"
条目（若存在）。

> 注：DSH 的 dsh.client 扫描在进程启动时缓存包元数据；预设行是**新 loader 条目**，
> 必须重启 dsh web 才生效。刷新页面时 boot graph 才包含新 client 包（HMR 只热更已知行）。

## 验证

```bash
# 数据收集器独立测试（不依赖 GUI）
node -e "import('./lib/collect.js').then(m=>m.collectDashboards('<仓库根>')).then(p=>console.log(JSON.stringify(p,null,1).slice(0,400)))"

# CTO 会话挂载后验证路由
curl -s http://127.0.0.1:3080/synova/dashboards/data | head -c 300
```

## 卸载

1. 编辑 `~/.dsh/.agent-presets/synova-cto/agent.cordis.yml`，删除 "Synova 全局跟踪三仪表盘" 行块
2. `rm -rf ~/.dsh/profiles/web/node_modules/@synova/dsh-dashboards`
3. 重启 dsh web

## 已知限制

- 新 loader 条目需**重启 dsh web** 才生效；面板只在 **CTO 预设会话**激活时出现（by design）。
- 面板为悬浮右栏（shell.overlay），不挤压对话区；宽度 372px。
- 数据为轮询快照（15s），非推送流；对 git/文件变更足够实时。
- 重新安装 DSH CLI（npm -g）不影响本插件（装在 profile 层）；profile 目录被删除重建时重跑安装脚本。
