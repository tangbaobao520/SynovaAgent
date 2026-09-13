# D722 决策记录：brief 写集「markdown 包裹符」导致认领恒为空的修复

> 日期: 2026-09-13 | 任务: D722 | 类型: 控制塔认领解析修复（治理变更，铁律 49）
> 触发: D721 提交被 staging-guard 误判「并行劫持」（D328 归属不一致）

## 一、现象 → 根因链

D721 提交时被阻断，报「提交声明(D721)与暂存文件归属(D711)不一致 — 疑似并行劫持」。
逐段追查：

1. `staging_guard.py` 用 `resolve-commit-brief.sh --session D721 <暂存文件>` 取「本 session 认领的 brief」；
   即使我已写 `.claude/current-brief.D721`，规则 1（current-brief 认领 ≥1 个暂存文件）仍不成立。
2. 规则 1 不成立的直接原因：**我的 brief 认领集合为空**。
3. 为什么为空：`brief_parser.match_path(path, pattern)` 以 `(^|/)pat$` 锚定比对，而 `parse_q2` 提取的路径
   **保留了反引号**（写集习惯写成 `` `src/x.ts` ``）。探针实测：2026-09-13-D720 那份 brief 的 include 首项
   带反引号 → 与真实路径比对恒不命中。
4. 认领为空 → resolver 落到规则 2「认领暂存文件最多的 brief」→ 选中 ±1 天窗口内一份陈旧 brief
   （D711，也认领 `board-backlog.json`）→ 归属判成 D711 → 误拦。

即：**提取端不剥壳 → 比对端永不命中 → 认领静默为空 → 门禁回退到猜 brief → 误拦**。

## 二、决策（D333 四步）

1. **第一性原理**：门禁的价值 = 判定能力。「认领恒为空」不是「宽松」，而是**静默降级**（铁律 11 同族）：
   门禁在跑、日志无异常、判定却已退化——这正是本项目反复出现的 M 类病。
2. **Anthropic 工程基线 / 开源实证**：解析与比对分属两层，输入可能带排版标记（markdown），
   规范化应发生在**消费该值的边界**（比对端），而不是要求所有生产者都手写裸路径。
3. **收敛**：
   - 在 `match_path` 内对**两侧**做规范化（剥反引号/加粗/引号/方括号/空白），一处修，三个消费者受益
     （staging_guard、resolve-commit-brief 主路径、commit-msg-check）。
   - 剥壳后 pattern 为空 → 返回 False：**绝不退化为「匹配一切」**（另一类灾难）。
   - 不改 `parse_q2` 的返回形态（其输出被打印与断言，改形态会引入无关回归）。
   - 内联回退解析器分叉、陈旧 brief 抢认领：**登记为 backlog 单独立项**，不在本单扩大爆炸半径。

## 三、验证（可复核）

| 项 | 命令 | 结果 |
|---|---|---|
| 新测试 | `bash tests/control-tower/brief-parser-markup.test.sh` | 16 通过 0 失败 |
| 反向验证 | 还原 match_path 旧实现后重跑同一测试 | **4 失败**（证明测的是本次改动） |
| 既有回归 | brief-parser-strip / alloc-task-id / merge_writeset_gate | 三测试全 PASS |
| 端到端 | 带反引号的 brief 文本 → parse_q2 + match_path | 反引号项可命中（旧实现恒 0） |
| 接线 | `grep -c brief-parser-markup.test.sh ci.yml` | ≥1（入控制塔测试白名单） |

## 四、教训（写入体系）

1. **「提取端只剥一半」是复发性病根**：D521 修过 include/exclude 剥壳不对称，D707 修过双解析器，
   本次是第三种形态（markdown 包裹符）。共同特征：**解析产物与比对端约定不一致，且失败是静默的**。
   防复发建议：为「解析产物 → 比对」这类边界补**端到端断言**（本次已补），不要只测单元函数。
2. **CTO 自己的交付物也会踩门禁**：派单 brief 我一路用反引号写路径，等于让每个执行方的认领也失效——
   教训是「写门禁的人要先用门禁的真实输入格式验证自己的产物」。
3. **误拦比漏拦更容易催生绕过**（V4.5.1 教训）：本次必须在 24h 内修掉，否则下一个执行方会考虑 `--no-verify`。

## 五、遗留

- `PLAN-brief-parser-inline-fallback-divergence`（P2）：内联回退解析器仍是旧实现 → 降级分支行为分叉。
- `PLAN-stale-brief-steals-claim`（P2）：resolver 规则 2 可选中他 session 陈旧 brief 抢认领热文件（残余风险）。
