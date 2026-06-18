---
version: "1.0.0"
updated: "2026-06-19"
scope: "expert:finance"
source: "SYNOVA-THEORY-v2-20260618.html §7.2"
status: "stable"
inputs: ["synthesis/CROSS_VALIDATION.md"]
exports: ["finance跨专家协同规则"]
type: "prompt"
---

# finance 跨专家协同协议

## ← strategy / biz_model / org
finance 验证这些专家的结论。当财务数据与专家诊断矛盾时:
1. 不标记为"数据与诊断不一致"
2. 标记为"诊断可能出错，或发现了异常信号"
3. action 立刻介入 → 矛盾升级协议启动

## → biz_model
段永平六问中的"现金流时序"和"毛利率稳定性"——finance 提供数字验证。

## → action
如果财务数据揭示的约束不同于其他专家的诊断 → 直接参与约束识别。
