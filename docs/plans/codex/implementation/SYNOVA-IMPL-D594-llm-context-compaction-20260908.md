# SYNOVA-IMPL-D594：上下文压缩引擎四件套（DSH 借鉴卡 B-05）

> 状态：dev doc | 2026-09-08 | 优先级 P1（对话交互）
> 归属：Claude 线（src/agent/ ConversationEngine）
> 借鉴：DSH 范式（读源码自研，零代码依赖，G1/G4）
> 借鉴锚点（真实源码 0.1.1-rc.2）：`packages/compaction/compaction-basic/lib/index.js`（+ config/region/summarizer）

## 1. 权威文档引用

- DSH 借鉴指引 v2 B-05；DSH 源码 `compaction/compaction-basic`（threshold/retain、压缩事件、影子价格、KV-cache 复用、溢出恢复）。
- 专家架构权威（20260905 第七章可组合性）：长会话压缩服务于**推理层（问题域专家/可组合单元）**的上下文管理，非固定 7 专家。

## 2. 代码审计现状（file:line，实测）

### 2.1 DSH 范式

- `compaction-basic`：threshold 0.8/retain 0.16；压缩事件 `compaction/start|summary|end` + 影子价格 `shadowedTokenCount`；`compaction/start` 兼 durable 锁；摘要调用复用会话前缀保 KV-cache；溢出恢复 `CONTEXT_WINDOW_EXCEEDED → 强制压缩 → retry`。

### 2.2 Synova 现状

- `src/agent/prompt-assembler.ts` 有散落截断/组装，无「threshold/retain + 压缩事件 + 影子价格 + 溢出恢复」的完整压缩引擎。
- 缺口：长会话（诊断多轮）超上下文窗口时，现有逻辑是截断，丢关键结论。

## 3. 无重复造轮子审计（S-14）

- grep 证实 `src/agent/` 无 compaction/compression 引擎；本次新建，不重写 prompt-assembler。

## 4. 写集表（1 新建 + 1 修改 + 1 测试）

| 文件 | 操作 |
|---|---|
| `src/agent/context-compaction.ts` | 新建：threshold/retain + 压缩事件 + 影子 token 价 + 溢出恢复 |
| `src/agent/conversation-engine.ts` | 修改：长会话触发压缩（真实路由接线） |
| `tests/agent/context-compaction.test.ts` | 新建：red→green |

## 5. 测试要求（red→green，非空壳）

- 正常：超 threshold 触发压缩，摘要 + 最近消息保留。
- 边界：CONTEXT_WINDOW_EXCEEDED → 强制压缩 → retry；压缩后回放一致；tool 配对不拆散。
- 每用例 ≥3 expect。

## 6. 接线要求

- `context-compaction` 在 ConversationEngine 长会话触发（grep 调用方）。

## 7. 完成标准（DS1-DSn）

- DS1：`grep -rn "compaction\|shadowedTokenCount\|CONTEXT_WINDOW_EXCEEDED" src/agent/` 命中（真实接线）。
- DS2：`grep -rn "@deepseek-ai" src/` 零结果。
- DS3：新测试 red→green，≥4 用例。
- DS4：vitest 全绿 + tsc 28 基线零新增。
- DS5：as any = 0。

## 8. 自检清单

- [ ] DSH compaction-basic 源码已读
- [ ] Synova prompt-assembler 现状 grep 实证
- [ ] 遵循新专家规范（推理层/问题域专家）
- [ ] 溢出恢复 CONTEXT_WINDOW_EXCEEDED 已纳入
- [ ] 不是凭记忆
- [ ] 不用 --no-verify
