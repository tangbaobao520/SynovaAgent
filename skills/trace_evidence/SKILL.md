---
name: trace_evidence
version: 1.0.0
description: 证据溯源——自动为发现补充证据链，追溯数据在图谱中的上下游路径
when_to_use: "每个发现必须包含证据引用。无证据则触发 human_calibration。"
required_tools: ["trace_lineage", "query_graph"]
depends_on: [synova-core >= 2.0]
---

1. 对每个发现调用 `trace_lineage` 工具
2. 如果返回 `traceable: false`，调用 `query_graph` 查找间接关联
3. 如果仍无证据链，标记发现为"待补充证据"并触发 human_calibration
