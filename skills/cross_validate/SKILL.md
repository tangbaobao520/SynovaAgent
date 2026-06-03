---
name: cross_validate
version: 1.0.0
description: 多源交叉验证——确保任何发现至少有3个独立数据源支持
when_to_use: "在生成任何发现之前，必须执行此技能。如果发现已有高置信度，可用于验证。"
required_tools: ["cross_validate", "query_graph"]
allowed_tools: ["cross_validate", "trace_lineage", "query_graph"]
depends_on: [synova-core >= 2.0]
---

## 执行步骤

1. 对当前发现调用 `cross_validate` 工具
2. 如果返回 `confidence < 0.5`，自动调用 `query_graph` 查找是否有额外数据源
3. 如果仍不足3个独立数据源，标记为"待验证"并调用 `trace_lineage` 查找间接证据
4. 如果间接证据也无法支撑，调用 `request_human` 请求行业诊断师介入
