# D318 — 双机身份隔离 + hooks 可移植（install-hooks 全覆盖 + configure-machine + 自检）

任务 ID: D318 | Agent: claude-code | 会话: 2026-08-09

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔要跑两台机器（Windows + Mac）。dev doc（SYNOVA-IMPL-D318）声明 3 缺陷。claim-verifier 独立核实结果：

- 缺陷 A ✅ 属实: install-hooks.sh L33 只装 post-commit（L34 注释"后续新增"）。.git/hooks 现有 4 包装器，3 个不在管理范围 → 新克隆缺 12 组门禁 + pre-push 入口
- 缺陷 B ✅ 属实: .git/hooks/post-commit 硬编码 `D:/novis-backup-20260526/...`（旧版安装残留）；pre-push/commit-msg 是 toplevel-relative 范本
- 缺陷 C ✅ 属实: `git shortlog -sne --all` 1336 条全 ClawOrg 同身份
- ⚠️ dev doc §2.4 不实: 声称 core.hooksPath 未设置——实测 .git/config (local) 设置为 Windows 反斜杠绝对路径 `D:\novis-backup...\.git\hooks`。值是默认位置的显式化（unset 行为不变）但 Mac 上该目录不存在 → 4 个 hook 全部静默失效（比缺陷 B 更广）。仓库内无脚本写它（grep 零结果）→ 历史遗留 → 本任务 unset + verify 检测脏值防拷贝场景
- ⚠️ dev doc §3.2 示例代码 2 bug: ① body 第一行 `$(git rev-parse)` 立即展开 → 包装器写死绝对路径（正是要消灭的问题）；② pre-commit 包装器只剩一行调用，丢掉现 wrapper 的"双日志分离 + 成功标记"逻辑（失败→pre-commit-failures.log / 成功→last-precommit-success marker，post-commit 靠 marker 检测 --no-verify 绕过）→ 按 dev doc 实现会每次提交误报 bypass
- ⚠️ dev doc configure-machine 用 `${ROLE^}`（bash 4+ case-modification）→ Mac 默认 bash 3.2 bad substitution 必挂 → 改 case 全映射

### b) 文件审计
- scripts/install-hooks.sh（56 行）: install_hook 只支持 tracked（scripts/hooks/<name>.sh）模式，post-commit 单装 + synova-commit alias（Windows bash.exe 绝对路径 / Mac bash——已可移植）
- scripts/ 有 pre-commit-check.sh / pre-push-check.sh / commit-msg-check.sh 3 个入口（entry 模式）
- scripts/hooks/ 有 post-commit.sh + 5 个 hook-*.sh（PreToolUse/PostToolUse 用，非 git hooks）
- scripts/setup/ 不存在（新建）；docs/synova/setup/ 不存在（新建）；tests/control-tower/ 已有 7 套测试（本任务新建第 8 套）
- .env.example 有 LLM_API_KEY/LLM_BASE_URL/LLM_MODEL（DeepSeek）；scripts/feishu-bridge/feishu_bridge.py 头块有 lark-cli 安装+Keychain 凭据文档（MACBOOK-SETUP.md 引用）
- docs/plans/codex/implementation/SYNOVA-IMPL-D283-Setup-Guide-20260730.md 存在（客户安装引导，非本任务范围，不混入）

