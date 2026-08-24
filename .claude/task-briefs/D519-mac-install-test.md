# D519: L1-A Mac 安装包实测（验证点 1-3）

> spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D519-mac-install-test-20260824.md（b439c388 定稿）
> 基线: D518 impl 之后（feat/slice-a-d517-d519）。slice: L1-A，串行第三棒。

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
L1 桌面端验证基建。scripts/desktop/ 已有 build-backend.sh（D518 补充提交创建），本任务新建 mac-install-verify.sh 同目录。复用 D517 构建链产物（release/*.dmg）与 D518 入口收敛（boot mode 日志/healthz）。实测脚本只消费产物+HTTP 探活+进程/窗口断言，零跨层。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
业界: macOS 官方工具链 hdiutil 挂载 + cp -R /Applications + open + osascript System Events 进程/窗口断言（macOS 自动化 smoke test 标准做法）。Anthropic: 机器可验 + 证据原文落盘（不转述）。memory: D510 F1——静态 grep 冒充实测被审计判 F1，本任务全部物理命令断言。参考: macOS 官方工具链 + Anthropic 机器可验 + 第一性原理 + 结论: 四断言脚本化（文件落盘+进程存活+窗口存在+服务健康）。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/desktop/mac-install-verify.sh
- docs/synova/runbooks/founder-demo-mac.md
- tests/electron/mac-install-verify.test.ts
- .gitignore
- task-state/D519.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D519-mac-install-test-20260824.md
不做什么：
- 不改 electron/main.cjs 与 electron/backend-spawn.cjs（D518 已收敛，本任务纯验证侧）
- 不改 src/routes/healthz.ts（src/ 红线）
- 不做 Win 侧实测（1-2 归切片 B D521）
- 不改 scripts/audit/run-auditor.sh（K3 专属红线）
- 不在 CI 跑安装实测（macOS runner 无交互 GUI 会话，osascript 窗口断言不可靠——CI 只构建 D517）
- 不做公证/签名验证（随 D517 descope，runbook 记录右键打开）

## Q3: 验收 — 入口 → 交互 → 结果
入口: bash scripts/desktop/mac-install-verify.sh（支持 --dry-run/--skip-build/--keep-data）。
处理: 构建 dmg（除非 --skip-build）→ ls+md5 落 evidence → hdiutil 挂载 → cp /Applications → open → 60s 轮询四断言（pgrep 进程/osascript 窗口/curl healthz/backend.log 非空）→ evidence 落盘 → 清理（kill+detach+删 app，userData 默认同删）。
结果: exit 0=四断言全过 / 1=任一断言失败 / 2=前置缺失（dmg/工具）。evidence/D519-mac-<date>/ 六类文件齐。

## 架构层: L1
L1 交互层验证基建（不进运行时链路）。脚本只消费产物+HTTP 探活，零跨层。

## Done 标准: 物理命令断言（非模拟）
- [ ] DS1: bash scripts/desktop/mac-install-verify.sh 退出码 0——四断言全过（进程+窗口+healthz+日志非空），物理实测
- [ ] DS2: evidence/D519-mac-*/ 含 dmg-ls.txt、md5.txt、mount.log、backend.log、window.txt、install.log 原文；关键摘录回填 task-state/D519.json
- [ ] DS3: npx vitest run tests/electron/mac-install-verify.test.ts 全绿（脚本契约静态断言）
- [ ] DS4: docs/synova/runbooks/founder-demo-mac.md 4 步 checklist 每步含命令+预期+证据落点
- [ ] DS5: 幂等复跑通过（连续两次 exit 0，第二次走清理路径）；--dry-run 输出步骤清单
- [ ] DS6: 双平台验收口径落档: Mac=DS1 实测 + Win=D517 CI artifact（URL 进 task-state，合并后补）
- [ ] DS7: git diff 写集外零改动 + scripts/audit/ 零触碰
