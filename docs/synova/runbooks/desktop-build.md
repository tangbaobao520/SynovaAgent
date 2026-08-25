# Runbook — 桌面端安装包构建（D517）

> 验证点 1-1「安装包能打出来」。构建链契约唯一权威：`build-synova.cjs` 文件头注释。
> CI：`.github/workflows/desktop-build.yml`（push main / 手动 workflow_dispatch，mac + win 双 job，artifact 保留 14 天）。

## 一、构建链三步契约（顺序不可颠倒——顺序错 = 空包）

| 步骤 | 命令 | 产物 | 说明 |
|---|---|---|---|
| 1 | 根目录 `npm ci && npm run build:backend` | `dist/backend.mjs` | esbuild 单文件后端 bundle（prod 入口） |
| 2 | `cd electron-renderer && npm ci && npm run build` | `dist/renderer/` | vite 构建首诊 UI（React） |
| 3 | `npx electron-builder --config build-synova.cjs [--dir\|--mac\|--win]` | `release/` | electron-builder 打包 |

> tsc 不在打包链内：`dist/src/` 在 prod 链路无消费者（prod 入口=backend.mjs），tsc 全量类型
> 门禁独立存在（`npm run lint`），其 main 存量错误由 ci.yml 白名单管理，非本切片债务。

**为什么顺序不能错**：`extraResources` 三条映射引用步骤 1/2 的产物
（`dist→dist(!renderer)`、`dist/renderer→renderer`、`extensions→extensions`）。
步骤 1/2 未完成或顺序颠倒 → extraResources 落空 → 打出不含后端与 renderer 的空包
（`tests/electron/desktop-build.test.ts` 产物断言组会红——zip < 10MB 即判空包）。

**空包演示（L2a red 证据，一次性）**：删掉 `dist/renderer/` 后打包 →
产物内 `resources/renderer/index.html` 不存在 → 断言红。证明契约真实约束。

## 二、本地打包命令

```bash
# 快速验证（不产安装器，只解包目录）
# 磁盘事实（electron-builder 25）: 配置声明多 arch 时 --dir 产物目录带 arch 后缀
# （本机 arm64 → release/mac-arm64/SynovaAgent.app；单 arch 配置时为 release/mac/）
npx electron-builder --config build-synova.cjs --dir
du -sm release/mac*/SynovaAgent.app   # 预期 >100

# mac full（dmg x64+arm64 + zip x64+arm64）
npx electron-builder --config build-synova.cjs --mac
ls -lh release/*.dmg release/*-mac*.zip

# windows（nsis x64，需在 Windows 上跑）
npx electron-builder --config build-synova.cjs --win
```

## 三、CI artifact 下载

Actions → `desktop-build` workflow → 对应 run → 底部 Artifacts：
- `synova-desktop-macOS-<run_number>`（dmg + zip）
- `synova-desktop-Windows-<run_number>`（exe）

## 四、Gatekeeper 警告（未签名 dmg，已知 descope）

本仓库无 Apple 开发者证书，dmg 未签名未公证。首次打开会被 Gatekeeper 拦：
**右键 SynovaAgent.app → 打开 → 再点"打开"**（或 系统设置 → 隐私与安全性 → 仍要打开）。
代码签名 + notarize 待创始人提供证书后补（D517 descope，登记于 spec §6）。
