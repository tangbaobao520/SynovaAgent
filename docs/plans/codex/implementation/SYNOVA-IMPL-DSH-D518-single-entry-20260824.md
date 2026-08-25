---
north-star:
  服务用户: FDE——只会"双击安装→双击打开"，命令行是劝退墙
  服务场景: FDE 装完 SynovaAgent，双击图标即进首诊页；开发者另有标注清晰的开发模式入口
  模块终态: 唯一用户路径"双击装→开窗即用"（main.cjs 生产引导: ensureBackend 自起后端 + loadFile renderer）；npm run dev 降为显式开发模式
  对齐北星: PRODUCT-BRIEF §二（FDE 缺工具不缺命令行）+ §六 P0
  完成标准: 打包产物启动后 GET /api/healthz 200 且窗口加载 renderer（进程+日志物理证据）；dev 路径文档化；ensureBackend 在 main.cjs 有真实调用点（grep+运行双证）
  当前进度: D504 已实现 dev/prod 双分支引导（main.cjs:126 whenReady 集成 ensureBackend，**已在 main，D504 审计 CP**）；缺口=模式判定显式化、SERVER_URL 收敛说明、链路图、dev runbook、契约回归测试补强
---

<!--
  SYNOVA-IMPL-DSH-D518: L1-A 安装引导单一入口（验证点 1-5）
  状态: dev doc | 2026-08-24 | 优先级 P1 | slice: L1-A
  权威: 派单-L1切片A §D518（4 必答题）+ PRODUCT-BRIEF §二 + AGENTS.md 铁律 0-2/4/24/31
  依赖: D504 已合入 main（ea89dee9，ensureBackend/main.cjs:126 集成）；D517（产物形态 resources/renderer + dist）
  并行: 无（串行第二棒；electron/main.cjs 本任务独占）
-->

# D518: L1-A 安装引导单一入口（1-5）

> 一句话问题: 现在存在两条引导路径——开发引导（npm run dev 起后端 + vite 起渲染）与生产引导（安装包 spawn 后端 + loadFile renderer）——没有收敛声明、没有链路图、没有物理 WIRE 证明，验证点 1-5 无法判 verified。

## 1. Authority Doc Verification

- **派单**: `docs/synova/coordination/派单-L1切片A-D517-D519-20260824.md` §D518（4 必答题）
- **产品北星**: `.claude/PRODUCT-BRIEF.md` §二（FDE 是直接用户）+ §六 P0
- **审计基线**: `docs/synova/audit-reports/2026-08-23-D504-D505.md`（backend-spawn.cjs 契约 8 用例 25/25、main.cjs 集成属实；F4 注释漂移"dist/index.js"→实为"dist/src/index.js"待同步——D518 实现后已演进为 prod 契约 `dist/backend.mjs`，见 §4）
- **铁律**: AGENTS.md 铁律 0-2（WIRE CHECK 硬门禁）/ 4（入口→交互→结果）/ 24+31（降级显式传播）

## 2. Problem Statement

D504 已把双分支引导写进 main.cjs（dev: vite 5173 热更新→回退 SERVER_URL 登录页；prod: ensureBackend spawn 包内 Electron 二进制（node 模式，`ELECTRON_RUN_AS_NODE=1`）跑 `dist/backend.mjs` + `loadFile(resources/renderer/index.html)`——D518 实现后 prod 契约为包内 Electron node 模式跑 dist/backend.mjs，见 §4），但：① 模式判定靠 `app.isPackaged` 隐式区分，无显式开发模式标记与文档；② SERVER_URL 固定 config.json localhost:18790，spawn vs 外连语义无说明；③ ensureBackend 被 main.cjs 调用的 WIRE 只有代码无运行证据；④ F4 注释漂移未修。本任务=收敛声明+显式化+物理验证。

## 3. Q0-Q4

**Q0 拼图**: L1 交互层引导逻辑。扩展 D504 交付（非重写）。复用 electron/backend-spawn.cjs 契约（ensureBackend/probeOnce/buildCommand 已导出）。
**Q1 调研**: 业界=Electron 官方 `app.isPackaged` 是 dev/prod 判定标准做法（vs 手工 env var——显式 env 仅供测试覆盖注入）；Anthropic=fail-closed（探活失败→degraded 离线页，不静默）；开源实证=VS Code main 进程同款 spawn+探活模式。**参考: Electron 官方 + Anthropic fail-closed + 第一性原理（一条用户路径，一条开发者路径，判定只用一个事实源 app.isPackaged）+ 结论：保持 isPackaged 判定 + SYNova_ELECTRON_* env 仅测试注入。**
**Q2 范围**: 做什么——模式显式化日志、F4 注释同步、dev-mode runbook、链路图、WIRE 运行证据、backend-spawn 契约回归补强。不做什么——src/（后端端口/配置零改动）、改 config.json 的 serverUrl 语义（保持 localhost:18790，本机 spawn 契约）、多实例锁（单实例 singleInstanceLock 可做但归切片 B D521 前，本任务 descope）、自动更新。
**Q3 验收**: 入口=安装包双击（prod）/ `npm run electron:dev`（dev，文档标注）；处理=whenReady→ensureBackend→探活/spawn→createWindow 分支加载；结果=prod: 窗口加载 renderer + healthz 200（进程+日志证据）；dev: vite 5173 或登录页。
**Q4 契约与测试**: 见 §7。

