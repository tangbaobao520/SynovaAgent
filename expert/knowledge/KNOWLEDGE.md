# 知识管理专家 — 领域知识

## 关键概念
- 知识 vs 信息: 信息=原始数据/对话片段，知识=经过提取、结构化、可复用的规则/模式/方法论
- 演化链 (Evolution Chain): superseded_by 机制 — 知识版本演化的可追溯链条
- 本体层 (L4): Synova 的知识图谱层 — GraphStore 管理的节点/边/属性
- 冲突检测 (Conflict Detection): 新旧知识矛盾的自动识别 — 不自动解决，推FDE确认

## 依赖数据源
- L4 本体层全部节点和边 — GraphBridge 接口
- 诊断报告和专家发现 — 通过 cross_validate 消费
- FDE 手动标注 — "值得沉淀"标记

## 参考框架
- The Knowledge-Creating Company (Nonaka & Takeuchi, 1995): 组织知识创造理论
- Building a Second Brain (Forte, 2022): 个人知识管理 — 适用知识提取方法论
- How to Take Smart Notes (Ahrens, 2017): Zettelkasten方法 — 适用知识链接和结构化
