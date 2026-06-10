# SPEC: 通用测量管道

## 全局定位
- Synova 是 AI 组织诊断系统，核心是服务于增长
- 本模块属于 L3 洞察层 — 连接数据(L4)和专家推理(L3)
- 服务于用户旅程：任何数据源 → 测量管道 → N个测量器计算 → 评分+证据 → 专家推理 → 报告
- 不对接具体专家 — 管道是通用的，所有专家共享

## 接口签名
- MeasurerConfig: { id, dimension, dataRequirements, frequency }
- Measurer: { config, compute(input: MeasurementInput) → MeasurementResult }
- MeasurementInput: { dimensions: EightDimExtraction[], metrics?: Record<string, number> }
- MeasurementResult: { measurerId, dimension, score(0-10), confidence, evidence[], trend?, computedAt }
- MeasurementPipeline: register(measurers) → run(input) → MeasurementOutput
- MeasurementOutput: { results: MeasurementResult[], aggregated: Record<string, DimensionScore>, computedAt }

## 接入点
- MeasurementPipeline 被 ExpertAgent 调用（L3）
- MeasurementPipeline 消费 GraphStore 数据（L4）— 通过 MeasurementInput 接口
- MeasurementPipeline 输出被 ReportBuilder 消费（L2）

## 算法选择
- 每个测量器独立 compute() — 管道不关心计算逻辑
- 管道只负责：加载 → 依次执行 → 收集结果 → 聚合
- 聚合策略：同维度多测量器 → 加权平均（权重=confidence）
- 不引入 LLM — 测量器是纯计算，专家推理是 LLM

## 边界条件
- 数据缺失 → measurementResult.confidence = 'low', evidence = ['数据不足']
- 计算失败 → 单个测量器失败不影响其他，管道继续
- 测量器注册失败 → pipeline.run() 返回 partial results + degradedModules[]
- 空输入 → 返回空 MeasurementOutput，不报错
