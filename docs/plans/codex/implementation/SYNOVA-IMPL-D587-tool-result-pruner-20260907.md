# SYNOVA-IMPL-D587：工具结果确定性修剪器（DSH 借鉴卡 B-04）

> 状态：dev doc | 2026-09-07 | 优先级 P1（模型底座/对话交互）
> 归属：Claude 线（src/agent/ 诊断证据块/工具结果）
> 借鉴：DSH 范式（读源码自研，零代码依赖，G1/G4）
> 借鉴锚点（真实源码 0.1.1-rc.2）：`D:\deepseek-harness\packages\compaction\compaction-tool-result-pruner\lib\index.js`

## 1. 权威文档引用

- DSH 借鉴指引 v2 B-04；DSH 源码 `compaction-tool-result-pruner/lib/index.js`（已读全文）。

## 2. 代码审计现状（file:line，实测）

### 2.1 DSH 范式

- `PRUNE_MARKER = "\n\n[... tool result middle pruned ...]\n\n"`；`DEFAULTS = {thresholdChars:8192, headChars:4096, tailChars:1024}`。
- `codePointLength(text) = Array.from(text).length`（码点计数，不拆代理对，中文友好）。
- `resolveConfig` 校验：`headChars + marker + tailChars <= thresholdChars`，未知 key 抛错，正/非负整数断言，`deepFreeze(structuredClone)`。
- 核心语义：**确定性、replay-safe**——同输入同输出；头尾保留、中间用固定 marker 替换。

### 2.2 Synova 现状

- 散落 `slice(0, N)` 截断：`src/providers/message-sanitizer.ts:54`、`src/providers/base.ts:113`、`src/l3/expert-output-schema.ts:94/102` 等。
- **无统一「head + marker + tail」修剪层**，无码点计数，无 replay-safe 保证（散落 slice 破坏中文代理对、不可回放）。

### 2.3 真实缺口

诊断证据块/工具结果进提示词前无确定性修剪层——现状是各处 naive `slice(0,N)`，中文可能截断代理对、不可回放、无头尾保留语义。

## 3. 无重复造轮子审计（S-14）

- grep 证实：无 `prune/headChars/tailChars/codePointLength` 等价物，仅有散落 `slice(0,N)`。
- 本次新建一个纯函数修剪器，不重写既有 message-sanitizer（可复用其思路，但本卡是**独立确定性修剪层**）。

## 4. 写集表（1 新建 + 1 修改）

| 文件 | 操作 |
|---|---|
| `src/llm/tool-result-pruner.ts` | 新建：`pruneToolResult(text, cfg)` 纯函数（head+marker+tail、码点计数、配置校验、replay-safe 幂等） |
| `src/agent/` 诊断证据块/工具结果进提示词前 | 修改：接线调用 `pruneToolResult`（真实路由） |

## 5. 测试要求（red→green，非空壳）

新增 `tests/llm/tool-result-pruner.test.ts`：
- 正常：超阈值文本 → head+marker+tail，长度 ≤ threshold；同输入同输出（幂等）。
- 边界：阈值下不修剪；中文（含代理对 emoji）不拆字；`headChars+marker+tailChars > thresholdChars` 抛错。
- 每用例 ≥3 expect。

## 6. 接线要求

- `pruneToolResult` 在诊断证据块/工具结果进提示词前被调用（grep 调用方，非测试内）。

## 7. 完成标准（DS1-DSn）

- DS1：`grep -rn "pruneToolResult" src/agent/` 命中（真实接线）。
- DS2：`grep -rn "@deepseek-ai" src/` 零结果（G1）。
- DS3：新测试 red→green，≥4 用例。
- DS4：`npx vitest run tests/llm/tool-result-pruner.test.ts` 全绿；tsc 零新增（28 基线）。
- DS5：`as any` = 0。

## 8. 自检清单

- [ ] DSH pruner 源码已读全文
- [ ] Synova 散落 slice 现状 grep 实证
- [ ] 写集零越界（1 新建 + 1 接线）
- [ ] red→green 实测
- [ ] 不是凭记忆
- [ ] 不用 --no-verify
