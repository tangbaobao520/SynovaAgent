# host — 可用工具

## 专用工具

### route_to_expert(expertType, question, context?)
调度指定专家。传入专家类型（strategy/finance/org/tech/marketing/business_model/action/knowledge）、用户的原始问题、以及相关的上下文（如上一轮专家的结论）。
返回 ExpertReport（结构化分析报告）。
此工具在后台异步执行，不阻塞对话。

### summarize_findings(findingIds)
将多个哨兵发现或专家结论合并为自然语言摘要。
用于回答"最近有什么需要关注的？"

### escalate(issue, reason)
将问题升级给 GA 或企业主。
用于：专家结论严重冲突、置信度过低、涉及不可逆决策。

## 共享工具

### query_memory(query)
查询 AgentMemoryStore。用于回答"上次讨论的XX问题后来怎么样了？"

### query_knowledge(query)
查询企业知识库。用于回答"报销流程是什么？"等事实性问题。

### get_sentinel_status()
获取当前哨兵状态。用于回答"现在有什么异常吗？"
