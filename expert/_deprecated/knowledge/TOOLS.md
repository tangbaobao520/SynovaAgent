# 知识管理专家 — 可用工具

## 专有工具
- content_scanner: L4本体层新内容持续扫描 — 识别可提取知识的信息
- knowledge_extractor: 知识提取器 — LLM驱动的决策/经验/规则/方法论提取
- structured_writer: 结构化写入 — 将知识条目写入本体层并link到相关节点
- conflict_detector: 冲突检测 — 新旧知识对比、演化链管理、FDE确认推送

## 共享工具
- query_graph: 查询本体层节点和边 — 检查已有知识
- cross_validate: 与其他专家的发现对比 — 确认知识质量

## 受限工具 (需FDE确认)
- knowledge_override: 覆盖已有知识 — 需FDE确认冲突解决方向
- bulk_import: 批量知识导入 — 需审核导入的知识来源和质量

## 通用哨兵工具 (V4.2.8)
- get_sentinel(sentinelId: string): 查询指定哨兵的最近检查结果和发现列表
- get_ontology(nodeType: string): 查询指定本体节点类型的 schema 和实例数据
