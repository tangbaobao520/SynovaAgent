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

## 管理经济学知识索引

SynovaAgent 8 位专家已注入以下管理经济学知识，供交叉引用和按需查询：

| 知识领域 | 注入位置 | 专家 |
|---------|---------|------|
| 委托-代理框架（代理问题识别+代理成本+道德风险检测） | THEORY.md + TOOLS.md | org |
| 激励理论（效率工资+锦标赛+搭便车检测） | TOOLS.md + RULES.md | org |
| 信息不对称 + 柠檬市场 + 信号发送 | THEORY.md | tech |
| 市场结构四象限 + HHI指数 | THEORY.md | strategy |
| 博弈论（囚徒困境+协调+鹰鸽+重复博弈） | TOOLS.md | strategy |
| 7 Powers 竞争壁垒评估 | TOOLS.md | strategy |
| 交易成本分析（四来源+治理矩阵） | THEORY.md | business_model |
| 价值链解构 + 利润池迁移 | TOOLS.md | business_model |
| 资本预算（NPV/IRR/回收期/PI） | THEORY.md | finance |
| 成本结构分析（固变识别+规模经济+盈亏平衡） | TOOLS.md | finance |
| Token 成本核算 | TOOLS.md | finance |
| 需求弹性 + 交叉弹性 | TOOLS.md | marketing |
| 行为经济学（前景理论+锚定+现状偏误） | TOOLS.md | marketing |
| 缝隙动力学（六维度变化追踪） | THEORY.md + TOOLS.md | action |

### 跨专家调用规则
- 战略诊断发现市场集中度问题 → 调 finance（成本结构）+ business_model（价值链）
- 组织诊断发现代理问题 → 调 action（差距变化趋势）+ strategy（战略对齐）
- 技术诊断发现信息不对称 → 调 org（委托-代理）+ action（执行差距）

## 跨专家调用规则（六层模型）
- E3竞争格局变化 -> finance(F3) + business_model(I11)
- O3激励对齐度 -> strategy(S1) + action
- T1-T4信息不对称 -> org(O6+O7) + business_model(I12)
- I1-I2生态位收窄 -> strategy(E2) + marketing(E4)
- F1融资约束-> action + business_model(I10) + strategy(E5)
