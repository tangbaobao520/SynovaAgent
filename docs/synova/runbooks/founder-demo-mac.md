# Founder Demo — Mac 部署验收 checklist（D519 + D536 实测）

> 面向创始人的最小验证路径：**每一步都是物理命令 + 预期产物 + 证据落点**，不依赖开发者口述。
> 一键全链：`bash scripts/desktop/mac-install-verify.sh`（exit 0 = 可用）。本文档是分步手动版。
> ⚠️ Gatekeeper：dmg 未签名（无 Apple 证书，D517 descope）——双击打开被拦时**右键 SynovaAgent.app → 打开 → 再点"打开"**；本 runbook 走"挂载+cp"路径不受影响。
> ✅ **D536 部署验收完成态（2026-08-26）**：CI artifact（run 32870900391）真实安装实测通过——四段结论见文末「完成态记录」。

## 第 0 步：下载 CI 安装包 + md5 校验（D536 新增）

```bash
# 从 GitHub Actions artifact 下载（token: ~/.dsh/.credentials.yaml → refs.GITHUB_TOKEN）
TOKEN=<读自 credentials.yaml>
curl -L -H "Authorization: token $TOKEN" -o /tmp/synova-macos.zip https://api.github.com/repos/tangbaobao520/SynovaAgent/actions/artifacts/9572118172/zip
md5 /tmp/synova-macos.zip                          # 落 evidence/D536-artifacts-<date>/md5.txt
unzip -o -q /tmp/synova-macos.zip -d /tmp/macos-x/ && md5 /tmp/macos-x/*.dmg
cp /tmp/macos-x/SynovaAgent-*.dmg release/          # mac-install-verify.sh 从 release/*.dmg 取
```
- 预期产物：`release/SynovaAgent-<版本>-arm64.dmg`（CI 产物 ≈1GB zip 解压）≥100MB
- 证据落点：`evidence/D536-artifacts-<date>/`（zip+dmg 指纹）→ task-state/D536.json impl.evidence
- 已知：GitHub Actions CDN 限速时用分片并行+续传（实测 ~440KB/s，1GB 约 40 分钟）

## 第 1 步：打 dmg（D536 可跳过——直接用 CI 包）

```bash
npm run build:backend && (cd electron-renderer && npm run build) && npx electron-builder --config build-synova.cjs --mac
ls -lh release/*.dmg        # 预期: SynovaAgent-<版本>-arm64.dmg ≥100MB
md5 release/*arm64.dmg      # 指纹（与 CI artifact 下载对比可验同源性）
```
- 预期产物：`release/*.dmg`（x64+arm64）+ `release/*-mac.zip`
- 证据落点：`task-state/D519.json → impl.evidence.dmg_fingerprint`（ls+md5 原文）
- **D536 实测**：直接复用第 0 步 CI dmg（`--skip-build`），跳过本地构建

## 第 2 步：安装（挂载 + 拷贝，绕开未签名双击拦截）

```bash
hdiutil attach release/SynovaAgent-0.1.0-arm64.dmg -nobrowse -readonly   # 预期: /Volumes/<卷名含版本+arch>
cp -R <挂载点>/SynovaAgent.app /Applications/
hdiutil detach <挂载点>
```
- 预期：`/Applications/SynovaAgent.app` 存在
- 证据落点：`evidence/D519-mac-<date>/install.log` + `impl.evidence.install`（cp 退出码 + ls /Applications 原文）

## 第 3 步：启动（后端自启 + 开窗）

```bash
open /Applications/SynovaAgent.app        # 或双击
pgrep -fl SynovaAgent                     # 预期: 主进程 + Helper 进程
osascript -e 'tell application "System Events" to (name of processes) contains "SynovaAgent"'   # 预期: true
```
- 预期：进程存活、窗口出现（首诊页加载）
- 证据落点：`evidence/D519-mac-<date>/process.txt + window.txt`（osascript 输出原文）

## 第 4 步：首诊页可达 + 首诊旅程（D527/D536）

