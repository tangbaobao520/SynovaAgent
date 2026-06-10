# SPEC: 专家推理管道

## 全局定位
- Synova 是 AI 组织诊断系统，核心是服务于增长
- 本模块属于 L3 洞察层 — 消费测量管道输出，驱动 LLM 推理，产诊断结论
- 服务于用户旅程：测量结果 → 专家推理 → 诊断报告
- 对接：六专家（战略/组织/财务/营销/技术/行动）。管道通用，不绑定具体专家

## 接口签名
- ExpertConfig: { id, name, dimensions[], systemPrompt }
- ExpertInput: { dimension: string, measurements: MeasurementResult[], context?: string }
- ExpertOutput: { expertId, findings[], conclusion, score, confidence }
- ExpertAgent: { config, reason(input) → ExpertOutput }
- ExpertPipeline: register(agents) → run(input) → ExpertOutput[]

## 接入点
- ExpertPipeline 被 ConversationEngine 或 API route 调用（L2）
- ExpertPipeline 消费 MeasurementPipeline 输出（L3 → L3）
- ExpertPipeline 输出被 ReportBuilder 消费（L2）

## 算法选择
- 每个专家独立 LLM 调用（并行执行）
- System prompt 约束专家只分析自己的维度
- 专家输出结构化 JSON（强制格式，不自由文本）
- LLM 失败 → degraded, 其他专家继续

## 边界条件
- 测量数据缺失 → 专家标注 confidence: low, 不编造结论
- LLM 调用超时 → 30s 超时
- LLM 返回非 JSON → 解析失败，retry 一次，仍失败则降级
- 专家没有对应维度的测量数据 → 跳过该专家
