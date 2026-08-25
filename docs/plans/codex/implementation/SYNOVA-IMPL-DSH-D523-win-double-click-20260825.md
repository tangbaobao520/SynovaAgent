---
north-star:
  服务用户: FDE（前线部署工程师）——Windows 用户，不会装 Node、不想碰命令行，双击安装包就能用
  服务场景: FDE 在 Windows 电脑上双击切片 A 打出的 NSIS 安装包 → 安装 → 双击启动 → 窗口出现 → 首诊页可达，全程零命令行
  模块终态: Win 侧"双击安装→启动→出窗→首诊可达"四层闭环，有可复现的验证脚本 + evidence（安装包 md5 + 进程/窗口断言 + healthz/首诊 URL 可达）
  对齐北星: PRODUCT-BRIEF §二（直接用户=FDE）+ §六 P0（没有 Win 侧"双击可用"不能给 FDE 用）
  完成标准: 入口=双击切片 A 的 .exe；处理=NSIS 安装→快捷方式→双击启动→main.cjs spawn 后端（复用 D522）→loadFile renderer；结果=窗口断言（进程名+窗口标题）+ healthz 200 + 首诊 URL 可达 + evidence 落盘（物理证据，非 grep 冒充——D510 F1）
  当前进度: 零——Win 侧无实测脚本、无 evidence、无 founder-demo 路径；D522 的服务自启链（backend-spawn）已就绪但 Win 侧三层（安装/启动/出窗）从未实测
---

<!--
  SYNOVA-IMPL-DSH-D523: L1-B Windows 双击安装启动出窗（验证点 1-2）
  状态: dev doc | 2026-08-25 | 优先级 P1 | slice: L1-B
  权威: 派单-L1切片B §D523（4 必答题）+ 施工图 §3.1/§4/R1 + D510 F1 教训（物理实测禁 grep 冒充）+ DS4（禁伪造实测）
  依赖: 切片 A D517 产物（NSIS .exe + md5 evidence）——见下方"前置依赖"硬约束
  并行: 无（串行 D522→D523；D522 先，D523 在切片 A 安装包落地后启动）

  ⚠️ 前置依赖（硬约束，派单 B 必答题 3）:
    前置 = 切片 A D517 的 .exe 产物存在 + md5 落 evidence。
    若无该产物 → D523 编码阶段进入 waiting，不伪造实测（DS4 教训）。
    编码阶段必须显式声明前置依赖已满足，否则退回待命（防空转）。

  借鉴红线（3 条，同 D522）:
    ① 借鉴 = 读 DSH 思路自研，不 copy、不 npm install @deepseek-ai/dsh（R1）
    ② 只借鉴 teardown（D522 已落），本 D 不借鉴任何 DSH 探活/生命周期——Win 实测是 Synova 自己的 spawn+healthz 链路
    ③ Electron 壳自研（DSH 无 Electron）
-->

# D523: L1-B Windows 双击安装启动出窗（1-2）

> 一句话问题: 「Windows 版桌面端可用」至今零实测——没有 Win 验证脚本、没有 evidence、没有 founder-demo 路径。双平台承诺的 Win 半边（进程名+窗口标题+首诊 URL 可达）完全不存在，且它的前置（切片 A D517 的 .exe）也还在收口未落地。

## 1. Authority Doc Verification

- **派单**: `docs/synova/coordination/派单-L1切片B-D522-D523-20260824.md` §D523（4 必答题 + 验收 + 前置依赖声明）
- **施工图**: `docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md` §3.1 L77（electron/ 属 🟢 死守品牌表层，继续投入自研）+ §4 L157 + R1 L322（Stage 3 前零 DSH 依赖）
- **产品北星**: `.claude/PRODUCT-BRIEF.md` §二（直接用户=FDE）+ §六 P0
- **审计教训**: D510 F1（禁止静态 grep 冒充实测）+ DS4（禁伪造实测）+ D504 F2（DS11 退出回收/安装实测未闭环）
- **铁律**: AGENTS.md 铁律 0-2（入口→交互→结果三环节）/ 4（交付不完整）/ 35（能 check-*.sh 的不靠 review）

## 2. Problem Statement

