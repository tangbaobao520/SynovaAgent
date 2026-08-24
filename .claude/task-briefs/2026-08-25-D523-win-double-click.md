# Task Brief — D523 L1-B Windows 双击安装启动出窗

> 权威 spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D523-win-double-click-20260825.md（冲突以 spec 为准）

## Q0: 定位 — 项目拼图 + 文件审计
L1 桌面端 Win 侧验证基建。scripts/desktop/ 不存在 → 新建（与切片 A D519 共享目录，串行零冲突）。
复用 D522 服务自启链（backend-spawn + main.cjs）。文件审计: 无重复覆盖 → 新建。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
Windows 桌面验证用 PowerShell 原生 cmdlet（Get-Process/MainWindowTitle/Invoke-WebRequest/Get-FileHash）——Mac 侧 D519 pgrep/osascript/curl/md5 同构映射。
Anthropic = 机器可验契约（进程/窗口/URL 三断言是物理事实）。memory: D510 F1（禁 grep 冒充）+ DS4（禁伪造实测）+ 铁律 0-3 严禁 taskkill /IM node.exe。
### Q1c 决策参考系
参考：Anthropic/DeepSeek/第一性原理 + 结论: .ps1 四断言 + evidence 落盘 + founder-demo checklist；前置缺失 exit 2 waiting 不伪造。

## Q2: 范围 — 正确的最简方案
做什么：新建 scripts/desktop/win-install-verify.ps1（七步: 前置检查→静默安装→启动→60s 四断言→evidence 落盘→清理→失败路径）、docs/synova/runbooks/founder-demo-win.md（4 步 checklist）、tests/electron/win-install-verify.test.ts（静态契约断言，不替代本机实跑）。
不做什么（含文件路径）：不改 src/、不改 electron/main.cjs、不改 electron/backend-spawn.cjs（D522 领地）、不改 build-synova.cjs（D517 领地）、不做 Mac 侧实测（D519）、CI 不跑安装实测、不引 DSH 依赖、不伪造实测（前置缺失即 waiting）。

## Q3: 验收 — 入口 → 交互 → 结果
入口：`powershell -File scripts/desktop/win-install-verify.ps1`（Win 本机；切片 A .exe 就绪后实跑）
处理：前置检查（release/*.exe + md5）→ NSIS /S 静默安装 → 启动 SynovaAgent.exe → 60s 轮询四断言（进程/窗口/healthz/后端日志）→ evidence 落盘 → Stop-Process 本实例 pid 清理
结果：exit 0=四断言全过；1=任一断言失败；2=前置缺失 waiting。当前 .exe 未落地 → exit 2 waiting，不伪造。

## 架构层: L1
纯验证脚本，零跨层，只调 PowerShell cmdlet + 探活后端 URL。

## Done 标准
1. win-install-verify.test.ts 静态断言全绿（脚本存在+四断言关键字+参数分支+exit 语义+无 taskkill /IM node.exe）
2. founder-demo-win.md 4 步 checklist 每步含命令+预期+证据落点
3. 前置依赖显式闭环: .exe 缺失 → waiting + task-state 记录，不伪造（DS4）
4. 写集外零改动（git diff --name-only 对账）
5. task-state/D523.json 回填 impl + waiting 状态
