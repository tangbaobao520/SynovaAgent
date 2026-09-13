---
状态: implemented
日期: 2026-09-13
决策: 修 **F3 打包态渲染层断链（跨平台 P0）**——不关 renderer 沙箱，改用 Electron 官方推荐的 `webPreferences.additionalArguments` 把 `serverUrl` 透传给沙箱 preload（沙箱内 `process.argv` 可用），`electron/preload.cjs` 不再 `require('./config.json')`；并在 `electron/main.cjs` 增**启动自检**：窗口 `did-finish-load` 后执行渲染层探针断言 `window.electronAPI` 存在，输出 `[preload-check] OK/FAIL`。同步修正 D713 发布物证据里 1-4 的判据（pass → **fail**：能开窗 ≠ UI 可用），并撤回一条我自己的无效判据。
理由: 打包态 Electron 默认 `sandbox: true`，沙箱 preload 只能 require 白名单模块（electron/events/timers/url）——相对文件 require 会抛 `module not found`。于是 `electron/preload.cjs:18` 的 `require('./config.json')` 在打包态抛错 → `contextBridge.exposeInMainWorld` 从未执行 → `window.electronAPI === undefined` → 渲染层 `getApiBase()` 退化为 `''` → 请求打到 `file://` 被 CSP(`connect-src localhost`) 全拦 → 通知/LLM 配置/信号/动作全 `Failed to fetch`。**窗口能开、进程/healthz 全绿，但 UI 完全不可用**——既有验收四断言（进程/窗口/healthz/日志）在断链时全绿，故该缺陷对既有门禁不可见（M3：契约从未被断言 + 安灯缺失）。Win 侧 D712 重验独立发现（F3）并提示跨平台，Mac 侧由 CTO 交叉确认。
---

## 一、证据链

| 环节 | 证据 |
|---|---|
| 源码（改前） | `electron/main.cjs:76-80` 未设 `sandbox`（Electron≥20 默认 true）；`electron/preload.cjs:18` `require('./config.json')` |
| Win 侧原始错误 | `Unable to load preload script: …app.asar\electron\preload.cjs` / `Error: module not found: ./config.json`（source: `node:electron/js2c/sandbox_bundle`）；渲染层 `[useNotifications] fetch failed`、`[llm-config] 请求失败` |
| Mac 侧结构确认 | 包内 asar 同时含 `electron/preload.cjs` 与 `electron/config.json`（require 目标存在，故失败原因是沙箱而非缺文件） |
| 修复后功能验证 | 应用启动日志：`[preload-check] OK: electronAPI 已暴露, serverUrl=http://localhost:18790`（自证，非推断） |
| 回归网 | `npx vitest run tests/electron/` → 12 文件 / 167 用例全过 |

## 二、我自己犯的两个错（如实记录）

1. **首个判据无效**：我用「应用 backend.log 中渲染层 API 请求 = 0 条」作为断链证据。做校准实验时自打 `/health`(200) 与 `/healthz`(401)，日志**同样零记录** → 该后端不记录请求级日志，判据不成立 → **撤回该证据**（改用源码结构 + 应用启动自检）。
2. **D713 证据把 1-4 判成 pass 过早**：当时只验到「窗口/进程/healthz」，我已在证据里写明视觉未确认，但仍给了 pass。现按事实改为 **fail**，并把「能开窗 ≠ UI 可用」写进结论。

## 三、边界与后续

- **不采用 `sandbox: false`**：那是省事解法，会削弱渲染层隔离；本修复保持沙箱开启。
- **启动自检是长期哨兵**：`[preload-check]` 使「窗口绿但 UI 死」这类缺陷可被观测（补上既有验收的盲区）；后续可把它接进 CI 冒烟。
- **x64 包仍不可信**（本次实测）：`beforePack` 每次构建只调用一次，而 x64/arm64 需要各自的 native 模块 → x64 包内仍是 arm64 模块。修法＝把 native 准备移到**每架构都会调用**的 `afterPack`（并在其中加架构一致性断言）。**当前结论：arm64 可信，x64 待修**（已登记）。
- **cockpit 路由打包缺失**（P1）：打包态 `routes/cockpit` 报 `FileNotFoundError: …/scripts/control-tower/generate-dashboard.py`（脚本未打包）→ 需补 extraResources 或显式降级。
