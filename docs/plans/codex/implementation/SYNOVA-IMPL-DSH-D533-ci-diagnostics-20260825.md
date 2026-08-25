# D533: CI 调试时间黑洞根治 — gh CLI + 日志可达 + CRLF + merge 豁免 + 挂起探针

> dev doc | 2026-08-25 | 认领: 🧭 并行 CTO | slice: 控制塔 | 优先级 P1
> 背景: D529（C1 desktop-build CI 修复）耗时 2.5+ 小时、11 轮 CI 迭代——复盘（编码 session 诚实版）+ CT-46 教训固化。本任务把复盘建议落地为**机制级根治**，防下一个 D520/D529。

---

## 问题（D529 复盘的四类时间黑洞）

| # | 类别 | 耗时占比 | 根因 |
|---|---|---|---|
| A | CI 等待 | ~40% | **无日志可达性**（无 gh/token → 403/401）→ 每轮盲猜 15-20 分钟 |
| B | git 机制 | ~30% | 机器人 debug 提交抢道 / bypass.log 逐笔补记 / CRLF 脏文件挡 checkout |
| C | 技术诊断 | ~25% | 4 个双平台根因（bcrypt N-API 隐藏最深，本可 10 秒读包元数据发现） |
| D | 节奏 | — | 挂起后继续走 node-gyp 升级路线，未先质疑"是否需要重建" |

**根治目标**：CI 调试从"11 轮盲猜"降到"3 轮内定位"。

## 方案（5 项根治）

### ① gh CLI 安装 + GitHub token 共享（最大杠杆，省 ~5 轮）

**问题**：本机无 gh CLI、无 token → Actions 日志下载 403、取消挂起 run 401。
**方案**：
1. 下载安装 gh（GitHub CLI）darwin-arm64 官方二进制到 `~/.local/bin/gh`（无 brew，直接 GitHub releases 下载，验证 sha256）
2. GitHub token 共享：token 写入 `.credentials.yaml`（`GITHUB_TOKEN` 条目，权限需 `actions:read` + `repo`），DSH 会话可读取；或 `gh auth login --with-token`
3. **验证**：`gh auth status` + `gh run view --log -R tangbaobao520/SynovaAgent` 能看最近 run 日志；`gh run cancel` 能取消挂起 run
4. **纪律**：所有执行 session（编码/CTO/并行 CTO）开工 CI 调试前先 `gh auth status` 确认可达——日志 5 分钟可见，不再盲猜

**安全**：token 是敏感凭证——仅本机（mac），`.credentials.yaml` 权限 0600；不 commit 进仓库（确认 .gitignore 覆盖）

### ② CRLF 规范化（消除挡 checkout/rebase 的脏文件）

**问题**：`tests/control-tower/*.test.sh` 多个文件 .gitattributes 与存储 blob 不一致（CRLF 永久脏）→ 反复挡 checkout/rebase，被迫 assume-unchanged 舞蹈。
**方案**：
1. 定位全部脏文件（`git diff --name-only origin/main | grep -E '\.test\.(sh|py)$'` + `file` 检查 CRLF）
2. 一次性规范化：`git add --renormalize` + 明确 `.gitattributes` 规则（`*.sh text eol=lf` / `*.py text eol=lf`）
3. 验证：`git status` 干净 + `git diff origin/main` 零 CRLF 噪音

### ③ 机器人提交 merge 豁免（消除逐笔补记）

**问题**：CI 机器人（debug 回传/bypass 登记）提交每次要人工补记 bypass.log（D331 对账），甚至 hash 抄错多跑一轮。
**方案**：
1. 机器人/CI 提交（GITHUB_ACTIONS 环境或 ci-debug 分支）豁免 bypass.log 逐笔补记——检测到 CI 环境（`$GITHUB_ACTIONS=true` 或提交者 bot）自动登记，不拦人工
2. 或：bypass 补记自动化（post-commit 检测 CI 提交 → 自动写 COMMITTED 行，不依赖人工）
3. **红线**：不削弱真实绕过检测（人工 --no-verify 仍严格对账）——只豁免"CI 机器人生成的提交"

### ④ CI 步骤挂起探针 + 首行输出（挂起 10 秒报卡点，不等到 10 分钟超时）

**问题**：D529 的 `@electron/rebuild` 挂起 10 分钟超时无输出（step log 空）——只报超时不报卡点。
**方案**（desktop-build.yml 构建步骤统一加）：
1. **首行输出**：每个构建步骤第一条命令 `echo "::group::<step> start"` + 关键命令前 echo 进度
2. **挂起探针**：`timeout 60 bash -c 'while true; do echo "probe alive"; sleep 10; done' &`（或 npm 命令加 `--foreground-scripts` 实时输出）——挂起时探针输出显示"卡在 X"，而非静默到超时
3. 或最小版：构建命令统一 `2>&1 | tee step-<name>.log`（D529 已有），**加 `tail -f` 式实时输出**（CI 日志能看到进度而非最后一块）
4. **验证**：构造挂起（临时 sleep 120）→ CI 日志 10 秒内显示探针，不等到超时

### ⑤ CI debug 回传纪律（防未来重建抢道）

**问题**：D529 期间自建"失败日志双通道回传"（ci-debug/ + ::error::）→ 机器人提交与人工 push 抢道 6+ 次。
**纪律**（写进控制塔文档 + CT-46 引用）：
1. 未来任何 CI debug 回传**必须推独立分支 `ci-debug/*`**，永不动工作分支
2. debug 日志保留期 1 周自动清理（ci-debug/ 不进 main）
3. 首选通道是 gh CLI 日志（①已解决），回传机制仅兜底

## 写集

- 可碰：`~/.local/bin/gh`（安装）、`.credentials.yaml`（token，本地不 commit）、`.gitattributes`（CRLF 规则）、`tests/control-tower/*.test.sh`（renormalize）、`.github/workflows/desktop-build.yml`（挂起探针）、控制塔文档（CT 队列/复盘纪律）
- 不碰：`src/`、`scripts/audit/`、产品代码

## 验证（物理可复现）

1. `gh auth status` 通过 + `gh run view --log` 拉到最近 run 日志 + `gh run cancel` 生效
2. `git status` 零 CRLF 噪音 + `.gitattributes` 有 `*.sh text eol=lf`
3. CI 机器人提交不再需要人工补记 bypass.log（日志有自动 COMMITTED 行）
4. desktop-build 构建步骤日志有首行输出/探针（挂起 10 秒可见）
5. ci-debug 纪律写进控制塔文档（未来 debug 回传走独立分支）

## 自检（铁律 47/48）

- gh 安装：契约（下载→校验→auth→可用），测试 `gh --version` + `gh auth status`
- CRLF：renormalize 后 `git diff origin/main` 零噪音（grep 物理证明）
- merge 豁免：测试 CI 环境提交自动登记 vs 人工 --no-verify 仍拦（红线不破）
- 挂起探针：临时构造挂起步骤，CI 日志 10 秒内报卡点
