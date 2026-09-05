# D533: CI 调试可达性根治 — 凭证共享 + CRLF 治本（收敛版，2026-08-25 审计后重写）

> dev doc | 2026-08-25 | 认领: 🧭 并行 CTO | slice: 控制塔 | 优先级 P1
> 背景: D529（C1 CI 修复）耗时 2.5+ 小时——复盘后先**审计实际代码**再定方案，按"一类一机制防臃肿"原则收敛（初版 5 项 → 审计后 3 项）

---

## 审计结论（先审计代码，不凭声称）

| 初版项 | 审计结果 | 处置 |
|---|---|---|
| ① gh CLI + token | 真正障碍 = **凭证可达**（.credentials.yaml 不存在，GitHub token 仅 CTO 会话持有，执行 session 无）→ 日志 403。gh 是便利工具非根治 | ✅ **收敛为凭证共享**（token 落 .credentials.yaml），gh 可选 |
| ② CRLF 规范化 | 真正根因 = **.gitattributes 缺 eol 规则**（20 行无 text/eol），15 个测试文件脏 | ✅ **保留**（一行规则治本） |
| ③ 机器人 merge 豁免 | **非真正问题**——D529 的"机器人提交"实为 synova-mac 人工提交；debug 回传已移除（9cfb3cdc），无 CI bot 提交机制 | ❌ **取消**（防膨胀） |
| ④ CI 挂起探针 | **非真正问题**——挂起根因 = @electron/rebuild 编译（已被 prebuild-install 下载 prebuilt 替换，无编译不会挂起） | ❌ **取消**（防膨胀，等真出现再处理） |
| ⑤ debug 回传纪律 | 文档纪律（防未来重建抢道） | ✅ **保留为文档纪律**（非代码机制） |

**原则**：D529 的技术病根（@electron/rebuild 挂起）已被 prebuild-install 治了；本任务只治**真正的机制病根**（凭证可达 + CRLF），不新增防未来机制（膨胀）。

---

## 方案（3 项）

### ① 凭证共享：GitHub token 落 .credentials.yaml（真正问题：日志可达性）

**问题**：`.credentials.yaml` 不存在；GitHub token（ghp_*）仅 CTO 会话持有（硬编码），编码/并行 CTO session 无 → Actions 日志下载 403、取消挂起 401 → 每轮盲猜 15-20 分钟。

**方案**：
1. 创建/补 `.credentials.yaml` 的 `GITHUB_TOKEN` 条目（token 由主 CTO 提供，权限 actions:read + repo，0600）
2. 可选：装 gh CLI（darwin-arm64 官方二进制到 ~/.local/bin/gh，`gh auth login --with-token`）——便利工具，非必须（curl + token 即可下载日志）
3. **验证**：`curl -s -H "Authorization: token $GITHUB_TOKEN" .../actions/runs/<id>/jobs/<id>/logs` 能拉到日志（5 分钟可见）；`gh auth status`（如装 gh）

**最小机制**：凭证落位 = 一行配置；不新增任何门禁/脚本

### ② CRLF 治本：.gitattributes 加 eol 规则（真正问题：脏文件挡 checkout）

**问题**：`.gitattributes` 20 行无 `text/eol` 规则 → `tests/control-tower/*.test.sh` 15 个文件 CRLF 永久脏 → 反复挡 checkout/rebase（D529 被迫 assume-unchanged 舞蹈）。

**方案**：
1. `.gitattributes` 加：`*.sh text eol=lf` + `*.py text eol=lf`（一行规则防一类）
2. `git add --renormalize` 一次性规范化全部脏文件
3. **验证**：`git status` 零 CRLF 噪音 + `git diff origin/main` 干净

**最小机制**：一行 .gitattributes 规则（治本），非新脚本

### ③ debug 回传纪律（文档级，防未来重建）

**方案**：控制塔文档（CT 队列/复盘纪律）加一条：**未来任何 CI debug 回传必须推 `ci-debug/*` 独立分支，永不动工作分支；首选 curl/gh 日志通道（①已解决）**。

**最小机制**：一条文档纪律，无代码

---

## 明确不做（防膨胀）

- ~~CI 挂起探针~~：挂起根因已消除（prebuild-install 无编译），等真出现再处理
- ~~机器人 merge 豁免~~：无 CI bot 提交（debug 回传已移除），非真正问题
- ~~gh CLI 强制安装~~：可选工具，curl + token 即可

## 写集

- 可碰：`.credentials.yaml`（token，本地 0600，不 commit）、`.gitattributes`（eol 规则）、`tests/control-tower/*.test.sh`（renormalize）、控制塔文档（纪律）
- 不碰：`src/`、`scripts/audit/`、产品代码；**不新增控制塔脚本**

## 验证（物理可复现）

1. ①：`curl -H "Authorization: token $GITHUB_TOKEN" .../logs` 拉到最近失败 run 日志
2. ②：`git status` 零噪音 + .gitattributes 含 `*.sh text eol=lf`
3. ③：控制塔文档有"ci-debug 独立分支"纪律条目

## 自检（铁律 47/48）

- ① 凭证：契约（token 落位→curl 拉到日志），无新增机制
- ② CRLF：renormalize 后 `git diff origin/main` 零噪音
- ③ 纪律：文档条目存在（grep 物理证明）
