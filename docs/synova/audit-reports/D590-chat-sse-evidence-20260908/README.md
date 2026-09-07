# D590 物理证据索引（evidence index — K3 独立复现用）

> 任务: D590 对话 HTTP SSE 端点 + SessionStore 持久化 + 鉴权落地
> 分支: feat/d590-chat-sse（基 origin/main e0308d35）| 主实现提交: 46b99809
> 本机无真实 LLM key——DS2/DS3 物理证据以**本地 LLM 替身服务器**（网络边界替身，
> 生产代码全链路真实：HTTP→路由→引擎→provider HTTP 调用→SSE→落库）采集；
> K3 复现：`bash run-ds2-ds3-evidence.sh > 任意文件`（幂等自清理），或把脚本内
> LLM_BASE_URL/LLM_API_KEY 换成真实值即为完全生产语义。

| 文件 | 内容 | 对应 DS |
|---|---|---|
| red-conversations.log.txt | 实现前 conversations.test.ts 跑红（路由模块不存在 + uploadV2GoneRouter 未导出，13 用例文件级失败） | DS1 red |
| red-use-streaming-contract.log.txt | 实现前 D590-①②③ 跑红（对话帧走未知 warn 分支），3 failed / 14 passed | DS11 red |
| green-full-vitest.log.txt | 实现后首次全量（与并发基线跑有端口冲突噪音，供过程留痕） | DS12 |
| green-full-vitest-mine-alone.log.txt | 单独全量：34 failed / 3984 passed（与干净 origin/main 基线失败数完全一致；唯一行级差异 = acceptance"零 .ts 修改"用例，依赖未提交状态、CI 排除项，提交后消失） | DS12 |
| wiring-grep.log.txt | spec §8 接线表逐条 grep 实测 | DS12 |
| e2e-ds2-ds3-curl.log.txt | 生产态（DEV_MODE=false、无 Authorization）物理 curl：SSE 流 open/token×42/agent_message/end + 会话读回 + 白名单对照（401/非401）+ upload 四路径 410 GONE + 重启持久化逐条一致 PASS | DS2/DS3/DS8 |
| e2e-sse-full-stream.log.txt | DS2 SSE 完整流原样输出（135 行） | DS2 |
| e2e-session-readback-restart.log.txt | 重启后会话读回 JSON 原样 | DS3 |
| run-ds2-ds3-evidence.sh | 上述 e2e 证据的可重跑脚本（幂等，K3 直接执行） | 全部 |

## A/B 对账方法（零新失败判定）

基线 = 干净 origin/main worktree（.synova-wt-d590-base，采集后已删）+ 相同未跟踪运行时数据同步
（expert/data/extensions/knowledge/theory，--ignore-existing）。两者全量 vitest 失败测试数均为 34，
逐文件差异仅 acceptance"零 .ts 修改"用例（依赖未提交状态的设计性用例）。tsc A/B 归一化行号后
零新增（基线 28 条既有错误在两侧等值出现，涉及 _extinct/server.ts/loops 等，均不在本任务写集）。

## 已知偏差（诚实登记）

1. DS2/DS3 的 LLM 为本地替身（本机无真实 key，见环境声明）。
2. spec §5.2-A"每请求实例"与 §7 用例⑪物理矛盾（EngineState 无 turnCount，per-request 实例
   minTurns=3 不可达）→ 实现取会话级引擎缓存 + 忙锁单飞（完成报告"七项决策"节有 D333 记录）。
3. 诊断桥走 DiagnosisLauncher 直连（fromState 恢复引擎 diagnosisEngine 恒为 createNoopEngine）。
4. **新发现 L2 侧缺陷（未修，L2 零修改红线）**: conversation-engine.ts 构造器把 this.messages
   引用注入 ToolLoopExecutor，fromState 以赋值替换数组 → 恢复会话的模型上下文丢失
   （实测第二轮 chat 仅收 [system]）；及 tool-loop 与引擎对 assistant 消息双重 push（CLI 同样存在）。
   归 D592/Stage-3 处理。
5. upload-v2 字面量注释提及共 4 处（spec §5.3 列 3 处 + tests/routes/llm-config.test.ts:174
   注释，spec 清单遗漏；纯注释非引用，修它=写集违例，故如实标注）。
