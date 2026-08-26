# Runbook: 桌面端部署验收（D536，Track A 部署轨）

> 目标: **CI 打出的双平台安装包被真实装到目标机验收**——安装/启动/首诊/数据四段物理断言，任何 FDE/创始人/审计员可照本 runbook 独立复核。
> 归属: D536（slice: deploy-acceptance）。K3 独立复核路径 = 本 runbook 逐段命令重跑。
> 前提: 切片 A/B/C 产物就位——CI artifact（run 32870900391）+ 验证脚本 4 个 + runbooks（origin/main 实测存在）。

## 0. 验收四段总览（物理断言，任一失败如实记录，禁伪造）

```
① artifact 下载+md5  → evidence/D536-artifacts-<date>/（下载日志 + md5.txt）
② Mac 安装启动首诊数据 → mac-install-verify.sh exit 0 + first-diagnosis-timing verdict JSON + upgrade-data-verify DATA_RETAINED
③ Win 安装出窗      → win-install-verify.ps1 在 Win 目标机 exit 0（无目标机 → waiting 如实标注）
④ checklist 完成态   → founder-demo-mac/win.md 每段标注 evidence 落点 + 实测日期 + 结论
```

**铁律**（AGENTS.md 铁律 0-2/7/24/35 + D510 F1）: "装上了"必须有进程/窗口/healthz/数据四类物理证明；禁止"下载了 artifact"冒充"装上了"；无目标机/无 key 如实 waiting/RED，不伪造。

## 1. 前置（K3 复跑须知）

| 项 | 检查 | 命令 |
|---|---|---|
| token | `~/.dsh/.credentials.yaml` → `refs.GITHUB_TOKEN`（0600） | `ruby -ryaml -e 'puts YAML.load_file("~/.dsh/.credentials.yaml")["refs"]["GITHUB_TOKEN"]'` |
| artifact 可下载 | API 实测 expired:False | `curl -sS -H "Authorization: token $TOKEN" https://api.github.com/repos/tangbaobao520/SynovaAgent/actions/runs/32870900391/artifacts` |
| 工具 | macOS: hdiutil/md5/curl/pgrep/osascript；Windows: powershell | `command -v <tool>` |
| LLM key（首诊实测） | `.env` 的 `LLM_API_KEY`（src/config.ts:72 读 env） | `grep -c LLM_API_KEY .env` |
| 环境坑 | `ELECTRON_RUN_AS_NODE` 若为 1 需 unset（D519）；dmg 卷名含版本+arch（挂载点从 mount.log 解析） | 脚本已内置处理 |

## 2. ① artifact 下载 + md5（DS1）

```bash
# 双平台 zip（run 32870900391: macOS id 9572118172 / Windows id 9572059369）
TOKEN=<读自 credentials.yaml>
curl -L -H "Authorization: token $TOKEN" -o /tmp/synova-macos.zip https://api.github.com/repos/tangbaobao520/SynovaAgent/actions/artifacts/9572118172/zip
curl -L -H "Authorization: token $TOKEN" -o /tmp/synova-win.zip  https://api.github.com/repos/tangbaobao520/SynovaAgent/actions/artifacts/9572059369/zip
md5 /tmp/synova-macos.zip /tmp/synova-win.zip          # 落 evidence/D536-artifacts-<date>/md5.txt
unzip -l /tmp/synova-macos.zip | grep -i dmg            # 解压确认 dmg/exe 存在
unzip -l /tmp/synova-win.zip  | grep -i exe
# 解压取安装包 + 各自 md5（zip 与解压后指纹都落盘，D519 同构）
unzip -o -q /tmp/synova-macos.zip -d /tmp/macos-x/ && md5 /tmp/macos-x/*.dmg
unzip -o -q /tmp/synova-win.zip -d /tmp/win-x/   && md5 /tmp/win-x/*.exe
```

- 预期产物: `evidence/D536-artifacts-<date>/`（download.log + md5.txt 含 zip+dmg/exe 指纹）
- 已知: 网络至 GitHub Actions CDN（Azure Blob）可能限速——分片并行 + 续传可加速（实测 ~440KB/s，1GB 约 40 分钟）
- 降级: curl 401/404/expired → 如实失败 evidence（不静默，铁律 24）