## 4. Current State（2026-08-24 实测，main ea89dee9——D504 已合入）

- `electron/main.cjs`（D504 版）: whenReady 中 `ensureBackend({ serverUrl: SERVER_URL, cwd: isProdBoot ? process.resourcesPath : process.cwd(), mode: isProdBoot?'prod':'dev', dbPath: userData/data/synova.db, logFile: userData/logs/backend.log })`；degraded → console.error（不静默）；createWindow 分支: isProd→loadFile(resources/renderer/index.html)；dev→5173→SERVER_URL 登录页→离线页。
- `electron/backend-spawn.cjs`（156 行）: 导出 ensureBackend/buildCommand/probeOnce；探活 GET /api/healthz（src/routes/healthz.ts:323 实测存在）；reused 语义=已有健康服务不重复 spawn（端口冲突安全网）；maxRestarts 3/10min；stop() SIGTERM 回收。
- `electron/config.json`: `{"serverUrl":"http://localhost:18790","pollInterval":300000}`。
- `src/config.ts:90`: `process.env.SYNOVA_DB_PATH ||`——prod spawn 注入 userData 路径的消费者（实测存在）。
- 缺口: ① main.cjs 启动时无 `[electron] mode=dev|prod` 显式日志；② F4 注释漂移（"dist/index.js"→"dist/backend.mjs"，D518 实现后 prod 契约=包内 Electron node 模式）在 backend-spawn.cjs 注释与 main.cjs 注释；③ 无 dev/prod 双路径 runbook；④ 无 WIRE 运行证据模板。

## 5. What We Build

### 5.1 写集 (3 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| electron/main.cjs | 修改 | ①whenReady 起始加 `console.log('[electron] boot mode=' + (isProdBoot?'prod':'dev') + ' server=' + SERVER_URL)`（模式显式化，日志即证据）；②F4 注释同步: 注释中 `dist/index.js` → `dist/backend.mjs`（与 backend-spawn buildCommand prod 契约一致）；③before-quit stop 回收**已在 main**（实测 electron/main.cjs:186-190）——本任务不改，仅 WIRE 回归断言（见 §8） |
| electron/backend-spawn.cjs | 修改 | **D518 三项 prod 运行时修复**（0a4d2962，实测 origin/main:70/172）: ①buildCommand('prod') = `{ bin: process.execPath, args: ['dist/backend.mjs'] }`（包内 Electron 二进制以 node 模式跑 esbuild 单文件 bundle——FDE 零 Node 前提，替代旧 prod 契约）；②ensureBackend prod 分支注入 `env.ELECTRON_RUN_AS_NODE = '1'`（:172）+ `SYNOVA_DB_PATH`（src/config.ts:90 消费）；③spawnOnce stdio 修复（无 logFile 时 inherit 防 64KB 管道缓冲死锁，7c040315）；F4 注释同步为 `dist/backend.mjs` |
| tests/electron/backend-spawn.test.ts | 修改 | 补 2 用例: ①prod 模式 buildCommand 断言 `prod.bin === process.execPath` + `prod.args === ['dist/backend.mjs']`（backend-spawn.test.ts:234-235 实测定案，锁 prod 契约，防注释漂移回归）；②ensureBackend reused 路径再注入假健康服务（command 注入）断言 `{started:false,reused:true}`（端口冲突安全网回归） |
| docs/synova/runbooks/desktop-dev-prod.md | 新建 | 双引导收敛声明: 用户唯一路径=安装包双击（链路图: 双击→main.cjs whenReady→ensureBackend(prod)探活/spawn 包内 Electron node 模式跑 dist/backend.mjs（ELECTRON_RUN_AS_NODE=1, SYNOVA_DB_PATH=userData）→loadFile resources/renderer/index.html→首诊页）；开发路径=`npm run dev`（后端 tsx）+ `cd electron-renderer && npm run dev`（vite 5173）+ `npm run electron:dev`（标注"仅开发"）；spawn vs 外连语义（本机 spawn 优先，reused 兜底已跑实例）；SERVER_URL 收敛说明（config.json 单源，prod 本机实例同端口） |

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 改 src/config.ts / 端口 / config.json 语义 | src/ 红线；18790 单源已收敛 |
| 重写 backend-spawn.cjs 逻辑 | K3 审计 CP 契约，仅注释修复 |
| singleInstanceLock 单实例锁 | 切片 B 前置项，本任务 descope |
| GS-01 断言改动 | 首诊后端链路已绿，不动 |
| Win 侧行为 | D521 |

## 7. Test Requirements

