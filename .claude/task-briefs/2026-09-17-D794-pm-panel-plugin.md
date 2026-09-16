# Task Brief: D794 「项目总览」插件（左侧栏入口 + 中央只读面板）

> 生成: 2026-09-17 | 任务: D794 | 认领: synova-cto（**代落**：实现由创造模式会话完成，本 brief 由 CTO 补齐以解 G12 写集门禁）
> 派单: `docs/synova/coordination/派单-D794-D795-项目总览可视化-20260917.md` §A（PR #609）
#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- 层级：**DSH 运行时 / Web GUI 插件层**（不是产品 L1-L5 代码；零 `src/**` 触碰）
- 现有模块：
  - `dsh/plugins/synova-dashboards/` — 右栏三仪表盘插件（Host 路由 `GET /synova/dashboards/data` + Client `shell.overlay` 右栏），v0.1.0
  - `dsh/plugins/task-board-adapter/` — task-state → 任务看板单向镜像（本次**不改**）
- 决策：**升级现有插件包**，不新建包；挂载从「synova-cto 预设专属」改为「web profile 全局」。

### b) 文件审计
```
dsh/plugins/synova-dashboards/lib/ledger.js            — ❌ 新建（账本只读读取器，三路降级）
dsh/plugins/synova-dashboards/lib/index.js             — ✅ 改（+ GET /synova/pm/ledger 路由）
dsh/plugins/synova-dashboards/lib/client.js            — ✅ 改（+ 左栏入口 sidebar.panellist 与 main 成对注册 + 中央面板四区）
dsh/plugins/synova-dashboards/cordis.patch.yml         — ❌ 新建（bundle 层，全局挂载）
dsh/plugins/synova-dashboards/package.json             — ✅ 改（声明 dsh.bundle.patch）
dsh/plugins/synova-dashboards/scripts/install-dashboards.sh — ✅ 改（全局挂载 + 清旧预设块 + 幂等可回滚）
dsh/plugins/synova-dashboards/README.md                — ✅ 改（架构文档同步）
dsh/plugins/synova-dashboards/test/*（4 文件）          — ❌ 新建（21 条测试）
```

### c) 决策
复用现有插件包与其「零构建手写 client.js」路线；不引入第三方依赖；不写 DSH 核心补丁。

## Q1: 调研 — 业界/本仓证据 + 契约

### a) 官方契约（外部一手来源）
- `@deepseek-ai/dsh-client-ui-sidebar` README §全局面板入口：插件在 root 作用域 `sidebar.panellist` list 注册图标（`id` / 可选 `order` / `label`）；**同一 id 寻址布局 root 作用域 `main` keyed slot**；选中不存在的主面板条目会抛错且不改选中态。→ 必须**成对注册**，且 main 先注册。
- 运行时可观测（本机）：`sidebar.panellist` 实际占用者 = `dsh-tauri-panel-scheduler`(order 30) / `dsh-tauri-panel-extension`(order 40) → 本次取 order 50，与「任务看板」同区不冲突。

### b) 铁律对齐
- 铁律 11/24：降级必须显式（`degraded:true` + 原因），禁静默。
- 铁律 47：新路由先写契约（`lib/ledger.js` 头注释含 `@input/@output/@degraded/@caching`）。
- 铁律 48：非空壳测试（21 条含反向断言）。

参考：Anthropic 工程基线（契约先行 + 反向验证）＋ 官方 README 契约 ＋ 本仓 D569 仪表盘插件先例 → 结论：**沿用现有插件包升级 + 成对注册 + 只读降级**。

## Q2: 范围 — 正确的最简方案

做什么（= 本次写集，机器块见下）：
- `dsh/plugins/synova-dashboards/lib/ledger.js` — 只读读取 `docs/synova/project/ledger.json`，三路降级（缺失/坏 JSON/字段缺）
- `dsh/plugins/synova-dashboards/lib/index.js` — 新增 `GET /synova/pm/ledger`（无缓存，读盘；降级返回 `{ok:false,degraded:true,error}`）
- `dsh/plugins/synova-dashboards/lib/client.js` — 左栏入口 + 中央只读面板（三数 / 26 线 / 阻塞 / 时间轴占位）；保留原右栏三仪表盘
- `dsh/plugins/synova-dashboards/cordis.patch.yml` + `package.json` — bundle 层声明（全局挂载）
- `dsh/plugins/synova-dashboards/scripts/install-dashboards.sh` — 全局挂载（web profile `dependencies` + `dsh.profile.bundles`）、删除 synova-cto 预设旧 loader 块、幂等 + 备份 + 回滚说明
- `dsh/plugins/synova-dashboards/README.md` — 架构与安装说明同步
- `dsh/plugins/synova-dashboards/test/*` — 21 条测试（client-panel 8 / host-route 6 / ledger 7）

不做什么：
- 不改 `scripts/audit/`（K3 红线）；不改 `src/**`（产品代码，归编码 session）
- 不改 `dsh/plugins/task-board-adapter/**`（另一卡/另一域）
- 不新增第三方依赖；不写 DSH 核心补丁；不写 `docs/synova/project/ledger.json`（D795 写集，禁跨卡写入）

## Q3: 验收 — 入口 → 交互 → 结果

入口：DSH 侧边栏 `sidebar.panellist` 的「项目总览」📊（全局，任意预设会话可见）
处理：点击 → 中央面板读取 `GET /synova/pm/ledger` → 渲染三数 / 26 线 / 阻塞 / 时间轴
结果：创始人一眼看到交付度 / 验证率 / 保鲜红灯 / 阻塞；无数据时显式显示「降级：ledger 未产出」

## 架构层
scripts（控制塔工具链）+ DSH Web GUI 插件层（非产品 L1-L5）

## Done 标准
- [ ] verify: `node dsh/plugins/synova-dashboards/test/*.test.js` → 3 套全绿（8+6+7=21 pass / 0 fail）
- [ ] verify: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/synova/pm/ledger` → 重启后 200（当前 404 = 旧代码未加载，机制正确）
- [ ] verify: 重启 dsh web 后侧栏出现「项目总览」入口 + 面板显示数据（创始人目视）
- [ ] verify: 插件零写入 —— 操作前后 `git status --porcelain` 计数不变

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| dsh/plugins/synova-dashboards/README.md | task |
| dsh/plugins/synova-dashboards/lib/client.js | task |
| dsh/plugins/synova-dashboards/lib/index.js | task |
| dsh/plugins/synova-dashboards/lib/ledger.js | task |
| dsh/plugins/synova-dashboards/test/client-panel.test.js | task |
| dsh/plugins/synova-dashboards/test/harness.js | task |
| dsh/plugins/synova-dashboards/test/host-route.test.js | task |
| dsh/plugins/synova-dashboards/test/ledger.test.js | task |