派单验证点 1-2「Windows 双击出窗」uncommitted。缺三块（与 Mac 侧 D519 三缺一一对应）:

1. **可复现的 Win 实测脚本**——NSIS 安装→开始菜单/桌面快捷方式→双击启动→进程→窗口→healthz/首诊 URL 可达，全程无命令行。没有脚本 = 每次实测靠人手记，不可复现。
2. **evidence 落盘规范**——安装包 md5 + 进程/窗口断言原文 + healthz/首诊 URL 响应，进 task-state.evidence。
3. **founder-demo checklist 的 Win 侧 4 步**（D510 遗留 DS11 的 Win 半边）——安装→启动→出窗→首诊 4 步每步命令+预期+证据落点。

> **依赖切片 A（硬约束）**: 本 D 的前置是切片 A D517 的 `.exe` 产物 + md5 evidence。D523 只消费该产物，不改 build-synova.cjs（D517 领地）。若无 .exe → waiting，不伪造。

## 3. Q0-Q4

**Q0 拼图**: L1 桌面端 Win 侧验证基建。复用切片 A 的 `scripts/desktop/` 新领地（D519 已声明新建）——本 D 追加 Win 脚本 `win-install-verify.ps1`。复用 D522 的服务自启链（backend-spawn spawn 后端 + main.cjs loadFile renderer）。

**Q1 调研**: 业界 = Windows 桌面应用安装/启动验证用 PowerShell 原生 cmdlet（`Get-Process` 进程、`MainWindowTitle` 窗口、`Invoke-WebRequest` 可达性、`Get-FileHash` md5——Mac 侧 D519 用 pgrep/osascript/curl/md5 的同构映射）；Anthropic 基线 = 机器可验契约（进程/窗口/URL 三断言是物理事实）；memory 教训 = D510 F1（静态 grep 冒充实测）+ DS4（伪造实测）+ 铁律 0-3 严禁 `taskkill //IM node.exe`（会杀所有 Node）。**参考: PowerShell 原生 cmdlet + Anthropic 机器可验 + 第一性原理（进程/窗口/URL 是物理存在）+ 结论: .ps1 四断言 + evidence 落盘 + founder-demo checklist。**

**Q2 范围**: 做什么——win-install-verify.ps1（安装→启动→四断言→落 evidence→清理，--dry-run 模式）、founder-demo-win.md（4 步 checklist）、win-install-verify.test.ts（脚本契约静态断言，不替代本机实跑）。不做什么——不改 src/（首诊后端生产可用）、不改 electron/（D522 领地）、不改 build-synova.cjs（D517 领地，只消费其 .exe 产物）、Mac 侧实测（D519 已承诺）、CI 上跑安装实测（Windows runner 无交互桌面会话，窗口断言不可靠——CI 只构建，实测只在本机）。

**Q3 验收**: 入口=切片 A .exe 双击 / `powershell -File scripts/desktop/win-install-verify.ps1`；处理=NSIS 安装→启动→四断言（进程 Get-Process/窗口 MainWindowTitle/healthz Invoke-WebRequest/后端日志）→落 evidence→清理；结果=退出码 0 + evidence 落盘 + task-state 回填。

**Q4 契约与测试**: 见 §7。

## 4. Current State（2026-08-25 实测，worktree @5d6f487d）

- `scripts/desktop/` **不存在**（实测 `ls scripts/desktop/` 空）——切片 A D519 已声明新建，本 D 追加 Win 脚本（共享目录，串行不冲突）。
- `electron/main.cjs` prod 引导（D504 已就绪，D522 复用）: L96 `isProd = app.isPackaged` → L99 `loadFile(process.resourcesPath/renderer/index.html)`（renderer React UI，含首诊链路）→ L126-132 `ensureBackend({mode:'prod', cwd: process.resourcesPath, ...})` spawn 后端。**Win 侧三层（安装/启动/出窗）从未实测。**
- `src/routes/healthz.ts` L323 `router.get('/api/healthz', ...)`（探活目标，实测存在）。
- `src/routes/diagnosis.ts` L4 `POST /api/diagnosis/consult`（首诊六阶段入口，GS-01 已绿）。
- 切片 A D517 产物: `.exe`（NSIS x64）**编码收口未落地（无 impl PR）**——本 D 前置依赖，waiting 条件。
- task-state evidence 惯例: task-state/D523.json 的 impl 段回填 evidence 原文（D519 同构）。

