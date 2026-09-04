# SPEC: 端到端诊断管线

## 全局定位
- Synova 是 AI 组织诊断系统，核心是服务于增长
- 本切片串联前三层：文档提取 → 测量管道 → 专家推理 → 报告
- 服务于用户旅程：GA 上传文档 → 真实诊断报告（非模板填充）
- 对接：六专家、七监测维度

## 接口签名
- 输入: 采访文档文本 + orgName
- 管线: DocExtractor → MeasurementPipeline → ExpertPipeline → ReportBuilder
- 输出: 金字塔 HTML 报告（结论基于真实计算和推理）

## 接入点
- 管线被 API route 或独立脚本调用
- 消费 engine-core 的三个管道模块

## 关键要求
- 至少 3 个真测量器活跃（非样本测量器）
- 至少 3 个专家活跃（战略/组织/财务）
- 报告中的结论来自专家推理输出，不是模板填充
- 专家推理调用真实 LLM API

## 边界条件
- 测量器数据不足 → 标注为 low confidence，管道继续
- LLM 调用失败 → 降级，其余专家继续
- 全链路失败 → 返回部分结果 + degraded 说明
