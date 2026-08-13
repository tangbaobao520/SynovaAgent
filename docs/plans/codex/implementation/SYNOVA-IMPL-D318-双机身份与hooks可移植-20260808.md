<!--
  SYNOVA-IMPL-D318: 双机身份隔离 + hooks 可移植（configure-machine + 全量 hook 安装 + 自检）
  状态: dev doc | 2026-08-08 | 优先级 P0 (Mac 双机前置)
  权威文档: AGENTS.md 铁律 0-3/34/35 + windows-compat skill 模式 2 + 双机规划 (2026-08-08)
  依赖: 无
  并行: D319/D320 写集零交集（D318: scripts/install-hooks.sh + scripts/setup/ + docs/synova/setup/；D319: synova-commit + pre-push-check + VERSION.md；D320: gen-task-board.py + DASHBOARD + coverage/）；**版本编排由 D319 独占（批次统一 V4.7.0 = D318+D319+D320）**；version.log 为 gitignore 运行时产物无 git 冲突
-->

# D318: 双机身份隔离 + hooks 可移植

> 一句话问题: 同一仓库要跑两台机器（Windows + Mac），但当前 ① hooks 只装在 .git/hooks（新克隆缺 3 个门禁入口且 post-commit 硬编码 `D:/` 绝对路径，Mac 必挂）；② 全部 1336 个提交同一身份 `ClawOrg`，无法区分机器归属。

## 1. 权威文档引用

