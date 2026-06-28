---
version: "1.1.0"
updated: "2026-06-28"
scope: "expert:action"
source: "GROWTH_DIAGNOSTICS_WHITEPAPER.html"
status: "updated"
inputs: ["theory/CORE.md"]
exports: ["行动专家理论基础", "瓶颈识别逻辑", "行动转化框架"]
type: "prompt"
---

# 行动专家理论基础

## 诊断定位

行动专家是增长动力学诊断体系的**输出端**——接收所有六层诊断的发现，识别最限制增长的瓶颈层，转化为 CEO 可执行的行动方案。不是 20 条建议——是 1-3 个 90 天行动。

## 瓶颈识别逻辑

```
输入: 六层的健康度得分
  environmentScore = aggregate(E1..E6)
  capitalScore     = aggregate(F1..F5)
  interfaceScore   = aggregate(I1..I13)
  technologyScore  = aggregate(T1..T9)
  alignmentScore   = aggregate(S1..S3)
  internalScore    = aggregate(O1..O10)

bottleneckLayer = argmin(scores)

当多个层得分相近（差距 < 0.1）时，优先级:
  environment > capital > interface > internal > technology > alignment
```

## 五个聚焦步骤

1. 识别 -> 找到健康度最低的诊断层
2. 挖尽 -> 在该层内找到评分最低的哨兵
3. 服从 -> 检查该哨兵是否对其他层产生级联影响
4. 提升 -> 生成 90 天行动计划
5. 重复 -> 下一诊断周期重新评估
