# D591 物理证据索引（evidence index — K3 独立复现用）

> 任务: D591 桌面对话接线——真流式 + 提交回声 + 向导后直达对话
> 分支: feat/d591-desktop-chat-wiring（基 main@b54a0fb6）
> Spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D591-desktop-chat-wiring-20260908.md（DS1-DS10）
> DS2 环境声明: 本机无真实 LLM key——物理证据以**本地 LLM 替身服务器**（网络边界替身，D590 先例）
> 采集；桌面消费核心 = 生产模块 `createStreamingController`/`restoreLastSession`（非测试替身），
> 真实 fetch → 真实后端（DEV_MODE=false、无 Authorization）→ ConversationEngine → SessionStore 落库。
> K3 复现: `bash run-ds2-evidence.sh`（幂等自清理）；真实 key 场景改脚本内 LLM_BASE_URL/LLM_API_KEY 即完全生产语义。

| 文件 | 内容 | 对应 DS |
|---|---|---|
| red-use-streaming-conversation.log.txt | 实现前新测试文件跑红：21/21 全失败（store action/工厂/恢复函数未导出，逐用例指名），exit 1 | DS1 red |
| green-use-streaming-conversation.log.txt | 实现后：use-streaming-conversation.test.ts 21/21 + use-streaming-contract.test.ts 17/17（零回归）全绿 | DS1/DS10 |
| baseline-main-b54a0fb6-vitest.log.txt | 干净 main@b54a0fb6 worktree 全量 vitest 失败集（20 failed / 4130 passed），A/B 参照 | DS9 |
| green-full-vitest-mine.log.txt | 本分支全量 vitest：57 failed / 4116 passed——57 与 20 的差集全部为环境性（见下"已知偏差"2/3/4），写集域（tests/electron）零失败 | DS9 |
| e2e-ds2-desktop-chat.log.txt | DEV_MODE=false 真后端 + 生产 controller 端到端：25 次 16ms flush 逐字累积（真流式）+ open 帧 sessionId 落 store/localStorage + 续轮 body 携带 sessionId + 模拟重启 restoreLastSession 恢复 4 条消息 + 服务端 SessionStore 读回（ok:True，user/assistant ×2） | DS2/DS3/DS4 |
| ds2-driver.ts | e2e 驱动器（import 生产模块；fetch 仅日志透传；window/localStorage 为 renderer 环境桩） | DS2/DS3/DS4 |
| run-ds2-evidence.sh | 上述 e2e 的幂等可重跑脚本（LLM 替身 + DEV_MODE=false 后端 + 驱动器 + 服务端读回） | DS2/DS3/DS4 |
| wiring-grep.log.txt | spec §8 接线表逐条 grep 实测 + 删除复核（useConversation/MOCK_* 零结果）+ as any=0 + 铁律 41 类名禁入 + tsc A/B（28=28 零差异） | DS7/DS8/DS9 |

## A/B 对账方法（零新失败判定）

基线 = main@b54a0fb6 干净 worktree（.synova-wt-d591-base，共享 node_modules 符号链接，未跟踪运行数据
rsync --ignore-existing 同步）全量 vitest = 20 failed / 4130 passed / 16 skipped。
本分支全量 = 57 failed / 4116 passed / 14 skipped（+21 = 本任务新测试文件）。
差集逐项归因（均与本任务写集零关联）：

1. tests/electron/（本任务写集域）: 38/38 全绿，零失败。
2. layer2-judge 36 failed: **环境性既有**——主工作区未跟踪 `.env`（2026-08-14）中 LLM 端点返回
   API 404 所致。铁证：同一 `.env` 复制进干净基线 worktree → 同样 36 failed / 5 passed；
   无 .env 的基线 → 41 全过。已验证后删除副本。
3. acceptance/zero-code-industry "零 .ts 文件修改" 1 failed: 测试自身依赖未提交状态（vitest config
   注释原文），CI 已排除；本分支有未提交变更时必然红，与改动内容无关。
4. circular-dependency 1 failed: CI 排除项（Node import resolution 环境敏感）。
5. full-pipeline Stage 5b: 基线红、本分支绿——flaky，反向差异不计新失败。

tsc A/B: root tsc 分支 28 条 = 基线 28 条（去行号逐文件 diff 零差异，全部为 D590 已登记的
extensions/sentinels/_extinct 既有错误域）；electron-renderer `tsc --noEmit` exit 0。

## DS2/DS3/DS4 证据要点（e2e-ds2-desktop-chat.log.txt）

- 真流式: 25 次 flush 事件带时间戳与累计文本（`[flush #N] +"xxx" → streamingText=…`），16ms 节奏逐字
  累积，agent_message 全文落库后流式区清空——token 帧为唯一水源（DS2）。
- 提交回声: open 帧 `sess_mtsdtn59_avj9` → store.currentSessionId + localStorage 键（DS3-a/b）；
  第二条消息 fetch body 日志原文携带 `"sessionId":"sess_…"`（DS3-c）。
- 刷新恢复: 清内存态保锚 → restoreLastSession() → restored，消息区 4 条（DS4）；服务端视角
  GET /api/sessions/:id 读回全轮次（SessionStore 持久化）。