**来源**: [AGENTS.md 铁律 34/35](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 自动化优先——能写 check-*.sh 的不靠 review；Feature Branch 强制。

**来源**: [windows-compat skill 模式 2](D:\novis-backup-20260526\Novis\synova-agent\.claude\skills\windows-compat\SKILL.md)

> 注册表 PATH vs Git Bash 会话 PATH 差异；hook 必须自包含环境。

## 2. 代码审计——现状 (2026-08-08 实测)

### 2.1 缺陷 A (P0): install-hooks.sh 只装 post-commit，新克隆缺 3 个门禁入口

[install-hooks.sh L25](D:\novis-backup-20260526\Novis\synova-agent\scripts\install-hooks.sh:25) 只有 `install_hook "post-commit"`（pre-commit/pre-push/commit-msg 注释为"后续新增"）。实测 `.git/hooks/` 现有 pre-commit/commit-msg/pre-push/post-commit 4 个包装器，但 pre-commit 等 3 个不在 install-hooks.sh 管理范围——新克隆跑 install-hooks 后**只有 post-commit + synova-commit alias**，12 组门禁和 pre-push 全缺。

### 2.2 缺陷 B (P0): post-commit 包装器硬编码绝对路径

实测 [.git/hooks/post-commit](D:\novis-backup-20260526\Novis\synova-agent\.git\hooks\post-commit) 内容：

```bash
exec bash "D:/novis-backup-20260526/Novis/synova-agent/scripts/hooks/post-commit.sh"
```

`D:/...` 是 Windows 专用绝对路径——Mac 上 `git commit` 直接失败。对比 [.git/hooks/pre-push](D:\novis-backup-20260526\Novis\synova-agent\.git\hooks\pre-push) 用 `$(git rev-parse --show-toplevel)` 相对定位（可移植范本），post-commit 是旧版安装残留。

### 2.3 缺陷 C (P1): 单身份无法区分机器

实测 `git config user.name` = `ClawOrg`，`git shortlog -sne --all` 1336 条全部同身份（+10 dependabot + 1 VS Code）→ 双机并行后无法回答"哪个提交来自哪台机器"。

### 2.4 现状确认

- `core.hooksPath` 未设置；包装器靠 install-hooks.sh 逐机生成（绝对路径）。
- package.json `"hooks:install": "bash scripts/install-hooks.sh"` 已存在。
- synova-commit alias 由 install-hooks.sh 安装（Windows 用 Git bash.exe 绝对路径，Mac 用 `bash`）。

## 3. 实现方案

### 3.1 写集 (1 修改 + 4 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/install-hooks.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\install-hooks.sh) | 修改 | install_hook 覆盖 pre-commit/pre-push/commit-msg/post-commit 4 个；包装器统一 `bash "$(git rev-parse --show-toplevel)/scripts/<入口>.sh"` 相对定位（禁绝对路径） |
| [scripts/setup/configure-machine.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\setup\configure-machine.sh) | 新建 | `--role win|mac`：设置 per-clone 身份——**user.name 区分机器（`ClawOrg-Win`/`ClawOrg-Mac`），user.email 保持同一账号 noreply（`claworg@users.noreply.github.com`，机器区分靠 name，GitHub 归属不丢）** → 跑 install-hooks.sh → verify-hooks-installed → 输出机器配置摘要 |
| [scripts/setup/verify-hooks-installed.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\setup\verify-hooks-installed.sh) | 新建 | 检查 4 hook 存在 + 包装器无 `D:/`/`/Users/` 硬编码绝对路径 + synova-commit alias 存在；exit 0/1，fail-open 输出 degraded |
| [tests/control-tower/hooks-install.test.sh](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\hooks-install.test.sh) | 新建 | 临时克隆场景测试（≥4 断言，见 §4） |
| [docs/synova/setup/MACBOOK-SETUP.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\setup\MACBOOK-SETUP.md) | 新建 | Mac 完整上手指南（克隆/身份/Node/Python/lark-cli+Keychain/DeepSeek/首次自测） |

### 3.2 修复模式

**install-hooks.sh（替换 install_hook 函数 + 调用列表）**:

```bash
install_hook() {
  local name="$1"
  local entry="$ROOT/scripts/${name}-check.sh"   # pre-commit-check.sh / pre-push-check.sh / commit-msg-check.sh
  local tracked="$ROOT/scripts/hooks/${name}.sh" # post-commit 等 hooks/ 逻辑
  local target="$ROOT/.git/hooks/$name"
  local body
  if [ -f "$entry" ]; then
    body="bash \"$(git rev-parse --show-toplevel)/scripts/${name}-check.sh\"${name:+ }\"\$1\""
    if [ "$name" = "commit-msg" ]; then body="bash \"\$(git rev-parse --show-toplevel)/scripts/commit-msg-check.sh\" \"\$1\""; fi
    if [ "$name" = "pre-commit" ] || [ "$name" = "pre-push" ]; then body="bash \"\$(git rev-parse --show-toplevel)/scripts/${name}-check.sh\""; fi
  elif [ -f "$tracked" ]; then
    body="exec bash \"\$(git rev-parse --show-toplevel)/scripts/hooks/${name}.sh\""
  else
    echo "  !! $name 无入口 — 跳过"; return
  fi
  printf '#!/bin/bash\n%s\n' "$body" > "$target"
  chmod +x "$target"
  echo "  ✅ $name"
}
install_hook "pre-commit"
install_hook "commit-msg"
install_hook "pre-push"
install_hook "post-commit"
```

**configure-machine.sh 核心**:

```bash
ROLE="${1:-win}"
git config user.name "ClawOrg-${ROLE^}"
git config user.email "claworg@users.noreply.github.com"           # 同一账号邮箱（GitHub 归属不丢）
bash "$(git rev-parse --show-toplevel)/scripts/install-hooks.sh"
bash "$(git rev-parse --show-toplevel)/scripts/setup/verify-hooks-installed.sh"
git config --list | grep -E "user\.(name|email)|alias\.synova-commit"
```

> 注：per-clone 身份只写 local config（不碰 global），两台机器互不覆盖；**机器归属靠 `user.name` 前缀区分（`git log --author="ClawOrg-Win"`），邮箱保持同一账号以保证 GitHub 提交归属正确**（勿用 `+win` 之类非标准 noreply 后缀）。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 改 core.hooksPath 指向仓库内目录 | install-hooks 已够用且改动面小；hooks 目录进仓库会与业务文件混在一起（D308 可再议） |
| 迁移历史提交身份 | 历史不可改写（铁律），从 D318 起新提交带机器身份即可 |
| 双机 CI/CD 分支策略 | 独立任务（双机 SOP，D323） |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 新建 `tests/control-tower/hooks-install.test.sh`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| 临时克隆跑 install-hooks 后 4 hook 存在 | 只有 post-commit → 断言 pre-commit 存在失败 | 4 个全在 |
| 包装器无 `D:/` 硬编码 | .git/hooks/post-commit 含 `D:/` → 断言通过失败 | 全部 toplevel-relative |
| verify-hooks-installed exit 0 | 缺失 hook → exit 1 | exit 0 |
| configure-machine --role mac 设身份 | 未实现 | user.name=ClawOrg-Mac |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | shell 单元（新建） | ≥4 | 上述 4 用例（正常/降级/边界） |
| L1 | 手工验证 | 1 | Mac 或模拟克隆全流程（clone → configure → pre-commit 可跑） |

> 临时克隆用 `mktemp -d` + `git clone -q file://<repo>`（本地克隆，不依赖网络）；install-hooks.sh 对临时克隆的 ROOT 生效。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| 4 个 hook 被 git 调用 | `.git/hooks/` 4 文件存在 + 内容 toplevel-relative（grep 无 `D:/`） |
| configure-machine.sh 文档化 | MACBOOK-SETUP.md 引用 `bash scripts/setup/configure-machine.sh --role mac` |
| verify-hooks-installed 可用 | 独立脚本 exit 0；README 建议安装后必跑 |

## 6. 完成标准

1. DS1: `tests/control-tower/hooks-install.test.sh` 全过（≥4 用例；修复前 red 已证）
2. DS2: `.git/hooks/` 4 hook 全在；`grep -rn "D:/" .git/hooks/ scripts/install-hooks.sh` 零结果
3. DS3: `bash scripts/setup/verify-hooks-installed.sh` exit 0
4. DS4: `bash scripts/setup/configure-machine.sh --role win` 后 `git config user.name` = `ClawOrg-Win`（local）
5. DS5: 版本由批次统一 **V4.7.0**（D319 编排，本任务不碰 VERSION.md）；运行时 `control_tower_log.py version --version 4.7.0 --changes "D318 双机身份+hooks"` 追加 version.log（gitignore）
6. DS6: 全量审计 `python scripts/audit/audit-check.py --full` 与基线一致（439 FAIL）+ as any=0
7. DS7: 干净克隆模拟（临时 worktree）install-hooks 后 `git commit --allow-empty -m "test"` 触发 pre-commit（不 --no-verify）
8. DS8: 无 --no-verify、`git diff --name-only` 与写集一致

## 7. 自检清单

- [x] install-hooks.sh L25 只装 post-commit 实测确认
- [x] .git/hooks/post-commit 硬编码 `D:/` 路径实测确认；pre-push 为 toplevel-relative 范本
- [x] `git shortlog -sne --all` 单身份 1336 条实测确认
- [x] 测试优先：4 用例 red→green 设计（§4 表）
- [x] 不是凭记忆
- [x] 不用 --no-verify
