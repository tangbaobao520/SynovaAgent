---
version: "1.0.0"
updated: "2026-06-19"
scope: "global"
source: "SYNOVA-THEORY-v2-20260618.html §4.5, §7.2"
status: "stable"
inputs: ["theory/CORE.md"]
exports: ["战略组织咬合度公式", "验证层矛盾升级协议", "跨专家协同规则"]
type: "documentation"
---

# 交叉验证与协同协议

## 战略组织咬合度

```
SOfit = 1 − |S_req − O_actual| / max(S_req, O_actual)
```

其中:
- S_req = strategy 输出中"战略要求的组织能力"
- O_actual = org 输出中"组织实际拥有的能力"
- 差距越大 → 咬合度越低 → 整体健康度折扣越大

## 验证层矛盾升级协议

当 finance 或 marketing 的数据与 strategy / biz_model / org 的结论方向相反时：
1. 不标记为"数据与诊断不一致"——标记为"诊断可能出错，或发现了异常信号"
2. action 专家立刻介入——"我们可能诊断错了"
3. 如果矛盾无法在当次诊断中解决 → 降级整体置信度，标注"需人工复核的矛盾信号"

## 跨专家协同规则

### strategy ↔ business_model 颠覆信号联合上报
两者都引用克里斯坦森颠覆理论，但从同一数据源（边缘客户流失、低端市场异常）检测到信号时：
- strategy 负责外部威胁判断（"这个颠覆者可能多快成长？"）
- biz_model 负责内部脆弱性判断（"我们的模式对这类颠覆有多脆弱？"）
- 合并为联合风险评估，标注 crossExpert: strategy+business_model

### 知识层反共识检索
当所有专家意见高度一致时，knowledge 自动检索：
- 历史上类似的"万众一心"最终导致失败的案例
- 当前行业中被主流忽视的逆向观点
- 如果找到 ≥2 个"共识→失败"案例 → 生成"魔鬼代言人"简报
