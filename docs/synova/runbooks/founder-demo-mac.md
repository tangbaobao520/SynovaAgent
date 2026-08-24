# Founder Demo — Mac 安装包四步实测（D519，D510 遗留 DS11 补做）

> 面向创始人的最小验证路径：**每一步都是物理命令 + 预期产物 + 证据落点**，不依赖开发者口述。
> 一键全链：`bash scripts/desktop/mac-install-verify.sh`（exit 0 = 可用）。本文档是分步手动版。
> ⚠️ Gatekeeper：dmg 未签名（无 Apple 证书，D517 descope）——双击打开被拦时**右键 SynovaAgent.app → 打开 → 再点"打开"**；本 runbook 走"挂载+cp"路径不受影响。

## 第 1 步：打 dmg

```bash
npm run build:backend && (cd electron-renderer && npm run build) && npx electron-builder --config build-synova.cjs --mac
ls -lh release/*.dmg        # 预期: SynovaAgent-<版本>-arm64.dmg ≥100MB
md5 release/*arm64.dmg      # 指纹（与 CI artifact 下载对比可验同源性）
```
- 预期产物：`release/*.dmg`（x64+arm64）+ `release/*-mac.zip`
- 证据落点：`task-state/D519.json → impl.evidence.dmg_fingerprint`（ls+md5 原文）

## 第 2 步：安装（挂载 + 拷贝，绕开未签名双击拦截）

```bash
hdiutil attach release/SynovaAgent-0.1.0-arm64.dmg -nobrowse -readonly   # 预期: /Volumes/SynovaAgent
cp -R /Volumes/SynovaAgent/SynovaAgent.app /Applications/
hdiutil detach /Volumes/SynovaAgent
```
- 预期：`/Applications/SynovaAgent.app` 存在
- 证据落点：`impl.evidence.install`（cp 退出码 + ls /Applications 原文）

## 第 3 步：启动（后端自启 + 开窗）

```bash
open /Applications/SynovaAgent.app        # 或双击
pgrep -fl SynovaAgent                     # 预期: 主进程 + Helper 进程
osascript -e 'tell application "System Events" to (name of processes) contains "SynovaAgent"'   # 预期: true
```
- 预期：进程存活、窗口出现（首诊页加载）
- 证据落点：`impl.evidence.window`（osascript 输出原文）

## 第 4 步：首诊页可达（服务健康）

```bash
curl -sf localhost:18790/api/healthz      # 预期: HTTP 200 + JSON（status=degraded 属业务级首次未初始化，HTTP 200=服务健康）
tail ~/Library/Application\ Support/synova-agent/logs/backend.log   # 预期: 非空，含 "SynovaAgent 就绪"
```
- 预期：healthz 200 + backend.log 非空 + 窗口内首诊对话 UI 可交互
- 证据落点：`impl.evidence.healthz`（响应 JSON 原文）

## 收尾清理（复跑前）

```bash
pkill -f SynovaAgent; rm -rf /Applications/SynovaAgent.app "$HOME/Library/Application Support/synova-agent"
```

## 双平台验收口径（DS6）

| 平台 | 判据 | 状态 |
|---|---|---|
| Mac | 本页四步物理实测（mac-install-verify.sh exit 0） | D519 本机执行 |
| Win | D517 CI `desktop-build` job artifact（SynovaAgent-*.exe 可下载） | 合并后 Actions 页 URL 落 task-state/D519.json |

## K3 独立复跑口径

```bash
bash scripts/desktop/mac-install-verify.sh; echo "exit=$?"   # 期望 exit=0
ls evidence/D519-mac-*/                                       # 六类证据文件
bash scripts/desktop/mac-install-verify.sh --skip-build       # 幂等复跑（第二次走清理路径，期望 exit=0）
```
宿主环境若设 `ELECTRON_RUN_AS_NODE=1`（如 DSH 会话）脚本已显式清除，无需手动处理。