## 3. ② Mac 全链实测（DS2）

```bash
# 0) 前置: CI dmg 放入 release/（mac-install-verify.sh :94 从 release/*.dmg 取最新）
cp /tmp/macos-x/SynovaAgent-*.dmg release/

# 1) 安装 + 启动 + 四断言（A1 进程 / A2 窗口 / A3 healthz / A4 后端日志）
bash scripts/desktop/mac-install-verify.sh --skip-build; echo "exit=$?"    # 期望 0
# evidence: evidence/D519-mac-<date>/（dmg-ls/md5/mount/install/assertions/window/healthz/backend/process）

# 2) 首诊旅程计时（install_start → install_done → app_launch → healthz_200 → first_diagnosis_ready）
bash scripts/desktop/first-diagnosis-timing.sh --mode prod --installer release/<CI dmg>; echo "exit=$?"
# evidence: scripts/golden-scenarios/evidence/first-diagnosis-timing-<date>.json（verdict WITHIN_TARGET/OVER_TARGET 如实）
# ⚠️ LLM key 注入（spec §4.5）: 该脚本内部用 open 启动（不继承 shell env）。
#    首诊实测若要真实 LLM consult，需直接执行二进制或 launchctl setenv（见 §5 已知限制），并在 evidence 记录注入方式。
#    无 key → GS-01 如实 RED（GS01_LLM 未设置时 run.sh 输出 CONSULT_LLM_RED，不伪造绿）

# 3) 数据不丢（临时 userData，真实库零触碰——铁律 0-4）
bash scripts/desktop/upgrade-data-verify.sh --installer release/<CI dmg>; echo "exit=$?"   # 期望 0
# evidence: scripts/golden-scenarios/evidence/upgrade-data-<date>-<ts>/（tables/rows/md5/integrity/summary）
# summary.txt 含 verdict: DATA_RETAINED

# 4) 幂等复跑（第二次验证残留清理）
bash scripts/desktop/mac-install-verify.sh --skip-build; echo "exit=$?"    # 期望 0
```

- 断言原文（非转述）: 每段 evidence 落盘 + 终端输出保留，K3 可对照
- 降级: 任一断言失败 → 脚本 exit 1 + evidence fail.txt 记录失败步（铁律 24）；装不上/启动失败/数据丢失 → 如实记录，不伪造

## 4. ③ Win 实测（DS3）

```bash
# 前置: GUI dsh-ssh 已配置 Windows 目标机（ssh_list 可见）；未配置 → 如实 waiting（D523 DS4，不伪造）
ssh_upload release/SynovaAgent-*.exe → C:\synova-release\            # 传 exe 到 Win 目标机
ssh_exec "powershell -File C:\synova-release\scripts\desktop\win-install-verify.ps1; echo exit=$LASTEXITCODE"
# 期望 exit 0（A 进程 / B 窗口 / C healthz / D 后端日志 四断言）
# evidence: evidence/D523-win-<date>/（exe-md5/process/window/healthz/backend）回传本机
```

- **未配置 Win 目标机** → evidence 标注 `waiting: 无 Windows 目标机（GUI dsh-ssh 未配置）`，Mac 侧不受影响（D523 DS4 先例）
- 红线: 清理只 Stop-Process 本实例 pid，严禁 `taskkill /IM node.exe`（铁律 0-3）

## 5. 已知限制（DS5，如实声明）

| 限制 | 说明 | 处理 |
|---|---|---|
| 签名/公证未做 | dmg/exe 未签名未公证（切片 A descope，无 Apple 证书） | Gatekeeper 绕过路径: 右键打开 → 再点"打开"；或 launchctl 注入后直接执行二进制。已实测记录（见 founder-demo-mac.md） |
| Win 无目标机 | 本机 macOS 无 pwsh；需 GUI 配置 Win 主机 | 未配置 → waiting 如实标注（D523 DS4） |
| LLM key 注入 | `open` 启动不继承 shell env（backend-spawn env={...process.env} 只继承 Electron 进程 env） | 直接执行二进制（继承 shell env）或 `launchctl setenv LLM_API_KEY <值>`；evidence 记录注入方式 |
| 首诊 30 分钟 | 目标值非硬断言（P2-2） | verdict=OVER_TARGET 如实记录，不伪造 |
| 存量测试红 | tests/electron/desktop-build.test.ts:159 断言 `branches: [main]` 但 workflow 为 `[main, 'fix/d529-**']`（D529 变更未同步测试） | 存量债（非 D536 引入），如实记录，建议独立任务修 |

