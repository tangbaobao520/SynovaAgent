# D518: L1-A 安装引导单一入口（验证点 1-5）

> spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D518-single-entry-20260824.md（b439c388 定稿）
> 基线: D517 impl 之后（本分支 feat/slice-a-d517-d519）。slice: L1-A，串行第二棒。

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
L1 交互层引导逻辑。扩展 D504 交付（非重写）: electron/main.cjs 已有 whenReady→ensureBackend→createWindow 双分支。复用 electron/backend-spawn.cjs 契约（ensureBackend/buildCommand/probeOnce 已导出）。本任务=收敛声明+模式显式化+F4 注释修复+WIRE 运行证据。grep 确认 ensureBackend 在 main.cjs:126 真实调用（非凭文档）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
业界: Electron 官方 app.isPackaged 是 dev/prod 判定标准（显式 env 仅供测试注入）。Anthropic: fail-closed（探活失败→degraded 离线页不静默）。开源实证: VS Code main 进程同款 spawn+探活。memory: D381 接线纪律——调用点必须实测非推断。参考: Electron 官方 + Anthropic fail-closed + 第一性原理 + 结论: 保持 isPackaged 判定，boot mode 日志显式化（日志即证据）。

## Q2: 范围 — 正确的最简方案
做什么：
- electron/main.cjs
- electron/backend-spawn.cjs
- tests/electron/backend-spawn.test.ts
- docs/synova/runbooks/desktop-dev-prod.md
- task-state/D518.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D518-single-entry-20260824.md
不做什么：
- 不改 src/config.ts（src/ 红线，端口/配置零改动）
- 不改 electron/config.json（serverUrl 语义保持 localhost:18790 单源）
- 不改 electron/preload.cjs（本任务无 IPC 变更）
- 不做 singleInstanceLock（切片 B 前置，spec §6 descope）
- 不改 scripts/audit/run-auditor.sh（K3 专属红线）
- 不重写 backend-spawn.cjs 既有契约逻辑（K3 已审 CP；例外: spawnOnce stdio 单行修复——运行证据实测发现 dev 模式 pipe 无读者 → 64KB 缓冲写满 → 子进程 stdout 阻塞 → 探活永不转健康。改 logFile 缺省时 inherit。契约 JSDoc 语义不变，D333 自决 + 交付报告标注）

## Q3: 验收 — 入口 → 交互 → 结果
入口: 安装包双击（prod）/ npm run electron:dev（dev，runbook 标注"仅开发"）。
处理: whenReady → console.log boot mode → ensureBackend（探活/spawn）→ createWindow 分支加载。
结果: prod: 窗口加载 renderer + healthz 200；dev: vite 5173 或登录页。日志含 [electron] boot mode=dev|prod（运行证据）。

## 架构层: L1
L1 交互层（Electron 主进程引导）。backend-spawn 经 HTTP /api/healthz 探活 L1 API，零跨层。

## Done 标准: 物理命令断言
- [ ] DS1: grep -n "ensureBackend(" electron/main.cjs ≥1 生产调用点 + npm run electron:dev 运行日志含 boot mode=dev/spawn 证据（grep+运行双证）
- [ ] DS2: npx vitest run tests/electron/backend-spawn.test.ts 全绿（≥11 用例含新增 F4 漂移回归）
- [ ] DS3: grep -n "dist/index.js" electron/*.cjs 零结果（全部为 dist/src/index.js，F4 修复）
- [ ] DS4: docs/synova/runbooks/desktop-dev-prod.md 含链路图（双击→spawn→开窗→首诊页）+ dev 路径标注"仅开发"
- [ ] DS5: 打包产物启动 healthz 200 + mode=prod（与 D519 实测合并执行，evidence 共享——spec §10 明示可合并）
- [ ] DS6: git diff 写集外零改动 + task-state/D518.json 回填 impl + evidence 日志原文
