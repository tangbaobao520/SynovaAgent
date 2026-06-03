---
name: detect_contradiction
version: 1.0.0
description: 矛盾检测——多专家发现冲突时触发，不掩盖矛盾
when_to_use: "当多个专家的发现在同一维度给出相反判断时自动触发。"
required_tools: ["query_graph"]
depends_on: [synova-core >= 2.0]
---

1. 当 Synthesizer 检测到 highContention 标记时自动激活
2. 调用 `query_graph` 对比冲突双方的证据源
3. 标注矛盾为"待解决"并提升到诊断报告高优先级