### c) 决策
3 缺陷属实 + 2 dev doc 实现 bug 修正 + 1 不实声明修正（core.hooksPath 已设置 → unset + verify 检测）。测试先行（新建 hooks-install.test.sh 4 用例 red→green，临时克隆隔离）。版本编排 D319 独占（本任务不碰 VERSION.md，仅追加 version.log 运行时条目——self-health 版本一致性查"脚本头 vs VERSION.md"不查 version.log，无冲突已核）。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 测试先行 — tests/control-tower/hooks-install.test.sh 新建（临时克隆 mktemp + git clone file:// 隔离，用例 red→green：4 hook 存在 / 无 D:/ 硬编码 / verify exit 0 / configure --role mac 设身份）
② 实现 — install-hooks.sh: install_hook 覆盖 4 hook，entry（pre-commit/pre-push/commit-msg → scripts/*-check.sh）与 tracked（post-commit → scripts/hooks/post-commit.sh）双模式；包装器统一 `$(git rev-parse --show-toplevel)` 运行时求值（禁绝对路径）；pre-commit 保留双日志+marker 3 段逻辑（不写进 .git 的 version 标注不动）
③ 实现 — scripts/setup/configure-machine.sh: `--role win|mac`（默认 win）case 映射 → user.name=ClawOrg-Win/Mac + user.email=claworg@users.noreply.github.com（local config，机器归属靠 name 前缀，GitHub 归属靠同一 noreply 邮箱）→ 跑 install-hooks.sh → 跑 verify-hooks-installed.sh → 输出摘要
④ 实现 — scripts/setup/verify-hooks-installed.sh: 4 hook 存在+可执行 / 包装器无 `D:` `C:` `/Users/` `/home/` 硬编码绝对路径 / core.hooksPath 若为 Windows 绝对路径格式报错提示 unset / synova-commit alias 存在；exit 0/1 fail-open degraded 输出
⑤ 文档 — docs/synova/setup/MACBOOK-SETUP.md: 克隆/configure-machine --role mac/Node/Python/lark-cli+Keychain/DeepSeek env/首次自测（引用 .env.example + feishu_bridge.py 头块真实内容）
#CRITERIA: A

### b) 执行约束
- 铁律 0-2: spec（dev doc 已批准 + 核实修正）→ test → impl → wire → review
- 铁律 35: 自动化优先 — verify-hooks-installed.sh 使"hooks 装好"可物理验证
- 铁律 48: 新测试 ≥4 用例 × 真实断言（正常/降级/边界）
- bash 3.2 兼容（Mac 默认）: 禁 `${ROLE^}`/`${var,,}` 等 bash 4+ 语法；本机 bash 5.3 测过 ≠ Mac 能跑（3.2 无 `local -n`/case-modification）
- core.hooksPath 本机 unset（local，行为 no-op：当前值=默认 .git/hooks；仓库无写入者不会复活）
- 铁律 46/47: 不涉 engine-core
- claim-verifier 结论: 3 缺陷属实（实测证据）；2 dev doc 实现 bug 已识别并修正设计；1 不实声明（core.hooksPath）按实测修正

## Q2: 范围 — 正确的最简方案是什么？

做什么（严格按 dev doc 写集 + 核实修正）：
- scripts/install-hooks.sh：install_hook 改造——entry/tracked 双模式 + 4 hook 全装（pre-commit/commit-msg/pre-push/post-commit）+ 包装器 `$(git rev-parse --show-toplevel)` 运行时相对定位（禁绝对路径）+ pre-commit 保留双日志分离+成功标记 3 段逻辑 + synova-commit alias 安装保留
- scripts/setup/configure-machine.sh：新建——`--role win|mac`（默认 win）case 映射身份（ClawOrg-Win/ClawOrg-Mac + claworg@users.noreply.github.com，local config）+ 跑 install-hooks + 跑 verify-hooks-installed + 摘要输出；bash 3.2 兼容；`git -C "$ROOT"` 定位（任意 cwd 可跑）
- scripts/setup/verify-hooks-installed.sh：新建——4 hook 存在+可执行 / 包装器无 `D:`/`C:`/`/Users/`/`/home/` 硬编码 / core.hooksPath 非 Windows 绝对路径 / synova-commit alias 存在；exit 0/1 + degraded 输出
- tests/control-tower/hooks-install.test.sh：新建——临时克隆（mktemp + git clone file://）4+ 用例（4 hook 装全 / 无 D:/ / verify exit 0 / configure --role mac 身份 / 可选: commit 触发 pre-commit 不 --no-verify）
- docs/synova/setup/MACBOOK-SETUP.md：新建——Mac 上手指南（克隆/configure/Node/Python/lark-cli+Keychain/DeepSeek env/首次自测）
- .claude/task-briefs/D318-dual-machine-hooks.md：本 brief
- docs/plans/codex/implementation/SYNOVA-IMPL-D318-双机身份与hooks可移植-20260808.md：dev doc（spec 落库，跟 D317 惯例）
- .git/config：unset core.hooksPath（本机，不被 git 跟踪无 diff）
- .codex/control-tower/logs/version.log：control_tower_log.py version --version 4.7.0 追加（gitignore 运行时产物）

不做什么（含文件路径）：
- 不改 .codex/control-tower/VERSION.md（D319 独占批次版本编排 V4.7.0）
- 不改 docs/synova/DASHBOARD.md（D320 独占）
- 不改 src/server.ts（及 src/ 下其他——D309/D310 独立任务）
- 不改 .github/workflows/ci.yml（CI 非本任务）
- 不改 package.json（Node 依赖/脚本不动；lark-cli 为 Mac 上手文档引用内容非安装）

## Q3: 验收 — 入口 → 交互 → 结果

入口：本机 `bash scripts/install-hooks.sh`（重装 4 hook）+ `bash scripts/setup/configure-machine.sh --role win`（设身份+自检）；测试入口 `bash tests/control-tower/hooks-install.test.sh`
处理：install_hook 按 entry/tracked 生成 toplevel-relative 包装器（pre-commit 含双日志+marker）→ verify 自查 4 项 → configure 写 local 身份
结果：.git/hooks 4 个包装器全 toplevel-relative（grep D:/ 零结果）；user.name=ClawOrg-Win；verify exit 0；测试 4+ 用例全绿；临时克隆 commit 触发 pre-commit 不绕过

## 架构层: 基础设施
控制塔（scripts/install-hooks.sh + scripts/setup/ + tests/control-tower/ + docs/synova/setup/）。不触产品架构层代码。

## Done 标准
- [ ] bash tests/control-tower/hooks-install.test.sh 全过（≥4 用例；修复前 red 已证）
- [ ] grep -rn "D:/" .git/hooks/ scripts/install-hooks.sh scripts/setup/ 零结果
- [ ] bash scripts/setup/verify-hooks-installed.sh exit 0
- [ ] bash scripts/setup/configure-machine.sh --role win 后 git config user.name = ClawOrg-Win（local）
- [ ] git config --get core.hooksPath 为空（已 unset）；verify 检测 Windows 绝对路径格式有实现
- [ ] version.log 含 {"version": "4.7.0", ... "D318"} 条目（gitignore 运行时产物）
- [ ] 临时克隆 git commit --allow-empty 触发 pre-commit（不 --no-verify）
- [ ] git diff --name-only 与写集一致；pre-commit 12 组全过无 --no-verify
