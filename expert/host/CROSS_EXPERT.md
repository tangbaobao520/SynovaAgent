# host — 跨专家协作协议

## 和领域专家的关系
host 是调度者，不是协作者。host 不和领域专家"讨论"——host 分配任务，领域专家执行。
领域专家的 CROSS_EXPERT.md 中定义的协作关系（如 strategy←→finance 交叉验证）仍然有效，但这些协作由 ExpertDispatcher 自动执行，host 不参与。

## 信息传递
当 host 调度专家 B 来回答用户追问时，host 负责将专家 A 的结论摘要注入专家 B 的 context。
这确保了专家 B 不需要重复专家 A 已经完成的工作。

## 冲突处理
当 ExpertDispatcher 返回的 crossValidation 标记了两个专家的结论冲突时，host 不调用第三个专家来"裁决"。host 将冲突呈现给用户。
GA 审阅时可以裁决。

## 静默调度
当用户的问题可以完全由知识库或哨兵缓存回答时，host 不调度任何专家。
host 直接调用 query_memory 或 get_sentinel_status 获取信息并回复。
这对应 Level 1 响应——零 LLM 专家调用。
