<!-- SYNOVA-IMPL-D234 v1.0 | 2026-07-27 | 跨文档审计 P0-2 -->
# SynovaAgent -- D234 专家工具补齐 (business_model + knowledge) v1.0
> 2026-07-27 | 跨文档一致性审计最终报告 v3 P0-2
> expert/ 下 9 个目录 Manifest 齐全，但 src/tools/ 仅 6 个工具文件。补齐缺失。

## 权威文档验证（铁律 0-3）

来源 A: docs/synova/research/跨文档一致性审计-20260727/SYNOVA-CROSS-AUDIT-最终审计报告-v3-20260727.md
> P0-2: "8 位专家声称, 代码仅 6 位 — business_model + knowledge 缺失"

来源 B: docs/synova/research/跨文档一致性审计-20260727/SYNOVA-RESEARCH-专家体系全面审计最终报告-修正版-20260727.md
> 六: 最终 7 位配置——finance+business_model→资本循环专家, org+knowledge→人才循环专家
> 七: 迁移清单——business_model→资本循环专家, knowledge→人才循环专家

代码验证:
- expert/business_model/ 下 7 文件齐全 ✅
- expert/knowledge/ 下 7 文件齐全 ✅
- src/tools/business_model-expert-tools.ts 不存在 ❌
- src/tools/knowledge-expert-tools.ts 不存在 ❌
- src/tools/ 下仅 6 个专家工具: action/finance/marketing/org/strategy/tech
- manifest.json 中 business_model 和 knowledge 的工具声明已存在 ✅

注意: 专家体系最终报告要求 9→7 合并。本任务是临时补齐确保 9 专家可运行。合并重构后续执行。

## Q0-Q4

Q0: Synova 专家工具链补齐。business_model 和 knowledge 专家有 manifest 和 TOOLS.md 但没有 TypeScript 工具实现。
Q1: 参考 src/tools/org-expert-tools.ts 格式——ToolDefinition {name, description, parameters, handler}。manifest.json tools 字段定义允许的工具名。TOOLS.md 定义工具功能。
Q2: 创建 business_model-expert-tools.ts + knowledge-expert-tools.ts。读 expert/{type}/TOOLS.md + manifest.json → 实现对应 ToolDefinition。不做 9→7 合并重构。
Q3: expert-file-loader 扫描加载 PROMPT + TOOLS → ExpertRegistry 注册。结果 9/9 专家全部有工具实现。
Q4: 降级——handler 内 API 调用失败 → degraded=true + log.warn。测试 L1 验证 ToolDefinition 结构 + handler 基本调用。

## 改动清单

### 1. src/tools/business_model-expert-tools.ts — 新建
格式参考 src/tools/org-expert-tools.ts (ToolDefinition 接口)。
读 expert/business_model/TOOLS.md + manifest.json → 提取工具定义 (预计 2-3 个)。
每个工具: export const xxxTool: ToolDefinition = { name, description, parameters, handler }

### 2. src/tools/knowledge-expert-tools.ts — 新建
同上。读 expert/knowledge/TOOLS.md + manifest.json → 提取工具定义 (预计 2-3 个)。

### 3. 无需修改 expert-file-loader.ts / expert-router.ts
expert-file-loader 根据 manifest.json tools 字段自动注册。工具 .ts 文件由 expert-router 运行时动态加载。确认 expert-router 能正确查找 business_model 和 knowledge 的工具文件。

## 测试要求
| # | 层级 | 测试 | 验证 |
|---|------|------|------|
| 1 | L1 | business_model-expert-tools.test.ts | 每个 ToolDefinition 结构完整 |
| 2 | L1 | business_model-expert-tools.test.ts | handler 基本调用返回非空 |
| 3 | L1 | knowledge-expert-tools.test.ts | 每个 ToolDefinition 结构完整 |
| 4 | L1 | knowledge-expert-tools.test.ts | handler 基本调用返回非空 |

## 接线验证
| 新文件 | 调用方 | 验证 |
|--------|--------|------|
| business_model-expert-tools.ts | expert-router route() 按 expertType 加载 | grep -rn "business_model" src/ |
| knowledge-expert-tools.ts | expert-router route() | grep -rn "knowledge" src/ |

## 完成标准
| 标准 | 验证 |
|------|------|
| business_model-expert-tools.ts 存在，>=2 ToolDefinition | Test-Path |
| knowledge-expert-tools.ts 存在，>=2 ToolDefinition | Test-Path |
| 4 tests 通过 | vitest run |
| tsc --noEmit 零新增 | CI |
| as any = 0 | pre-commit |
| Gate 16 仍 PASS (100%) | check-gates-v2.py |