## 5. What We Build

### 5.1 写集 (0 修改 + 3 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| scripts/desktop/win-install-verify.ps1 | 新建 | 契约: `win-install-verify.ps1 [-DryRun] [-SkipInstall] [-KeepData]` → exit 0=四断言全过 / 1=任一断言失败 / 2=前置缺失（.exe/md5 缺失）degraded。步骤: ①检查前置——切片 A `release/*.exe` 存在 + `Get-FileHash` md5 落 evidence（无则 exit 2 waiting）；②`Start-Process` 运行 NSIS 安装（`/S` 静默，交互态留注释）；③从开始菜单/桌面快捷方式或安装目录启动 SynovaAgent.exe；④轮询 60s 四断言: `Get-Process -Name SynovaAgent`（进程）、`Get-Process SynovaAgent \| Where-Object { $_.MainWindowTitle -ne '' }`（窗口标题）、`Invoke-WebRequest -UseBasicParsing http://localhost:18790/api/healthz`（→200）、userData `logs/backend.log` 非空（后端日志）；⑤evidence 落 `evidence/D523-win-<date>/`（exe-md5.txt/process.txt/window.txt/healthz.txt/backend.log）；⑥清理: Stop-Process 后端+Electron（**严禁 `taskkill /IM node.exe`**——只杀本实例 pid）+ 卸载；⑦-DryRun 只打印步骤不断言。失败路径 echo 具体失败步 + evidence 记录（不静默，铁律 24） |
| docs/synova/runbooks/founder-demo-win.md | 新建 | D510 遗留 DS11 的 Win 半边: 4 步 checklist——1) 安装（.exe 路径+md5 命令+预期产物）2) 启动（双击/快捷方式+预期进程命令）3) 出窗（进程名+窗口标题断言命令）4) 首诊页可达（healthz+renderer 首诊 + 截图路径）；每步"证据落哪"标注 task-state.evidence 字段名 |
| tests/electron/win-install-verify.test.ts | 新建 | L1 单元: 脚本存在+可读、含四断言关键字（Get-Process/MainWindowTitle/Invoke-WebRequest/Get-FileHash）、-DryRun/-SkipInstall/-KeepData 参数分支存在、exit 语义注释与实现一致、**无 `taskkill /IM node.exe`**（铁律 0-3 红线）——grep 静态断言，属脚本契约静态测试（**不替代本机实跑**，DS1 仍需物理实测） |

> 共享资源标注（S-7/S-8）: `scripts/desktop/` 目录与切片 A D519 共享；`evidence/` 目录与 D519/D517 共享（.gitignore 已由 D519 声明追加）。本 D 串行于切片 A 之后，零并行冲突。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 改 src/ 任何文件 | 派单红线——首诊后端生产可用 |
| 改 electron/（main.cjs/backend-spawn.cjs） | D522 领地（本 D 复用其产物，不改） |
| 改 build-synova.cjs | D517（切片 A）领地——本 D 只消费其 .exe 产物 |
| Mac 侧实测 | D519（切片 A）已承诺——本 D 只做 Win 侧 |
| CI 上跑安装实测 | Windows runner 无交互桌面会话，窗口断言不可靠——CI 只构建，实测只在本机 |
| 代码签名/公证/自动更新 | 随 D517 descope（无证书） |
| 引入 DSH 依赖 / copy DSH 代码 | 施工图 R1——Stage 3 前零 DSH 依赖 |
| 伪造实测（无 .exe 硬编 evidence） | DS4 教训——前置缺失即 waiting，不伪造 |
| scripts/audit/ | K3 专属红线 |

## 7. Test Requirements

**契约（铁律 47）**: win-install-verify.ps1 → exit {0=四断言全过, 1=任一断言失败, 2=前置缺失（.exe/md5 缺失）}；任何失败路径 echo 具体失败步 + evidence 记录（不静默，铁律 24）。**严禁 `taskkill /IM node.exe`**（只杀本实例 pid，铁律 0-3）。