**契约（铁律 47，沿用 D504 JSDoc）**: ensureBackend(options) → {started,pid?,reused?,degraded?,error?,stop}；全捕获不抛；degraded 显式。

| 层 | 用例 | red 前提 |
|:---|------|------|
| L1 单元 | buildCommand('prod') → `{ bin: process.execPath, args: ['dist/backend.mjs'] }`（断言 `prod.bin === process.execPath` + `prod.args === ['dist/backend.mjs']`，锁 prod 契约事实；backend-spawn.test.ts:234-235 实测定案） | 当前测试未锁——改错路径会静默通过 |
| L1 单元 | reused 路径回归（健康服务注入→不 spawn） | D504 已有（回归确认，非 red） |
| L2a 接线 | grep `ensureBackend` electron/main.cjs ≥1 调用点（whenReady 内）+ 运行证据: dev 模式 `npm run electron:dev` 启动后日志含 `[electron] boot mode=dev`（截图/日志原文落 task-state evidence） | main.cjs 未加模式日志前红 |
| L2b 降级 | 注入坏 command（bin:不存在的解释器）→ ensureBackend 返回 degraded:true + error 非空（D504 已有 8 用例之一，回归） | 已覆盖（回归确认） |
| L2c 边界 | maxRestarts 超限 → degraded 且子进程被 kill（无孤儿） | D504 已有（回归确认） |

**verify 命令**:
```bash
npx vitest run tests/electron/backend-spawn.test.ts
grep -n "ensureBackend(" electron/main.cjs | grep -v require   # ≥1 生产调用点
npm run electron:dev & sleep 8 && grep "boot mode=dev" ~/Library/Logs 2>/dev/null || true   # 以终端日志原文落 evidence
```

## 8. Wiring Verification

| 变更 | 生产调用点（实测方法） |
|------|------|
| ensureBackend（backend-spawn.cjs 导出） | `grep -n "ensureBackend(" electron/main.cjs` → whenReady 真实调用（非 import 即算）；运行 `npm run electron:dev` 后终端出现探活/spawn 日志 = 运行态 WIRE 证据 |
| backendHandle.stop() | `grep -n "stop" electron/main.cjs` → before-quit 挂钩 |
| runbook | 切片 A 总览 §二依赖图 + 派单 D518 §4 链路图引用 |

## 9. Architecture Layer

L1 交互层（Electron 主进程引导）。backend-spawn 经 HTTP /api/healthz 探活 L1 API，不触 L2+ 内部——零跨层（K3 D504 审计第 4 项同口径）。

## 10. Completion Standard

1. **DS1**: `grep -n "ensureBackend(" electron/main.cjs` ≥1 生产调用点 + `npm run electron:dev` 运行日志含 boot mode/spawn 证据（grep+运行双证，静态 grep 单独不算完成——派单加粗要求）
2. **DS2**: `npx vitest run tests/electron/backend-spawn.test.ts` 全绿（≥10 用例含新增 2）
3. **DS3**: F4 注释漂移修复——`grep -n "dist/index.js" electron/*.cjs` 零结果（全部为 dist/backend.mjs）
4. **DS4**: runbook 落地——desktop-dev-prod.md 含链路图（双击→spawn→开窗→首诊页）+ dev 路径标注"仅开发"
5. **DS5**: 打包产物（D517 --dir 产物）启动后 `curl localhost:18790/api/healthz` 200 且日志含 `mode=prod`（与 D519 实测可合并执行，evidence 共享）
6. **DS6**: 写集外零改动 + task-state/D518.json 回填 impl + evidence（日志原文）

> DS1-DS6 逐项标注，禁静默缺项（S-10）。

## 11. Auth Doc References

- docs/synova/coordination/派单-L1切片A-D517-D519-20260824.md
- docs/synova/coordination/切片A总览-L1-D517-D519-20260824.md
- .claude/PRODUCT-BRIEF.md（§二/§六）
- docs/synova/audit-reports/2026-08-23-D504-D505.md（F4 + 契约核验）
- AGENTS.md（铁律 0-2/4/24/31/47/48）

## 12. 自检清单（dev-doc 侧，K3 可核）

- [x] 派单 4 必答题逐条覆盖（①双路径差异盘点=§4 ②收敛策略=Q1/Q2+写集① ③spawn 契约+WIRE=§4+§8+DS1 ④开窗即用链路图=写集 runbook+DS4）
- [x] ensureBackend 被 main.cjs 真调用已实测（main.cjs:126，非凭文档推断——D381 接线纪律）
- [x] before-quit stop 已实测在 main（:186-190）——写集表述改为"回归断言"，不虚列修改项
- [x] F4 注释漂移定位精确（backend-spawn.cjs 注释 + main.cjs 注释，逻辑零改动——K3 CP 契约不碰）
- [x] 写集 4 条目；不重写已审计代码；不碰 src/、GS-01
- [x] gatekeeper exit 0（C1-C6）
- [x] 依赖声明: D504 前置完成；D517 产物形态先行
