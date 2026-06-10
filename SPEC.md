# SPEC: 诊断引擎消费八维度提取结果

## 全局定位
- Synova 是 AI 组织诊断系统，核心是服务于增长
- 本模块属于 L2 编排层，连接 L3 八维度提取(DocExtractor)和 L3 诊断引擎(DiagnosisOrchestrator)
- 服务于用户旅程：FDE 上传文档 → 出报告。消除 extractSections 的硬编码
- 对接：六专家诊断引擎

## 接口签名
- 修改 diagnosis-upload.ts 的 runDiagnosisPipeline():
  八维度提取结果 → concerns[] → EngineCoreVendorAdapter.runConsultation() → 真实诊断报告
- extractSections() 函数不再硬编码专家，改为消费 ConsultationResult

## 接入点
- src/routes/diagnosis-upload.ts → EngineCoreVendorAdapter → @synova/diagnosis-engine

## 算法选择
- 八维度提取结果的 content 字段拼接为 initiator.concerns[]，传给诊断引擎
- 诊断引擎返回的 report (unknown) 解析为结构化数据或直接嵌入报告

## 边界条件
- 诊断引擎可能需要初始化 (EngineContext, DB)
- TSC 错误 (diagnosis-engine 模块解析) 可能阻塞 — 用动态 import 绕过
- 如果诊断引擎调用失败 → 降级回硬编码 section (标注 degraded)
