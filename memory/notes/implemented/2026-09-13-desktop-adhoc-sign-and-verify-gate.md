---
状态: implemented
日期: 2026-09-13
决策: 桌面端打包链补 **ad-hoc 签名 + 构建期内自检 + 按架构准备 native 依赖**（D713）。① `build-synova.cjs` mac 段显式 `identity: null`（不追证书，消除非确定性），新增 `afterPack` 钩子对 `.app` 执行 `codesign --force --deep --sign -` 并**立即 `codesign --verify --deep --strict` 自检 + 校验 `Contents/_CodeSignature/CodeResources` 存在，任一失败即 throw 中止构建**；② 新增 `beforePack` 钩子按目标 arch 跑 `prebuild-install -r electron -t <electron 版本> --arch <x64|arm64>`（CI 原命令不带 `--arch`，在 arm64 runner 上打 x64 包必然错配）；③ 新增独立门禁 `scripts/desktop/verify-package-signature.sh`（`--app` / `--dmg` / `--all`，三态退出 0/1/2，macOS 专用，非 darwin 明确 fail-closed）+ 密封测试 `tests/desktop/verify-package-signature.test.sh`（7 断言）接入 `desktop-build.yml`（产物存在 ≠ 可用）。
理由: 创始人 2026-09-13 报告「打都打不开」。CTO 实测定位：dmg 内 `SynovaAgent.app` **无 `Contents/_CodeSignature` 封印**，`codesign --verify` 报 `code has no resources but signature indicates they must be present` → macOS 拒绝启动（提示『已损坏』）。根因＝`build-synova.cjs` 无任何签名配置（git grep identity/codesign/notarize 零命中），而 `app-builder-lib@25.1.8` 在无证书时**只 log skip 并返回 false**（源码 `out/macPackager.js:202-211`）——即"从未签名"，而 CI 只断言产物"存在"（`desktop-build.yml:101-107`），坏包静默出货。正解＝无 Developer ID 时的行业标准做法：ad-hoc 签名（arm64 可执行文件必须有签名才能启动），且**产物必须自证**（签完立刻验，失败即红）——铁律 35（能自动化的不靠人）。
---

## 一、证据链（实测，非推断）

| 步骤 | 命令 | 结果 |
|---|---|---|
| 产物封印缺失 | `ls <app>/Contents/_CodeSignature` | 不存在 |
| 签名校验失败 | `codesign --verify --verbose=2 <app>` | `code has no resources but signature indicates they must be present` |
| dmg 内同样坏 | `hdiutil attach <dmg>` → 校验内部 app | 同样无封印 → 装完必打不开 |
| 重签后可用 | `codesign --force --deep --sign - <app>` → 直接启动二进制 | ✅ 进程存活 14s + 日志 `[electron] boot mode=prod server=http://localhost:18790`（沙箱外实测） |
| 架构错配旁证 | `file release/mac/SynovaAgent.app/.../better_sqlite3.node` | 主程序 x86_64，内含 **arm64** native 模块（prep 未按 arch） |

## 二、影响与边界

- **影响**：D712 的 `1-3`（Mac 安装包可用）/ `1-4`（服务自启开窗即用）"机器绿"**不成立为"安装包可用"**——机器断言跑的是本地 build 产物，未经发布物（dmg/zip）安装路径。CTO 已修正验收口径：**须"从发布物安装后双击能开"**才算 verified。
- **边界（本任务不做）**：Developer ID 签名 + 公证（notarize）需付费证书，属创始人决策；本任务只保证"本地/内测可双击打开"。未公证的 ad-hoc 应用在**他人机器**（经网络分发）仍会被 Gatekeeper 拦（需右键打开或 `xattr -d com.apple.quarantine`）——这一点写入 runbook，避免下次误判为"又坏了"。
- **门禁语义**：`spctl -a` 对 ad-hoc 应用恒为 rejected（需 Developer ID），故门禁**不用 spctl**，而用 `codesign --verify --deep --strict` + 封印存在性——这是"本地可启动"的充分判据。

## 三、验证（本任务 Done 标准）

- `bash scripts/desktop/verify-package-signature.sh --app <新构建 app>` → exit 0
- `bash tests/desktop/verify-package-signature.test.sh` → 7 断言全过（未签名→1 / 已签名→0 / 不存在→2 / 无参数→2 / 空目录→0 / 接线检查）
- `--dmg` 对**重建后**的 dmg 校验 → exit 0（挂载 → 内部 app → 卸载）
- 端到端：从新 dmg 安装 → 双击 → 进程存活 ≥10s + `boot mode=prod`
