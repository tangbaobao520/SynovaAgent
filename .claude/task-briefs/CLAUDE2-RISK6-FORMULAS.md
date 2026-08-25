# Task Brief: 8位专家 FORMULAS.md 补全

> **执行者**: Claude 2 (另一个)
> **来源**: 审计报告 v2 风险6
> **优先级**: P1 — 6/25 前完成

---

## 问题

`expert/*/` 下 8 位专家全部缺失 `FORMULAS.md`。`theory/MATH_OVERVIEW.md` 已定义了 14 条公式（6 条已工程化 + 8 条未工程化/定性），但**没有映射到任何专家**。

## 要求

为每位专家创建 `expert/<name>/FORMULAS.md`，内容：

1. 从 `theory/MATH_OVERVIEW.md` 中提取与该专家相关的公式
2. 标注每条公式的使用场景："哨兵 compute() 中使用" 或 "专家推理时定性参考"
3. 如果该专家目前没有已工程化的公式，写明"当前无工程化公式——以下为定性分析框架"

## 8位专家各自需要的公式

| 专家 | 关联公式 | 
|------|---------|
| strategy | 7 Powers 量化（已有），市场引力评分（定性→待工程化） |
| org | Bus Factor 计算（已有），组织熵增（定性） |
| finance | 现金流健康度（已有），LTV/CAC（已有），单位经济学（已有） |
| marketing | AARRR 转化率（已有），JTBD 优先级（定性） |
| tech | Agent 就绪度评分（已有），技术债指数（定性） |
| action | 优先级矩阵 4 维乘积（已有） |
| business_model | 画布自洽性评分（定性→待工程化） |
| knowledge | 当前无工程化公式——说明知识衰减/冲突检测的逻辑即可 |

## 约束

- 每个文件 200-500 字，格式参照 `expert/_template/` 的文件规范
- 不要修改 SOUL.md / RULES.md / THEORY.md
- 遵循 Loop Engineering v3.2 流程
