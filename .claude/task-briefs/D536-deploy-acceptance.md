# D536: 部署轨——桌面端实际部署验收（deploy-acceptance）

> spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D536-deploy-acceptance-20260826.md
> 派单: docs/synova/coordination/派单-部署轨-D536-20260826.md。slice: deploy-acceptance，Track A 部署轨（最高优先级）。
> 前置: 切片 A/B/C 产物（CI artifact run 32870900391，expired:False——API 实测）+ 验证脚本 4 个 + runbooks（origin/main 实测存在）。

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
L1 桌面端部署验收（Track A 部署轨）。消费切片 A/B/C 产物：CI artifact（macOS dmg 1040MB / Windows exe 215MB，API 实测可下载）+ 验证脚本 4 个（mac-install-verify.sh/win-install-verify.ps1/upgrade-data-verify.sh/first-diagnosis-timing.sh，origin/main 实测存在）+ runbooks 6 个（founder-demo-mac/win 等）。本任务零产品代码改动——复用既有验证脚本，补 CI artifact 下载校验 + 真实安装实测 + 部署验收记录（evidence + checklist 完成态）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
业界: GitHub Actions artifact 分发 + checksum 校验是安装包分发标配（artifact 下载 → md5/sha256 → 目标机安装 → 启动断言 → 证据留存）。Anthropic: 机器可验契约（物理断言非口述）+ fail-closed（无目标机 → 如实 waiting 不伪造）。memory: D510 F1（禁静态 grep 冒充实测）+ D523 DS4（无 .exe 时 waiting 不伪造——本单 Win 无目标机同处理）+ D528 DS2（无 dmg 时 --dry-run 不伪造——本单有 dmg 必须真实跑）+ D519 实跑踩坑（ELECTRON_RUN_AS_NODE 显式 unset、dmg 卷名解析）。参考: GitHub Actions artifact + checksum（业界标准）+ Anthropic（物理断言/不伪造）+ 第一性原理（"装上了"= 进程+窗口+健康+数据四类物理事实）+ 结论: 复用 4 脚本，只补 artifact 下载校验 + 部署验收记录。

## Q2: 范围 — 正确的最简方案
做什么：
- docs/synova/runbooks/founder-demo-mac.md
- docs/synova/runbooks/founder-demo-win.md
- docs/synova/runbooks/desktop-deploy-acceptance.md
- scripts/desktop/mac-install-verify.sh
- scripts/desktop/win-install-verify.ps1
- task-state/D536.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D536-deploy-acceptance-20260826.md
不做什么：
- 不改 src/ 任何文件（派单红线，本单只消费产物）
- 不改 scripts/audit/run-auditor.sh（K3 专属红线）
- 不改 scripts/build-synova.cjs（构建链已闭环，本单用既有 CI artifact）
- 不新建验证机制（复用 4 脚本；实测暴露缺口才微调，spec §5 注明）
- 不做签名/公证/notarize（切片 A descope，如实写进部署指引）
- Win 无目标机时不伪造实测（D523 DS4——GUI 未配置 dsh-ssh 主机 → Win 侧如实 waiting）

## Q3: 验收 — 入口 → 交互 → 结果
入口: CI artifact 下载（run 32870900391，token 从 ~/.dsh/.credentials.yaml 读）。
处理: ① artifact 下载 + md5 落盘；② Mac 全链实测（mac-install-verify.sh --skip-build 消费 CI dmg → A1-A4 四断言 → first-diagnosis-timing.sh --mode prod 计时 → upgrade-data-verify.sh --installer 数据断言）；③ Win 实测（win-install-verify.ps1 在 GUI 配置的 dsh-ssh Win 目标机远程执行，未配置如实 waiting）；④ 部署验收记录（evidence + founder-demo checklist 完成态 + desktop-deploy-acceptance.md runbook）。
结果: evidence 物理断言原文落盘（安装/启动/首诊/数据）+ artifact md5 落盘 + checklist 完成态 + task-state/D536.json 回填。

## 架构层: L1
L1 交互层部署验收基建（同 D519/D523/D527/D528——不进运行时链路）。脚本只消费安装包产物 + HTTP 探活 + 文件断言，零跨层。

## Done 标准: 物理命令断言（非模拟，禁"下载了 artifact"冒充"装上了"）
- [ ] DS1: CI artifact 下载 + md5 落盘（evidence/D536-artifacts-<date>/ md5.txt + 下载日志；task-state 回填）
- [ ] DS2: Mac 全链实测——mac-install-verify.sh --skip-build exit 0（A1 进程/A2 窗口/A3 healthz/A4 日志）+ first-diagnosis-timing.sh --mode prod verdict JSON + upgrade-data-verify.sh verdict: DATA_RETAINED
- [ ] DS3: Win 实测——win-install-verify.ps1 在 GUI 配置的 Win 目标机（dsh-ssh）远程执行 exit 0 + evidence 回传；未配置 → 如实 waiting 标注（D523 DS4）
- [ ] DS4: founder-demo-mac checklist 完成态（4 段每段标注 evidence 落点 + 实测日期 + 结论）；founder-demo-win 同（或标注 waiting 原因）
- [ ] DS5: 已知限制如实——未签名未公证（Gatekeeper 绕过路径已实测记录）；Win waiting 语义；LLM key 注入方式记录
- [ ] DS6: desktop-deploy-acceptance.md K3 可独立复核（每段命令 + 预期产物 + evidence 落点）；npx vitest run tests/electron/ 全绿
- [ ] DS7: git diff 写集外零改动 + scripts/audit/ 零触碰 + task-state/D536.json 回填（slice=deploy-acceptance）
