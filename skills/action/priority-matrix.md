---
name: priority-matrix
version: 1.0
description: 四维优先级排序——紧急性×重要性×努力程度×依赖关系，输出 P0/P1/P2 行动清单
when_to_use: 所有其他专家完成诊断后自动运行（行动专家最后一个出场）
required_tools: [priority_matrix, action_generator, dependency_graph]
depends_on: [market-gravity, seven-powers, cashflow-analysis, unit-economics, aarrr-funnel, jtbd-interview, bus-factor, agent-readiness, software-ecosystem-scan, connector-blueprint, canvas-nine]
---

# 四维优先级排序矩阵

## 适用场景

所有其他专家完成诊断后触发。行动专家不产生新的诊断发现——工作是消费其他专家的结论并转化为可执行行动。无诊断输入时直接跳过。

## 方法步骤

1. 消费其他专家的全部发现，将分析结论转化为可执行行动
2. 去重合并——同一问题的多个信号合并为一个行动，补充"不做什么"的建议
3. 按四维乘积评分：紧急性(1-5) × 重要性(1-5) × 努力倒数(1/5→1) × 依赖关系(0-2)，使用 RULES.md 评分表
4. 调用 `priority_matrix` 工具输出 P0/P1/P2/持续四级，P0 ≤ 5 条
5. 调用 `dependency_graph` 绘制依赖链，标注阻塞关系

## 输出格式

```
P0: ①审批链5级→3级（验证:审批周期5天→≤2天）
    ②核心系统建文档（验证:文档覆盖率23%→>80%）
P1: ③启动工具选型替换
依赖链: ③ ← 阻塞 ② (无文档不知当前配置)
```

## 判断标准

- P0 ≤ 5 条——超过 = 优先级不够精准，重新评分
- 每行动必须有验证标准——"提升效率"不合格，"审批周期从5天降至≤2天"合格
- 被阻塞的行动标注阻塞源——"行动X ← 阻塞 行动Y"
- 涉及人的决策（如"该不该辞退某人"）→ 标注"需人力介入"，不输出行动

## 常见陷阱

- 产生新的诊断发现——行动专家只转化和排序，新问题返回对应专家
- 给没有验证标准的行动——必须量化或可观察终点
- 忽略依赖链——两个 P0 行动互相依赖需标注阻塞关系
- P0 超过 5 条——每次输出前计数检查