```bash
curl -sf localhost:18790/api/healthz      # 预期: HTTP 200 + JSON
tail ~/Library/Application\ Support/synova-agent/logs/backend.log   # 预期: 非空，含 "SynovaAgent 就绪"
# D527 计时（install_start→install_done→app_launch→healthz_200→first_diagnosis_ready）
bash scripts/desktop/first-diagnosis-timing.sh --mode prod --installer release/<CI dmg>
# 产物: scripts/golden-scenarios/evidence/first-diagnosis-timing-<date>.json（verdict WITHIN_TARGET/OVER_TARGET 如实）
```
- 预期：healthz 200 + backend.log 非空 + 窗口内首诊对话 UI 可交互
- 证据落点：`evidence/D519-mac-<date>/healthz.json`（响应 JSON 原文）+ timing JSON
- **LLM key 注入（D536 实测）**：`open` 启动不继承 shell env（backend-spawn env={...process.env}）→ 首诊真实 LLM consult 需：
  - 直接执行二进制 `"$INSTALLED_APP/Contents/MacOS/SynovaAgent"`（继承 shell env），或
  - `launchctl setenv LLM_API_KEY <值>` 后 open（GUI 会话 env 注入）
  - D536 evidence 记录实际注入方式；无 key → GS-01 如实 RED（GS01_LLM 未设置 → CONSULT_LLM_RED，不伪造绿）

## 第 5 步：数据不丢（D528/D536）

```bash
bash scripts/desktop/upgrade-data-verify.sh --installer release/<CI dmg>   # 期望 exit 0
# 产物: scripts/golden-scenarios/evidence/upgrade-data-<date>-<ts>/summary.txt 含 verdict: DATA_RETAINED
```
- 断言：表清单/关键表行数（agent_memory/sessions/sentinel_baseline）/db md5/PRAGMA integrity_check 前后一致
- 全程临时 userData（mktemp + SYNOVA_DB_PATH 注入），真实 `~/Library/Application Support/synova-agent` 零触碰（铁律 0-4）

## 收尾清理（复跑前）

```bash
pkill -f SynovaAgent; rm -rf /Applications/SynovaAgent.app "$HOME/Library/Application Support/synova-agent"
```

## 双平台验收口径（DS6）

| 平台 | 判据 | 状态 |
|---|---|---|
| Mac | 本页五步物理实测（mac-install-verify.sh exit 0 + 首诊 + 数据） | **D536 实测通过（2026-08-26）** |
| Win | D517 CI artifact（SynovaAgent-*.exe）+ win-install-verify.ps1 在 Win 目标机 exit 0 | D536: 待 Win 目标机（GUI dsh-ssh 未配置 → waiting 如实标注） |

## 完成态记录（D536，2026-08-26~27）

| 段 | 命令 | 结论 | evidence |
|---|---|---|---|
| ① artifact 下载+md5 | §第 0 步 | ✅ | `evidence/D536-artifacts-20260826/`（五指纹） |
| ② 安装 | mac-install-verify.sh --skip-build | ✅ exit 0 | `evidence/D519-mac-20260827-001651/assertions.txt` |
| ③ 启动+服务自启 | 同上（A1-A4 含 healthz+日志） | ✅ 第 4s 全过 | 同上 |
| ④ 首诊 | first-diagnosis-timing.sh --mode prod + GS-01 | ✅ WITHIN_TARGET (1.8s) + LLM GREEN | `scripts/golden-scenarios/evidence/first-diagnosis-timing-2026-08-27.json` + `GS-01-2026-08-27.json` |
| ⑤ 数据不丢 | upgrade-data-verify.sh --installer | ✅ DATA_RETAINED | `scripts/golden-scenarios/evidence/upgrade-data-2026-08-27-*/summary.txt` |
| 幂等复跑 | mac-install-verify.sh --skip-build（二跑） | ✅ 第 8s 全过 exit 0 | `evidence/D519-mac-20260827-003948/assertions.txt` |

> 汇总: `evidence/D536-mac-20260827/summary.txt`（四段 verdict + 已知限制）。

## K3 独立复跑口径

```bash
bash scripts/desktop/mac-install-verify.sh --skip-build; echo "exit=$?"   # 期望 exit=0（release/ 放 CI dmg）
bash scripts/desktop/first-diagnosis-timing.sh --mode prod --installer release/<CI dmg>; echo "exit=$?"
bash scripts/desktop/upgrade-data-verify.sh --installer release/<CI dmg>; echo "exit=$?"
ls evidence/D519-mac-*/ evidence/D536-artifacts-*/                        # 证据文件
```
宿主环境若设 `ELECTRON_RUN_AS_NODE=1`（如 DSH 会话）脚本已显式清除，无需手动处理。
