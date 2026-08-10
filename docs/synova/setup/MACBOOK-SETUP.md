# Mac 上手指南 — SynovaAgent 双机部署（D318）

> 目标: 在 Mac 上建立第二台机器工作区。同一仓库、同一 GitHub 账号，提交身份用
> `ClawOrg-Mac` 与 Windows 的 `ClawOrg-Win` 区分（机器归属靠 `user.name` 前缀，
> GitHub 提交归属靠同一 noreply 邮箱，互不丢失）。
>
> 预计 15 分钟。全部命令在仓库根目录执行。

## 1. 前置条件

| 工具 | 最低要求 | 验证 |
|------|---------|------|
| git | 2.30+（Xcode Command Line Tools 自带） | `git --version` |
| Node.js | 20+（参考本机 v24.16.0） | `node --version` |
| Python | 3.10+（参考本机 3.13.13） | `python3 --version` |

```bash
# 首次安装 Xcode Command Line Tools（含 git）
xcode-select --install
# Homebrew 装 Node（如无）
brew install node
```

## 2. 克隆 + 机器配置（5 分钟）

```bash
git clone git@github.com:tangbaobao520/SynovaAgent.git
cd SynovaAgent

# 一键配置: 身份（ClawOrg-Mac）+ 4 个 hooks + 自检
bash scripts/setup/configure-machine.sh --role mac
```

`configure-machine.sh` 做三件事（per-clone local config，不碰 global）:

1. **身份**: `user.name = ClawOrg-Mac` + `user.email = claworg@users.noreply.github.com`
2. **hooks**: 安装 pre-commit / commit-msg / pre-push / post-commit 四个包装器
   （全部 toplevel-relative，无绝对路径硬编码——双机可移植）
3. **自检**: `verify-hooks-installed.sh` 4 项检查，全过才 exit 0

> ⚠️ 身份是 per-clone 的。Windows 机器跑 `--role win`，Mac 跑 `--role mac`，
> 两台机器互不覆盖。查看某提交来自哪台机器:
> `git log --author="ClawOrg-Win" --oneline | head`。

## 3. 依赖安装 + 首次自测（5 分钟）

```bash
npm install          # Node 依赖
npm run check:all    # tsc + vitest + 铁律门禁（全过才继续）

# hooks 自检（安装后必跑）
bash scripts/setup/verify-hooks-installed.sh

# 双机 hooks 测试（临时克隆模拟第二台机器，全 12 断言过）
bash tests/control-tower/hooks-install.test.sh

# 真实提交验证（身份 + 12 组门禁一起验）
git add -A && git commit -m "chore(D318): mac-first-commit"
git log -1 --format='%an <%ae>'    # 应显示 ClawOrg-Mac <claworg@users.noreply.github.com>
```

## 4. LLM 配置（DeepSeek）

```bash
cp .env.example .env
```

编辑 `.env`（必填项）:

| 变量 | 说明 |
|------|------|
| `LLM_API_KEY` | DeepSeek API Key |
| `LLM_BASE_URL` | 默认 `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 默认 `deepseek-v4-flash` |

其余（`PORT`/`ENGINE_TOKENS`/`CREDENTIAL_MASTER_KEY`）按 `.env.example` 注释填写。

## 5. 飞书对话桥（可选 — scripts/feishu-bridge/）

依赖 lark-cli（凭据存系统 Keychain）:

```bash
npm install -g @larksuite/cli
lark-cli config init --app-id <app-id> --app-secret-stdin --brand feishu
```

飞书开放平台（open.feishu.cn）: 应用添加「机器人」能力 + 权限
`im:message.p2p_msg:readonly` / `im:message:send_as_bot` + 事件订阅
`im.message.receive_v1`（长连接，无需公网 URL）+ 发布版本。

Mac 运行环境变量（注意：脚本默认值是 Windows `.cmd` 路径，Mac 必须显式指定）:

```bash
export LARK_CLI_BIN="$(command -v lark-cli)"
export CODEX_BIN="$(command -v codex)"
export SYNOVA_REPO="$(pwd)"
python3 scripts/feishu-bridge/feishu_bridge.py
```

## 6. 常见问题

| 症状 | 原因 | 修复 |
|------|------|------|
| `verify-hooks-installed` 报 core.hooksPath Windows 路径 | 文件夹整体拷贝（非 git clone）带脏 local config | `git config --unset core.hooksPath` 后重跑 configure |
| commit 时报 "bash: D:/... No such file" | hooks 包装器是旧版绝对路径残留 | 重跑 `bash scripts/setup/configure-machine.sh --role mac` |
| 身份显示 ClawOrg 而非 ClawOrg-Mac | 没跑 configure | 跑 `bash scripts/setup/configure-machine.sh --role mac` |
| 门禁 12 组全过但 commit 被拒 | commit-msg 格式 | 用 Conventional Commits: `feat(scope): 描述`，body 含任务引用（如 `D318`） |
