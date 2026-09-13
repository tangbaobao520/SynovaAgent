# Task Brief: D714 f3-preload-sandbox-renderer-api-fix

> 生成: 2026-09-13 | 任务: D714 | 认领: 主 CTO（synova-cto）
> 参考: 铁律 11/24（不静默降级）/ 铁律 48（测试非空壳）；上游发现＝Win 侧 D712 重验 F3 + Mac 侧交叉确认

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
桌面端打包态**渲染层断链**修复（跨平台 P0）。窗口能开、后端能起、healthz 200，但 UI 用不了：
打包态 Electron 默认 `sandbox: true` → 沙箱 preload 不允许 `require` 相对文件 → `electron/preload.cjs:18`
的 `require('./config.json')` 抛 `module not found`（Win 侧抓到原始错误，source=`node:electron/js2c/sandbox_bundle`）
→ `contextBridge.exposeInMainWorld` 从未执行 → `window.electronAPI === undefined` →
渲染层 `getApiBase()` 退化为 `''` → 请求打到 `file://` 被 CSP 全拦 → 通知/LLM 配置/信号/动作全部 `Failed to fetch`。
### b) 文件审计（实测）
- `electron/main.cjs:76-80`（改前）webPreferences = { preload, contextIsolation, nodeIntegration }，**未设 sandbox**（Electron≥20 默认 true）
- `electron/preload.cjs:18`（改前）`const config = require('./config.json')`；用途仅 `config.serverUrl`（`electron/config.json` = { serverUrl, pollInterval }）
- 既有验收盲区：`scripts/desktop/win-install-verify.ps1` 四断言（进程/窗口/healthz/日志）在渲染层断链时**全绿**
- 我的首个判据（backend.log 零 API 请求）**实测无效**：自打 `/health`(200)/`/healthz`(401) 也零记录 → 该判据已撤回，改用应用启动自检
### c) 决策
不关闭 renderer 沙箱（保持安全姿态）。改用 Electron 官方推荐做法：主进程经 `webPreferences.additionalArguments`
把 `serverUrl` 透传给沙箱 preload（沙箱内 `process.argv` 可用）；preload 不再 require 相对文件。
并新增**启动自检** `[preload-check]`（渲染层探针断言 electronAPI 存在）——把"窗口绿≠可用"这一盲区变成可观测信号。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- Electron 官方：沙箱化 preload 只能 require 白名单模块（electron/events/timers/url），相对文件 require 会抛错；
  向沙箱 preload 传数据的推荐方式＝`webPreferences.additionalArguments` + `process.argv`（本修复采用）。
- memory 教训：M3（机制建成未接线——preload 契约从未被任何验收断言覆盖）；M2（声称 vs 事实——
  "窗口/进程/healthz 全绿"曾被当作"能打开即能用"）。安灯（andon）：自检信号缺失＝问题不可见。
### 参考：Electron 沙箱 preload 文档 + 第一性原理（契约必须被断言，而非被假设）→ additionalArguments + 启动自检

## Q2: 范围 — 正确的最简方案
做什么：
- electron/preload.cjs — 去掉 `require('./config.json')`，改从 `process.argv` 读 `--synova-server-url=`，缺省回退默认值（dev/测试行为不变）
- electron/main.cjs — webPreferences 增 `additionalArguments`（透传 serverUrl）；窗口 `did-finish-load` 后执行渲染层探针，输出 `[preload-check] OK/FAIL`
- docs/synova/product-lines/evidence/D713-published-artifact-20260913.json — **修正 1-4 判据**（pass → fail：能开窗 ≠ UI 可用）
- docs/synova/coordination/board-backlog.json — 登记 F3(P0)/cockpit 脚本未打包(P1)/win 脚本挂起(P1)/证据 log 被 gitignore(P1)/派单文档未入 main(P2)
- .claude/task-briefs/2026-09-13-D714-f3-preload-sandbox-renderer-api-fix.md — 本 brief
- memory/notes/implemented/2026-09-13-f3-preload-sandbox-and-startup-probe.md — 四态 Note（铁律 49）
- task-state/D714.json — 状态登记
不做什么：
- 不改 src/sentinel/runner.ts（与本次无关）
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 .github/workflows/ci.yml（D708/#505 在途，避免撞车）
- 不关 renderer 沙箱（不采用 sandbox:false 的省事解法）

## Q3: 验收 — 入口 → 交互 → 结果
入口：安装 arm64 包 → 启动应用
处理：窗口加载后自检渲染层 `window.electronAPI`
结果：日志出现 `[preload-check] OK: electronAPI 已暴露, serverUrl=http://localhost:18790`

## 架构层: 基础设施（Electron 桌面壳，L1 品牌表层，施工图 §3 🟢 死守域）
不触 L2-L5；仅 electron/ 主进程与 preload 契约

## Done 标准:
- [ ] 打包态启动日志含 `[preload-check] OK: electronAPI 已暴露`（本机实测已通过）
- [ ] `node --check electron/main.cjs && node --check electron/preload.cjs` → exit 0
- [ ] `npx vitest run tests/electron/` → 12 文件 / 167 用例全过（本机实测已通过）
- [ ] 产物内 preload 不含 `require('./config.json')`：`npx asar extract <app.asar> /tmp/x && grep -c "config.json" /tmp/x/electron/preload.cjs` 仅注释命中
