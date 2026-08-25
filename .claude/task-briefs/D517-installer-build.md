# D517: L1-A 安装包可产出（验证点 1-1）

> spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D517-installer-build-20260824.md（b439c388 定稿）
> 基线: main af8219e2（含 D504 ea89dee9）。slice: L1-A，串行第一棒。

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
L1 交互层桌面端分发形态。已有 electron/（主进程+backend-spawn）+ electron-renderer/ + build-synova.cjs（D504 骨架）。本任务=补齐打包链最后一环：mac zip target + CI 构建 job + 产物物理断言 + 构建链契约文档。不新增运行时产品代码。grep 桌面打包关键词：build-synova/electron-builder 仅存在于 build-synova.cjs / package.json scripts / tests/electron/desktop-build.test.ts——无冲突，纯扩展。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
业界: electron-builder 官方模式——config 文件 + mac dmg+zip 双 target（zip 供 CI artifact 与解包验证，VS Code 等桌面应用 CI 矩阵标准做法）。Anthropic 基线: 机器可验契约（产物存在性+大小+CI 绿，非人肉口述）。memory: D510 F1——静态 grep 配置冒充实测被审计判 F1，本任务 Done 全部物理命令断言。参考：electron-builder 官方 + Anthropic 机器可验 + 第一性原理 + 结论：三层证据（本地产物 / CI artifact / 测试断言）。

## Q2: 范围 — 正确的最简方案
做什么：
- build-synova.cjs
- .github/workflows/desktop-build.yml
- tests/electron/desktop-build.test.ts
- docs/synova/runbooks/desktop-build.md
- task-state/D517.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D517-installer-build-20260824.md
- docs/synova/coordination/切片A总览-L1-D517-D519-20260824.md
- electron-renderer/src/hooks/useConversation.ts （同根因第二处存量 tsc 红: sendMessage(text, mentions) 双参但 useStreaming 单参且后端 consult 无 mentions 字段、本 hook 零消费者——签名收敛单参，非静默丢参）
- electron-renderer/src/lib/api.ts （实现期发现的存量阻塞: window.electronAPI 双重全局类型声明冲突 → electron-renderer npm run build 在 main 即红 → DS1/DS3 物理不可能。最小修复=复用 ipc/bridge.ts 的 ElectronAPI 单源，运行时零改动。D333 技术自决，交付报告标注）
不做什么：
- 不改 src/ 下任何生产代码（如 src/routes/healthz.ts）
- 不改 electron/main.cjs 与 electron/backend-spawn.cjs（D518 领地）
- 不改 scripts/audit/audit-runner.sh（K3 专属红线）
- 不改 scripts/pre-commit-check.sh（本任务不动门禁）
- 不做 publish 自动更新（build-synova.cjs 注释态 Phase 2）
- 不做 Win 本机实测（归切片 B D521）
- 不加 Linux CI job（存量 AppImage 配置保留）

## Q3: 验收 — 入口 → 交互 → 结果
入口: `npx electron-builder --config build-synova.cjs --dir`（本地）/ push main（CI workflow_dispatch 也可）。
处理: 构建链三步——①root `npm ci && npm run build`（tsc→dist/src/index.js）②`cd electron-renderer && npm ci && npm run build`（vite→dist/renderer）③`npx electron-builder --config build-synova.cjs [--dir]`→release/。顺序错=空包（extraResources 引用 dist/dist/renderer）。
结果: release/mac/SynovaAgent.app 物理存在 + du -sm > 100 + full 构建产 *.dmg+*.zip + CI artifact 可下载（合并后验证）。

## 架构层: L1
L1 交互层（Electron 打包=分发形态）。零跨层——构建配置不 import 任何层；CI 属工程基建非运行时代码。

## Done 标准: 物理命令断言（D510 F1——禁 grep 冒充实测）
- [ ] DS1: npx electron-builder --config build-synova.cjs --dir 后 test -d release/mac/SynovaAgent.app 且 du -sm > 100，echo D517-DS1-PASS
- [ ] DS2: npx vitest run tests/electron/desktop-build.test.ts exit 0 全绿
- [ ] DS3: full 构建 --mac 产 release/*.dmg + *.zip；CI job 绿+artifact 可下载（合并后补证据）
- [ ] DS4: 构建链三步契约写入 build-synova.cjs 头注释 + docs/synova/runbooks/desktop-build.md
- [ ] DS5: git diff --name-only ssh/main...HEAD 全部在 Q2 写集内（写集外零改动）
- [ ] DS6: task-state/D517.json 回填 impl + evidence（DS1 产物 ls+du 原文）
