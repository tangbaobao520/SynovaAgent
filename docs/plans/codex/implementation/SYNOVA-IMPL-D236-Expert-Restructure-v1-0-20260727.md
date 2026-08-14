<!-- SYNOVA-IMPL-D236 v1.0 | 2026-07-27 | Phase 3 | Expert Final Report §六 -->
# SynovaAgent -- D236 专家体系 9→7 重构 v1.0
> Phase 3 任务 | 专家体系全面审计最终报告修正版 §六
> 当前 9 专家 (6 有工具, 2 缺工具, 1 host) → 目标 7 专家 (host + 4 核心 + 2 P0 扩展)

## 权威文档验证

来源: docs/synova/research/跨文档一致性审计-20260727/SYNOVA-RESEARCH-专家体系全面审计最终报告-修正版-20260727.md

> §零: 增长不可简化的底层只有三种资源类型——资金、需求（客户）、人力。按循环组织专家是资源类型决定的唯一正确解。
> §六 最终 7 位配置:
>   host (主Agent) | 资本循环专家 (finance+business_model → 13边+21compute+E11/E12)
>   | 客户循环专家 (marketing+strategy → 16边+14compute)
>   | 人才循环专家 (org+knowledge → 16边+9compute)
>   | 技术基础设施专家 (tech 保留, 7边+5compute, 跨循环视角)
>   | 财务结构专家 (P0激活, finance剥离纯深度分析)
>   | 竞争与战略专家 (P0激活, strategy剥离竞争定位深度)
> §五: host 消费 direction-monitor 的 cycle_deviation_index 决定调度优先级
> §七 迁移清单: action → host 内部工具函数 (Goal 格式转换)

代码验证:
- 当前 9 专家目录: expert/ 下 action/business_model/finance/host/knowledge/marketing/org/strategy/tech ✅
- 当前 6 工具文件: src/tools/ action/finance/marketing/org/strategy/tech (D234 补齐后 8)
- direction-monitor.ts: 已有 DirectionReport.categories[].deviationRate ✅ (D222)
- host 当前不消费 cycle_deviation_index ❌
- action 当前仍为独立专家 ❌

## 重构范围

### 合并映射
| 当前专家 | 目标 | 操作 |
|---------|------|------|
| finance + business_model | 资本循环专家 capital-cycle | 合并 prompt/manifest/tools, 新 expert/capital-cycle/ 目录 |
| marketing + strategy | 客户循环专家 customer-cycle | 合并, 新 expert/customer-cycle/ 目录 |
| org + knowledge | 人才循环专家 talent-cycle | 合并, 新 expert/talent-cycle/ 目录 |
| tech | 技术基础设施专家 tech | 保留, 角色重定义为跨循环视角 |
| host | host (增强) | 增加 cycle_deviation_index 消费 + 一致性合成逻辑 |
| action | host 内部工具函数 | Goal 格式转换 (3 compute 保留), 追踪职责回归核心专家 |
| — (新增) | 财务结构专家 finance-structure | P0 激活条件: 资本循环偏离 >3周期 + >1.5σ |
| — (新增) | 竞争与战略专家 competitive-strategy | P0 激活条件: 客户循环偏离 >3周期 + >1.5σ |

### 合并前的冲突审计
必须执行:
- finance vs business_model: 资本回报率计算逻辑 + 再投资比率归因是否一致?
- marketing vs strategy: 市场份额测量口径 + 竞争定位评估框架是否冲突?
- org vs knowledge: 组织学习定义 + 知识流动测量方式是否兼容?

裁决规则: 保留两种视角，标注互补关系；结论方向相反 → 标记为高不确定性区域

## 依赖关系
D234 (business_model + knowledge 工具补齐) 必须先完成——否则合并时缺少源数据。

## Phase 3 延期原因
权威文档 §七 标注为 Phase 3，需: GA 数据积累 + loop-3 运行后评估。当前不阻塞开发。

## 完成标准 (Phase 3)
| 标准 | 验证 |
|------|------|
| expert/capital-cycle/ 目录 exist, >=7 files | Test-Path |
| expert/customer-cycle/ 目录 exist, >=7 files | Test-Path |
| expert/talent-cycle/ 目录 exist, >=7 files | Test-Path |
| host 消费 cycle_deviation_index | grep direction-monitor in host PROMPT.md |
| action 工具函数移至 host 内部 | grep action in expert/ |
| 2 个 P0 扩展专家 prompt 模板 exist | Test-Path |
| tsc --noEmit 零新增 | CI |
| 全量 tests 通过 | vitest run |