## 6. K3 独立复核路径（DS6）

```bash
# ① artifact 下载 + md5（§2）→ evidence/D536-artifacts-<date>/md5.txt 与 task-state 回填对照
# ② Mac 全链（§3）→ 三段命令重跑，exit 0 + evidence 断言原文
# ③ Win（§4）→ 有目标机重跑 / 无目标机核对 waiting 标注真实性
# ④ 回归: npx vitest run tests/electron/（存量 1 红为 D529 债，见 §5）
# ⑤ 接线: grep founder-demo-mac/win.md 引用脚本 + desktop-deploy-acceptance.md 引用 + task-state 回填
```

## 7. 完成态记录（D536 实测，2026-08-26~27）

| 段 | 结果 | evidence | 备注 |
|---|---|---|---|
| ① artifact 下载+md5 | ✅ | `evidence/D536-artifacts-20260826/` | 五指纹落盘（macOS zip+dmg×2 + Windows zip+exe）；GitHub CDN 限速实测 ~360-440KB/s，1GB 约 3h 串行/45min 并行，SAS URL 10min 过期需刷新续传 |
| ② Mac 安装启动 | ✅ | `evidence/D519-mac-20260827-001651/` + `-003948/` | A1-A4 四断言全过（首次第 4s、幂等第 8s）；exit 0 |
| ② Mac 首诊 | ✅ | `scripts/golden-scenarios/evidence/first-diagnosis-timing-2026-08-27.json` | total_sec=1.8 verdict=WITHIN_TARGET（<30min 目标）；GS-01 LLM 组 CONSULT_LLM_GREEN（phase 0-5 + complete + report 200） |
| ② Mac 数据不丢 | ✅ | `scripts/golden-scenarios/evidence/upgrade-data-2026-08-27-*/` | verdict: DATA_RETAINED（md5 前后一致 + integrity=ok） |
| ③ Win 安装出窗 | ⏸ waiting | `evidence/D536-win-20260827/win-status.txt` | GUI dsh-ssh 无 Win 目标机（ssh_list 空）——D523 DS4 不伪造；exe 已下载校验待补测 |
| ④ checklist 完成态 | ✅ | 本文件 + founder-demo-mac/win.md | 每段 evidence 落点 + 实测日期 + 结论 |

**D536 实测暴露的脚本微调（spec §5.2 回填义务）**:

| 脚本 | 行 | 微调 | 原因（实测暴露） |
|---|---|---|---|
| `scripts/desktop/first-diagnosis-timing.sh` | :73 | `now_ms()` 改 python3 优先 | macOS BSD date 不支持 `%3N`（输出字面 N 且 exit 0，GNU 语法）→ 里程碑全 null → verdict=INCOMPLETE |
| 同上 | :152 | verdict 比较改 `$((TARGET_SEC * 1000))` | TOTAL 是毫秒、TARGET_SEC 是秒——单位不一致导致 1.8s 误判 OVER_TARGET |
| `scripts/golden-scenarios/GS-01-first-diagnosis/run.sh` | :145 | `step_ms()` 改 python3 优先 | 同 now_ms macOS `%3N` bug → consult 计时崩溃 |

> 契约（exit 0/1/2）均未变；微调为 macOS 兼容修复（D519 先例同款）。运行环境注意：主工作区 better-sqlite3 编译于 Node 24（NODE_MODULE_VERSION 137），GS-01/upgrade-data 需 `PATH=~/.nvm/versions/node/v24.19.0/bin:$PATH`；LLM key 走 shell env（dev 服务读 process.env，launchctl setenv 只对 GUI app 生效——首诊实测两者都验证过）。

> 本表由编码 session 在实测后回填（与 task-state/D536.json impl 段一致）。
