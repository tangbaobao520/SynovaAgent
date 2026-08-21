# 飞书 ↔ Codex 对话桥 (v2.0 — lark-cli 版)

在飞书里与 Codex 对话：给机器人发消息 → 桥接服务转发给 Codex（`codex exec`，会话续接）→ 回复发回飞书。

## 架构

```
飞书用户 → 飞书机器人(官方 CLI 事件长连接) → feishu_bridge.py → codex exec/resume --cd <repo> --json
                                      ↑                                            ↓
                          lark-cli event consume                         chat_id→thread_id 映射
                                      ↓                                            ↓
                              回复原消息 ←—— lark-cli im +messages-reply ←—— 回复文本
```

全部飞书侧能力走官方 [@larksuite/cli](https://github.com/larksuite/cli)（`lark-cli`），不再依赖 lark-oapi。
`lark-cli event consume im.message.receive_v1` 用**长连接**接收事件，无需公网 URL / 回调服务器。

## 一、飞书侧准备（需你在 open.feishu.cn 操作）

1. 打开 [飞书开放平台](https://open.feishu.cn) → 开发者后台 → 创建/选择企业自建应用
2. 应用能力 → 添加「机器人」
3. 权限管理 → 开通：
   - `im:message.p2p_msg:readonly`（接收单聊消息事件）
   - `im:message:send_as_bot`（以机器人身份发消息/回复）
4. 事件订阅 → 选**长连接模式**（无需公网 URL）→ 订阅 `im.message.receive_v1`
5. 凭证与基础信息 → 记下 **App ID / App Secret**
6. **创建版本并发布**（否则机器人不可用，scope 变更后必须重新发布）
7. 在飞书里搜索并打开你的应用机器人，给它发一条消息

## 二、本机配置

```bash
# 1) 安装 CLI
npm install -g @larksuite/cli

# 2) 写入凭据（存入系统 keychain；同时备份到仓库外 `%USERPROFILE%\.config\synova\feishu-bridge.env`）
lark-cli config init --app-id <APP_ID> --app-secret-stdin --brand feishu
#    按提示粘贴 App Secret 后回车

# 3) 验证
lark-cli whoami                 # 应显示 identity=bot, tokenStatus=ready
lark-cli im +messages-send --chat-id oc_xxx --text "hi" --as bot   # 发送测试

# 4) 配置桥接环境变量
copy scripts\feishu-bridge\config.example.env scripts\feishu-bridge\.env
```

编辑 `scripts\feishu-bridge\.env`（至少确认 `SYNOVA_REPO` / `CODEX_BIN` / `LARK_CLI_BIN`；**不要把 FEISHU_APP_ID/SECRET 写回仓库内**——它们存在 keychain 与仓库外备份，写回会触发 Secrets 门禁）。

## 三、运行

```bash
python scripts/feishu-bridge/feishu_bridge.py
```

看到 `事件长连接已就绪` 即可在飞书里发消息。

## 说明

- 每个飞书 chat 映射一个 Codex thread（续接），映射存于 `.feishu-bridge-state.json`
- 回复使用 `im +messages-reply`，始终挂在用户那条消息下面（P2P 和群聊都清晰）
- 只处理文本消息；机器人自己/其他机器人的消息忽略（防回声）
- `message_id` 去重（2000 条滑动窗口），事件重投不会重复处理
- `ALLOWED_OPEN_IDS` 可设白名单（可选）
- 同一 chat 的消息串行处理保序，不同 chat 并行
- 日志: `scripts/feishu-bridge/bridge.log`；consume 进程异常退出会自动重启（指数退避）
- 运行环境**必须能访问系统 keychain**（凭据管理器）——在受限沙箱里跑会拿不到 token

## 故障排查

- `event consume` 提示 scope 缺失：到控制台开通对应 scope 并**重新发布版本**
- 收不到消息：确认事件订阅是长连接模式且 `im.message.receive_v1` 已订阅
- 发不出回复：确认 `im:message:send_as_bot` 已开通并发布
- Codex 报错：先单独跑 `codex exec --cd <repo> "你好"` 验证
- 中文乱码：终端用 UTF-8（`chcp 65001`）