| 层 | 用例 | 覆盖 | red 前提 |
|:---|------|------|------|
| L1 单元 | win-install-verify.test.ts: 脚本存在+可读（stat）；含四断言关键字（Get-Process/MainWindowTitle/Invoke-WebRequest/Get-FileHash）；-DryRun/-SkipInstall/-KeepData 参数分支；exit 语义注释与实现一致；**无 `taskkill /IM node.exe`** | 正常+契约静态 | 新建前红（脚本不存在） |
| L2b 降级 | 前置缺失（无 .exe/无 md5）→ exit 2 + stderr "waiting: 切片 A D517 .exe 缺失"（不伪造，不静默） | 降级 | 删 .exe 复现 |
| L2c 边界 | 伪造断言失败（healthz 死端口 / 注入假进程名）→ exit 1 + evidence 含失败步 | 边界 | 注入复现 |
| L2a 接线 | Win 本机实跑（**物理实测，非 CI/非 grep**）: .exe 安装→启动→四断言全过→evidence 落盘 | 正常全链 | 本机手动/脚本实跑 |

**verify 命令（物理，非 grep）**:
```powershell
# 本机 Win 实跑（唯一物理验收，D510 F1）
powershell -File scripts/desktop/win-install-verify.ps1; echo "exit=$LASTEXITCODE"   # 期望 exit=0
ls evidence/D523-win-*/   # 五类证据文件齐（exe-md5/process/window/healthz/backend.log）
```

## 8. Wiring Verification

| 新产物 | 生产调用点（实测方法） |
|--------|------|
| win-install-verify.ps1 | founder-demo-win.md 第 1-4 步全部引用该脚本子命令/步骤；切片 B 验证点 1-2 判据=本脚本 exit 0 |
| founder-demo-win.md | task-state/D523.json impl 段 evidence 字段按 checklist 字段名回填（一一对应） |
| 开窗即用闭环（复用 D522） | main.cjs L96-99 prod `loadFile(renderer/index.html)` + L126-132 `ensureBackend({mode:'prod'})`——D522 已验证，本 D 只落 Win 侧实测证据 |
| 首诊后端 | `src/routes/diagnosis.ts` L4 `POST /api/diagnosis/consult` + `src/routes/healthz.ts` L323 `GET /api/healthz`（探活/首诊 URL 可达的物理目标） |

## 9. Architecture Layer

L1 交互层（Electron 桌面端 Win 侧验证基建）。win-install-verify.ps1 是纯验证脚本，零跨层——只调 PowerShell cmdlet + 探活后端 URL，不改任何 L2-L5 层。

## 10. Completion Standard

1. **DS1**: Win 本机 `powershell -File scripts/desktop/win-install-verify.ps1` 退出码 0——四断言全过（进程+窗口+healthz+日志），**物理实测非模拟**（D510 F1 红线）
2. **DS2**: evidence/D523-win-*/ 含 exe-md5.txt、process.txt、window.txt、healthz.txt、backend.log 原文；关键摘录（md5、healthz 响应、窗口标题）回填 task-state/D523.json
3. **DS3**: 前置依赖显式闭环——安装包 .exe + md5 evidence 存在（切片 A D517 产物）；若前置缺失 → waiting 状态 + task-state 记录，不伪造（DS4 教训）
4. **DS4**: founder-demo-win.md 4 步 checklist 每步含命令+预期+证据落点（D510 遗留 DS11 的 Win 半边闭环）
5. **DS5**: win-install-verify.test.ts 静态断言全绿（脚本契约 + 无 `taskkill /IM node.exe` 红线）
6. **DS6**: 双平台承诺口径落地——Win 侧证据形态 = 进程名（SynovaAgent）+ 窗口标题 + healthz 200 + 首诊 URL 可达（Mac 侧 D519 已承诺，两半合成完整承诺）
7. **DS7**: 写集外零改动 + scripts/audit/ 零触碰 + build-synova.cjs 零触碰（`git diff --name-only` 对账）

