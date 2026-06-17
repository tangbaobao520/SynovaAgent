#!/usr/bin/env python3
"""Generate task brief with mandatory mini-design-document sections."""
import os
import sys
from datetime import datetime

brief_file = os.environ.get('BRIEF_FILE', '.claude/task-briefs/brief.md')
task = os.environ.get('TASK_DESC', '未命名任务')
branch = os.environ.get('BRANCH', 'main')
tsc_count = os.environ.get('TSC_COUNT', '0').strip()
as_any = os.environ.get('AS_ANY', '0').strip()
test_out = os.environ.get('TEST_OUTPUT', '').strip()
now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

content = f"""# Task Brief: {task}

> 生成时间: {now}
> 分支: {branch}
> 代码库状态: tsc={tsc_count} errors, as any={as_any}, 测试={test_out}

## 项目身份（每次重读）

- SynovaAgent = 组织数字孪生诊断 + 持续增长导航系统。
  诊断是手段，目的是增长。
  核心问题：这家企业的增长卡在哪里？现在该做什么？
- Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
- 五层架构：L1(交互)→L2(编排)→L3(洞察)→L4(本体)→L5(存储)，只能向下依赖相邻层。
- 完整数据流：
  原始数据 → 本体层(电子病历) → 7维度×25测量器(compute)
    ├─ 按需(FDE触发): runModules() → Evidence池 → 专家 → 诊断报告
    └─ 定时(Cron触发): Sentinel.check() → SentinelFinding → 信号聚合
                                                              ↓
  信号聚合引擎 → 交叉关联+严重度升级+专家路由 → 8位专家(strategy/org/finance/tech/marketing/action/business_model/knowledge)
       → ReAct推理+交叉验证 → 综合诊断报告 → FDE收到警报+报告

## Anthropic 决策思路
<!-- 如果 Anthropic 团队做这个任务，先做什么，后做什么，步骤是什么？ -->
<!-- 这个任务是否有人做过类似的事情？社区/业界的最佳实践是什么？ -->
<!-- 什么可以不做？什么是最简可行方案？ -->
<!-- 示例: 先 grep 确认接口签名 → 再读现有测试 → 写新测试 → 实现 → 接线 → verify-incremental -->

## 本任务在哪一层
<!-- L1/L2/L3/L4/L5？触及哪几层？有没有跨层风险？ -->
<!-- 示例: L3(哨兵) → L2(桥接) → L1(API)。L1 禁触 L3/L4/L5。 -->

## 文档引用
<!-- 全量对齐手册哪些章节和本任务相关？引用具体节号。 -->
<!-- 示例: §7.3 测量器与哨兵、§8.3 专家Agent调度、§6 L1交互层 -->

## 接口审计
<!-- 本任务调用的关键函数签名（从代码 grep 来的，不凭记忆） -->
<!-- 格式: 文件名:函数名(参数) → 返回类型 -->
<!-- 示例:
  src/l3/expert-dispatcher.ts: runExpert(type: ExpertType, evidence: Evidence[]) → Promise<ExpertReport | null>
  src/sentinel/signal-aggregator.ts: aggregateSignals(results: SentinelCheckResult[]) → {{ signals: AggregatedSignal[], stats }}
-->

## 数据流
<!-- 输入来自哪里 → 经过哪些文件/函数 → 输出到哪里（用户看到什么） -->
<!-- 必须包含至少一个 → 箭头 -->
<!-- 示例: Cron → runner.aggregateAndDispatch() → ExpertDispatcher.runExpert() → GET /api/sentinel/reports → FDE -->

## 用户旅程
<!-- 用产品语言描述: 谁→什么场景→做了什么→看到什么结果 -->

## Done 标准
<!-- 铁律 7: 入口可触达 + 完整链路走通 + 结果可见 -->
- [ ] 入口可触达:
- [ ] 链路走通:
- [ ] 结果可见:

## 验证命令
```bash
bash scripts/workflow/checkpoint-impl.sh <新函数名>
```
"""

os.makedirs(os.path.dirname(brief_file), exist_ok=True)
with open(brief_file, 'w', encoding='utf-8') as f:
    f.write(content)
print('done: ' + brief_file)
