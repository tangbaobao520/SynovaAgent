# Task Brief: D713 desktop-package-signature-and-verify-gate

> 生成: 2026-09-13 | 任务: D713 | 认领: 主 CTO（synova-cto）
> 参考: D333 决策四步；铁律 35（自动化优先）/ 48（测试非空壳）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
桌面端打包链修复（线 1 桌面的 P0 阻塞：**安装包装完打不开**）。产品第一承诺＝"双击安装包 → 装好 → 服务自启 → 开窗即用"，
而当前 dmg/zip 内的 app **无 code signature 封印** → macOS 拒绝启动（弹"已损坏"）。
本任务：① 构建链补 **ad-hoc 签名**（无 Developer ID 时的正解）② 补**构建后签名校验门禁**（坏包不得出货）③ 修 x64 架构错配根因。
### b) 文件审计（实测）
- `build-synova.cjs:119-125` mac 段只有 `target`/`category`，**无 identity/sign 配置** → 实测 git grep `identity|codesign|notarize` 零命中
- `node_modules/app-builder-lib@25.1.8/out/macPackager.js:202-211`：`identity == null && !options.sign` → **只 log skip 并返回 false**（无原生 ad-hoc 通道）→ 必须显式签名
- `.github/workflows/desktop-build.yml:101-107`：只断言 `release/*.dmg`、`*-mac*.zip` **存在**，**不验签名** → 坏包静默出货
- 实测证据：dmg 内 app 无 `Contents/_CodeSignature`；`codesign --verify` 报 `code has no resources but signature indicates they must be present`；
  主 CTO 用 `codesign --force --deep --sign -` 重签后**实测启动成功**（14s 存活 + `[electron] boot mode=prod`）
- 旁证：`release/mac/SynovaAgent.app` 主程序 x86_64 而内含 arm64 native 模块（架构错配）→ native prep 未按目标架构执行
### c) 决策
配置层补 `mac.identity: null`（显式不追证书）+ `afterPack` 钩子做 **ad-hoc 签名并即时自检**（失败即让构建红）；
`beforePack` 钩子按目标 arch 准备 native 依赖（修错配根因）；新增独立校验脚本 + 密封测试 + 接入 desktop-build.yml。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 业界正解：无 Developer ID 证书时对 mac 应用做 **ad-hoc 签名**（`codesign --sign -`）——arm64 可执行文件必须有签名（哪怕 ad-hoc），
  否则连本地启动都会被拒；electron-builder 25.x 无自动 ad-hoc 通道（已读源码确认）→ 用 `afterPack` 钩子显式签。
- Anthropic 工程基线：**构建产物必须自证**（签名后立即 `codesign --verify`，失败即红）——与铁律 35（能自动化的不靠人）一致。
- memory 教训：M2（声称 vs 事实）——D712 的"机器绿"跑的是本地 build，未走发布物安装路径；M3（机制建成未接线）——
  CI 只断言产物存在不断言可用性。
### 参考：electron-builder 源码 + Apple codesign 语义 + 第一性原理（产物必须自证可用）→ afterPack 签名 + 构建后校验门禁

## Q2: 范围 — 正确的最简方案
做什么：
- build-synova.cjs — mac 段补 `identity: null` + `afterPack`（ad-hoc 签名 + 立即 codesign --verify 自检，失败 throw）+ `beforePack`（按 arch 准备 native 依赖）
- scripts/desktop/verify-package-signature.sh — 新建校验门禁（app/dmg 两模式，三态退出：0 通过 / 1 未签名 / 2 执行失败）
- tests/desktop/verify-package-signature.test.sh — 新建密封测试（未签名 fixture→1；ad-hoc 签名 fixture→0；路径不存在→2；断言 ≥3）
- .github/workflows/desktop-build.yml — 签名校验步骤（mac job 对 dmg/zip 产物执行门禁，失败即红）
- package.json — 增 `electron:verify:mac` 脚本
- .claude/task-briefs/2026-09-13-D713-desktop-package-signature-and-verify-gate.md — 本 brief
- memory/notes/implemented/2026-09-13-desktop-adhoc-sign-and-verify-gate.md — 四态 Note（铁律 49）
- task-state/D713.json — 状态登记
- docs/synova/product-lines/evidence/D713-published-artifact-20260913.json — 发布物路径实测证据（1-3/1-4）
- docs/synova/coordination/board-backlog.json — 登记 PLAN-packaging-signature-broken(P0) + PLAN-expert-count-drift(P2，周自检发现)
不做什么：
- 不改 src/server.ts（1-5 双引导收敛属 Win 线，Claude 专属，另派）
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 .github/workflows/ci.yml（D708/#505 正在改密封清单，避免撞车）
- 不做 Developer ID 签名/公证（需付费证书，属创始人决策；本任务只解决"本地/内测可双击打开"）

## Q3: 验收 — 入口 → 交互 → 结果
入口：`npm run electron:build:mac`（本地）或 CI desktop-build 的 macos job
处理：beforePack 备 native（按 arch）→ 打包 → afterPack ad-hoc 签名 + 自检 → dmg/zip → 校验门禁
结果：**从 dmg 安装后双击能打开**（进程存活 + 窗口）；校验门禁对未签名产物 exit 1

## 架构层: 基础设施（桌面端打包链，非五层）
桌面端打包与签名链修复，不触五层产品代码（electron/ 品牌表层，施工图 §3 🟢 死守域）

## Done 标准:
- [ ] bash scripts/desktop/verify-package-signature.sh --app release/mac-arm64/SynovaAgent.app → exit 0（签名封印存在且 codesign --verify 通过）
- [ ] bash tests/desktop/verify-package-signature.test.sh → exit 0（≥3 断言：未签名→1 / 已签名→0 / 不存在→2）
- [ ] 重建后 dmg 挂载校验：bash scripts/desktop/verify-package-signature.sh --dmg release/SynovaAgent-0.1.0-arm64.dmg → exit 0
- [ ] 端到端实测：app 启动后进程存活 ≥10s 且日志含 `boot mode=prod`（记录到证据文件）