> 交付声明覆盖 DS1-DS7 逐项标注 ✅/⏸/❌+理由，禁重编号/静默缺项（S-10）。

## 11. Auth Doc References

- docs/synova/coordination/派单-L1切片B-D522-D523-20260824.md（§D523 4 必答题 + 前置依赖）
- docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md（§3.1 L77 / §4 L157 / R1 L322）
- .claude/PRODUCT-BRIEF.md（§二 / §六 P0）
- docs/synova/audit-reports/2026-08-23-D504-D505.md（D504 基线，F2 DS11 安装实测未闭环）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D519-mac-install-test-20260824.md（Mac 侧同构参照——scripts/desktop/ 新领地 + 四断言 + evidence 落盘）
- AGENTS.md（铁律 0-2/0-3/4/35）

## 12. 必答题 1 补充——win-install-verify.ps1 骨架（编码照此思路）

```powershell
# scripts/desktop/win-install-verify.ps1 — Win 侧安装启动出窗四断言（切片 B D523）
param(
  [switch]$DryRun,      # 只打印步骤不断言
  [switch]$SkipInstall, # 已装则跳过安装步
  [switch]$KeepData     # 清理时保留 userData
)
$ErrorActionPreference = 'Stop'
$SERVER = 'http://localhost:18790'

# ① 前置检查（切片 A D517 产物）: release/*.exe 存在 + Get-FileHash md5
$exe = Get-ChildItem release -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) { Write-Error "waiting: 切片 A D517 .exe 缺失"; exit 2 }
$md5 = (Get-FileHash $exe.FullName -Algorithm MD5).Hash

# ② 安装: Start-Process $exe.FullName -ArgumentList '/S' -Wait   # NSIS 静默
# ③ 启动: 从开始菜单/桌面快捷方式或安装目录启动 SynovaAgent.exe
# ④ 轮询 60s 四断言:
#   A. 进程:  Get-Process -Name SynovaAgent -ErrorAction SilentlyContinue
#   B. 窗口:  Get-Process SynovaAgent | Where-Object { $_.MainWindowTitle -ne '' }
#   C. healthz: (Invoke-WebRequest -UseBasicParsing "$SERVER/api/healthz").StatusCode -eq 200
#   D. 后端日志: userData logs/backend.log 非空
# ⑤ evidence 落 evidence/D523-win-<date>/ (exe-md5/process/window/healthz/backend.log)
# ⑥ 清理: Stop-Process 本实例 pid（严禁 taskkill /IM node.exe——铁律 0-3 只杀本实例）+ 卸载
# ⑦ 失败路径: echo 具体失败步 + evidence 记录（不静默，铁律 24）
```

> **红线自检**: 无 `taskkill /IM node.exe`（只杀本实例 pid）；不改 electron/（D522 领地）、不改 build-synova.cjs（D517 领地）；零 DSH 依赖。

## 13. 自检清单（dev-doc 侧，K3 可核）

- [x] 派单 4 必答题逐条覆盖（①Win 实测步骤=写集 .ps1 七步 ②双平台承诺口径=DS6 ③安装包来源契约=§头部前置依赖+DS3 ④开窗即用闭环=复用 D522 链+§8）
- [x] 前置依赖显式写死（§头部"⚠️ 前置依赖" + DS3 waiting 不伪造）——派单 B 交付要求 #3
- [x] 现状全部实测（worktree @5d6f487d: scripts/desktop/ 不存在 + main.cjs L96/L99/L126-132 + healthz.ts L323 + diagnosis.ts L4 逐文件 read）
- [x] 与 Mac 侧 D519 同构（scripts/desktop/ 新领地 + 四断言 + evidence 落盘 + founder-demo checklist + 静态测试不替代实跑）
- [x] Done 标准 = 物理实测（powershell exit 0 + evidence 原文），零 grep 冒充（D510 F1）
- [x] 写集 3 条目（.ps1 + founder-demo-win.md + win-install-verify.test.ts）；不碰 src/、electron/、build-synova.cjs、scripts/audit/
- [x] 共享资源标注（scripts/desktop/ 与 D519 共享，串行不冲突）
- [x] 依赖声明: 切片 A D517 产物（.exe + md5）——无则 waiting
