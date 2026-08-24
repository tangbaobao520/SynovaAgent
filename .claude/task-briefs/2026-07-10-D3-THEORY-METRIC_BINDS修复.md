## Q0: 项目身份 + 审计
SynovaAgent — D3。expert/org/THEORY.md L149 引用 METRIC_BINDS → I2 判定为 DELETE。
审计结果: 仅此1处DELETE边引用, L148(INCENTIVE_BINDS→KEEP) L150(SIGNAL_TRANSMITS→KEEP)不动。

## Q1: 调研
a) I2 判定: METRIC_BINDS → 拆分为 DATA_COLLECTION(freshness) + INFORMATION_FLOW(filtering_loss)
b) 上下文: "KPI与现金流贡献偏离" → 信息传递中信号失真 → INFORMATION_FLOW.filtering_loss

## Q2: 范围
仅改 L149 1行: "METRIC_BINDS" → "INFORMATION_FLOW"
不改 L148, L150。不碰任何代码文件。

## Q3: 验收
verify: grep "METRIC_BINDS" expert/org/THEORY.md = 空
verify: grep "INFORMATION_FLOW" expert/org/THEORY.md = 1处

## 架构层
专家系统(T9注入内容) — 纯文本修改, 不影响代码

## Done 标准
- [x] expert/org/THEORY.md 零 METRIC_BINDS 引用
- [x] L149 改为 INFORMATION_FLOW
- [x] L148/L150 不变
- [x] git diff 仅1行变更
- [x] 零 as any / 零代码变更
