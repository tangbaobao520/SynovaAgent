# @synova/dsh-desktop — Synova 控制塔桌面壳（方案 A：壳 + 本地服务）

把 DSH Web GUI（含 **synova-dashboards 三仪表盘右栏**）封装为 macOS 原生应用。
**零侵入**：DSH 本体与 Cordis 插件系统一行不改，壳只是"浏览器外壳"。

## 架构

```
┌─ dsh-desktop (Electron) ───────────────────────────────┐
│  main.cjs                                              │
│    ├─ 探测 127.0.0.1:3080 已有 dsh web？               │
│    │    ├─ 有 → 直接连接（复用，不重复 spawn）          │
│    │    └─ 无 → spawn `dsh web` → 等端口就绪           │
│    └─ BrowserWindow → http://127.0.0.1:3080            │
│         └─ DSH Web GUI + synova-dashboards 右栏        │
└────────────────────────────────────────────────────────┘
```

- **Client 半插件**跑在 WebView（Chromium 内核）→ 与浏览器标签页等价，性能无差别
- **Host 半插件**跑在 dsh web 进程内 → 与壳完全无关
- **Cordis 动态插件 / Slots / 预设 / profile** 全部留在 dsh 侧 → 扩展性零影响

## 安装

```bash
cd dsh/desktop
npm install --cache /tmp/synova-npm-cache   # 仓库 .npm 缓存有 root 遗留，用临时缓存绕开
```

## 运行

```bash
bash dsh/desktop/start.sh     # 推荐：LaunchServices 启动（绕过沙箱/终端环境限制）
npm start                     # 备用：直接 spawn（注意：从 DSH/VSCode 终端内会 SIGTRAP）
npm run dev                   # 调试（dsh web 子进程 stdout 跟随终端）
```

行为：
1. 启动即探测 3080 —— **已有 dsh web 实例则直接连**（当前你浏览器开着 3080 也互不影响）
2. 无实例则自动 `dsh web`，最多等 45s
3. macOS 惯例：关窗口不退出（Dock 常驻）；Cmd+Q 真正退出并收掉自启的子进程
4. 壳内打开非 3080 链接 → 交给系统浏览器

> **为什么 start.sh 用 `open` 启动**（2026-08-16 实测）：Electron 二进制若从 DSH/VSCode
> 终端环境直接 spawn，会继承 VSCode 的 coalition，Chromium V8 初始化即 SIGTRAP 崩溃
> （崩溃报告 `~Library/Logs/DiagnosticReports/Electron-*.ips` 中 parentProc=node、
> responsibleProc=Code 可证）。`open` 走 LaunchServices 拉起，完全脱离该环境，正常。
> 终端里 `npm start` 在**普通终端**（iTerm/系统终端）下无此问题，仅 DSH 沙箱环境需走 start.sh。

## 验证清单

```bash
# ① 数据路由（Host 半）—— 壳不重启也成立
curl -s http://127.0.0.1:3080/synova/dashboards/data | head -c 200

# ② client 包可被服务端提供（进程重启后成立）
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3080/plugins/@synova/dsh-dashboards/client.js

# ③ 壳主进程无端口冲突：3080 始终只有一个 LISTEN
lsof -iTCP:3080 -sTCP:LISTEN -P | wc -l
```

人工确认：启动壳 → 右侧出现 📊 窄栏 → 点击展开三仪表盘（完成度/任务/健康）→ 15s 自动刷新。

## 与插件性能/扩展性的关系（评估结论）

| 维度 | 结论 |
|------|------|
| 插件性能 | 零影响。Client 半 = WebView 里跑，等同 Chrome 标签页；Host 半在 dsh 进程内，与壳无关 |
| 扩展性 | 零影响。Cordis 动态插件/Slots/loader/profile/预设全在 dsh 侧，壳只是展示层 |
| 双实例 | 安全。壳启动探测 3080，已有实例直接复用，不会出现两个控制塔写同一 profile |
| DSH 升级 | 壳 spawn `dsh` 命令 → 天然跟随 npm 全局升级，不锁版本 |

## 已知边界

- 依赖系统已装 `dsh` CLI（`npm i -g @deepseek-ai/dsh`）
- 壳自身没有应用内更新机制（Electron 应用本体更新暂不做，DSH 侧升级不受影响）
- 多窗口语义与浏览器多标签一致：每窗口都渲染右栏（shell.overlay 为 root 作用域）
