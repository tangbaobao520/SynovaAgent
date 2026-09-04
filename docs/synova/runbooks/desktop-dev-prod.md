# Runbook — 桌面端双引导收敛声明（D518，验证点 1-5）

> **用户唯一路径 = 安装包双击。** 命令行路径全部标注「仅开发」。
> dev/prod 判定唯一事实源：`app.isPackaged`（Electron 官方标准；`SYNOVA_ELECTRON_*` env 仅供测试注入）。

## 一、收敛声明

| 路径 | 触发 | 后端 | 窗口加载 | 定位 |
|---|---|---|---|---|
| **prod（唯一用户路径）** | 双击安装的 SynovaAgent.app | `ensureBackend(prod)` spawn 包内 Electron 二进制（node 模式）跑 `dist/backend.mjs`，注入 `SYNOVA_DB_PATH=<userData>/data/synova.db` | `loadFile(resources/renderer/index.html)` → 首诊页 | GA |
| dev（仅开发） | `npm run electron:dev` | `ensureBackend(dev)` spawn `npx tsx src/index.ts` | 优先 vite 5173 热更新 → 回退 SERVER_URL 登录页 → 均不可达则离线页 | 开发者 |

启动第一行日志即模式证据：`[electron] boot mode=dev|prod server=http://localhost:18790`。

## 二、prod 链路图（双击 → 首诊页）

```
双击 SynovaAgent.app
  → electron/main.cjs app.whenReady()
  → console.log('[electron] boot mode=prod ...')          ← 模式显式化
  → ensureBackend({ mode:'prod', cwd:process.resourcesPath,
                    dbPath:userData/data/synova.db, logFile:userData/logs/backend.log })
      → 探活 GET /api/healthz（200 → reused 不重复 spawn——端口冲突安全网）
      → 不可达 → spawn（ELECTRON_RUN_AS_NODE=1）包内二进制跑 dist/backend.mjs（SYNOVA_DB_PATH 注入）
        → 探活轮询 → 重启限次 3/10min
      → 失败 → degraded 显式 + 离线页（不静默，铁律 11/24）
  → createWindow → loadFile(resources/renderer/index.html) → 首诊页
  → 退出 before-quit → backendHandle.stop()（SIGTERM 回收，无孤儿）
```

## 三、SERVER_URL 收敛说明

- 单一配置源：`electron/config.json` → `{"serverUrl":"http://localhost:18790"}`。
- 语义：**本机 spawn 优先**——prod 模式该端口就是自己 spawn 的后端；若端口已有健康服务（开发者手动起的），`reused` 兜底直接复用，不重复 spawn。
- 不做远程外连配置（桌面端=本地一体，远程部署是独立部署形态）。

## 四、开发路径（仅开发）

```bash
npm run dev                                  # 后端 tsx（仅开发）
cd electron-renderer && npm run dev          # vite 5173 renderer 热更新（仅开发）
npm run electron:dev                         # Electron 壳（仅开发；窗口加载 5173）
```

验收运行证据命令：`npm run electron:dev` 后终端日志含 `[electron] boot mode=dev`。
prod 侧验收归 D519（`scripts/desktop/mac-install-verify.sh` 四断言含 healthz + mode=prod，evidence 共享）。


## 五、prod 后端运行时（D518 实测定案，backend-spawn.cjs buildCommand 注释同源）

GA 机器**无 Node 前提**（北星 §二），且实测三重阻塞证明裸 `node` 方案物理不可行：
1. `dist/src/*.js` 为 ESM + TS 无扩展名 import——任何裸 node 直接 `ERR_MODULE_NOT_FOUND`（main 存量，`npm start` 同样损坏）；
2. 打包产物依赖位于 `app.asar` 内——裸 node 的模块解析不可达；
3. 原生模块（better-sqlite3/bcrypt）在产物内为 **Electron ABI**——外部任何 node 版本都 ABI 不匹配。

定案：**esbuild 单文件 bundle（`npm run build:backend` → `dist/backend.mjs`，externals 仅原生模块，
经 extraResources 落 `resources/node_modules/`，ESM 向上解析可达）+ 包内 Electron 二进制以 node
模式执行（`ELECTRON_RUN_AS_NODE=1`，ABI 天然一致）**。实测：打包 app 启动 → boot mode=prod →
healthz HTTP 200 → 后端日志落 `userData/logs/backend.log`。
